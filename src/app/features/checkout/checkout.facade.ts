/**
 * T19+ — checkout application facade on the 2.0.0 contract.
 *
 * Mirrors `CartFacade` (`features/cart/cart.facade.ts`): one
 * root-provided service owns the checkout session, the four section
 * writes, the payment intent lifecycle, and the order submit. The
 * shared cart/checkout version counter is owned by `CartFacade`
 * (design §2.1, approach C): this facade reads `cart.cart().version`
 * for `If-Match` and writes the server's answer back through
 * `cart.acceptServerVersion` after every successful call.
 *
 *   - writes serialise through one private chain that binds `If-Match`
 *     to the cart version at dispatch time (cart-mutation-queue.ts's
 *     rule, ported here so two checkout writes cannot race);
 *   - on 412 surfaces a `conflict` signal, refetches both the cart
 *     and the session in the background, and waits for an explicit
 *     `retry()`; the failed intent is NOT auto-replayed;
 *   - on 410 raises `cartExpired` and drops the session snapshot;
 *   - on 409 `PRICE_CHANGED` refetches, captures both totals and
 *     arms `priceChange`; the submit CTA stays dead until
 *     `confirmPriceChange()` runs (§8.2, "az új összeg néma elfogadása
 *     tilos");
 *   - idempotency keys live in `checkoutKeys`; `uncertain retains,
 *     definite rotates` (design §3.6).
 */

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, computed, inject, signal, type Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../api/generated/api';
import { ApiConfiguration } from '../../api/generated/api-configuration';
import {
  createOrder,
  createPaymentIntent,
  getCheckout,
  getCheckoutOptions,
  getOrder,
  getPaymentIntent,
  updateCheckout,
} from '../../api/generated/functions';
import { withIfMatch } from '../../core/api/demo-session.interceptor';
import { isRecord } from '../../shared/utils/is-record';

import type { BillingDetails } from '../../api/generated/models/billing-details';
import type { CheckoutOptions } from '../../api/generated/models/checkout-options';
import type { CheckoutSession } from '../../api/generated/models/checkout-session';
import type { CheckoutSummary } from '../../api/generated/models/checkout-summary';
import type { Contact } from '../../api/generated/models/contact';
import type { DeliverySelection } from '../../api/generated/models/delivery-selection';
import type { FieldError } from '../../api/generated/models/field-error';
import type { Money } from '../../api/generated/models/money';
import type { OrderReceipt } from '../../api/generated/models/order-receipt';
import type { OrderRequest } from '../../api/generated/models/order-request';
import type { PaymentIntent } from '../../api/generated/models/payment-intent';
import type { PaymentSelection } from '../../api/generated/models/payment-selection';
import type { UpdateCheckoutRequest } from '../../api/generated/models/update-checkout-request';

import { CartFacade } from '../cart/cart.facade';
import { checkoutKeys } from './checkout-keys';

/** Every failure the UI can act on, one shape. Mirrors CartError plus
 *  the field-error list a 422 carries. */
export interface CheckoutError {
  /** Server ProblemCode, or the local 'UNKNOWN' / 'NO_CART' sentinels.
   *  Typed `string` because neither sentinel is in the generated union. */
  readonly code: string;
  readonly status: number;
  /** English developer diagnostic (openapi.yaml:1490-1493). NEVER rendered. */
  readonly detail: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly fieldErrors: readonly FieldError[];
}

/** 412 on any checkout write; the cart's counter moved under us. */
export interface CheckoutConflict {
  readonly code: 'CART_VERSION_CONFLICT';
  readonly status: 412;
  /** Which mutation conflicted — the one retry() will resubmit. */
  readonly intent: CheckoutIntentKind;
  readonly serverVersion: number;
}

/** 409 PRICE_CHANGED: the shopper must confirm the new total (§8.2). */
export interface PriceChange {
  /** The total the shopper last saw, captured before the refetch. */
  readonly shownTotal: Money;
  /** The total the server recomputed after the refetch. */
  readonly currentTotal: Money;
  /** True until confirmPriceChange() is called. Gates the submit CTA. */
  readonly awaitingConfirmation: true;
}

export type CheckoutIntentKind =
  'contact' | 'billing' | 'delivery' | 'payment' | 'paymentIntent' | 'order';

export type CheckoutResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: CheckoutError };

/**
 * Internal dispatch shape. Carries the intent kind so 412 routing
 * can record which mutation conflicted and `retry()` can replay it.
 * Generic in `T` so `serialize<T>` can return `CheckoutResult<T>`
 * without a cast (`as` is forbidden under the workspace lint rule).
 */
interface CheckoutMutation<T = unknown> {
  readonly kind: CheckoutIntentKind;
  /** The unit of work; receives the bound version inside the chain. */
  readonly run: (expectedVersion: number) => Promise<CheckoutResult<T>>;
}

function notLoadedResult<T>(): CheckoutResult<T> {
  return {
    ok: false,
    error: {
      code: 'NO_CART',
      status: 0,
      detail: 'The cart has not been loaded yet; ensureCart() did not succeed.',
      fieldErrors: [],
    },
  };
}

/** Type guard for the `card` arm of `OrderRequest` — narrows so the
 *  `paymentIntentId` field is reachable without a cast. */
function hasPaymentIntentId(
  body: OrderRequest,
): body is OrderRequest & { paymentMethod: 'card'; paymentIntentId: string } {
  return body.paymentMethod === 'card';
}

/**
 * Root-provided checkout owner. `TestBed.inject(CheckoutFacade)` returns
 * the same instance across the four pages of the wizard and across the
 * payment-return cold start, so the in-memory snapshot survives the
 * navigation between them.
 */
@Service()
export class CheckoutFacade {
  private readonly api: Api;
  private readonly cart = inject(CartFacade);

  /** Internal writable snapshot of the authoritative checkout session. */
  private readonly sessionWritable = signal<CheckoutSession | null>(null);

  /** Public readonly session signal. Null before `ensureSession()`. */
  readonly session: Signal<CheckoutSession | null> = this.sessionWritable.asReadonly();

  /** Internal writable options snapshot. Null before `ensureOptions()`. */
  private readonly optionsWritable = signal<CheckoutOptions | null>(null);

  /** Public readonly options signal. Null before `ensureOptions()`. */
  readonly options: Signal<CheckoutOptions | null> = this.optionsWritable.asReadonly();

  /** The server's recomputed summary. Null when no session is loaded. */
  readonly summary: Signal<CheckoutSummary | null> = computed(() => {
    return this.sessionWritable()?.summary ?? null;
  });

  /** The server's own answer; the client never recomputes it. */
  readonly complete: Signal<boolean> = computed(() => {
    return this.sessionWritable()?.complete ?? false;
  });

  /** Authoritative version, read from the cart facade. This is the
   *  `If-Match` source on every write — `session().version` is never
   *  read for the header (design §2.1). */
  readonly version: Signal<number | null> = computed(() => {
    return this.cart.cart()?.version ?? null;
  });

  /** Number of intents currently queued or dispatching. */
  private readonly pendingWritable = signal(0);
  readonly pending: Signal<number> = this.pendingWritable.asReadonly();

  private readonly errorWritable = signal<CheckoutError | null>(null);
  /** Last non-recoverable error, or null. Cleared on the next success. */
  readonly error: Signal<CheckoutError | null> = this.errorWritable.asReadonly();

  private readonly conflictWritable = signal<CheckoutConflict | null>(null);
  /** Last 412 conflict, or null. Cleared on the next success. */
  readonly conflict: Signal<CheckoutConflict | null> = this.conflictWritable.asReadonly();

  private readonly cartExpiredWritable = signal<boolean>(false);
  /** True after the server returned 410 for the active session. */
  readonly cartExpired: Signal<boolean> = this.cartExpiredWritable.asReadonly();

  private readonly priceChangeWritable = signal<PriceChange | null>(null);
  /** Last 409 PRICE_CHANGED; null until cleared by `confirmPriceChange()`. */
  readonly priceChange: Signal<PriceChange | null> = this.priceChangeWritable.asReadonly();

  /** Internal writable snapshot of the active payment intent. */
  private readonly paymentIntentWritable = signal<PaymentIntent | null>(null);

  /** Public readonly payment intent signal. Null until created or read. */
  readonly paymentIntent: Signal<PaymentIntent | null> = this.paymentIntentWritable.asReadonly();

  /** Internal writable snapshot of the active order receipt. */
  private readonly orderWritable = signal<OrderReceipt | null>(null);

  /** Public readonly order signal. Drives the guards. */
  readonly order: Signal<OrderReceipt | null> = this.orderWritable.asReadonly();

  /**
   * Holds the first conflicting intent so `retry()` can resubmit it
   * with the CURRENT version. A back-to-back conflict keeps the first
   * (`cart.facade.ts:444-451`'s rule). Cleared on the next success.
   */
  private lastFailedIntent: CheckoutMutation | null = null;

  /** Promise chain that serialises every dispatch. */
  private tail: Promise<void> = Promise.resolve();

  constructor() {
    // The generated `Api` class relies on Angular decorator metadata
    // for constructor injection. Vitest's esbuild pipeline does not
    // emit that metadata, so we wire it manually from the two
    // primitives that ARE injectable: `HttpClient` and
    // `ApiConfiguration`. The same `new Api(...)` call sees the live
    // `HttpClient` in a real browser, supplied by
    // `provideHttpClient(withFetch(), withInterceptors(...))`.
    this.api = new Api(inject(ApiConfiguration), inject(HttpClient));
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /**
   * Loads `/checkout/options`. Idempotent: a loaded snapshot plus
   * `force === false` is a no-op. The contract declares no ETag on
   * the endpoint (`openapi.yaml:481-487`), so no `If-Match` is sent.
   */
  async ensureOptions(force = false): Promise<CheckoutResult<CheckoutOptions>> {
    if (!force) {
      const existing = this.optionsWritable();
      if (existing !== null) {
        return { ok: true, value: existing };
      }
    }
    try {
      const options = await firstValueFrom(this.api.invoke(getCheckoutOptions, {}));
      this.optionsWritable.set(options);
      return { ok: true, value: options };
    } catch (err) {
      const result: CheckoutResult<CheckoutOptions> = { ok: false, error: mapError(err) };
      this.recordFailure({ kind: 'contact' }, result);
      return result;
    }
  }

  /**
   * Loads `/checkout`. A stale version must not turn a reload into
   * a 412, so no `If-Match` is sent (the 1.0.0 `fetchOrder` already
   * reasons this way at `checkout.facade.ts:589-592`). On success
   * the cart's version is adopted from the server's answer.
   */
  async ensureSession(force = false): Promise<CheckoutResult<CheckoutSession>> {
    if (!force) {
      const existing = this.sessionWritable();
      if (existing !== null) {
        return { ok: true, value: existing };
      }
    }
    try {
      const session = await firstValueFrom(this.api.invoke(getCheckout, {}));
      this.sessionWritable.set(session);
      this.cart.acceptServerVersion(session.version);
      this.clearFailureOverlay();
      return { ok: true, value: session };
    } catch (err) {
      const result: CheckoutResult<CheckoutSession> = { ok: false, error: mapError(err) };
      this.recordFailure({ kind: 'contact' }, result);
      return result;
    }
  }

  // -------------------------------------------------------------------------
  // Section writes — all four go through `patch()`
  // -------------------------------------------------------------------------

  async updateContact(contact: Contact): Promise<CheckoutResult<CheckoutSession>> {
    return this.patch('contact', { contact } satisfies UpdateCheckoutRequest);
  }

  async updateBilling(billing: BillingDetails): Promise<CheckoutResult<CheckoutSession>> {
    return this.patch('billing', { billing } satisfies UpdateCheckoutRequest);
  }

  async updateDelivery(delivery: DeliverySelection): Promise<CheckoutResult<CheckoutSession>> {
    return this.patch('delivery', { delivery } satisfies UpdateCheckoutRequest);
  }

  async updatePayment(payment: PaymentSelection): Promise<CheckoutResult<CheckoutSession>> {
    return this.patch('payment', { payment } satisfies UpdateCheckoutRequest);
  }

  /**
   * Single private driver for the four section writes. Each sends
   * only its own section (UpdateCheckoutRequest's "Only the supplied
   * sections are written; absent sections are retained"), so no
   * merge is needed client-side (design §3.4).
   */
  private async patch(
    kind: 'contact' | 'billing' | 'delivery' | 'payment',
    body: UpdateCheckoutRequest,
  ): Promise<CheckoutResult<CheckoutSession>> {
    const mutation: CheckoutMutation<CheckoutSession> = {
      kind,
      run: async (expectedVersion) => {
        try {
          const session = await firstValueFrom(
            this.api.invoke(updateCheckout, { body }, withIfMatch(expectedVersion)),
          );
          return { ok: true, value: session };
        } catch (err) {
          return { ok: false, error: mapError(err) };
        }
      },
    };
    return this.serialize(mutation);
  }

  // -------------------------------------------------------------------------
  // Payment intent
  // -------------------------------------------------------------------------

  /**
   * Creates a payment intent. Carries the Idempotency-Key derived
   * from the cart version (design §3.6 fingerprint) and no body.
   * On 201 the intent is stored, the id is persisted to
   * sessionStorage, and the value returned to the caller, who then
   * issues the full-page redirect.
   */
  async createPaymentIntent(): Promise<CheckoutResult<PaymentIntent>> {
    const mutation: CheckoutMutation<PaymentIntent> = {
      kind: 'paymentIntent',
      run: async (expectedVersion) => {
        const key = checkoutKeys.intentKey(expectedVersion);
        try {
          const intent = await firstValueFrom(
            this.api.invoke(
              createPaymentIntent,
              { 'Idempotency-Key': key },
              withIfMatch(expectedVersion),
            ),
          );
          checkoutKeys.setActiveIntentId(intent.id);
          this.paymentIntentWritable.set(intent);
          return { ok: true, value: intent };
        } catch (err) {
          // Definite outcomes (412, 410, 422, 409) must rotate the key
          // so the next attempt mints a fresh one; otherwise the
          // server replays the same answer. Uncertain outcomes
          // (status 0, a transport failure) retain — the next attempt
          // carries the same fingerprint and replays the original
          // request, which is the design's `uncertain retains, definite
          // rotates` rule.
          const error = mapError(err);
          if (error.status !== 0) {
            checkoutKeys.rotateIntentKey();
          }
          return { ok: false, error };
        }
      },
    };
    return this.serialize(mutation);
  }

  /**
   * Reads a payment intent by id. No `If-Match`, no key. Stores the
   * result on `paymentIntent`. A 404 is returned in the result and
   * `CheckoutError` and is NOT recorded on `error`, the way the 1.0.0
   * `fetchOrder` treats a 404 (`checkout.facade.ts:599-609`), so the
   * return page can render its own recovery.
   */
  async readPaymentIntent(paymentIntentId: string): Promise<CheckoutResult<PaymentIntent>> {
    try {
      const intent = await firstValueFrom(this.api.invoke(getPaymentIntent, { paymentIntentId }));
      this.paymentIntentWritable.set(intent);
      return { ok: true, value: intent };
    } catch (err) {
      const error = mapError(err);
      if (error.status === 404) {
        return { ok: false, error };
      }
      this.errorWritable.set(error);
      return { ok: false, error };
    }
  }

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------

  /**
   * Submits the order. The caller (the review step's
   * `OrderSubmission`) builds the discriminated `OrderRequest`;
   * the facade adds the Idempotency-Key and the precondition and
   * owns the result mapping. A 201 stores the receipt, clears the
   * idempotency key, drops the session and returns the value.
   */
  async submitOrder(body: OrderRequest): Promise<CheckoutResult<OrderReceipt>> {
    const mutation: CheckoutMutation<OrderReceipt> = {
      kind: 'order',
      run: async (expectedVersion) => {
        const termsVersion = this.optionsWritable()?.termsVersion;
        if (termsVersion === undefined) {
          return {
            ok: false,
            error: {
              code: 'NO_OPTIONS',
              status: 0,
              detail: 'Checkout options have not been loaded yet.',
              fieldErrors: [],
            },
          };
        }
        const fingerprintArgs = {
          version: expectedVersion,
          paymentMethod: body.paymentMethod,
          paymentIntentId: hasPaymentIntentId(body) ? body.paymentIntentId : null,
          termsVersion,
          acceptedTerms: body.acceptedTerms,
        };
        const key = checkoutKeys.orderKey(fingerprintArgs);
        try {
          const receipt = await firstValueFrom(
            this.api.invoke(
              createOrder,
              { 'Idempotency-Key': key, body },
              withIfMatch(expectedVersion),
            ),
          );
          checkoutKeys.clearAll();
          this.orderWritable.set(receipt);
          this.sessionWritable.set(null);
          this.paymentIntentWritable.set(null);
          this.clearFailureOverlay();
          return { ok: true, value: receipt };
        } catch (err) {
          return { ok: false, error: mapError(err) };
        }
      },
    };
    return this.serialize(mutation);
  }

  /**
   * Reads an order by id. No `If-Match`, no key. A 404 returns the
   * failure and does NOT clear `order()`; the success page decides
   * whether to render its own recovery.
   */
  async fetchOrder(orderId: string): Promise<CheckoutResult<OrderReceipt>> {
    try {
      const receipt = await firstValueFrom(this.api.invoke(getOrder, { orderId }));
      this.orderWritable.set(receipt);
      return { ok: true, value: receipt };
    } catch (err) {
      const error = mapError(err);
      if (error.status === 404) {
        return { ok: false, error };
      }
      this.errorWritable.set(error);
      return { ok: false, error };
    }
  }

  // -------------------------------------------------------------------------
  // Recovery
  // -------------------------------------------------------------------------

  /**
   * Re-submits the most recent failed intent with the CURRENT
   * expected version. No-op when no conflict is recorded. Never
   * called by the facade itself; the 412 banner's button calls it.
   */
  async retry(): Promise<void> {
    const failed = this.lastFailedIntent;
    if (failed === null) {
      return;
    }
    this.lastFailedIntent = null;
    await this.serialize(failed);
  }

  /**
   * Clears `priceChange`. The only way to clear it; the submit CTA
   * stays dead until this runs (§8.2, the shopper's explicit
   * confirmation).
   */
  confirmPriceChange(): void {
    this.priceChangeWritable.set(null);
  }

  // -------------------------------------------------------------------------
  // Private serialiser. Mirrors the cart's semantics without its types:
  // every checkout mutation chains onto `tail`, binds `If-Match` to
  // `version()` INSIDE the chained callback so it sees the latest
  // server answer, and decrements `pending` on both settlement branches.
  // -------------------------------------------------------------------------

  private serialize<T>(mutation: CheckoutMutation<T>): Promise<CheckoutResult<T>> {
    this.pendingWritable.update((n) => n + 1);
    const next = this.tail.then(async () => {
      const expectedVersion = this.version();
      if (expectedVersion === null) {
        const result = notLoadedResult<T>();
        this.recordFailure(mutation, result);
        return result;
      }
      const result = await mutation.run(expectedVersion);
      this.recordFailure(mutation, result);
      return result;
    });
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next.finally(() => {
      this.pendingWritable.update((n) => n - 1);
    });
  }

  // -------------------------------------------------------------------------
  // Failure routing — one function so a 412 always lands in the conflict
  // signal, a 410 always in cartExpired, and other Problems in `error`.
  // -------------------------------------------------------------------------

  private recordFailure(
    mutation: CheckoutMutation | { readonly kind: CheckoutIntentKind },
    result: CheckoutResult<unknown>,
  ): void {
    if (result.ok) {
      this.conflictWritable.set(null);
      this.cartExpiredWritable.set(false);
      this.errorWritable.set(null);
      this.lastFailedIntent = null;
      return;
    }
    const { error } = result;
    if (error.code === 'CART_VERSION_CONFLICT') {
      // A back-to-back conflict must keep the FIRST failed intent so
      // retry() replays the user's original operation, not the second
      // one. Only the first recordFailure for a fresh conflict surface
      // gets to overwrite `lastFailedIntent`.
      if (this.conflictWritable() === null && 'run' in mutation) {
        this.lastFailedIntent = mutation;
      }
      const conflict: CheckoutConflict = {
        code: 'CART_VERSION_CONFLICT',
        status: 412,
        intent: mutation.kind,
        serverVersion: this.version() ?? 0,
      };
      this.conflictWritable.set(conflict);
      this.errorWritable.set(null);
      this.cartExpiredWritable.set(false);
      // Fire-and-forget so the failed intent resolves immediately and
      // the serialiser can move on. We do NOT await either call here.
      void this.cart.refetch();
      void this.ensureSession(true);
      return;
    }
    if (error.code === 'CART_EXPIRED') {
      this.sessionWritable.set(null);
      this.cartExpiredWritable.set(true);
      this.conflictWritable.set(null);
      this.errorWritable.set(null);
      return;
    }
    if (error.code === 'PRICE_CHANGED' && mutation.kind === 'order') {
      // §8.2 sequence: capture the shown total, rotate the order key,
      // refetch cart and session, arm priceChange, return the failure.
      // The refetches are fire-and-forget, like the 412 branch: the
      // failed call resolves immediately and the serialiser moves on.
      const shownTotal = this.summary()?.total;
      checkoutKeys.rotateOrderKey();
      void Promise.all([this.cart.refetch(), this.ensureSession(true)]).then(() => {
        const currentTotal = this.summary()?.total;
        if (shownTotal !== undefined && currentTotal !== undefined) {
          this.priceChangeWritable.set({
            shownTotal,
            currentTotal,
            awaitingConfirmation: true,
          });
        }
      });
      this.errorWritable.set(error);
      this.conflictWritable.set(null);
      this.cartExpiredWritable.set(false);
      return;
    }
    // Generic failure branch: clear the stale conflict overlay so the
    // UI does not accumulate error states. Preserve `lastFailedIntent`
    // when a conflict is currently surfaced so the retry affordance
    // survives a transient error.
    this.errorWritable.set(error);
    if (this.conflictWritable() === null) {
      this.lastFailedIntent = null;
    }
    this.conflictWritable.set(null);
    this.cartExpiredWritable.set(false);
  }

  private clearFailureOverlay(): void {
    this.errorWritable.set(null);
    this.conflictWritable.set(null);
    this.cartExpiredWritable.set(false);
    this.priceChangeWritable.set(null);
    this.lastFailedIntent = null;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — kept module-local so tests can exercise the mapping
// without instantiating the facade.
// ---------------------------------------------------------------------------

function mapError(err: unknown): CheckoutError {
  if (err instanceof HttpErrorResponse) {
    const body: unknown = err.error;
    let code = 'UNKNOWN';
    let detail = err.message;
    let params: Readonly<Record<string, unknown>> | undefined;
    let fieldErrors: readonly FieldError[] = [];
    if (isRecord(body)) {
      if (typeof body['code'] === 'string') {
        code = body['code'];
      }
      if (typeof body['detail'] === 'string') {
        detail = body['detail'];
      }
      if (isRecord(body['params'])) {
        params = body['params'];
      }
      if (Array.isArray(body['fieldErrors'])) {
        fieldErrors = body['fieldErrors'].filter(isFieldError);
      }
    }
    if (err.status === 412 && code === 'CART_VERSION_CONFLICT') {
      return { code: 'CART_VERSION_CONFLICT', status: 412, detail, params, fieldErrors };
    }
    if (err.status === 410 && code === 'CART_EXPIRED') {
      return { code: 'CART_EXPIRED', status: 410, detail, params, fieldErrors };
    }
    if (err.status === 404) {
      return { code: 'NOT_FOUND', status: 404, detail, params, fieldErrors };
    }
    return { code, status: err.status, detail, params, fieldErrors };
  }
  return { code: 'SERVICE_UNAVAILABLE', status: 0, detail: String(err), fieldErrors: [] };
}

/** Narrows an `unknown` body entry into the generated `FieldError`
 *  shape. `isRecord` alone is too lax — a record missing `code` or
 *  `path` would otherwise pass and surface as `undefined` on the UI. */
function isFieldError(value: unknown): value is FieldError {
  if (!isRecord(value)) return false;
  return typeof value['code'] === 'string' && typeof value['path'] === 'string';
}
