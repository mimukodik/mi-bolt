/**
 * T05 — in-memory mock repository.
 *
 * The repository is the single source of truth for the demo
 * catalogue, carts, checkout drafts, payment intents, idempotency
 * keys and committed order receipts. Each scenario owns its own
 * Repository instance (created via `new Repository(scenario, ids)`)
 * so two E2E contexts cannot leak state into each other.
 *
 * The repository is intentionally minimal in T05: it seeds the
 * marketplace-mandated demo device so a `/api/v1/products` request
 * returns a deterministic fixture, and it owns the cart/order maps
 * the handler factory will mutate. T06–T09 extend the surface with
 * catalog/cart/checkout/payment/order mutation methods.
 */

/** Minimal Product shape — T06 expands with full variant matrix. */
export type Product = {
  id: string;
  slug: string;
  brand: string;
  name: string;
  is5g: boolean;
  isDemo: true;
};

/** Minimal Cart shape — T07 expands with full cart items + version. */
export type Cart = {
  id: string;
  version: number;
  status: 'active' | 'ordered';
  sessionId: string;
  items: readonly CartLine[];
  createdAt: string;
};

/** Minimal Cart line — T07 expands with product/variant snapshot. */
export type CartLine = {
  id: string;
  variantId: string;
  quantity: number;
};

/** Minimal OrderReceipt shape — T09 expands with full receipt items. */
export type OrderReceipt = {
  id: string;
  orderNumber: string;
  sessionId: string;
  createdAt: string;
  total: { amount: number; currency: string };
};

import type { Ids, ScenarioDescriptor } from './scenarios';

/**
 * The marketplace demo device is the single seed product. The full
 * 16-product catalogue will be wired in T06.
 */
const SEED_PRODUCT: Product = {
  id: 'p-01',
  slug: 'demo-one-5g',
  brand: 'MiBolt Demo',
  name: 'Demo One 5G',
  is5g: true,
  isDemo: true,
};

export class Repository {
  private readonly products = new Map<string, Product>();
  private readonly productsBySlug = new Map<string, Product>();
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
  ) {
    this.seed();
  }

  /** Read-only access to the scenario descriptor. */
  getScenario(): ScenarioDescriptor {
    return this.scenario;
  }

  /** Lists every seeded product. T06 will replace this with paginated queries. */
  listProducts(): readonly Product[] {
    return Array.from(this.products.values());
  }

  /** Looks up a product by id. */
  getProductById(id: string): Product | undefined {
    return this.products.get(id);
  }

  /** Looks up a product by slug. */
  getProductBySlug(slug: string): Product | undefined {
    return this.productsBySlug.get(slug);
  }

  /** Creates an empty cart for the given demo session and returns it. */
  createCart(sessionId: string): Cart {
    this.cartCounter += 1;
    const cartId = `cart-${this.scenario.name}-${this.cartCounter.toString(36)}-${this.ids.uuid()}`;
    const now = new Date(Date.now() + this.scenario.clockOffsetMs).toISOString();
    const cart: Cart = {
      id: cartId,
      version: 1,
      status: 'active',
      sessionId,
      items: [],
      createdAt: now,
    };
    this.carts.set(cart.id, cart);
    this.cartsBySession.set(sessionId, cart.id);
    return cart;
  }

  /** Returns the cart associated with a session, creating one if absent. */
  ensureCart(sessionId: string): Cart {
    const existing = this.cartsBySession.get(sessionId);
    if (existing) {
      const cart = this.carts.get(existing);
      if (cart) return cart;
    }
    return this.createCart(sessionId);
  }

  /** Looks up a cart by id. */
  getCart(cartId: string): Cart | undefined {
    return this.carts.get(cartId);
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

  private seed(): void {
    this.products.set(SEED_PRODUCT.id, SEED_PRODUCT);
    this.productsBySlug.set(SEED_PRODUCT.slug, SEED_PRODUCT);
  }
}
