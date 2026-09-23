/**
 * Read-side MSW handlers for the admin catalogue
 * (MIM-334, unit F7).
 *
 * `productsReadHandlers` answers `GET /api/v1/admin/products`,
 * `GET /api/v1/admin/products/:productId` and
 * `GET /api/v1/admin/brands` the way the backend's query service
 * does (MIM-334 decisions 1-3, quoted from the brief so unit B9 and
 * this mock agree on every rule): a session guard first, then an
 * unknown query key, then the contract's 400 `INVALID_REQUEST` for a
 * query or path value that does not convert or that breaks its
 * constraint, worded exactly as `backend-answers.ts` words
 * `ProblemAdvice`, then filters, sort with the id as the tie-break,
 * paging with `totalElements` and `totalPages`, and the list-item
 * projection; the detail call carries the `ETag` header whose value
 * is the product `version` quoted; the brands call returns the
 * distinct brand names, archived included, sorted case-insensitively
 * by code-unit order. The `list-error` and `empty-catalog` scenarios
 * follow the contract.
 */
import { HttpResponse, http, type HttpHandler } from 'msw';

import type { AdminProduct } from '../app/api/generated/models/admin-product';
import type { AdminProductListItem } from '../app/api/generated/models/admin-product-list-item';
import type { AdminProductPage } from '../app/api/generated/models/admin-product-page';
import type { AdminProductSortField } from '../app/api/generated/models/admin-product-sort-field';
import type { AdminProductStatusFilter } from '../app/api/generated/models/admin-product-status-filter';
import type { AdminProductVariant } from '../app/api/generated/models/admin-product-variant';
import type { Money } from '../app/api/generated/models/money';
import type { Problem } from '../app/api/generated/models/problem';
import type { SortDirection } from '../app/api/generated/models/sort-direction';
import {
  javaTrim,
  javaTrimAllWhitespace,
  notAcceptable,
  serviceUnavailable,
  unknownQueryParameter,
  wrongType,
} from './backend-answers';
import type { MockDb } from './db';
import { sessionRejection } from './guards';
import { problem } from './problem';

const PRODUCTS_PATH = '*/api/v1/admin/products';
const PRODUCT_DETAIL_PATH = '*/api/v1/admin/products/:productId';
const BRANDS_PATH = '*/api/v1/admin/brands';

const KNOWN_QUERY_PARAMS = new Set([
  'q',
  'brand',
  'status',
  'featured',
  'outOfStock',
  'sort',
  'direction',
  'page',
  'pageSize',
]);
const NO_QUERY_PARAMS: ReadonlySet<string> = new Set();

const DEFAULT_STATUS: AdminProductStatusFilter = 'active';
const DEFAULT_SORT: AdminProductSortField = 'rank';
const DEFAULT_DIRECTION: SortDirection = 'asc';
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const STATUS_VALUES: ReadonlyMap<string, AdminProductStatusFilter> = new Map([
  ['active', 'active'],
  ['ACTIVE', 'active'],
  ['archived', 'archived'],
  ['ARCHIVED', 'archived'],
  ['all', 'all'],
  ['ALL', 'all'],
]);

const SORT_VALUES: ReadonlyMap<string, AdminProductSortField> = new Map([
  ['rank', 'rank'],
  ['RANK', 'rank'],
  ['name', 'name'],
  ['NAME', 'name'],
  ['brand', 'brand'],
  ['BRAND', 'brand'],
  ['releasedAt', 'releasedAt'],
  ['RELEASED_AT', 'releasedAt'],
  ['minPrice', 'minPrice'],
  ['MIN_PRICE', 'minPrice'],
  ['totalStock', 'totalStock'],
  ['TOTAL_STOCK', 'totalStock'],
  ['featured', 'featured'],
  ['FEATURED', 'featured'],
]);

const DIRECTION_VALUES: ReadonlyMap<string, SortDirection> = new Map([
  ['asc', 'asc'],
  ['ASC', 'asc'],
  ['desc', 'desc'],
  ['DESC', 'desc'],
]);

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const INT64_MIN = -9223372036854775808n;
const INT64_MAX = 9223372036854775807n;
const DECIMAL_INTEGER = /^[+-]?[0-9]+$/;
const HEX_INTEGER = /^(-?)(?:0[xX]|#)([0-9a-fA-F]+)$/;

type ConversionResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/** The first query key not in `known`, worded as the backend words an undeclared key. */
function firstUnknownQueryParam(
  searchParams: URLSearchParams,
  known: ReadonlySet<string>,
): HttpResponse<Problem> | undefined {
  for (const key of searchParams.keys()) {
    if (!known.has(key)) return unknownQueryParameter(key);
  }
  return undefined;
}

/** A wire value or a constant-name alias, mapped to its wire value; absent/`''` is the default. */
function convertEnum<T extends string>(
  raw: string | null,
  defaultValue: T,
  values: ReadonlyMap<string, T>,
): ConversionResult<T> {
  if (raw === null || raw === '') return { ok: true, value: defaultValue };
  const mapped = values.get(raw);
  return mapped === undefined ? { ok: false } : { ok: true, value: mapped };
}

/** `true`/`on`/`yes`/`1` and their false counterparts, trimmed like Java's String.trim() and lower-cased; absent/`''` is "no filter". */
function convertBoolean(raw: string | null): ConversionResult<boolean | undefined> {
  if (raw === null) return { ok: true, value: undefined };
  const normalised = javaTrim(raw).toLowerCase();
  if (normalised === '') return { ok: true, value: undefined };
  if (['true', 'on', 'yes', '1'].includes(normalised)) return { ok: true, value: true };
  if (['false', 'off', 'no', '0'].includes(normalised)) return { ok: true, value: false };
  return { ok: false };
}

/** Java whitespace removed (StringUtils.trimAllWhitespace), then decimal (optional `+`/`-`) or `0x`/`#` hex (optional `-` only), bounded to a 32-bit signed integer; absent/`''` is `fallback`. */
function convertInteger(raw: string | null, fallback: number): ConversionResult<number> {
  if (raw === null || raw === '') return { ok: true, value: fallback };
  const stripped = javaTrimAllWhitespace(raw);
  if (DECIMAL_INTEGER.test(stripped)) {
    const value = Number(stripped);
    return isInt32(value) ? { ok: true, value } : { ok: false };
  }
  const hexMatch = HEX_INTEGER.exec(stripped);
  if (hexMatch === null) return { ok: false };
  const [, sign, digits] = hexMatch;
  const magnitude = Number.parseInt(digits, 16);
  const value = sign === '-' ? -magnitude : magnitude;
  return isInt32(value) ? { ok: true, value } : { ok: false };
}

function isInt32(value: number): boolean {
  return Number.isInteger(value) && value >= INT32_MIN && value <= INT32_MAX;
}

/** Java whitespace removed (StringUtils.trimAllWhitespace), then decimal (optional `+`/`-`) or `0x`/`#` hex (optional `-` only), as a `bigint` with no range bound applied yet. */
function convertLong(raw: string): ConversionResult<bigint> {
  const stripped = javaTrimAllWhitespace(raw);
  if (DECIMAL_INTEGER.test(stripped)) return { ok: true, value: BigInt(stripped) };
  const hexMatch = HEX_INTEGER.exec(stripped);
  if (hexMatch === null) return { ok: false };
  const [, sign, digits] = hexMatch;
  const magnitude = BigInt(`0x${digits}`);
  return { ok: true, value: sign === '-' ? -magnitude : magnitude };
}

/** Absent → no filter; otherwise every `q` value joined with `,`. Never fails. */
function convertQ(searchParams: URLSearchParams): string | undefined {
  const values = searchParams.getAll('q');
  return values.length === 0 ? undefined : values.join(',');
}

/** None → `[]`; one value → split on `,`, each element trimmed like Java's `String.trim()` (Spring's `StringToCollectionConverter`); two or more → as given. Never fails. */
function convertBrand(searchParams: URLSearchParams): readonly string[] {
  const values = searchParams.getAll('brand');
  if (values.length === 0) return [];
  if (values.length === 1) {
    const [only] = values;
    return only === '' ? [] : only.split(',').map(javaTrim);
  }
  return values;
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

  const unknown = firstUnknownQueryParam(searchParams, KNOWN_QUERY_PARAMS);
  if (unknown !== undefined) return { rejection: unknown };

  const q = convertQ(searchParams);
  const brands = convertBrand(searchParams);

  const status = convertEnum(searchParams.get('status'), DEFAULT_STATUS, STATUS_VALUES);
  if (!status.ok) return { rejection: wrongType('status', 'AdminProductStatusFilter') };

  const featured = convertBoolean(searchParams.get('featured'));
  if (!featured.ok) return { rejection: wrongType('featured', 'Boolean') };

  const outOfStock = convertBoolean(searchParams.get('outOfStock'));
  if (!outOfStock.ok) return { rejection: wrongType('outOfStock', 'Boolean') };

  const sort = convertEnum(searchParams.get('sort'), DEFAULT_SORT, SORT_VALUES);
  if (!sort.ok) return { rejection: wrongType('sort', 'AdminProductSortField') };

  const direction = convertEnum(searchParams.get('direction'), DEFAULT_DIRECTION, DIRECTION_VALUES);
  if (!direction.ok) return { rejection: wrongType('direction', 'SortDirection') };

  const page = convertInteger(searchParams.get('page'), DEFAULT_PAGE);
  if (!page.ok) return { rejection: wrongType('page', 'Integer') };

  const pageSize = convertInteger(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE);
  if (!pageSize.ok) return { rejection: wrongType('pageSize', 'Integer') };

  if (q !== undefined && q.length > 100) return { rejection: notAcceptable('q', 'SIZE') };
  if (page.value < DEFAULT_PAGE) return { rejection: notAcceptable('page', 'MIN') };
  if (pageSize.value < 1) return { rejection: notAcceptable('pageSize', 'MIN') };
  if (pageSize.value > MAX_PAGE_SIZE) return { rejection: notAcceptable('pageSize', 'MAX') };

  return {
    query: {
      status: status.value,
      sort: sort.value,
      direction: direction.value,
      page: page.value,
      pageSize: pageSize.value,
      q,
      brands,
      featured: featured.value,
      outOfStock: outOfStock.value,
    },
  };
}

/** The path `productId`: a `Long`-shaped value, `MIN` 1, looked up as a `Number`. */
function parseProductId(raw: string): { rejection: HttpResponse<Problem> } | { productId: number } {
  const converted = convertLong(raw);
  if (!converted.ok || converted.value < INT64_MIN || converted.value > INT64_MAX) {
    return { rejection: wrongType('productId', 'Long') };
  }
  if (converted.value < 1n) return { rejection: notAcceptable('productId', 'MIN') };
  return { productId: Number(converted.value) };
}

function normalise(value: string): string {
  return value.normalize('NFC').toLowerCase();
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
  const trimmed = javaTrim(q);
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

export function productsReadHandlers(db: MockDb): HttpHandler[] {
  return [
    http.get(PRODUCTS_PATH, ({ request }) => {
      const session = sessionRejection(db);
      if (session !== undefined) return session;
      if (db.scenario === 'list-error') return serviceUnavailable();
      const parsed = parseListQuery(request);
      if ('rejection' in parsed) return parsed.rejection;
      const filtered = filterAndSort(db, parsed.query);
      const body = pageFor(filtered, parsed.query.page, parsed.query.pageSize);
      return HttpResponse.json(body);
    }),
    http.get(PRODUCT_DETAIL_PATH, ({ request, params }) => {
      const session = sessionRejection(db);
      if (session !== undefined) return session;
      const searchParams = new URL(request.url).searchParams;
      const unknown = firstUnknownQueryParam(searchParams, NO_QUERY_PARAMS);
      if (unknown !== undefined) return unknown;
      const raw = params['productId'];
      const parsed =
        typeof raw === 'string'
          ? parseProductId(raw)
          : { rejection: wrongType('productId', 'Long') };
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
    http.get(BRANDS_PATH, ({ request }) => {
      const session = sessionRejection(db);
      if (session !== undefined) return session;
      const searchParams = new URL(request.url).searchParams;
      const unknown = firstUnknownQueryParam(searchParams, NO_QUERY_PARAMS);
      if (unknown !== undefined) return unknown;
      return HttpResponse.json(distinctBrands(db));
    }),
  ];
}
