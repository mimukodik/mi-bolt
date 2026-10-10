/**
 * T12 — canonical URL codec for catalog filters.
 *
 * The catalogue page is driven by the URL query string. `parseCatalogQuery`
 * normalises the raw `URLSearchParams` coming from the browser or a deep
 * link into a typed `CatalogQuery` object. `serializeCatalogQuery` does
 * the reverse, producing the canonical query string the page should
 * push back to the router. The codec is deliberately permissive on
 * input (empty / default / unknown values are dropped rather than
 * raising) and idempotent on output (round-tripping a query that was
 * already parsed preserves the visible form, so swapping a query the
 * URL held for the query the codec rebuilt never re-fires a request).
 *
 * The wire contract is owned by the T06 mock (`parseCatalogFilter`),
 * which returns 400 Problem JSON on malformed input. This codec mirrors
 * that contract for the UI: anything the mock would reject becomes
 * the documented default rather than an error, so an unknown sort or
 * a stray storage value never breaks the page.
 */

import type { ProductSort } from '@mi-bolt/api/models/product-sort';
import type { FilterIdentity } from '../../shared/types/filter-identity';

/** Documented sort modes. Re-exported from the generated `ProductSort`
 *  union (the 2.0.0 contract) so the codec, the toolbar and the facade
 *  share a single literal-union source. */
export type Sort = ProductSort;

export const SORT_MODES = [
  'recommended',
  'newest',
  'oldest',
  'popularity',
  'price_asc',
  'price_desc',
  'name_asc',
  'name_desc',
] as const satisfies readonly Sort[];

/** Documented page sizes. Mirrors `listProducts.pageSize`. */
export const ALLOWED_PAGE_SIZES: readonly (12 | 24)[] = [12, 24];

/** Documented storage sizes in GB. Mirrors `listProducts.storageGb`. */
export const ALLOWED_STORAGE_GB: readonly (128 | 256 | 512)[] = [128, 256, 512];

/** Guard rather than cast: a parsed `sort` value is `unknown` until the
 *  literal-union membership is proven against `SORT_MODES`. */
export function isSort(value: unknown): value is Sort {
  return SORT_MODES.some((mode) => mode === value);
}

/** Guard rather than cast: a parsed storage size is a plain `number` until
 *  the literal-union membership is proven against `ALLOWED_STORAGE_GB`. */
export function isStorageBucket(value: number): value is 128 | 256 | 512 {
  return ALLOWED_STORAGE_GB.some((gb) => gb === value);
}

/** Default page size used when the URL omits `pageSize`. */
export const DEFAULT_PAGE_SIZE: 12 | 24 = 12;

/** Default page number used when the URL omits `page`. */
export const DEFAULT_PAGE = 1 as const;

/** Search-input debounce applied before a query fires, in milliseconds. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Canonical typed catalogue query. Every field is optional except
 * `page` and `pageSize`, which always carry the resolved default.
 * Fields that are absent from the URL are simply absent here, so a
 * missing `q` is distinguishable from an empty `q`.
 */
export interface CatalogQuery {
  readonly q?: string;
  readonly brands?: readonly string[];
  readonly storageGb?: readonly (128 | 256 | 512)[];
  readonly colors?: readonly string[];
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly inStock?: boolean;
  readonly is5g?: boolean;
  readonly featured?: boolean;
  readonly activePromotion?: boolean;
  readonly sort?: Sort;
  readonly page: number;
  readonly pageSize: 12 | 24;
}

/**
 * `docs/spec/components.md:7`'s `CatalogFilters` — the subset of
 * `CatalogQuery` that is a filter rather than sort/pagination/search
 * state. `FilterIdentity` (`src/app/shared/types/filter-identity.ts`)
 * is keyed by `keyof CatalogFilters`, so this type exists to give that
 * `keyof` expression something to resolve against.
 */
export interface CatalogFilters {
  readonly brands: readonly string[];
  readonly storageGb: readonly (128 | 256 | 512)[];
  readonly colors: readonly string[];
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly inStock: boolean;
  readonly is5g: boolean;
  readonly activePromotion?: boolean;
}

/** A `CatalogQuery` with no filters applied — the documented defaults. */
export const DEFAULT_CATALOG_QUERY: CatalogQuery = {
  page: DEFAULT_PAGE,
  pageSize: DEFAULT_PAGE_SIZE,
};

/** Drop empty / whitespace-only entries while preserving first-seen order. */
function dedupePreserveOrder(items: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** Parse a decimal integer literal; returns null for empty / non-numeric. */
function parseInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Parse a strict `true` / `false` literal; returns null otherwise. */
function parseBoolean(raw: string): boolean | null {
  const trimmed = raw.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return null;
}

/**
 * Build a `CatalogQuery` from the raw URL query string. Empty, default
 * and unknown values collapse to the documented defaults; malformed
 * values (e.g. `page=abc`, `sort=newest`, `storageGb=999`) do not raise
 * — they are dropped, which matches T06's wire parser surfacing the
 * underlying 400 but lets the UI degrade safely on direct links.
 */
export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  // Build into a mutable accumulator, then return as the readonly
  // shape. `CatalogQuery` is intentionally `readonly` so consumers
  // treat it as immutable; the codec is the single mutator.
  const query: {
    q?: string;
    brands?: readonly string[];
    storageGb?: readonly (128 | 256 | 512)[];
    colors?: readonly string[];
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    is5g?: boolean;
    featured?: boolean;
    activePromotion?: boolean;
    sort?: Sort;
    page: number;
    pageSize: 12 | 24;
  } = { ...DEFAULT_CATALOG_QUERY };

  const q = params.get('q');
  if (q !== null) {
    const trimmed = q.trim();
    if (trimmed.length > 0) query.q = trimmed;
  }

  const brandsRaw = params.getAll('brand');
  if (brandsRaw.length > 0) {
    const deduped = dedupePreserveOrder(brandsRaw);
    if (deduped.length > 0) query.brands = deduped;
  }

  const storageRaw = params.getAll('storageGb');
  if (storageRaw.length > 0) {
    const seen = new Set<128 | 256 | 512>();
    const parsed: (128 | 256 | 512)[] = [];
    for (const raw of storageRaw) {
      const num = parseInteger(raw);
      if (num === null) continue;
      if (!isStorageBucket(num)) continue;
      if (seen.has(num)) continue;
      seen.add(num);
      parsed.push(num);
    }
    if (parsed.length > 0) query.storageGb = parsed;
  }

  const colorsRaw = params.getAll('color');
  if (colorsRaw.length > 0) {
    const deduped = dedupePreserveOrder(colorsRaw);
    if (deduped.length > 0) query.colors = deduped;
  }

  const minPriceRaw = params.get('minPrice');
  if (minPriceRaw !== null) {
    const num = parseInteger(minPriceRaw);
    if (num !== null && num >= 0) query.minPrice = num;
  }
  const maxPriceRaw = params.get('maxPrice');
  if (maxPriceRaw !== null) {
    const num = parseInteger(maxPriceRaw);
    if (num !== null && num >= 0) query.maxPrice = num;
  }

  const promotionRaw = params.get('activePromotion');
  if (promotionRaw !== null) {
    const parsed = parseBoolean(promotionRaw);
    if (parsed !== null) query.activePromotion = parsed;
  }

  const inStockRaw = params.get('inStock');
  if (inStockRaw !== null) {
    const parsed = parseBoolean(inStockRaw);
    if (parsed !== null) query.inStock = parsed;
  }

  const is5gRaw = params.get('is5g');
  if (is5gRaw !== null) {
    const parsed = parseBoolean(is5gRaw);
    if (parsed !== null) query.is5g = parsed;
  }

  const featuredRaw = params.get('featured');
  if (featuredRaw !== null) {
    const parsed = parseBoolean(featuredRaw);
    if (parsed !== null) query.featured = parsed;
  }

  const sortRaw = params.get('sort');
  if (sortRaw !== null) {
    const trimmed = sortRaw.trim();
    if (isSort(trimmed)) {
      query.sort = trimmed;
    }
  }

  const pageRaw = params.get('page');
  if (pageRaw !== null) {
    const num = parseInteger(pageRaw);
    if (num !== null && num >= 1) query.page = num;
  }

  const pageSizeRaw = params.get('pageSize');
  if (pageSizeRaw !== null) {
    const num = parseInteger(pageSizeRaw);
    if (num === 12 || num === 24) query.pageSize = num;
  }

  return query;
}

/** Every query-string key this codec owns, in canonical order. */
export const CATALOG_QUERY_KEYS = [
  'q',
  'brand',
  'storageGb',
  'color',
  'minPrice',
  'maxPrice',
  'inStock',
  'is5g',
  'featured',
  'activePromotion',
  'sort',
  'page',
  'pageSize',
] as const;

/**
 * Serialise a `CatalogQuery` to a canonical `URLSearchParams`. Default
 * values (`page=1`, `pageSize=12`, absent `sort`, absent `q`) are
 * omitted so the URL never carries noise. Empty `brands` /
 * `storageGb` / `colors` arrays are dropped entirely; within each
 * remaining array duplicates collapse to the first-seen entry in
 * input order.
 */
export function serializeCatalogQuery(query: CatalogQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (query.q !== undefined && query.q.trim().length > 0) {
    params.set('q', query.q.trim());
  }

  if (query.brands !== undefined && query.brands.length > 0) {
    const deduped = dedupePreserveOrder(query.brands);
    for (const brand of deduped) params.append('brand', brand);
  }

  if (query.storageGb !== undefined && query.storageGb.length > 0) {
    const seen = new Set<128 | 256 | 512>();
    const ordered: (128 | 256 | 512)[] = [];
    for (const bucket of query.storageGb) {
      if (seen.has(bucket)) continue;
      seen.add(bucket);
      ordered.push(bucket);
    }
    for (const bucket of ordered) params.append('storageGb', String(bucket));
  }

  if (query.colors !== undefined && query.colors.length > 0) {
    const deduped = dedupePreserveOrder(query.colors);
    for (const code of deduped) params.append('color', code);
  }

  if (query.minPrice !== undefined) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== undefined) params.set('maxPrice', String(query.maxPrice));

  if (query.inStock !== undefined) params.set('inStock', String(query.inStock));
  if (query.is5g !== undefined) params.set('is5g', String(query.is5g));
  if (query.featured !== undefined) params.set('featured', String(query.featured));
  if (query.activePromotion !== undefined)
    params.set('activePromotion', String(query.activePromotion));

  if (query.sort !== undefined) params.set('sort', query.sort);

  if (query.page !== DEFAULT_PAGE) params.set('page', String(query.page));
  if (query.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(query.pageSize));

  return params;
}

/** One removable chip in `AppliedFilters`' chip row. `name` is a
 *  `FilterIdentity['name']` value, so a chip can be re-emitted verbatim
 *  as the `filterRemoved` output's payload. */
export interface AppliedChip {
  readonly id: string;
  readonly name: FilterIdentity['name'];
  readonly label: string;
  readonly value?: string | number;
}

/**
 * Derive the removable chip row from a `CatalogQuery`. Moved here from
 * `CatalogPage` by `FIX-60`, the same move and the same reason `FIX-24`
 * gives for the symbol it relocates: a query-derived helper belongs in
 * the codec's own module, and a module-private symbol cannot be
 * imported by a test.
 *
 * `CatalogPage` wraps this with a `vm().facets`-aware override that
 * swaps the code label for the facet's human label when the chip is a
 * colour; the codec itself stays colour-name-agnostic because the
 * query carries only the code.
 */
export function buildChips(q: CatalogQuery): readonly AppliedChip[] {
  const chips: AppliedChip[] = [];
  if (q.q !== undefined && q.q.length > 0) {
    chips.push({ id: 'q', name: 'q', label: `Keresés: „${q.q}”` });
  }
  for (const brand of q.brands ?? []) {
    chips.push({ id: `brand:${brand}`, name: 'brands', label: brand, value: brand });
  }
  for (const bucket of q.storageGb ?? []) {
    chips.push({
      id: `storage:${String(bucket)}`,
      name: 'storageGb',
      label: `${String(bucket)} GB`,
      value: bucket,
    });
  }
  for (const code of q.colors ?? []) {
    chips.push({ id: `color:${code}`, name: 'colors', label: code, value: code });
  }
  if (q.minPrice !== undefined) {
    chips.push({
      id: 'minPrice',
      name: 'minPrice',
      label: `Min. ár: ${q.minPrice.toLocaleString('hu-HU')} Ft`,
      value: q.minPrice,
    });
  }
  if (q.maxPrice !== undefined) {
    chips.push({
      id: 'maxPrice',
      name: 'maxPrice',
      label: `Max. ár: ${q.maxPrice.toLocaleString('hu-HU')} Ft`,
      value: q.maxPrice,
    });
  }
  if (q.inStock === true) {
    chips.push({ id: 'inStock', name: 'inStock', label: 'Csak raktáron' });
  }
  if (q.is5g === true) {
    chips.push({ id: 'is5g', name: 'is5g', label: 'Csak 5G' });
  }
  if (q.featured === true) {
    chips.push({ id: 'featured', name: 'featured', label: 'Kiemelt termékek' });
  }
  if (q.activePromotion === true) {
    chips.push({
      id: 'activePromotion',
      name: 'activePromotion',
      label: 'Aktív halloweeni ajánlatok',
    });
  }
  return chips;
}
