/**
 * T15 — root-provided signal facade for the product detail page.
 *
 * Owns the product data, the selected variant, the gallery index and
 * the quantity the user wants to add. Renders an atomic view model
 * `vm` so the page never reads from two signals and gets mismatched
 * price / stock / image data.
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
import {
  catchError,
  distinctUntilChanged,
  map,
  of,
  Subject,
  Subscription,
  switchMap,
  take,
  tap,
} from 'rxjs';

import { Api } from '../../api/generated/api';
import { getProduct } from '../../api/generated/fn/catalog/get-product';
import { listRelatedProducts } from '../../api/generated/fn/catalog/list-related-products';
import type { CatalogItem } from '../../api/generated/models/catalog-item';
import type { Image } from '../../api/generated/models/image';
import type { Product } from '../../api/generated/models/product';
import type { Variant } from '../../api/generated/models/variant';

import {
  computeAddToCartState,
  computeDisabledCombinations,
  defaultVariantOf,
  parseVariantQuery,
  selectImageFromGallery,
  selectInitialVariant,
  selectVariantByPair,
  serializeVariantQuery,
  validateQuantity,
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
  /** The user's explicit selection. Never silently rewritten. */
  readonly quantity: number;
  /** True when `quantity` is above the variant's `maxQuantity`. */
  readonly quantityOverMax: boolean;
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

  private readonly routeChange$ = new Subject<{
    kind: 'load' | 'retry';
    slug: string;
    variantQuery: string | null;
    retryNonce?: number;
  }>();

  private readonly productSignal = signal<Product | null>(null);
  private readonly statusSignal = signal<ProductStatus>('idle');
  private readonly errorSignal = signal<string | null>(null);
  private readonly selectedColorCodeSignal = signal<string | null>(null);
  private readonly selectedStorageGbSignal = signal<number | null>(null);
  private readonly quantitySignal = signal<number>(1);
  private readonly galleryImageIdSignal = signal<string | null>(null);
  private readonly invalidQuerySignal = signal<string | null>(null);
  private readonly variantQuerySignal = signal<string | null>(null);
  private readonly slugSignal = signal<string | null>(null);
  /** Related catalog items for the loaded product. Empty until the
   *  related request settles; reset to `[]` on every route change so
   *  the strip never lingers over the next product. */
  private readonly relatedSignal = signal<readonly CatalogItem[]>([]);
  /** In-flight related request. The product stream must not cancel
   *  this — `switchMap` would drop the related list when a fast route
   *  change arrives, so the related call subscribes separately and is
   *  torn down on the next route change. */
  private relatedSub: Subscription | null = null;
  /** Monotonic counter so rapid retry clicks survive distinctUntilChanged. */
  private retryNonceCounter = 0;

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
            a.retryNonce === b.retryNonce,
        ),
        tap(({ slug, variantQuery }) => {
          const isNewProduct = slug !== this.slugSignal();
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
          this.relatedSignal.set([]);
          // Only reset the quantity when navigating to a NEW product
          // (slug change). A variant-only query change within the
          // same product must preserve the user's typed quantity
          // (AC05 — "the value is stored as written, never silently
          // rewritten").
          if (isNewProduct) {
            this.quantitySignal.set(1);
          }
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
    });
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
      retryNonce: ++this.retryNonceCounter,
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
    if (!variant) return;
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
   * Update the quantity the user wants to add. The value is stored
   * as written — `validateQuantity` surfaces the validation as
   * `quantityOverMax` in the VM, never as a hidden clamp (AC05).
   */
  setQuantity(quantity: number): void {
    this.quantitySignal.set(quantity);
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
    this.relatedSub = this.api
      .invoke(listRelatedProducts, { slug: product.slug })
      .pipe(take(1))
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
    const quantity = this.quantitySignal();
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
        quantity,
        quantityOverMax: false,
        disabledCombinations: [],
        invalidVariantQuery: null,
        addToCart: computeAddToCartState({
          variant: null,
          quantityValidation: validateQuantity(quantity, 0),
          invalidQuery: null,
        }),
        error,
        variantQuery,
        slug,
        related: [],
      };
    }

    const gallery = variant?.images ?? [];
    const imagePick = selectImageFromGallery(gallery, this.galleryImageIdSignal());
    const disabledCombinations = computeDisabledCombinations(product);
    const quantityValidation = validateQuantity(quantity, variant?.maxQuantity ?? 0);
    const addToCart = computeAddToCartState({
      variant,
      quantityValidation,
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
      quantity,
      quantityOverMax: quantityValidation.overMax,
      disabledCombinations,
      invalidVariantQuery: invalidQuery,
      addToCart,
      error,
      variantQuery,
      slug,
      related: this.relatedSignal(),
    };
  }
}
