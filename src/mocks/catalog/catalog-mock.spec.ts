/**
 * MIM-210 — catalogue and media mock on the 2.0.0 contract.
 *
 * The suite runs against MSW Node so every line of the dispatch path
 * is exercised. The fixture under `docs/api/fixtures/catalog.json`
 * is the real one (48 products, 55 entries, 85 images); the counts
 * and the first slugs come from `node -e` against that fixture and
 * are pasted below verbatim with the command in a comment.
 *
 * Command to recompute expectations when the fixture changes: see the
 * `// node -e …` lines that follow the expected-value blocks below.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import catalogFixture from '../../../docs/api/fixtures/catalog.json';
import {
  buildCatalogHandlers,
  catalogStore,
  isCatalogFixtureShape,
  loadCatalogFixture,
} from './catalog.handlers';
import type { CreateHandlersOptions } from '../create-handlers';
import { Repository } from '../repository';
import { isRecord } from '../is-record';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
  type Clock,
  type Ids,
} from '../scenarios';
import { server, useMswServer } from '../../../tests/msw-server';

useMswServer();

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.

// ---------------------------------------------------------------------------
// Fixtures / counts (computed from the real fixture, pasted here).
//   node -e "const f=JSON.parse(require('fs').readFileSync('./docs/api/fixtures/catalog.json','utf8')); const e=[]; f.products.forEach(p=>{const s=new Set(p.variants.map(v=>v.storageGb));[...s].forEach(st=>e.push({p,r:f.ranking.find(x=>x.slug===p.slug),st}))}); console.log(e.length);"
// ---------------------------------------------------------------------------

const TOTAL_ENTRIES = 55; // sum of distinct (product, storage) pairs over 48 products
const TOTAL_PAGES_12 = 5; // ceil(55 / 12)
const TOTAL_PAGES_24 = 3; // ceil(55 / 24)
const TOTAL_IMAGES = 85; // unique image files under public/media/

// brand facet for the default list (no filters): 7 brands, counts by entries
const DEFAULT_BRAND_FACET = [
  { value: 'apple', label: 'apple', count: 17 },
  { value: 'google pixel', label: 'google pixel', count: 4 },
  { value: 'honor', label: 'honor', count: 8 },
  { value: 'motorola', label: 'motorola', count: 1 },
  { value: 'samsung', label: 'samsung', count: 13 },
  { value: 'vivo', label: 'vivo', count: 3 },
  { value: 'xiaomi', label: 'xiaomi', count: 9 },
];
const DEFAULT_STORAGE_FACET = [
  { value: '128', label: '128 GB', count: 11 },
  { value: '256', label: '256 GB', count: 27 },
  { value: '512', label: '512 GB', count: 17 },
];
const DEFAULT_FIRST_COLOR = { value: 'zold', label: 'Zöld', swatchHex: '#7C9F63', count: 1 };
const DEFAULT_IS5G = 54;
const DEFAULT_INSTOCK = 52;
const DEFAULT_PRICE_RANGE = { min: 69990, max: 1095990 };

// Default list first 12 slugs (rank asc, id asc, storage asc).
const DEFAULT_FIRST_TWELVE_SLUGS = [
  'motorola-edge-50-fusion',
  'honor-x7d',
  'apple-iphone-18-pro-max',
  'apple-iphone-18-pro-max',
  'apple-iphone-18-pro',
  'apple-iphone-18-pro',
  'honor-600-lite',
  'samsung-galaxy-z-fold8-ultra-5g',
  'samsung-galaxy-s26-fe',
  'apple-iphone-17e',
  'samsung-galaxy-a57',
  'google-pixel-11',
];

// pageSize=24 first two (rank asc, id asc).
const PAGE_24_FIRST_TWO = ['motorola-edge-50-fusion', 'honor-x7d'];

// Featured cap is 4; the four featured products are listed by rank.
const FEATURED_FIRST_FOUR = [
  'motorola-edge-50-fusion',
  'honor-x7d',
  'apple-iphone-18-pro-max',
  'apple-iphone-18-pro-max',
];

// Sorts (first two slugs).
const SORTS: Record<string, string[]> = {
  recommended: ['motorola-edge-50-fusion', 'honor-x7d'],
  newest: ['motorola-edge-50-fusion', 'honor-x7d'],
  oldest: ['apple-iphone-15', 'xiaomi-17t'],
  popularity: ['motorola-edge-50-fusion', 'honor-x7d'],
  price_asc: ['honor-x7d', 'motorola-edge-50-fusion'],
  price_desc: ['samsung-galaxy-z-fold8-ultra-5g', 'samsung-galaxy-z-fold8-5g'],
  name_asc: ['apple-iphone-15', 'apple-iphone-16'],
  name_desc: ['xiaomi-redmi-note-17-pro-max-5g', 'xiaomi-redmi-note-17-pro-5g'],
};

// ---------------------------------------------------------------------------
// Shared test scaffolding
// ---------------------------------------------------------------------------

let options: CreateHandlersOptions;
let clock: Clock;
let ids: Ids;

beforeAll(() => {
  if (!isCatalogFixtureShape(catalogFixture)) {
    throw new Error('[catalog-mock.spec] committed fixture does not match expected shape');
  }
  loadCatalogFixture(catalogFixture);
});

beforeEach(() => {
  clock = createFixedClock('2026-09-20T12:00:00.000Z');
  ids = createDeterministicIds(1);
  options = {
    repository: new Repository(DEFAULT_SCENARIO, ids, clock),
    clock,
    ids,
    scenario: DEFAULT_SCENARIO,
    apiRoot: '/api/v1',
  };
});

function installHandlers(): void {
  server.use(...buildCatalogHandlers(options));
}

async function loadJson(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`http://localhost${path}`);
  if (!res.ok) throw new Error(`expected 2xx, got ${String(res.status)} for ${path}`);
  const body: unknown = await res.json();
  if (!isRecord(body)) throw new Error(`${path}: expected an object body`);
  return body;
}

/** Assert a value is a string. Type-narrows via `asserts`. */
function expectString(value: unknown): asserts value is string {
  expect(typeof value).toBe('string');
}

/** Assert a value is a number. Type-narrows via `asserts`. */
function expectNumber(value: unknown): asserts value is number {
  expect(typeof value).toBe('number');
}

/** Assert a value is a boolean. Type-narrows via `asserts`. */
function expectBoolean(value: unknown): asserts value is boolean {
  expect(typeof value).toBe('boolean');
}

/** Assert a value is an array. Type-narrows via `asserts`. */
function expectArray(value: unknown): asserts value is unknown[] {
  expect(Array.isArray(value)).toBe(true);
}

/** Assert a value is a plain object record. Type-narrows via `asserts`. */
function expectRecord(value: unknown): asserts value is Record<string, unknown> {
  expect(isRecord(value)).toBe(true);
}

/** Assert a value is a non-empty string. */

/** Read a list of items from `body.items`, asserting the array shape. */
function readItems(body: Record<string, unknown>): Record<string, unknown>[] {
  const items = body['items'];
  expectArray(items);
  return items.map((entry) => {
    expectRecord(entry);
    return entry;
  });
}

/** Read `body[key]` and assert it is a string. */
function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  expectString(value);
  return value;
}

/** Read `body[key]` and assert it is a number. */
function readNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  expectNumber(value);
  return value;
}

async function expectProblem(
  path: string,
  status: number,
  code: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`http://localhost${path}`);
  expect(res.status, `${path} status`).toBe(status);
  expect(res.headers.get('content-type')).toBe('application/problem+json');
  const body: unknown = await res.json();
  if (!isRecord(body)) throw new Error('expected an object body');
  expect(body['code']).toBe(code);
  return body;
}

// ---------------------------------------------------------------------------
// listProducts: default list and paging
// ---------------------------------------------------------------------------

describe('GET /products default list and paging', () => {
  beforeEach(installHandlers);

  it('returns 12 items by default and the documented totals', async () => {
    const body = await loadJson('/api/v1/products');
    expect(readNumber(body, 'page')).toBe(1);
    expect(readNumber(body, 'pageSize')).toBe(12);
    expect(readNumber(body, 'total')).toBe(TOTAL_ENTRIES);
    expect(readNumber(body, 'totalPages')).toBe(TOTAL_PAGES_12);
    const items = readItems(body);
    expect(items.length).toBe(12);
    expect(items.map((i) => readString(i, 'slug'))).toEqual(DEFAULT_FIRST_TWELVE_SLUGS);
  });

  it('respects pageSize=24', async () => {
    const body = await loadJson('/api/v1/products?pageSize=24');
    const items = readItems(body);
    expect(items.length).toBe(24);
    expect(readNumber(body, 'total')).toBe(TOTAL_ENTRIES);
    expect(readNumber(body, 'totalPages')).toBe(TOTAL_PAGES_24);
    expect(items.slice(0, 2).map((i) => readString(i, 'slug'))).toEqual(PAGE_24_FIRST_TWO);
  });

  it('returns an empty page beyond the last with total unchanged', async () => {
    const body = await loadJson('/api/v1/products?page=99');
    const items = body['items'];
    expect(items).toEqual([]);
    expect(readNumber(body, 'total')).toBe(TOTAL_ENTRIES);
    expect(readNumber(body, 'totalPages')).toBe(TOTAL_PAGES_12);
    expect(readNumber(body, 'page')).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// listProducts: 400 validation
// ---------------------------------------------------------------------------

describe('GET /products 400 problems', () => {
  beforeEach(installHandlers);

  it('rejects negative minPrice', async () => {
    const body = await expectProblem('/api/v1/products?minPrice=-1', 400, 'INVALID_REQUEST');
    expect(body['detail']).toBe('minPrice must not be negative');
  });

  it('rejects negative maxPrice', async () => {
    const body = await expectProblem('/api/v1/products?maxPrice=-1', 400, 'INVALID_REQUEST');
    expect(body['detail']).toBe('maxPrice must not be negative');
  });

  it('rejects minPrice > maxPrice', async () => {
    const body = await expectProblem(
      '/api/v1/products?minPrice=200&maxPrice=100',
      400,
      'INVALID_REQUEST',
    );
    expect(body['detail']).toBe('minPrice must not exceed maxPrice');
  });

  it('rejects page < 1', async () => {
    const body = await expectProblem('/api/v1/products?page=0', 400, 'INVALID_REQUEST');
    expect(body['detail']).toBe('page must be at least 1');
  });

  it('rejects invalid pageSize', async () => {
    const body = await expectProblem('/api/v1/products?pageSize=13', 400, 'INVALID_REQUEST');
    expect(body['detail']).toBe('pageSize must be 12 or 24');
  });

  it('rejects unknown query parameter', async () => {
    const body = await expectProblem('/api/v1/products?colour=red', 400, 'INVALID_REQUEST');
    expect(body['detail']).toBe('Unknown query parameter "colour"');
    expect(body['params']).toEqual({ parameter: 'colour' });
  });

  it('rejects non-integer page', async () => {
    const body = await expectProblem('/api/v1/products?page=abc', 400, 'INVALID_REQUEST');
    expect(body['detail']).toBe('page is invalid');
  });

  it('rejects non-boolean inStock', async () => {
    const body = await expectProblem('/api/v1/products?inStock=maybe', 400, 'INVALID_REQUEST');
    expect(body['detail']).toBe('inStock is invalid');
  });

  it('rejects storageGb outside 128/256/512', async () => {
    const body = await expectProblem('/api/v1/products?storageGb=1024', 400, 'INVALID_REQUEST');
    expect(body['detail']).toBe('storageGb is invalid');
  });

  it('rejects unknown sort', async () => {
    const body = await expectProblem('/api/v1/products?sort=cheapest', 400, 'INVALID_REQUEST');
    expect(body['detail']).toBe('sort is invalid');
  });
});

// ---------------------------------------------------------------------------
// listProducts: filters and q
// ---------------------------------------------------------------------------

describe('GET /products filters', () => {
  beforeEach(installHandlers);

  it('matches q case-insensitively after NFC normalise; diacritic matters', async () => {
    const ok = await loadJson('/api/v1/products?q=kijelz%C5%91');
    const none = await loadJson('/api/v1/products?q=kijelzo');
    const okItems = readItems(ok);
    const noneItems = readItems(none);
    expect(okItems.length).toBeGreaterThan(0);
    expect(noneItems.length).toBe(0);
  });

  it('OR-matches brand values', async () => {
    const body = await loadJson('/api/v1/products?brand=apple&brand=motorola&pageSize=24');
    const items = readItems(body);
    expect(items.length).toBe(18);
    const brands = new Set(items.map((i) => readString(i, 'slug').split('-')[0]));
    expect(brands.has('apple') || brands.has('motorola')).toBe(true);
  });

  it('OR-matches storageGb values', async () => {
    const body = await loadJson('/api/v1/products?storageGb=128&storageGb=512');
    expect(readNumber(body, 'total')).toBe(11 + 17);
    const items = readItems(body);
    for (const item of items) {
      expect([128, 512]).toContain(readNumber(item, 'storageGb'));
    }
  });

  it('color filter restricts to that colorCode', async () => {
    const body = await loadJson('/api/v1/products?color=zold');
    expect(readNumber(body, 'total')).toBe(1);
    const items = readItems(body);
    const first = items[0];
    expect(first).toBeDefined();
    expect(readString(first, 'variantId')).toBe('motorola-edge-50-fusion--zold--256');
  });

  it('price bounds are inclusive', async () => {
    const body = await loadJson('/api/v1/products?minPrice=89990&maxPrice=89990');
    expect(readNumber(body, 'total')).toBeGreaterThan(0);
    const items = readItems(body);
    for (const item of items) {
      const price = item['price'];
      expectRecord(price);
      expect(readNumber(price, 'amount')).toBe(89990);
    }
  });

  it('inStock=true keeps only entries with an in-stock variant', async () => {
    const body = await loadJson('/api/v1/products?inStock=true');
    expect(readNumber(body, 'total')).toBeGreaterThan(0);
    const items = readItems(body);
    for (const item of items) {
      expect(readString(item, 'availability')).toBe('in_stock');
    }
  });

  it('is5g=true keeps only 5G products', async () => {
    const body = await loadJson('/api/v1/products?is5g=true');
    expect(readNumber(body, 'total')).toBeGreaterThan(0);
    const items = readItems(body);
    for (const item of items) {
      expectBoolean(item['is5g']);
      expect(item['is5g']).toBe(true);
    }
  });

  it('featured=true caps the list to 4 entries', async () => {
    const body = await loadJson('/api/v1/products?featured=true');
    expect(readNumber(body, 'total')).toBe(4);
    const items = readItems(body);
    expect(items.length).toBe(4);
    expect(items.map((i) => readString(i, 'slug'))).toEqual(FEATURED_FIRST_FOUR);
    const facets = body['facets'];
    expectRecord(facets);
    const brands = facets['brands'];
    expectArray(brands);
    for (const brand of brands) {
      expectRecord(brand);
      expect(readNumber(brand, 'count')).toBeLessThanOrEqual(4);
    }
  });
});

// ---------------------------------------------------------------------------
// listProducts: sorts
// ---------------------------------------------------------------------------

describe('GET /products sorts', () => {
  beforeEach(installHandlers);

  for (const [sort, expected] of Object.entries(SORTS)) {
    it(`sort=${sort} first two slugs`, async () => {
      const body = await loadJson(`/api/v1/products?sort=${sort}`);
      const items = readItems(body);
      expect(items.slice(0, 2).map((i) => readString(i, 'slug'))).toEqual(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// listProducts: facets
// ---------------------------------------------------------------------------

describe('GET /products facets', () => {
  beforeEach(installHandlers);

  it('default list reports brand, storage, color, is5g, inStock, priceRange', async () => {
    const body = await loadJson('/api/v1/products');
    const facets = body['facets'];
    expectRecord(facets);
    expect(facets['brands']).toEqual(DEFAULT_BRAND_FACET);
    expect(facets['storageGb']).toEqual(DEFAULT_STORAGE_FACET);
    const colors = facets['colors'];
    expectArray(colors);
    expect(colors[0]).toEqual(DEFAULT_FIRST_COLOR);
    expect(readNumber(facets, 'is5g')).toBe(DEFAULT_IS5G);
    expect(readNumber(facets, 'inStock')).toBe(DEFAULT_INSTOCK);
    const priceRange = facets['priceRange'];
    expectRecord(priceRange);
    const min = priceRange['min'];
    const max = priceRange['max'];
    expectRecord(min);
    expectRecord(max);
    expect(readNumber(min, 'amount')).toBe(DEFAULT_PRICE_RANGE.min);
    expect(readNumber(max, 'amount')).toBe(DEFAULT_PRICE_RANGE.max);
  });

  it('brand facet stays disjunctive under brand selection', async () => {
    const base = await loadJson('/api/v1/products');
    const filtered = await loadJson('/api/v1/products?brand=apple');
    const baseFacets = base['facets'];
    const filteredFacets = filtered['facets'];
    expectRecord(baseFacets);
    expectRecord(filteredFacets);
    const baseBrands = baseFacets['brands'];
    const filteredBrands = filteredFacets['brands'];
    expectArray(baseBrands);
    expectArray(filteredBrands);
    const findBrand = (list: unknown[], value: string): Record<string, unknown> | undefined => {
      for (const entry of list) {
        expectRecord(entry);
        if (entry['value'] === value) return entry;
      }
      return undefined;
    };
    const baseApple = findBrand(baseBrands, 'apple');
    const filteredApple = findBrand(filteredBrands, 'apple');
    expect(baseApple).toBeDefined();
    expect(filteredApple).toBeDefined();
    if (!baseApple || !filteredApple) return;
    expect(readNumber(baseApple, 'count')).toBe(readNumber(filteredApple, 'count'));
    const filteredHonor = findBrand(filteredBrands, 'honor');
    expect(filteredHonor).toBeDefined();
    if (!filteredHonor) return;
    expect(readNumber(filteredHonor, 'count')).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// getProduct
// ---------------------------------------------------------------------------

describe('GET /products/:slug', () => {
  beforeEach(installHandlers);

  it('returns the full product shape with id-asc variants and image src prefix', async () => {
    const body = await loadJson('/api/v1/products/motorola-edge-50-fusion');
    expect(readString(body, 'slug')).toBe('motorola-edge-50-fusion');
    const variants = body['variants'];
    expectArray(variants);
    expect(variants.length).toBeGreaterThan(0);
    for (let i = 1; i < variants.length; i += 1) {
      const a = variants[i - 1];
      const b = variants[i];
      expectRecord(a);
      expectRecord(b);
      const aId = readString(a, 'id');
      const bId = readString(b, 'id');
      expect(aId < bId || aId === bId).toBe(true);
    }
    const first = variants[0];
    expectRecord(first);
    const firstImages = first['images'];
    expectArray(firstImages);
    expect(firstImages.length).toBeGreaterThan(0);
    const firstImage = firstImages[0];
    expectRecord(firstImage);
    expect(readString(firstImage, 'src').startsWith('/api/v1/media/')).toBe(true);
    const specGroups = body['specGroups'];
    expectArray(specGroups);
    expect(specGroups.length).toBeGreaterThan(0);
    const firstSpec = specGroups[0];
    expectRecord(firstSpec);
    expect(readString(firstSpec, 'id')).toBe('fizikai-jellemzok');
  });

  it('returns 404 with the contract problem shape', async () => {
    const body = await expectProblem('/api/v1/products/does-not-exist', 404, 'NOT_FOUND');
    expect(body['detail']).toBe('product not found');
    expect(body['params']).toEqual({ slug: 'does-not-exist' });
  });
});

// ---------------------------------------------------------------------------
// listRelatedProducts
// ---------------------------------------------------------------------------

describe('GET /products/:slug/related', () => {
  beforeEach(installHandlers);

  it('returns up to 4 same-brand items, subject excluded, min storage', async () => {
    const body = await loadJson('/api/v1/products/apple-iphone-18-pro-max/related');
    expectArray(body);
    expect(body.length).toBeLessThanOrEqual(4);
    expect(body.length).toBeGreaterThan(0);
    for (const item of body) {
      expectRecord(item);
      expect(readString(item, 'slug')).not.toBe('apple-iphone-18-pro-max');
    }
  });

  it('returns the minimum-storage entry for each related product', async () => {
    const body = await loadJson('/api/v1/products/apple-iphone-18-pro-max/related');
    expectArray(body);
    for (const item of body) {
      expectRecord(item);
      const slug = readString(item, 'slug');
      const storageGb = readNumber(item, 'storageGb');
      // The related path picks the smallest storage the product carries.
      const store = catalogStore.current;
      expect(store).not.toBeNull();
      if (!store) return;
      const product = store.getProduct(slug);
      expect(product).toBeDefined();
      if (!product) return;
      const minStorage = Math.min(...product.variants.map((v) => v.storageGb));
      expect(storageGb).toBe(minStorage);
    }
  });

  it('returns 404 for an unknown slug', async () => {
    const body = await expectProblem('/api/v1/products/does-not-exist/related', 404, 'NOT_FOUND');
    expect(body['detail']).toBe('product not found');
    expect(body['params']).toEqual({ slug: 'does-not-exist' });
  });
});

// ---------------------------------------------------------------------------
// getMedia
// ---------------------------------------------------------------------------

describe('GET /media/:imageId', () => {
  beforeEach(installHandlers);

  it('returns 404 with a Problem when the image is unknown', async () => {
    const res = await fetch('http://localhost/api/v1/media/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    const body: unknown = await res.json();
    expect(isRecord(body), 'body is a record').toBe(true);
    if (!isRecord(body)) return;
    expect(body['code']).toBe('NOT_FOUND');
    expect(body['detail']).toBe('image not found: does-not-exist');
    expect(body['params']).toEqual({ imageId: 'does-not-exist' });
  });

  it('returns 200 image/png with immutable cache header when the loader supplies bytes', async () => {
    // Pick a real image id from the first product's first variant.
    const store = catalogStore.current;
    expect(store).not.toBeNull();
    if (!store) return;
    const product = store.getProduct('motorola-edge-50-fusion');
    expect(product).toBeDefined();
    if (!product) return;
    const firstVariant = product.variants.at(0);
    expect(firstVariant).toBeDefined();
    if (firstVariant === undefined) return;
    const firstImage = firstVariant.images.at(0);
    expect(firstImage).toBeDefined();
    if (firstImage === undefined) return;
    const imageId = firstImage.id;
    const { buildMediaHandler } = await import('./catalog.handlers');
    const stub = (id: string): Promise<ArrayBuffer | undefined> => {
      if (id !== imageId) return Promise.resolve(undefined);
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
      return Promise.resolve(bytes.buffer);
    };
    // Override the media handler registered by installHandlers with one
    // that uses the stub loader; the rest of the catalog handlers stay
    // in place from the beforeEach.
    server.resetHandlers(...buildCatalogHandlers(options), buildMediaHandler(stub));
    const res = await fetch(`http://localhost/api/v1/media/${imageId}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const ab = await res.arrayBuffer();
    expect(ab.byteLength).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// sanity: store counts match the fixture
// ---------------------------------------------------------------------------

describe('store bookkeeping', () => {
  it('holds 48 products, 55 entries and the documented image count', () => {
    expect(catalogStore.current).not.toBeNull();
    const store = catalogStore.current;
    expect(store).not.toBeNull();
    if (!store) return;
    expect(store.listProducts().length).toBe(48);
    expect(store.listEntries().length).toBe(TOTAL_ENTRIES);
    const images = new Set<string>();
    for (const entry of store.listEntries()) {
      for (const image of entry.variant.images) {
        images.add(image.id);
      }
    }
    expect(images.size).toBe(TOTAL_IMAGES);
  });

  it('getVariant resolves a known id to product and variant, and unknown ids to undefined', () => {
    const store = catalogStore.current;
    expect(store).not.toBeNull();
    if (!store) return;
    const hit = store.getVariant('motorola-edge-50-fusion--zold--256');
    expect(hit).toBeDefined();
    if (!hit) return;
    expect(hit.product.slug).toBe('motorola-edge-50-fusion');
    expect(hit.variant.storageGb).toBe(256);
    expect(hit.variant.maxQuantity).toBe(5);
    expect(store.getVariant('nope')).toBeUndefined();
  });
});
