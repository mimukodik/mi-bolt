/**
 * Per-handler-list stock ledger for the shop mock.
 *
 * The architecture (`docs/spec/architecture.md:121`) says an order
 * commit must "decrement stock exactly once", with "Full rollback on
 * conflict", and the catalogue fixture has been the only source of
 * truth on variant stock up to now: the demo stock of a variant is
 * its fixture `maxQuantity`, the line cap the fixture generator
 * derives from the source stock
 * (`frontend/scripts/build-catalog-fixture.mjs:91-92`).
 *
 * A `StockLedger` lives as long as one handler list: every page load
 * (the browser worker) and every spec that calls `createHandlers(...)`
 * builds a fresh one through `stockLedger.current = new StockLedger()`,
 * and `seedFromReceipts` rebuilds the sales from the persisted
 * receipts on a reload, so the snapshot gains no field. A taken
 * variant stays taken until the next page load.
 */
import type { Availability } from '@mi-bolt/api/models/availability';
import type { Product } from '@mi-bolt/api/models/product';
import type { OrderReceipt } from '@mi-bolt/api/models/order-receipt';

import type { CatalogEntry } from '../catalog/catalog-store';

/**
 * Module-local handle the catalogue, cart and order handlers read
 * through `stockLedger.current?.applyTo…`. Set to a fresh `StockLedger`
 * in `checkout/checkout.handlers.ts` at the top of each handler list
 * and to a seeded one when the options carry a snapshot.
 */
export const stockLedger: { current: StockLedger | null } = { current: null };

export class StockLedger {
  /** Variant ids a once-only fault took from the catalogue at this list. */
  private readonly taken = new Set<string>();
  /** Units sold per variant id, summed across every committed order. */
  private readonly sold = new Map<string, number>();

  /** True for any variant id a fault has taken this list. */
  isTaken(variantId: string): boolean {
    return this.taken.has(variantId);
  }

  /** Mark a variant id as taken at this list; subsequent reads see no stock. */
  take(variantId: string): void {
    this.taken.add(variantId);
  }

  /** Add the line's `quantity` to its variant's sold count. */
  recordSale(lines: readonly { variantId: string; quantity: number }[]): void {
    for (const line of lines) {
      this.sold.set(line.variantId, (this.sold.get(line.variantId) ?? 0) + line.quantity);
    }
  }

  /** Sum every receipt line's quantity into the corresponding variant's sold count. */
  seedFromReceipts(receipts: readonly OrderReceipt[]): void {
    const lines: { variantId: string; quantity: number }[] = [];
    for (const receipt of receipts) {
      for (const item of receipt.items) {
        lines.push({ variantId: item.variantId, quantity: item.quantity });
      }
    }
    this.recordSale(lines);
  }

  /**
   * How many units of this variant the ledger still has to give out.
   * 0 when the variant was taken, otherwise `max(0, maxQuantity - sold)`.
   */
  remaining(variant: { id: string; maxQuantity: number }): number {
    if (this.taken.has(variant.id)) return 0;
    const used = this.sold.get(variant.id) ?? 0;
    return Math.max(0, variant.maxQuantity - used);
  }

  /**
   * New variant whose `maxQuantity` is the ledger's `remaining` for
   * this id, and `availability` is `out_of_stock` when that is 0.
   * Never mutates the argument.
   */
  applyToVariant<T extends { id: string; maxQuantity: number; availability: Availability }>(
    variant: T,
  ): T {
    const remaining = this.remaining(variant);
    if (
      remaining === variant.maxQuantity &&
      (remaining > 0 || variant.availability === 'out_of_stock')
    ) {
      return variant;
    }
    return {
      ...variant,
      maxQuantity: remaining,
      availability: remaining === 0 ? 'out_of_stock' : variant.availability,
    };
  }

  /** New product whose every variant has been pushed through `applyToVariant`. */
  applyToProduct(product: Product): Product {
    return {
      ...product,
      variants: product.variants.map((variant) => this.applyToVariant(variant)),
    };
  }

  /**
   * New entry whose `product` is `applyToProduct(entry.product)`,
   * whose `variant` is `applyToVariant(entry.variant)`, and whose
   * every colour option takes the `availability` of the variant with
   * the same `variantId` in that new product (its own when none
   * matches).
   */
  applyToEntry(entry: CatalogEntry): CatalogEntry {
    const product = this.applyToProduct(entry.product);
    const variant = this.applyToVariant(entry.variant);
    const variantsById = new Map(product.variants.map((v) => [v.id, v] as const));
    const colors = entry.colors.map((option) => {
      const v = variantsById.get(option.variantId);
      const availability: Availability = v !== undefined ? v.availability : option.availability;
      return { ...option, availability };
    });
    return { ...entry, product, variant, colors };
  }
}
