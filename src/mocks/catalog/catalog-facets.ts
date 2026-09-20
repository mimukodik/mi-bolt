/**
 * MIM-210 — disjunctive facets for the catalogue mock.
 *
 * Every facet removes its own selection before counting, so a
 * `brands=[X]` filter still reports every other brand the active
 * filters would unlock. The facet counts follow the same
 * filter / sort / cap pipeline as the entries, so a `featured=true`
 * selection also caps the counts at 4 entries.
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
  filterSort,
  sortEntries,
  type CatalogFilter as Filter,
} from './catalog-filter';

/** Builds the `brands` facet. Removes the `brand` filter before counting. */
function buildBrandFacet(entries: readonly CatalogEntry[], filter: Filter): FacetValue[] {
  const noBrand: Filter = { ...filter, brands: [] };
  const matched = applyFilters(entries, noBrand);
  const counts = new Map<string, number>();
  for (const entry of matched) {
    counts.set(entry.brandKey, (counts.get(entry.brandKey) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, 'hu'));
}

/** Builds the `storageGb` facet. Counts the sizes present, in fixed order. */
function buildStorageFacet(entries: readonly CatalogEntry[], filter: Filter): FacetValue[] {
  const noStorage: Filter = { ...filter, storageGb: [] };
  const matched = applyFilters(entries, noStorage);
  const counts = new Map<number, number>();
  for (const entry of matched) {
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
 * preserves the source `colors[]` order). The count is scoped to
 * that code only, with the `color` filter removed.
 */
function buildColorFacet(entries: readonly CatalogEntry[], filter: Filter): ColorFacetValue[] {
  const noColor: Filter = { ...filter, colors: [] };
  const matched = applyFilters(entries, noColor);
  const codeFirstEntry = new Map<string, CatalogEntry>();
  for (const entry of matched) {
    if (codeFirstEntry.has(entry.variant.colorCode)) continue;
    codeFirstEntry.set(entry.variant.colorCode, entry);
  }
  const counts = new Map<string, number>();
  for (const entry of matched) {
    counts.set(entry.variant.colorCode, (counts.get(entry.variant.colorCode) ?? 0) + 1);
  }
  // Walk products by recommended order (preserved by `applyFilters`),
  // then colorOrder within the product.
  const firstEntryBySlug = new Map<string, CatalogEntry>();
  for (const entry of matched) {
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
      const sample = codeFirstEntry.get(code);
      if (!sample) continue;
      out.push({
        value: code,
        label: sample.variant.colorName,
        swatchHex: sample.variant.swatchHex,
        count: counts.get(code) ?? 0,
      });
    }
  }
  return out;
}

/** `is5g` facet count: matches the rest of the filters, with `is5g` removed. */
function buildIs5gCount(entries: readonly CatalogEntry[], filter: Filter): number {
  const noIs5g: Filter = { ...filter, is5g: undefined };
  const matched = applyFilters(entries, noIs5g).filter((e) => e.product.is5g);
  const sorted = sortEntries(matched, filter.sort, filter.q);
  let items = sorted;
  if (filter.featured === true) items = items.slice(0, 4);
  return items.length;
}

/** `inStock` facet count: forces `inStock=true` and caps featured. */
function buildInStockCount(entries: readonly CatalogEntry[], filter: Filter): number {
  const forced: Filter = { ...filter, inStock: true };
  const matched = applyFilters(entries, forced);
  const sorted = sortEntries(matched, filter.sort, filter.q);
  let items = sorted;
  if (filter.featured === true) items = items.slice(0, 4);
  return items.length;
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
 * Build the whole `Facets` bundle for the supplied filter. The
 * `priceRange` is computed on the post-cap list (featured=true caps at
 * 4); every count is capped at 4 when `featured=true` so the card
 * stays consistent with the visible entries.
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
