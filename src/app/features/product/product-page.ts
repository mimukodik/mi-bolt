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
import { ActivatedRoute, type ParamMap } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

function paramMapToSearchParams(params: ParamMap): URLSearchParams {
  const search = new URLSearchParams();
  for (const key of params.keys) {
    for (const v of params.getAll(key)) {
      search.append(key, v);
    }
  }
  return search;
}

import { ProductFacade } from './product.facade';
import { ProductGallery } from './product-gallery';
import { VariantSelector } from './variant-selector';
import { SpecificationAccordion } from './specification-accordion';

import { CartFacade } from '../cart/cart.facade';

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
  templateUrl: './product-page.html',
  styleUrl: './product-page.scss',
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
  private readonly cartFacade = inject(CartFacade);
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
    return variant.images.map((i) => ({
      src: i.src,
      alt: i.alt,
      width: i.width,
      height: i.height,
      id: i.id,
    }));
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
    return `${String(gb)} GB`;
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
      const inputSlug = this.slug();
      const slug = (inputSlug !== '' ? inputSlug : this.route.snapshot.paramMap.get('slug')) ?? '';
      if (slug.length === 0) return;
      if (slug === this.currentSlug()) return;
      this.currentSlug.set(slug);
      const params = paramMapToSearchParams(this.route.snapshot.queryParamMap);
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
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((queryParamMap) => {
        const inputSlug = this.slug();
        const slug =
          (inputSlug !== '' ? inputSlug : this.route.snapshot.paramMap.get('slug')) ?? '';
        if (slug.length === 0) return;
        const params = paramMapToSearchParams(queryParamMap);
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
    if (index < 0 || index >= list.length) return;
    const image = list[index];
    this.localImageIndex.set(index);
    this.facade.selectImage(image.id);
  }

  onZoomChange(_open: boolean): void {
    // No-op for now. The AccessibleDialog primitive handles focus,
    // backdrop and restoration; we accept the event so consumers can
    // gate further UI on zoom state if they need to.
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
    // The T17 CartFacade is the single owner of the cart mutation
    // queue (If-Match binding, idempotency, conflict replay) and the
    // authoritative snapshot the header / cart page read. Wires the
    // "Kosárba teszem" CTA on this page to the real backend so a
    // click lands a POST /api/v1/carts/:id/items intent. The facade
    // surfaces non-recoverable failures on its `error` / `conflict`
    // / `cartGone` / `cartExpired` signals — it does not throw on
    // HTTP errors — so a fire-and-forget `addItem()` is the right
    // call shape here.
    const variantId = v.selectedVariant.id;
    const quantity = v.quantity;
    void this.cartFacade.ensureCart().then(() => {
      void this.cartFacade.addItem(variantId, quantity);
    });
  }

  onRetry(): void {
    this.facade.retry();
  }
}
