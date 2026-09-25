/**
 * MIM-212 — payment intent and order store on the 2.0.0 contract.
 *
 * The store backs three mock endpoints: `POST /payment-intents` (create
 * an idempotent intent that resolves on the demo payment page),
 * `POST /payment-intents/{id}/outcome` (record the shopper's choice),
 * and `POST /orders` (finalise the receipt). `GET` endpoints return
 * 404 when the session that owns the record does not match the caller
 * (the contract's "only the placing session can read it").
 *
 * Idempotency-Key replay happens before any cart-state check, so a
 * retry after an uncertain response returns the original 201 receipt
 * even when the cart has since expired (`openapi.yaml:759-761`). The
 * `IdempotencyStore` is shared with the payment and order handlers
 * through the constructor; the cart accessor reaches `CartStore` for
 * `resetForOrder` after a successful commit.
 *
 * The two URLs a freshly created intent carries come from the
 * backend (`PaymentIntentService.java:87`,
 * `application.properties:40-42`): the redirect points at the demo
 * payment page (`/demo-fizetes/<id>`) and the return URL carries the
 * intent id in a query parameter. The 30-minute lifetime mirrors
 * `mibolt.payment.intent-lifetime=30m`.
 */

import type { Problem } from '@mi-bolt/api/models/problem';
import type { ProblemCode } from '@mi-bolt/api/models/problem-code';
import type { FieldError } from '@mi-bolt/api/models/field-error';
import type { PaymentIntent } from '@mi-bolt/api/models/payment-intent';
import type { PaymentIntentStatus } from '@mi-bolt/api/models/payment-intent-status';
import type { OrderRequest } from '@mi-bolt/api/models/order-request';
import type { CardOrderRequest } from '@mi-bolt/api/models/card-order-request';
import type { CashOnDeliveryOrderRequest } from '@mi-bolt/api/models/cash-on-delivery-order-request';
import type { OrderReceipt } from '@mi-bolt/api/models/order-receipt';
import type { OrderLine } from '@mi-bolt/api/models/order-line';
import type { Cart } from '@mi-bolt/api/models/cart';
import type { Money } from '@mi-bolt/api/models/money';
import type { StorageGb } from '@mi-bolt/api/models/storage-gb';
import type { Contact } from '@mi-bolt/api/models/contact';
import type { BillingDetails } from '@mi-bolt/api/models/billing-details';
import type { DeliverySelection } from '@mi-bolt/api/models/delivery-selection';
import type { PaymentSelection } from '@mi-bolt/api/models/payment-selection';

import type { CreateHandlersOptions } from '../create-handlers';
import type { CartStore } from '../cart/cart-store';
import type { CheckoutStore } from '../checkout/checkout-store';
import { stockLostOnce } from '../faults';
import { StockLedger } from '../stock/stock-ledger';
import { TERMS_VERSION, checkoutProblem } from '../checkout/checkout-store';
import { deriveIdempotencyKey, hashPayload } from '../idempotency';
import type { PersistedIdempotencyRecord, IdempotencyStore } from '../idempotency';
import { isRecord } from '../is-record';

export const PAYMENT_INTENT_TTL_MS = 30 * 60 * 1000;

export const SIMULATION_NOTICE =
  'A demórendelés elkészült. Nem történt valódi fizetés, rendelésküldés vagy e-mail-küldés.';

export type PaymentIntentOutcome =
  { ok: true; intent: PaymentIntent; created?: boolean } | { ok: false; problem: Problem };

export type OrderOutcome =
  { ok: true; receipt: OrderReceipt; replayed?: boolean } | { ok: false; problem: Problem };

interface StoredIntent {
  id: string;
  sessionId: string;
  status: PaymentIntentStatus;
  amount: Money;
  createdAt: string;
  expiresAt: string;
  redirectUrl: string;
  returnUrl: string;
}

/** A draft `checkCompleteness` has proven whole: every section present. */
interface CompleteDraft {
  contact: Contact;
  billing: BillingDetails;
  delivery: DeliverySelection;
  payment: PaymentSelection;
}

interface StoredOrder {
  receipt: OrderReceipt;
  sessionId: string;
}

const IDEMPOTENCY_KEY_MIN = 8;
const IDEMPOTENCY_KEY_MAX = 100;

function isPaymentIntent(value: unknown): value is PaymentIntent {
  if (!isRecord(value)) return false;
  const amount = value['amount'];
  return (
    typeof value['id'] === 'string' &&
    typeof value['createdAt'] === 'string' &&
    typeof value['expiresAt'] === 'string' &&
    typeof value['redirectUrl'] === 'string' &&
    typeof value['returnUrl'] === 'string' &&
    typeof value['status'] === 'string' &&
    isRecord(amount) &&
    typeof amount['amount'] === 'number' &&
    typeof amount['currency'] === 'string'
  );
}

function isMoney(value: unknown): value is Money {
  if (!isRecord(value)) return false;
  return typeof value['amount'] === 'number' && typeof value['currency'] === 'string';
}

function isOrderReceipt(value: unknown): value is OrderReceipt {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['orderNumber'] === 'string' &&
    value['status'] === 'confirmed' &&
    typeof value['createdAt'] === 'string' &&
    typeof value['contactEmail'] === 'string' &&
    typeof value['notice'] === 'string' &&
    Array.isArray(value['items']) &&
    isRecord(value['billing']) &&
    isRecord(value['delivery']) &&
    isMoney(value['subtotal']) &&
    isMoney(value['shippingFee']) &&
    isMoney(value['paymentFee']) &&
    isMoney(value['total']) &&
    typeof value['paymentMethod'] === 'string'
  );
}

export class OrderStore {
  private readonly intents = new Map<string, StoredIntent>();
  private readonly orders = new Map<string, StoredOrder>();
  /** Card intents that already back an order: one order per intent, as
   *  on the backend (`POST /orders` in the contract). */
  private readonly usedIntentIds = new Set<string>();
  private orderSequence = 0;

  constructor(
    private readonly options: CreateHandlersOptions,
    private readonly checkout: CheckoutStore,
    private readonly idempotency: IdempotencyStore,
    private readonly cart: () => CartStore,
    private readonly stock: StockLedger = new StockLedger(),
  ) {}

  createPaymentIntent(
    sessionId: string,
    idempotencyKey: string,
    ifMatch: string | null,
  ): PaymentIntentOutcome {
    if (
      idempotencyKey.length < IDEMPOTENCY_KEY_MIN ||
      idempotencyKey.length > IDEMPOTENCY_KEY_MAX
    ) {
      return {
        ok: false,
        problem: this.problem(
          400,
          'INVALID_REQUEST',
          'Idempotency-Key must be 8 to 100 characters',
          { received: idempotencyKey },
          [],
        ),
      };
    }

    const key = deriveIdempotencyKey('POST', '/payment-intents', sessionId, idempotencyKey);
    const payload = { ifMatch };
    const hash = hashPayload(payload);
    const cached = this.idempotency.find(key, hash);
    if (cached !== null) {
      if (!isPaymentIntent(cached.body)) {
        throw new Error('[order-store] cached body for /payment-intents is not a PaymentIntent');
      }
      return { ok: true, intent: cached.body, created: false };
    }
    if (this.idempotency.hasConflictingPayload(key, hash)) {
      return {
        ok: false,
        problem: this.problem(
          409,
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was already used with a different request.',
          {},
          [],
        ),
      };
    }

    const readResult = this.checkout.read(sessionId);
    if (!readResult.ok) return { ok: false, problem: readResult.problem };
    const { cart, draft } = readResult;

    const versionCheck = this.checkIfMatch(ifMatch, cart.version);
    if (!versionCheck.ok) return { ok: false, problem: versionCheck.problem };

    const completeness = this.checkCompleteness(cart, draft);
    if (!completeness.ok) return { ok: false, problem: completeness.problem };

    if (draft.payment?.method !== 'card') {
      const method = draft.payment?.method;
      return {
        ok: false,
        problem: this.problem(
          422,
          'CHECKOUT_INCOMPLETE',
          'Payment intents are permitted for card payment only',
          method !== undefined ? { method } : {},
          [{ path: '/payment', code: 'PAYMENT_METHOD_NOT_CARD' }],
        ),
      };
    }

    const id = this.options.ids.uuid();
    const createdAt = this.options.clock.now();
    const expiresAt = new Date(Date.parse(createdAt) + PAYMENT_INTENT_TTL_MS).toISOString();
    const stored: StoredIntent = {
      id,
      sessionId,
      status: 'requires_action',
      amount: readResult.session.summary.total,
      createdAt,
      expiresAt,
      redirectUrl: `/demo-fizetes/${id}`,
      returnUrl: `/penztar?paymentIntentId=${id}`,
    };
    this.intents.set(id, stored);
    const wire = this.toWireIntent(stored);
    this.idempotency.record(key, hash, { status: 201, body: wire });
    return { ok: true, intent: wire, created: true };
  }

  getPaymentIntent(sessionId: string, paymentIntentId: string): PaymentIntentOutcome {
    const stored = this.intents.get(paymentIntentId);
    if (stored?.sessionId !== sessionId) {
      return {
        ok: false,
        problem: this.problem(
          404,
          'NOT_FOUND',
          'Payment intent not found',
          { paymentIntentId },
          [],
        ),
      };
    }
    return { ok: true, intent: this.toWireIntent(stored) };
  }

  resolvePaymentIntentOutcome(
    sessionId: string,
    paymentIntentId: string,
    body: unknown,
  ): PaymentIntentOutcome {
    const stored = this.intents.get(paymentIntentId);
    if (stored?.sessionId !== sessionId) {
      return {
        ok: false,
        problem: this.problem(
          404,
          'NOT_FOUND',
          'Payment intent not found',
          { paymentIntentId },
          [],
        ),
      };
    }
    if (!isRecord(body)) {
      return {
        ok: false,
        problem: this.problem(
          400,
          'INVALID_REQUEST',
          'outcome must be succeeded, declined or pending',
          {},
          [],
        ),
      };
    }
    const outcome = body['outcome'];
    if (outcome !== 'succeeded' && outcome !== 'declined' && outcome !== 'pending') {
      return {
        ok: false,
        problem: this.problem(
          400,
          'INVALID_REQUEST',
          'outcome must be succeeded, declined or pending',
          {},
          [],
        ),
      };
    }
    if (stored.status === 'succeeded' || stored.status === 'declined') {
      return {
        ok: false,
        problem: this.problem(
          409,
          'PAYMENT_ALREADY_RESOLVED',
          'The intent reached a terminal status and cannot be changed.',
          { status: stored.status },
          [],
        ),
      };
    }
    stored.status = outcome;
    return { ok: true, intent: this.toWireIntent(stored) };
  }

  createOrder(
    sessionId: string,
    idempotencyKey: string,
    ifMatch: string | null,
    body: unknown,
  ): OrderOutcome {
    if (
      idempotencyKey.length < IDEMPOTENCY_KEY_MIN ||
      idempotencyKey.length > IDEMPOTENCY_KEY_MAX
    ) {
      return {
        ok: false,
        problem: this.problem(
          400,
          'INVALID_REQUEST',
          'Idempotency-Key must be 8 to 100 characters',
          { received: idempotencyKey },
          [],
        ),
      };
    }

    const parsed = this.parseOrderRequest(body);
    if (!parsed.ok) return { ok: false, problem: parsed.problem };
    const orderRequest = parsed.request;

    const key = deriveIdempotencyKey('POST', '/orders', sessionId, idempotencyKey);
    const hash = hashPayload(orderRequest);
    const cached = this.idempotency.find(key, hash);
    if (cached !== null) {
      if (!isOrderReceipt(cached.body)) {
        throw new Error('[order-store] cached body for /orders is not an OrderReceipt');
      }
      return { ok: true, receipt: cached.body, replayed: true };
    }
    if (this.idempotency.hasConflictingPayload(key, hash)) {
      return {
        ok: false,
        problem: this.problem(
          409,
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was already used with a different request.',
          {},
          [],
        ),
      };
    }

    const readResult = this.checkout.read(sessionId);
    if (!readResult.ok) return { ok: false, problem: readResult.problem };
    const { cart, draft } = readResult;

    const versionCheck = this.checkIfMatch(ifMatch, cart.version);
    if (!versionCheck.ok) return { ok: false, problem: versionCheck.problem };

    const consent = this.checkConsent(orderRequest);
    if (!consent.ok) return { ok: false, problem: consent.problem };

    const completeness = this.checkCompleteness(cart, draft);
    if (!completeness.ok) return { ok: false, problem: completeness.problem };

    if (orderRequest.paymentMethod !== draft.payment?.method) {
      return {
        ok: false,
        problem: this.problem(
          422,
          'VALIDATION_FAILED',
          'The request payment method does not match the checkout draft',
          {
            draft: draft.payment?.method,
            requested: orderRequest.paymentMethod,
          },
          [{ path: '/paymentMethod', code: 'PAYMENT_METHOD_MISMATCH' }],
        ),
      };
    }

    if (orderRequest.paymentMethod === 'card') {
      const intentId = orderRequest.paymentIntentId;
      const stored = this.intents.get(intentId);
      if (stored?.sessionId !== sessionId) {
        return {
          ok: false,
          problem: this.problem(
            404,
            'NOT_FOUND',
            'Referenced payment intent not found',
            { paymentIntentId: intentId },
            [],
          ),
        };
      }
      if (stored.status === 'requires_action') {
        return {
          ok: false,
          problem: this.problem(
            422,
            'PAYMENT_REQUIRED',
            'The referenced payment intent still requires action from the shopper.',
            { paymentIntentId: intentId },
            [],
          ),
        };
      }
      if (stored.status === 'pending') {
        return {
          ok: false,
          problem: this.problem(
            422,
            'PAYMENT_PENDING',
            'The referenced payment intent has not reached a terminal status yet.',
            { paymentIntentId: intentId },
            [],
          ),
        };
      }
      if (stored.status === 'declined') {
        return {
          ok: false,
          problem: this.problem(
            422,
            'PAYMENT_DECLINED',
            'The referenced payment intent was declined. A new attempt needs a new idempotency key.',
            { paymentIntentId: intentId },
            [],
          ),
        };
      }
      if (this.usedIntentIds.has(intentId)) {
        return {
          ok: false,
          problem: this.problem(
            422,
            'PAYMENT_REQUIRED',
            'The referenced payment intent already backs an order; a new card order needs a new payment',
            { paymentIntentId: intentId, status: stored.status },
            [],
          ),
        };
      }
      const summaryTotal = readResult.session.summary.total;
      if (stored.amount.amount !== summaryTotal.amount) {
        return {
          ok: false,
          problem: this.problem(
            409,
            'PRICE_CHANGED',
            'Cart prices were updated; the shopper must review the new total.',
            { intentAmount: stored.amount.amount, total: summaryTotal.amount },
            [],
          ),
        };
      }
    }

    for (const item of cart.items) {
      if (item.availability === 'out_of_stock' || item.maxQuantity === 0) {
        return {
          ok: false,
          problem: this.problem(
            409,
            'OUT_OF_STOCK',
            'Stock ran out while the shopper was in checkout.',
            { variantId: item.variantId },
            [],
          ),
        };
      }
    }

    if (stockLostOnce(this.options, 'order')) {
      const last = cart.items.at(-1);
      if (last !== undefined) this.stock.take(last.variantId);
    }

    // `isTaken` is the only stock check the order commit needs: the cart's
    // view() (run by `checkout.read` above) already clamps every line's
    // quantity to the ledger's remaining, so `item.quantity` can never
    // exceed what `recordSale` is about to deduct. `remaining(...)` was
    // the wrong shape here — it expected the catalog's original maxQuantity
    // and double-subtracted `ledger.sold` when the cart item was added
    // after another order had already sold units of the same variant.
    for (const item of cart.items) {
      if (this.stock.isTaken(item.variantId)) {
        return {
          ok: false,
          problem: this.problem(
            409,
            'OUT_OF_STOCK',
            'Stock ran out while the shopper was in checkout.',
            { variantId: item.variantId },
            [],
          ),
        };
      }
    }

    const orderId = this.options.ids.uuid();
    const orderNumber = this.nextOrderNumber();
    const createdAt = this.options.clock.now();
    const summary = readResult.session.summary;
    const items: OrderLine[] = cart.items.map(toOrderLine);
    const complete = completeness.draft;
    const paymentMethod = complete.payment.method;
    const receipt: OrderReceipt = {
      id: orderId,
      orderNumber,
      createdAt,
      status: 'confirmed',
      items,
      subtotal: summary.subtotal,
      shippingFee: summary.shippingFee,
      paymentFee: summary.paymentFee,
      total: summary.total,
      paymentMethod,
      delivery: complete.delivery,
      billing: complete.billing,
      contactEmail: complete.contact.email,
      notice: SIMULATION_NOTICE,
    };
    this.orders.set(orderId, { receipt, sessionId });
    this.stock.recordSale(items);

    this.checkout.clearDraft(sessionId);
    // The intent stays readable, as on the backend; it only cannot back
    // a second order.
    if (orderRequest.paymentMethod === 'card') {
      this.usedIntentIds.add(orderRequest.paymentIntentId);
    }
    this.cart().resetForOrder(sessionId);
    this.idempotency.record(key, hash, { status: 201, body: receipt });

    return { ok: true, receipt };
  }

  getOrder(sessionId: string, orderId: string): OrderOutcome {
    const stored = this.orders.get(orderId);
    if (stored?.sessionId !== sessionId) {
      return {
        ok: false,
        problem: this.problem(404, 'NOT_FOUND', 'Order not found', { orderId }, []),
      };
    }
    return { ok: true, receipt: stored.receipt };
  }

  /**
   * Seeds the store's intents, orders and the used intent ids from a hydrated snapshot.
   * Called once at handler-construction time when
   * `options.snapshot.paymentIntents` or `options.snapshot.receipts`
   * is non-empty. Each record is stamped with `sessionId` so the
   * same session-scoped 404 checks (`stored?.sessionId !==
   * sessionId`) continue to gate cross-session access after reload.
   * The order-number counter is bumped past every restored receipt
   * so `nextOrderNumber()` cannot collide with one from before.
   */
  seedFromSnapshot(
    sessionId: string,
    persisted: {
      intents: readonly PaymentIntent[];
      receipts: readonly OrderReceipt[];
      usedIntentIds: readonly string[];
    },
  ): void {
    for (const intent of persisted.intents) {
      this.intents.set(intent.id, { ...intent, sessionId });
    }
    for (const receipt of persisted.receipts) {
      this.orders.set(receipt.id, { receipt, sessionId });
      const seq = parseOrderSequence(receipt.orderNumber);
      if (seq !== null) this.orderSequence = Math.max(this.orderSequence, seq);
    }
    for (const id of persisted.usedIntentIds) {
      this.usedIntentIds.add(id);
    }
  }

  /**
   * `true` when the session has a stored intent whose status is
   * `'requires_action'` and whose id is not yet used by an order.
   * `CheckoutStore.toPersistedDraft` answers with this so the
   * snapshot keeps the draft only while a card intent waits for
   * the payment page. The intent map is iterated directly because
   * the map's keys are intent ids, not session ids, and the per-
   * session read already happens on every intent check.
   */
  hasCardPaymentInFlight(sessionId: string): boolean {
    for (const [intentId, stored] of this.intents) {
      if (stored.sessionId === sessionId && stored.status === 'requires_action') {
        if (!this.usedIntentIds.has(intentId)) return true;
      }
    }
    return false;
  }

  /**
   * Returns the intents and receipts owned by the given session in
   * the shape `MockSnapshot` carries. Wire-shaped, with no
   * `sessionId` stamp (the snapshot is read back only in the same
   * tab, and the stamped `StoredIntent.sessionId` round-trips
   * through `seedFromSnapshot`).
   */
  toPersistedOrderState(sessionId: string): {
    intents: readonly PaymentIntent[];
    receipts: readonly OrderReceipt[];
    usedIntentIds: readonly string[];
  } {
    const intents: PaymentIntent[] = [];
    for (const s of this.intents.values()) {
      if (s.sessionId === sessionId) intents.push(this.toWireIntent(s));
    }
    const receipts: OrderReceipt[] = [];
    for (const s of this.orders.values()) {
      if (s.sessionId === sessionId) receipts.push(s.receipt);
    }
    const usedIntentIds: string[] = [];
    for (const id of this.usedIntentIds) {
      if (this.intents.get(id)?.sessionId === sessionId) usedIntentIds.push(id);
    }
    return { intents, receipts, usedIntentIds };
  }

  /** The idempotency cache for the snapshot; see `IdempotencyStore.toPersisted`. */
  toPersistedIdempotency(): readonly PersistedIdempotencyRecord[] {
    return this.idempotency.toPersisted();
  }

  /** Restores the idempotency cache a snapshot carried. */
  seedIdempotency(records: readonly PersistedIdempotencyRecord[]): void {
    this.idempotency.seedFromSnapshot(records);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers.
  // ---------------------------------------------------------------------------

  private toWireIntent(stored: StoredIntent): PaymentIntent {
    return {
      id: stored.id,
      amount: stored.amount,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      redirectUrl: stored.redirectUrl,
      returnUrl: stored.returnUrl,
      status: stored.status,
    };
  }

  private nextOrderNumber(): string {
    this.orderSequence += 1;
    return `DEMO-${this.orderSequence.toString().padStart(6, '0')}`;
  }

  private checkIfMatch(
    ifMatch: string | null,
    expected: number,
  ): { ok: true } | { ok: false; problem: Problem } {
    if (ifMatch !== `"${String(expected)}"`) {
      return {
        ok: false,
        problem: this.problem(
          412,
          'CART_VERSION_CONFLICT',
          'The cart changed since the version supplied in If-Match',
          { expected, received: ifMatch },
          [],
        ),
      };
    }
    return { ok: true };
  }

  private parseOrderRequest(
    body: unknown,
  ): { ok: true; request: OrderRequest } | { ok: false; problem: Problem } {
    if (!isRecord(body)) {
      return {
        ok: false,
        problem: this.problem(400, 'INVALID_REQUEST', 'Order request is malformed', {}, []),
      };
    }
    const paymentMethod = body['paymentMethod'];
    const termsVersion = body['termsVersion'];
    const acceptedTerms = body['acceptedTerms'];

    if (paymentMethod !== 'card' && paymentMethod !== 'cash_on_delivery') {
      return {
        ok: false,
        problem: this.problem(400, 'INVALID_REQUEST', 'Order request is malformed', {}, []),
      };
    }
    if (typeof termsVersion !== 'string') {
      return {
        ok: false,
        problem: this.problem(400, 'INVALID_REQUEST', 'Order request is malformed', {}, []),
      };
    }
    if (typeof acceptedTerms !== 'boolean') {
      return {
        ok: false,
        problem: this.problem(400, 'INVALID_REQUEST', 'Order request is malformed', {}, []),
      };
    }

    if (paymentMethod === 'card') {
      const paymentIntentId = body['paymentIntentId'];
      if (typeof paymentIntentId !== 'string' || paymentIntentId.length === 0) {
        return {
          ok: false,
          problem: this.problem(400, 'INVALID_REQUEST', 'Order request is malformed', {}, []),
        };
      }
      const request: CardOrderRequest = {
        acceptedTerms,
        paymentIntentId,
        paymentMethod: 'card',
        termsVersion,
      };
      return { ok: true, request };
    }
    const request: CashOnDeliveryOrderRequest = {
      acceptedTerms,
      paymentMethod: 'cash_on_delivery',
      termsVersion,
    };
    return { ok: true, request };
  }

  private checkConsent(request: OrderRequest): { ok: true } | { ok: false; problem: Problem } {
    const errors: FieldError[] = [];
    if (request.termsVersion !== TERMS_VERSION) {
      errors.push({ path: '/termsVersion', code: 'TERMS_VERSION_MISMATCH' });
    }
    if (!request.acceptedTerms) {
      errors.push({ path: '/acceptedTerms', code: 'TERMS_NOT_ACCEPTED' });
    }
    if (errors.length > 0) {
      return {
        ok: false,
        problem: this.problem(
          422,
          'VALIDATION_FAILED',
          'The terms must be accepted to place an order.',
          {},
          errors,
        ),
      };
    }
    return { ok: true };
  }

  private checkCompleteness(
    cart: Cart,
    draft: {
      contact?: Contact;
      billing?: BillingDetails;
      delivery?: DeliverySelection;
      payment?: PaymentSelection;
    },
  ): { ok: true; draft: CompleteDraft } | { ok: false; problem: Problem } {
    if (cart.items.length === 0) {
      return {
        ok: false,
        problem: this.problem(422, 'CHECKOUT_INCOMPLETE', 'The cart is empty.', {}, []),
      };
    }
    const { contact, billing, delivery, payment } = draft;
    const errors: FieldError[] = [];
    if (contact === undefined) errors.push({ path: '/contact', code: 'SECTION_MISSING' });
    if (billing === undefined) errors.push({ path: '/billing', code: 'SECTION_MISSING' });
    if (delivery === undefined) errors.push({ path: '/delivery', code: 'SECTION_MISSING' });
    if (payment === undefined) errors.push({ path: '/payment', code: 'SECTION_MISSING' });
    if (
      contact === undefined ||
      billing === undefined ||
      delivery === undefined ||
      payment === undefined
    ) {
      return {
        ok: false,
        problem: this.problem(
          422,
          'CHECKOUT_INCOMPLETE',
          'Contact, billing, delivery or payment is missing.',
          {},
          errors,
        ),
      };
    }
    return { ok: true, draft: { contact, billing, delivery, payment } };
  }

  private problem(
    status: number,
    code: ProblemCode,
    detail: string,
    params: Record<string, unknown>,
    fieldErrors: readonly FieldError[] = [],
  ): Problem {
    return checkoutProblem(this.options, status, code, detail, params, fieldErrors);
  }
}

function toOrderLine(item: {
  variantId: string;
  productName: string;
  colorName: string;
  storageGb: StorageGb;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
}): OrderLine {
  return {
    variantId: item.variantId,
    productName: item.productName,
    colorName: item.colorName,
    storageGb: item.storageGb,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  };
}

/** 'DEMO-000042' -> 42; else null. Keeps a reseeded store's
 * order-number counter ahead of every restored receipt so
 * `nextOrderNumber()` cannot collide with one from before reload. */
function parseOrderSequence(orderNumber: string): number | null {
  const m = /^DEMO-(\d+)$/.exec(orderNumber);
  return m !== null ? Number(m[1]) : null;
}
