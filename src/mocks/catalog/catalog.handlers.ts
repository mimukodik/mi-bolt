/**
 * T06 — catalog MSW handlers.
 *
 * Wires the three catalog operationIds declared in docs/api/openapi.yaml:
 *
 *   - `getConfig`    → GET  /api/v1/config
 *   - `listProducts` → GET  /api/v1/products
 *   - `getProduct`   → GET  /api/v1/products/{slug}
 *
 * `listProducts` validates the query string, applies the AND-across /
 * OR-within filter predicates, sorts by the cheapest matching variant,
 * paginates, and emits:
 *
 *   - 400 Problem JSON on malformed params (T06-AC04)
 *   - 404 Problem JSON on out-of-range page (T06-AC02 / AC04)
 *   - 200 with an empty items array on legitimate empty result sets
 *   - 200 with a ProductPage on success
 *
 * `getProduct` returns 200 with the full Product or 404 Problem JSON.
 *
 * The handlers register themselves with the T05 factory via
 * `registerBusinessHandlers`; tests can also call `buildCatalogHandlers`
 * directly to obtain the handler list without touching the registry.
 *
 * Catalog fixtures are loaded by the bootstrap (browser or node entry)
 * into `options.repository.products`. The handlers stay free of any
 * I/O or Node-only imports so the file type-checks inside the Angular
 * browser bundle.
 */

import { http, HttpResponse, type RequestHandler } from 'msw';

import {
  registerBusinessHandlers,
  type CreateHandlersOptions,
} from '../create-handlers';
import type { Product, Variant } from '../repository';
import { buildFacets, type ProductFacets } from './facets';
import {
  DEFAULT_PAGE_SIZE,
  filterProducts,
  paginateMatches,
  parseCatalogFilter,
  type CatalogFilter,
  type FilterParseError,
  type ProductMatch,
  type SortMode,
} from './filter-products';

// ---------------------------------------------------------------------------
// Shared demo config (compiled-in, no I/O).
// ---------------------------------------------------------------------------

/** Mirror of docs/api/fixtures/config.json — kept here so the handlers
 *  have no filesystem dependency. Updated when the fixture changes. */
export const DEMO_CONFIG = {
  providerId: 'mi-bolt',
  displayName: 'MiBolt',
  currency: 'HUF',
  isDemo: true,
  termsVersion: 'demo-1',
  featuredSlugs: [
    'demo-one-5g',
    'demo-air-5g',
    'demo-pro-5g',
    'demo-lite-5g',
  ],
  maximumLineQuantity: 5,
} as const;

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

type ProductSummary = {
  id: string;
  slug: string;
  brand: string;
  name: string;
  highlights: readonly string[];
  defaultVariant: Variant;
  is5g: boolean;
  isDemo: true;
};

type ProductPage = {
  items: readonly ProductSummary[];
  total: number;
  page: number;
  pageSize: 12 | 24;
  facets: ProductFacets;
};

type ProblemBody = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  traceId: string;
  fieldErrors: readonly { path: string; message: string }[];
};

const PROBLEM_CONTENT_TYPE = 'application/problem+json' as const;

// ---------------------------------------------------------------------------
// Problem helpers — shape matches the OpenAPI `Problem` schema.
// ---------------------------------------------------------------------------

function traceId(options: CreateHandlersOptions): string {
  return `mock-trace-${options.scenario.name}`;
}

function validationProblem(
  options: CreateHandlersOptions,
  error: FilterParseError,
): Response {
  const body: ProblemBody = {
    type: 'urn:mi-bolt:problem:validation-failed',
    title: 'A kérés nem felel meg az elfogadható formátumnak.',
    status: 400,
    code: 'VALIDATION_FAILED',
    detail: error.detail,
    traceId: traceId(options),
    fieldErrors: [{ path: error.field, message: error.detail }],
  };
  return HttpResponse.json(body, {
    status: 400,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  });
}

function notFoundProblem(
  options: CreateHandlersOptions,
  detail: string,
  code: 'NOT_FOUND',
): Response {
  const body: ProblemBody = {
    type: 'urn:mi-bolt:problem:not-found',
    title: 'A kért végpont vagy erőforrás nem található.',
    status: 404,
    code,
    detail,
    traceId: traceId(options),
    fieldErrors: [],
  };
  return HttpResponse.json(body, {
    status: 404,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  });
}

// ---------------------------------------------------------------------------
// Default variant selection + ProductSummary assembly
// ---------------------------------------------------------------------------

/**
 * Returns a copy of `product` with `defaultVariant` replaced by
 * `replacement`. AC02 requires the returned summary to advertise the
 * CHEAPEST MATCHING variant as its default; the underlying fixture
 * product stays untouched so `getProduct` keeps the original default.
 */
function withDefaultVariant(
  product: Product,
  replacement: Variant,
): ProductSummary {
  return {
    id: product.id,
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    highlights: product.highlights,
    defaultVariant: replacement,
    is5g: product.is5g,
    isDemo: product.isDemo,
  };
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

function resolveApiRoot(apiRoot: string): string {
  return apiRoot.endsWith('/') ? apiRoot.slice(0, -1) : apiRoot;
}

/**
 * Returns the catalog products currently held in the repository.
 * The bootstrap (browser or node entry) is responsible for calling
 * `repository.loadProducts(...)` so this file stays free of any I/O
 * or Node-only imports. Tests do the same: each case seeds its own
 * repository before wiring the handlers.
 */
export function listCatalogProducts(
  options: CreateHandlersOptions,
): readonly Product[] {
  return options.repository.listProducts();
}

function buildListResponse(
  options: CreateHandlersOptions,
  filter: CatalogFilter,
  products: readonly Product[],
  matches: readonly ProductMatch[],
): Response {
  const pageSize: 12 | 24 = filter.pageSize;
  const page = filter.page;
  const paged = paginateMatches(matches, page, pageSize);
  if (paged.total > 0 && paged.items.length === 0) {
    return notFoundProblem(
      options,
      'A kért oldal kívül esik az eredmények tartományán.',
      'NOT_FOUND',
    );
  }
  const facets = buildFacets(products, filter, DEMO_CONFIG.featuredSlugs);
  const body: ProductPage = {
    items: paged.items.map(({ product, matchingVariant }) =>
      withDefaultVariant(product, matchingVariant),
    ),
    total: paged.total,
    page: paged.page,
    pageSize: paged.pageSize,
    facets,
  };
  return HttpResponse.json(body);
}

/**
 * Public handler factory. The returned list is what
 * `registerBusinessHandlers` will hand to the T05 dispatcher shell.
 */
export function buildCatalogHandlers(
  options: CreateHandlersOptions,
): readonly RequestHandler[] {
  // MSW 2.x matches paths against the request's origin. The leading
  // `*` wildcard anchors the path while leaving the origin open, so
  // the browser worker (`location.origin`) and the Node runner
  // (`http://localhost`) both intercept the same requests. The cart
  // and checkout handlers use the same pattern.
  const wildcard = `*${resolveApiRoot(options.apiRoot)}`;
  const products = listCatalogProducts(options);

  const getConfig = http.get(`${wildcard}/config`, () =>
    HttpResponse.json(DEMO_CONFIG),
  );

  const listProducts = http.get(`${wildcard}/products`, ({ request }) => {
    const url = new URL(request.url);
    const parsed = parseCatalogFilter(url.searchParams);
    if (!parsed.ok) {
      return validationProblem(options, parsed.error);
    }
    const matches = filterProducts(
      products,
      parsed.value,
      DEMO_CONFIG.featuredSlugs,
    );
    return buildListResponse(options, parsed.value, products, matches);
  });

  const getProduct = http.get(`${wildcard}/products/:slug`, ({ params }) => {
    const slug = String(params['slug']);
    const product = options.repository.getProductBySlug(slug);
    if (!product) {
      return notFoundProblem(
        options,
        `Ismeretlen termék: ${slug}.`,
        'NOT_FOUND',
      );
    }
    return HttpResponse.json(product);
  });

  return [getConfig, listProducts, getProduct];
}

registerBusinessHandlers(buildCatalogHandlers);

// Re-export so tests can import the same primitives the handlers use.
export { DEFAULT_PAGE_SIZE };
export type { SortMode };