/**
 * T15 — root-provided signal facade for the product detail page.
 *
 * Owns the product data, the selected variant and the gallery index.
 * Renders an atomic view model `vm` so the page never reads from two
 * signals and gets mismatched price / stock / image data.
 *
 * The read path is a per-facade controller built on RxJS:
 *
 *   routeChange$ (slug, variantQuery)
 *     → distinctUntilChanged
 *     → tap(reset selection + status = loading)
 *     → switchMap(api.getProduct)
 *     → tap(set product | set error)
 *
 * `switchMap` (AC04) ensures a slow old response never overwrites a
 * newer route — the in-flight observable is unsubscribed on every
 * new emission. `distinctUntilChanged` collapses a no-op
 * re-emission of the same slug + variant query so the page never
 * re-fires the SDK when only navigation event metadata changes.
 *
 * The variant-selection rules live in `variant-selection.ts`. This
 * file is responsible for signal plumbing and SDK calls; the pure
 * rules — disabled combinations, atomic view-model assembly,
 * add-to-cart reasoning, the URL codec — live next door and are
 * tested directly.
 */

import { computed, DestroyRef, inject, Service, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import type { Subscription } from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  finalize,
  map,
  of,
  Subject,
  switchMap,
  take,
  tap,
} from 'rxjs';

import { PriceRefresh } from '../../shared/utils/price-refresh';
import { Api } from '@mi-bolt/api/api';
import { getProduct } from '@mi-bolt/api/fn/catalog/get-product';
import { listRelatedProducts } from '@mi-bolt/api/fn/catalog/list-related-products';
import type { CatalogItem } from '@mi-bolt/api/models/catalog-item';
import type { Image } from '@mi-bolt/api/models/image';
import type { Product } from '@mi-bolt/api/models/product';
import type { Variant } from '@mi-bolt/api/models/variant';

import {
  computeAddToCartState,
  computeDisabledCombinations,
  defaultVariantOf,
  parseVariantQuery,
  selectImageFromGallery,
  selectInitialVariant,
  selectVariantByPair,
  serializeVariantQuery,
  type AddToCartState,
  type DisabledCombination,
  type InitialVariantSelection,
} from './variant-selection';

/** Status of the most recent product load. */
export type ProductStatus = 'idle' | 'loading' | 'success' | 'notfound' | 'error';

/** A point-in-time view of the product page, derived from the live signals. */
export interface ProductVm {
  readonly status: ProductStatus;
  readonly product: Product | null;
  /** The variant the price, stock, maxQuantity and gallery belong to. */
  readonly selectedVariant: Variant | null;
  readonly selectedImage: Image | null;
  readonly gallery: readonly Image[];
  /** Index of `selectedImage` inside `gallery`, or -1 when empty. */
  readonly galleryIndex: number;
  readonly selectedColorCode: string | null;
  readonly selectedStorageGb: number | null;
  readonly disabledCombinations: readonly DisabledCombination[];
  readonly invalidVariantQuery: string | null;
  readonly addToCart: AddToCartState;
  readonly error: string | null;
  readonly variantQuery: string | null;
  readonly slug: string | null;
  /** Up to four related catalog entries for the same brand / storage
   *  family. Empty until the related request settles; the strip is
   *  never an error state on its own — a failed request renders no
   *  section rather than blocking the product. */
  readonly related: readonly CatalogItem[];
  /** True while the related request for the loaded product runs, so
   *  the strip can show its card skeletons (docs/design/yettel.md,
   *  "Product card skeleton"). False before the product loads, after
   *  the related request answers or fails, and on a route change. */
  readonly relatedLoading: boolean;
}

/** Extract a human-readable message from an SDK error. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Ismeretlen hiba a termék betöltése közben.';
}

/** True when the SDK error is a 404 — an unknown slug, not a transient failure. */
export function isProductNotFound(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 404;
}

/**
 * Root-provided facade. Single instance per application; consumers
 * inject it directly (no token wrapper) so swapping the facade for
 * a test stub is a single TestBed provider line.
 */
@Service()
export class ProductFacade {
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);

  private readonly priceRefresh = new PriceRefresh(this.destroyRef, () => {
    this.refreshProduct();
  });

  private readonly routeChange$ = new Subject<{
    kind: 'load' | 'retry';
    slug: string;
    variantQuery: string | null;
    visit: number;
    retryNonce?: number;
  }>();

  private readonly productSignal = signal<Product | null>(null);
  private readonly statusSignal = signal<ProductStatus>('idle');
  private readonly errorSignal = signal<string | null>(null);
  private readonly selectedColorCodeSignal = signal<string | null>(null);
  private readonly selectedStorageGbSignal = signal<number | null>(null);
  private readonly galleryImageIdSignal = signal<string | null>(null);
  private readonly invalidQuerySignal = signal<string | null>(null);
  private readonly variantQuerySignal = signal<string | null>(null);
  private readonly slugSignal = signal<string | null>(null);
  /** Related catalog items for the loaded product. Empty until the
   *  related request settles; reset to `[]` on every route change so
   *  the strip never lingers over the next product. */
  private readonly relatedSignal = signal<readonly CatalogItem[]>([]);
  /** True while the related request runs; see `ProductVm.relatedLoading`. */
  private readonly relatedLoadingSignal = signal(false);
  /** In-flight related request. The product stream must not cancel
   *  this — `switchMap` would drop the related list when a fast route
   *  change arrives, so the related call subscribes separately and is
   *  torn down on the next route change. */
  private relatedSub: Subscription | null = null;
  /** In-flight silent refresh (`refreshProduct`). A second refresh, or a
   *  route change, cancels it, so the same rule the product stream
   *  follows holds here too: a slow older response never overwrites a
   *  newer one. */
  private refreshSub: Subscription | null = null;
  /** Monotonic counter so rapid retry clicks survive distinctUntilChanged. */
  private retryNonceCounter = 0;
  /** Counts product page visits (`beginVisit`). The visit is part of
   *  the load key, so a new visit to the same slug and query reads the
   *  product again instead of keeping what an earlier visit read. */
  private visit = 0;

  /** Read-only view of the current view model — UI binds to this. */
  readonly vm = computed<ProductVm>(() => this.buildVm());

  constructor() {
    const routeSub = this.routeChange$
      .pipe(
        distinctUntilChanged(
          (a, b) =>
            a.kind === b.kind &&
            a.slug === b.slug &&
            a.variantQuery === b.variantQuery &&
            a.visit === b.visit &&
            a.retryNonce === b.retryNonce,
        ),
        tap(({ slug, variantQuery }) => {
          this.slugSignal.set(slug);
          this.variantQuerySignal.set(variantQuery);
          this.statusSignal.set('loading');
          this.errorSignal.set(null);
          this.productSignal.set(null);
          this.selectedColorCodeSignal.set(null);
          this.selectedStorageGbSignal.set(null);
          this.galleryImageIdSignal.set(null);
          this.invalidQuerySignal.set(null);
          // Tear down any in-flight related request so a slow response
          // for the previous slug cannot land after the new product is
          // already on screen. The next related request, if any, is
          // kicked off in `onProductLoaded` below.
          if (this.relatedSub !== null) {
            this.relatedSub.unsubscribe();
            this.relatedSub = null;
          }
          // The same for a silent refresh: once the route has moved on,
          // its response belongs to a screen that is no longer up, even
          // where the route comes back to the same slug.
          if (this.refreshSub !== null) {
            this.refreshSub.unsubscribe();
            this.refreshSub = null;
          }
          this.relatedSignal.set([]);
          this.relatedLoadingSignal.set(false);
        }),
        switchMap(({ slug }) =>
          this.api.invoke(getProduct, { slug }).pipe(
            map((product) => ({ kind: 'ok' as const, product })),
            catchError((err: unknown) =>
              of({
                kind: 'err' as const,
                error: describeError(err),
                notFound: isProductNotFound(err),
              }),
            ),
          ),
        ),
      )
      .subscribe((event) => {
        if (event.kind === 'ok') {
          this.onProductLoaded(event.product);
        } else {
          this.statusSignal.set(event.notFound ? 'notfound' : 'error');
          this.errorSignal.set(event.error);
        }
      });

    this.destroyRef.onDestroy(() => {
      routeSub.unsubscribe();
      if (this.relatedSub !== null) {
        this.relatedSub.unsubscribe();
        this.relatedSub = null;
      }
      if (this.refreshSub !== null) {
        this.refreshSub.unsubscribe();
        this.refreshSub = null;
      }
      this.routeChange$.complete();
    });
  }

  // ---------------------------------------------------------------------------
  // Mutators
  // ---------------------------------------------------------------------------

  /**
   * Start (or restart) loading the product for the given route. The
   * URL search params are parsed in-place so callers can hand the raw
   * `URLSearchParams` from `ActivatedRoute.snapshot.queryParamMap`.
   */
  load(slug: string, params: URLSearchParams): void {
    this.routeChange$.next({
      kind: 'load',
      slug,
      variantQuery: parseVariantQuery(params),
      visit: this.visit,
    });
  }

  /**
   * Opens a new page visit. The product page calls it once per
   * instance, before its first `load()`: this root facade outlives the
   * page, so without it a revisit to the same product would collapse
   * onto the earlier visit's read and show that visit's stock.
   */
  beginVisit(): void {
    this.visit += 1;
  }

  /**
   * Re-attempt the most recent load. Used by the error-state retry
   * button. A no-op when no slug has been loaded yet. The `kind`
   * discriminator lets the retry re-emission bypass the
   * distinctUntilChanged no-op filter that collapses duplicate
   * `load()` calls with the same args.
   */
  retry(): void {
    const slug = this.slugSignal();
    if (slug === null) return;
    this.routeChange$.next({
      kind: 'retry',
      slug,
      variantQuery: this.variantQuerySignal(),
      visit: this.visit,
      retryNonce: ++this.retryNonceCounter,
    });
  }

  /**
   * Re-reads the loaded product without a loading state, so a stock
   * change the cart reported (an add refused with OUT_OF_STOCK, the
   * standard's row E060) shows on the page. The selection and the
   * gallery stay; a failed read, or one that lands after the route
   * moved on or started loading again, changes nothing.
   */
  refreshProduct(): void {
    const slug = this.slugSignal();
    if (slug === null || this.statusSignal() !== 'success') return;
    if (this.refreshSub !== null) {
      this.refreshSub.unsubscribe();
      this.refreshSub = null;
    }
    this.refreshSub = this.api
      .invoke(getProduct, { slug })
      .pipe(
        take(1),
        catchError(() => EMPTY),
      )
      .subscribe((product) => {
        if (this.slugSignal() !== slug || this.statusSignal() !== 'success') return;
        // The malformed-payload defence `onProductLoaded` carries, carried
        // here too: a product the view model cannot resolve would throw
        // inside `buildVm` (`defaultVariantOf`) and take the page down
        // with it. A silent refresh treats it as a failed read and keeps
        // the screen it already has.
        try {
          defaultVariantOf(product);
        } catch {
          return;
        }
        this.productSignal.set(product);
        this.priceRefresh.schedule(product.serverTime, product.nextPriceChangeAt);
      });
  }

  /**
   * Pick a variant by its id. Switches color/storage and resets the
   * gallery so the atomic view model belongs to the new variant
   * (AC03). Unknown ids are ignored — the current selection stands.
   */
  selectVariant(variantId: string): void {
    const product = this.productSignal();
    if (product === null) return;
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant === undefined) return;
    this.selectedColorCodeSignal.set(variant.colorCode);
    this.selectedStorageGbSignal.set(variant.storageGb);
    this.galleryImageIdSignal.set(null);
    this.invalidQuerySignal.set(null);
  }

  /**
   * Pick a color bucket. When the (color, currentStorage) pair has
   * no variant, the current variant stands and `disabledCombinations`
   * carries the Hungarian reason the page renders (AC02).
   */
  selectColor(colorCode: string): void {
    const product = this.productSignal();
    if (product === null) return;
    const fallback = defaultVariantOf(product);
    const fallbackColor = this.selectedColorCodeSignal() ?? fallback.colorCode;
    const fallbackStorage = this.selectedStorageGbSignal() ?? fallback.storageGb;
    const lookup = selectVariantByPair(
      product,
      colorCode,
      fallbackStorage,
      this.currentVariant(product)?.id ?? fallback.id,
    );
    this.applyLookup(lookup, fallbackColor);
  }

  /**
   * Pick a storage bucket. Same fallback rule as `selectColor` so a
   * missing (color, storage) pair never silently substitutes a
   * different SKU (AC02).
   */
  selectStorage(storageGb: number): void {
    const product = this.productSignal();
    if (product === null) return;
    const fallback = defaultVariantOf(product);
    const fallbackColor = this.selectedColorCodeSignal() ?? fallback.colorCode;
    const lookup = selectVariantByPair(
      product,
      fallbackColor,
      storageGb,
      this.currentVariant(product)?.id ?? fallback.id,
    );
    this.applyLookup(lookup, fallbackColor);
  }

  /**
   * Pick an image by its id within the currently selected variant's
   * gallery. Unknown ids fall back to the first image so the page
   * never displays a broken state.
   */
  selectImage(imageId: string): void {
    const product = this.productSignal();
    if (product === null) return;
    const variant = this.currentVariant(product);
    if (variant === null) return;
    const exists = variant.images.some((i) => i.id === imageId);
    if (!exists) return;
    this.galleryImageIdSignal.set(imageId);
  }

  /**
   * Encodes the current variant selection as `?variant=...` so the
   * page can write it back to the router without rebuilding the
   * search string by hand.
   */
  currentVariantParams(): URLSearchParams {
    const variant = this.currentVariant(this.productSignal());
    return serializeVariantQuery(variant?.id ?? null);
  }

  // ---------------------------------------------------------------------------
  // Internal — wired once on a successful product load.
  // ---------------------------------------------------------------------------

  private onProductLoaded(product: Product): void {
    const variantQuery = this.variantQuerySignal();
    // `selectInitialVariant` calls `defaultVariantOf`, which throws on
    // an empty `variants` list. The contract guarantees at least one
    // variant, but a malformed backend payload must not crash the
    // facade — surface the error state instead, the same way a failed
    // `getProduct` does.
    let initial: InitialVariantSelection;
    try {
      initial = selectInitialVariant(product, variantQuery);
    } catch (err) {
      this.statusSignal.set('error');
      this.errorSignal.set(describeError(err));
      return;
    }
    this.productSignal.set(product);
    this.priceRefresh.schedule(product.serverTime, product.nextPriceChangeAt);
    this.statusSignal.set('success');
    this.selectedColorCodeSignal.set(initial.variant.colorCode);
    this.selectedStorageGbSignal.set(initial.variant.storageGb);
    this.galleryImageIdSignal.set(null);
    this.invalidQuerySignal.set(initial.invalidQuery);
    // Fire the related list request on its own subscription so a
    // `switchMap` on the product stream cannot drop it. A failure
    // (including a 404 for an unknown slug the related endpoint
    // disagrees on) leaves the strip empty; the product itself is
    // already in the success state and stays there.
    this.relatedLoadingSignal.set(true);
    this.relatedSub = this.api
      .invoke(listRelatedProducts, { slug: product.slug })
      .pipe(
        take(1),
        // The flag clears on every way out of the request — a value, an
        // error, a completion with no value, or the unsubscription a route
        // change performs — so the strip can never keep its skeletons for a
        // request that is no longer running.
        finalize(() => {
          this.relatedLoadingSignal.set(false);
        }),
      )
      .subscribe({
        next: (items) => {
          this.relatedSignal.set(items);
        },
        error: () => {
          this.relatedSignal.set([]);
        },
      });
  }

  private applyLookup(
    lookup: { variant: Variant; pairAvailable: boolean },
    fallbackColor: string,
  ): void {
    this.selectedColorCodeSignal.set(
      lookup.pairAvailable ? lookup.variant.colorCode : fallbackColor,
    );
    this.selectedStorageGbSignal.set(lookup.variant.storageGb);
    this.galleryImageIdSignal.set(null);
    this.invalidQuerySignal.set(null);
  }

  /** Returns the variant currently driving the atomic view model. */
  private currentVariant(product: Product | null): Variant | null {
    if (product === null) return null;
    const colorCode = this.selectedColorCodeSignal();
    const storageGb = this.selectedStorageGbSignal();
    if (colorCode === null || storageGb === null) return defaultVariantOf(product);
    const match = product.variants.find(
      (v) => v.colorCode === colorCode && v.storageGb === storageGb,
    );
    return match ?? defaultVariantOf(product);
  }

  private buildVm(): ProductVm {
    const status = this.statusSignal();
    const product = this.productSignal();
    const variant = this.currentVariant(product);
    const invalidQuery = this.invalidQuerySignal();
    const error = this.errorSignal();
    const variantQuery = this.variantQuerySignal();
    const slug = this.slugSignal();

    if (product === null) {
      return {
        status,
        product: null,
        selectedVariant: null,
        selectedImage: null,
        gallery: [],
        galleryIndex: -1,
        selectedColorCode: null,
        selectedStorageGb: null,
        disabledCombinations: [],
        invalidVariantQuery: null,
        addToCart: computeAddToCartState({
          variant: null,
          invalidQuery: null,
        }),
        error,
        variantQuery,
        slug,
        related: [],
        relatedLoading: false,
      };
    }

    const gallery = variant?.images ?? [];
    const imagePick = selectImageFromGallery(gallery, this.galleryImageIdSignal());
    const disabledCombinations = computeDisabledCombinations(product);
    const addToCart = computeAddToCartState({
      variant,
      invalidQuery,
    });

    return {
      status,
      product,
      selectedVariant: variant,
      selectedImage: imagePick.image,
      gallery,
      galleryIndex: imagePick.index,
      selectedColorCode: variant?.colorCode ?? null,
      selectedStorageGb: variant?.storageGb ?? null,
      disabledCombinations,
      invalidVariantQuery: invalidQuery,
      addToCart,
      error,
      variantQuery,
      slug,
      related: this.relatedSignal(),
      relatedLoading: this.relatedLoadingSignal(),
    };
  }
}
