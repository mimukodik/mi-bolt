/**
 * MIM-210 — disjunctive facets for the catalogue mock.
 *
 * Every facet removes its own selection before counting, so a
 * `brands=[X]` filter still reports every other brand the active
 * filters would unlock. Like the backend (CatalogService.java
 * `computeFacets` and `capCount`), each count is taken over every
 * matching entry, and under `featured=true` each value's count is
 * then capped at the featured size: a value whose entries rank below
 * the fourth still counts (owner, 2026-09-22: the mock matches the
 * backend).
 */

import type {
  ColorFacetValue,
  Facets,
  FacetValue,
  Money,
  PriceRange,
} from '../../app/api/generated/models';
import { ALLOWED_STORAGES, type CatalogEntry } from './catalog-store';
import type { CatalogFilter } from './catalog-filter';
import {
  applyFilters,
  compareCaseInsensitive,
  filterSort,
  sortEntries,
  variantMatches,
  type CatalogFilter as Filter,
} from './catalog-filter';

/** The featured list's size (CatalogService.java `FEATURED_CAP`). */
const FEATURED_SIZE = 4;

/** Caps a facet count at the featured size when `featured=true`,
 *  after counting, like the backend's `capCount`. */
function capCount(count: number, filter: Filter): number {
  return filter.featured === true ? Math.min(count, FEATURED_SIZE) : count;
}

/** Builds the `brands` facet. Lists every brand of the whole catalogue,
 *  zero counts included, in the backend's order (`compareCaseInsensitive`),
 *  like CatalogService.java `computeFacets`. Removes the `brand` filter,
 *  counts every matching entry per brand and caps each count
 *  (`capCount`). The `value` is the lowercased brand key (the identifier
 *  the URL and the panel filter on); the `label` is the brand's display
 *  name as it appears on a product page, so the filter row reads
 *  "Apple (17)" and not "apple (17)". */
function buildBrandFacet(entries: readonly CatalogEntry[], filter: Filter): FacetValue[] {
  const noBrand: Filter = { ...filter, brands: [] };
  const matched = sortEntries(applyFilters(entries, noBrand), filter.sort, filter.q);
  const counts = new Map<string, number>();
  for (const entry of matched) {
    counts.set(entry.brandKey, (counts.get(entry.brandKey) ?? 0) + 1);
  }
  const displayNames = new Map<string, string>();
  for (const entry of entries) {
    if (!displayNames.has(entry.brandKey)) {
      displayNames.set(entry.brandKey, entry.product.brand);
    }
  }
  return [...displayNames.entries()]
    .map(([value, label]) => ({
      value,
      label,
      count: capCount(counts.get(value) ?? 0, filter),
    }))
    .sort((a, b) => compareCaseInsensitive(a.label, b.label));
}

/** Builds the `storageGb` facet. Lists every size some catalogue entry
 *  has (the backend's `presentStorage`), in fixed order, zero counts
 *  included; counts every matching entry per size and caps each count
 *  (`capCount`). */
function buildStorageFacet(entries: readonly CatalogEntry[], filter: Filter): FacetValue[] {
  const noStorage: Filter = { ...filter, storageGb: [] };
  const matched = sortEntries(applyFilters(entries, noStorage), filter.sort, filter.q);
  const counts = new Map<number, number>();
  for (const entry of matched) {
    counts.set(entry.storageGb, (counts.get(entry.storageGb) ?? 0) + 1);
  }
  const present = new Set(entries.map((entry) => entry.storageGb));
  const out: FacetValue[] = [];
  for (const gb of ALLOWED_STORAGES) {
    if (!present.has(gb)) continue;
    const value = String(gb);
    out.push({ value, label: `${value} GB`, count: capCount(counts.get(gb) ?? 0, filter) });
  }
  return out;
}

/**
 * Builds the `colors` facet. Lists every colour of the whole catalogue,
 * zero counts included, in recommended order: `entries` come in
 * recommended order (rank asc, id asc, storage asc) and `colorOrder`
 * keeps each product's own colour order, like the backend's
 * `recommendedColorOrder`. The name and swatch come from the first
 * product that has the colour (`findAnyColorWithCode`). The count
 * mirrors the backend's `matchesColorFacet`: an entry counts for a
 * colour when it has a variant of that colour at its storage passing
 * every other active filter, the colour selection removed. Every count
 * is then capped (`capCount`) so a value ranked below the featured size
 * still counts.
 */
function buildColorFacet(entries: readonly CatalogEntry[], filter: Filter): ColorFacetValue[] {
  const noColor: Filter = { ...filter, colors: [] };
  const matched = sortEntries(applyFilters(entries, noColor), filter.sort, filter.q);
  const counts = new Map<string, number>();
  for (const entry of matched) {
    for (const option of entry.colors) {
      const variant = entry.product.variants.find((v) => v.id === option.variantId);
      if (variant === undefined || !variantMatches(variant, noColor)) continue;
      counts.set(option.colorCode, (counts.get(option.colorCode) ?? 0) + 1);
    }
  }
  const seenCodes = new Set<string>();
  const out: ColorFacetValue[] = [];
  for (const entry of entries) {
    for (const code of entry.ranking.colorOrder) {
      if (seenCodes.has(code)) continue;
      const sample = entry.product.variants.find((v) => v.colorCode === code);
      if (sample === undefined) continue;
      seenCodes.add(code);
      out.push({
        value: code,
        label: sample.colorName,
        swatchHex: sample.swatchHex,
        count: capCount(counts.get(code) ?? 0, filter),
      });
    }
  }
  return out;
}

/** `is5g` facet count: every entry matching the other filters that
 *  is 5G, capped after counting (`capCount`). */
function buildIs5gCount(entries: readonly CatalogEntry[], filter: Filter): number {
  const noIs5g: Filter = { ...filter, is5g: undefined };
  const matched = applyFilters(entries, noIs5g);
  const sorted = sortEntries(matched, filter.sort, filter.q);
  return capCount(sorted.filter((e) => e.product.is5g).length, filter);
}

/** `inStock` facet count: the entries that would match with `inStock=true`
 *  (an in-stock variant passing every other filter), capped after counting
 *  (`capCount`). Mirrors the backend's in-stock count. */
function buildInStockCount(entries: readonly CatalogEntry[], filter: Filter): number {
  const withInStock: Filter = { ...filter, inStock: true };
  const matched = applyFilters(entries, withInStock);
  const sorted = sortEntries(matched, filter.sort, filter.q);
  return capCount(sorted.length, filter);
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
 * is taken over all matching entries and capped per value under
 * `featured=true` (`capCount`); the `priceRange` bounds come from the
 * entries the page renders, like the backend.
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
