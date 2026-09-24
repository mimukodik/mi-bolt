import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CatalogItem } from '@mi-bolt/api/models/catalog-item';
import { ProductCard } from '../catalog/product-card';
import { Button } from '../../shared/ui/button/button';
import { SkeletonLeave } from '../../shared/ui/skeleton-leave/skeleton-leave';

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
 * `FeaturedProducts`: up to four cards rendered from the live
 * `listProducts({ featured: true })` response (T14-AC03). The component
 * consumes one pre-shaped `FeaturedState`; loading and error states never
 * substitute invented figures for a missing price (R14, R25). Each item
 * renders through the shared catalogue `ProductCard` (swatches, price
 * block, "Megnézem" link to `/telefonok/<slug>?variant=<id>`), the first
 * card's photo eager and the rest lazy (MIM-210, MIM-213).
 */
@Component({
  selector: 'app-featured-products',
  imports: [RouterLink, Button, ProductCard, SkeletonLeave],
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
}
