/**
 * T19 — checkout wizard state-machine facade.
 *
 * Owns the entire parent-side state for the purchase flow:
 *
 *   - the Signal Forms `FieldTree` that backs contact, delivery and
 *     payment-method inputs (no FormGroup, no BehaviorSubject);
 *   - the server-side draft (`updateDraft` over `PUT /checkout/{id}`)
 *     that the wire contract expects to survive a soft refresh;
 *   - the quote (`POST /checkout/{id}/quote`) that the review step
 *     needs to render a fresh total;
 *   - the payment intent (`POST /payment-intents`) — created only
 *     when the user clicks the explicit "Fizetés indítása" button;
 *   - the order receipt (`POST /orders`) — committed only on the
 *     final explicit submit.
 *
 * Recovery semantics (T19-AC02 / AC03):
 *
 *   - `resetDraft()` wipes contact + address in memory; the cart
 *     survives because the mock persists its own snapshot across reloads (docs/spec/architecture.md:107)
 *     and `ensureCart()` always succeeds for an existing cart.
 *     This is the privacy contract the spec calls for.
 *   - Route guards never mutate this facade — they only read it.
 *   - A failed save / quote / submit keeps the form, draft, cart and
 *     payment method intact so the user can retry without re-entering
 *     data. The `error` signal carries the surface message.
 *   - Editing the contact / delivery / payment section in the form
 *     bumps `draftDirty` so the active quote is reported as
 *     invalidated on the next render (T19-AC04). The quote itself is
 *     wiped from the cache when the user triggers a real
 *     `saveSection()` so the next "Fizetés" button creates a fresh
 *     quote before committing the order.
 *
 * Guards (T19-AC05):
 *
 *   - No `CanMatch` / `CanActivate` calls `commitOrder()` or
 *     `createPaymentIntent()`. The user must click through. Guards
 *     live in `checkout.guards.ts` and only read facade signals.
 */

import {
  DestroyRef,
  Service,
  computed,
  inject,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../api/generated/api';
import { ApiConfiguration as ApiConfig } from '../../api/generated/api-configuration';
import { withIfMatch } from '../../core/api/demo-session.interceptor';

import type { Address } from '../../api/generated/models/address';
import type { CheckoutSession } from '../../api/generated/models/checkout-session';
import type { Contact } from '../../api/generated/models/contact';
import type { DeliverySelection } from '../../api/generated/models/delivery-selection';
import type { PaymentIntent } from '../../api/generated/models/payment-intent';
import type { Quote } from '../../api/generated/models/quote';
import type { OrderReceipt } from '../../api/generated/models/order-receipt';

import * as functions from '../../api/generated/functions';

import { CartFacade } from '../cart/cart.facade';
import { freshIdempotencyKey } from '../../shared/utils/idempotency-key';

import {
  PHONE_PATTERN,
  POSTAL_CODE_PATTERN,
  buildCheckoutForm,
  createInitialCheckoutFormModel,
  hydrateCheckoutFormModel,
  type CheckoutFormAddress,
  type CheckoutFormModel,
  type DeliveryOptionId,
  type PaymentMethod,
} from './checkout-form.model';

/**
A single guarded step in the wizard.
*/
export type CheckoutStep =
  'cart' | 'contact' | 'delivery' | 'review' | 'submitting' | 'success' | 'error';

/**
Errors surfaced to the UI as a banner string.
*/
export interface CheckoutError {
  readonly code: string;
  readonly status: number;
  readonly detail: string;
  readonly fieldErrors: readonly { path: string; message: string }[];
}

/**
Result returned by every save / quote / submit helper.
*/
export type CheckoutMutationResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: CheckoutError };

/**
 * Strips optional keys that the mock would otherwise echo back as
 * `null`, so the wire payload mirrors `UpdateCheckoutRequest`'s
 * `merge supplied sections only` contract (T08).
 */
function toContactPayload(form: CheckoutFormModel): Contact {
  return {
    fullName: form.fullName.trim().normalize('NFC'),
    email: form.email.trim().toLowerCase().normalize('NFC'),
    phone: form.phone.replaceAll(/\s+/g, ''),
  };
}

function toAddressPayload(address: CheckoutFormAddress): Address {
  const line2Trimmed = address.line2.trim();
  return {
    countryCode: 'HU',
    postalCode: address.postalCode,
    city: address.city.trim().normalize('NFC'),
    line1: address.line1.trim().normalize('NFC'),
    ...(line2Trimmed.length > 0 && { line2: line2Trimmed.normalize('NFC') }),
  };
}

function toDeliveryPayload(form: CheckoutFormModel): DeliverySelection {
  if (form.deliveryOptionId === 'demo_pickup') {
    return { optionId: 'demo_pickup' };
  }
  return {
    optionId: 'home_delivery',
    address: toAddressPayload(form.address),
  };
}

function normalizeDeliveryOptionId(value: unknown): DeliveryOptionId {
  return value === 'home_delivery' || value === 'demo_pickup' ? value : '';
}

function normalizePaymentMethod(value: unknown): PaymentMethod {
  return value === 'demo_card' || value === 'demo_cod' ? value : '';
}

/**
 * Maps an SDK / network error to the surface shape the UI consumes.
 * The HTTP body is the canonical Problem JSON the mock emits.
 */
function mapError(error: unknown): CheckoutError {
  if (error instanceof HttpErrorResponse) {
    const body = (error.error ?? {}) as {
      code?: string;
      detail?: string;
      fieldErrors?: { path: string; message: string }[];
    };
    const code = body.code ?? 'UNKNOWN';
    const detail = body.detail ?? error.message;
    return {
      code,
      status: error.status,
      detail,
      fieldErrors: body.fieldErrors ?? [],
    };
  }
  return {
    code: 'SERVICE_UNAVAILABLE',
    status: 0,
    detail: String(error),
    fieldErrors: [],
  };
}

/**
 * Root-provided checkout wizard owner. The component tree under
 * `/penztar/...` resolves this facade from the injection context;
 * guards call it synchronously without subscribing to HTTP.
 */
@Service()
export class CheckoutFacade {
  private readonly api: Api;
  private readonly cartFacade = inject(CartFacade);
  private readonly destroyRef = inject(DestroyRef);

  /**
  The single writable signal that owns the form data.
  */
  private readonly modelWritable: WritableSignal<CheckoutFormModel> = signal(
    createInitialCheckoutFormModel(),
  );

  /**
   * Signal Forms FieldTree built once off the model signal. The
   * schema lives in `checkout-form.model.ts` and is re-evaluated on
   * every mutation. Validity is a derived view of `modelWritable`,
   * so the UI never reads a flag we maintain manually.
   */
  readonly form = buildCheckoutForm(this.modelWritable);

  /**
  Writable signal carrying the latest server-side draft.
  */
  private readonly sessionWritable: WritableSignal<CheckoutSession | null> =
    signal<CheckoutSession | null>(null);

  /**
  Readonly view of the server-side draft.
  */
  readonly session: Signal<CheckoutSession | null> = this.sessionWritable.asReadonly();

  /**
  Active quote, or null until the review step calls `createQuote()`.
  */
  private readonly quoteWritable: WritableSignal<Quote | null> = signal<Quote | null>(null);
  readonly quote: Signal<Quote | null> = this.quoteWritable.asReadonly();

  /**
  Payment intent created by the explicit "Fizetés indítása" click.
  */
  private readonly paymentIntentWritable: WritableSignal<PaymentIntent | null> =
    signal<PaymentIntent | null>(null);
  readonly paymentIntent: Signal<PaymentIntent | null> = this.paymentIntentWritable.asReadonly();

  /**
  Order receipt produced by the final commit.
  */
  private readonly orderWritable: WritableSignal<OrderReceipt | null> = signal<OrderReceipt | null>(
    null,
  );
  readonly order: Signal<OrderReceipt | null> = this.orderWritable.asReadonly();

  /**
  True while any network mutation is in flight.
  */
  private readonly busyWritable: WritableSignal<boolean> = signal(false);
  readonly busy: Signal<boolean> = this.busyWritable.asReadonly();

  /**
  Last non-recoverable error message; null when the flow is clean.
  */
  private readonly errorWritable: WritableSignal<CheckoutError | null> =
    signal<CheckoutError | null>(null);
  readonly error: Signal<CheckoutError | null> = this.errorWritable.asReadonly();

  /**
   * `true` once the user edits a field after a fresh load, before a
   * new draft save. The review page surfaces this so the user
   * understands the active quote is invalidated by their edits
   * (T19-AC04). Saving a section flips it back to `false`.
   */
  private readonly draftDirtyWritable: WritableSignal<boolean> = signal(false);
  readonly draftDirty: Signal<boolean> = this.draftDirtyWritable.asReadonly();

  /**
  The cart id this facade is currently bound to.
  */
  private readonly cartIdWritable: WritableSignal<string | null> = signal<string | null>(null);
  readonly cartId: Signal<string | null> = this.cartIdWritable.asReadonly();

  /**
  True once the model has been hydrated from the server.
  */
  private readonly hydratedWritable: WritableSignal<boolean> = signal(false);
  readonly hydrated: Signal<boolean> = this.hydratedWritable.asReadonly();

  /**
  Held idempotency key for the last `saveSection()` fingerprint.
  */
  private savedSectionKey: { fingerprint: string; key: string } | null = null;

  /**
  Held idempotency key for the last `createQuote()` fingerprint.
  */
  private heldQuoteKey: { fingerprint: string; key: string } | null = null;

  /** Held idempotency key for the last `createPaymentIntent()` fingerprint,
   *  kept only while the last attempt's outcome is unknown (openapi.yaml:
   *  "ambiguous network retry retains original key"). */
  private heldPaymentIntentKey: { fingerprint: string; key: string } | null = null;

  constructor() {
    // The generated `Api` class relies on Angular decorator metadata
    // for constructor injection. Vitest's esbuild pipeline does not
    // emit that metadata, so we wire it manually here exactly like
    // `CartFacade` does.
    this.api = new Api(inject(ApiConfig), inject(HttpClient));
  }

  // -------------------------------------------------------------------------
  // Derived views.
  // -------------------------------------------------------------------------

  /**
   * Current wizard step. Pure derived view — guards and templates
   * read this and never call into the network to decide navigation.
   */
  readonly step: Signal<CheckoutStep> = computed<CheckoutStep>(() => {
    if (this.busy() && this.order() === null) return 'submitting';
    if (this.order() !== null) return 'success';
    const session = this.session();
    if (session === null) return 'cart';
    if (session.contact === undefined) return 'contact';
    return session.delivery === undefined || session.paymentMethod === undefined
      ? 'delivery'
      : 'review';
  });

  /**
   * Earliest step the user is missing for the current session. Used
   * by `checkout.guards.ts` when a deep-link / reload bypasses a
   * later step.
   */
  readonly earliestMissingStep: Signal<CheckoutStep> = computed<CheckoutStep>(() => {
    const cart = this.cartFacade.cart();
    if (cart === null || cart.items.length === 0) return 'cart';
    const session = this.session();
    if (session?.contact === undefined) return 'contact';
    return session.delivery === undefined || session.paymentMethod === undefined
      ? 'delivery'
      : 'review';
  });

  /**
  True when the contact section validates AND has been saved on the server.
  */
  readonly contactSaved: Signal<boolean> = computed(() => this.session()?.contact !== undefined);

  /**
  True when the delivery + paymentMethod sections are both saved.
  */
  readonly deliverySaved: Signal<boolean> = computed(
    () => this.session()?.delivery !== undefined && this.session()?.paymentMethod !== undefined,
  );

  /**
  True when every required section is saved and a quote exists.
  */
  readonly readyToSubmit: Signal<boolean> = computed(
    () =>
      this.contactSaved() &&
      this.deliverySaved() &&
      this.quote() !== null &&
      this.form().valid() &&
      !this.busy(),
  );

  // -------------------------------------------------------------------------
  // Lifecycle / recovery.
  // -------------------------------------------------------------------------

  /**
   * Ensures a cart exists, then loads the persisted checkout session
   * for that cart. Returns the loaded session (or null when the cart
   * is empty). Called by the route layout on every /penztar/* mount.
   *
   * Privacy: when the caller passes `clearOnLoad: true` the
   * in-memory form is reset before hydration so a hard reload wipes
   * any contact / address the previous tab entered. The cart
   * survives because `CartFacade` is the source of truth for it.
   */
  async loadSession(
    cartId: string | null,
    options: { clearOnLoad: boolean },
  ): Promise<CheckoutSession | null> {
    if (cartId === null) {
      this.cartIdWritable.set(null);
      return null;
    }
    this.cartIdWritable.set(cartId);
    try {
      const session = await firstValueFrom(
        this.api.invoke(functions.getCheckoutSession, { cartId }),
      );
      this.applySession(session, options);
      return session;
    } catch (error) {
      // The server returning 404 / 410 simply means there is no
      // draft yet — the wizard should start at the contact step.
      const mapped = mapError(error);
      if (mapped.status === 404 || mapped.status === 410) {
        this.applySession(
          {
            cartId,
            cartVersion: this.cartFacade.cart()?.version ?? 1,
          },
          options,
        );
        return this.session();
      }
      this.recordFailure(mapped);
      return null;
    }
  }

  /**
   * Clears every in-memory trace of the user. Called on hard reload
   * (per the privacy contract) and explicitly by the "Mégse" button
   * on the review step. The cart survives because `CartFacade` is
   * the source of truth.
   */
  resetDraft(): void {
    this.modelWritable.set(createInitialCheckoutFormModel());
    this.sessionWritable.set(null);
    this.quoteWritable.set(null);
    this.paymentIntentWritable.set(null);
    this.orderWritable.set(null);
    this.errorWritable.set(null);
    this.draftDirtyWritable.set(false);
    this.hydratedWritable.set(false);
  }

  /**
   * Marks the form as dirty after the user edits any field. Called
   * from the page templates via `onFieldChanged`. The review page
   * uses `draftDirty()` to invalidate the active quote on screen so
   * the user understands the price is stale (T19-AC04).
   */
  markDraftDirty(): void {
    if (!this.draftDirtyWritable()) {
      this.draftDirtyWritable.set(true);
    }
  }

  // -------------------------------------------------------------------------
  // Save helpers — every section is its own explicit PUT.
  // -------------------------------------------------------------------------

  /**
   * Persists the contact section. Returns the updated session on
   * success or a structured error on failure. Failure does NOT
   * reset the form model — the user can correct and retry.
   */
  async saveContactSection(): Promise<CheckoutMutationResult<CheckoutSession>> {
    const value = this.modelWritable();
    return this.saveSection({ contact: toContactPayload(value) });
  }

  /**
  Persists the delivery section (option + address).
  */
  async saveDeliverySection(): Promise<CheckoutMutationResult<CheckoutSession>> {
    const value = this.modelWritable();
    return this.saveSection({ delivery: toDeliveryPayload(value) });
  }

  /**
  Persists the payment method.
  */
  async savePaymentMethod(): Promise<CheckoutMutationResult<CheckoutSession>> {
    const value = this.modelWritable();
    return this.saveSection({ paymentMethod: value.paymentMethod as 'demo_card' | 'demo_cod' });
  }

  /**
   * Generic `PUT /checkout/{cartId}` driver. Called by the typed
   * wrappers above. Updates the session, clears the cached quote,
   * and clears the `draftDirty` flag on success.
   */
  private async saveSection(body: {
    contact?: Contact;
    delivery?: DeliverySelection;
    paymentMethod?: 'demo_card' | 'demo_cod';
  }): Promise<CheckoutMutationResult<CheckoutSession>> {
    const cartId = this.cartIdWritable();
    if (cartId === null) {
      return {
        ok: false,
        error: {
          code: 'NO_CART',
          status: 0,
          detail: 'A kosár nem áll készen.',
          fieldErrors: [],
        },
      };
    }
    const cartVersion = this.cartFacade.cart()?.version;
    if (cartVersion === undefined) {
      return {
        ok: false,
        error: {
          code: 'NO_CART',
          status: 0,
          detail: 'A kosár verziója nem elérhető.',
          fieldErrors: [],
        },
      };
    }
    // architecture.md:117 - "A retry sends the identical
    // body/precondition." One key per canonical request fingerprint:
    // reuse the held key while the fingerprint is unchanged, mint a
    // fresh one only when it differs. Built over an array (fixed
    // element order) rather than the `body` object literal, so
    // reordering the payload's own fields cannot silently mint a new
    // key for an identical request.
    const fingerprint = JSON.stringify([
      cartId,
      cartVersion,
      body.contact ?? null,
      body.delivery ?? null,
      body.paymentMethod ?? null,
    ]);
    const held = this.savedSectionKey;
    const key =
      held !== null && held.fingerprint === fingerprint ? held.key : freshIdempotencyKey();
    this.savedSectionKey = { fingerprint, key };
    this.busyWritable.set(true);
    try {
      const session = await firstValueFrom(
        this.api.invoke(
          functions.updateCheckout,
          {
            cartId,
            'Idempotency-Key': key,
            body,
          },
          withIfMatch(cartVersion),
        ),
      );
      this.applySession(session);
      this.quoteWritable.set(null);
      this.draftDirtyWritable.set(false);
      this.errorWritable.set(null);
      return { ok: true, value: session };
    } catch (error) {
      const mapped = mapError(error);
      // 422 VALIDATION_ERROR leaves the form intact so the user can
      // correct field-level errors; the banner shows the first
      // message. Do NOT reset the model.
      this.recordFailure(mapped);
      return { ok: false, error: mapped };
    } finally {
      this.busyWritable.set(false);
    }
  }

  // -------------------------------------------------------------------------
  // Quote lifecycle.
  // -------------------------------------------------------------------------

  /**
   * Creates a fresh quote bound to the current cart version.
   * Returns the persisted Quote on success or a structured error.
   * The user must explicitly click "Fizetés" / "Megrendelés" — no
   * guard ever calls this method.
   */
  async createQuote(): Promise<CheckoutMutationResult<Quote>> {
    const cartId = this.cartIdWritable();
    const cartVersion = this.cartFacade.cart()?.version;
    if (cartId === null || cartVersion === undefined) {
      return {
        ok: false,
        error: {
          code: 'NO_CART',
          status: 0,
          detail: 'A kosár nem áll készen.',
          fieldErrors: [],
        },
      };
    }
    // `createCheckoutQuote` carries no request body; a quote prices
    // the cart's own contents, not the draft, so `cartId` +
    // `cartVersion` alone identify the canonical request
    // (architecture.md:9 - a draft edit does not change `cartVersion`
    // and does not change what the quote computes). Set
    // unconditionally: a PRICE_CHANGED 409 bumps `cartVersion`
    // server-side, so the next legitimate request already gets a new
    // fingerprint and a new key with no manual clearing needed.
    const fingerprint = JSON.stringify([cartId, cartVersion]);
    const held = this.heldQuoteKey;
    const key =
      held !== null && held.fingerprint === fingerprint ? held.key : freshIdempotencyKey();
    this.heldQuoteKey = { fingerprint, key };
    this.busyWritable.set(true);
    try {
      const quote = await firstValueFrom(
        this.api.invoke(
          functions.createCheckoutQuote,
          {
            cartId,
            'Idempotency-Key': key,
          },
          withIfMatch(cartVersion),
        ),
      );
      this.quoteWritable.set(quote);
      this.errorWritable.set(null);
      return { ok: true, value: quote };
    } catch (error) {
      const mapped = mapError(error);
      this.recordFailure(mapped);
      return { ok: false, error: mapped };
    } finally {
      this.busyWritable.set(false);
    }
  }

  /**
   * Discards the active quote. Called by the review page when the
   * user re-edits the contact / delivery / payment section, so the
   * "Fizetés" button reports a stale-quote state and the user has to
   * re-press it (T19-AC04).
   */
  invalidateQuote(): void {
    this.quoteWritable.set(null);
  }

  // -------------------------------------------------------------------------
  // Receipt hydration (T24-AC02).
  // -------------------------------------------------------------------------

  /**
   * Fetches an order receipt by id. GET only — never POST — so a
   * reload / deep-link / back+forward to the success URL can
   * rehydrate the page without creating a duplicate order. The
   * `If-Match` header is bound to the current cart version so the
   * interceptor emits it, even though GET requests ignore it; this
   * keeps the wire surface uniform with the rest of the facade.
   *
   * On success the receipt is committed to the `order` signal so
   * the success page renders immediately. On 404 a structured
   * `not_found` error is returned so the page can render its
   * recovery state. Every other failure surfaces the canonical
   * `CheckoutError` shape the rest of the facade uses.
   */
  async fetchOrder(orderId: string): Promise<CheckoutMutationResult<OrderReceipt>> {
    // GET carries no `If-Match` — the receipt is keyed by orderId,
    // not by cart version, and a stale cart version should not turn
    // a deep-link reload into a 412.
    try {
      const receipt = await firstValueFrom(this.api.invoke(functions.getOrder, { orderId }));
      this.orderWritable.set(receipt);
      this.errorWritable.set(null);
      return { ok: true, value: receipt };
    } catch (error) {
      const mapped = mapError(error);
      if (mapped.status === 404) {
        return {
          ok: false,
          error: {
            code: 'not_found',
            status: 404,
            detail: mapped.detail,
            fieldErrors: [],
          },
        };
      }
      this.recordFailure(mapped);
      return { ok: false, error: mapped };
    }
  }

  // -------------------------------------------------------------------------
  // Payment + order commit (explicit UI actions only).
  // -------------------------------------------------------------------------

  /**
   * Creates a `demo_card` payment intent. Returns 400 when the
   * current payment method is `demo_cod` (no intent needed). The
   * review page calls this from the explicit "Fizetés indítása"
   * button.
   */
  async createPaymentIntent(): Promise<CheckoutMutationResult<PaymentIntent>> {
    const cartId = this.cartIdWritable();
    const quote = this.quoteWritable();
    if (cartId === null || quote === null) {
      return {
        ok: false,
        error: {
          code: 'NO_QUOTE',
          status: 0,
          detail: 'Az árajánlat nem áll készen.',
          fieldErrors: [],
        },
      };
    }
    const paymentMethod = this.modelWritable().paymentMethod;
    if (paymentMethod !== 'demo_card') {
      return {
        ok: false,
        error: {
          code: 'PAYMENT_INTENT_NOT_NEEDED',
          status: 0,
          detail: 'A demo_cod fizetési mód nem igényel fizetési szándékot.',
          fieldErrors: [],
        },
      };
    }
    // openapi.yaml:628-635 - "New approved retry uses a new payment
    // key; ambiguous network retry retains original key." Unlike
    // saveSection()/createQuote() above, every response the mock
    // actually sends back (succeeded, declined or pending, per the
    // generated PaymentIntent model) is a DEFINITIVE outcome, so the
    // held key is cleared on every response and kept ONLY across a
    // transport failure (status === 0 - no response was received, so
    // the outcome is genuinely ambiguous).
    const fingerprint = JSON.stringify([cartId, quote.id]);
    const held = this.heldPaymentIntentKey;
    const key =
      held !== null && held.fingerprint === fingerprint ? held.key : freshIdempotencyKey();

    this.busyWritable.set(true);
    try {
      const intent = await firstValueFrom(
        this.api.invoke(functions.createPaymentIntent, {
          'Idempotency-Key': key,
          body: { cartId, quoteId: quote.id },
        }),
      );
      this.paymentIntentWritable.set(intent);
      this.errorWritable.set(null);
      // A response was received - succeeded, declined or pending are
      // all definitive per openapi.yaml. The next call is a new
      // attempt and must mint a fresh key.
      this.heldPaymentIntentKey = null;
      return { ok: true, value: intent };
    } catch (error) {
      const mapped = mapError(error);
      this.recordFailure(mapped);
      // Decline / pending / etc. leave contact + address + cart intact
      // (AC03) — only the payment intent is left unset so the user
      // can press the button once more or pick a different method.
      // status === 0 is a transport failure: no response was
      // received, so the retry must carry the identical key. Any
      // other status is a definitive server response (a Problem
      // body); the next attempt is a new one and gets a fresh key.
      this.heldPaymentIntentKey = mapped.status === 0 ? { fingerprint, key } : null;
      return { ok: false, error: mapped };
    } finally {
      this.busyWritable.set(false);
    }
  }

  /**
   * Atomic order commit. The review page calls this from the final
   * "Demórendelés véglegesítése" button. On success the receipt is
   * stored and the wizard advances to the success step. On failure
   * the form, draft and cart are preserved (AC03).
   */
  async commitOrder(): Promise<CheckoutMutationResult<OrderReceipt>> {
    const cartId = this.cartIdWritable();
    const quote = this.quoteWritable();
    if (cartId === null || quote === null) {
      return {
        ok: false,
        error: {
          code: 'NO_QUOTE',
          status: 0,
          detail: 'Az árajánlat nem áll készen.',
          fieldErrors: [],
        },
      };
    }
    const paymentIntent = this.paymentIntentWritable();
    const paymentMethod = this.modelWritable().paymentMethod;
    const body = {
      cartId,
      quoteId: quote.id,
      ...(paymentMethod === 'demo_card' &&
        paymentIntent !== null && { paymentIntentId: paymentIntent.id }),
      termsVersion: 'demo-1' as const,
      acceptedTerms: true as const,
      acknowledgedSimulation: true as const,
    };
    // architecture.md:117/:121 — "A retry sends the identical
    // body/precondition." One key per canonical request fingerprint:
    // reuse the held key while the fingerprint is unchanged, mint a
    // fresh one only when it differs. Built over a key-sorted array
    // rather than the object literal, so reordering the fields above
    // cannot silently mint a new key for an identical request.
    const fingerprint = JSON.stringify([
      body.cartId,
      body.quoteId,
      'paymentIntentId' in body ? body.paymentIntentId : null,
      body.termsVersion,
      body.acceptedTerms,
      body.acknowledgedSimulation,
    ]);
    const held = this.heldCommitOrderKey;
    const idempotencyKey =
      held !== null && held.fingerprint === fingerprint ? held.key : freshIdempotencyKey();
    this.heldCommitOrderKey = { fingerprint, key: idempotencyKey };
    const result = await this.commitOrderWithKey(idempotencyKey, body);
    if (result.ok) {
      // A genuinely new order must not inherit this fingerprint's key.
      this.heldCommitOrderKey = null;
    }
    return result;
  }

  /** Held idempotency key for the last `commitOrder()` fingerprint;
   *  cleared on a terminal success (see `commitOrder()` above). */
  private heldCommitOrderKey: { readonly fingerprint: string; readonly key: string } | null = null;

  /**
   * Commit with an externally supplied idempotency key. Used by
   * `OrderSubmission` so the persisted safe-order record's key
   * matches the one the mock's idempotency cache actually stores
   * (T23-AC04). The body MUST match the wire contract — no PII.
   */
  async commitOrderWithKey(
    idempotencyKey: string,
    body: {
      cartId: string;
      quoteId: string;
      paymentIntentId?: string;
      termsVersion: 'demo-1';
      acceptedTerms: true;
      acknowledgedSimulation: true;
    },
  ): Promise<CheckoutMutationResult<OrderReceipt>> {
    this.busyWritable.set(true);
    try {
      const receipt = await firstValueFrom(
        this.api.invoke(functions.createOrder, {
          'Idempotency-Key': idempotencyKey,
          body,
        }),
      );
      this.orderWritable.set(receipt);
      this.errorWritable.set(null);
      return { ok: true, value: receipt };
    } catch (error) {
      const mapped = mapError(error);
      this.recordFailure(mapped);
      return { ok: false, error: mapped };
    } finally {
      this.busyWritable.set(false);
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers — kept module-internal so the tests can exercise
  // the public surface only.
  // -------------------------------------------------------------------------

  /**
   * Replaces the in-memory session snapshot and hydrates the form
   * model from it. The cart survives across the swap (CartFacade
   * owns the cart); contact / address are populated only when the
   * snapshot actually carries them.
   *
   * When the snapshot omits a section that the in-memory form
   * already holds (e.g. `saveDeliverySection()` PUTs only the
   * delivery section and the server returns a session without
   * `paymentMethod`), the form keeps the previously typed value
   * rather than resetting it to ''. Wiping fields that were not
   * part of the save would force the user to retype values they
   * already entered — and, in the case of `paymentMethod`,
   * turn the next `savePaymentMethod()` into a 422 by sending
   * the empty string. The merge rules live in
   * `hydrateCheckoutFormModel`.
   */
  private applySession(
    session: CheckoutSession,
    options: { clearOnLoad: boolean } = { clearOnLoad: false },
  ): void {
    this.sessionWritable.set(session);
    if (options.clearOnLoad) {
      // Privacy: hard reload clears the in-memory contact + address
      // even though the server-side draft survives. The form is
      // wiped so the user retypes; the next saveSection replaces the
      // server draft atomically.
      this.modelWritable.set(createInitialCheckoutFormModel());
    } else {
      this.modelWritable.set(
        hydrateCheckoutFormModel(this.modelWritable(), {
          contact: session.contact,
          delivery: session.delivery,
          paymentMethod: session.paymentMethod,
        }),
      );
    }
    this.hydratedWritable.set(true);
  }

  /**
  Surfaces a non-recoverable error on the wizard banner.
  */
  private recordFailure(error: CheckoutError): void {
    this.errorWritable.set(error);
  }
}

/**
 * Test-only helpers — kept module-local so the spec file can drive
 * the facade without exposing internals to the runtime. The
 * `__private*` prefix guards against accidental imports from app
 * code.
 */
export const __privateCheckoutHelpers = {
  PHONE_PATTERN,
  POSTAL_CODE_PATTERN,
  normalizeDeliveryOptionId,
  normalizePaymentMethod,
};
