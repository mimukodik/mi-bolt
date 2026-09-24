/**
 * MIM-212 — checkout store on the 2.0.0 contract.
 *
 * The checkout draft shares the cart's session version counter
 * (`contracts/commerce/openapi.yaml:16-19`); a `version` of its own would split
 * the ETag across two resources. The store holds no counter and no TTL:
 * it reads the cart through the injected `CartStore` and bumps the
 * shared version through `CartStore.touch`. A `read` method assembles
 * the cart, the draft and the wire-shaped `CheckoutSession` in one
 * place so the order store (S3-A2) can reuse it.
 *
 * The Problem body is the generated `Problem` (a contract-published
 * model) and its `type` URI follows the contract's own examples via
 * the shared `problemType` helper in `cart-store.ts`. `detail` is an
 * English developer diagnostic (`openapi.yaml:1490-1493`); Hungarian
 * survives only in the option labels, the option descriptions and
 * `OrderReceipt.notice`.
 */

import type { Address } from '@mi-bolt/api/models/address';
import type { BillingDetails } from '@mi-bolt/api/models/billing-details';
import type { Cart } from '@mi-bolt/api/models/cart';
import type { CheckoutOptions } from '@mi-bolt/api/models/checkout-options';
import type { CheckoutSession } from '@mi-bolt/api/models/checkout-session';
import type { CheckoutSummary } from '@mi-bolt/api/models/checkout-summary';
import type { Contact } from '@mi-bolt/api/models/contact';
import type { DeliveryOption } from '@mi-bolt/api/models/delivery-option';
import type { DeliveryOptionId } from '@mi-bolt/api/models/delivery-option-id';
import type { DeliverySelection } from '@mi-bolt/api/models/delivery-selection';
import type { FieldError } from '@mi-bolt/api/models/field-error';
import type { HomeDeliverySelection } from '@mi-bolt/api/models/home-delivery-selection';
import type { Money } from '@mi-bolt/api/models/money';
import type { PaymentMethodId } from '@mi-bolt/api/models/payment-method-id';
import type { PaymentMethodOption } from '@mi-bolt/api/models/payment-method-option';
import type { PaymentSelection } from '@mi-bolt/api/models/payment-selection';
import type { PickupPointSelection } from '@mi-bolt/api/models/pickup-point-selection';
import type { Problem } from '@mi-bolt/api/models/problem';
import type { ProblemCode } from '@mi-bolt/api/models/problem-code';
import type { UnavailableReason } from '@mi-bolt/api/models/unavailable-reason';

import type { CreateHandlersOptions } from '../create-handlers';
import type { CartStore } from '../cart/cart-store';
import { buildTraceId, problemType, titleForStatus } from '../cart/cart-store';
import { isRecord } from '../is-record';
import type { PersistedCheckoutDraft } from '../persistence';
import {
  normalizeAddressCity,
  normalizeAddressCountryCode,
  normalizeAddressLine1,
  normalizeAddressLine2,
  normalizeAddressPostalCode,
  normalizeContactEmail,
  normalizeContactFullName,
  normalizeContactPhone,
} from './validate-checkout';

const ZERO_HUF: Money = { amount: 0, currency: 'HUF' };

/**
 * Demo defaults mirrored from the backend (`application.properties`,
 * `mibolt.checkout.*`; docs/decisions/0010 there). Whole HUF.
 */
export const TERMS_VERSION = '2026-09';
export const FREE_SHIPPING_THRESHOLD_HUF = 30000;
export const CASH_ON_DELIVERY_MAX_CART_HUF = 300000;

interface CheckoutDraft {
  contact?: Contact;
  billing?: BillingDetails;
  delivery?: DeliverySelection;
  payment?: PaymentSelection;
}

const DELIVERY_OPTIONS: Readonly<Record<DeliveryOptionId, DeliveryOption>> = {
  home_delivery: {
    id: 'home_delivery',
    label: 'Házhoz szállítás',
    description: 'Futárral, 1–2 munkanapon belül.',
    fee: { amount: 1490, currency: 'HUF' },
    requiresAddress: true,
    estimatedDays: 2,
    available: true,
  },
  pickup_point: {
    id: 'pickup_point',
    label: 'Átvételi pont',
    description: 'Csomagponton, 2–3 munkanapon belül.',
    fee: { amount: 990, currency: 'HUF' },
    requiresAddress: false,
    estimatedDays: 3,
    available: true,
  },
};

const PAYMENT_METHODS: Readonly<Record<PaymentMethodId, PaymentMethodOption>> = {
  card: {
    id: 'card',
    label: 'Bankkártya',
    description: 'Online kártyás fizetés.',
    fee: { amount: 0, currency: 'HUF' },
    available: true,
  },
  cash_on_delivery: {
    id: 'cash_on_delivery',
    label: 'Utánvét',
    description: 'Készpénzzel vagy kártyával a futárnál.',
    fee: { amount: 490, currency: 'HUF' },
    available: true,
  },
};

const PATCH_SECTIONS = ['contact', 'billing', 'delivery', 'payment'] as const;
type PatchSection = (typeof PATCH_SECTIONS)[number];

export type CheckoutOutcome =
  { ok: true; session: CheckoutSession } | { ok: false; problem: Problem };

export type CheckoutOptionsOutcome =
  { ok: true; options: CheckoutOptions } | { ok: false; problem: Problem };

export type CheckoutReadResult =
  | { ok: true; cart: Cart; draft: CheckoutDraft; session: CheckoutSession }
  | { ok: false; problem: Problem };

/** The one place a checkout / order Problem body is assembled (design §7). */
export function checkoutProblem(
  options: CreateHandlersOptions,
  status: number,
  code: ProblemCode,
  detail: string,
  params: Record<string, unknown>,
  fieldErrors: readonly FieldError[] = [],
): Problem {
  return {
    type: problemType(code),
    title: titleForStatus(status),
    status,
    code,
    detail,
    traceId: buildTraceId(options),
    fieldErrors: [...fieldErrors],
    params,
  };
}

/**
 * Checkout store. Holds a per-session draft and reads the cart
 * through the injected lookup; bumps the shared version via
 * `CartStore.touch` (no version of its own). Empty draft is "no entry
 * in the map", so `get`/`options` allocate nothing on a fresh
 * session.
 */
export class CheckoutStore {
  private readonly drafts = new Map<string, CheckoutDraft>();

  constructor(
    private readonly storeOptions: CreateHandlersOptions,
    private readonly cart: () => CartStore,
  ) {}

  /** `GET /checkout/options` — cart read only, no ETag (`openapi.yaml:481-487`). */
  options(sessionId: string): CheckoutOptionsOutcome {
    const cartResult = this.cart().get(sessionId);
    if (!cartResult.ok) return { ok: false, problem: cartResult.problem };
    return { ok: true, options: computeOptions(cartResult.cart) };
  }

  /** `GET /checkout` — cart read, no version bump. */
  get(sessionId: string): CheckoutOutcome {
    const read = this.read(sessionId);
    if (!read.ok) return read;
    return { ok: true, session: read.session };
  }

  /** `PATCH /checkout` — validate, merge, bump through the cart. */
  update(sessionId: string, ifMatch: string | null, body: unknown): CheckoutOutcome {
    // 400 INVALID_REQUEST on shape: unparseable body, non-record, no
    // known section, or a present section that is not a record.
    if (!isRecord(body)) {
      return {
        ok: false,
        problem: this.problem(
          400,
          'INVALID_REQUEST',
          'Request body must carry at least one known checkout section',
          {},
          [],
        ),
      };
    }
    const presentSections: PatchSection[] = [];
    for (const key of PATCH_SECTIONS) {
      if (Object.prototype.hasOwnProperty.call(body, key)) presentSections.push(key);
    }
    if (presentSections.length === 0) {
      return {
        ok: false,
        problem: this.problem(
          400,
          'INVALID_REQUEST',
          'Request body must carry at least one known checkout section',
          {},
          [],
        ),
      };
    }
    const rawSections: Partial<Record<PatchSection, Record<string, unknown>>> = {};
    for (const section of presentSections) {
      const value = body[section];
      if (!isRecord(value)) {
        return {
          ok: false,
          problem: this.problem(
            400,
            'INVALID_REQUEST',
            'Checkout section must be an object',
            { section },
            [],
          ),
        };
      }
      rawSections[section] = value;
    }

    // 410 CART_EXPIRED passes straight through.
    const cartResult = this.cart().get(sessionId);
    if (!cartResult.ok) return { ok: false, problem: cartResult.problem };

    // 412 CART_VERSION_CONFLICT.
    if (ifMatch !== `"${String(cartResult.cart.version)}"`) {
      return {
        ok: false,
        problem: this.problem(
          412,
          'CART_VERSION_CONFLICT',
          'The cart changed since the version supplied in If-Match',
          { expected: cartResult.cart.version, received: ifMatch },
          [],
        ),
      };
    }

    // 422 VALIDATION_FAILED — collect every field error across all
    // present sections before answering.
    const fieldErrors: FieldError[] = [];
    const normalized: {
      contact?: Contact;
      billing?: BillingDetails;
      delivery?: DeliverySelection;
      payment?: PaymentSelection;
    } = {};
    for (const section of presentSections) {
      const raw = rawSections[section];
      if (raw === undefined) continue;
      if (section === 'contact') {
        const result = validateContact(raw);
        if (result.ok) normalized.contact = result.contact;
        else fieldErrors.push(...result.errors);
      } else if (section === 'billing') {
        const result = validateBilling(raw);
        if (result.ok) normalized.billing = result.billing;
        else fieldErrors.push(...result.errors);
      } else if (section === 'delivery') {
        const result = validateDelivery(raw);
        if (result.ok) normalized.delivery = result.delivery;
        else fieldErrors.push(...result.errors);
      } else {
        const result = validatePayment(raw);
        if (result.ok) normalized.payment = result.payment;
        else fieldErrors.push(...result.errors);
      }
    }
    const params: Record<string, unknown> = {};
    const available = computeOptions(cartResult.cart);
    const deliveryEntry = chosenDelivery(available, normalized);
    if (deliveryEntry !== undefined && !deliveryEntry.available) {
      fieldErrors.push({ path: '/delivery/optionId', code: 'DELIVERY_OPTION_UNAVAILABLE' });
      params['reason'] = deliveryEntry.unavailableReason;
    }
    const paymentEntry = chosenPayment(available, normalized);
    if (paymentEntry !== undefined && !paymentEntry.available) {
      fieldErrors.push({ path: '/payment/method', code: 'PAYMENT_METHOD_UNAVAILABLE' });
      params['reason'] = paymentEntry.unavailableReason;
    }
    if (fieldErrors.length > 0) {
      return {
        ok: false,
        problem: this.problem(
          422,
          'VALIDATION_FAILED',
          'One or more supplied fields are not acceptable.',
          params,
          fieldErrors,
        ),
      };
    }

    // Merge: a present section replaces that section wholesale; an
    // absent section is retained untouched.
    const existing: CheckoutDraft = this.drafts.get(sessionId) ?? {};
    const draft: CheckoutDraft = { ...existing, ...normalized };

    // Bump through the cart so version moves, then build the wire.
    const touched = this.cart().touch(sessionId);
    if (!touched.ok) return { ok: false, problem: touched.problem };
    this.drafts.set(sessionId, draft);
    const readAfter = this.read(sessionId);
    if (!readAfter.ok) return readAfter;
    return { ok: true, session: readAfter.session };
  }

  /**
   * Assemble the cart, the draft and the wire-shaped
   * `CheckoutSession` in one place. Internal: the order store reads
   * through this, never through `drafts` directly.
   */
  read(sessionId: string): CheckoutReadResult {
    const cartResult = this.cart().get(sessionId);
    if (!cartResult.ok) return { ok: false, problem: cartResult.problem };
    const cart = cartResult.cart;
    const draft: CheckoutDraft = this.drafts.get(sessionId) ?? {};
    const options = computeOptions(cart);
    const delivery = chosenDelivery(options, draft);
    const payment = chosenPayment(options, draft);
    const summary = buildSummary(cart, delivery, payment);
    const complete =
      draft.contact !== undefined &&
      draft.billing !== undefined &&
      cart.items.length > 0 &&
      delivery?.available === true &&
      payment?.available === true;
    const session: CheckoutSession = { summary, complete, version: cart.version };
    if (draft.contact !== undefined) session.contact = draft.contact;
    if (draft.billing !== undefined) session.billing = draft.billing;
    if (draft.delivery !== undefined) session.delivery = draft.delivery;
    if (draft.payment !== undefined) session.payment = draft.payment;
    return { ok: true, cart, draft, session };
  }

  /** Clear the draft for `OrderStore` after a successful order. */
  clearDraft(sessionId: string): void {
    this.drafts.delete(sessionId);
  }

  /**
   * Seeds the session's draft from a hydrated snapshot. Called once
   * at handler-construction time when `options.snapshot?.checkoutDraft`
   * is set, so a reload restores every section the shopper had filled
   * in. `CheckoutStore.read()` already tolerates a draft pointing at
   * an option since made unavailable, so no extra guard is needed.
   */
  seedFromSnapshot(sessionId: string, persisted: PersistedCheckoutDraft): void {
    this.drafts.set(sessionId, { ...persisted });
  }

  /**
   * Returns the draft in the shape `MockSnapshot` carries, or
   * `undefined` when the session has no draft or the draft is empty.
   * An empty draft is omitted from the snapshot: `hydrate()` parses
   * an absent `checkoutDraft` the same way as one whose sections are
   * all undefined, so the snapshot stays minimal.
   */
  toPersistedDraft(sessionId: string): PersistedCheckoutDraft | undefined {
    const draft = this.drafts.get(sessionId);
    if (draft === undefined || Object.keys(draft).length === 0) return undefined;
    return { ...draft };
  }

  // ---------------------------------------------------------------------------
  // Internal: Problem factory.
  // ---------------------------------------------------------------------------

  private problem(
    status: number,
    code: ProblemCode,
    detail: string,
    params: Record<string, unknown>,
    fieldErrors: readonly FieldError[] = [],
  ): Problem {
    return checkoutProblem(this.storeOptions, status, code, detail, params, fieldErrors);
  }
}

/**
 * The options for a cart, with the backend's free-shipping and
 * cash-on-delivery-cap rules applied (`CheckoutService.buildOptions`).
 */
function computeOptions(cart: Cart): CheckoutOptions {
  const subtotal = cart.subtotal.amount;
  const empty = cart.items.length === 0;
  const free = subtotal >= FREE_SHIPPING_THRESHOLD_HUF;
  const emptyReason: UnavailableReason = 'CART_EMPTY';
  const deliveryOptions: DeliveryOption[] = Object.values(DELIVERY_OPTIONS).map((entry) => {
    const fee: Money = free ? ZERO_HUF : entry.fee;
    return empty
      ? { ...entry, fee, available: false, unavailableReason: emptyReason }
      : { ...entry, fee };
  });
  const codTooHigh = subtotal > CASH_ON_DELIVERY_MAX_CART_HUF;
  const paymentMethods: PaymentMethodOption[] = Object.values(PAYMENT_METHODS).map((entry) => {
    if (empty) return { ...entry, available: false, unavailableReason: emptyReason };
    if (entry.id === 'cash_on_delivery' && codTooHigh) {
      return { ...entry, available: false, unavailableReason: 'CART_VALUE_TOO_HIGH' };
    }
    return { ...entry };
  });
  return { deliveryOptions, paymentMethods, termsVersion: TERMS_VERSION };
}

/** The computed delivery option the draft points at, if any. */
function chosenDelivery(
  options: CheckoutOptions,
  draft: CheckoutDraft,
): DeliveryOption | undefined {
  const optionId = draft.delivery?.optionId;
  if (optionId === undefined) return undefined;
  return options.deliveryOptions.find((entry) => entry.id === optionId);
}

/** The computed payment method the draft points at, if any. */
function chosenPayment(
  options: CheckoutOptions,
  draft: CheckoutDraft,
): PaymentMethodOption | undefined {
  const method = draft.payment?.method;
  if (method === undefined) return undefined;
  return options.paymentMethods.find((entry) => entry.id === method);
}

/** Build a CheckoutSummary from the cart and the chosen entries; pure, no I/O. */
function buildSummary(
  cart: Cart,
  delivery: DeliveryOption | undefined,
  payment: PaymentMethodOption | undefined,
): CheckoutSummary {
  const shippingFee = delivery?.available === true ? delivery.fee : ZERO_HUF;
  const paymentFee = payment?.available === true ? payment.fee : ZERO_HUF;
  const total: Money = {
    amount: cart.subtotal.amount + shippingFee.amount + paymentFee.amount,
    currency: 'HUF',
  };
  return { subtotal: cart.subtotal, shippingFee, paymentFee, total };
}

// ---------------------------------------------------------------------------
// Section validators. Each returns either the normalized value or the
// collected field errors with their JSON-pointer paths.
// ---------------------------------------------------------------------------

function validateContact(
  value: Record<string, unknown>,
): { ok: true; contact: Contact } | { ok: false; errors: FieldError[] } {
  const fullName = normalizeContactFullName(value['fullName']);
  const email = normalizeContactEmail(value['email']);
  const phone = normalizeContactPhone(value['phone']);
  if (fullName === null || email === null || phone === null) {
    const errors: FieldError[] = [];
    if (fullName === null) errors.push({ path: '/contact/fullName', code: 'FULL_NAME_LENGTH' });
    if (email === null) errors.push({ path: '/contact/email', code: 'EMAIL_FORMAT' });
    if (phone === null) errors.push({ path: '/contact/phone', code: 'PHONE_FORMAT' });
    return { ok: false, errors };
  }
  return { ok: true, contact: { fullName, email, phone } };
}

function validateBilling(
  value: Record<string, unknown>,
): { ok: true; billing: BillingDetails } | { ok: false; errors: FieldError[] } {
  const name = normalizeContactFullName(value['name']);
  const nameErrors: FieldError[] =
    name === null ? [{ path: '/billing/name', code: 'NAME_LENGTH' }] : [];
  const addressRaw = value['address'];
  if (!isRecord(addressRaw)) {
    return {
      ok: false,
      errors: [...nameErrors, { path: '/billing/address', code: 'SECTION_MISSING' }],
    };
  }
  const address = validateDeliveryAddress(addressRaw, '/billing/address');
  if (address.errors.length > 0 || name === null) {
    return { ok: false, errors: [...nameErrors, ...address.errors] };
  }
  return { ok: true, billing: { name, address: address.address } };
}

function validateDelivery(
  value: Record<string, unknown>,
): { ok: true; delivery: DeliverySelection } | { ok: false; errors: FieldError[] } {
  const optionId = value['optionId'];
  if (optionId !== 'home_delivery' && optionId !== 'pickup_point') {
    return {
      ok: false,
      errors: [{ path: '/delivery/optionId', code: 'DELIVERY_OPTION_UNAVAILABLE' }],
    };
  }
  const hasAddress = Object.prototype.hasOwnProperty.call(value, 'address');
  if (optionId === 'home_delivery') {
    if (!hasAddress) {
      return { ok: false, errors: [{ path: '/delivery/address', code: 'SECTION_MISSING' }] };
    }
    const addressRaw = value['address'];
    if (!isRecord(addressRaw)) {
      return { ok: false, errors: [{ path: '/delivery/address', code: 'SECTION_MISSING' }] };
    }
    const result = validateDeliveryAddress(addressRaw, '/delivery/address');
    if (result.errors.length > 0) return { ok: false, errors: result.errors };
    const delivery: HomeDeliverySelection = {
      optionId: 'home_delivery',
      address: result.address,
    };
    return { ok: true, delivery };
  }
  // optionId === 'pickup_point'
  if (hasAddress) {
    return { ok: false, errors: [{ path: '/delivery/address', code: 'ADDRESS_NOT_ALLOWED' }] };
  }
  const delivery: PickupPointSelection = { optionId: 'pickup_point' };
  return { ok: true, delivery };
}

function validateDeliveryAddress(
  value: Record<string, unknown>,
  prefix: string,
): { address: Address; errors: FieldError[] } {
  const countryCode = normalizeAddressCountryCode(value['countryCode']);
  const postalCode = normalizeAddressPostalCode(value['postalCode']);
  const city = normalizeAddressCity(value['city']);
  const line1 = normalizeAddressLine1(value['line1']);
  const line2Raw = normalizeAddressLine2(value['line2']);
  const errors: FieldError[] = [];
  if (countryCode === null)
    errors.push({ path: `${prefix}/countryCode`, code: 'COUNTRY_NOT_SUPPORTED' });
  if (postalCode === null)
    errors.push({ path: `${prefix}/postalCode`, code: 'POSTAL_CODE_FORMAT' });
  if (city === null) errors.push({ path: `${prefix}/city`, code: 'CITY_LENGTH' });
  if (line1 === null) errors.push({ path: `${prefix}/line1`, code: 'LINE1_LENGTH' });
  let line2: string | undefined;
  if (line2Raw === null) errors.push({ path: `${prefix}/line2`, code: 'LINE2_LENGTH' });
  else if (line2Raw !== undefined) line2 = line2Raw;
  if (
    errors.length > 0 ||
    countryCode === null ||
    postalCode === null ||
    city === null ||
    line1 === null
  ) {
    return {
      address: { countryCode: 'HU', postalCode: '', city: '', line1: '' },
      errors,
    };
  }
  return {
    address: {
      countryCode,
      postalCode,
      city,
      line1,
      ...(line2 !== undefined ? { line2 } : {}),
    },
    errors: [],
  };
}

function validatePayment(
  value: Record<string, unknown>,
): { ok: true; payment: PaymentSelection } | { ok: false; errors: FieldError[] } {
  const method = value['method'];
  if (method !== 'card' && method !== 'cash_on_delivery') {
    return { ok: false, errors: [{ path: '/payment/method', code: 'PAYMENT_METHOD_UNAVAILABLE' }] };
  }
  const payment: PaymentSelection = { method };
  return { ok: true, payment };
}
