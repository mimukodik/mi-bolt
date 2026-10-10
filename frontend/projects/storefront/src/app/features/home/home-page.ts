import { Component, DestroyRef, inject, signal } from '@angular/core';
import { take } from 'rxjs';

import { PriceRefresh } from '../../shared/utils/price-refresh';
import { Api } from '@mi-bolt/api/api';
import { listProducts } from '@mi-bolt/api/fn/catalog/list-products';

import { Hero } from './hero';
import { FeaturedProducts, type FeaturedState } from './featured-products';
import { HowDemoWorks } from './how-demo-works';

/**
 * `HomePage` — the marketing entry screen (S1).
 *
 * Loads the curated featured list through a single `listProducts({ featured: true })`
 * call; the backend returns up to four `CatalogItem`s in its own order.
 * The orchestrator owns the request lifecycle; the three child components
 * are presentation units that never see the network.
 *
 *   - `Hero` — dark charcoal hero (R02) with the H1, the lead copy,
 *     the primary CTA that opens the catalogue and three category
 *     shortcuts that navigate to `/telefonok` with `is5g` / `inStock`
 *     query parameters.
 *   - `FeaturedProducts` — up to four product cards rendered from the live
 *     `listProducts` response. Loading and error states never substitute
 *     invented figures for a missing price (R14).
 *   - `HowDemoWorks` — three explanatory tiles (böngészés, kosár,
 *     szimulált rendelés). The copy only describes the demo flow and
 *     never mentions tariffs / internet / services / payments / bank
 *     cards (AC04).
 */
@Component({
  selector: 'app-home-page',
  imports: [Hero, FeaturedProducts, HowDemoWorks],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  private readonly api = inject(Api);
  private readonly priceRefresh = new PriceRefresh(inject(DestroyRef), () => {
    this.loadFeatured();
  });

  /**
   * Hero heading text, relocated character-for-character from
   * `hero.html`'s H1 so `Hero` can declare `title`/`subtitle` as the
   * signal inputs `docs/spec/components.md:240` requires (FIX-64).
   * `title` is the plain first line; `subtitle` is the accent-styled
   * second line.
   */
  protected readonly heroTitle = 'A következő mobilod.';
  protected readonly heroSubtitle = 'Egyszerűen.';

  /** Single featured-list request state captured from the SDK round-trip. */
  private readonly featuredSignal = signal<FeaturedState>({
    status: 'loading',
    items: [],
    error: null,
  });

  /** Read-only view of the featured-list state. */
  readonly featured = this.featuredSignal.asReadonly();

  constructor() {
    this.loadFeatured();
  }

  /**
   * Issue a single `listProducts({ featured: true })` request and
   * fold the page result into the grid signal. Loading and error
   * states never invent items.
   */
  private loadFeatured(): void {
    this.featuredSignal.set({ status: 'loading', items: [], error: null });
    this.api
      .invoke(listProducts, { featured: true })
      .pipe(take(1))
      .subscribe({
        next: (page) => {
          this.priceRefresh.schedule(page.serverTime, page.nextPriceChangeAt);
          this.featuredSignal.set({
            status: 'success',
            items: page.items,
            error: null,
          });
        },
        error: (err: unknown) => {
          this.featuredSignal.set({
            status: 'error',
            items: [],
            error: describeError(err),
          });
        },
      });
  }

  /**
   * Re-fire the featured-list request. Called by the
   * `FeaturedProducts` retry button on the whole-grid error state.
   */
  retryFeatured(): void {
    this.loadFeatured();
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Ismeretlen hiba a termék betöltése közben.';
}
