/**
 * T05 — in-memory mock repository.
 *
 * Holds one scenario's demo carts, committed order receipts and
 * idempotency keys, plus the mock-local wire types those records
 * use. Each scenario owns its own Repository instance (created via
 * `new Repository(scenario, ids, clock)`) so two scenario instances
 * cannot leak state into each other. The product catalogue is not
 * here: the handlers read it from `catalogStore`
 * (`catalog/catalog.handlers.ts`).
 */

/** Money in whole HUF, no minor units. */
export interface Money {
  amount: number;
  currency: 'HUF';
}

/** Single product image rendered by the catalogue and PDP. */
export interface Image {
  id: string;
  src: string;
  alt: string;
  width: number;
  height: number;
}

/** Stock state of a single variant. */
export type Availability = 'in_stock' | 'out_of_stock';

/** One SKU of a product (color × storage). */
export interface Variant {
  id: string;
  colorCode: string;
  colorName: string;
  swatchHex: string;
  storageGb: 128 | 256 | 512;
  price: Money;
  availability: Availability;
  maxQuantity: number;
  images: readonly Image[];
}

/** One spec row in a spec group. */
export interface SpecRow {
  label: string;
  value: string;
}

/** One spec group shown on the product page. */
export interface SpecGroup {
  id: string;
  title: string;
  rows: readonly SpecRow[];
}

/** Full catalogue product — matches the OpenAPI `Product` schema. */
export interface Product {
  id: string;
  slug: string;
  brand: string;
  name: string;
  highlights: readonly string[];
  defaultVariant: Variant;
  is5g: boolean;
  isDemo: true;
  description: string;
  variants: readonly Variant[];
  specGroups: readonly SpecGroup[];
}

/** Full Cart shape — T07 owns version, totals, expiry. */
export interface Cart {
  id: string;
  version: number;
  status: 'active' | 'ordered';
  sessionId: string;
  items: readonly CartLine[];
  createdAt: string;
  expiresAt: string;
}

/** Full Cart line — T07 carries the variant snapshot the client renders. */
export interface CartLine {
  id: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantId: string;
  colorName: string;
  storageGb: number;
  image: Image;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  availability: Availability;
  maxQuantity: number;
}

/** Minimal OrderReceipt shape — T09 expands with full receipt items. */
export interface OrderReceipt {
  id: string;
  orderNumber: string;
  sessionId: string;
  createdAt: string;
  total: { amount: number; currency: string };
  status?: string;
  isSimulation?: boolean;
  items?: readonly unknown[];
  subtotal?: { amount: number; currency: string };
  shipping?: { amount: number; currency: string };
  paymentMethod?: string;
  deliveryOptionId?: string;
  notice?: string;
}

import type { Clock, Ids, ScenarioDescriptor } from './scenarios';

/** Cart expires 24h after creation. Matches the OpenAPI Cart.expiresAt example. */
const CART_EXPIRY_MS = 24 * 60 * 60 * 1000;

export class Repository {
  private readonly carts = new Map<string, Cart>();
  private readonly cartsBySession = new Map<string, string>();
  private readonly orders = new Map<string, OrderReceipt>();
  private readonly idempotency = new Map<string, unknown>();
  /** Monotonic counter so cart ids stay deterministic per scenario. */
  private cartCounter = 0;
  /** Monotonic counter for order numbers (`DEMO-NNNNNN`). */
  private orderCounter = 0;

  constructor(
    private readonly scenario: ScenarioDescriptor,
    private readonly ids: Ids,
    private readonly clock: Clock,
  ) {}

  /** Read-only access to the scenario descriptor. */
  getScenario(): ScenarioDescriptor {
    return this.scenario;
  }

  /** Creates an empty cart for the given demo session and returns it. */
  createCart(sessionId: string): Cart {
    this.cartCounter += 1;
    const cartId = `cart-${this.scenario.name}-${this.cartCounter.toString(36)}-${this.ids.uuid()}`;
    const now = this.clock.now();
    const createdAtMs = Date.parse(now);
    const expiresAt = new Date(createdAtMs + CART_EXPIRY_MS).toISOString();
    const cart: Cart = {
      id: cartId,
      version: 1,
      status: 'active',
      sessionId,
      items: [],
      createdAt: now,
      expiresAt,
    };
    this.carts.set(cart.id, cart);
    this.cartsBySession.set(sessionId, cart.id);
    return cart;
  }

  /**
   * Returns the cart associated with a session, creating one if absent
   * or expired.
   */
  ensureCart(sessionId: string): Cart {
    const existing = this.cartsBySession.get(sessionId);
    if (existing !== undefined) {
      const cart = this.carts.get(existing);
      if (cart?.status === 'active' && !this.isCartExpired(cart)) return cart;
    }
    return this.createCart(sessionId);
  }

  /**
   * Mirrors `CartDomain.isExpired` (src/mocks/cart/cart-domain.ts)
   * in the repository's own terms — `Repository` cannot import
   * `CartDomain`, since the dependency runs the other way. Keep the
   * two predicates in step: an unparseable date is not expired, and
   * expiry is `>=` against the clock.
   */
  private isCartExpired(cart: Cart): boolean {
    const nowMs = Date.parse(this.clock.now());
    const expiresAtMs = Date.parse(cart.expiresAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(expiresAtMs)) return false;
    return nowMs >= expiresAtMs;
  }

  /** Looks up a cart by id. */
  getCart(cartId: string): Cart | undefined {
    return this.carts.get(cartId);
  }

  /**
   * Replaces the cart stored under `cart.id`. The cart-domain
   * composes a new immutable cart (new items array, new version)
   * and hands it back; the repository preserves the rest of the
   * inventory unchanged.
   */
  updateCart(cart: Cart): void {
    if (!this.carts.has(cart.id)) {
      throw new Error(`[mi-bolt] repository: unknown cart id ${cart.id}`);
    }
    this.carts.set(cart.id, cart);
  }

  /** Lists every cart owned by the scenario. Tests use it for isolation checks. */
  listCarts(): readonly Cart[] {
    return Array.from(this.carts.values());
  }

  /** Stores an order receipt. T09 calls this on commit. */
  saveOrder(receipt: OrderReceipt): void {
    this.orders.set(receipt.id, receipt);
  }

  /** Looks up an order by id. */
  getOrder(id: string): OrderReceipt | undefined {
    return this.orders.get(id);
  }

  /** Generates the next deterministic order number (`DEMO-NNNNNN`). */
  nextOrderNumber(): string {
    this.orderCounter += 1;
    const padded = this.orderCounter.toString().padStart(6, '0');
    return `DEMO-${padded}`;
  }

  /**
   * Idempotency cache. T08 owns the key derivation rules; T05 only
   * reserves the map so the surface is ready.
   */
  getIdempotency(key: string): unknown {
    return this.idempotency.get(key);
  }

  /** Records an idempotency outcome. */
  setIdempotency(key: string, value: unknown): void {
    this.idempotency.set(key, value);
  }
}
