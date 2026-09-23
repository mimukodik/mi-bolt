/**
 * MIM-350, unit F15 — router query codec for the Termékek list.
 *
 * The page reads every filter, sort, direction and chip from the router
 * query string (`docs/spec/architecture.md:67` in the frontend repo);
 * the page never holds its own copy of that state. The shape below
 * is the canonical typed view: a `q`, a brand allow-list, the three
 * status booleans and a sort/direction pair, all with the contract's
 * own defaults so an empty URL serialises to `{}` and parses back to
 * the documented defaults.
 *
 * The codec is intentionally permissive on input: an unknown status
 * or sort falls back to the documented default rather than throwing,
 * so a stale deep link never breaks the page. Junk brand values are
 * trimmed, blank ones dropped and duplicates collapsed before the
 * sorted output. `featured` and `outOfStock` are absent-by-default
 * filters: an absent chip means "no filter", so the wire call never
 * carries the literal `false`.
 */
import { convertToParamMap, type ParamMap, type Params } from '@angular/router';

import type { ListAdminProducts$Params } from '../../../api/generated/fn/admin-products/list-admin-products';
import type { AdminProductSortField } from '../../../api/generated/models/admin-product-sort-field';
import type { AdminProductStatusFilter } from '../../../api/generated/models/admin-product-status-filter';
import type { SortDirection } from '../../../api/generated/models/sort-direction';

/** Router-query shape for the Termékek list. Every field is readonly
 *  and the codec is the single mutator. */
export interface ProductListQuery {
  readonly q: string;
  readonly brands: readonly string[];
  readonly status: AdminProductStatusFilter;
  readonly featured: boolean;
  readonly outOfStock: boolean;
  readonly sort: AdminProductSortField;
  readonly direction: SortDirection;
}

/** Documented defaults: matches the contract's defaults for
 *  `listAdminProducts` so the empty URL produces an empty `Params`
 *  round-trip. The Termékek title counts active products by default. */
export const DEFAULT_PRODUCT_LIST_QUERY: ProductListQuery = {
  q: '',
  brands: [],
  status: 'active',
  featured: false,
  outOfStock: false,
  sort: 'rank',
  direction: 'asc',
};

/** `pageSize` default per the contract (plan X3). */
export const PRODUCT_LIST_PAGE_SIZE = 50 as const;

const STATUS_VALUES: readonly AdminProductStatusFilter[] = ['active', 'archived', 'all'];
const SORT_VALUES: readonly AdminProductSortField[] = [
  'rank',
  'name',
  'brand',
  'releasedAt',
  'minPrice',
  'totalStock',
  'featured',
];
const DIRECTION_VALUES: readonly SortDirection[] = ['asc', 'desc'];

/** Guard rather than cast: a parsed status is `unknown` until it
 *  proves membership in the literal-union source. */
function isStatusFilter(value: unknown): value is AdminProductStatusFilter {
  return STATUS_VALUES.some((v) => v === value);
}

/** Guard rather than cast: a parsed sort is `unknown` until it
 *  proves membership in the literal-union source. */
function isSortField(value: unknown): value is AdminProductSortField {
  return SORT_VALUES.some((v) => v === value);
}

/** Guard rather than cast: a parsed direction is `unknown` until it
 *  proves membership in the literal-union source. */
function isSortDirection(value: unknown): value is SortDirection {
  return DIRECTION_VALUES.some((v) => v === value);
}

/** Drop empty / whitespace-only entries and de-duplicate, preserving
 *  first-seen order. */
function cleanBrands(raw: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** `true` only for the exact string `true`; everything else (including
 *  `'1'`, `'yes'`, `'on'`) falls back to the absent filter, matching
 *  the chip's on/off semantics. */
function parseFlag(raw: string | null): boolean {
  return raw !== null && raw.trim() === 'true';
}

/**
 * Build a `ProductListQuery` from a router `ParamMap`. Empty,
 * default and unknown values collapse to the documented defaults;
 * malformed booleans collapse to `false` (no filter); junk brand
 * values are cleaned. The codec is the single mutator; the result
 * is treated as immutable by every consumer.
 */
export function parseProductListQuery(params: ParamMap): ProductListQuery {
  const rawQ = params.get('q');
  const q = rawQ === null ? '' : rawQ.trim();

  const brands = cleanBrands(params.getAll('brand'));

  const rawStatus = params.get('status');
  let status: AdminProductStatusFilter = DEFAULT_PRODUCT_LIST_QUERY.status;
  if (rawStatus !== null) {
    const trimmed = rawStatus.trim();
    if (isStatusFilter(trimmed)) status = trimmed;
  }

  const featured = parseFlag(params.get('featured'));
  const outOfStock = parseFlag(params.get('outOfStock'));

  const rawSort = params.get('sort');
  let sort: AdminProductSortField = DEFAULT_PRODUCT_LIST_QUERY.sort;
  if (rawSort !== null) {
    const trimmed = rawSort.trim();
    if (isSortField(trimmed)) sort = trimmed;
  }

  const rawDirection = params.get('direction');
  let direction: SortDirection = DEFAULT_PRODUCT_LIST_QUERY.direction;
  if (rawDirection !== null) {
    const trimmed = rawDirection.trim();
    if (isSortDirection(trimmed)) direction = trimmed;
  }

  return { q, brands, status, featured, outOfStock, sort, direction };
}

/** Every query-string key this codec owns, in canonical order. */
export const PRODUCT_LIST_QUERY_KEYS = [
  'q',
  'brand',
  'status',
  'featured',
  'outOfStock',
  'sort',
  'direction',
] as const;

/**
 * Serialise a `ProductListQuery` to a router `Params` object. Every
 * member equal to its default is omitted, so the default query
 * serialises to `{}`; brands are sorted alphabetically and emitted
 * as a `string[]`; `featured` and `outOfStock` emit the literal
 * `'true'` only when set. The route's own defaults do the rest.
 */
export function serializeProductListQuery(query: ProductListQuery): Params {
  const out: Params = {};

  if (query.q !== DEFAULT_PRODUCT_LIST_QUERY.q) {
    out['q'] = query.q;
  }

  if (query.brands.length > 0) {
    out['brand'] = [...query.brands].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  if (query.status !== DEFAULT_PRODUCT_LIST_QUERY.status) {
    out['status'] = query.status;
  }

  if (query.featured !== DEFAULT_PRODUCT_LIST_QUERY.featured) {
    out['featured'] = 'true';
  }

  if (query.outOfStock !== DEFAULT_PRODUCT_LIST_QUERY.outOfStock) {
    out['outOfStock'] = 'true';
  }

  if (query.sort !== DEFAULT_PRODUCT_LIST_QUERY.sort) {
    out['sort'] = query.sort;
  }

  if (query.direction !== DEFAULT_PRODUCT_LIST_QUERY.direction) {
    out['direction'] = query.direction;
  }

  return out;
}

/** Translate a `ProductListQuery` plus a 1-based `page` into the
 *  SDK's `ListAdminProducts$Params`. `status`, `sort`, `direction`,
 *  `page` and `pageSize` are always present; `q`, `brand`, `featured`
 *  and `outOfStock` are present only when they actually filter. */
export function toListParams(query: ProductListQuery, page: number): ListAdminProducts$Params {
  const params: ListAdminProducts$Params = {
    status: query.status,
    sort: query.sort,
    direction: query.direction,
    page,
    pageSize: PRODUCT_LIST_PAGE_SIZE,
  };

  if (query.q.length > 0) params.q = query.q;
  if (query.brands.length > 0) params.brand = [...query.brands];
  if (query.featured) params.featured = true;
  if (query.outOfStock) params.outOfStock = true;

  return params;
}

/** Convenience: parse a plain `Params` object (the shape `Router.navigate`
 *  accepts) by routing it through `convertToParamMap`. Useful in tests
 *  and any caller that already holds a `Params` rather than a `ParamMap`. */
export function parseProductListParams(params: Params): ProductListQuery {
  return parseProductListQuery(convertToParamMap(params));
}
