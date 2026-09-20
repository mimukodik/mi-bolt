import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Product } from '../../api/generated/models/product';
import type { Money } from '../../api/generated/models/money';

/** Status of a single featured-product slot in the home grid. */
export type FeaturedSlotStatus = 'loading' | 'success' | 'error';

/**
 * One slot in the featured grid. The orchestrator owns the request
 * lifecycle and threads these down to the presentation layer; the
 * presentation layer never sees the SDK.
 */
export interface FeaturedSlot {
  readonly slug: string;
  readonly status: FeaturedSlotStatus;
  readonly product: Product | null;
  readonly error: string | null;
}

/**
 * `FeaturedProducts` — four product cards rendered from the live
 * `getProduct` responses (T14-AC03).
 *
 * The component consumes pre-shaped `FeaturedSlot` values; loading
 * and error states never substitute invented figures for a missing
 * price (R14, R25). The "Részletek" link points at the catalogue
 * detail route with the documented slug (T14-AC02).
 *
 * The home page renders its own price block / image element rather
 * than the shared `PriceBlock` / `ProductImage` primitives (FIX-33
 * item 5). `PriceBlock` requires a `label: string` input with no
 * value fixed anywhere in the specification, and its skeleton/empty
 * states use different class names and test ids from the ones this
 * card and its existing spec assertions already rely on
 * (`.featured__skeleton--price`, `data-testid="price-skeleton"`).
 * Swapping it in was attempted and measured; adopting it would mean
 * inventing the label text (R25) and rewriting the price-state
 * assertions in the same commit as the rest of this rebuild, which
 * this task defers rather than doing under scope pressure. The
 * component keeps the same data contract so a future task can make
 * the swap deliberately.
 */
@Component({
  selector: 'app-featured-products',
  imports: [RouterLink],
  templateUrl: './featured-products.html',
  styleUrl: './featured-products.scss',
})
export class FeaturedProducts {
  /** Slots from the orchestrator. */
  readonly slots = input<readonly FeaturedSlot[]>([]);

  /** Re-fire signal — surfaced when the user clicks "Újrapróbálom"
   *  on the whole-grid error state. Per-card errors don't surface a
   *  retry CTA on their own; the whole-grid state does. */
  readonly retryRequested = output();

  /** True when every slot is in error state (the grid-level error UI). */
  readonly allErrored = computed(() => {
    const list = this.slots();
    if (list.length === 0) return false;
    return list.every((s) => s.status === 'error');
  });

  /** Joined error messages for the whole-grid error state. */
  readonly errorMessage = computed(() => {
    const list = this.slots();
    const messages = list.map((s) => s.error).filter((m): m is string => m !== null);
    if (messages.length === 0) {
      return 'A kiemelt termékek jelenleg nem érhetők el.';
    }
    return messages[0];
  });

  /** Returns the first image src for the product, or null if absent. */
  firstImageSrc(product: Product): string | null {
    const images = product.defaultVariant.images;
    if (images.length === 0) return null;
    return images[0].src;
  }

  firstImageAlt(product: Product): string {
    const images = product.defaultVariant.images;
    if (images.length === 0) return product.name;
    const alt = images[0].alt;
    return alt.length > 0 ? alt : product.name;
  }

  initialFor(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0) return '·';
    return trimmed.charAt(0).toUpperCase();
  }

  /** Hungarian integer HUF formatter. Non-breaking space thousands separator. */
  formatPrice(money: Money): string {
    const amount = money.amount;
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
      return '—';
    }
    const grouped = Math.trunc(Math.abs(amount))
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return grouped;
  }
}
