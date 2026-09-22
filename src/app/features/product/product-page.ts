import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink, type ParamMap } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { BREADCRUMB_VISIBLE } from '../../core/navigation/breadcrumb-visibility';

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
import { AddToCart } from './add-to-cart';
import { MobileBuyRail } from './mobile-buy-rail';
import { ProductCard } from '../catalog/product-card';

import { CartFacade } from '../cart/cart.facade';

import { Button } from '../../shared/ui/button/button';
import { PriceBlock, type Money } from '../../shared/ui/price-block/price-block';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { StatusMessage } from '../../shared/ui/status-message/status-message';

import type { UiProblem } from '../../shared/types/ui-problem';

import type { Availability } from '../../api/generated/models/availability';
import type { CartItem } from '../../api/generated/models/cart-item';
import type { CatalogItem } from '../../api/generated/models/catalog-item';
import type { Variant } from '../../api/generated/models/variant';

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
 * Mobile purchase rail (T16-AC04): at < 1024 px a fixed rail
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
    ErrorState,
    LoadingState,
    AddToCart,
    MobileBuyRail,
    StatusMessage,
    ProductCard,
    RouterLink,
  ],
  templateUrl: './product-page.html',
  styleUrl: './product-page.scss',
})
export class ProductPage {
  /** Route slug passed in by `app.routes.ts`. The component also
   *  reads the same param from `ActivatedRoute` for the route-level
   *  query parameters (T16-AC02 variant query handling). */
  readonly slug = input<string>('');

  private readonly facade = inject(ProductFacade);
  private readonly cartFacade = inject(CartFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly currentSlug = signal<string>('');

  readonly vm = this.facade.vm;

  readonly state = computed<'loading' | 'error' | 'notfound' | 'success'>(() => {
    const v = this.vm();
    if (v.status === 'loading') return 'loading';
    if (v.status === 'notfound') return 'notfound';
    if (v.status === 'error') return 'error';
    return 'success';
  });

  readonly product = computed(() => this.vm().product);
  readonly productName = computed<string>(() => this.vm().product?.name ?? '');
  /** Switched off for now (MIM-234); the nav stays in place behind this flag. */
  readonly breadcrumbVisible = BREADCRUMB_VISIBLE;
  readonly highlights = computed<readonly string[]>(() => this.vm().product?.highlights ?? []);

  /** Marketing description from the wire model. Empty string while the
   *  product is loading, so the template can skip the paragraph. */
  readonly description = computed<string>(() => this.vm().product?.description ?? '');

  /** Availability of the currently selected variant, or null when no
   *  variant is selected yet. Never defaulted to in-stock. */
  readonly selectedAvailability = computed<Availability | null>(
    () => this.vm().selectedVariant?.availability ?? null,
  );

  /** Stock sentence for the selected variant. Empty while unknown. */
  readonly stockMessage = computed<string>(() => {
    const availability = this.selectedAvailability();
    if (availability === null) return '';
    return availability === 'in_stock'
      ? 'Raktáron a demó készletben'
      : 'Ez a konfiguráció elfogyott a demó készletből.';
  });

  readonly specGroups = computed(() => this.vm().product?.specGroups ?? []);

  readonly gallery = computed(() => {
    const variant = this.vm().selectedVariant;
    if (variant === null) return [];
    return variant.images;
  });

  /** Id of the image the facade's atomic view model currently selects.
   *  `ProductGallery` resolves its active image by this id rather
   *  than by position (FIX-50 item 3). */
  readonly selectedImageId = computed<string>(() => this.vm().selectedImage?.id ?? '');

  readonly selectedVariant = computed(() => this.vm().selectedVariant);

  /** Every variant of the loaded product, for `VariantSelector`
   *  (FIX-50 item 4). Empty until a product has loaded. */
  readonly variants = computed(() => this.product()?.variants ?? []);

  readonly devicePrice = computed<Money | null>(() => {
    const variant = this.vm().selectedVariant;
    return variant !== null ? variant.price : null;
  });

  readonly devicePriceStatus = computed<'idle' | 'loading' | 'success' | 'empty' | 'error'>(() => {
    const v = this.vm();
    if (v.status === 'loading') return 'loading';
    if (v.status === 'error') return 'error';
    if (v.product === null) return 'idle';
    if (v.selectedVariant === null) return 'empty';
    return 'success';
  });

  readonly addToCartEnabled = computed(() => this.vm().addToCart.enabled);
  readonly addToCartReason = computed<string | null>(() => this.vm().addToCart.reason);

  /** `AddToCartControl`'s contract (components.md:450) has no
   *  `enabled` input of its own — the only way it can be disabled is
   *  `variant === null`. The page therefore withholds the variant
   *  whenever `addToCart.enabled` is false (invalid deep-link query
   *  or out of stock), rather than handing over a variant the
   *  component would otherwise treat as addable. */
  readonly addableVariant = computed<Variant | null>(() =>
    this.addToCartEnabled() ? this.selectedVariant() : null,
  );

  /** In-flight state of the page's single cart mutation. Both the
   *  desktop control and the mobile rail read it; neither owns one of
   *  its own (docs/spec/architecture.md:57, components.md:409). */
  readonly addPending = signal<boolean>(false);

  /** Last cart-mutation failure, or null. Same single owner. */
  readonly addError = signal<UiProblem | null>(null);

  /** Confirmation text after a successful add. `AddToCartControl`
   *  declares no input for its own `success` state
   *  (components.md:450-452), so the page signals it directly. */
  readonly addSuccessMessage = signal<string | null>(null);

  /** View handle on the desktop `AddToCart` control. Used to return
   *  focus to the add CTA when the success banner is dismissed (the
   *  StatusMessage primitive is a sibling, not a descendant of the
   *  control, so it has no native way to land focus back). */
  private readonly addToCart = viewChild(AddToCart);

  readonly invalidQuery = computed<string | null>(() => this.vm().invalidVariantQuery);

  readonly related = computed<readonly CatalogItem[]>(() => this.vm().related);

  readonly errorMessage = computed<string>(() => this.vm().error ?? 'Ismeretlen hiba.');

  /** Not-found copy names the requested slug when one was captured
   *  (FIX-23 — S4.5's dedicated not-found state, distinct from a
   *  transient request error). */
  readonly notFoundMessage = computed<string>(() => {
    const slug = this.currentSlug();
    return slug.length > 0
      ? `A(z) „${slug}” azonosítójú termék nem található. Nézd meg a telefonok listáját.`
      : 'A keresett termék nem található. Nézd meg a telefonok listáját.';
  });

  /** Sticky purchase rail is shown when a product is loaded AND the
   *  viewport is narrow. The CSS handles the visual show/hide via a
   *  media query; this flag additionally guards the runtime so the
   *  components inside the rail are not mounted when not needed. */
  readonly showStickyRail = computed(() => this.state() === 'success');

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
        // Skip the reload this page's own `syncVariantQuery()` navigation
        // triggers: without this guard every swatch click would replay
        // through `facade.load()`, resetting the status to `loading` and
        // flashing the skeleton (FIX-23 item 3).
        const incoming = queryParamMap.get('variant');
        const applied = this.facade.currentVariantParams().get('variant');
        if (slug === this.currentSlug() && incoming !== null && incoming === applied) return;
        const params = paramMapToSearchParams(queryParamMap);
        this.facade.load(slug, params);
      });
  }

  /** Resolves the exact variant `VariantSelector` emits and mirrors it
   *  into the URL (FIX-50 item 4; FIX-23 owns the URL round trip). */
  onVariantSelected(variantId: string): void {
    this.facade.selectVariant(variantId);
    this.syncVariantQuery();
  }

  /** Mirror the current selection into `?variant=` so a reload and a
   *  shared link restore it (screens.md S3 route contract). */
  private syncVariantQuery(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { variant: this.facade.currentVariantParams().get('variant') },
      queryParamsHandling: 'merge',
      replaceUrl: false,
    });
  }

  onImageSelected(imageId: string): void {
    this.facade.selectImage(imageId);
  }

  onZoomRequested(_imageId: string): void {
    // No-op: the gallery already opened the dialog for this image
    // before emitting. Accepted so a future consumer can react to
    // which image was zoomed without a page change.
  }

  /** Performs the one cart mutation this page owns. Called by the
   *  desktop control's `(addRequested)` and by the mobile rail's
   *  `(addRequested)` (docs/spec/architecture.md:57, components.md:409:
   *  "CartFacade injection only at container/add orchestrator"). */
  async onAddRequested(intent: { variantId: string; quantity: number }): Promise<void> {
    if (this.addPending()) return;
    const selection = this.selectedVariant();
    const productName = this.productName();
    this.addPending.set(true);
    this.addError.set(null);
    this.addSuccessMessage.set(null);
    try {
      await this.cartFacade.ensureCart();
      await this.cartFacade.addItem(intent.variantId, intent.quantity);
      // The queue's dispatch resolves the failure signals for THIS
      // intent synchronously before `addItem()`'s own promise
      // settles, so reading them here reflects this call's own
      // outcome rather than a stale, unrelated failure.
      if (this.cartMutationFailed()) {
        this.addError.set({
          code: this.cartFacade.error()?.code ?? 'UNKNOWN',
          message: 'A termék hozzáadása nem sikerült; a kosár változatlan.',
          fieldErrors: [],
          retryable: true,
        });
        return;
      }
      const added = this.findAddedLine(intent.variantId);
      if (added !== null && selection !== null) {
        this.addSuccessMessage.set(
          this.composeAddedMessage(
            productName,
            selection.colorName,
            selection.storageGb,
            added.quantity,
          ),
        );
      }
    } finally {
      this.addPending.set(false);
    }
  }

  /** The mobile rail emits `void` per components.md:478, so the page
   *  supplies the intent from its own view model. */
  onRailAddRequested(): void {
    const v = this.vm();
    if (v.selectedVariant === null) return;
    void this.onAddRequested({ variantId: v.selectedVariant.id, quantity: 1 });
  }

  private cartMutationFailed(): boolean {
    return (
      this.cartFacade.error() !== null ||
      this.cartFacade.conflict() !== null ||
      this.cartFacade.cartExpired()
    );
  }

  /** Locates the freshly added line in the local cart snapshot. The
   *  cart mock returns a deterministic id per variant, so the line is
   *  the one whose `variantId` matches the user's selection. Returns
   *  the line itself so the caller can read its current `quantity`,
   *  which on a repeated add of the same variant is the cart total —
   *  not the amount just dispatched. */
  private findAddedLine(variantId: string): CartItem | null {
    const cart = this.cartFacade.cart();
    if (cart === null) return null;
    return cart.items.find((item) => item.variantId === variantId) ?? null;
  }

  /** Composes the Hungarian confirmation body the StatusMessage
   *  announces: "<product>, <color>, <storage> GB – <qty> darab a
   *  kosárban." `<qty>` is the line's quantity in the cart — what the
   *  shopper will actually see in their basket — not the amount just
   *  dispatched. The page never invents numbers — every value comes
   *  from the wire-shaped selection it already holds. */
  private composeAddedMessage(
    productName: string,
    colorName: string,
    storageGb: number,
    quantity: number,
  ): string {
    return `${productName}, ${colorName}, ${String(storageGb)} GB – ${String(quantity)} darab a kosárban.`;
  }

  /** Dismisses the success banner and hands focus back to the desktop
   *  add CTA. Wired to the success StatusMessage's `(dismissed)` so
   *  closing it leaves the keyboard user on the same control they
   *  pressed to add the item. */
  onSuccessDismissed(): void {
    this.addSuccessMessage.set(null);
    this.addToCart()?.focusButton();
  }

  onRetry(): void {
    this.facade.retry();
  }

  onBackToCatalog(): void {
    void this.router.navigate(['/telefonok']);
  }
}
