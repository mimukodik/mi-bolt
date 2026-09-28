import type { CatalogFilters } from '../../features/catalog/catalog-query';

/**
 * `FilterIdentity` as `docs/spec/components.md:7` defines it after decision
 * **D16** widened it: `{name: keyof CatalogFilters | 'q' | 'featured';
 * value?: string | number}`. `AppliedFilters` renders eight chip kinds —
 * the six `CatalogFilters` keys plus the search term (`q`, which
 * `CatalogQuery` carries but `CatalogFilters` does not) and `featured`
 * (a real `listProducts` query parameter `CatalogQuery` carries that the
 * pre-D16 `CatalogFilters`/`FilterIdentity` pair could not name). See
 * `FIX-60` items 3 and "Why this is wrong" for the two-chip contradiction
 * this widening resolves.
 */
export interface FilterIdentity {
  readonly name: keyof CatalogFilters | 'q' | 'featured' | 'promotion';
  readonly value?: string | number;
}
