import { Component, computed, inject, signal } from '@angular/core';
import { take } from 'rxjs';

import { Api } from '../../api/generated/api';
import { getConfig } from '../../api/generated/fn/configuration/get-config';
import { getProduct } from '../../api/generated/fn/catalog/get-product';
import type { Product } from '../../api/generated/models/product';

import { Hero } from './hero';
import { FeaturedProducts, type FeaturedSlot } from './featured-products';
import { HowDemoWorks } from './how-demo-works';

/**
 * Documented fallback slugs. Mirrors `DEMO_CONFIG.featuredSlugs` in the
 * mock so the page still renders four cards in their declared order if
 * the live `/config` call fails — the cards render in error state, never
 * in success state with invented products.
 */
const DOCUMENTED_FEATURED_SLUGS = [
  'demo-one-5g',
  'demo-air-5g',
  'demo-pro-5g',
  'demo-lite-5g',
] as const;

/**
 * `HomePage` — the marketing entry screen (S1).
 *
 * Loads the demo config, then in parallel fetches the four configured
 * featured products through the generated SDK. The orchestrator owns
 * the request lifecycle; the three child components are presentation
 * units that never see the network.
 *
 *   - `Hero` — dark charcoal hero (R02) with the H1, the lead copy,
 *     the primary CTA that opens the catalogue and three category
 *     shortcuts that set valid 5G / inStock URL filters.
 *   - `FeaturedProducts` — four product cards rendered from the live
 *     `getProduct` responses. Loading and error states never substitute
 *     invented figures for a missing price (R14).
 *   - `HowDemoWorks` — three explanatory tiles (böngészés, kosár,
 *     szimulált rendelés). The copy only describes the demo flow and
 *     never mentions tariffs / internet / services / payments / bank
 *     cards (AC04).
 */
@Component({
  selector: 'app-home-page',
  imports: [Hero, FeaturedProducts, HowDemoWorks],
  template: `
    <app-hero data-testid="hero" />
    <app-featured-products
      data-testid="featured"
      [slots]="slots()"
      (retryRequested)="retryFeatured()"
    />
    <app-how-demo-works data-testid="how-demo-works" />
  `,
  styles: [
    `
      :host {
        display: block;
        background: var(--color-surface-light);
        color: var(--color-text-primary);
      }
    `,
  ],
})
export class HomePage {
  private readonly api = inject(Api);

  /** IDs of the featured products, or `null` while the config is loading. */
  private readonly featuredSlugsSignal = signal<readonly string[] | null>(null);

  /** Per-slug request state captured from the SDK round-trips. */
  private readonly slotsBySlugSignal = signal<ReadonlyMap<string, FeaturedSlot>>(new Map());

  /** Stable list of `slots` derived from the two signals above. */
  readonly slots = computed<readonly FeaturedSlot[]>(() => {
    const ids = this.featuredSlugsSignal();
    if (ids === null) return [];
    const slots = this.slotsBySlugSignal();
    return ids.map((slug) => {
      const slot = slots.get(slug);
      return (
        slot ?? {
          slug,
          status: 'loading' as const,
          product: null,
          error: null,
        }
      );
    });
  });

  constructor() {
    this.loadFeatured();
  }

  /**
   * Load the demo config, then kick off a `getProduct` request for
   * every configured featured slug in parallel. Updates the per-slug
   * slot signals so the template can render loading / success / error
   * without ever inventing a price.
   */
  private loadFeatured(): void {
    this.api
      .invoke(getConfig)
      .pipe(take(1))
      .subscribe({
        next: (config) => {
          this.featuredSlugsSignal.set([...config.featuredSlugs]);
          this.slotsBySlugSignal.set(new Map());
          for (const slug of config.featuredSlugs) {
            this.loadOneFeatured(slug);
          }
        },
        error: () => {
          // Config load failed — render every documented slot in error
          // state so the user sees the same four positions with a retry
          // affordance, instead of an empty section.
          this.featuredSlugsSignal.set([...DOCUMENTED_FEATURED_SLUGS]);
          const next = new Map<string, FeaturedSlot>();
          for (const slug of DOCUMENTED_FEATURED_SLUGS) {
            next.set(slug, {
              slug,
              status: 'error',
              product: null,
              error: 'A demó konfiguráció nem tölthető be.',
            });
          }
          this.slotsBySlugSignal.set(next);
        },
      });
  }

  /** Issue a single `getProduct` request and fold the result into the slot map. */
  private loadOneFeatured(slug: string): void {
    this.api
      .invoke<{ slug: string }, Product>(getProduct, { slug })
      .pipe(take(1))
      .subscribe({
        next: (product) => {
          this.updateSlot(slug, () => ({
            slug,
            status: 'success',
            product,
            error: null,
          }));
        },
        error: (err: unknown) => {
          this.updateSlot(slug, () => ({
            slug,
            status: 'error',
            product: null,
            error: describeError(err),
          }));
        },
      });
  }

  /**
   * Replace one slot entry inside the readonly Map. The map is rebuilt
   * on every change so consumers can rely on identity-based change
   * detection without us ever mutating a previously-emitted value.
   */
  private updateSlot(slug: string, next: (prev: FeaturedSlot) => FeaturedSlot): void {
    const prev = this.slotsBySlugSignal();
    const current = prev.get(slug) ?? {
      slug,
      status: 'loading' as const,
      product: null,
      error: null,
    };
    const updated = next(current);
    const map = new Map(prev);
    map.set(slug, updated);
    this.slotsBySlugSignal.set(map);
  }

  /**
   * Re-fire every featured-product request. Called by the
   * `FeaturedProducts` retry button when one or more slots are in error.
   */
  retryFeatured(): void {
    const ids = this.featuredSlugsSignal();
    if (ids === null) {
      this.loadFeatured();
      return;
    }
    this.slotsBySlugSignal.set(new Map());
    for (const slug of ids) {
      this.loadOneFeatured(slug);
    }
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Ismeretlen hiba a termék betöltése közben.';
}
