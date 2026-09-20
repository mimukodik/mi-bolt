import { Component, computed, input, output } from '@angular/core';

import { buildChips, type CatalogQuery } from './catalog-query';
import type { FilterIdentity } from '../../shared/types/filter-identity';

/** `FilterIdentity.name`'s two array-valued members carry a
 *  singular DOM test-id rather than their plural type name — the same
 *  test-ids the pre-extraction inline markup used. */
function chipTestId(name: FilterIdentity['name']): string {
  if (name === 'brands') return 'brand';
  if (name === 'storageGb') return 'storage';
  return name;
}

/**
 * `AppliedFilters` — `docs/spec/components.md:356`.
 *
 * Named removable chips plus clear-all, derived from the canonical
 * `CatalogQuery`. Renders all eight chip kinds `buildChips` produces —
 * the six `CatalogFilters` keys, `q` and `featured` — after decision
 * **D16** widened `FilterIdentity` to name the last two. Extracted out
 * of `CatalogPage` by `FIX-60`.
 */
@Component({
  selector: 'app-applied-filters',
  templateUrl: './applied-filters.html',
  styleUrl: './applied-filters.scss',
})
export class AppliedFilters {
  readonly query = input.required<CatalogQuery>();

  readonly filterRemoved = output<FilterIdentity>();
  readonly cleared = output();

  protected readonly chips = computed(() => buildChips(this.query()));

  protected testId(name: FilterIdentity['name']): string {
    return chipTestId(name);
  }

  onRemove(name: FilterIdentity['name'], value: string | number | undefined): void {
    this.filterRemoved.emit({ name, value });
  }
}
