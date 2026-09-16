/**
 * T09 — atomic order commit + shared payment / stock simulation.
 *
 * Owns the persistence + atomic-transition surface the order and
 * payment handlers depend on:
 *
 *   - `PaymentIntentStore` keeps the simulated payment intents and
 *     resolves the `payment-pending-resolves` scenario deterministically.
 *   - `StockTracker` keeps per-variant simulated stock, initialized
 *     lazily from `variant.maxQuantity` and decremented exactly once
 *     per successful order commit.
 *   - `OrderDomain` runs `createOrder` and `getOrder` with full
 *     consent / version / stock / expiry / idempotency validation,
 *     atomic decrement + cart-mark + receipt persistence, and
 *     privacy-minimized payload only.
 *
 * Atomicity guarantee: a successful commit decrements stock, marks
 * the cart ordered, persists the receipt AND records the idempotency
 * outcome as one indivisible step. A conflict returns no state
 * change. A replay returns the cached receipt before any state is
 * examined.
 *
 * Replay safety: the idempotency cache is consulted BEFORE cart
 * status / expiry / stock checks so a retry after a silent timeout
 * returns the original receipt rather than a duplicate order or
 * a fresh 409.
 */

import {
  deriveIdempotencyKey,
  hashPayload,
  type IdempotencyStore,
} from '../idempotency';
import {
  type CartLine,
  type Money,
  type Variant,
  Repository,
} from '../repository';
import type { Clock, Ids } from '../scenarios';
import {
  QUOTE_TTL_MS,
  type DeliveryOptionId,
  QuoteDomain,
} from '../checkout/quote-domain';

// ---------------------------------------------------------------------------
// Payment method + intent vocabulary (matches OpenAPI enums).
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS = ['demo_card', 'demo_cod'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type PaymentIntentStatus = 'succeeded' | 'declined' | 'pending';

/** Internal record kept by `PaymentIntentStore`; matches the wire shape plus internal validation fields. */
export interface PaymentIntentRecord {
  id: string;
  cartId: string;
  /** Cart version captured at intent creation; required to match the order commit. */
  cartVersion: number;
  quoteId: string;
  amount: Money;
  /** Session captured at intent creation; required to match the order commit. */
  sessionId: string;
  status: PaymentIntentStatus;
  isSimulation: true;
  createdAt: string;
}

/**
 * `payment-pending-resolves` flips from `pending` to `succeeded`
 * once at least this many ms have elapsed since intent creation.
 * 1 second matches the E2E spec: a 1 s poll interval eventually
 * sees a non-pending status.
 */
const PENDING_RESOLVE_MS = 1000;

// ---------------------------------------------------------------------------
// PaymentIntentStore — owned by `commit-order.ts` so the payment and order
// handlers share the same map without a circular module dependency.
// ---------------------------------------------------------------------------

export class PaymentIntentStore {
  private readonly intents = new Map<string, PaymentIntentRecord>();

  constructor(private readonly clock: Clock) {}

  /** Creates a new intent and stores it. The status is supplied by the caller. */
  create(
    input: Omit<PaymentIntentRecord, 'createdAt'>,
  ): PaymentIntentRecord {
    const record: PaymentIntentRecord = {
      ...input,
      createdAt: this.clock.now(),
    };
    this.intents.set(record.id, record);
    return record;
  }

  /** Looks up an intent by id without resolving pending state. */
  findRaw(id: string): PaymentIntentRecord | undefined {
    return this.intents.get(id);
  }

  /**
   * Looks up an intent and applies the deterministic pending →
   * succeeded transition for the `payment-pending-resolves` scenario.
   * Other scenarios return the raw status so `payment-declined` and
   * `payment-pending-timeout` keep their terminal states.
   */
  findById(id: string, scenarioName: string): PaymentIntentRecord | undefined {
    const record = this.intents.get(id);
    if (!record) return undefined;
    return this.applyPendingResolution(record, scenarioName);
  }

  /** Removes an intent (used after a successful commit). */
  clear(id: string): void {
    this.intents.delete(id);
  }

  /** Test-only: count of stored intents. */
  size(): number {
    return this.intents.size;
  }

  /** Test-only: drop every intent. */
  clearAll(): void {
    this.intents.clear();
  }

  private applyPendingResolution(
    record: PaymentIntentRecord,
    scenarioName: string,
  ): PaymentIntentRecord {
    if (scenarioName !== 'payment-pending-resolves') return record;
    if (record.status !== 'pending') return record;
    const createdMs = Date.parse(record.createdAt);
    const nowMs = Date.parse(this.clock.now());
    if (!Number.isFinite(createdMs) || !Number.isFinite(nowMs)) return record;
    if (nowMs - createdMs < PENDING_RESOLVE_MS) return record;
    const resolved: PaymentIntentRecord = { ...record, status: 'succeeded' };
    this.intents.set(record.id, resolved);
    return resolved;
  }
}

// ---------------------------------------------------------------------------
// StockTracker — initialized lazily from `variant.maxQuantity` and decremented
// exactly once per successful order commit.
// ---------------------------------------------------------------------------

export class StockTracker {
  private readonly stocks = new Map<string, number>();

  constructor(private readonly repository: Repository) {}

  /** Returns the remaining simulated stock for `variantId`, defaulting to 0. */
  get(variantId: string): number {
    this.ensureInitialized();
    return this.stocks.get(variantId) ?? 0;
  }

  /**
   * Returns the cart lines that exceed the remaining stock. Each
   * entry has the requested quantity plus the available stock so the
   * handler can surface a precise problem detail.
   */
  findShortages(lines: readonly CartLine[]): { variantId: string; available: number; requested: number }[] {
    this.ensureInitialized();
    const shortages: { variantId: string; available: number; requested: number }[] = [];
    for (const line of lines) {
      const available = this.stocks.get(line.variantId) ?? 0;
      if (available < line.quantity) {
        shortages.push({ variantId: line.variantId, available, requested: line.quantity });
      }
    }
    return shortages;
  }

  /** Atomically decrements stock by the line quantities. Caller must have verified stock first. */
  decrement(lines: readonly CartLine[]): void {
    this.ensureInitialized();
    for (const line of lines) {
      const current = this.stocks.get(line.variantId) ?? 0;
      this.stocks.set(line.variantId, current - line.quantity);
    }
  }

  /** Test-only: explicitly seed the stock for `variantId`. */
  set(variantId: string, value: number): void {
    this.stocks.set(variantId, value);
  }

  /** Test-only: reload stock from the catalogue (used when fixtures change). */
  reload(): void {
    this.stocks.clear();
    this.ensureInitialized();
  }

  private ensureInitialized(): void {
    if (this.stocks.size > 0) return;
    for (const product of this.repository.listProducts()) {
      for (const variant of product.variants) {
        if (!this.stocks.has(variant.id)) {
          this.stocks.set(variant.id, variant.maxQuantity);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Order wire types — match OpenAPI `OrderReceipt` / `OrderLine`.
// ---------------------------------------------------------------------------

export interface OrderLineSnapshot {
  productName: string;
  variantId: string;
  colorName: string;
  storageGb: number;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
}

export interface OrderReceipt {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: 'demo_confirmed';
  isSimulation: true;
  items: readonly OrderLineSnapshot[];
  subtotal: Money;
  shipping: Money;
  total: Money;
  paymentMethod: PaymentMethod;
  deliveryOptionId: DeliveryOptionId;
  notice: string;
}

const SIMULATION_NOTICE =
  'A demórendelés elkészült. Nem történt valódi fizetés, rendelésküldés vagy e-mail-küldés.';

// ---------------------------------------------------------------------------
// OrderDomain inputs / problems / result.
// ---------------------------------------------------------------------------

export interface CreateOrderInput {
  sessionId: string;
  idempotencyKey: string;
  cartId: string;
  quoteId: string;
  paymentIntentId?: string | null;
  termsVersion: string;
  acceptedTerms: boolean;
  acknowledgedSimulation: boolean;
}

export interface GetOrderInput {
  sessionId: string;
  orderId: string;
}

export type OrderProblemCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CART_EXPIRED'
  | 'QUOTE_EXPIRED'
  | 'OUT_OF_STOCK'
  | 'PRICE_CHANGED'
  | 'PAYMENT_DECLINED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_REQUIRED'
  | 'CHECKOUT_INCOMPLETE'
  | 'IDEMPOTENCY_CONFLICT';

export interface OrderFieldError {
  path: string;
  message: string;
}

export interface OrderProblem {
  status: 400 | 404 | 409 | 410 | 422;
  code: OrderProblemCode;
  detail: string;
  fieldErrors: OrderFieldError[];
}

export type OrderResult<T> =
  | { ok: true; value: T }
  | { ok: false; problem: OrderProblem };

// ---------------------------------------------------------------------------
// OrderDomain — the atomic commit orchestrator.
// ---------------------------------------------------------------------------

export class OrderDomain {
  constructor(
    private readonly repository: Repository,
    private readonly clock: Clock,
    private readonly ids: Ids,
    private readonly idempotency: IdempotencyStore,
    private readonly paymentIntents: PaymentIntentStore,
    private readonly stocks: StockTracker,
    private readonly quoteDomain: QuoteDomain,
    private readonly scenarioName: string,
  ) {}

  /** POST /orders — atomic commit. */
  createOrder(input: CreateOrderInput): OrderResult<OrderReceipt> {
    // 1. Header validation
    const session = validateSession(input.sessionId);
    if (!session.ok) return session;
    const idemKeyCheck = validateIdempotencyKey(input.idempotencyKey);
    if (!idemKeyCheck.ok) return idemKeyCheck;

    // 2. Idempotency key derivation + payload hash
    const idemKey = deriveIdempotencyKey('POST', '/orders', input.sessionId, input.idempotencyKey);
    const payloadHash = hashPayload({
      cartId: input.cartId,
      quoteId: input.quoteId,
      paymentIntentId: input.paymentIntentId ?? null,
      termsVersion: input.termsVersion,
      acceptedTerms: input.acceptedTerms,
      acknowledgedSimulation: input.acknowledgedSimulation,
    });

    // 3. Replay BEFORE cart status / expiry / stock checks
    const replay = this.idempotency.find(idemKey, payloadHash);
    if (replay) return ok(replay.body as OrderReceipt);
    if (this.idempotency.hasConflictingPayload(idemKey, payloadHash)) {
      return err(idempotencyConflict());
    }

    // 4. Cart lookup
    const cart = this.repository.getCart(input.cartId);
    if (!cart || cart.sessionId !== input.sessionId) {
      return err(notFound('A kosár nem található.'));
    }
    if (this.quoteDomain.isExpired(cart)) {
      return err(cartExpired());
    }
    if (cart.status !== 'active') {
      return err(notFound('A kosár már lezárult.'));
    }
    if (cart.items.length === 0) {
      return err(checkoutIncomplete('A kosár üres.', [
        { path: '/cart', message: 'A kosár jelenleg üres.' },
      ]));
    }

    // 5. Consent + simulation acknowledgement
    const consent = this.validateConsent(input);
    if (!consent.ok) return consent;

    // 6. Draft must declare a payment method (it carries the source of truth for demo_card vs demo_cod).
    const draft = this.quoteDomain.getSession(input.cartId, cart.version).draft;
    const method = draft.paymentMethod;
    if (method !== 'demo_card' && method !== 'demo_cod') {
      return err(checkoutIncomplete('A fizetési mód hiányzik.', [
        { path: '/paymentMethod', message: 'A fizetési mód kiválasztása kötelező.' },
      ]));
    }

    // 7. Quote lookup — must be unexpired, must reference this cart/version
    const quote = this.quoteDomain.getActiveQuote(input.cartId, cart.version);
    if (!quote) {
      return err(quoteExpired());
    }
    if (quote.id !== input.quoteId) {
      return err(quoteExpired());
    }
    if (quote.cartVersion !== cart.version) {
      return err(priceChanged());
    }

    // 8. demo_card requires succeeded matching intent; demo_cod forbids one
    if (method === 'demo_card') {
      if (!input.paymentIntentId) {
        return err(paymentRequired());
      }
      const intent = this.paymentIntents.findById(input.paymentIntentId, this.scenarioName);
      if (!intent) {
        return err(notFound('A fizetési szándék nem található.'));
      }
      if (intent.status === 'pending') {
        return err(paymentPending());
      }
      if (intent.status === 'declined') {
        return err(paymentDeclined());
      }
      const intentMatches = validateIntentMatch(intent, {
        sessionId: input.sessionId,
        cartId: input.cartId,
        cartVersion: cart.version,
        quoteId: input.quoteId,
        amount: quote.total,
      });
      if (!intentMatches.ok) return intentMatches;
    } else {
      if (input.paymentIntentId !== null && input.paymentIntentId !== undefined) {
        return err(validationFailed('A demo_cod fizetési módhoz nem adható meg paymentIntentId.', [
          { path: '/paymentIntentId', message: 'A paymentIntentId mező tiltott demo_cod fizetési módnál.' },
        ]));
      }
    }

    // 9. Delivery option must be set
    if (!draft.delivery) {
      return err(checkoutIncomplete('A szállítási mód hiányzik.', [
        { path: '/delivery', message: 'A szállítási mód kiválasztása kötelező.' },
      ]));
    }
    const deliveryOptionId: DeliveryOptionId = draft.delivery.optionId;

    // 10. Stock recheck
    const shortages = this.stocks.findShortages(cart.items);
    if (shortages.length > 0) {
      return err(outOfStock(shortages));
    }

    // 11. ATOMIC COMMIT
    this.stocks.decrement(cart.items);
    const orderId = this.ids.uuid();
    const orderNumber = this.repository.nextOrderNumber();
    const createdAt = this.clock.now();
    const items = cart.items.map((line) => buildOrderLine(line));
    const subtotal: Money = sumMoney(items.map((line) => line.lineTotal));
    const shipping: Money = quote.shipping;
    const total: Money = {
      amount: subtotal.amount + shipping.amount,
      currency: 'HUF',
    };
    const receipt: OrderReceipt = {
      id: orderId,
      orderNumber,
      createdAt,
      status: 'demo_confirmed',
      isSimulation: true,
      items,
      subtotal,
      shipping,
      total,
      paymentMethod: method,
      deliveryOptionId,
      notice: SIMULATION_NOTICE,
    };

    // Persist receipt
    this.repository.saveOrder({ ...receipt, sessionId: input.sessionId });

    // Mark cart ordered
    this.repository.updateCart({ ...cart, status: 'ordered' });

    // Clear volatile draft + payment intent
    this.quoteDomain.clearDraft(input.cartId);
    if (input.paymentIntentId) {
      this.paymentIntents.clear(input.paymentIntentId);
    }

    // Record idempotency outcome LAST so a partial failure before this
    // point still allows the retry path to redo the full commit.
    this.idempotency.record(idemKey, payloadHash, { status: 201, body: receipt });
    return ok(receipt);
  }

  /** GET /orders/{orderId} — read a persisted receipt. */
  getOrder(input: GetOrderInput): OrderResult<OrderReceipt> {
    const session = validateSession(input.sessionId);
    if (!session.ok) return session;
    const stored = this.repository.getOrder(input.orderId);
    if (!stored) return err(notFound('A rendelés nem található.'));
    return ok(stripSession(stored as unknown as { sessionId?: string } & Record<string, unknown>));
  }

  // -------------------------------------------------------------------------
  // Consent validation — `termsVersion` / `acceptedTerms` / `acknowledgedSimulation`.
  // -------------------------------------------------------------------------

  private validateConsent(input: CreateOrderInput): OrderResult<true> {
    const fieldErrors: OrderFieldError[] = [];
    if (input.termsVersion !== 'demo-1') {
      fieldErrors.push({
        path: '/termsVersion',
        message: 'A demo feltételek verziója nem egyezik a szerver által elfogadottal.',
      });
    }
    if (input.acceptedTerms !== true) {
      fieldErrors.push({
        path: '/acceptedTerms',
        message: 'A demo feltételek elfogadása kötelező.',
      });
    }
    if (input.acknowledgedSimulation !== true) {
      fieldErrors.push({
        path: '/acknowledgedSimulation',
        message: 'A szimuláció tudomásulvétele kötelező.',
      });
    }
    if (fieldErrors.length > 0) {
      return err(validationFailed('A megerősítés hiányos.', fieldErrors));
    }
    return ok(true);
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

interface IntentMatch {
  sessionId: string;
  cartId: string;
  cartVersion: number;
  quoteId: string;
  amount: Money;
}

function validateIntentMatch(
  intent: PaymentIntentRecord,
  match: IntentMatch,
): OrderResult<true> {
  if (intent.sessionId !== match.sessionId) {
    return err(notFound('A fizetési szándék nem tartozik ehhez a munkamenethez.'));
  }
  if (intent.cartId !== match.cartId) {
    return err(notFound('A fizetési szándék nem tartozik ehhez a kosárhoz.'));
  }
  if (intent.cartVersion !== match.cartVersion) {
    return err(paymentRequired());
  }
  if (intent.quoteId !== match.quoteId) {
    return err(quoteExpired());
  }
  if (intent.amount.amount !== match.amount.amount) {
    return err(priceChanged());
  }
  return ok(true);
}

function buildOrderLine(line: CartLine): OrderLineSnapshot {
  return {
    productName: line.productName,
    variantId: line.variantId,
    colorName: line.colorName,
    storageGb: line.storageGb,
    quantity: line.quantity,
    unitPrice: { amount: line.unitPrice.amount, currency: 'HUF' },
    lineTotal: { amount: line.lineTotal.amount, currency: 'HUF' },
  };
}

function sumMoney(items: readonly Money[]): Money {
  let amount = 0;
  for (const item of items) amount += item.amount;
  return { amount, currency: 'HUF' };
}

/** Drops the internal sessionId before returning the receipt to a caller. */
function stripSession(stored: { sessionId?: string } & Record<string, unknown>): OrderReceipt {
  const { sessionId: _sessionId, ...rest } = stored;
  void _sessionId;
  return rest as unknown as OrderReceipt;
}

// ---------------------------------------------------------------------------
// Header validation — mirrors the cart / checkout rules so the order mock
// rejects the same malformed session ids.
// ---------------------------------------------------------------------------

const SESSION_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const IDEMPOTENCY_MIN = 8;
const IDEMPOTENCY_MAX = 100;

function validateSession(sessionId: string): OrderResult<string> {
  if (!SESSION_PATTERN.test(sessionId)) {
    return err({
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'Érvénytelen X-Demo-Session fejléc.',
      fieldErrors: [
        { path: '/X-Demo-Session', message: 'A fejléc 8–80 alfanumerikus karakter lehet.' },
      ],
    });
  }
  return ok(sessionId);
}

function validateIdempotencyKey(key: string): OrderResult<string> {
  if (key.length < IDEMPOTENCY_MIN || key.length > IDEMPOTENCY_MAX) {
    return err({
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'Érvénytelen Idempotency-Key hossz.',
      fieldErrors: [
        {
          path: '/Idempotency-Key',
          message: `Az Idempotency-Key hossza ${IDEMPOTENCY_MIN} és ${IDEMPOTENCY_MAX} karakter közé eshet.`,
        },
      ],
    });
  }
  return ok(key);
}

// ---------------------------------------------------------------------------
// Result helpers + problem factories
// ---------------------------------------------------------------------------

function ok<T>(value: T): OrderResult<T> {
  return { ok: true, value };
}

function err(problem: OrderProblem): OrderResult<never> {
  return { ok: false, problem };
}

export function notFound(detail: string): OrderProblem {
  return { status: 404, code: 'NOT_FOUND', detail, fieldErrors: [] };
}

export function cartExpired(): OrderProblem {
  return { status: 410, code: 'CART_EXPIRED', detail: 'A kosár lejárt.', fieldErrors: [] };
}

export function quoteExpired(): OrderProblem {
  return { status: 409, code: 'QUOTE_EXPIRED', detail: 'Az árajánlat lejárt vagy érvénytelen.', fieldErrors: [] };
}

export function outOfStock(shortages: readonly { variantId: string; available: number; requested: number }[]): OrderProblem {
  const detail = shortages.length === 1
    ? `A(z) ${shortages[0]!.variantId} változatból már csak ${shortages[0]!.available} darab elérhető.`
    : 'Egy vagy több változatból nincs elegendő készlet.';
  return {
    status: 409,
    code: 'OUT_OF_STOCK',
    detail,
    fieldErrors: shortages.map((s) => ({
      path: `/items/${s.variantId}`,
      message: `A kért ${s.requested} darab helyett csak ${s.available} áll rendelkezésre.`,
    })),
  };
}

export function priceChanged(): OrderProblem {
  return {
    status: 409,
    code: 'PRICE_CHANGED',
    detail: 'Az árajánlat elavult: az ár vagy a készlet megváltozott. Kérj új árajánlatot!',
    fieldErrors: [],
  };
}

export function paymentRequired(): OrderProblem {
  return {
    status: 409,
    code: 'PAYMENT_REQUIRED',
    detail: 'A demo_card fizetéshez érvényes, sikeres fizetési szándék szükséges.',
    fieldErrors: [],
  };
}

export function paymentDeclined(): OrderProblem {
  return {
    status: 409,
    code: 'PAYMENT_DECLINED',
    detail: 'A szimulált fizetés elutasítva. Új fizetési szándékot kell létrehozni.',
    fieldErrors: [],
  };
}

export function paymentPending(): OrderProblem {
  return {
    status: 409,
    code: 'PAYMENT_PENDING',
    detail: 'A szimulált fizetés még feldolgozás alatt. Várj, vagy szavazd le új szándékkal.',
    fieldErrors: [],
  };
}

export function checkoutIncomplete(detail: string, fieldErrors: OrderFieldError[]): OrderProblem {
  return { status: 422, code: 'CHECKOUT_INCOMPLETE', detail, fieldErrors };
}

export function idempotencyConflict(): OrderProblem {
  return {
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
    detail: 'Az idempotencia kulcs már más kéréssel lett rögzítve.',
    fieldErrors: [],
  };
}

export function validationFailed(detail: string, fieldErrors: OrderFieldError[]): OrderProblem {
  return { status: 400, code: 'VALIDATION_FAILED', detail, fieldErrors };
}

// ---------------------------------------------------------------------------
// Public read-only exports — keep `QUOTE_TTL_MS` / `Variant` available to
// callers without re-importing the entire repository tree.
// ---------------------------------------------------------------------------

export { QUOTE_TTL_MS };
export type { Variant };

// ---------------------------------------------------------------------------
// Shared stores — payment + order handlers need the same `PaymentIntentStore`
// and `QuoteDomain` instances to see each other's state. The lookup is
// keyed by Repository identity (WeakMap) so two scenarios with two
// repositories cannot leak state into each other. The function is
// idempotent: the first caller initializes, subsequent callers reuse.
// ---------------------------------------------------------------------------

export interface SharedStores {
  paymentIntents: PaymentIntentStore;
  quoteDomain: QuoteDomain;
  stocks: StockTracker;
}

const sharedStoresByRepository = new WeakMap<Repository, SharedStores>();

export function getSharedStores(
  repository: Repository,
  clock: Clock,
  ids: Ids,
  idempotencyForQuotes: IdempotencyStore,
): SharedStores {
  const existing = sharedStoresByRepository.get(repository);
  if (existing) return existing;
  const created: SharedStores = {
    paymentIntents: new PaymentIntentStore(clock),
    quoteDomain: new QuoteDomain(repository, clock, ids, idempotencyForQuotes),
    stocks: new StockTracker(repository),
  };
  sharedStoresByRepository.set(repository, created);
  return created;
}
