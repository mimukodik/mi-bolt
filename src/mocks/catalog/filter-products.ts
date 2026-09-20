/**
 * T06 — pure filter, sort and pagination predicates for the catalog mock.
 *
 * Filter semantics (documented in docs/api/openapi.yaml):
 *
 *   - Within one facet the rule is OR. `brand=A&brand=B` matches either;
 *     `storageGb=128&storageGb=256` matches either.
 *   - Across facets the rule is AND. Price, storage, inStock, is5g and
 *     featured all must hold for a single product.
 *   - price / storageGb / inStock are evaluated against the SAME variant.
 *     A product passes only if at least one variant simultaneously
 *     satisfies the storage filter, the price range and the stock rule.
 *     The cheapest such variant becomes the product's matching variant.
 *   - When two products share the same matching-variant price, the
 *     product id (then the variant id) is the last stable key so the
 *     order is fully deterministic.
 *
 * The module exports only pure functions; no I/O, no `globalThis`, no
 * mocks-runtime coupling. The handlers wrap them and translate results
 * into MSW responses.
 */

import type { Product, Variant } from '../repository';

/** Sort modes published by the OpenAPI `sort` query parameter. */
export type SortMode = 'recommended' | 'price_asc' | 'price_desc' | 'name_asc';

/** Filter shape produced by `parseCatalogFilter`. */
export interface CatalogFilter {
  q?: string;
  brands?: readonly string[];
  storageGb?: readonly number[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  is5g?: boolean;
  featured?: boolean;
  sort?: SortMode;
  page: number;
  pageSize: 12 | 24;
}

/** A single product paired with the variant that satisfied its filter. */
export interface ProductMatch {
  product: Product;
  matchingVariant: Variant;
}

/** A page of matches sliced from the sorted match list. */
export interface PaginatedMatches {
  items: readonly ProductMatch[];
  total: number;
  page: number;
  pageSize: 12 | 24;
}

/** Default page size when the client omits `pageSize`. */
export const DEFAULT_PAGE_SIZE: 12 | 24 = 12;

/** Page sizes the API accepts. Any other value is a 400. */
export const ALLOWED_PAGE_SIZES: readonly (12 | 24)[] = [12, 24];

/** Storage sizes the API accepts as filter values. */
export const ALLOWED_STORAGE_GB: readonly number[] = [128, 256, 512];

/** Storage sizes the API can advertise in facet counts. */
export const FACET_STORAGE_GB: readonly number[] = [128, 256, 512];

/** All valid sort mode values, used by the parser for validation. */
export const SORT_MODES: readonly SortMode[] = [
  'recommended',
  'price_asc',
  'price_desc',
  'name_asc',
];

/** True when `value` is one of the published sort modes; a guard so the parser can narrow without a cast. */
export function isSortMode(value: unknown): value is SortMode {
  return typeof value === 'string' && SORT_MODES.some((mode) => mode === value);
}

/** Trim, NFC-normalise and lowercase a free-form string. */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFC');
}

/** Trim/lowercase a brand string; drops empty entries. */
export function normalizeBrand(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFC');
}

/** Normalise an array of brand filter values; drops empty entries. */
export function normalizeBrands(raw: readonly string[]): readonly string[] {
  const result: string[] = [];
  for (const b of raw) {
    const norm = normalizeBrand(b);
    if (norm.length > 0) result.push(norm);
  }
  return result;
}

/**
 * Returns the cheapest variant of `product` that satisfies every
 * across-facet condition (storageGb, minPrice/maxPrice, inStock).
 * Variant-id ascending breaks ties. Returns null when no variant
 * satisfies all conditions simultaneously.
 */
export function findMatchingVariant(product: Product, filter: CatalogFilter): Variant | null {
  let best: Variant | null = null;
  for (const variant of product.variants) {
    if (filter.storageGb !== undefined && filter.storageGb.length > 0) {
      if (!filter.storageGb.includes(variant.storageGb)) continue;
    }
    if (filter.minPrice !== undefined && variant.price.amount < filter.minPrice) continue;
    if (filter.maxPrice !== undefined && variant.price.amount > filter.maxPrice) continue;
    if (filter.inStock === true) {
      if (variant.availability !== 'in_stock' || variant.maxQuantity < 1) continue;
    }
    if (
      best === null ||
      variant.price.amount < best.price.amount ||
      (variant.price.amount === best.price.amount && variant.id < best.id)
    ) {
      best = variant;
    }
  }
  return best;
}

/**
 * Single-product filter. Returns the match (product + cheapest matching
 * variant) when every facet passes, null otherwise.
 *
 * `featured` is resolved against `featuredSlugs` because the catalog
 * itself does not carry a `featured` flag — the list lives in the
 * DemoConfig and the handler passes it in.
 */
export function matchProduct(
  product: Product,
  filter: CatalogFilter,
  featuredSlugs: ReadonlySet<string>,
): ProductMatch | null {
  if (filter.q !== undefined) {
    const q = normalizeQuery(filter.q);
    if (q.length > 0) {
      const brand = normalizeQuery(product.brand);
      const name = normalizeQuery(product.name);
      if (!brand.includes(q) && !name.includes(q)) return null;
    }
  }
  if (filter.brands !== undefined && filter.brands.length > 0) {
    const wanted = normalizeBrands(filter.brands);
    if (wanted.length > 0) {
      const productBrand = normalizeQuery(product.brand);
      if (!wanted.includes(productBrand)) return null;
    }
  }
  if (filter.is5g !== undefined && product.is5g !== filter.is5g) return null;
  if (filter.featured !== undefined) {
    const isFeatured = featuredSlugs.has(product.slug);
    if (filter.featured !== isFeatured) return null;
  }

  const matchingVariant = findMatchingVariant(product, filter);
  if (matchingVariant === null) return null;
  return { product, matchingVariant };
}

/**
 * Sort the matches in place. The returned reference equals the input
 * reference after sorting; both the caller and the helper get a sorted
 * list back. `recommended` is the documented default and uses the same
 * tie-break as `price_asc` (cheapest matching variant, product id, then
 * variant id) so the catalogue page is deterministic out of the box.
 */
export function sortMatches(matches: readonly ProductMatch[], mode: SortMode): ProductMatch[] {
  const copy = matches.slice();
  const byProductId = (a: ProductMatch, b: ProductMatch): number =>
    a.product.id.localeCompare(b.product.id);
  switch (mode) {
    case 'price_asc':
      return copy.sort((a, b) => {
        const priceDiff = a.matchingVariant.price.amount - b.matchingVariant.price.amount;
        if (priceDiff !== 0) return priceDiff;
        return byProductId(a, b);
      });
    case 'price_desc':
      return copy.sort((a, b) => {
        const priceDiff = b.matchingVariant.price.amount - a.matchingVariant.price.amount;
        if (priceDiff !== 0) return priceDiff;
        return byProductId(a, b);
      });
    case 'name_asc':
      return copy.sort((a, b) => {
        const nameDiff = a.product.name.localeCompare(b.product.name);
        if (nameDiff !== 0) return nameDiff;
        return byProductId(a, b);
      });
    case 'recommended':
    default:
      return copy.sort((a, b) => {
        const priceDiff = a.matchingVariant.price.amount - b.matchingVariant.price.amount;
        if (priceDiff !== 0) return priceDiff;
        return byProductId(a, b);
      });
  }
}

/**
 * Run the filter, sort and paginate over `products`. Pure: returns a
 * new array and a paginated summary. Pagination uses 1-based page
 * numbers; the caller validates the page range separately so an
 * out-of-range page can be turned into a 404 response.
 */
export function filterProducts(
  products: readonly Product[],
  filter: CatalogFilter,
  featuredSlugs: readonly string[],
): readonly ProductMatch[] {
  const featuredSet = new Set(featuredSlugs);
  const matches: ProductMatch[] = [];
  for (const product of products) {
    const result = matchProduct(product, filter, featuredSet);
    if (result !== null) matches.push(result);
  }
  return sortMatches(matches, filter.sort ?? 'recommended');
}

/**
 * Slice a sorted match list into one page. The handler treats an
 * empty result on a valid page as 200-with-empty-items and a page
 * beyond the total as 404; this helper just returns the slice.
 */
export function paginateMatches(
  matches: readonly ProductMatch[],
  page: number,
  pageSize: 12 | 24,
): PaginatedMatches {
  const total = matches.length;
  const startIndex = (page - 1) * pageSize;
  const items = matches.slice(startIndex, startIndex + pageSize);
  return { items, total, page, pageSize };
}

// ---------------------------------------------------------------------------
// Query parameter parsing + validation
// ---------------------------------------------------------------------------

/** Discriminated union of every parse-time failure. */
export type FilterParseError =
  | { code: 'INVALID_BRAND'; field: 'brand'; detail: string }
  | { code: 'INVALID_STORAGE'; field: 'storageGb'; detail: string }
  | { code: 'INVALID_PRICE'; field: 'minPrice' | 'maxPrice'; detail: string }
  | { code: 'INVALID_BOOLEAN'; field: 'inStock' | 'is5g' | 'featured'; detail: string }
  | { code: 'INVALID_SORT'; field: 'sort'; detail: string }
  | { code: 'INVALID_PAGE'; field: 'page'; detail: string }
  | { code: 'INVALID_PAGE_SIZE'; field: 'pageSize'; detail: string };

/** Result of parsing the `listProducts` query string. */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: FilterParseError };

function parseBooleanParam(raw: string): boolean | 'invalid' {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return 'invalid';
}

function parseIntegerParam(raw: string): number | 'invalid' {
  if (raw.length === 0) return 'invalid';
  if (!/^-?\d+$/.test(raw)) return 'invalid';
  return Number(raw);
}

/**
 * Parses the `listProducts` query string into a typed filter. Empty
 * values (`brand[]=  `) and out-of-enum values (`storageGb=999`,
 * `page=abc`, `pageSize=13`, `sort=newest`) become a 400-friendly
 * `FilterParseError`; the handler turns the error into a Problem JSON.
 */
export function parseCatalogFilter(params: URLSearchParams): ParseResult<CatalogFilter> {
  const filter: CatalogFilter = {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  };

  const q = params.get('q');
  if (q !== null) filter.q = q;

  const brands = params.getAll('brand');
  if (brands.length > 0) {
    for (const b of brands) {
      if (b.trim().length === 0) {
        return {
          ok: false,
          error: {
            code: 'INVALID_BRAND',
            field: 'brand',
            detail: 'A megadott márkaérték üres.',
          },
        };
      }
    }
    filter.brands = brands;
  }

  const storageRaw = params.getAll('storageGb');
  if (storageRaw.length > 0) {
    const storageGb: number[] = [];
    for (const raw of storageRaw) {
      const parsed = parseIntegerParam(raw);
      if (parsed === 'invalid' || !ALLOWED_STORAGE_GB.includes(parsed)) {
        return {
          ok: false,
          error: {
            code: 'INVALID_STORAGE',
            field: 'storageGb',
            detail: `Ismeretlen tárhelyméret: ${raw}.`,
          },
        };
      }
      storageGb.push(parsed);
    }
    filter.storageGb = storageGb;
  }

  const minPriceRaw = params.get('minPrice');
  if (minPriceRaw !== null) {
    const parsed = parseIntegerParam(minPriceRaw);
    if (parsed === 'invalid' || parsed < 0) {
      return {
        ok: false,
        error: {
          code: 'INVALID_PRICE',
          field: 'minPrice',
          detail: 'A minimum ár érvénytelen egész szám.',
        },
      };
    }
    filter.minPrice = parsed;
  }
  const maxPriceRaw = params.get('maxPrice');
  if (maxPriceRaw !== null) {
    const parsed = parseIntegerParam(maxPriceRaw);
    if (parsed === 'invalid' || parsed < 0) {
      return {
        ok: false,
        error: {
          code: 'INVALID_PRICE',
          field: 'maxPrice',
          detail: 'A maximum ár érvénytelen egész szám.',
        },
      };
    }
    filter.maxPrice = parsed;
  }
  if (
    filter.minPrice !== undefined &&
    filter.maxPrice !== undefined &&
    filter.minPrice > filter.maxPrice
  ) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PRICE',
        field: 'minPrice',
        detail: 'A minimum ár nem lehet nagyobb a maximum árnál.',
      },
    };
  }

  const inStockRaw = params.get('inStock');
  if (inStockRaw !== null) {
    const parsed = parseBooleanParam(inStockRaw);
    if (parsed === 'invalid') {
      return {
        ok: false,
        error: {
          code: 'INVALID_BOOLEAN',
          field: 'inStock',
          detail: 'Az inStock értéke csak true vagy false lehet.',
        },
      };
    }
    filter.inStock = parsed;
  }

  const is5gRaw = params.get('is5g');
  if (is5gRaw !== null) {
    const parsed = parseBooleanParam(is5gRaw);
    if (parsed === 'invalid') {
      return {
        ok: false,
        error: {
          code: 'INVALID_BOOLEAN',
          field: 'is5g',
          detail: 'Az is5g értéke csak true vagy false lehet.',
        },
      };
    }
    filter.is5g = parsed;
  }

  const featuredRaw = params.get('featured');
  if (featuredRaw !== null) {
    const parsed = parseBooleanParam(featuredRaw);
    if (parsed === 'invalid') {
      return {
        ok: false,
        error: {
          code: 'INVALID_BOOLEAN',
          field: 'featured',
          detail: 'A featured értéke csak true vagy false lehet.',
        },
      };
    }
    filter.featured = parsed;
  }

  const sortRaw = params.get('sort');
  if (sortRaw !== null) {
    if (!isSortMode(sortRaw)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_SORT',
          field: 'sort',
          detail: `Ismeretlen rendezési mód: ${sortRaw}.`,
        },
      };
    }
    filter.sort = sortRaw;
  }

  const pageRaw = params.get('page');
  if (pageRaw !== null) {
    const parsed = parseIntegerParam(pageRaw);
    if (parsed === 'invalid' || parsed < 1) {
      return {
        ok: false,
        error: {
          code: 'INVALID_PAGE',
          field: 'page',
          detail: 'Az oldalszám pozitív egész szám kell legyen.',
        },
      };
    }
    filter.page = parsed;
  }

  const pageSizeRaw = params.get('pageSize');
  if (pageSizeRaw !== null) {
    const parsed = parseIntegerParam(pageSizeRaw);
    if (parsed === 'invalid' || (parsed !== 12 && parsed !== 24)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_PAGE_SIZE',
          field: 'pageSize',
          detail: 'Az oldalméret csak 12 vagy 24 lehet.',
        },
      };
    }
    filter.pageSize = parsed;
  }

  return { ok: true, value: filter };
}
