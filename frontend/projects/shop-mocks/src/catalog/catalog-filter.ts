/**
 * MIM-210 — query parsing, filtering, sorting and paging for the
 * catalogue mock.
 *
 * The filter module is pure: it takes a query-string parameter map
 * (already pre-validated against the contract's parameter names by the
 * handler) plus the store's `CatalogEntry[]` and a sort key, and
 * returns the entries that pass every filter, sorted in the chosen
 * order. Paging is a slice on the sorted list.
 *
 * The handlers wrap these primitives and translate results into MSW
 * responses (the 400 list lives in `catalog.handlers.ts`).
 */

import type { CatalogItem, ProductSort, StorageGb, Variant } from '@mi-bolt/api/models';
import { ALLOWED_STORAGES, PRODUCT_SORTS, type CatalogEntry, toCatalogItem } from './catalog-store';
import { isProductSort, isStorageGb } from './catalog-store';

/** Names of every contract-published query parameter on `GET /products`. */
const CONTRACT_PARAMETERS = [
  'q',
  'brand',
  'storageGb',
  'color',
  'minPrice',
  'maxPrice',
  'inStock',
  'is5g',
  'featured',
  'promotion',
  'sort',
  'page',
  'pageSize',
] as const;

/** Result of parsing the request's `URLSearchParams`. */
export type ParseListProductsResult =
  { ok: true; filter: CatalogFilter } | { ok: false; error: FilterError };

/** Discriminated union of every parse-time failure. */
export type FilterError =
  | { kind: 'unknown-parameter'; parameter: string }
  | { kind: 'invalid-storage'; parameter: string }
  | { kind: 'invalid-value'; parameter: string; detail: string };

/** Filter shape the handler passes to the pure predicates. */
export interface CatalogFilter {
  q?: string;
  brands: readonly string[];
  storageGb: readonly StorageGb[];
  colors: readonly string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  is5g?: boolean;
  featured?: boolean;
  promotion?: boolean;
  sort: ProductSort;
  page: number;
  pageSize: 12 | 24;
}

function invalidStorage(parameter: string): FilterError {
  return { kind: 'invalid-storage', parameter };
}
function invalidValue(parameter: string, detail: string): FilterError {
  return { kind: 'invalid-value', parameter, detail };
}

/** Parse an integer parameter that must be `>= min`. */
function parseBoundedInt(
  raw: string,
  parameter: string,
  min: number,
  minLabel: string,
): number | FilterError {
  if (raw.length === 0 || !/^-?\d+$/.test(raw)) {
    return invalidValue(parameter, `${parameter} is invalid`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return invalidValue(parameter, `${parameter} is invalid`);
  }
  if (n < min) {
    return invalidValue(parameter, `${parameter} ${minLabel}`);
  }
  return n;
}

/**
 * Parse a query-string parameter map. The contract's known parameter
 * names go first; an unknown name is rejected before any value-level
 * check. The handler turns each `FilterError` into a `Problem`.
 */
export function parseListProductsParams(params: URLSearchParams): ParseListProductsResult {
  const filter: CatalogFilter = {
    brands: [],
    storageGb: [],
    colors: [],
    sort: 'recommended',
    page: 1,
    pageSize: 12,
  };

  for (const key of params.keys()) {
    if (!CONTRACT_PARAMETERS.some((k) => k === key)) {
      return {
        ok: false,
        error: {
          kind: 'invalid-value',
          parameter: key,
          detail: `Unknown query parameter "${key}"`,
        },
      };
    }
  }

  const q = params.get('q');
  if (q !== null) {
    if (q.length > 100) {
      return { ok: false, error: invalidValue('q', 'q is too long') };
    }
    filter.q = q;
  }

  const brands = params.getAll('brand');
  if (brands.length > 0) {
    for (const b of brands) {
      if (b.trim().length === 0) {
        return { ok: false, error: invalidValue('brand', 'brand must not be empty') };
      }
    }
    filter.brands = brands;
  }

  const storages = params.getAll('storageGb');
  if (storages.length > 0) {
    const out: StorageGb[] = [];
    for (const raw of storages) {
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n) || !isStorageGb(n)) {
        return { ok: false, error: invalidStorage('storageGb') };
      }
      out.push(n);
    }
    filter.storageGb = out;
  }

  const colors = params.getAll('color');
  if (colors.length > 0) {
    for (const c of colors) {
      if (c.trim().length === 0) {
        return { ok: false, error: invalidValue('color', 'color must not be empty') };
      }
    }
    filter.colors = colors;
  }

  const minPriceRaw = params.get('minPrice');
  if (minPriceRaw !== null) {
    const parsed = parseBoundedInt(minPriceRaw, 'minPrice', 0, 'must not be negative');
    if (typeof parsed !== 'number') {
      return { ok: false, error: parsed };
    }
    filter.minPrice = parsed;
  }
  const maxPriceRaw = params.get('maxPrice');
  if (maxPriceRaw !== null) {
    const parsed = parseBoundedInt(maxPriceRaw, 'maxPrice', 0, 'must not be negative');
    if (typeof parsed !== 'number') {
      return { ok: false, error: parsed };
    }
    filter.maxPrice = parsed;
  }
  if (filter.minPrice !== undefined && filter.maxPrice !== undefined) {
    if (filter.minPrice > filter.maxPrice) {
      return {
        ok: false,
        error: {
          kind: 'invalid-value',
          parameter: 'minPrice',
          detail: 'minPrice must not exceed maxPrice',
        },
      };
    }
  }

  const inStockRaw = params.get('inStock');
  if (inStockRaw !== null) {
    if (inStockRaw !== 'true' && inStockRaw !== 'false') {
      return {
        ok: false,
        error: { kind: 'invalid-value', parameter: 'inStock', detail: 'inStock is invalid' },
      };
    }
    filter.inStock = inStockRaw === 'true';
  }

  const is5gRaw = params.get('is5g');
  if (is5gRaw !== null) {
    if (is5gRaw !== 'true' && is5gRaw !== 'false') {
      return {
        ok: false,
        error: { kind: 'invalid-value', parameter: 'is5g', detail: 'is5g is invalid' },
      };
    }
    filter.is5g = is5gRaw === 'true';
  }

  const featuredRaw = params.get('featured');
  if (featuredRaw !== null) {
    if (featuredRaw !== 'true' && featuredRaw !== 'false') {
      return {
        ok: false,
        error: { kind: 'invalid-value', parameter: 'featured', detail: 'featured is invalid' },
      };
    }
    filter.featured = featuredRaw === 'true';
  }

  const promotionRaw = params.get('promotion');
  if (promotionRaw !== null) {
    if (promotionRaw !== 'true' && promotionRaw !== 'false') {
      return {
        ok: false,
        error: { kind: 'invalid-value', parameter: 'promotion', detail: 'promotion is invalid' },
      };
    }
    filter.promotion = promotionRaw === 'true';
  }

  const sortRaw = params.get('sort');
  if (sortRaw !== null) {
    if (!isProductSort(sortRaw)) {
      return {
        ok: false,
        error: { kind: 'invalid-value', parameter: 'sort', detail: 'sort is invalid' },
      };
    }
    filter.sort = sortRaw;
  }

  const pageRaw = params.get('page');
  if (pageRaw !== null) {
    const parsed = parseBoundedInt(pageRaw, 'page', 1, 'must be at least 1');
    if (typeof parsed !== 'number') {
      return { ok: false, error: parsed };
    }
    filter.page = parsed;
  }

  const pageSizeRaw = params.get('pageSize');
  if (pageSizeRaw !== null) {
    if (pageSizeRaw !== '12' && pageSizeRaw !== '24') {
      return {
        ok: false,
        error: {
          kind: 'invalid-value',
          parameter: 'pageSize',
          detail: 'pageSize must be 12 or 24',
        },
      };
    }
    filter.pageSize = pageSizeRaw === '12' ? 12 : 24;
  }

  return { ok: true, filter };
}

/** Lowercase, NFC-normalised "brand name". */
function searchKey(entry: CatalogEntry): string {
  return entry.searchKey;
}

/** Position of `q` inside `searchKey`, or `Infinity` when absent. */
function qPosition(entry: CatalogEntry, q: string): number {
  return entry.searchKey.indexOf(q);
}

/** "brand name", the backend's name-sort key (CatalogService.java
 *  NAME_ASC / NAME_DESC). */
function nameKey(entry: CatalogEntry): string {
  return entry.nameKey;
}

/** Java's `String.CASE_INSENSITIVE_ORDER`, the backend's order for brand
 *  and product names: the code-unit order of the lowercased strings, not
 *  a locale collation (a Hungarian collation sorts "Zte" before "Zsolt";
 *  the backend does not). */
export function compareCaseInsensitive(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

/**
 * True when one variant passes every variant-level filter jointly: colour,
 * price window and stock. Mirrors the backend's `variantMatches`
 * (CatalogService.java).
 */
export function variantMatches(variant: Variant, filter: CatalogFilter): boolean {
  if (filter.colors.length > 0 && !filter.colors.includes(variant.colorCode)) return false;
  const amount = variant.price.amount;
  if (filter.minPrice !== undefined && amount < filter.minPrice) return false;
  if (filter.maxPrice !== undefined && amount > filter.maxPrice) return false;
  if (filter.inStock !== undefined && filter.inStock !== (variant.availability === 'in_stock')) {
    return false;
  }
  return true;
}

/**
 * The variant an entry displays for this request: the first colour, in
 * `colorOrder`, whose variant at the entry's storage passes every
 * variant-level filter; null when none does. Mirrors the backend's
 * `pickEntry`, so the card, the price sorts and the price range follow the
 * active filters instead of the variant fixed at load time.
 */
export function pickDisplayedVariant(entry: CatalogEntry, filter: CatalogFilter): Variant | null {
  for (const code of entry.ranking.colorOrder) {
    const variant = entry.product.variants.find(
      (v) => v.colorCode === code && v.storageGb === entry.storageGb,
    );
    if (variant !== undefined && variantMatches(variant, filter)) return variant;
  }
  return null;
}

/** True when the product-level filters accept this entry. */
function passesProductFilters(entry: CatalogEntry, filter: CatalogFilter): boolean {
  if (filter.q !== undefined && filter.q.trim().length > 0) {
    const q = filter.q.trim().toLowerCase().normalize('NFC');
    if (!searchKey(entry).includes(q)) return false;
  }
  if (filter.brands.length > 0) {
    const wanted = filter.brands.map((b) => b.toLowerCase().normalize('NFC').trim());
    if (!wanted.includes(entry.brandKey)) return false;
  }
  if (filter.is5g !== undefined && entry.product.is5g !== filter.is5g) return false;
  if (filter.featured !== undefined && entry.ranking.featured !== filter.featured) {
    return false;
  }
  if (
    filter.promotion !== undefined &&
    (entry.product.promotion !== undefined) !== filter.promotion
  ) {
    return false;
  }
  if (filter.storageGb.length > 0 && !filter.storageGb.includes(entry.storageGb)) {
    return false;
  }
  return true;
}

/** Apply every filter. Returns the entries that pass, each carrying the
 *  variant it displays for this request (`pickDisplayedVariant`). */
export function applyFilters(
  entries: readonly CatalogEntry[],
  filter: CatalogFilter,
): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const entry of entries) {
    if (!passesProductFilters(entry, filter)) continue;
    const variant = pickDisplayedVariant(entry, filter);
    if (variant !== null) out.push({ ...entry, variant });
  }
  return out;
}

/** Numeric product id, the second key of the recommended order. */
function entryId(entry: CatalogEntry): number {
  const n = Number(entry.product.id);
  return Number.isFinite(n) ? n : 0;
}

/** Sort `entries` per the contract's sort modes. */
export function sortEntries(
  entries: readonly CatalogEntry[],
  mode: ProductSort,
  q: string | undefined,
): CatalogEntry[] {
  const copy = entries.slice();
  // CatalogService.java RECOMMENDED_ENTRY_ORDER: rank, then product id,
  // then storage. Every sort except the name sorts ends in it, like the
  // backend.
  const recommendedOrder = (a: CatalogEntry, b: CatalogEntry): number => {
    if (a.ranking.rank !== b.ranking.rank) return a.ranking.rank - b.ranking.rank;
    const idCmp = entryId(a) - entryId(b);
    if (idCmp !== 0) return idCmp;
    return a.storageGb - b.storageGb;
  };
  const recommendedCmp = (a: CatalogEntry, b: CatalogEntry): number => {
    if (q !== undefined && q.trim().length > 0) {
      const qn = q.trim().toLowerCase().normalize('NFC');
      const pa = qPosition(a, qn);
      const pb = qPosition(b, qn);
      if (pa !== pb) return pa - pb;
    }
    return recommendedOrder(a, b);
  };

  switch (mode) {
    case 'recommended':
      copy.sort(recommendedCmp);
      break;
    case 'newest':
      copy.sort((a, b) => {
        const cmp = b.releasedAt.localeCompare(a.releasedAt);
        if (cmp !== 0) return cmp;
        return recommendedOrder(a, b);
      });
      break;
    case 'oldest':
      copy.sort((a, b) => {
        const cmp = a.releasedAt.localeCompare(b.releasedAt);
        if (cmp !== 0) return cmp;
        return recommendedOrder(a, b);
      });
      break;
    case 'popularity':
      copy.sort((a, b) => {
        const cmp = b.ranking.popularityScore - a.ranking.popularityScore;
        if (cmp !== 0) return cmp;
        return recommendedOrder(a, b);
      });
      break;
    case 'price_asc':
      copy.sort((a, b) => {
        const cmp = a.variant.price.amount - b.variant.price.amount;
        if (cmp !== 0) return cmp;
        return recommendedOrder(a, b);
      });
      break;
    case 'price_desc':
      copy.sort((a, b) => {
        const cmp = b.variant.price.amount - a.variant.price.amount;
        if (cmp !== 0) return cmp;
        return recommendedOrder(a, b);
      });
      break;
    case 'name_asc':
      copy.sort((a, b) => {
        const cmp = compareCaseInsensitive(nameKey(a), nameKey(b));
        if (cmp !== 0) return cmp;
        return a.storageGb - b.storageGb;
      });
      break;
    case 'name_desc':
      copy.sort((a, b) => {
        const cmp = compareCaseInsensitive(nameKey(b), nameKey(a));
        if (cmp !== 0) return cmp;
        return a.storageGb - b.storageGb;
      });
      break;
    default: {
      // Exhaustiveness check: every `ProductSort` has a case above.
      const _exhaustive: never = mode;
      throw new Error(`[catalog-filter] unhandled ProductSort: ${String(_exhaustive)}`);
    }
  }
  return copy;
}

/** Apply filter, sort and cap featured. Returns entries + total count. */
export function filterSort(
  entries: readonly CatalogEntry[],
  filter: CatalogFilter,
): { items: readonly CatalogEntry[]; total: number } {
  const filtered = applyFilters(entries, filter);
  const sorted = sortEntries(filtered, filter.sort, filter.q);
  let items = sorted;
  if (filter.featured === true) {
    items = items.slice(0, 4);
  }
  return { items, total: items.length };
}

/** Page a sorted list. */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: 12 | 24,
): { items: T[]; total: number; totalPages: number } {
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const slice = items.slice(startIndex, startIndex + pageSize);
  return { items: slice, total, totalPages };
}

/** Map a list of entries to `CatalogItem`s. */
export function toCatalogItems(entries: readonly CatalogEntry[]): CatalogItem[] {
  return entries.map(toCatalogItem);
}

export { ALLOWED_STORAGES, PRODUCT_SORTS };
