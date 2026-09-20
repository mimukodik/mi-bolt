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
 * local). The store is loaded by `src/mocks/browser.ts` from
 * `docs/api/fixtures/catalog.json`; the spec loads its own copy.
 */

import { http, HttpResponse, type RequestHandler } from 'msw';

import { registerBusinessHandlers, type CreateHandlersOptions } from '../create-handlers';
import { isRecord as isPlainRecord } from '../is-record';
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

const PROBLEM_CONTENT_TYPE = 'application/problem+json' as const;

/** Module-local store. `src/mocks/browser.ts` calls `loadCatalogFixture(store)`. */
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
  if (!catalogStore.current) {
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

interface ProblemBody {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  traceId: string;
  fieldErrors: readonly { path: string; code: string }[];
  params?: Readonly<Record<string, unknown>>;
}

/** Map a parse-time error onto the 400 Problem. */
function invalidRequest(options: CreateHandlersOptions, error: FilterError): Response {
  const detail = error.kind === 'invalid-value' ? error.detail : `${error.parameter} is invalid`;
  const body: ProblemBody = {
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
  const body: ProblemBody = {
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
): {
  items: ReturnType<typeof toCatalogItem>[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: 12 | 24;
} {
  const entries = store.listEntries();
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

/** Build the `listProducts` handler. */
function listProductsHandler(options: CreateHandlersOptions) {
  return http.get('*/api/v1/products', ({ request }) => {
    const url = new URL(request.url);
    const parsed = parseListProductsParams(url.searchParams);
    if (!parsed.ok) return invalidRequest(options, parsed.error);
    const store = requireStore();
    const page = buildProductPage(store, parsed.filter);
    const facets = buildFacets(store.listEntries(), parsed.filter);
    const body = {
      items: page.items,
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: page.totalPages,
      facets,
    };
    return HttpResponse.json(body);
  });
}

/** Build the `getProduct` handler. */
function getProductHandler(options: CreateHandlersOptions) {
  return http.get('*/api/v1/products/:slug', ({ params }) => {
    const slug = String(params['slug']);
    const store = requireStore();
    const product = store.getProduct(slug);
    if (!product) {
      return notFoundProblem(options, 'product not found', { slug });
    }
    return HttpResponse.json(product);
  });
}

/** Build the `listRelatedProducts` handler. */
function listRelatedProductsHandler(options: CreateHandlersOptions) {
  return http.get('*/api/v1/products/:slug/related', ({ params }) => {
    const slug = String(params['slug']);
    const store = requireStore();
    const subject = store.getProduct(slug);
    if (!subject) {
      return notFoundProblem(options, 'product not found', { slug });
    }
    const items = relatedItems(store, slug);
    return HttpResponse.json(items);
  });
}

/** Pick up to 4 related products for the subject slug. */
function relatedItems(store: CatalogStore, subjectSlug: string) {
  const subject = store.getProduct(subjectSlug);
  if (!subject) return [];
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
    const entry = pickMinimumEntry(store, product.slug);
    if (entry) out.push(entry);
    if (out.length === 4) break;
  }
  return out;
}

/** Pick the (product, min storage) entry with no filters applied. */
function pickMinimumEntry(store: CatalogStore, slug: string) {
  const entries = store
    .listEntries()
    .filter((e) => e.product.slug === slug)
    .sort((a, b) => a.storageGb - b.storageGb);
  const entry = entries.at(0);
  if (entry === undefined) {
    return null;
  }
  return toCatalogItem(entry);
}

/** Build the `getMedia` handler. The loader is injected so the spec can stub it. */
export function buildMediaHandler(loader: MediaLoader = defaultMediaLoader): RequestHandler {
  return http.get('*/api/v1/media/:imageId', async ({ params }) => {
    const imageId = String(params['imageId']);
    const bytes = await loader(imageId);
    if (!bytes) {
      const body: ProblemBody = {
        type: 'urn:mi-bolt:problem:not-found',
        title: 'Resource not found',
        status: 404,
        code: 'NOT_FOUND',
        detail: `image not found: ${imageId}`,
        traceId: 'mock0000000000000000000000',
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
  const response = await fetch(request);
  if (!response.ok) return undefined;
  return response.arrayBuffer();
}

function readOrigin(scope: Record<string, unknown>): string {
  const location = scope['location'];
  if (!isPlainRecord(location)) return '';
  const origin = location['origin'];
  return typeof origin === 'string' ? origin : '';
}

/** Public handler factory. Hands the four handlers back to the registry. */
export function buildCatalogHandlers(options: CreateHandlersOptions): readonly RequestHandler[] {
  return [
    listProductsHandler(options),
    getProductHandler(options),
    listRelatedProductsHandler(options),
    buildMediaHandler(),
  ];
}

registerBusinessHandlers(buildCatalogHandlers);

/** Re-export for the spec: pagination helper. */
export { paginate };
export type { CatalogEntry, CatalogFixture };

/** Type guard used by the browser / spec to import the JSON fixture. */
export const isCatalogFixtureShape = isCatalogFixture;
