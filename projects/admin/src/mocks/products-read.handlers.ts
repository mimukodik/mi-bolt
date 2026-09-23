/**
 * Read-side MSW handlers for the admin catalogue
 * (MIM-334, unit F7).
 *
 * `productsReadHandlers` answers `GET /api/v1/admin/products`,
 * `GET /api/v1/admin/products/:productId` and
 * `GET /api/v1/admin/brands` the way the backend's query service
 * does (MIM-334 decisions 1-3, quoted from the brief so unit B9 and
 * this mock agree on every rule): a session guard first, then the
 * contract's 400 `INVALID_REQUEST` for every query or path parameter
 * outside its range, then filters, sort with the id as the tie-break,
 * paging with `totalElements` and `totalPages`, and the list-item
 * projection; the detail call carries the `ETag` header whose value
 * is the product `version` quoted; the brands call returns the
 * distinct brand names, archived included, sorted case-insensitively
 * by code-unit order. The `list-error` and `empty-catalog` scenarios
 * follow the contract.
 */
import { HttpResponse, http } from 'msw';
import type { HttpHandler } from 'msw';

import type { AdminProduct } from '../app/api/generated/models/admin-product';
import type { AdminProductListItem } from '../app/api/generated/models/admin-product-list-item';
import type { AdminProductPage } from '../app/api/generated/models/admin-product-page';
import type { AdminProductSortField } from '../app/api/generated/models/admin-product-sort-field';
import type { AdminProductStatusFilter } from '../app/api/generated/models/admin-product-status-filter';
import type { AdminProductVariant } from '../app/api/generated/models/admin-product-variant';
import type { Money } from '../app/api/generated/models/money';
import type { Problem } from '../app/api/generated/models/problem';
import type { SortDirection } from '../app/api/generated/models/sort-direction';
import type { MockDb } from './db';
import { sessionRejection } from './guards';
import { problem } from './problem';

const PRODUCTS_PATH = '*/api/v1/admin/products';
const PRODUCT_DETAIL_PATH = '*/api/v1/admin/products/:productId';
const BRANDS_PATH = '*/api/v1/admin/brands';

const STATUS_FILTER_VALUES: readonly string[] = ['active', 'archived', 'all'];
const SORT_FIELD_VALUES: readonly string[] = [
  'rank',
  'name',
  'brand',
  'releasedAt',
  'minPrice',
  'totalStock',
  'featured',
];
const SORT_DIRECTION_VALUES: readonly string[] = ['asc', 'desc'];

function isStatusFilter(value: string): value is AdminProductStatusFilter {
  return STATUS_FILTER_VALUES.includes(value);
}
function isSortField(value: string): value is AdminProductSortField {
  return SORT_FIELD_VALUES.includes(value);
}
function isSortDirection(value: string): value is SortDirection {
  return SORT_DIRECTION_VALUES.includes(value);
}

const DEFAULT_STATUS: AdminProductStatusFilter = 'active';
const DEFAULT_SORT: AdminProductSortField = 'rank';
const DEFAULT_DIRECTION: SortDirection = 'asc';
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function invalidParameter(parameter: string): HttpResponse<Problem> {
  return problem(400, 'INVALID_REQUEST', 'Invalid request', {
    detail: 'Query or path parameter is not acceptable',
    params: { parameter },
  });
}

function readInt(searchParams: URLSearchParams, name: string): number | undefined {
  const value = searchParams.get(name);
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : NaN;
}

function readBool(searchParams: URLSearchParams, name: string): boolean | undefined {
  const value = searchParams.get(name);
  if (value === null) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

interface ListQuery {
  readonly status: AdminProductStatusFilter;
  readonly sort: AdminProductSortField;
  readonly direction: SortDirection;
  readonly page: number;
  readonly pageSize: number;
  readonly q: string | undefined;
  readonly brands: readonly string[];
  readonly featured: boolean | undefined;
  readonly outOfStock: boolean | undefined;
}

function parseListQuery(
  request: Request,
): { query: ListQuery } | { rejection: HttpResponse<Problem> } {
  const searchParams = new URL(request.url).searchParams;

  const statusRaw = searchParams.get('status') ?? DEFAULT_STATUS;
  if (!isStatusFilter(statusRaw)) return { rejection: invalidParameter('status') };

  const sortRaw = searchParams.get('sort') ?? DEFAULT_SORT;
  if (!isSortField(sortRaw)) return { rejection: invalidParameter('sort') };

  const directionRaw = searchParams.get('direction') ?? DEFAULT_DIRECTION;
  if (!isSortDirection(directionRaw)) return { rejection: invalidParameter('direction') };

  const pageRaw = readInt(searchParams, 'page');
  if (pageRaw !== undefined && (Number.isNaN(pageRaw) || pageRaw < DEFAULT_PAGE)) {
    return { rejection: invalidParameter('page') };
  }
  const page = pageRaw ?? DEFAULT_PAGE;

  const pageSizeRaw = readInt(searchParams, 'pageSize');
  if (
    pageSizeRaw !== undefined &&
    (Number.isNaN(pageSizeRaw) || pageSizeRaw < 1 || pageSizeRaw > MAX_PAGE_SIZE)
  ) {
    return { rejection: invalidParameter('pageSize') };
  }
  const pageSize = pageSizeRaw ?? DEFAULT_PAGE_SIZE;

  const q = searchParams.get('q') ?? undefined;
  if (q !== undefined && q.length > 100) return { rejection: invalidParameter('q') };

  const featured = readBool(searchParams, 'featured');
  const outOfStock = readBool(searchParams, 'outOfStock');

  return {
    query: {
      status: statusRaw,
      sort: sortRaw,
      direction: directionRaw,
      page,
      pageSize,
      q,
      brands: searchParams.getAll('brand'),
      featured,
      outOfStock,
    },
  };
}

function normalise(value: string): string {
  return value.trim().normalize('NFC').toLowerCase();
}

function totalStock(variants: readonly AdminProductVariant[]): number {
  let total = 0;
  for (const variant of variants) total += variant.stock;
  return total;
}

function minPriceAmount(variants: readonly AdminProductVariant[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (const variant of variants) if (variant.price.amount < min) min = variant.price.amount;
  return Number.isFinite(min) ? min : 0;
}

function maxPriceAmount(variants: readonly AdminProductVariant[]): number {
  let max = 0;
  for (const variant of variants) if (variant.price.amount > max) max = variant.price.amount;
  return max;
}

function matchesStatus(product: AdminProduct, status: AdminProductStatusFilter): boolean {
  if (status === 'all') return true;
  return product.status === status;
}

function matchesQuery(product: AdminProduct, q: string | undefined): boolean {
  if (q === undefined) return true;
  const trimmed = q.trim();
  if (trimmed.length === 0) return true;
  const needle = normalise(trimmed);
  const haystack = normalise(`${product.brand} ${product.name} ${product.slug}`);
  return haystack.includes(needle);
}

function matchesBrands(product: AdminProduct, brands: readonly string[]): boolean {
  if (brands.length === 0) return true;
  return brands.includes(product.brand);
}

function matchesFeatured(product: AdminProduct, featured: boolean | undefined): boolean {
  return featured === undefined ? true : product.featured === featured;
}

function matchesOutOfStock(product: AdminProduct, outOfStock: boolean | undefined): boolean {
  if (outOfStock === undefined) return true;
  const total = totalStock(product.variants);
  return outOfStock ? total === 0 : total > 0;
}

function sortValue(product: AdminProduct, field: AdminProductSortField): number | string | boolean {
  switch (field) {
    case 'rank':
      return product.rank;
    case 'name':
      return product.name.toLowerCase();
    case 'brand':
      return product.brand.toLowerCase();
    case 'releasedAt':
      return product.releasedAt;
    case 'minPrice':
      return minPriceAmount(product.variants);
    case 'totalStock':
      return totalStock(product.variants);
    case 'featured':
      return product.featured;
  }
}

function compareProducts(
  a: AdminProduct,
  b: AdminProduct,
  sort: AdminProductSortField,
  direction: SortDirection,
): number {
  const av = sortValue(a, sort);
  const bv = sortValue(b, sort);
  let primary: number;
  if (typeof av === 'number' && typeof bv === 'number') {
    primary = av - bv;
  } else if (typeof av === 'boolean' && typeof bv === 'boolean') {
    primary = av === bv ? 0 : av ? 1 : -1;
  } else {
    primary = String(av).localeCompare(String(bv));
  }
  if (primary !== 0) return direction === 'desc' ? -primary : primary;
  return a.id - b.id;
}

function toListItem(product: AdminProduct): AdminProductListItem {
  const variants = product.variants;
  const minPrice: Money = { amount: minPriceAmount(variants), currency: 'HUF' };
  const maxPrice: Money = { amount: maxPriceAmount(variants), currency: 'HUF' };
  return {
    id: product.id,
    version: product.version,
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    status: product.status,
    featured: product.featured,
    rank: product.rank,
    releasedAt: product.releasedAt,
    minPrice,
    maxPrice,
    totalStock: totalStock(variants),
    variantCount: variants.length,
    thumbnail: product.colors[0].image,
    colors: product.colors.map((color) => ({
      name: color.name,
      swatchHex: color.swatchHex,
    })),
  };
}

function filterAndSort(db: MockDb, query: ListQuery): AdminProduct[] {
  const products = [...db.products.values()].filter(
    (product) =>
      matchesStatus(product, query.status) &&
      matchesQuery(product, query.q) &&
      matchesBrands(product, query.brands) &&
      matchesFeatured(product, query.featured) &&
      matchesOutOfStock(product, query.outOfStock),
  );
  products.sort((a, b) => compareProducts(a, b, query.sort, query.direction));
  return products;
}

function pageFor(
  products: readonly AdminProduct[],
  page: number,
  pageSize: number,
): AdminProductPage {
  const totalElements = products.length;
  const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / pageSize);
  const start = (page - 1) * pageSize;
  const items =
    start >= totalElements ? [] : products.slice(start, start + pageSize).map(toListItem);
  return { items, page, pageSize, totalElements, totalPages };
}

function distinctBrands(db: MockDb): string[] {
  const seen = new Set<string>();
  for (const product of db.products.values()) seen.add(product.brand);
  return [...seen].sort((a, b) => {
    const av = a.toLowerCase();
    const bv = b.toLowerCase();
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });
}

function parseDetailProductId(
  request: Request,
): { productId: number } | { rejection: HttpResponse<Problem> } {
  const segments = new URL(request.url).pathname.split('/');
  const last = segments[segments.length - 1] ?? '';
  if (!/^[1-9][0-9]*$/.test(last)) return { rejection: invalidParameter('productId') };
  return { productId: Number(last) };
}

export function productsReadHandlers(db: MockDb): HttpHandler[] {
  return [
    http.get(PRODUCTS_PATH, ({ request }) => {
      const session = sessionRejection(db);
      if (session !== undefined) return session;
      if (db.scenario === 'list-error') {
        return problem(503, 'SERVICE_UNAVAILABLE', 'Service unavailable');
      }
      const parsed = parseListQuery(request);
      if ('rejection' in parsed) return parsed.rejection;
      const filtered = filterAndSort(db, parsed.query);
      const body = pageFor(filtered, parsed.query.page, parsed.query.pageSize);
      return HttpResponse.json(body);
    }),
    http.get(PRODUCT_DETAIL_PATH, ({ request }) => {
      const session = sessionRejection(db);
      if (session !== undefined) return session;
      const parsed = parseDetailProductId(request);
      if ('rejection' in parsed) return parsed.rejection;
      const product = db.products.get(parsed.productId);
      if (product === undefined) {
        return problem(404, 'NOT_FOUND', 'Resource not found', {
          detail: 'Product not found',
          params: { productId: parsed.productId },
        });
      }
      return HttpResponse.json(product, {
        headers: { ETag: `"${String(product.version)}"` },
      });
    }),
    http.get(BRANDS_PATH, () => {
      const session = sessionRejection(db);
      if (session !== undefined) return session;
      return HttpResponse.json(distinctBrands(db));
    }),
  ];
}
