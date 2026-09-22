/**
 * MIM-210 — disjunctive facets for the catalogue mock.
 *
 * Every facet removes its own selection before counting, so a
 * `brands=[X]` filter still reports every other brand the active
 * filters would unlock. The facet counts follow the same
 * filter / sort / cap pipeline as the entries, so a `featured=true`
 * selection also caps the counts at 4 entries: every count is
 * computed on `capFeatured(sortEntries(applyFilters(entries, x)), filter)`
 * so a `featured=true` selection that truncates the visible list to
 * 4 entries also truncates each brand / storage / colour count to
 * the same 4.
 */

import type {
  ColorFacetValue,
  ColorOption,
  Facets,
  FacetValue,
  Money,
  PriceRange,
} from '../../app/api/generated/models';
import { ALLOWED_STORAGES, type CatalogEntry } from './catalog-store';
import type { CatalogFilter } from './catalog-filter';
import {
  applyFilters,
  filterSort,
  sortEntries,
  variantMatches,
  type CatalogFilter as Filter,
} from './catalog-filter';

/** Cap the list at 4 entries when `featured=true`. Used by every facet count
 *  so a featured selection bounds the counts the same way it bounds the
 *  visible entries. */
function capFeatured(items: readonly CatalogEntry[], filter: Filter): readonly CatalogEntry[] {
  return filter.featured === true ? items.slice(0, 4) : items;
}

/** Builds the `brands` facet. Removes the `brand` filter before counting,
 *  then sorts and caps under `featured=true` before tallying per-brand.
 *  The `value` is the lowercased brand key (the identifier the URL and
 *  the panel filter on); the `label` is the brand's display name as it
 *  appears on a product page, so the filter row reads "Apple (17)" and
 *  not "apple (17)" — the demo copy and the API contract both expect
 *  the display name. */
function buildBrandFacet(entries: readonly CatalogEntry[], filter: Filter): FacetValue[] {
  const noBrand: Filter = { ...filter, brands: [] };
  const capped = capFeatured(
    sortEntries(applyFilters(entries, noBrand), filter.sort, filter.q),
    filter,
  );
  const counts = new Map<string, number>();
  const displayNames = new Map<string, string>();
  for (const entry of capped) {
    counts.set(entry.brandKey, (counts.get(entry.brandKey) ?? 0) + 1);
    if (!displayNames.has(entry.brandKey)) {
      displayNames.set(entry.brandKey, entry.product.brand);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: displayNames.get(value) ?? value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, 'hu'));
}

/** Builds the `storageGb` facet. Counts the sizes present, in fixed order,
 *  on the sorted + featured-capped list so a featured cap bounds each
 *  storage count. */
function buildStorageFacet(entries: readonly CatalogEntry[], filter: Filter): FacetValue[] {
  const noStorage: Filter = { ...filter, storageGb: [] };
  const capped = capFeatured(
    sortEntries(applyFilters(entries, noStorage), filter.sort, filter.q),
    filter,
  );
  const counts = new Map<number, number>();
  for (const entry of capped) {
    counts.set(entry.storageGb, (counts.get(entry.storageGb) ?? 0) + 1);
  }
  const out: FacetValue[] = [];
  for (const gb of ALLOWED_STORAGES) {
    const value = String(gb);
    out.push({ value, label: `${value} GB`, count: counts.get(gb) ?? 0 });
  }
  return out;
}

/**
 * Builds the `colors` facet. Walks products in recommended order and
 * keeps the first colour per code (`colorOrder` in `ranking[]`
 * preserves the source `colors[]` order). The count mirrors the
 * backend's `matchesColorFacet`: an entry counts for a colour when it
 * has a variant of that colour at its storage passing every other
 * active filter, the colour selection removed.
 */
function buildColorFacet(entries: readonly CatalogEntry[], filter: Filter): ColorFacetValue[] {
  const noColor: Filter = { ...filter, colors: [] };
  const capped = capFeatured(
    sortEntries(applyFilters(entries, noColor), filter.sort, filter.q),
    filter,
  );
  const samples = new Map<string, ColorOption>();
  const counts = new Map<string, number>();
  for (const entry of capped) {
    for (const option of entry.colors) {
      const variant = entry.product.variants.find((v) => v.id === option.variantId);
      if (variant === undefined || !variantMatches(variant, noColor)) continue;
      counts.set(option.colorCode, (counts.get(option.colorCode) ?? 0) + 1);
      if (!samples.has(option.colorCode)) samples.set(option.colorCode, option);
    }
  }
  // Walk products by recommended order (preserved by `applyFilters`),
  // then colorOrder within the product.
  const firstEntryBySlug = new Map<string, CatalogEntry>();
  for (const entry of capped) {
    if (!firstEntryBySlug.has(entry.product.slug)) {
      firstEntryBySlug.set(entry.product.slug, entry);
    }
  }
  const seenCodes = new Set<string>();
  const out: ColorFacetValue[] = [];
  for (const first of firstEntryBySlug.values()) {
    for (const code of first.ranking.colorOrder) {
      if (seenCodes.has(code)) continue;
      seenCodes.add(code);
      const sample = samples.get(code);
      if (sample === undefined) continue;
      out.push({
        value: code,
        label: sample.colorName,
        swatchHex: sample.swatchHex,
        count: counts.get(code) ?? 0,
      });
    }
  }
  return out;
}

/** `is5g` facet count: cap the post-filter list to featured-size first,
 *  then count how many of the capped entries carry `is5g = true`. */
function buildIs5gCount(entries: readonly CatalogEntry[], filter: Filter): number {
  const noIs5g: Filter = { ...filter, is5g: undefined };
  const matched = applyFilters(entries, noIs5g);
  const sorted = sortEntries(matched, filter.sort, filter.q);
  const capped = capFeatured(sorted, filter);
  return capped.filter((e) => e.product.is5g).length;
}

/** `inStock` facet count: the entries that would match with `inStock=true`
 *  (an in-stock variant passing every other filter), sorted and capped to
 *  the featured size first. Mirrors the backend's in-stock count. */
function buildInStockCount(entries: readonly CatalogEntry[], filter: Filter): number {
  const withInStock: Filter = { ...filter, inStock: true };
  const matched = applyFilters(entries, withInStock);
  const sorted = sortEntries(matched, filter.sort, filter.q);
  return capFeatured(sorted, filter).length;
}

/** Build the `priceRange` from the post-filter, post-sort, post-cap list. */
function buildPriceRange(items: readonly CatalogEntry[]): PriceRange {
  if (items.length === 0) {
    const zero: Money = { amount: 0, currency: 'HUF' };
    return { min: zero, max: zero };
  }
  let min = items[0].variant.price.amount;
  let max = items[0].variant.price.amount;
  for (const entry of items) {
    const amount = entry.variant.price.amount;
    if (amount < min) min = amount;
    if (amount > max) max = amount;
  }
  return {
    min: { amount: min, currency: 'HUF' },
    max: { amount: max, currency: 'HUF' },
  };
}

/**
 * Build the whole `Facets` bundle for the supplied filter. Every count
 * is computed on the same sorted, featured-capped list (`capFeatured`
 * truncates the visible list at 4 when `featured=true`), so the
 * `brands` / `storageGb` / `colors` / `is5g` / `inStock` counts and
 * the `priceRange` bounds all reflect the same 4 entries the page
 * renders.
 */
export function buildFacets(entries: readonly CatalogEntry[], filter: CatalogFilter): Facets {
  const sorted = filterSort(entries, filter);
  const priceItems = sorted.items;
  return {
    brands: buildBrandFacet(entries, filter),
    storageGb: buildStorageFacet(entries, filter),
    colors: buildColorFacet(entries, filter),
    is5g: buildIs5gCount(entries, filter),
    inStock: buildInStockCount(entries, filter),
    priceRange: buildPriceRange(priceItems),
  };
}
