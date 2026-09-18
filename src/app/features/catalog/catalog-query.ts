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

/** Documented sort modes. Mirrors `listProducts.sort` in openapi.yaml. */
export type SortMode = 'recommended' | 'price_asc' | 'price_desc' | 'name_asc';

export const SORT_MODES = [
  'recommended',
  'price_asc',
  'price_desc',
  'name_asc',
] as const satisfies readonly SortMode[];

/** Documented page sizes. Mirrors `listProducts.pageSize`. */
export const ALLOWED_PAGE_SIZES: readonly (12 | 24)[] = [12, 24];

/** Documented storage sizes in GB. Mirrors `listProducts.storageGb`. */
export const ALLOWED_STORAGE_GB: readonly (128 | 256 | 512)[] = [128, 256, 512];

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
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly inStock?: boolean;
  readonly is5g?: boolean;
  readonly featured?: boolean;
  readonly sort?: SortMode;
  readonly page: number;
  readonly pageSize: 12 | 24;
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
    minPrice?: number;
    maxPrice?: number;
    inStock?: boolean;
    is5g?: boolean;
    featured?: boolean;
    sort?: SortMode;
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
      if (!ALLOWED_STORAGE_GB.includes(num as 128 | 256 | 512)) continue;
      const bucket = num as 128 | 256 | 512;
      if (seen.has(bucket)) continue;
      seen.add(bucket);
      parsed.push(bucket);
    }
    if (parsed.length > 0) query.storageGb = parsed;
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
    if ((SORT_MODES as readonly string[]).includes(trimmed)) {
      query.sort = trimmed as SortMode;
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

/**
 * Serialise a `CatalogQuery` to a canonical `URLSearchParams`. Default
 * values (`page=1`, `pageSize=12`, absent `sort`, absent `q`) are
 * omitted so the URL never carries noise. Empty `brands` /
 * `storageGb` arrays are dropped entirely; within each remaining
 * array duplicates collapse to the first-seen entry in input order.
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

  if (query.minPrice !== undefined) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== undefined) params.set('maxPrice', String(query.maxPrice));

  if (query.inStock !== undefined) params.set('inStock', String(query.inStock));
  if (query.is5g !== undefined) params.set('is5g', String(query.is5g));
  if (query.featured !== undefined) params.set('featured', String(query.featured));

  if (query.sort !== undefined) params.set('sort', query.sort);

  if (query.page !== DEFAULT_PAGE) params.set('page', String(query.page));
  if (query.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(query.pageSize));

  return params;
}
