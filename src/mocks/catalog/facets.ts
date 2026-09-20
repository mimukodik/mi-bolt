/**
 * T06 — facet counts without own filter.
 *
 * Each facet removes its own filter and counts DISTINCT products that
 * pass the remaining facets. The brand facet therefore sees every
 * product that survives all non-brand filters; the storage facet
 * sees every product that survives all non-storage filters.
 *
 * Counts must remain consistent with the returned items: if a brand
 * filter selects 4 products, the brand facet may still report 5 when
 * the next brand unlocks products that the active brand filter
 * excluded. Per AC03, that asymmetry is the point of facet counts.
 */

import type { Product } from '../repository';
import { FACET_STORAGE_GB, matchProduct, type CatalogFilter } from './filter-products';

/**
One entry in a facet response: value, label and the count of products.
*/
export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

/**
Brand + storage facet bundle the OpenAPI `ProductPage.facets` carries.
*/
export interface ProductFacets {
  brands: readonly FacetValue[];
  storageGb: readonly FacetValue[];
}

/**
 * Counts distinct products per brand after applying every facet
 * except `brand` itself. Products with no surviving variant under the
 * reduced filter are excluded.
 */
export function buildBrandFacet(
  products: readonly Product[],
  filter: CatalogFilter,
  featuredSlugs: ReadonlySet<string>,
): FacetValue[] {
  const filterWithoutBrand: CatalogFilter = { ...filter, brands: undefined };
  const counts = new Map<string, { label: string; count: number }>();
  for (const product of products) {
    if (matchProduct(product, filterWithoutBrand, featuredSlugs) === null) continue;
    const entry = counts.get(product.brand);
    if (entry === undefined) {
      counts.set(product.brand, { label: product.brand, count: 1 });
    } else {
      entry.count += 1;
    }
  }
  return [...counts]
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

/**
 * Counts distinct products per storage value after applying every
 * facet except `storageGb` itself. A product contributes once per
 * storage size it ships (deduplicated within the product); products
 * without any surviving variant are excluded.
 */
export function buildStorageFacet(
  products: readonly Product[],
  filter: CatalogFilter,
  featuredSlugs: ReadonlySet<string>,
): FacetValue[] {
  const filterWithoutStorage: CatalogFilter = { ...filter, storageGb: undefined };
  const counts = new Map<number, number>();
  for (const product of products) {
    if (matchProduct(product, filterWithoutStorage, featuredSlugs) === null) continue;
    const productStorages = new Set<number>();
    for (const variant of product.variants) {
      productStorages.add(variant.storageGb);
    }
    for (const storageGb of productStorages) {
      counts.set(storageGb, (counts.get(storageGb) ?? 0) + 1);
    }
  }
  const result: FacetValue[] = Array.from(FACET_STORAGE_GB, (storageGb) => ({
    value: String(storageGb),
    label: `${String(storageGb)} GB`,
    count: counts.get(storageGb) ?? 0,
  }));
  // Surface any storage sizes that exist in fixtures but were not
  // enumerated in FACET_STORAGE_GB (forward-compatible).
  for (const [value, count] of counts) {
    if (FACET_STORAGE_GB.includes(value)) continue;
    result.push({
      value: String(value),
      label: `${String(value)} GB`,
      count,
    });
  }
  return result.sort((a, b) => Number(a.value) - Number(b.value));
}

/**
Builds both facets in one call.
*/
export function buildFacets(
  products: readonly Product[],
  filter: CatalogFilter,
  featuredSlugs: readonly string[],
): ProductFacets {
  const featuredSet = new Set(featuredSlugs);
  return {
    brands: buildBrandFacet(products, filter, featuredSet),
    storageGb: buildStorageFacet(products, filter, featuredSet),
  };
}
