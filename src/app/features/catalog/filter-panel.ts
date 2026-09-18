import { Component, computed, input, output, signal } from '@angular/core';

import type { CatalogQuery, SortMode } from './catalog-query';
import {
  ALLOWED_STORAGE_GB,
  SORT_MODES,
} from './catalog-query';
import type { FacetValue } from '../../api/generated/models/facet-value';

import { Button } from '../../shared/ui/button/button';
import { FormFieldMessage } from '../../shared/ui/form-field-message/form-field-message';


/**
 * T13 — desktop filter sidebar (FilterPanel).
 *
 * Bound to one `CatalogFilters` value plus the live facets and a
 * `disabled` flag. Emits `filtersChanged` whenever the user mutates a
 * control. The host (CatalogPage) forwards the event to the facade,
 * which in turn writes the canonical URL.
 *
 * The component owns no business state and performs no HTTP traffic
 * — every change is an intent delivered to the parent.
 *
 * Required states:
 *   - default       — every control shows the value held by the parent.
 *   - selected      — a brand / storage bucket / stock / 5G toggle is on.
 *   - focus         — every control carries a 2 px focus-visible ring.
 *   - disabled      — while the catalogue vm is refreshing or errored
 *                     (the parent disables the panel so a slow network
 *                     can't accumulate stale draft clicks).
 *   - invalid       — the price range fails the min <= max validation;
 *                     the apply intent is suppressed until the user
 *                     fixes it.
 */
@Component({
  selector: 'app-filter-panel',
  imports: [Button, FormFieldMessage],
  templateUrl: './filter-panel.html',
  styleUrl: './filter-panel.scss',
})
export class FilterPanel {
  /** The current query reflected by the controls. */
  readonly value = input.required<CatalogQuery>();

  /** Facet buckets from the latest successful response, if any. */
  readonly facets = input<{ readonly brands: readonly FacetValue[]; readonly storageGb: readonly FacetValue[] } | null>(null);

  /** True when the panel should be inert (loading or error refresh). */
  readonly disabled = input<boolean>(false);

  /** Emits the next complete CatalogQuery when the user changes a control. */
  readonly filtersChanged = output<CatalogQuery>();

  // Local drafts for the controls that need an "in progress" copy.
  private readonly minSignal = signal<string>('');
  private readonly maxSignal = signal<string>('');
  private readonly searchSignal = signal<string>('');

  /** Storage buckets exposed by the documented storage enum. */
  readonly storageBuckets = computed<readonly (128 | 256 | 512)[]>(() => ALLOWED_STORAGE_GB);

  /** Brand facets, falling back to an empty list when none are present. */
  readonly brandFacets = computed<readonly FacetValue[]>(() => this.facets()?.brands ?? []);

  readonly minDraft = computed<string>(() => {
    const local = this.minSignal();
    if (local !== '') return local;
    const min = this.value().minPrice;
    return min === undefined ? '' : String(min);
  });

  readonly maxDraft = computed<string>(() => {
    const local = this.maxSignal();
    if (local !== '') return local;
    const max = this.value().maxPrice;
    return max === undefined ? '' : String(max);
  });

  readonly searchDraft = computed<string>(() => {
    const local = this.searchSignal();
    if (local !== '') return local;
    return this.value().q ?? '';
  });

  readonly hasActiveFilters = computed<boolean>(() => {
    const q = this.value();
    if (q.q !== undefined && q.q.length > 0) return true;
    if ((q.brands?.length ?? 0) > 0) return true;
    if ((q.storageGb?.length ?? 0) > 0) return true;
    if (q.minPrice !== undefined) return true;
    if (q.maxPrice !== undefined) return true;
    if (q.inStock !== undefined) return true;
    if (q.is5g !== undefined) return true;
    return false;
  });

  /** Hungarian reason describing the price range problem, or null. */
  readonly priceError = computed<string | null>(() => {
    const min = this.parsePrice(this.minDraft());
    const max = this.parsePrice(this.maxDraft());
    if (min !== null && min < 0) return 'A minimum ár nem lehet negatív.';
    if (max !== null && max < 0) return 'A maximum ár nem lehet negatív.';
    if (min !== null && max !== null && min > max) return 'A minimum nem lehet nagyobb a maximum árnál.';
    return null;
  });

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchSignal.set(value);
    if (this.priceError() !== null) return;
    this.emit({ q: value.trim().length > 0 ? value.trim() : undefined });
  }

  onMinInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.minSignal.set(value);
    if (this.priceError() !== null) return;
    const parsed = this.parsePrice(value);
    this.emit({ minPrice: parsed ?? undefined });
  }

  onMaxInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.maxSignal.set(value);
    if (this.priceError() !== null) return;
    const parsed = this.parsePrice(value);
    this.emit({ maxPrice: parsed ?? undefined });
  }

  toggleBrand(brand: string): void {
    const current = this.value().brands ?? [];
    const next = current.includes(brand) ? current.filter((b) => b !== brand) : [...current, brand];
    this.emit({ brands: next.length > 0 ? next : undefined });
  }

  toggleStorage(bucket: 128 | 256 | 512): void {
    const current = this.value().storageGb ?? [];
    const next = current.includes(bucket) ? current.filter((b) => b !== bucket) : [...current, bucket];
    this.emit({ storageGb: next.length > 0 ? next : undefined });
  }

  toggleInStock(): void {
    const current = this.value().inStock;
    this.emit({ inStock: current === true ? undefined : true });
  }

  toggleFiveG(): void {
    const current = this.value().is5g;
    this.emit({ is5g: current === true ? undefined : true });
  }

  resetAll(): void {
    this.minSignal.set('');
    this.maxSignal.set('');
    this.searchSignal.set('');
    this.emit({
      q: undefined,
      brands: undefined,
      storageGb: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      inStock: undefined,
      is5g: undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  isBrandSelected(brand: string): boolean {
    return (this.value().brands ?? []).includes(brand);
  }

  isStorageSelected(bucket: 128 | 256 | 512): boolean {
    return (this.value().storageGb ?? []).includes(bucket);
  }

  isInStockSelected(): boolean {
    return this.value().inStock === true;
  }

  isFiveGSelected(): boolean {
    return this.value().is5g === true;
  }

  /** Compose the next query (page resets on filter changes via the facade). */
  private emit(partial: Partial<CatalogQuery>): void {
    const next: CatalogQuery = { ...this.value(), ...partial };
    this.filtersChanged.emit(next);
  }

  /** Parse a price input string; returns null when blank, the integer otherwise. */
  private parsePrice(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (!/^-?\d+$/.test(trimmed)) return null;
    return Number(trimmed);
  }
}

// Keep `SortMode` and `SORT_MODES` imports live so future sort controls can
// reuse the same enum without re-importing it. The current FilterPanel does
// not expose the sort control — sort lives in the toolbar.
export const _sortMarker: readonly SortMode[] = SORT_MODES;
