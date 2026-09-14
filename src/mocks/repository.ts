/**
 * T05 — in-memory mock repository.
 *
 * The repository is the single source of truth for the demo
 * catalogue, carts, checkout drafts, payment intents, idempotency
 * keys and committed order receipts. Each scenario owns its own
 * Repository instance (created via `new Repository(scenario, ids)`)
 * so two E2E contexts cannot leak state into each other.
 *
 * T06 expanded the Product shape to the full variant matrix so
 * filter/sort/facet predicates can operate on every fixture field.
 * T07–T09 extend the surface with cart/checkout/payment/order
 * mutation methods.
 */

/** Money in whole HUF, no minor units. */
export type Money = { amount: number; currency: 'HUF' };

/** Single product image rendered by the catalogue and PDP. */
export type Image = {
  id: string;
  src: string;
  alt: string;
  width: number;
  height: number;
};

/** Stock state of a single variant. */
export type Availability = 'in_stock' | 'out_of_stock';

/** One SKU of a product (color × storage). */
export type Variant = {
  id: string;
  colorCode: string;
  colorName: string;
  swatchHex: string;
  storageGb: 128 | 256 | 512;
  price: Money;
  availability: Availability;
  maxQuantity: number;
  images: readonly Image[];
};

/** One spec row in a spec group. */
export type SpecRow = { label: string; value: string };

/** One spec group shown on the product page. */
export type SpecGroup = {
  id: string;
  title: string;
  rows: readonly SpecRow[];
};

/** Full catalogue product — matches the OpenAPI `Product` schema. */
export type Product = {
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
};

/** Full Cart shape — T07 owns version, totals, expiry. */
export type Cart = {
  id: string;
  version: number;
  status: 'active' | 'ordered';
  sessionId: string;
  items: readonly CartLine[];
  createdAt: string;
  expiresAt: string;
};

/** Full Cart line — T07 carries the variant snapshot the client renders. */
export type CartLine = {
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
};

/** Minimal OrderReceipt shape — T09 expands with full receipt items. */
export type OrderReceipt = {
  id: string;
  orderNumber: string;
  sessionId: string;
  createdAt: string;
  total: { amount: number; currency: string };
};

import type { Clock, Ids, ScenarioDescriptor } from './scenarios';

/** Cart expires 24h after creation. Matches the OpenAPI Cart.expiresAt example. */
const CART_EXPIRY_MS = 24 * 60 * 60 * 1000;

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
    private readonly clock: Clock,
  ) {}

  /** Read-only access to the scenario descriptor. */
  getScenario(): ScenarioDescriptor {
    return this.scenario;
  }

  /**
   * Replaces the catalog contents with the supplied fixtures. Called
   * by the catalog handlers (T06) so two E2E contexts cannot share
   * product state. The repository itself stays scenario-owned.
   */
  loadProducts(fixtures: readonly Product[]): void {
    this.products.clear();
    this.productsBySlug.clear();
    for (const product of fixtures) {
      this.products.set(product.id, product);
      this.productsBySlug.set(product.slug, product);
    }
  }

  /** Lists every product currently in the catalog. */
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

  /** Looks up a variant by id across every loaded product. */
  getVariant(variantId: string): { product: Product; variant: Variant } | undefined {
    for (const product of this.products.values()) {
      for (const variant of product.variants) {
        if (variant.id === variantId) {
          return { product, variant };
        }
      }
    }
    return undefined;
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
