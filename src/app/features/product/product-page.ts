import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ProductFacade } from './product.facade';
import { ProductGallery } from './product-gallery';
import { VariantSelector } from './variant-selector';
import { SpecificationAccordion } from './specification-accordion';

import { Button } from '../../shared/ui/button/button';
import { PriceBlock, type Money } from '../../shared/ui/price-block/price-block';
import { QuantityControl } from '../../shared/ui/quantity-control/quantity-control';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';

/**
 * T16 — product detail page (S3).
 *
 * Two-column desktop layout: gallery on the left (7/12) and the buy
 * panel on the right (5/12) with a 24 px column gap (T16-AC01). At
 * < 1024 px the layout collapses to a single column — gallery,
 * configuration and specifications stack vertically (T16-AC01, R22).
 *
 * The page is the consumer of `ProductFacade`. The facade owns the
 * atomic view model (product + selected variant + gallery + price +
 * stock + add-to-cart state) and the URL → SDK pipeline. The page
 * reads `vm()`, surfaces the loading / error / success states with
 * the shared `LoadingState` and `ErrorState` primitives and forwards
 * user clicks to the facade.
 *
 * States (R19):
 *   - loading — `LoadingState` skeleton with the page chrome around it.
 *   - error   — `ErrorState` with a retry that calls `facade.retry()`.
 *   - success — gallery, configuration, buy panel, specifications.
 *
 * Mobile purchase rail (T16-AC04): at < 1024 px a sticky rail
 * sticks to the bottom of the viewport carrying the price + the
 * primary CTA. The rail uses
 * `padding-bottom: calc(env(safe-area-inset-bottom) + var(--space-3))`
 * so iOS / Android notch devices do not obscure the button. The page
 * main has matching `padding-bottom` so the rail never hides
 * keyboard focus or page content.
 *
 * No 3D (T16-AC05): the baseline page does not ship a 3D script,
 * does not render a fake 3D button and does not lazy-import any
 * three.js / babylon.js bundle. Optional O01 (3D viewer) is gated
 * behind a future, explicitly approved change.
 */
@Component({
  selector: 'app-product-page',
  imports: [
    ProductGallery,
    VariantSelector,
    SpecificationAccordion,
    Button,
    PriceBlock,
    QuantityControl,
    ErrorState,
    LoadingState,
  ],
  template: `
    <main class="page" data-testid="product-page">
      <article class="card">
        @switch (state()) {
          @case ('loading') {
            <div class="loading" data-testid="product-loading">
              <app-loading-state variant="card" label="Termék betöltése"></app-loading-state>
            </div>
          }
          @case ('error') {
            <app-error-state
              [title]="'A termék nem tölthető be'"
              [message]="errorMessage()"
              [retryLabel]="'Újrapróbálom'"
              [pending]="false"
              [preserving]="true"
              (retryRequested)="onRetry()"
            ></app-error-state>
          }
          @default {
            <div class="layout">
              <div class="gallery">
                <app-product-gallery
                  [images]="gallery()"
                  [imageIndex]="galleryIndex()"
                  [productName]="productName()"
                  (imageChange)="onImageChange($event)"
                  (zoomChange)="onZoomChange($event)"
                ></app-product-gallery>
                @if (highlights().length > 0) {
                  <ul class="highlights" aria-label="A termék fő jellemzői">
                    @for (item of highlights(); track item) {
                      <li>{{ item }}</li>
                    }
                  </ul>
                }
              </div>

              <div class="buy">
                <header class="buy-header">
                  <p class="brand">{{ brand() }}</p>
                  <h1 class="name" data-testid="product-name">{{ productName() }}</h1>
                  @if (selectedColorName() !== null) {
                    <p class="meta">
                      <span class="meta-label">Szín:</span>
                      <span class="meta-value">{{ selectedColorName() }}</span>
                      <span class="meta-sep" aria-hidden="true">·</span>
                      <span class="meta-label">Tárhely:</span>
                      <span class="meta-value">{{ selectedStorageLabel() }}</span>
                    </p>
                  }
                </header>

                <section class="prices" aria-label="Árak">
                  <app-price-block
                    [money]="devicePrice()"
                    [label]="'Készülékár'"
                    [status]="devicePriceStatus()"
                  ></app-price-block>
                </section>

                <app-variant-selector
                  [product]="product()!"
                  [selectedColorCode]="selectedColorCode()"
                  [selectedStorageGb]="selectedStorageGb()"
                  [disabledCombinations]="disabledCombinations()"
                  (colorChange)="onColorChange($event)"
                  (storageChange)="onStorageChange($event)"
                ></app-variant-selector>

                <div class="quantity">
                  <label class="qty-label" [attr.for]="quantityControlId()">Darabszám</label>
                  <app-quantity-control
                    [id]="quantityControlId()"
                    [value]="quantity()"
                    [min]="1"
                    [max]="maxQuantity()"
                    [label]="'Darabszám'"
                    (quantityChanged)="onQuantityChanged($event)"
                  ></app-quantity-control>
                  @if (quantityOverMax()) {
                    <p class="hint hint--error" role="status">
                      Maximum {{ maxQuantity() }} darab rendelhető ebből a változatból.
                    </p>
                  }
                </div>

                <div class="cta-desktop">
                  <app-button
                    [variant]="'primary'"
                    [size]="'comfortable'"
                    [label]="'Kosárba teszem'"
                    [loadingLabel]="'Hozzáadás…'"
                    [disabled]="!addToCartEnabled()"
                    (pressed)="onAddToCart()"
                  ></app-button>
                  @if (addToCartReason() !== null && !addToCartEnabled()) {
                    <p class="hint" role="status">{{ addToCartReason() }}</p>
                  }
                </div>
              </div>
            </div>

            <section class="spec" aria-label="Műszaki adatok">
              <h2 class="section-title">Műszaki adatok</h2>
              <app-specification-accordion
                [groups]="specGroups()"
              ></app-specification-accordion>
            </section>

            @if (invalidQuery() !== null) {
              <p class="hint hint--error" role="status">
                A linkben megadott változat nem található: {{ invalidQuery() }}.
                Válassz a fenti listából.
              </p>
            }
          }
        }
      </article>

      @if (showStickyRail()) {
        <aside class="rail" data-testid="purchase-rail" aria-label="Kosárba helyezés">
          <div class="rail-price">
            <app-price-block
              [money]="devicePrice()"
              [label]="'Készülékár'"
              [status]="devicePriceStatus()"
            ></app-price-block>
          </div>
          <div class="rail-cta">
            <app-button
              data-testid="purchase-cta"
              [variant]="'primary'"
              [size]="'comfortable'"
              [label]="'Kosárba teszem'"
              [loadingLabel]="'Hozzáadás…'"
              [disabled]="!addToCartEnabled()"
              (pressed)="onAddToCart()"
            ></app-button>
          </div>
        </aside>
      }
    </main>
  `,
  styles: [
    `
      :host { display: block; }

      .page {
        position: relative;
        display: block;
        max-width: var(--layout-container-max);
        margin: 0 auto;
        padding: var(--space-6) var(--layout-gutter-mobile) var(--space-10);
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        box-sizing: border-box;
      }

      .card {
        display: flex;
        flex-direction: column;
        gap: var(--space-7);
      }

      .layout {
        display: grid;
        grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
        gap: var(--space-6);
        align-items: start;
      }

      .gallery,
      .buy {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
        min-width: 0;
      }

      .buy-header {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .brand {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .name {
        margin: 0;
        font-size: var(--type-section-title-mobile);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      @media (min-width: 640px) {
        .name { font-size: var(--type-section-title); }
      }

      .meta {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .meta-value {
        margin-left: var(--space-1);
        color: var(--color-text-primary);
        font-weight: var(--weight-medium);
      }

      .meta-sep { margin: 0 var(--space-2); }

      .highlights {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .highlights li {
        padding: var(--space-1) var(--space-3);
        border-radius: var(--radius-badge);
        background: var(--color-surface-section);
        color: var(--color-text-primary);
        font-size: var(--type-helper);
      }

      .prices {
        display: flex;
        align-items: center;
        gap: var(--space-4);
      }

      .quantity {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .qty-label {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .cta-desktop {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .spec {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      .section-title {
        margin: 0;
        font-size: var(--type-section-title-mobile);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      @media (min-width: 640px) {
        .section-title { font-size: var(--type-section-title); }
      }

      .hint {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .hint--error { color: var(--color-status-error); }

      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 24rem;
      }

      .rail {
        display: none;
      }

      /* T16-AC04 — mobile purchase rail.
         The rail sticks to the bottom of the viewport with safe-area
         padding so the primary CTA stays reachable on iOS / Android
         notch devices. The page main adds matching padding-bottom so
         the rail never covers keyboard focus or page content. */
      @media (max-width: 1023px) {
        .page {
          padding-bottom: calc(env(safe-area-inset-bottom) + 8rem);
        }

        .rail {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          position: sticky;
          bottom: 0;
          left: 0;
          right: 0;
          padding: var(--space-3) var(--layout-gutter-mobile);
          padding-bottom: calc(env(safe-area-inset-bottom) + var(--space-3));
          background: var(--color-surface-light);
          border-top: 1px solid var(--color-border-subtle);
          box-shadow: 0 -2px 8px rgba(23, 27, 31, 0.04);
          z-index: 10;
        }

        .rail-price { flex: 0 0 auto; }
        .rail-cta { flex: 1 1 auto; display: flex; justify-content: flex-end; }
      }

      /* T16-AC01 — desktop layout. */
      @media (min-width: 1024px) {
        .page {
          padding: var(--space-8) var(--layout-gutter-desktop) var(--space-10);
        }

        .layout {
          grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
          gap: var(--space-6);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        :host { animation: none; }
      }
    `,
  ],
})
export class ProductPage {
  /** Route slug passed in by `app.routes.ts`. The component also
   *  reads the same param from `ActivatedRoute` for the route-level
   *  query parameters (T16-AC02 variant query handling). */
  readonly slug = input<string>('');

  /** Emitted when the user asks to add the current selection to the
   *  cart. T18 (CartFacade integration) wires this to the actual
   *  mutation. Until then the page just exposes the intent. */
  readonly addRequested = output<{ variantId: string; quantity: number }>();

  private readonly facade = inject(ProductFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** UI-driven image index. The parent owns the active image through
   *  this signal so the gallery re-renders correctly on variant
   *  switches (the facade already resets the image signal). */
  private readonly localImageIndex = signal<number>(0);
  private readonly currentSlug = signal<string>('');

  readonly vm = this.facade.vm;

  readonly state = computed<'loading' | 'error' | 'success'>(() => {
    const v = this.vm();
    if (v.status === 'loading') return 'loading';
    if (v.status === 'error') return 'error';
    return 'success';
  });

  readonly product = computed(() => this.vm().product);
  readonly productName = computed<string>(() => this.vm().product?.name ?? '');
  readonly brand = computed<string>(() => this.vm().product?.brand ?? '');
  readonly highlights = computed<readonly string[]>(() => this.vm().product?.highlights ?? []);

  readonly specGroups = computed(() => this.vm().product?.specGroups ?? []);

  readonly gallery = computed(() => {
    const variant = this.vm().selectedVariant;
    if (variant === null) return [];
    return variant.images.map((i) => ({ src: i.src, alt: i.alt, width: i.width, height: i.height, id: i.id }));
  });

  readonly galleryIndex = computed(() => {
    // Prefer the local mirror when it points to a valid image.
    const list = this.gallery();
    if (list.length === 0) return 0;
    const local = this.localImageIndex();
    if (local >= 0 && local < list.length) return local;
    return Math.min(Math.max(this.vm().galleryIndex, 0), list.length - 1);
  });

  readonly selectedColorCode = computed(() => this.vm().selectedColorCode);
  readonly selectedStorageGb = computed<number | null>(() => this.vm().selectedStorageGb);
  readonly disabledCombinations = computed(() => this.vm().disabledCombinations);

  readonly selectedColorName = computed<string | null>(() => {
    const code = this.selectedColorCode();
    if (code === null) return null;
    const product = this.product();
    if (product === null) return null;
    const match = product.variants.find((v) => v.colorCode === code);
    return match ? match.colorName : code;
  });

  readonly selectedStorageLabel = computed<string | null>(() => {
    const gb = this.selectedStorageGb();
    if (gb === null) return null;
    return `${gb} GB`;
  });

  readonly devicePrice = computed<Money | null>(() => {
    const variant = this.vm().selectedVariant;
    return variant ? variant.price : null;
  });

  readonly devicePriceStatus = computed<'idle' | 'loading' | 'success' | 'empty' | 'error'>(() => {
    const v = this.vm();
    if (v.status === 'loading') return 'loading';
    if (v.status === 'error') return 'error';
    if (v.product === null) return 'idle';
    if (v.selectedVariant === null) return 'empty';
    return 'success';
  });

  readonly quantity = computed(() => this.vm().quantity);
  readonly quantityOverMax = computed(() => this.vm().quantityOverMax);
  readonly maxQuantity = computed<number>(() => this.vm().selectedVariant?.maxQuantity ?? 5);

  readonly addToCartEnabled = computed(() => this.vm().addToCart.enabled);
  readonly addToCartReason = computed<string | null>(() => this.vm().addToCart.reason);

  readonly invalidQuery = computed<string | null>(() => this.vm().invalidVariantQuery);

  readonly errorMessage = computed<string>(() => this.vm().error ?? 'Ismeretlen hiba.');

  /** Sticky purchase rail is shown when a product is loaded AND the
   *  viewport is narrow. The CSS handles the visual show/hide via a
   *  media query; this flag additionally guards the runtime so the
   *  components inside the rail are not mounted when not needed. */
  readonly showStickyRail = computed(() => this.state() === 'success');

  readonly quantityControlId = computed(() => 'product-quantity');

  constructor() {
    // Re-load the product whenever the slug input or the route's
    // slug param changes. The facade's `distinctUntilChanged` filter
    // prevents a no-op re-fire when the same slug + variant query is
    // emitted twice.
    effect(() => {
      const slug = this.slug() || this.route.snapshot.paramMap.get('slug') || '';
      if (slug.length === 0) return;
      if (slug === this.currentSlug()) return;
      this.currentSlug.set(slug);
      const params = new URLSearchParams(this.route.snapshot.queryParamMap.toString());
      this.facade.load(slug, params);
    });

    // Route navigation updates (e.g. browser back / forward) replay
    // through `queryParamMap` so the page stays in sync with the URL
    // even when the `slug` input is unchanged. We use the EMITTED
    // `queryParamMap` (not the route snapshot) so subsequent query
    // changes within the same component lifetime — e.g. picking a
    // different variant via `?variant=...` without remounting the
    // product page — re-parse the *current* params rather than the
    // snapshot captured at mount time.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((queryParamMap) => {
      const slug = this.slug() || this.route.snapshot.paramMap.get('slug') || '';
      if (slug.length === 0) return;
      const params = new URLSearchParams(queryParamMap.toString());
      this.facade.load(slug, params);
    });

    // Reset the local image index whenever the gallery changes (variant
    // switch).
    effect(() => {
      const list = this.gallery();
      if (list.length === 0) {
        this.localImageIndex.set(0);
        return;
      }
      const current = this.localImageIndex();
      if (current >= list.length) {
        this.localImageIndex.set(0);
      }
    });
  }

  onColorChange(colorCode: string): void {
    this.facade.selectColor(colorCode);
  }

  onStorageChange(storageGb: number): void {
    this.facade.selectStorage(storageGb);
  }

  onImageChange(index: number): void {
    const list = this.gallery();
    const image = list[index];
    if (image === undefined) return;
    this.localImageIndex.set(index);
    this.facade.selectImage(image.id ?? '');
  }

  onZoomChange(open: boolean): void {
    // No-op for now. The AccessibleDialog primitive handles focus,
    // backdrop and restoration; we accept the event so consumers can
    // gate further UI on zoom state if they need to.
    void open;
  }

  onQuantityChanged(value: number): void {
    this.facade.setQuantity(value);
  }

  onAddToCart(): void {
    const v = this.vm();
    if (v.selectedVariant === null) return;
    this.addRequested.emit({
      variantId: v.selectedVariant.id,
      quantity: v.quantity,
    });
  }

  onRetry(): void {
    this.facade.retry();
  }
}