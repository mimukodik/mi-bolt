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
 *   - on 410 raises `cartExpired` and drops the session snapshot and the held intent;
 *   - on 409 `PRICE_CHANGED` refetches, captures both totals and
 *     arms `priceChange`; the submit CTA stays dead until
 *     `confirmPriceChange()` runs (§8.2, "az új összeg néma elfogadása
 *     tilos"); a failed refetch is retried once, and a second failure
 *     is returned as the submit's own failure;
 *   - idempotency keys live in `checkoutKeys`; `uncertain retains,
 *     definite rotates` (design §3.6).
 */

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, computed, inject, signal, type Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Api } from '@mi-bolt/api/api';
import { ApiConfiguration } from '@mi-bolt/api/api-configuration';
import {
  createOrder,
  createPaymentIntent,
  getCheckout,
  getCheckoutOptions,
  getOrder,
  getPaymentIntent,
  updateCheckout,
} from '@mi-bolt/api/functions';
import { withIfMatch } from '@mi-bolt/core-api/demo-session.interceptor';
import { isRecord } from '../../shared/utils/is-record';

import type { BillingDetails } from '@mi-bolt/api/models/billing-details';
import type { CheckoutOptions } from '@mi-bolt/api/models/checkout-options';
import type { CheckoutSession } from '@mi-bolt/api/models/checkout-session';
import type { CheckoutSummary } from '@mi-bolt/api/models/checkout-summary';
import type { Contact } from '@mi-bolt/api/models/contact';
import type { DeliverySelection } from '@mi-bolt/api/models/delivery-selection';
import type { FieldError } from '@mi-bolt/api/models/field-error';
import type { Money } from '@mi-bolt/api/models/money';
import type { OrderReceipt } from '@mi-bolt/api/models/order-receipt';
import type { OrderRequest } from '@mi-bolt/api/models/order-request';
import type { PaymentIntent } from '@mi-bolt/api/models/payment-intent';
import type { PaymentSelection } from '@mi-bolt/api/models/payment-selection';
import type { UpdateCheckoutRequest } from '@mi-bolt/api/models/update-checkout-request';

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

/** Why the facade dropped the card intent it held: `'stale'` when the
 *  draft stopped matching what the intent paid for, `'refused'` when the
 *  server answered that the intent already backs an order. */
export type IntentDropReason = 'stale' | 'refused';

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
 * True when a checkout failure carries enough information to be
 * considered a definite outcome (the server saw the request and
 * answered). 0 is the local sentinel for a transport failure, and
 * any 5xx is treated as uncertain because a proxy or load balancer
 * may have accepted the request without forwarding it — the design's
 * `uncertain retains, definite rotates` rule applies to both.
 */
function isDefiniteOutcome(status: number): boolean {
  if (status === 0) return false;
  if (status >= 500 && status < 600) return false;
  return true;
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
  readonly summary: Signal<CheckoutSummary | null> = computed(
    () => this.sessionWritable()?.summary ?? null,
  );

  /** The server's own answer; the client never recomputes it. */
  readonly complete: Signal<boolean> = computed(() => this.sessionWritable()?.complete ?? false);

  /** Authoritative version, read from the cart facade. This is the
   *  `If-Match` source on every write — `session().version` is never
   *  read for the header (design §2.1). */
  readonly version: Signal<number | null> = computed(() => this.cart.cart()?.version ?? null);

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

  private readonly intentDroppedWritable = signal<IntentDropReason | null>(null);

  /** Why the last held intent was dropped; null until a drop, and again
   *  once a new payment intent is created or the order is placed. */
  readonly intentDropped: Signal<IntentDropReason | null> = this.intentDroppedWritable.asReadonly();

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
    // `provideHttpClient(withInterceptors(...))`.
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
   * a 412, so no `If-Match` is sent. On success the cart's version
   * is adopted from the server's answer.
   */
  async ensureSession(force = false): Promise<CheckoutResult<CheckoutSession>> {
    if (!force) {
      const existing = this.sessionWritable();
      if (existing !== null) {
        return { ok: true, value: existing };
      }
    }
    const result = await this.refreshSession();
    if (result.ok) {
      this.clearFailureOverlay();
    }
    return result;
  }

  /**
   * Reads the session and adopts the server's version without touching
   * the failure overlay. The 412 recovery needs exactly this: the
   * conflict banner and `lastFailedIntent` have to survive the
   * reconciling read, or `retry()` would have nothing left to replay
   * (design §3.7 point 4, "no auto-replay"). It is the checkout
   * counterpart of `cart.facade.ts`'s `fromRefetch` flag.
   */
  private async refreshSession(): Promise<CheckoutResult<CheckoutSession>> {
    try {
      const session = await firstValueFrom(this.api.invoke(getCheckout, {}));
      this.adoptPriceNotice(session);
      this.sessionWritable.set(session);
      this.dropStaleIntent(session);
      this.cart.acceptServerVersion(session.version);
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

  updateContact(contact: Contact): Promise<CheckoutResult<CheckoutSession>> {
    return this.patch('contact', { contact } satisfies UpdateCheckoutRequest);
  }

  updateBilling(billing: BillingDetails): Promise<CheckoutResult<CheckoutSession>> {
    return this.patch('billing', { billing } satisfies UpdateCheckoutRequest);
  }

  updateDelivery(delivery: DeliverySelection): Promise<CheckoutResult<CheckoutSession>> {
    return this.patch('delivery', { delivery } satisfies UpdateCheckoutRequest);
  }

  updatePayment(payment: PaymentSelection): Promise<CheckoutResult<CheckoutSession>> {
    return this.patch('payment', { payment } satisfies UpdateCheckoutRequest);
  }

  /**
   * Single private driver for the four section writes. Each sends
   * only its own section (UpdateCheckoutRequest's "Only the supplied
   * sections are written; absent sections are retained"), so no
   * merge is needed client-side (design §3.4).
   */
  private patch(
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
          this.sessionWritable.set(session);
          this.adoptPriceNotice(session);
          this.dropStaleIntent(session);
          this.cart.acceptServerVersion(session.version);
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
   * sessionStorage, the key is rotated, and the value returned to the
   * caller, who then issues the full-page redirect. Rotating on
   * success is what lets a retry after a declined payment mint a new
   * intent (design §5.3, "Újrapróbálom (new intent, new key)") while
   * a retry after a lost answer keeps the key and so replays the
   * intent the first press already created.
   */
  createPaymentIntent(): Promise<CheckoutResult<PaymentIntent>> {
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
          this.intentDroppedWritable.set(null);
          checkoutKeys.rotateIntentKey();
          return { ok: true, value: intent };
        } catch (err) {
          // Every definite outcome (success or refusal: 412, 410, 422,
          // 409) rotates the key, so the next attempt mints a fresh
          // one; otherwise the server replays the same answer.
          // Uncertain outcomes (status 0, a transport failure; any
          // 5xx, an unknown outcome) retain — the next attempt carries
          // the same fingerprint and replays the original request,
          // which is the design's `uncertain retains, definite
          // rotates` rule.
          const error = mapError(err);
          if (isDefiniteOutcome(error.status)) {
            checkoutKeys.rotateIntentKey();
          }
          if (error.code === 'PRICE_CHANGED')
            return { ok: false, error: await this.recordPriceChange(error) };
          return { ok: false, error };
        }
      },
    };
    return this.serialize(mutation);
  }

  /**
   * Reads a payment intent by id. No `If-Match`, no key. Stores the
   * result on `paymentIntent`. A 404 is returned in the result as a
   * `CheckoutError` and is NOT recorded on `error`, so the return
   * page can render its own recovery.
   *
   * A read is the other place the held intent is set, so it runs the
   * same `dropStaleIntent` check against the session already in hand:
   * the cold return adopts the session before it reads the intent
   * (`payment-return-page.ts`), so a session-side-only guard would
   * never see the stale intent and the review step would reach the
   * CTA on it, which `dropStaleIntent` exists to prevent. The check
   * is skipped before any session is loaded, where there is nothing
   * to compare against.
   */
  async readPaymentIntent(paymentIntentId: string): Promise<CheckoutResult<PaymentIntent>> {
    try {
      const intent = await firstValueFrom(this.api.invoke(getPaymentIntent, { paymentIntentId }));
      this.paymentIntentWritable.set(intent);
      this.intentDroppedWritable.set(null);
      const session = this.sessionWritable();
      if (session !== null) {
        this.dropStaleIntent(session);
      }
      return { ok: true, value: intent };
    } catch (err) {
      const error = mapError(err);
      if (error.status === 404) {
        // A 404 for the intent this page is holding means the
        // payment is gone (cancelled, expired, deleted); the step's
        // missing-intent branch ("A fizetési szándék nem
        // található.") is what the shopper sees next, and the stored
        // id stays put so a reload reads the same gap. A 404 for any
        // other id is a probe that changes nothing.
        if (this.paymentIntentWritable()?.id === paymentIntentId) {
          this.paymentIntentWritable.set(null);
        }
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
  submitOrder(body: OrderRequest): Promise<CheckoutResult<OrderReceipt>> {
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
          this.orderWritable.set(receipt);
          this.resetAfterOrder();
          return { ok: true, value: receipt };
        } catch (err) {
          const error = mapError(err);
          if (error.code === 'PRICE_CHANGED') {
            return { ok: false, error: await this.recordPriceChange(error) };
          }
          // The refused intent is one the facade can no longer use, so
          // it and its stored id go and the next submit asks for a new
          // payment. The order submission builds its outcome from what
          // the facade holds after this call, so no redirect leads back
          // to the refused intent's payment page.
          if (
            error.code === 'PAYMENT_REQUIRED' &&
            this.paymentIntentWritable()?.status === 'succeeded'
          ) {
            this.clearHeldIntent('refused');
          }
          if (isDefiniteOutcome(error.status)) {
            checkoutKeys.rotateOrderKey();
          }
          return { ok: false, error };
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
  async confirmPriceChange(): Promise<void> {
    const version = this.session()?.version;
    if (version === undefined || this.priceChange() === null) return;
    const result = await this.patch('contact', { acceptedPriceVersion: version });
    if (result.ok && result.value.priceChanged !== true) this.priceChangeWritable.set(null);
  }

  private adoptPriceNotice(session: CheckoutSession): void {
    if (session.priceChanged !== true) return;
    this.priceChangeWritable.set({
      shownTotal: this.summary()?.total ?? session.summary.total,
      currentTotal: session.summary.total,
      awaitingConfirmation: true,
    });
  }

  /**
   * Drops the held intent and its stored id together: a held intent
   * with no stored id, or a stored id with no intent, is a state the
   * review and return legs cannot tell apart from "no payment was
   * started". The reason is kept on `intentDropped` so the review
   * step can say why a new payment is needed.
   */
  private clearHeldIntent(reason: IntentDropReason): void {
    this.paymentIntentWritable.set(null);
    checkoutKeys.clearActiveIntentId();
    this.intentDroppedWritable.set(reason);
  }

  /**
   * The held intent backs a card draft for exactly its amount. A session
   * whose payment method is no longer card, or whose total differs from
   * the amount the intent paid, drops it and its stored id, so the review
   * step asks for a new payment instead of placing the order on a stale
   * one or dead-ending on a 409 (owner: a card order is never closed
   * without paying for it). A re-save that changes neither keeps it.
   * Runs wherever the intent or the session is adopted — a section
   * write, a session refetch, or a read of the intent — so the order the
   * two arrive in cannot leave a stale intent in the signal.
   */
  private dropStaleIntent(session: CheckoutSession): void {
    const intent = this.paymentIntentWritable();
    if (intent === null) return;
    if (
      session.payment?.method === 'card' &&
      (intent.basketRevision !== undefined && session.basketRevision !== undefined
        ? intent.basketRevision === session.basketRevision
        : intent.amount.amount === session.summary.total.amount)
    ) {
      return;
    }
    this.clearHeldIntent('stale');
  }

  /**
   * Ends the checkout session a placed order closed: the draft, the
   * payment intent that paid for it and every stored key go; the
   * receipt stays for the success page to render. The cart's own
   * post-order reset is the success page's call, not this one.
   */
  resetAfterOrder(): void {
    checkoutKeys.clearAll();
    this.sessionWritable.set(null);
    this.paymentIntentWritable.set(null);
    this.intentDroppedWritable.set(null);
    this.clearFailureOverlay();
    this.priceChangeWritable.set(null);
  }

  /**
   * Starts a fresh purchase from the success page: everything
   * `resetAfterOrder` clears, the receipt with it, so the wizard
   * guards no longer send the shopper back to the old success URL.
   */
  startNewPurchase(): void {
    this.resetAfterOrder();
    this.orderWritable.set(null);
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
      if (
        (mutation.kind === 'order' || mutation.kind === 'paymentIntent') &&
        this.priceChange() !== null
      ) {
        return {
          ok: false,
          error: {
            code: 'PRICE_CHANGED',
            status: 409,
            detail: 'Explicit acceptance of the changed prices is required.',
            fieldErrors: [],
          },
        } satisfies CheckoutResult<T>;
      }
      const expectedVersion = this.version();
      if (expectedVersion === null) {
        const result = notLoadedResult<T>();
        this.recordFailure(mutation, result);
        return result;
      }
      const result = await mutation.run(expectedVersion);
      if (!result.ok && result.error.code === 'PRICE_CHANGED') {
        // The PRICE_CHANGED recovery already ran inside `mutation.run`;
        // recordFailure must not touch the priceChange signal or reset
        // lastFailedIntent on top of it (design §3.7).
      } else {
        this.recordFailure(mutation, result);
      }
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
    if (error.status === 404) {
      // The caller renders its own recovery for a missing intent or
      // order (design §3.5); a 404 never becomes a banner.
      return;
    }
    if (error.code === 'CART_VERSION_CONFLICT') {
      // A back-to-back conflict must keep the FIRST failed intent so
      // retry() replays the user's original operation, not the second
      // one. Only the first recordFailure for a fresh conflict surface
      // gets to overwrite `lastFailedIntent` and the conflict signal's
      // visible `intent`.
      const existingConflict = this.conflictWritable();
      const firstConflictSurface = existingConflict === null;
      if (firstConflictSurface && 'run' in mutation) {
        this.lastFailedIntent = mutation;
      }
      const conflict: CheckoutConflict = {
        code: 'CART_VERSION_CONFLICT',
        status: 412,
        intent: existingConflict?.intent ?? mutation.kind,
        serverVersion: this.version() ?? 0,
      };
      this.conflictWritable.set(conflict);
      this.errorWritable.set(null);
      this.cartExpiredWritable.set(false);
      // Fire-and-forget so the failed intent resolves immediately and
      // the serialiser can move on. We do NOT await either call here.
      // `refreshSession`, not `ensureSession`: the reconciling read
      // must not clear the conflict banner or `lastFailedIntent` that
      // the two lines above have just armed.
      void Promise.all([this.cart.refetch(), this.refreshSession()]);
      return;
    }
    if (error.code === 'CART_EXPIRED') {
      this.sessionWritable.set(null);
      // The intent paid for the draft this 410 ended, so it goes too.
      if (this.paymentIntentWritable() !== null) {
        this.clearHeldIntent('stale');
      }
      this.cartExpiredWritable.set(true);
      this.conflictWritable.set(null);
      this.errorWritable.set(null);
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

  /**
   * The §8.2 sequence for a 409 PRICE_CHANGED on POST /orders: the
   * shopper must see the old and the new total and confirm before a
   * resubmit, so the caller's promise resolves only once `priceChange`
   * is armed (design §3.7). Neither read throws: `cart.refetch()` keeps
   * its failure to itself and `ensureSession` returns it, so a failed
   * session read is retried once (the owner's decision). When the retry
   * fails too the new total is unknown, and the read's failure is
   * returned in place of the 409, so the submit surfaces as a failure
   * instead of a live CTA over the old total.
   */
  private async recordPriceChange(error: CheckoutError): Promise<CheckoutError> {
    const shownTotal = this.summary()?.total;
    checkoutKeys.rotateOrderKey();
    await this.cart.refetch();
    let read = await this.ensureSession(true);
    if (!read.ok) {
      await this.cart.refetch();
      read = await this.ensureSession(true);
    }
    if (!read.ok) {
      return read.error;
    }
    const currentTotal = read.value.summary.total;
    this.priceChangeWritable.set({
      shownTotal: shownTotal ?? currentTotal,
      currentTotal,
      awaitingConfirmation: true,
    });
    this.errorWritable.set(error);
    this.conflictWritable.set(null);
    this.cartExpiredWritable.set(false);
    return error;
  }

  private clearFailureOverlay(): void {
    this.errorWritable.set(null);
    this.conflictWritable.set(null);
    this.cartExpiredWritable.set(false);
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
