/**
 * MIM-210 — catalogue MSW handlers on the 2.0.0 contract.
 *
 * Wires the four catalogue operationIds the contract publishes:
 *
 *   - listProducts         → GET  /api/v1/products
 *   - getProduct           → GET  /api/v1/products/{slug}
 *   - listRelatedProducts  → GET  /api/v1/products/{slug}/related
 *   - getMedia             → GET  /api/v1/media/{imageId}
 *
 * The handlers live on top of `catalogStore` (this file's module
 * local). The store is loaded by `projects/shop-mocks/src/browser.ts` from
 * `docs/api/fixtures/catalog.json`; the spec loads its own copy.
 */

import { http, HttpResponse, type RequestHandler } from 'msw';

import type { Image } from '@mi-bolt/api/models/image';
import type { Problem } from '@mi-bolt/api/models/problem';
import type { Product } from '@mi-bolt/api/models/product';

import { registerBusinessHandlers, type CreateHandlersOptions } from '../create-handlers';
import { faultResponse, slowOnce } from '../faults';
import { isRecord as isPlainRecord } from '../is-record';
import { PROBLEM_CONTENT_TYPE } from '../problem-response';
import { stockLedger } from '../stock/stock-ledger';
import {
  type CatalogEntry,
  type CatalogFixture,
  type CatalogStore,
  isCatalogFixture,
  load,
  toCatalogItem,
} from './catalog-store';
import {
  type CatalogFilter,
  type FilterError,
  paginate,
  parseListProductsParams,
  sortEntries,
  applyFilters,
  toCatalogItems,
} from './catalog-filter';
import { buildFacets } from './catalog-facets';

/** Module-local store. `projects/shop-mocks/src/browser.ts` calls `loadCatalogFixture(store)`. */
export const catalogStore: { current: CatalogStore | null } = { current: null };

/** Loads the supplied fixture into the store, replacing any prior load. */
export function loadCatalogFixture(fixture: CatalogFixture): void {
  catalogStore.current = load(fixture);
}

/** True when the store has been loaded. The spec uses it as an assertion. */
export function isCatalogStoreLoaded(): boolean {
  return catalogStore.current !== null;
}

/** Returns the current store; throws when none was loaded. */
function requireStore(): CatalogStore {
  if (catalogStore.current === null) {
    throw new Error('[catalog.handlers] catalog store has not been loaded');
  }
  return catalogStore.current;
}

/** Build a deterministic 24-char lowercase-hex trace id from the clock. */
function traceId(options: CreateHandlersOptions): string {
  const ms = Date.parse(options.clock.now());
  const hex = (ms >>> 0).toString(16).padStart(8, '0');
  return (hex + '0000000000000000').slice(0, 24);
}

/** Map a parse-time error onto the 400 Problem. */
function invalidRequest(options: CreateHandlersOptions, error: FilterError): Response {
  const detail = error.kind === 'invalid-value' ? error.detail : `${error.parameter} is invalid`;
  const body: Problem = {
    type: 'urn:mi-bolt:problem:invalid-request',
    title: 'Invalid request',
    status: 400,
    code: 'INVALID_REQUEST',
    detail,
    traceId: traceId(options),
    fieldErrors: [],
    params: { parameter: error.parameter },
  };
  return HttpResponse.json(body, {
    status: 400,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  });
}

function notFoundProblem(
  options: CreateHandlersOptions,
  detail: string,
  params: Readonly<Record<string, unknown>>,
): Response {
  const body: Problem = {
    type: 'urn:mi-bolt:problem:not-found',
    title: 'Resource not found',
    status: 404,
    code: 'NOT_FOUND',
    detail,
    traceId: traceId(options),
    fieldErrors: [],
    params,
  };
  return HttpResponse.json(body, {
    status: 404,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  });
}

/** Apply the filter, sort, featured cap and pagination in one pass. */
function buildProductPage(
  store: CatalogStore,
  filter: CatalogFilter,
  now?: string,
): {
  items: ReturnType<typeof toCatalogItem>[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: 12 | 24;
} {
  const entries = stockEntries(store, now);
  const filtered = applyFilters(entries, filter);
  const sorted = sortEntries(filtered, filter.sort, filter.q);
  const capped = filter.featured === true ? sorted.slice(0, 4) : sorted;
  const page = paginate(capped, filter.page, filter.pageSize);
  return {
    items: toCatalogItems(page.items),
    total: page.total,
    totalPages: page.totalPages,
    page: filter.page,
    pageSize: filter.pageSize,
  };
}

/**
 * Every list entry, with `stockLedger.current` mapped over each one
 * when the ledger exists and otherwise untouched. The list page, the
 * facets and the related products all read through this so a unit's
 * sold-out state reaches every catalogue answer.
 */
function stockEntries(store: CatalogStore, now?: string): readonly CatalogEntry[] {
  const ledger = stockLedger.current;
  if (ledger === null) return store.listEntries(now);
  return store.listEntries(now).map((entry) => ledger.applyToEntry(entry));
}

/** Build the `listProducts` handler. */
function listProductsHandler(options: CreateHandlersOptions): RequestHandler {
  return http.get('*/api/v1/products', async ({ request }) => {
    const url = new URL(request.url);
    // The shell's availability probe must not consume the page's
    // catalogue retry/race scenario. Full filtered pages still exercise it.
    const promotionProbe = request.headers.get('X-Mibolt-Promotion-Probe') === 'true';
    if (!promotionProbe) {
      const fault = faultResponse(options, 'products');
      if (fault !== null) return fault;
      await slowOnce(options, 'products');
    }
    const parsed = parseListProductsParams(url.searchParams);
    if (!parsed.ok) return invalidRequest(options, parsed.error);
    const store = requireStore();
    const page = buildProductPage(store, parsed.filter, options.clock.now());
    const facets = buildFacets(stockEntries(store, options.clock.now()), parsed.filter);
    const body = {
      items: page.items,
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: page.totalPages,
      facets,
      serverTime: options.clock.now(),
      nextPriceChangeAt: stockEntries(store, options.clock.now())
        .map((entry) => entry.product.nextPriceChangeAt)
        .filter((value): value is string => value !== undefined)
        .sort()[0],
    };
    return HttpResponse.json(body);
  });
}

/**
 * E048 — `?mi-scenario=gallery-several-images` makes the product read
 * give every variant the product's other colour photos after its own,
 * so the gallery's several-photo state (previous/next, the counter,
 * one thumbnail per photo) can be exercised; the catalogue store is
 * not changed, so the catalogue card and the cart line still show the
 * variant's own first photo.
 */
export const GALLERY_SEVERAL_IMAGES_SCENARIO = 'gallery-several-images';

/**
 * Returns a new product whose every variant carries its own photos
 * first, then every other image of the product that variant does not
 * already have — each image id once, in the order the product's
 * variants first carry them. Never mutates its argument: the product,
 * its variants and their image arrays are all new objects.
 */
export function withEveryColourImage(product: Product): Product {
  const shared: Image[] = [];
  const seen = new Set<string>();
  for (const variant of product.variants) {
    for (const image of variant.images) {
      if (seen.has(image.id)) continue;
      seen.add(image.id);
      shared.push(image);
    }
  }
  const variants = product.variants.map((variant) => {
    const owned = new Set(variant.images.map((image) => image.id));
    const extra = shared.filter((image) => !owned.has(image.id));
    return { ...variant, images: [...variant.images, ...extra] };
  });
  return { ...product, variants };
}

/** Build the `getProduct` handler. */
function getProductHandler(options: CreateHandlersOptions): RequestHandler {
  return http.get('*/api/v1/products/:slug', async ({ params }) => {
    const fault = faultResponse(options, 'product');
    if (fault !== null) return fault;
    await slowOnce(options, 'product');
    const slug = String(params['slug']);
    const store = requireStore();
    const product = store.getProduct(slug, options.clock.now());
    if (product === undefined) {
      return notFoundProblem(options, 'product not found', { slug });
    }
    const withStock = stockLedger.current?.applyToProduct(product) ?? product;
    if (options.scenario.name === GALLERY_SEVERAL_IMAGES_SCENARIO) {
      return HttpResponse.json(withEveryColourImage(withStock));
    }
    return HttpResponse.json(withStock);
  });
}

/** Build the `listRelatedProducts` handler. */
function listRelatedProductsHandler(options: CreateHandlersOptions): RequestHandler {
  return http.get('*/api/v1/products/:slug/related', async ({ params }) => {
    const fault = faultResponse(options, 'related-products');
    if (fault !== null) return fault;
    await slowOnce(options, 'related-products');
    const slug = String(params['slug']);
    const store = requireStore();
    const subject = store.getProduct(slug, options.clock.now());
    if (subject === undefined) {
      return notFoundProblem(options, 'product not found', { slug });
    }
    const items = relatedItems(store, slug, options.clock.now());
    return HttpResponse.json(items);
  });
}

/** Pick up to 4 related products for the subject slug. */
function relatedItems(
  store: CatalogStore,
  subjectSlug: string,
  now: string,
): ReturnType<typeof toCatalogItem>[] {
  const subject = store.getProduct(subjectSlug, now);
  if (subject === undefined) return [];
  const subjectBrand = subject.brand;
  const subjectStorages = new Set<number>();
  for (const variant of subject.variants) {
    subjectStorages.add(variant.storageGb);
  }

  const candidates = store.listProducts().filter((p) => p.slug !== subjectSlug);

  const rankAndIdSort = (
    a: (typeof candidates)[number],
    b: (typeof candidates)[number],
  ): number => {
    const ra = store.getRanking(a.slug)?.rank ?? 0;
    const rb = store.getRanking(b.slug)?.rank ?? 0;
    if (ra !== rb) return ra - rb;
    const na = Number(a.id);
    const nb = Number(b.id);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.slug.localeCompare(b.slug);
  };

  const sameBrand = candidates.filter((p) => p.brand === subjectBrand).sort(rankAndIdSort);
  const sameStorage = candidates
    .filter(
      (p) => p.brand !== subjectBrand && p.variants.some((v) => subjectStorages.has(v.storageGb)),
    )
    .sort(rankAndIdSort);
  const merged = [...sameBrand, ...sameStorage];
  const out = [];
  const seen = new Set<string>();
  for (const product of merged) {
    if (seen.has(product.slug)) continue;
    seen.add(product.slug);
    const entry = pickMinimumEntry(store, product.slug, now);
    if (entry !== null) out.push(entry);
    if (out.length === 4) break;
  }
  return out;
}

/** Pick the (product, min storage) entry with no filters applied. */
function pickMinimumEntry(
  store: CatalogStore,
  slug: string,
  now: string,
): ReturnType<typeof toCatalogItem> | null {
  const entries = stockEntries(store, now)
    .filter((e) => e.product.slug === slug)
    .sort((a, b) => a.storageGb - b.storageGb);
  const entry = entries.at(0);
  if (entry === undefined) {
    return null;
  }
  return toCatalogItem(entry);
}

/** Build the `getMedia` handler. The loader is injected so the spec can stub it. */
export function buildMediaHandler(
  options: CreateHandlersOptions,
  loader: MediaLoader = defaultMediaLoader,
): RequestHandler {
  return http.get('*/api/v1/media/:imageId', async ({ params }) => {
    const imageId = String(params['imageId']);
    const bytes = await loader(imageId);
    if (bytes === undefined) {
      const body: Problem = {
        type: 'urn:mi-bolt:problem:not-found',
        title: 'Resource not found',
        status: 404,
        code: 'NOT_FOUND',
        detail: `image not found: ${imageId}`,
        traceId: traceId(options),
        fieldErrors: [],
        params: { imageId },
      };
      return HttpResponse.json(body, {
        status: 404,
        headers: { 'content-type': PROBLEM_CONTENT_TYPE },
      });
    }
    return new HttpResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  });
}

/** Loader signature: returns bytes for the supplied media id or undefined. */
export type MediaLoader = (imageId: string) => Promise<ArrayBuffer | undefined>;

/**
 * Default loader: asks the current document's origin for the file.
 * Uses MSW's `bypass()` so the service worker does not intercept its
 * own request and a loop is impossible.
 */
async function defaultMediaLoader(imageId: string): Promise<ArrayBuffer | undefined> {
  const globalScope: unknown = globalThis;
  const origin = isPlainRecord(globalScope) ? readOrigin(globalScope) : '';
  if (origin.length === 0) return undefined;
  const url = `${origin}/media/${imageId}.png`;
  const request = new Request(url, { method: 'GET' });
  try {
    const response = await fetch(request);
    if (!response.ok) return undefined;
    return await response.arrayBuffer();
  } catch {
    // The Node test environment has no real network and the MSW
    // worker rejects the unhandled /media request with `error`;
    // either failure mode resolves as "not found" rather than
    // surfacing as a 500 to the caller.
    return undefined;
  }
}

function readOrigin(scope: Record<string, unknown>): string {
  const location = scope['location'];
  if (!isPlainRecord(location)) return '';
  const origin = location['origin'];
  return typeof origin === 'string' ? origin : '';
}

/** Public handler factory. Hands the four handlers back to the registry. */
export function buildCatalogHandlers(options: CreateHandlersOptions): readonly RequestHandler[] {
  const origin = Date.parse(options.clock.now());
  // Explicit demonstration scenarios only; ordinary fixtures stay undecorated.
  const start =
    origin + (options.scenario.name === 'halloween-appearance-future' ? 60_000 : -60_000);
  const end = origin + (options.scenario.name === 'halloween-appearance-expired' ? -1 : 120_000);
  const enabled =
    options.scenario.name === 'halloween' ||
    options.scenario.name.startsWith('halloween-appearance-');
  return [
    http.get(`${options.apiRoot}/shop-appearance`, ({ request }) => {
      const unknown = new URL(request.url).searchParams.keys().next().value;
      if (unknown !== undefined)
        return invalidRequest(options, { kind: 'unknown-parameter', parameter: unknown });
      const serverTime = options.clock.now();
      const now = Date.parse(serverTime);
      return HttpResponse.json(
        {
          halloweenActive: enabled && now >= start && now < end,
          serverTime,
          ...(enabled && now < start
            ? { nextChangeAt: new Date(start).toISOString() }
            : enabled && now < end
              ? { nextChangeAt: new Date(end).toISOString() }
              : {}),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }),
    listProductsHandler(options),
    getProductHandler(options),
    listRelatedProductsHandler(options),
    buildMediaHandler(options),
  ];
}

registerBusinessHandlers(buildCatalogHandlers);

/** Re-export for the spec: pagination helper. */
export { paginate };
export type { CatalogEntry, CatalogFixture };

/** Type guard used by the browser / spec to import the JSON fixture. */
export const isCatalogFixtureShape = isCatalogFixture;
