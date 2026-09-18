/**
 * T08 — checkout draft, shipping and quote domain.
 *
 * Owns every checkout-draft mutation (`updateDraft`) plus the quote
 * lifecycle (`createQuote`, `getActiveQuote`). T08's invariants:
 *
 *   - Draft sections merge only the supplied keys; absent sections
 *     keep their prior value. Field-level errors surface as 422
 *     VALIDATION_ERROR with JSON-pointer paths and never erase data
 *     that was previously merged.
 *   - Contact details normalize consistently (trim, NFC, case-fold
 *     email, +36 phone) so re-submitting the same form does not
 *     produce a different stored state.
 *   - Shipping fee is sourced from the static CHECKOUT_OPTIONS — the
 *     client never sets it. Home delivery is 1990 HUF, virtual pickup
 *     is 0 HUF. Total = subtotal + shipping in whole HUF.
 *   - Quotes live exactly 5 mock-clock minutes. Stale-cart and
 *     draft-update paths invalidate by erasing the cached quote so a
 *     subsequent createQuote emits a fresh `quoteId`/`expiresAt`.
 *   - When a catalogue price diverges from a cart-line snapshot,
 *     the mock atomically rewrites the affected line, bumps cart
 *     version by exactly one and returns 409 PRICE_CHANGED. The
 *     distinct codes (PRICE_CHANGED vs. QUOTE_EXPIRED vs.
 *     OUT_OF_STOCK) ensure the UI can branch correctly.
 *
 * The domain is HTTP-free. The handler layer is responsible for
 * parsing headers, mapping the result back to MSW responses and
 * emitting any 400 problems before this module runs.
 */

import {
  deriveIdempotencyKey,
  hashPayload,
  type IdempotencyStore,
} from '../idempotency';
import type { Cart, CartLine, Money } from '../repository';
import { Repository } from '../repository';
import type { Clock, Ids } from '../scenarios';
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

/** Quote lives exactly 5 mock-clock minutes from creation. */
export const QUOTE_TTL_MS = 5 * 60 * 1000;

/** Allowed payment methods (matches OpenAPI `paymentMethod` enum). */
type PaymentMethod = 'demo_card' | 'demo_cod';

/** Allowed delivery option ids (matches OpenAPI `optionId` enum). */
export type DeliveryOptionId = 'home_delivery' | 'demo_pickup';

/** Issue codes used by the mock domain; mirrors `ProblemCode`. */
export type ProblemCode =
  | 'VALIDATION_FAILED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CART_EXPIRED'
  | 'CART_VERSION_CONFLICT'
  | 'OUT_OF_STOCK'
  | 'PRICE_CHANGED'
  | 'QUOTE_EXPIRED'
  | 'CHECKOUT_INCOMPLETE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'QUOTE_INVALIDATED';

export interface FieldError { path: string; message: string }

export interface Problem {
  status: 400 | 404 | 409 | 410 | 422;
  code: ProblemCode;
  detail: string;
  fieldErrors: FieldError[];
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; problem: Problem };

/** Normalized contact section the draft retains. */
export interface NormalizedContact {
  fullName: string;
  email: string;
  phone: string;
}

/** Normalized address section the draft retains (HU only). */
export interface NormalizedAddress {
  countryCode: 'HU';
  postalCode: string;
  city: string;
  line1: string;
  line2?: string;
}

/** Normalized delivery section the draft retains. */
export interface NormalizedDelivery {
  optionId: DeliveryOptionId;
  address?: NormalizedAddress;
}

/** Volatile per-cart draft — contact / delivery / paymentMethod. */
export interface CheckoutDraft {
  contact?: NormalizedContact;
  delivery?: NormalizedDelivery;
  paymentMethod?: PaymentMethod;
}

/** Wire `Quote` body (per OpenAPI). */
export interface QuoteSnapshot {
  id: string;
  cartId: string;
  cartVersion: number;
  subtotal: Money;
  shipping: Money;
  total: Money;
  expiresAt: string;
}

/** Returned by `getSession` — draft + optional active quote. */
export interface CheckoutSessionSnapshot {
  cartId: string;
  cartVersion: number;
  draft: CheckoutDraft;
  quote?: QuoteSnapshot;
}

/** Lightweight session/rules/helpers shared with the handler layer. */
export const HeaderRules = {
  sessionPattern: /^[a-zA-Z0-9_-]{8,80}$/,
  ifMatchPattern: /^"[0-9]+"$/,
  idempotencyMin: 8,
  idempotencyMax: 100,
};

// ---------------------------------------------------------------------------
// Body readers — pure JSON-shape checks lifted out of the domain so the
// handler layer can apply them too.
// ---------------------------------------------------------------------------

function readField(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}

/** Returns the normalized HU address from an untrusted record, or null when invalid. */

function validateAddress(value: unknown): {
  ok: true; value: NormalizedAddress;
} | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  if (!value || typeof value !== 'object') {
    return { ok: false, errors: [{ path: '/delivery/address', message: 'A cím szükséges.' }] };
  }
  const record = value as Record<string, unknown>;
  const countryCode = normalizeAddressCountryCode(record['countryCode']);
  if (countryCode === null) {
    errors.push({
      path: '/delivery/address/countryCode',
      message: 'Csak HU cím támogatott.',
    });
  }
  const postalCode = normalizeAddressPostalCode(record['postalCode']);
  if (postalCode === null) {
    errors.push({
      path: '/delivery/address/postalCode',
      message: 'Az irányítószám formátuma 1-9 kezdetű négyjegyű szám.',
    });
  }
  const city = normalizeAddressCity(record['city']);
  if (city === null) {
    errors.push({
      path: '/delivery/address/city',
      message: 'A település 2 és 80 karakter közé eshet.',
    });
  }
  const line1 = normalizeAddressLine1(record['line1']);
  if (line1 === null) {
    errors.push({
      path: '/delivery/address/line1',
      message: 'A cím első sora 3 és 120 karakter közé eshet.',
    });
  }
  const line2Raw = normalizeAddressLine2(record['line2']);
  let line2: string | undefined;
  if (line2Raw === null) {
    errors.push({
      path: '/delivery/address/line2',
      message: 'A cím második sora legfeljebb 120 karakter lehet.',
    });
  } else {
    line2 = line2Raw;
  }
  if (errors.length > 0 || postalCode === null || city === null || line1 === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      countryCode: 'HU',
      postalCode,
      city,
      line1,
      line2,
    },
  };
}

function validateContact(value: unknown): {
  ok: true; value: NormalizedContact;
} | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  if (!value || typeof value !== 'object') {
    return { ok: false, errors: [{ path: '/contact', message: 'A kapcsolat szükséges.' }] };
  }
  const record = value as Record<string, unknown>;
  const fullName = normalizeContactFullName(record['fullName']);
  if (fullName === null) {
    errors.push({
      path: '/contact/fullName',
      message: 'A név 2 és 100 karakter közé eshet.',
    });
  }
  const email = normalizeContactEmail(record['email']);
  if (email === null) {
    errors.push({
      path: '/contact/email',
      message: 'Érvénytelen e-mail cím.',
    });
  }
  const phone = normalizeContactPhone(record['phone']);
  if (phone === null) {
    errors.push({
      path: '/contact/phone',
      message: 'A telefonszám +36 prefixumú, 8-9 számjegy.',
    });
  }
  if (errors.length > 0 || fullName === null || email === null || phone === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      fullName,
      email,
      phone,
    },
  };
}

function validateDelivery(value: unknown): {
  ok: true; value: NormalizedDelivery;
} | { ok: false; errors: FieldError[] } {
  if (!value || typeof value !== 'object') {
    return {
      ok: false,
      errors: [{ path: '/delivery', message: 'A szállítási mód szükséges.' }],
    };
  }
  const record = value as Record<string, unknown>;
  const optionId = record['optionId'];
  if (optionId !== 'home_delivery' && optionId !== 'demo_pickup') {
    return {
      ok: false,
      errors: [{ path: '/delivery/optionId', message: 'Ismeretlen szállítási mód.' }],
    };
  }
  const hasAddressKey = Object.prototype.hasOwnProperty.call(record, 'address');
  const addressRaw = record['address'];
  if (optionId === 'home_delivery') {
    if (addressRaw === undefined || addressRaw === null) {
      return {
        ok: false,
        errors: [{ path: '/delivery/address', message: 'Házhoz szállításhoz cím szükséges.' }],
      };
    }
    const address = validateAddress(addressRaw);
    if (!address.ok) return address;
    return { ok: true, value: { optionId: 'home_delivery', address: address.value } };
  }
  // demo_pickup
  if (hasAddressKey && addressRaw !== undefined && addressRaw !== null) {
    return {
      ok: false,
      errors: [{ path: '/delivery', message: 'Átvételnél nem adható meg cím.' }],
    };
  }
  return { ok: true, value: { optionId: 'demo_pickup' } };
}

function validatePaymentMethod(value: unknown): {
  ok: true; value: PaymentMethod;
} | { ok: false; errors: FieldError[] } {
  if (value === 'demo_card' || value === 'demo_cod') {
    return { ok: true, value };
  }
  return {
    ok: false,
    errors: [{ path: '/paymentMethod', message: 'Ismeretlen fizetési mód.' }],
  };
}

// ---------------------------------------------------------------------------
// Shipping — the canonical fee schedule lifted straight from
// `checkout-options.json`. The mock ignores any client-supplied amount;
// the domain recomputes the value from this table on every quote.
// ---------------------------------------------------------------------------

export const SHIPPING_FEE: Record<DeliveryOptionId, Money> = {
  home_delivery: { amount: 1990, currency: 'HUF' },
  demo_pickup: { amount: 0, currency: 'HUF' },
};

// ---------------------------------------------------------------------------
// Quote-domain entrypoint.
// ---------------------------------------------------------------------------

export interface UpdateDraftInput {
  sessionId: string;
  cartId: string;
  cartVersion: number | null;
  idempotencyKey: string | null;
  body: { contact?: unknown; delivery?: unknown; paymentMethod?: unknown };
}

export interface CreateQuoteInput {
  sessionId: string;
  cartId: string;
  cartVersion: number | null;
  idempotencyKey: string | null;
}

interface QuoteRecord {
  quote: QuoteSnapshot;
}

interface DraftRecord {
  draft: CheckoutDraft;
}

export class QuoteDomain {
  private readonly drafts = new Map<string, DraftRecord>();
  private readonly quotes = new Map<string, QuoteRecord>();

  constructor(
    private readonly repository: Repository,
    private readonly clock: Clock,
    private readonly ids: Ids,
    private readonly idempotency: IdempotencyStore,
  ) {}

  /** Reads the (volatile) session shape used by `getCheckoutSession`. */
  getSession(cartId: string, currentCartVersion: number): CheckoutSessionSnapshot {
    const draft = this.drafts.get(cartId)?.draft ?? {};
    const quote = this.getActiveQuote(cartId, currentCartVersion) ?? undefined;
    return { cartId, cartVersion: currentCartVersion, draft, quote };
  }

  /**
   * T09 — read the draft for `cartId` without touching the quote cache.
   * `getSession` calls `getActiveQuote` which deletes a quote whose
   * cartVersion does not match the supplied one. The payment handler
   * does not have the cart version yet at draft-lookup time, so it
   * uses this dedicated accessor to avoid the side-effect.
   */
  getDraft(cartId: string): CheckoutDraft {
    return this.drafts.get(cartId)?.draft ?? {};
  }

  /**
   * Returns the stored quote for `cartId` only when its cart version
   * matches the supplied one and the TTL has not expired. Stale or
   * expired entries are removed so memory does not leak across
   * idempotent replays.
   */
  getActiveQuote(cartId: string, currentCartVersion: number): QuoteSnapshot | null {
    const record = this.quotes.get(cartId);
    if (!record) return null;
    if (record.quote.cartVersion !== currentCartVersion) {
      this.quotes.delete(cartId);
      return null;
    }
    if (this.isExpiredRecord(record.quote)) {
      this.quotes.delete(cartId);
      return null;
    }
    return record.quote;
  }

  /** Used by the handler layer to invalidate after successful cart mutations
   *  that the domain itself did not trigger (kept for symmetry / future tests). */
  invalidateQuote(cartId: string): void {
    this.quotes.delete(cartId);
  }

  /** T09 — drop the volatile draft after a successful order commit so
   *  reload cannot recover contact/address. The cart is already marked
   *  ordered by the repository; clearing the draft is the second half
   *  of the "clear volatile PII" promise.
   */
  clearDraft(cartId: string): void {
    this.drafts.delete(cartId);
  }

  // -------------------------------------------------------------------------
  // updateDraft — merge supplied sections, persist, invalidate the quote.
  // -------------------------------------------------------------------------

  updateDraft(input: UpdateDraftInput): Result<CheckoutSessionSnapshot> {
    const session = validateSession(input.sessionId);
    if (!session.ok) return session;
    const ifMatch = validateIfMatch(input.cartVersion);
    if (!ifMatch.ok) return ifMatch;
    const key = validateIdempotencyKey(input.idempotencyKey);
    if (!key.ok) return key;

    const path = `/checkout/${input.cartId}`;
    const idemKey = deriveIdempotencyKey('PUT', path, input.sessionId, key.value);
    const payloadHash = hashPayload(input.body);

    const replay = this.idempotency.find(idemKey, payloadHash);
    if (replay) return ok(replay.body as CheckoutSessionSnapshot);
    if (this.idempotency.hasConflictingPayload(idemKey, payloadHash)) {
      return err(idempotencyConflict());
    }

    const cart = this.repository.getCart(input.cartId);
    if (cart?.sessionId !== input.sessionId) {
      return err(notFound());
    }
    if (this.isExpired(cart)) {
      return err(cartExpired());
    }
    if (cart.version !== ifMatch.value) {
      return err(versionConflict());
    }

    const body = input.body;
    const ALLOWED_SECTIONS = new Set(['contact', 'delivery', 'paymentMethod']);
    const presentSections: string[] = [];
    const unknownKeys: string[] = [];
    for (const key of Object.keys(body)) {
      if (ALLOWED_SECTIONS.has(key)) {
        presentSections.push(key);
      } else {
        unknownKeys.push(key);
      }
    }
    if (unknownKeys.length > 0) {
      return err({
        status: 400,
        code: 'VALIDATION_FAILED',
        detail: 'A kérés ismeretlen mezőt tartalmaz.',
        fieldErrors: unknownKeys.map((key) => ({
          path: `/${key}`,
          message: 'Ez a mező nem része a kérés tervének.',
        })),
      });
    }
    if (presentSections.length === 0) {
      return err({
        status: 422,
        code: 'VALIDATION_ERROR',
        detail: 'A kérésnek legalább egy szekciót tartalmaznia kell.',
        fieldErrors: [
          { path: '', message: 'Adj meg legalább egy szekciót: contact, delivery, paymentMethod.' },
        ],
      });
    }

    const fieldErrors: FieldError[] = [];
    let nextContact: NormalizedContact | undefined;
    let nextDelivery: NormalizedDelivery | undefined;
    let nextPaymentMethod: PaymentMethod | undefined;

    if (presentSections.includes('contact')) {
      const result = validateContact(readField(body, 'contact'));
      if (!result.ok) {
        fieldErrors.push(...result.errors);
      } else {
        nextContact = result.value;
      }
    }

    if (presentSections.includes('delivery')) {
      const result = validateDelivery(readField(body, 'delivery'));
      if (!result.ok) {
        fieldErrors.push(...result.errors);
      } else {
        nextDelivery = result.value;
      }
    }

    if (presentSections.includes('paymentMethod')) {
      const result = validatePaymentMethod(readField(body, 'paymentMethod'));
      if (!result.ok) {
        fieldErrors.push(...result.errors);
      } else {
        nextPaymentMethod = result.value;
      }
    }

    if (fieldErrors.length > 0) {
      return err(validationError('A kérés egyes mezői érvénytelenek.', fieldErrors));
    }

    const prior = this.drafts.get(input.cartId)?.draft ?? {};
    const merged: CheckoutDraft = {
      ...prior,
      ...(nextContact !== undefined ? { contact: nextContact } : {}),
      ...(nextDelivery !== undefined ? { delivery: nextDelivery } : {}),
      ...(nextPaymentMethod !== undefined ? { paymentMethod: nextPaymentMethod } : {}),
    };
    this.drafts.set(input.cartId, { draft: merged });

    // Successful draft mutation invalidates any active quote (per T08-AC04).
    this.quotes.delete(input.cartId);

    const snapshot: CheckoutSessionSnapshot = {
      cartId: input.cartId,
      cartVersion: cart.version,
      draft: merged,
    };
    this.idempotency.record(idemKey, payloadHash, { status: 200, body: snapshot });
    return ok(snapshot);
  }

  // -------------------------------------------------------------------------
  // createQuote — revalidate stock + prices, emit a fresh quote (or 409).
  // -------------------------------------------------------------------------

  createQuote(input: CreateQuoteInput): Result<{ quote: QuoteSnapshot; cart: Cart }> {
    const session = validateSession(input.sessionId);
    if (!session.ok) return session;
    const ifMatch = validateIfMatch(input.cartVersion);
    if (!ifMatch.ok) return ifMatch;
    const key = validateIdempotencyKey(input.idempotencyKey);
    if (!key.ok) return key;

    const path = `/checkout/${input.cartId}/quote`;
    const idemKey = deriveIdempotencyKey('POST', path, input.sessionId, key.value);
    // Quote has no body — use a stable hash so the replay window
    // tolerates identical headers across retries.
    const payloadHash = hashPayload({});

    const replay = this.idempotency.find(idemKey, payloadHash);
    if (replay) return ok(replay.body as { quote: QuoteSnapshot; cart: Cart });
    if (this.idempotency.hasConflictingPayload(idemKey, payloadHash)) {
      return err(idempotencyConflict());
    }

    const cart = this.repository.getCart(input.cartId);
    if (cart?.sessionId !== input.sessionId) {
      return err(notFound());
    }
    if (this.isExpired(cart)) {
      return err(cartExpired());
    }
    if (cart.version !== ifMatch.value) {
      return err(versionConflict());
    }

    // 1. Empty cart => CHECKOUT_INCOMPLETE /cart
    if (cart.items.length === 0) {
      return err(checkoutIncomplete('A kosár üres, árajánlat nem készíthető.', [
        { path: '/cart', message: 'A kosár jelenleg üres.' },
      ]));
    }

    // 2. Incomplete draft => CHECKOUT_INCOMPLETE per missing field
    const draft = this.drafts.get(input.cartId)?.draft ?? {};
    const delivery = draft.delivery;
    const draftErrors: FieldError[] = [];
    if (!draft.contact) {
      draftErrors.push({ path: '/contact', message: 'A kapcsolat kitöltése kötelező.' });
    }
    if (!delivery) {
      draftErrors.push({ path: '/delivery', message: 'A szállítási mód kiválasztása kötelező.' });
    }
    if (!draft.paymentMethod) {
      draftErrors.push({ path: '/paymentMethod', message: 'A fizetési mód kiválasztása kötelező.' });
    }
    if (draftErrors.length > 0 || !delivery) {
      return err(checkoutIncomplete('A fizetési adatok hiányosak.', draftErrors));
    }

    // 3. Stock recheck + price recheck
    const mismatchedLines: {
      lineId: string;
      newPrice: Money;
      lineIndex: number;
    }[] = [];
    const outOfStockLines: string[] = [];

    let subtotal = 0;
    const updatedItems: CartLine[] = cart.items.map((line, index) => {
      const lookup = this.repository.getVariant(line.variantId);
      if (!lookup) {
        outOfStockLines.push(line.id);
        return line;
      }
      const variant = lookup.variant;
      if (variant.availability !== 'in_stock') {
        outOfStockLines.push(line.id);
        return line;
      }
      const variantPrice: Money = { amount: variant.price.amount, currency: 'HUF' };
      if (variant.price.amount !== line.unitPrice.amount) {
        mismatchedLines.push({
          lineId: line.id,
          newPrice: variantPrice,
          lineIndex: index,
        });
      }
      subtotal += variant.price.amount * line.quantity;
      return { ...line, unitPrice: variantPrice };
    });

    if (mismatchedLines.length > 0) {
      // Atomic cart update: rewrite affected line totals + bump version.
      // Apply the price rewrite before any status check so a line that
      // is both out-of-stock and price-changed keeps its new price in
      // the cart even though the call still surfaces 409 OUT_OF_STOCK.
      const atomicItems: CartLine[] = updatedItems.map((line, idx) => {
        const mismatch = mismatchedLines.find((m) => m.lineIndex === idx);
        if (!mismatch) {
          return line;
        }
        const lineTotal: Money = {
          amount: mismatch.newPrice.amount * line.quantity,
          currency: 'HUF',
        };
        return { ...line, unitPrice: mismatch.newPrice, lineTotal };
      });
      const rewritten: Cart = {
        ...cart,
        version: cart.version + 1,
        items: atomicItems,
      };
      this.repository.updateCart(rewritten);
      this.quotes.delete(input.cartId);
    }

    if (outOfStockLines.length > 0) {
      return err(outOfStock());
    }

    if (mismatchedLines.length > 0) {
      return err(priceChanged());
    }

    // 4. Subtotal + shipping + total
    const shipping = SHIPPING_FEE[delivery.optionId];
    const total = { amount: subtotal + shipping.amount, currency: 'HUF' as const };
    const quoteRecord: QuoteSnapshot = {
      id: this.ids.uuid(),
      cartId: input.cartId,
      cartVersion: cart.version,
      subtotal: { amount: subtotal, currency: 'HUF' },
      shipping,
      total,
      expiresAt: this.computeExpiresAt(),
    };
    this.quotes.set(input.cartId, { quote: quoteRecord });
    const result = { quote: quoteRecord, cart };
    this.idempotency.record(idemKey, payloadHash, { status: 200, body: result });
    return ok(result);
  }

  // -------------------------------------------------------------------------
  // Cart expiry + quote expiry helpers
  // -------------------------------------------------------------------------

  isExpired(cart: Cart): boolean {
    const nowMs = Date.parse(this.clock.now());
    const expiresAtMs = Date.parse(cart.expiresAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(expiresAtMs)) return false;
    return nowMs >= expiresAtMs;
  }

  isExpiredQuote(quote: QuoteSnapshot): boolean {
    return this.isExpiredRecord(quote);
  }

  private isExpiredRecord(record: { expiresAt: string }): boolean {
    const nowMs = Date.parse(this.clock.now());
    const expiresMs = Date.parse(record.expiresAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(expiresMs)) return false;
    return nowMs >= expiresMs;
  }

  private computeExpiresAt(): string {
    const nowMs = Date.parse(this.clock.now());
    return new Date(nowMs + QUOTE_TTL_MS).toISOString();
  }
}

// ---------------------------------------------------------------------------
// Result helpers and problem factories — keep the vocabulary in one place.
// ---------------------------------------------------------------------------

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function err(problem: Problem): Result<never> {
  return { ok: false, problem };
}

export function notFound(): Problem {
  return { status: 404, code: 'NOT_FOUND', detail: 'A kosár nem található.', fieldErrors: [] };
}
export function cartExpired(): Problem {
  return { status: 410, code: 'CART_EXPIRED', detail: 'A kosár lejárt.', fieldErrors: [] };
}
export function versionConflict(): Problem {
  return {
    status: 409,
    code: 'CART_VERSION_CONFLICT',
    detail: 'A kosár verziója megváltozott az utolsó betöltés óta.',
    fieldErrors: [],
  };
}
export function outOfStock(): Problem {
  return {
    status: 409,
    code: 'OUT_OF_STOCK',
    detail: 'Egy vagy több változat elfogyott.',
    fieldErrors: [],
  };
}
export function priceChanged(): Problem {
  return {
    status: 409,
    code: 'PRICE_CHANGED',
    detail:
      'A katalógus ára megváltozott: a kosár frissítve lett, az árajánlat elavult. Erősítsd meg az új összeget!',
    fieldErrors: [],
  };
}
export function checkoutIncomplete(detail: string, fieldErrors: FieldError[]): Problem {
  return { status: 422, code: 'CHECKOUT_INCOMPLETE', detail, fieldErrors };
}
export function idempotencyConflict(): Problem {
  return {
    status: 409,
    code: 'IDEMPOTENCY_CONFLICT',
    detail: 'Az idempotencia kulcs már más kéréssel lett rögzítve.',
    fieldErrors: [],
  };
}
export function validationError(detail: string, fieldErrors: FieldError[]): Problem {
  // T26 parity fix: body validation errors surface under the
  // `VALIDATION_ERROR` code while header/protocol errors keep the
  // `VALIDATION_FAILED` code the wire contract documents in
  // docs/api/openapi.yaml. The 422 status matches the HTTP
  // `Unprocessable Entity` semantics used by every other body
  // validation error.
  return { status: 422, code: 'VALIDATION_ERROR', detail, fieldErrors };
}

// ---------------------------------------------------------------------------
// Header validation — mirrors the T07 rules so the handler layer can
// surface identical 400 problems for every mock slice.
// ---------------------------------------------------------------------------

function validateSession(sessionId: string): Result<string> {
  if (!HeaderRules.sessionPattern.test(sessionId)) {
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

function validateIfMatch(ifMatch: number | null): Result<number> {
  if (ifMatch === null) {
    return err({
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'Hiányzó If-Match fejléc.',
      fieldErrors: [{ path: '/If-Match', message: 'Az If-Match fejléc kötelező.' }],
    });
  }
  if (!Number.isInteger(ifMatch) || ifMatch < 1) {
    return err({
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'Érvénytelen If-Match verzió.',
      fieldErrors: [
        { path: '/If-Match', message: 'Az If-Match verziója pozitív egész kell legyen.' },
      ],
    });
  }
  return ok(ifMatch);
}

function validateIdempotencyKey(key: string | null): Result<string> {
  if (key === null) {
    return err({
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'Hiányzó Idempotency-Key fejléc.',
      fieldErrors: [{ path: '/Idempotency-Key', message: 'Az Idempotency-Key fejléc kötelező.' }],
    });
  }
  if (key.length < HeaderRules.idempotencyMin || key.length > HeaderRules.idempotencyMax) {
    return err({
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'Érvénytelen Idempotency-Key hossz.',
      fieldErrors: [
        {
          path: '/Idempotency-Key',
          message: `Az Idempotency-Key hossza ${String(HeaderRules.idempotencyMin)} és ${String(HeaderRules.idempotencyMax)} karakter közé eshet.`,
        },
      ],
    });
  }
  return ok(key);
}
