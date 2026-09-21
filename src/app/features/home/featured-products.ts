import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CatalogItem } from '../../api/generated/models/catalog-item';
import type { Money } from '../../api/generated/models/money';
import { Button } from '../../shared/ui/button/button';
import { ProductImage } from '../../shared/ui/product-image/product-image';

/** Status of the whole featured grid in the home page. */
export type FeaturedStatus = 'loading' | 'success' | 'error';

/**
 * Whole-grid state for the home featured section. The orchestrator owns
 * the request lifecycle and threads this down to the presentation layer;
 * the presentation layer never sees the SDK.
 */
export interface FeaturedState {
  readonly status: FeaturedStatus;
  readonly items: readonly CatalogItem[];
  readonly error: string | null;
}

/**
 * `FeaturedProducts` — up to four product cards rendered from the live
 * `listProducts({ featured: true })` response (T14-AC03).
 *
 * The component consumes a single pre-shaped `FeaturedState` value;
 * loading and error states never substitute invented figures for a
 * missing price (R14, R25). The "Részletek" link points at the
 * catalogue detail route with the documented slug and variant id
 * (T14-AC02).
 *
 * The home page renders its own price block rather than the shared
 * `PriceBlock` primitive (FIX-33 item 5). `PriceBlock` requires a
 * `label: string` input with no value fixed anywhere in the
 * specification, and its skeleton/empty states use different class
 * names and test ids from the ones this card and its existing spec
 * assertions already rely on (`.featured__skeleton--price`,
 * `data-testid="price-skeleton"`). Swapping it in was attempted and
 * measured; adopting it would mean inventing the label text (R25)
 * and rewriting the price-state assertions in the same commit as
 * the rest of this rebuild, which this task defers rather than
 * doing under scope pressure. The component keeps the same data
 * contract so a future task can make the swap deliberately. The
 * images themselves render through the shared `ProductImage`
 * primitive (`MIM-210`), with the first card's photo eager-loaded
 * (`loading="eager"`) and the rest lazy.
 */
@Component({
  selector: 'app-featured-products',
  imports: [RouterLink, Button, ProductImage],
  templateUrl: './featured-products.html',
  styleUrl: './featured-products.scss',
})
export class FeaturedProducts {
  /** Whole-grid state from the orchestrator. */
  readonly state = input.required<FeaturedState>();

  /** Re-fire signal — surfaced when the user clicks "Újrapróbálom"
   *  on the whole-grid error state. */
  readonly retryRequested = output();

  /** True when the grid is in error state. */
  readonly allErrored = computed(() => this.state().status === 'error');

  /** Joined error message for the whole-grid error state. */
  readonly errorMessage = computed(() => {
    const err = this.state().error;
    return err !== null && err.length > 0 ? err : 'A kiemelt termékek jelenleg nem érhetők el.';
  });

  /** True while the grid is loading. */
  readonly loading = computed(() => this.state().status === 'loading');

  /** Items for the success branch. */
  readonly items = computed(() => this.state().items);

  /** Hungarian integer HUF formatter. Non-breaking space thousands separator. */
  formatPrice(money: Money): string {
    const amount = money.amount;
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
      return '—';
    }
    const digits = Math.trunc(Math.abs(amount)).toString();
    let grouped = '';
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) {
        grouped += ' ';
      }
      grouped += digits.charAt(i);
    }
    return grouped;
  }
}
