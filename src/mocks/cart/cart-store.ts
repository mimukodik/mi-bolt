/**
 * MIM-211 — cart store on the 2.0.0 contract.
 *
 * The cart is bound to the session; there is no cart id in any URL and
 * no `createCart`. `GET /cart` returns the session's cart, creating an
 * empty one when none exists. Every 200 carries `ETag: "<version>"`
 * (pattern `^"[0-9]+"$`), every write requires `If-Match` in that same
 * pattern and answers 412 `CART_VERSION_CONFLICT` when it is missing,
 * malformed or not the current version.
 *
 * The store never touches HTTP. The handler layer maps outcomes to
 * `HttpResponse` with `ETag` on success and
 * `application/problem+json` on failure.
 *
 * MIM-212 adds two store methods — `touch` and `resetForOrder` — for
 * the checkout store. Both reuse the existing reconcile and version
 * machinery so the cart and the checkout draft always read and bump
 * the same counter (`docs/api/openapi.yaml:16-19`). The Problem body
 * moves to the generated `Problem` type, and the Problem `type` URI
 * follows the contract's own examples via `problemType`.
 */

import type {
  Cart,
  CartItem,
  CartNotice,
  Problem,
  ProblemCode,
} from '../../app/api/generated/models';
import type { CreateHandlersOptions } from '../create-handlers';
import type { VariantLookup } from '../catalog/catalog-store';
import type { PersistedCart } from '../persistence';

export const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A single line as the store keeps it: no pricing, no product info. */
interface StoredLine {
  variantId: string;
  quantity: number;
}

/** The session-keyed cart, with the bare fields the contract carries. */
interface StoredCart {
  id: string;
  version: number;
  createdAt: string;
  expiresAt: string;
  lines: StoredLine[];
}

export type CartOutcome = { ok: true; cart: Cart } | { ok: false; problem: Problem };

/** Look up a variant by id from whatever catalogue the caller mounted. */
export type VariantLookupFn = (variantId: string) => VariantLookup | undefined;

/** Title shown on the Problem body for each status code; shared by the cart and checkout stores. */
export function titleForStatus(status: number): string {
  if (status === 400) return 'Invalid request';
  if (status === 404) return 'Resource not found';
  if (status === 409) return 'Conflict';
  if (status === 410) return 'Gone';
  if (status === 412) return 'Precondition failed';
  if (status === 422) return 'Unprocessable content';
  return 'Unknown';
}

/**
 * Monotonic per-process counter used to build unique-per-call trace ids.
 * The previous implementation derived the id from the scenario clock,
 * which produced the same 24-hex string for every Problem body in a
 * test with a fixed clock (and collided every ~49 days in the wild).
 */
let traceIdCounter = 0;

/** Build a unique 24-char lowercase-hex trace id. */
export function buildTraceId(_options: CreateHandlersOptions): string {
  traceIdCounter = (traceIdCounter + 1) >>> 0;
  return traceIdCounter.toString(16).padStart(24, '0');
}

/**
 * The Problem `type` URI the contract's own examples give for a code
 * (`docs/api/openapi.yaml:1060`, and the kebab-case rule for the
 * others). `CART_VERSION_CONFLICT` is the one exception the contract
 * fixes by example; every other code follows the cart's own
 * derivation.
 */
export function problemType(code: ProblemCode): string {
  if (code === 'CART_VERSION_CONFLICT') return 'urn:mi-bolt:problem:version-conflict';
  return `urn:mi-bolt:problem:${code.toLowerCase().replace(/_/g, '-')}`;
}

/**
 * In-memory cart store keyed by `X-Demo-Session`. One cart per
 * session; expiry is checked first on every call; mutations bump
 * `version` by exactly one; reconcile runs on every read path.
 */
export class CartStore {
  private readonly carts = new Map<string, StoredCart>();

  constructor(
    private readonly options: CreateHandlersOptions,
    private readonly lookup: VariantLookupFn,
  ) {}

  /** `GET /cart` — returns the session's cart, creating one when needed. */
  get(sessionId: string): CartOutcome {
    const cart = this.ensureFreshCart(sessionId);
    if (!cart.ok) return cart;
    return this.view(sessionId, false);
  }

  /** `POST /cart/items` — merge `variantId` by `quantity` into the cart. */
  add(sessionId: string, ifMatch: string | null, variantId: string, quantity: number): CartOutcome {
    const cart = this.ensureFreshCart(sessionId);
    if (!cart.ok) return cart;
    const versionCheck = this.checkIfMatch(ifMatch, cart.cart.version);
    if (!versionCheck.ok) return versionCheck;
    const hit = this.lookup(variantId);
    if (!hit) {
      return this.problem(404, 'NOT_FOUND', 'Unknown variant', { variantId });
    }
    if (hit.variant.maxQuantity === 0) {
      return this.problem(409, 'OUT_OF_STOCK', 'Variant is not orderable', { variantId });
    }
    const existing = cart.cart.lines.find((line) => line.variantId === variantId);
    const merged = (existing?.quantity ?? 0) + quantity;
    if (merged > hit.variant.maxQuantity) {
      return this.problem(409, 'QUANTITY_LIMIT', 'Merged quantity would exceed the line maximum', {
        max: hit.variant.maxQuantity,
        requested: merged,
      });
    }
    if (existing) {
      existing.quantity = merged;
    } else {
      cart.cart.lines.push({ variantId, quantity });
    }
    return this.bumpAndView(sessionId);
  }

  /** `PATCH /cart/items/:variantId` — set absolute quantity on a line. */
  setQuantity(
    sessionId: string,
    ifMatch: string | null,
    variantId: string,
    quantity: number,
  ): CartOutcome {
    const cart = this.ensureFreshCart(sessionId);
    if (!cart.ok) return cart;
    const versionCheck = this.checkIfMatch(ifMatch, cart.cart.version);
    if (!versionCheck.ok) return versionCheck;
    const line = cart.cart.lines.find((entry) => entry.variantId === variantId);
    if (!line) {
      return this.problem(404, 'NOT_FOUND', 'Line not in cart', { variantId });
    }
    const hit = this.lookup(variantId);
    if (hit && quantity > hit.variant.maxQuantity) {
      return this.problem(409, 'QUANTITY_LIMIT', 'Merged quantity would exceed the line maximum', {
        max: hit.variant.maxQuantity,
        requested: quantity,
      });
    }
    line.quantity = quantity;
    return this.bumpAndView(sessionId);
  }

  /** `DELETE /cart/items/:variantId` — drop a line; no-op when absent. */
  remove(sessionId: string, ifMatch: string | null, variantId: string): CartOutcome {
    const cart = this.ensureFreshCart(sessionId);
    if (!cart.ok) return cart;
    const versionCheck = this.checkIfMatch(ifMatch, cart.cart.version);
    if (!versionCheck.ok) return versionCheck;
    const hit = this.lookup(variantId);
    if (!hit) {
      return this.problem(404, 'NOT_FOUND', 'Unknown variant', { variantId });
    }
    const before = cart.cart.lines.length;
    const kept = cart.cart.lines.filter((line) => line.variantId !== variantId);
    if (kept.length === before) {
      return this.view(sessionId, false);
    }
    cart.cart.lines = kept;
    return this.bumpAndView(sessionId);
  }

  /** `DELETE /cart/items` — clear every line; no-op when already empty. */
  clear(sessionId: string, ifMatch: string | null): CartOutcome {
    const cart = this.ensureFreshCart(sessionId);
    if (!cart.ok) return cart;
    const versionCheck = this.checkIfMatch(ifMatch, cart.cart.version);
    if (!versionCheck.ok) return versionCheck;
    if (cart.cart.lines.length === 0) {
      return this.view(sessionId, false);
    }
    cart.cart.lines = [];
    return this.bumpAndView(sessionId);
  }

  /**
   * Bump the cart's version for the checkout store. Runs the same
   * expiry check as a write, then bumps through `view(_, true)`.
   */
  touch(sessionId: string): CartOutcome {
    const cart = this.ensureFreshCart(sessionId);
    if (!cart.ok) return cart;
    return this.view(sessionId, true);
  }

  /**
   * Discard the session's cart so the next `GET /cart` creates a
   * fresh version-1 entry.
   */
  resetForOrder(sessionId: string): void {
    this.carts.delete(sessionId);
  }

  /**
   * Seeds the session's cart from a hydrated snapshot. Called once at
   * handler-construction time when `options.snapshot?.cart` is set, so
   * a reload restores the lines and the version the snapshot was
   * saved with. Expiry is re-checked on the next read against the
   * live clock (`isExpired` below), so a stale snapshot still 410s.
   */
  seedFromSnapshot(sessionId: string, persisted: PersistedCart): void {
    this.carts.set(sessionId, {
      id: persisted.id,
      version: persisted.version,
      createdAt: persisted.createdAt,
      expiresAt: persisted.expiresAt,
      lines: persisted.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    });
  }

  /**
   * Returns the cart in the shape `MockSnapshot` carries, or
   * `undefined` when the session has no cart. Pricing and
   * availability are deliberately omitted: `view()` re-derives them
   * from the live catalogue on every read, so persisting them would
   * let stale data defeat that reconcile pass.
   */
  toPersistedCart(sessionId: string): PersistedCart | undefined {
    const cart = this.carts.get(sessionId);
    if (!cart) return undefined;
    return {
      id: cart.id,
      version: cart.version,
      createdAt: cart.createdAt,
      expiresAt: cart.expiresAt,
      items: cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal: cart lifecycle, version check, view building.
  // ---------------------------------------------------------------------------

  /**
   * Returns the session's cart, creating a fresh one when none exists.
   * On expiry the stored cart is deleted and a 410 `CART_EXPIRED` is
   * returned; the caller resolves that by issuing another `get` after
   * the store has reset state.
   */
  private ensureFreshCart(
    sessionId: string,
  ): { ok: true; cart: StoredCart } | Extract<CartOutcome, { ok: false }> {
    let cart = this.carts.get(sessionId);
    if (!cart) {
      cart = this.createStoredCart();
      this.carts.set(sessionId, cart);
      return { ok: true, cart };
    }
    if (this.isExpired(cart)) {
      this.carts.delete(sessionId);
      return this.problem(410, 'CART_EXPIRED', 'The cart has expired', {});
    }
    return { ok: true, cart };
  }

  /** Build the initial stored cart for a fresh session. */
  private createStoredCart(): StoredCart {
    const createdAt = this.options.clock.now();
    const expiresAt = this.expiryFromNow();
    return {
      id: this.options.ids.uuid(),
      version: 1,
      createdAt,
      expiresAt,
      lines: [],
    };
  }

  /** `now + CART_TTL_MS` as an ISO string, from the scenario clock. CART_TTL_MS mirrors the backend's `mibolt.session.lifetime` (30 days). */
  private expiryFromNow(): string {
    return new Date(Date.parse(this.options.clock.now()) + CART_TTL_MS).toISOString();
  }

  /** True when `now >= expiresAt`. */
  private isExpired(cart: StoredCart): boolean {
    const nowMs = Date.parse(this.options.clock.now());
    const expiresAtMs = Date.parse(cart.expiresAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(expiresAtMs)) return false;
    return nowMs >= expiresAtMs;
  }

  /** Compare `If-Match` against the current version; 412 on any miss. */
  private checkIfMatch(
    ifMatch: string | null,
    expected: number,
  ): { ok: true } | Extract<CartOutcome, { ok: false }> {
    if (ifMatch !== `"${String(expected)}"`) {
      return this.problem(
        412,
        'CART_VERSION_CONFLICT',
        'The cart changed since the version supplied in If-Match',
        { expected, received: ifMatch },
      );
    }
    return { ok: true };
  }

  /** Bump version, then build the view. */
  private bumpAndView(sessionId: string): CartOutcome {
    const cart = this.carts.get(sessionId);
    if (!cart) {
      // No cart should be unreachable because callers go through
      // ensureFreshCart first; the guard exists so a future refactor
      // cannot surface a half-built stored state to the wire.
      throw new Error('[cart-store] bumpAndView called without a stored cart');
    }
    return this.view(sessionId, true);
  }

  /**
   * Run the reconcile pass, then build the wire-shaped `Cart`. A line
   * that the catalogue no longer carries (lookup undefined or
   * `maxQuantity === 0`) is dropped with an `ITEM_REMOVED` notice;
   * a quantity above the new `maxQuantity` is clamped with a
   * `QUANTITY_REDUCED` notice. Reconcile never emits `PRICE_CHANGED`
   * because the catalogue is static in this phase.
   *
   * `bumpForMutation` distinguishes the two paths that reach this
   * method: a mutation (`add`, `setQuantity`, `remove`, `clear`) bumps
   * the version once whether reconcile fires or not; a `get` only
   * bumps when reconcile actually changed the cart, so reads stay
   * idempotent against the stored state. Whichever path bumps the
   * version also pushes `expiresAt` to `now + CART_TTL_MS`, as the
   * contract's `expiresAt` description and the backend's
   * `CartService.finalize` do; a read that changes nothing leaves it
   * alone.
   */
  private view(sessionId: string, bumpForMutation: boolean): CartOutcome {
    const cart = this.carts.get(sessionId);
    if (!cart) {
      throw new Error('[cart-store] view called without a stored cart');
    }
    const notices: CartNotice[] = [];
    const kept: CartItem[] = [];
    const nextLines: StoredLine[] = [];
    let changed = false;
    for (const line of cart.lines) {
      const hit = this.lookup(line.variantId);
      if (!hit || hit.variant.maxQuantity === 0) {
        notices.push({ code: 'ITEM_REMOVED', variantId: line.variantId });
        changed = true;
        continue;
      }
      const cap = hit.variant.maxQuantity;
      if (line.quantity > cap) {
        notices.push({
          code: 'QUANTITY_REDUCED',
          variantId: line.variantId,
          params: { from: line.quantity, to: cap },
        });
        line.quantity = cap;
        changed = true;
      }
      kept.push(toCartItem(hit, line.quantity));
      nextLines.push(line);
    }
    if (changed) {
      cart.lines = nextLines;
    }
    if (changed || bumpForMutation) {
      cart.version += 1;
      cart.expiresAt = this.expiryFromNow();
    }
    let totalQuantity = 0;
    let subtotalAmount = 0;
    for (const item of kept) {
      totalQuantity += item.quantity;
      subtotalAmount += item.lineTotal.amount;
    }
    const wire: Cart = {
      id: cart.id,
      version: cart.version,
      items: kept,
      lineCount: kept.length,
      totalQuantity,
      subtotal: { amount: subtotalAmount, currency: 'HUF' },
      expiresAt: cart.expiresAt,
      notices,
    };
    return { ok: true, cart: wire };
  }

  /** Build a Problem body with a kebab `type` URI matching the contract. */
  private problem(
    status: number,
    code: ProblemCode,
    detail: string,
    params: Record<string, unknown>,
  ): Extract<CartOutcome, { ok: false }> {
    const body: Problem = {
      type: problemType(code),
      title: titleForStatus(status),
      status,
      code,
      detail,
      traceId: buildTraceId(this.options),
      fieldErrors: [],
      params,
    };
    return { ok: false, problem: body };
  }
}

/** Build the wire-shaped `CartItem` from a `(product, variant)` lookup. */
function toCartItem(hit: VariantLookup, quantity: number): CartItem {
  if (hit.variant.images.length === 0) {
    throw new Error('Variant has no image');
  }
  const firstImage = hit.variant.images[0];
  return {
    variantId: hit.variant.id,
    variantSlug: hit.variant.slug,
    productId: hit.product.id,
    productSlug: hit.product.slug,
    productName: hit.product.name,
    colorName: hit.variant.colorName,
    storageGb: hit.variant.storageGb,
    image: firstImage,
    quantity,
    unitPrice: hit.variant.price,
    lineTotal: {
      amount: hit.variant.price.amount * quantity,
      currency: 'HUF',
    },
    availability: hit.variant.availability,
    maxQuantity: hit.variant.maxQuantity,
  };
}
