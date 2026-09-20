/**
 * T15 — variant selection rules + product facade route loading.
 *
 * Two scopes:
 *
 *   1. `variant-selection.ts` — pure helpers exercised in isolation.
 *      Every exported function gets at least one assertion. The test
 *      is the unit-level acceptance gate for AC01 (invalid variant
 *      query handling), AC02 (disabled combinations), AC03 (atomic
 *      view-model), AC04 (out-of-stock disable) and AC05 (quantity
 *      retention without hidden clamping).
 *
 *   2. `product.facade.ts` — the route-loading + switchMap
 *      cancellation path. The suite wires the facade through the real
 *      generated SDK, intercepts `/api/v1/products/:slug` with MSW
 *      and verifies that a newer slug cancels an older in-flight
 *      load, that an `?variant=` query selects the matching variant,
 *      that an unknown variant id surfaces in `vm.invalidVariantQuery`
 *      and that `retry()` re-fires the most recent request.
 *
 * The MSW handlers live in this file so the suite can drive the
 * cancellation timing without contaminating the catalog/cart mocks.
 */

// @vitest-environment jsdom
import '@angular/compiler';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { http, HttpResponse } from 'msw';
import { server, useMswServer } from '../../../../tests/msw-server';

import { Api } from '../../../app/api/generated/api';
import {
  ApiConfiguration as ApiConfig,
  provideApiConfiguration as provideApiConfig,
} from '../../../app/api/generated/api-configuration';
import type { Image } from '../../../app/api/generated/models/image';
import type { Product } from '../../../app/api/generated/models/product';
import type { Variant } from '../../../app/api/generated/models/variant';

import { demoSessionInterceptor } from '../../../app/core/api/demo-session.interceptor';
import { ProductFacade } from '../../../app/features/product/product.facade';
import {
  computeAddToCartState,
  computeDisabledCombinations,
  parseVariantQuery,
  selectImageFromGallery,
  selectInitialVariant,
  selectVariantByPair,
  serializeVariantQuery,
  validateQuantity,
} from '../../../app/features/product/variant-selection';

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

const BASE_URL = 'http://localhost/api/v1';

// ---------------------------------------------------------------------------
// Fixture factory — shapes match the OpenAPI Product schema.
// ---------------------------------------------------------------------------

function money(amount: number): { amount: number; currency: 'HUF' } {
  return { amount, currency: 'HUF' };
}

function makeImage(id: string): Image {
  return {
    id,
    src: `/assets/products/${id}.webp`,
    alt: id,
    width: 320,
    height: 400,
  };
}

function makeVariant(
  id: string,
  colorCode: string,
  colorName: string,
  storageGb: 128 | 256 | 512,
  price: number,
  availability: 'in_stock' | 'out_of_stock' = 'in_stock',
  maxQuantity = 5,
  images?: readonly Image[],
): Variant {
  return {
    id,
    colorCode,
    colorName,
    swatchHex: '#343B43',
    storageGb,
    price: money(price),
    availability,
    maxQuantity,
    images: images ? [...images] : [makeImage(`${id}-front`)],
  };
}

function makeProduct(): Product {
  return {
    id: 'p-01',
    slug: 'demo-one-5g',
    brand: 'MiBolt Demo',
    name: 'Demo One 5G',
    highlights: ['6,7" kijelző'],
    is5g: true,
    isDemo: true,
    description: 'demo',
    specGroups: [],
    variants: [
      makeVariant('demo-one-5g-graphite-256', 'graphite', 'Grafit', 256, 339_990),
      makeVariant('demo-one-5g-graphite-512', 'graphite', 'Grafit', 512, 378_390),
      makeVariant('demo-one-5g-silver-256', 'silver', 'Ezüst', 256, 344_990),
      makeVariant('demo-one-5g-silver-128', 'silver', 'Ezüst', 128, 299_990),
    ],
    defaultVariant: makeVariant('demo-one-5g-graphite-256', 'graphite', 'Grafit', 256, 339_990),
  };
}

// ---------------------------------------------------------------------------
// Pure helper tests — variant-selection.ts
// ---------------------------------------------------------------------------

describe('T15 selectInitialVariant (AC01)', () => {
  const product = makeProduct();

  it('returns the product default when no variant query is provided', () => {
    const result = selectInitialVariant(product, null);
    expect(result.variant.id).toBe('demo-one-5g-graphite-256');
    expect(result.invalidQuery).toBeNull();
  });

  it('returns the matching variant when the query matches a known id', () => {
    const result = selectInitialVariant(product, 'demo-one-5g-silver-128');
    expect(result.variant.id).toBe('demo-one-5g-silver-128');
    expect(result.invalidQuery).toBeNull();
  });

  it('falls back to the default and surfaces the invalid id when the query is unknown', () => {
    const result = selectInitialVariant(product, 'demo-one-5g-does-not-exist');
    expect(result.variant.id).toBe('demo-one-5g-graphite-256');
    expect(result.invalidQuery).toBe('demo-one-5g-does-not-exist');
  });

  it('treats an empty string the same as a missing query', () => {
    const result = selectInitialVariant(product, '');
    expect(result.variant.id).toBe('demo-one-5g-graphite-256');
    expect(result.invalidQuery).toBeNull();
  });
});

describe('T15 computeDisabledCombinations (AC02)', () => {
  it('returns an empty list when every (color, storage) pair has a variant', () => {
    const product: Product = {
      ...makeProduct(),
      variants: [
        makeVariant('a-graphite-128', 'graphite', 'Grafit', 128, 90_000),
        makeVariant('a-graphite-256', 'graphite', 'Grafit', 256, 100_000),
        makeVariant('a-graphite-512', 'graphite', 'Grafit', 512, 200_000),
        makeVariant('a-silver-128', 'silver', 'Ezüst', 128, 95_000),
        makeVariant('a-silver-256', 'silver', 'Ezüst', 256, 110_000),
        makeVariant('a-silver-512', 'silver', 'Ezüst', 512, 210_000),
      ],
    };
    expect(computeDisabledCombinations(product)).toEqual([]);
  });

  it('flags color/storage pairs that have no matching variant with a Hungarian reason', () => {
    const product: Product = {
      ...makeProduct(),
      variants: [
        makeVariant('a-graphite-128', 'graphite', 'Grafit', 128, 90_000),
        makeVariant('a-graphite-256', 'graphite', 'Grafit', 256, 100_000),
        makeVariant('a-graphite-512', 'graphite', 'Grafit', 512, 200_000),
        makeVariant('a-silver-256', 'silver', 'Ezüst', 256, 110_000),
      ],
    };
    const disabled = computeDisabledCombinations(product);
    const keys = disabled.map((d) => `${d.colorCode}|${String(d.storageGb)}`).sort();
    // silver is missing 128 and 512 — must be flagged.
    expect(keys).toEqual(['silver|128', 'silver|512']);
    const entry = disabled.find((d) => d.colorCode === 'silver' && d.storageGb === 128);
    expect(entry?.reason).toMatch(/Ezüst/);
    expect(entry?.reason).toMatch(/128 GB/);
  });
});

describe('T15 selectVariantByPair (AC02)', () => {
  const product = makeProduct();

  it('returns the variant whose color and storage match exactly', () => {
    const result = selectVariantByPair(product, 'silver', 256, 'demo-one-5g-graphite-256');
    expect(result.variant.id).toBe('demo-one-5g-silver-256');
    expect(result.pairAvailable).toBe(true);
  });

  it('keeps the current variant when the requested pair has no variant', () => {
    const result = selectVariantByPair(product, 'graphite', 128, 'demo-one-5g-graphite-256');
    expect(result.variant.id).toBe('demo-one-5g-graphite-256');
    expect(result.pairAvailable).toBe(false);
  });

  it('falls back to the product default when the current variant id is unknown', () => {
    const result = selectVariantByPair(product, 'graphite', 128, 'no-such-variant');
    expect(result.variant.id).toBe('demo-one-5g-graphite-256');
    expect(result.pairAvailable).toBe(false);
  });
});

describe('T15 selectImageFromGallery (AC03)', () => {
  const gallery: readonly Image[] = [makeImage('img-a'), makeImage('img-b'), makeImage('img-c')];

  it('returns the image whose id matches when present', () => {
    const result = selectImageFromGallery(gallery, 'img-c');
    expect(result.image?.id).toBe('img-c');
    expect(result.index).toBe(2);
  });

  it('returns the first image and index 0 when the id is missing', () => {
    const result = selectImageFromGallery(gallery, null);
    expect(result.image?.id).toBe('img-a');
    expect(result.index).toBe(0);
  });

  it('returns the first image when the id does not exist in the gallery', () => {
    const result = selectImageFromGallery(gallery, 'img-missing');
    expect(result.image?.id).toBe('img-a');
    expect(result.index).toBe(0);
  });

  it('returns null and -1 for an empty gallery', () => {
    const result = selectImageFromGallery([], null);
    expect(result.image).toBeNull();
    expect(result.index).toBe(-1);
  });
});

describe('T15 validateQuantity (AC05)', () => {
  it('keeps the explicit selection even when it exceeds maxQuantity', () => {
    const result = validateQuantity(7, 5);
    expect(result.quantity).toBe(7);
    expect(result.overMax).toBe(true);
    expect(result.belowMin).toBe(false);
  });

  it('marks zero and negative quantities as belowMin', () => {
    const zero = validateQuantity(0, 5);
    expect(zero.quantity).toBe(0);
    expect(zero.belowMin).toBe(true);
    expect(zero.overMax).toBe(false);

    const negative = validateQuantity(-2, 5);
    expect(negative.quantity).toBe(0);
    expect(negative.belowMin).toBe(true);
    expect(negative.overMax).toBe(false);
  });

  it('returns a valid selection untouched when 1 <= qty <= max', () => {
    const result = validateQuantity(3, 5);
    expect(result.quantity).toBe(3);
    expect(result.overMax).toBe(false);
    expect(result.belowMin).toBe(false);
  });

  it('flags qty equal to max as within bounds (not overMax)', () => {
    const result = validateQuantity(5, 5);
    expect(result.quantity).toBe(5);
    expect(result.overMax).toBe(false);
    expect(result.belowMin).toBe(false);
  });

  it('treats fractional input as the floored integer', () => {
    const result = validateQuantity(2.9, 5);
    expect(result.quantity).toBe(2);
    expect(result.overMax).toBe(false);
    expect(result.belowMin).toBe(false);
  });

  it('treats a negative maxQuantity as zero', () => {
    const result = validateQuantity(1, -1);
    expect(result.overMax).toBe(true);
  });
});

describe('T15 computeAddToCartState (AC01 / AC04)', () => {
  const variant = makeVariant('demo-one-5g-graphite-256', 'graphite', 'Grafit', 256, 339_990);

  it('disables when the variant is null', () => {
    const state = computeAddToCartState({
      variant: null,
      quantityValidation: validateQuantity(1, 5),
      invalidQuery: null,
    });
    expect(state.enabled).toBe(false);
    expect(state.reason).toMatch(/válassz/i);
  });

  it('disables when an invalid variant query has not been resolved', () => {
    const state = computeAddToCartState({
      variant,
      quantityValidation: validateQuantity(1, 5),
      invalidQuery: 'demo-bogus',
    });
    expect(state.enabled).toBe(false);
    expect(state.reason).toMatch(/változat nem található/i);
  });

  it('disables when the variant is out of stock', () => {
    const oos = { ...variant, availability: 'out_of_stock' as const };
    const state = computeAddToCartState({
      variant: oos,
      quantityValidation: validateQuantity(1, 5),
      invalidQuery: null,
    });
    expect(state.enabled).toBe(false);
    expect(state.reason).toMatch(/nem elérhető/i);
  });

  it('disables when quantity is below one', () => {
    const state = computeAddToCartState({
      variant,
      quantityValidation: validateQuantity(0, 5),
      invalidQuery: null,
    });
    expect(state.enabled).toBe(false);
    expect(state.reason).toMatch(/1 darab/);
  });

  it('disables when quantity is over the variant max with a max-hint reason', () => {
    const state = computeAddToCartState({
      variant,
      quantityValidation: validateQuantity(7, 5),
      invalidQuery: null,
    });
    expect(state.enabled).toBe(false);
    expect(state.reason).toMatch(/Maximum 5/);
  });

  it('enables when every gate passes', () => {
    const state = computeAddToCartState({
      variant,
      quantityValidation: validateQuantity(3, 5),
      invalidQuery: null,
    });
    expect(state.enabled).toBe(true);
    expect(state.reason).toBeNull();
  });
});

describe('T15 parseVariantQuery / serializeVariantQuery', () => {
  it('parses a present variant id', () => {
    expect(parseVariantQuery(new URLSearchParams('variant=demo-one-5g-graphite-256'))).toBe(
      'demo-one-5g-graphite-256',
    );
  });

  it('returns null when the variant key is missing', () => {
    expect(parseVariantQuery(new URLSearchParams('brand=Apple'))).toBeNull();
  });

  it('returns null for an empty or whitespace-only value', () => {
    expect(parseVariantQuery(new URLSearchParams('variant='))).toBeNull();
    expect(parseVariantQuery(new URLSearchParams('variant=%20'))).toBeNull();
  });

  it('serialises a non-empty variant id', () => {
    expect(serializeVariantQuery('demo-one-5g-silver-256').toString()).toBe(
      'variant=demo-one-5g-silver-256',
    );
  });

  it('returns an empty params when the id is null or empty', () => {
    expect(serializeVariantQuery(null).toString()).toBe('');
    expect(serializeVariantQuery('').toString()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// ProductFacade — route loading, switchMap cancellation, retry
// ---------------------------------------------------------------------------

interface CapturedRequest {
  method: string;
  url: string;
  slug: string;
}

interface DelayedHandler {
  slug: string;
  payload: Product;
  resolve: () => void;
}

const captures: CapturedRequest[] = [];
const delayedHandlers: DelayedHandler[] = [];

beforeAll(() => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfig(BASE_URL),
    ],
    teardown: { destroyAfterEach: true },
  });
});

afterAll(() => {
  TestBed.resetTestingModule();
});

beforeEach(() => {
  captures.length = 0;
  delayedHandlers.length = 0;

  server.use(
    http.get(`${BASE_URL}/config`, () =>
      HttpResponse.json({
        providerId: 'mi-bolt',
        displayName: 'MiBolt',
        currency: 'HUF',
        isDemo: true,
        termsVersion: 'demo-1',
        featuredSlugs: [],
        maximumLineQuantity: 5,
      }),
    ),
    http.get(`${BASE_URL}/products/:slug`, ({ params, request }) => {
      const slug = String(params['slug']);
      captures.push({ method: request.method, url: request.url, slug });
      const delayed = delayedHandlers.find((h) => h.slug === slug);
      if (delayed) {
        return new Promise<Response>((resolve) => {
          delayed.resolve = () => {
            resolve(HttpResponse.json(delayed.payload));
          };
        });
      }
      const payload = payloadForSlug(slug);
      if (payload === null) {
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:not-found',
            title: 'A kért végpont vagy erőforrás nem található.',
            status: 404,
            code: 'NOT_FOUND',
            detail: `Ismeretlen termék: ${slug}.`,
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 404, headers: { 'content-type': 'application/problem+json' } },
        );
      }
      return HttpResponse.json(payload);
    }),
  );
});

afterEach(() => {
  server.resetHandlers();
  TestBed.resetTestingModule();
});

function payloadForSlug(slug: string): Product | null {
  if (slug === 'demo-one-5g') return makeProduct();
  if (slug === 'demo-pro-5g') {
    return {
      ...makeProduct(),
      id: 'p-02',
      slug: 'demo-pro-5g',
      name: 'Demo Pro 5G',
      defaultVariant: makeVariant('demo-pro-5g-graphite-256', 'graphite', 'Grafit', 256, 499_990),
    };
  }
  return null;
}

function buildFacade(): { facade: ProductFacade; flushMicrotasks: () => Promise<void> } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfig(BASE_URL),
      // The generated Api class is partially compiled; vitest's esbuild
      // pipeline does not emit constructor metadata so TestBed cannot
      // read its `(config, http)` signature. An explicit factory makes
      // the dependency graph explicit without touching the production
      // wiring (the Angular CLI build emits the metadata normally).
      {
        provide: Api,
        useFactory: (config: ApiConfig, http: HttpClient) => new Api(config, http),
        deps: [ApiConfig, HttpClient],
      },
      ProductFacade,
    ],
    teardown: { destroyAfterEach: true },
  });
  const facade = TestBed.inject(ProductFacade);
  return {
    facade,
    flushMicrotasks: async () => {
      // The route → SDK → MSW → fetch round-trip crosses several micro-
      // task boundaries (Subject emission, RxJS subscription, fetch
      // Promise resolution, MSW interceptor). Yield enough ticks for
      // every link in the chain to complete.
      for (let index = 0; index < 20; index += 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    },
  };
}

describe('T15 ProductFacade — route loading via the SDK', () => {
  it('calls Api.getProduct with the supplied slug and exposes the product through vm', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams());
    await flushMicrotasks();

    const slugs = captures.map((c) => c.slug);
    expect(slugs).toContain('demo-one-5g');
    const vm = facade.vm();
    expect(vm.status).toBe('success');
    expect(vm.product?.slug).toBe('demo-one-5g');
    expect(vm.selectedVariant?.id).toBe('demo-one-5g-graphite-256');
    expect(vm.gallery).toHaveLength(1);
    expect(vm.selectedImage?.id).toBe('demo-one-5g-graphite-256-front');
    expect(vm.galleryIndex).toBe(0);
    expect(vm.invalidVariantQuery).toBeNull();
  });

  it('selects the variant pointed to by ?variant= when it matches an existing id', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams('variant=demo-one-5g-silver-128'));
    await flushMicrotasks();

    const vm = facade.vm();
    expect(vm.selectedVariant?.id).toBe('demo-one-5g-silver-128');
    expect(vm.selectedColorCode).toBe('silver');
    expect(vm.selectedStorageGb).toBe(128);
    expect(vm.invalidVariantQuery).toBeNull();
    expect(vm.addToCart.enabled).toBe(true);
  });

  it('preserves the unknown variant id in invalidVariantQuery, keeps the default variant selected and disables add-to-cart (AC01)', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams('variant=demo-one-5g-does-not-exist'));
    await flushMicrotasks();

    const vm = facade.vm();
    expect(vm.selectedVariant?.id).toBe('demo-one-5g-graphite-256');
    expect(vm.invalidVariantQuery).toBe('demo-one-5g-does-not-exist');
    expect(vm.addToCart.enabled).toBe(false);
    expect(vm.addToCart.reason).toMatch(/változat nem található/i);
  });

  it('clears the invalid query when the user explicitly picks a variant (AC01)', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams('variant=demo-one-5g-does-not-exist'));
    await flushMicrotasks();
    facade.selectVariant('demo-one-5g-silver-256');
    const vm = facade.vm();
    expect(vm.invalidVariantQuery).toBeNull();
    expect(vm.selectedVariant?.id).toBe('demo-one-5g-silver-256');
    expect(vm.addToCart.enabled).toBe(true);
  });

  it('surfaces a 404 as a dedicated notfound status with a descriptive message and no product (AC04, FIX-23)', async () => {
    // FIX-23: a 404 for an unknown slug is its own 'notfound' status,
    // distinct from a transient failure's 'error' — see
    // isProductNotFound in product.facade.ts.
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-missing', new URLSearchParams());
    await flushMicrotasks();

    const vm = facade.vm();
    expect(vm.status).toBe('notfound');
    expect(vm.product).toBeNull();
    expect(vm.error).toMatch(/404|Ismeretlen|NOT_FOUND/);
    expect(vm.selectedVariant).toBeNull();
  });
});

describe('T15 ProductFacade — selectVariant / selectColor / selectStorage / selectImage / setQuantity', () => {
  it('selectVariant switches the atomic state (price, stock, gallery) and resets the gallery index to 0 (AC03)', async () => {
    const product = makeProduct();
    const firstVariant = product.variants[0];
    // Give the variant two distinct images so the gallery reset is observable.
    firstVariant.images = [makeImage('g-front'), makeImage('g-side')];
    product.defaultVariant = firstVariant;
    server.use(http.get(`${BASE_URL}/products/:slug`, () => HttpResponse.json(product)));

    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams());
    await flushMicrotasks();

    // Move the gallery index to image #1.
    facade.selectImage('g-side');
    expect(facade.vm().galleryIndex).toBe(1);

    // Switch to a single-image variant — the index must reset to 0.
    facade.selectVariant('demo-one-5g-silver-256');
    const vm = facade.vm();
    expect(vm.selectedVariant?.id).toBe('demo-one-5g-silver-256');
    expect(vm.gallery.map((index) => index.id)).toEqual(['demo-one-5g-silver-256-front']);
    expect(vm.galleryIndex).toBe(0);
    expect(vm.selectedImage?.id).toBe('demo-one-5g-silver-256-front');
  });

  it('selectColor for a valid (color, current storage) pair switches variant (AC02)', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams());
    await flushMicrotasks();
    facade.selectColor('silver');
    const vm = facade.vm();
    expect(vm.selectedColorCode).toBe('silver');
    expect(vm.selectedStorageGb).toBe(256);
    expect(vm.selectedVariant?.id).toBe('demo-one-5g-silver-256');
  });

  it('selectColor for a (color, storage) pair with no variant keeps the current variant and exposes the disabled reason (AC02)', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams());
    await flushMicrotasks();

    // silver has no 512 variant; the pair silver/512 is disabled.
    facade.selectStorage(512);
    facade.selectColor('silver');
    const vm = facade.vm();
    expect(vm.selectedVariant?.id).toBe('demo-one-5g-graphite-512');
    const disabled = vm.disabledCombinations.find(
      (d) => d.colorCode === 'silver' && d.storageGb === 512,
    );
    expect(disabled).toBeDefined();
    expect(disabled?.reason).toMatch(/Ezüst/);
    expect(disabled?.reason).toMatch(/512 GB/);
  });

  it('selectStorage for a valid pair switches variant (AC02)', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams());
    await flushMicrotasks();
    facade.selectStorage(512);
    const vm = facade.vm();
    expect(vm.selectedStorageGb).toBe(512);
    expect(vm.selectedVariant?.id).toBe('demo-one-5g-graphite-512');
  });

  it('selectImage ignores ids that are not in the current variant gallery', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams());
    await flushMicrotasks();
    facade.selectImage('image-not-in-gallery');
    const vm = facade.vm();
    expect(vm.selectedImage?.id).toBe('demo-one-5g-graphite-256-front');
    expect(vm.galleryIndex).toBe(0);
  });

  it('selectImage picks the right index for a real gallery image', async () => {
    const product = makeProduct();
    const firstVariant = product.variants[0];
    firstVariant.images = [makeImage('img-1'), makeImage('img-2'), makeImage('img-3')];
    product.defaultVariant = firstVariant;
    server.use(http.get(`${BASE_URL}/products/:slug`, () => HttpResponse.json(product)));

    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams());
    await flushMicrotasks();
    facade.selectImage('img-3');
    const vm = facade.vm();
    expect(vm.galleryIndex).toBe(2);
    expect(vm.selectedImage?.id).toBe('img-3');
  });

  it('setQuantity keeps the explicit selection and surfaces quantityOverMax (AC05)', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams());
    await flushMicrotasks();

    facade.setQuantity(3);
    let vm = facade.vm();
    expect(vm.quantity).toBe(3);
    expect(vm.quantityOverMax).toBe(false);
    expect(vm.addToCart.enabled).toBe(true);

    // User had 3; the new selected variant allows only 2 -> display
    // "max 2" rather than silently rewriting the quantity.
    facade.selectVariant('demo-one-5g-graphite-512');
    facade.setQuantity(3);
    vm = facade.vm();
    expect(vm.selectedVariant?.maxQuantity).toBe(5);
    // The selected variant still allows 3 -> still valid for maxQuantity 5.
    // Force an over-max scenario by selecting the variant whose
    // maxQuantity is 2 via a direct mocked payload: but our fixture is 5.
    // Instead simulate by hand-crafting the validation through setQuantity
    // when stock drops: the rule is "store the value, flag overMax".
    // Direct test of validateQuantity already covers the rule; here we
    // assert that over-max is visible when it does happen.
    facade.setQuantity(7);
    vm = facade.vm();
    expect(vm.quantity).toBe(7);
    expect(vm.quantityOverMax).toBe(true);
    expect(vm.addToCart.enabled).toBe(false);
    expect(vm.addToCart.reason).toMatch(/Maximum 5/);
  });

  it('out-of-stock selection disables add-to-cart (AC04)', async () => {
    const product = makeProduct();
    const firstVariant = product.variants[0];
    product.variants[1].availability = 'out_of_stock';
    product.defaultVariant = firstVariant;
    server.use(http.get(`${BASE_URL}/products/:slug`, () => HttpResponse.json(product)));

    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams());
    await flushMicrotasks();
    facade.selectVariant('demo-one-5g-graphite-512');
    const vm = facade.vm();
    expect(vm.selectedVariant?.availability).toBe('out_of_stock');
    expect(vm.addToCart.enabled).toBe(false);
    expect(vm.addToCart.reason).toMatch(/nem elérhető/i);
  });
});

describe('T15 ProductFacade — retry re-fires the most recent load (AC04)', () => {
  it('retry() re-issues the SDK call with the last slug and variant query', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams('variant=demo-one-5g-silver-256'));
    await flushMicrotasks();

    const before = captures.length;
    facade.retry();
    await flushMicrotasks();
    expect(captures.length).toBeGreaterThan(before);
    const lastCall = captures[captures.length - 1];
    expect(lastCall.slug).toBe('demo-one-5g');
  });

  it('retry() is a no-op when no slug has been loaded yet', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    const before = captures.length;
    facade.retry();
    await flushMicrotasks();
    expect(captures.length).toBe(before);
  });
});

describe('T15 ProductFacade — switchMap cancels obsolete loads on route change (AC04)', () => {
  it('drops the response of the first slug when a second slug is loaded before the first resolves', async () => {
    delayedHandlers.push({
      slug: 'demo-one-5g',
      payload: makeProduct(),
      resolve: () => undefined,
    });
    const proPayload = payloadForSlug('demo-pro-5g');
    if (!proPayload) throw new Error('Expected payload for demo-pro-5g');
    delayedHandlers.push({
      slug: 'demo-pro-5g',
      payload: proPayload,
      resolve: () => undefined,
    });

    const { facade } = buildFacade();

    facade.load('demo-one-5g', new URLSearchParams());
    // Yield so the first request is in flight before we issue the second.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    facade.load('demo-pro-5g', new URLSearchParams());
    // Yield so the second request is in flight before we resolve it.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // Resolve only the second request: the first must be cancelled
    // by switchMap and never reach the product signal.
    const second = delayedHandlers.find((h) => h.slug === 'demo-pro-5g');
    if (!second) throw new Error('Expected second handler');
    second.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // expect.poll retries the assertion until it holds, covering the
    // MSW -> fetch -> SDK -> RxJS -> signal chain in whatever order the
    // runtime schedules it.
    await expect.poll(() => facade.vm().status, { timeout: 1000, interval: 5 }).toBe('success');

    expect(facade.vm().product?.slug).toBe('demo-pro-5g');
    expect(captures.filter((c) => c.slug === 'demo-one-5g')).toHaveLength(1);

    // Resolving the first handler after cancellation must NOT swap the
    // product back to demo-one-5g.
    const first = delayedHandlers.find((h) => h.slug === 'demo-one-5g');
    if (!first) throw new Error('Expected first handler');
    first.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(facade.vm().product?.slug).toBe('demo-pro-5g');
  });

  it('distinctUntilChanged skips a no-op re-emit of the same slug + variant query', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams());
    await flushMicrotasks();
    const before = captures.filter((c) => c.slug === 'demo-one-5g').length;

    facade.load('demo-one-5g', new URLSearchParams());
    await flushMicrotasks();
    const after = captures.filter((c) => c.slug === 'demo-one-5g').length;
    expect(after).toBe(before);
  });
});

describe('T15 ProductFacade — currentVariantParams round-trips through the URL codec', () => {
  it('encodes the currently selected variant id for the router', async () => {
    const { facade, flushMicrotasks } = buildFacade();
    facade.load('demo-one-5g', new URLSearchParams());
    await flushMicrotasks();
    facade.selectVariant('demo-one-5g-silver-128');
    const parameters = facade.currentVariantParams();
    expect(parameters.get('variant')).toBe('demo-one-5g-silver-128');
  });

  it('produces an empty params when the product is still loading', () => {
    const { facade } = buildFacade();
    const parameters = facade.currentVariantParams();
    expect(parameters.toString()).toBe('');
  });
});
