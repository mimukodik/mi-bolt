/**
 * T07 — cart domain.
 *
 * Owns every cart mutation (`create`, `addItem`, `setQuantity`,
 * `removeItem`, `read`) plus the race-safe semantics the cart
 * contract demands:
 *
 *   - Version increments by exactly one on every successful atomic
 *     mutation. A version mismatch is rejected with a 409 Problem
 *     that preserves the visible cart (no version change, no item
 *     change) so the client refetches and corrects explicitly.
 *   - Idempotency replay runs BEFORE the version check. A successful
 *     mutation caches its body keyed by method+path+session+key
 *     with a 24h window; the next caller with the same body sees
 *     the cached response. The same key with a different body
 *     produces a 409 `IDEMPOTENCY_CONFLICT`.
 *   - Cross-session access never mutates or reveals another
 *     session's cart. The store returns 404 for unknown cart ids
 *     AND for cart ids that belong to a different demo session.
 *   - Expired carts (now >= expiresAt) are treated as 410
 *     `CART_EXPIRED`. The cart stays in storage so a session that
 *     re-opens can clear it explicitly, but every read or write
 *     fails until a fresh cart is created.
 *
 * The domain never touches HTTP. The handler layer is responsible
 * for parsing headers, mapping the result back to MSW responses
 * and emitting the `If-Match` and `Idempotency-Key` validation.
 */

import {
  deriveIdempotencyKey,
  hashPayload,
  type IdempotencyStore,
} from '../idempotency';
import {
  type Cart,
  type CartLine,
  type Image,
  type Money,
  type Variant,
  Repository,
} from '../repository';
import type { Clock, Ids } from '../scenarios';

/** Demo-config maximum line quantity (matches OpenAPI demoConfig.maximumLineQuantity). */
export const MAX_LINE_QUANTITY = 5;

/** Cart expires 24h after creation (matches the OpenAPI Cart.expiresAt example). */
const CART_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Stable types for the cart wire contract. */
export type CartItem = CartLine;
export type CartSnapshot = Cart;

export type ProblemCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CART_EXPIRED'
  | 'CART_VERSION_CONFLICT'
  | 'OUT_OF_STOCK'
  | 'QUANTITY_LIMIT'
  | 'IDEMPOTENCY_CONFLICT';

export type FieldError = { path: string; message: string };

export type Problem = {
  status: 400 | 404 | 409 | 410 | 422;
  code: ProblemCode;
  detail: string;
  fieldErrors: FieldError[];
};

/** Result of a cart operation — discriminated union. */
export type CartResult<T> = { ok: true; value: T } | { ok: false; problem: Problem };

/** Inputs grouped per operation; the handler layer maps HTTP into these. */
export type CreateCartInput = {
  sessionId: string;
  idempotencyKey: string;
};

export type GetCartInput = {
  sessionId: string;
  cartId: string;
};

export type AddCartItemInput = {
  sessionId: string;
  cartId: string;
  ifMatch: string | null;
  idempotencyKey: string | null;
  variantId: string;
  quantity: number;
};

export type SetCartItemQuantityInput = {
  sessionId: string;
  cartId: string;
  itemId: string;
  ifMatch: string | null;
  idempotencyKey: string | null;
  quantity: number;
};

export type RemoveCartItemInput = {
  sessionId: string;
  cartId: string;
  itemId: string;
  ifMatch: string | null;
  idempotencyKey: string | null;
};

/**
 * Header validation results — separated from cart logic so the
 * handler can surface them as 400 problems before any state change.
 */
export const HeaderRules = {
  sessionPattern: /^[a-zA-Z0-9_-]{8,80}$/,
  ifMatchPattern: /^"[0-9]+"$/,
  idempotencyMin: 8,
  idempotencyMax: 100,
};

/**
 * Cart-domain entrypoint. Every method returns either the
 * authoritative updated cart or a Problem that maps 1:1 onto a
 * Problem JSON response body.
 */
export class CartDomain {
  constructor(
    private readonly repository: Repository,
    private readonly clock: Clock,
    private readonly ids: Ids,
    private readonly idempotency: IdempotencyStore,
  ) {}

  /** POST /carts — create an empty demo cart. */
  createCart(input: CreateCartInput): CartResult<CartSnapshot> {
    const session = this.validateSession(input.sessionId);
    if (!session.ok) return session;
    const key = this.validateIdempotencyKey(input.idempotencyKey);
    if (!key.ok) return key;

    const idemKey = deriveIdempotencyKey('POST', '/carts', input.sessionId, input.idempotencyKey);
    const payloadHash = hashPayload({});

    const replay = this.idempotency.find(idemKey, payloadHash);
    if (replay) {
      // The idempotency cache outlives the cart's own 24h expiry by
      // design (the cache window and the cart window both start at
      // creation time but live in separate state). A replay that
      // crosses the cart's `expiresAt` would return a cart the
      // server would refuse on the very next mutation, so we surface
      // 410 CART_EXPIRED instead and let the caller start over with
      // a fresh key.
      const replayedCart = replay.body as CartSnapshot;
      if (this.isExpired(replayedCart)) {
        return err(CartDomain.cartExpired());
      }
      return ok(replayedCart);
    }
    if (this.idempotency.hasConflictingPayload(idemKey, payloadHash)) {
      return err(CartDomain.idempotencyConflict());
    }

    const cart = this.repository.createCart(input.sessionId);
    this.idempotency.record(idemKey, payloadHash, { status: 201, body: cart });
    return ok(cart);
  }

  /** GET /carts/{cartId} — read authoritative cart state. */
  getCart(input: GetCartInput): CartResult<CartSnapshot> {
    const session = this.validateSession(input.sessionId);
    if (!session.ok) return session;
    const cart = this.repository.getCart(input.cartId);
    if (!cart || cart.sessionId !== input.sessionId) {
      return err(CartDomain.notFound());
    }
    if (this.isExpired(cart)) {
      return err(CartDomain.cartExpired());
    }
    return ok(cart);
  }

  /** POST /carts/{cartId}/items — add or merge a variant into the cart. */
  addCartItem(input: AddCartItemInput): CartResult<CartSnapshot> {
    const session = this.validateSession(input.sessionId);
    if (!session.ok) return session;
    const ifMatch = this.validateIfMatch(input.ifMatch);
    if (!ifMatch.ok) return ifMatch;
    const key = this.validateIdempotencyKey(input.idempotencyKey);
    if (!key.ok) return key;

    const lookup = this.repository.getVariant(input.variantId);
    const path = `/carts/${input.cartId}/items`;
    const idemKey = deriveIdempotencyKey('POST', path, input.sessionId, key.value);
    const payloadHash = hashPayload({
      variantId: input.variantId,
      quantity: input.quantity,
    });

    const replay = this.idempotency.find(idemKey, payloadHash);
    if (replay) return ok(replay.body as CartSnapshot);
    if (this.idempotency.hasConflictingPayload(idemKey, payloadHash)) {
      return err(CartDomain.idempotencyConflict());
    }

    const cart = this.repository.getCart(input.cartId);
    if (!cart || cart.sessionId !== input.sessionId) {
      return err(CartDomain.notFound());
    }
    if (this.isExpired(cart)) {
      return err(CartDomain.cartExpired());
    }
    if (cart.status !== 'active') {
      return err(CartDomain.notFound());
    }
    if (!lookup) {
      return err(CartDomain.notFound());
    }
    if (cart.version !== ifMatch.value) {
      return err(CartDomain.versionConflict());
    }
    const quantityCheck = this.validateQuantity(input.quantity, lookup.variant);
    if (!quantityCheck.ok) return quantityCheck;

    const cap = Math.min(lookup.variant.maxQuantity, MAX_LINE_QUANTITY);
    const existing = cart.items.find((line) => line.variantId === input.variantId);
    const mergedQuantity = (existing?.quantity ?? 0) + input.quantity;
    if (mergedQuantity > cap) {
      return err(CartDomain.quantityLimit(
        `A sor mennyisége nem haladhatja meg a(z) ${cap} darabot.`,
      ));
    }
    if (lookup.variant.availability !== 'in_stock') {
      return err(CartDomain.outOfStock());
    }

    const snapshot = CartDomain.buildVariantSnapshot(lookup.product, lookup.variant);
    const items = existing
      ? cart.items.map((line) =>
          line.variantId === input.variantId
            ? CartDomain.bumpLine(line, mergedQuantity, lookup.variant.price)
            : line,
        )
      : [
          ...cart.items,
          CartDomain.makeLine(this.ids.uuid(), snapshot, mergedQuantity, lookup.variant.price),
        ];

    const updated: Cart = {
      ...cart,
      version: cart.version + 1,
      items,
    };
    this.repository.updateCart(updated);
    this.idempotency.record(idemKey, payloadHash, { status: 200, body: updated });
    return ok(updated);
  }

  /** PATCH /carts/{cartId}/items/{itemId} — set absolute quantity on a line. */
  setCartItemQuantity(input: SetCartItemQuantityInput): CartResult<CartSnapshot> {
    const session = this.validateSession(input.sessionId);
    if (!session.ok) return session;
    const ifMatch = this.validateIfMatch(input.ifMatch);
    if (!ifMatch.ok) return ifMatch;
    const key = this.validateIdempotencyKey(input.idempotencyKey);
    if (!key.ok) return key;

    const path = `/carts/${input.cartId}/items/${input.itemId}`;
    const idemKey = deriveIdempotencyKey('PATCH', path, input.sessionId, key.value);
    const payloadHash = hashPayload({ quantity: input.quantity });

    const replay = this.idempotency.find(idemKey, payloadHash);
    if (replay) return ok(replay.body as CartSnapshot);
    if (this.idempotency.hasConflictingPayload(idemKey, payloadHash)) {
      return err(CartDomain.idempotencyConflict());
    }

    const cart = this.repository.getCart(input.cartId);
    if (!cart || cart.sessionId !== input.sessionId) {
      return err(CartDomain.notFound());
    }
    if (this.isExpired(cart)) {
      return err(CartDomain.cartExpired());
    }
    if (cart.status !== 'active') {
      return err(CartDomain.notFound());
    }
    if (cart.version !== ifMatch.value) {
      return err(CartDomain.versionConflict());
    }
    const line = cart.items.find((entry) => entry.id === input.itemId);
    if (!line) {
      return err(CartDomain.notFound());
    }
    const lookup = this.repository.getVariant(line.variantId);
    if (!lookup) {
      return err(CartDomain.notFound());
    }
    const quantityCheck = this.validateQuantity(input.quantity, lookup.variant);
    if (!quantityCheck.ok) return quantityCheck;

    const cap = Math.min(lookup.variant.maxQuantity, MAX_LINE_QUANTITY);
    if (input.quantity > cap) {
      return err(CartDomain.quantityLimit(
        `A sor mennyisége nem haladhatja meg a(z) ${cap} darabot.`,
      ));
    }
    if (lookup.variant.availability !== 'in_stock' && input.quantity > 0) {
      return err(CartDomain.outOfStock());
    }

    const updated: Cart = {
      ...cart,
      version: cart.version + 1,
      items: cart.items.map((entry) =>
        entry.id === input.itemId
          ? CartDomain.bumpLine(entry, input.quantity, lookup.variant.price)
          : entry,
      ),
    };
    this.repository.updateCart(updated);
    this.idempotency.record(idemKey, payloadHash, { status: 200, body: updated });
    return ok(updated);
  }

  /** DELETE /carts/{cartId}/items/{itemId} — remove a line and return updated cart. */
  removeCartItem(input: RemoveCartItemInput): CartResult<CartSnapshot> {
    const session = this.validateSession(input.sessionId);
    if (!session.ok) return session;
    const ifMatch = this.validateIfMatch(input.ifMatch);
    if (!ifMatch.ok) return ifMatch;
    const key = this.validateIdempotencyKey(input.idempotencyKey);
    if (!key.ok) return key;

    const path = `/carts/${input.cartId}/items/${input.itemId}`;
    const idemKey = deriveIdempotencyKey('DELETE', path, input.sessionId, key.value);
    const payloadHash = hashPayload({});

    const replay = this.idempotency.find(idemKey, payloadHash);
    if (replay) return ok(replay.body as CartSnapshot);
    if (this.idempotency.hasConflictingPayload(idemKey, payloadHash)) {
      return err(CartDomain.idempotencyConflict());
    }

    const cart = this.repository.getCart(input.cartId);
    if (!cart || cart.sessionId !== input.sessionId) {
      return err(CartDomain.notFound());
    }
    if (this.isExpired(cart)) {
      return err(CartDomain.cartExpired());
    }
    if (cart.status !== 'active') {
      return err(CartDomain.notFound());
    }
    if (cart.version !== ifMatch.value) {
      return err(CartDomain.versionConflict());
    }
    if (!cart.items.some((entry) => entry.id === input.itemId)) {
      return err(CartDomain.notFound());
    }

    const updated: Cart = {
      ...cart,
      version: cart.version + 1,
      items: cart.items.filter((entry) => entry.id !== input.itemId),
    };
    this.repository.updateCart(updated);
    this.idempotency.record(idemKey, payloadHash, { status: 200, body: updated });
    return ok(updated);
  }

  // ---------------------------------------------------------------------------
  // Validation helpers — return `CartResult` so handlers can pass failures
  // through unchanged.
  // ---------------------------------------------------------------------------

  validateSession(sessionId: string): CartResult<string> {
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

  validateIfMatch(ifMatch: string | null): CartResult<number> {
    if (ifMatch === null || ifMatch === undefined) {
      return err({
        status: 400,
        code: 'VALIDATION_FAILED',
        detail: 'Hiányzó If-Match fejléc.',
        fieldErrors: [{ path: '/If-Match', message: 'Az If-Match fejléc kötelező.' }],
      });
    }
    if (!HeaderRules.ifMatchPattern.test(ifMatch)) {
      return err({
        status: 400,
        code: 'VALIDATION_FAILED',
        detail: 'Érvénytelen If-Match formátum.',
        fieldErrors: [
          { path: '/If-Match', message: 'Az If-Match formátuma "<verzió>" kell legyen.' },
        ],
      });
    }
    const version = Number.parseInt(ifMatch.slice(1, -1), 10);
    if (!Number.isFinite(version) || version < 1) {
      return err({
        status: 400,
        code: 'VALIDATION_FAILED',
        detail: 'Érvénytelen If-Match verzió.',
        fieldErrors: [
          { path: '/If-Match', message: 'Az If-Match verziója pozitív egész kell legyen.' },
        ],
      });
    }
    return ok(version);
  }

  validateIdempotencyKey(key: string | null): CartResult<string> {
    if (key === null || key === undefined) {
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
            message: `Az Idempotency-Key hossza ${HeaderRules.idempotencyMin} és ${HeaderRules.idempotencyMax} karakter közé eshet.`,
          },
        ],
      });
    }
    return ok(key);
  }

  validateQuantity(quantity: unknown, variant: Variant): CartResult<number> {
    if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
      return err({
        status: 422,
        code: 'QUANTITY_LIMIT',
        detail: 'A mennyiség egész szám kell legyen.',
        fieldErrors: [{ path: '/quantity', message: 'A mennyiség egész szám kell legyen.' }],
      });
    }
    if (quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      return err({
        status: 422,
        code: 'QUANTITY_LIMIT',
        detail: `A mennyiség 1 és ${MAX_LINE_QUANTITY} közé eshet.`,
        fieldErrors: [
          { path: '/quantity', message: `A mennyiség 1 és ${MAX_LINE_QUANTITY} közé eshet.` },
        ],
      });
    }
    if (quantity > variant.maxQuantity) {
      return err({
        status: 422,
        code: 'QUANTITY_LIMIT',
        detail: `A változathoz legfeljebb ${variant.maxQuantity} darab rendelhető.`,
        fieldErrors: [
          {
            path: '/quantity',
            message: `A változathoz legfeljebb ${variant.maxQuantity} darab rendelhető.`,
          },
        ],
      });
    }
    return ok(quantity);
  }

  // ---------------------------------------------------------------------------
  // Pure helpers — exposed so tests and future slices reuse the same logic.
  // ---------------------------------------------------------------------------

  isExpired(cart: Cart): boolean {
    const nowMs = Date.parse(this.clock.now());
    const expiresAtMs = Date.parse(cart.expiresAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(expiresAtMs)) return false;
    return nowMs >= expiresAtMs;
  }

  static buildVariantSnapshot(
    product: { id: string; slug: string; name: string },
    variant: Variant,
  ): {
    productId: string;
    productSlug: string;
    productName: string;
    variantId: string;
    colorName: string;
    storageGb: number;
    image: Image;
    unitPrice: Money;
    availability: Variant['availability'];
    maxQuantity: number;
  } {
    const firstImage = variant.images[0];
    const image: Image = firstImage ?? {
      id: `${variant.id}-placeholder`,
      src: '/assets/placeholder.svg',
      alt: `${product.name}, ${variant.colorName}, ${variant.storageGb} GB`,
      width: 320,
      height: 400,
    };
    return {
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      variantId: variant.id,
      colorName: variant.colorName,
      storageGb: variant.storageGb,
      image,
      unitPrice: { amount: variant.price.amount, currency: 'HUF' },
      availability: variant.availability,
      maxQuantity: Math.min(variant.maxQuantity, MAX_LINE_QUANTITY),
    };
  }

  static makeLine(
    lineId: string,
    snapshot: ReturnType<typeof CartDomain.buildVariantSnapshot>,
    quantity: number,
    unitPrice: Money,
  ): CartLine {
    return {
      ...snapshot,
      id: lineId,
      quantity,
      unitPrice: { amount: unitPrice.amount, currency: 'HUF' },
      lineTotal: { amount: unitPrice.amount * quantity, currency: 'HUF' },
    };
  }

  static bumpLine(line: CartLine, quantity: number, unitPrice: Money): CartLine {
    return {
      ...line,
      quantity,
      unitPrice: { amount: unitPrice.amount, currency: 'HUF' },
      lineTotal: { amount: unitPrice.amount * quantity, currency: 'HUF' },
    };
  }

  // ---------------------------------------------------------------------------
  // Static problem factories — keep the error vocabulary in one place.
  // ---------------------------------------------------------------------------

  static notFound(): Problem {
    return { status: 404, code: 'NOT_FOUND', detail: 'A kosár nem található.', fieldErrors: [] };
  }
  static cartExpired(): Problem {
    return { status: 410, code: 'CART_EXPIRED', detail: 'A kosár lejárt.', fieldErrors: [] };
  }
  static versionConflict(): Problem {
    return {
      status: 409,
      code: 'CART_VERSION_CONFLICT',
      detail: 'A kosár verziója megváltozott az utolsó betöltés óta.',
      fieldErrors: [],
    };
  }
  static outOfStock(): Problem {
    return {
      status: 409,
      code: 'OUT_OF_STOCK',
      detail: 'A kiválasztott változat elfogyott.',
      fieldErrors: [],
    };
  }
  static quantityLimit(detail: string): Problem {
    return { status: 422, code: 'QUANTITY_LIMIT', detail, fieldErrors: [] };
  }
  static idempotencyConflict(): Problem {
    return {
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
      detail: 'Az idempotencia kulcs már más kéréssel lett rögzítve.',
      fieldErrors: [],
    };
  }
}

function ok<T>(value: T): CartResult<T> {
  return { ok: true, value };
}

function err(problem: Problem): CartResult<never> {
  return { ok: false, problem };
}

/** Test-only: lets the cart expire by advancing the clock without exposing CART_EXPIRY_MS. */
export const CART_DURATION_MS = CART_EXPIRY_MS;