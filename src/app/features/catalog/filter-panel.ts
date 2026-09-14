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
  template: `
    <section
      class="panel"
      [attr.aria-busy]="disabled() ? 'true' : null"
      data-testid="filter-panel"
    >
      <header class="header">
        <h2 class="title">Szűrők</h2>
        <app-button
          variant="secondary"
          size="standard"
          label="Szűrők törlése"
          data-testid="filter-reset"
          [disabled]="disabled() || !hasActiveFilters()"
          (pressed)="resetAll()"
        ></app-button>
      </header>

      <fieldset class="group" data-testid="filter-group-search">
        <legend class="legend">Keresés</legend>
        <label class="search">
          <span class="sr-only">Keresés a telefonok között</span>
          <input
            type="search"
            class="input"
            data-testid="filter-search-input"
            [value]="searchDraft()"
            (input)="onSearchInput($event)"
            placeholder="pl. Demo 5G"
            [disabled]="disabled()"
          />
        </label>
      </fieldset>

      <fieldset class="group" data-testid="filter-group-brand">
        <legend class="legend">Márka</legend>
        <ul class="options" role="list">
          @for (brand of brandFacets(); track brand.value) {
            <li>
              <button
                type="button"
                class="option"
                [class.is-selected]="isBrandSelected(brand.value)"
                [attr.data-testid]="'filter-brand-' + brand.value"
                [attr.aria-pressed]="isBrandSelected(brand.value) ? 'true' : 'false'"
                [disabled]="disabled() || brand.count === 0"
                (click)="toggleBrand(brand.value)"
              >
                <span class="check" aria-hidden="true">{{ isBrandSelected(brand.value) ? '✓' : '' }}</span>
                <span class="option__label">{{ brand.label }}</span>
                <span class="option__count" aria-label="találatok száma">{{ brand.count }}</span>
              </button>
            </li>
          }
        </ul>
      </fieldset>

      <fieldset class="group" data-testid="filter-group-storage">
        <legend class="legend">Tárhely</legend>
        <ul class="options options--row" role="list">
          @for (bucket of storageBuckets(); track bucket) {
            <li>
              <button
                type="button"
                class="option option--chip"
                [class.is-selected]="isStorageSelected(bucket)"
                [attr.data-testid]="'filter-storage-' + bucket"
                [attr.aria-pressed]="isStorageSelected(bucket) ? 'true' : 'false'"
                [disabled]="disabled()"
                (click)="toggleStorage(bucket)"
              >
                <span class="check" aria-hidden="true">{{ isStorageSelected(bucket) ? '✓' : '' }}</span>
                <span>{{ bucket }} GB</span>
              </button>
            </li>
          }
        </ul>
      </fieldset>

      <fieldset class="group" data-testid="filter-group-price">
        <legend class="legend">Ár (Ft, egész szám)</legend>
        <div class="price">
          <label class="price__field">
            <span class="price__label">Min.</span>
            <input
              type="number"
              inputmode="numeric"
              min="0"
              step="1000"
              class="input"
              data-testid="filter-min-price"
              [value]="minDraft()"
              (input)="onMinInput($event)"
              [disabled]="disabled()"
            />
          </label>
          <label class="price__field">
            <span class="price__label">Max.</span>
            <input
              type="number"
              inputmode="numeric"
              min="0"
              step="1000"
              class="input"
              data-testid="filter-max-price"
              [value]="maxDraft()"
              (input)="onMaxInput($event)"
              [disabled]="disabled()"
            />
          </label>
        </div>
        @if (priceError()) {
          <app-form-field-message
            data-testid="filter-price-error"
            [errors]="[{ code: 'INVALID_PRICE', message: priceError()!, pointer: 'price' }]"
            [touched]="true"
            severity="error"
            fieldId="filter-price"
          ></app-form-field-message>
        }
      </fieldset>

      <fieldset class="group" data-testid="filter-group-flags">
        <legend class="legend">További szűrők</legend>
        <button
          type="button"
          class="option option--toggle"
          [class.is-selected]="isInStockSelected()"
          [attr.data-testid]="'filter-inStock'"
          [attr.aria-pressed]="isInStockSelected() ? 'true' : 'false'"
          [disabled]="disabled()"
          (click)="toggleInStock()"
        >
          <span class="check" aria-hidden="true">{{ isInStockSelected() ? '✓' : '' }}</span>
          <span>Csak raktáron</span>
        </button>
        <button
          type="button"
          class="option option--toggle"
          [class.is-selected]="isFiveGSelected()"
          [attr.data-testid]="'filter-is5g'"
          [attr.aria-pressed]="isFiveGSelected() ? 'true' : 'false'"
          [disabled]="disabled()"
          (click)="toggleFiveG()"
        >
          <span class="check" aria-hidden="true">{{ isFiveGSelected() ? '✓' : '' }}</span>
          <span>Csak 5G</span>
        </button>
      </fieldset>
    </section>
  `,
  styles: [
    `
      :host { display: block; }

      .panel {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
        padding: var(--space-5);
        background: var(--color-surface-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }

      .title {
        margin: 0;
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
        color: var(--color-text-primary);
        line-height: var(--line-height-heading);
      }

      .group {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin: 0;
        padding: 0;
        border: 0;
      }

      .legend {
        font-size: var(--type-helper);
        font-weight: var(--weight-medium);
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .options {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .options--row {
        flex-direction: row;
        flex-wrap: wrap;
        gap: var(--space-2);
      }

      .option {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        width: 100%;
        min-height: var(--size-control);
        padding: 0 var(--space-3);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-control);
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: var(--type-body);
        line-height: 1;
        cursor: pointer;
        text-align: left;
      }

      .option--chip {
        width: auto;
      }

      .option--toggle {
        width: 100%;
      }

      .option:hover:not(:disabled) {
        background: var(--color-brand-accent-soft);
        border-color: var(--color-brand-ink);
      }

      .option:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .option.is-selected {
        background: var(--color-brand-accent-soft);
        border-color: var(--color-brand-ink);
        color: var(--color-brand-ink);
        font-weight: var(--weight-medium);
      }

      .option:disabled {
        background: var(--color-surface-section);
        color: var(--color-text-secondary);
        cursor: not-allowed;
      }

      .check {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.25rem;
        font-weight: var(--weight-bold);
      }

      .option__label {
        flex: 1 1 auto;
      }

      .option__count {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .is-selected .option__count {
        color: var(--color-brand-ink);
      }

      .search {
        display: block;
      }

      .input {
        width: 100%;
        min-height: var(--size-control);
        padding: 0 var(--space-3);
        border: 1px solid var(--color-border-control);
        border-radius: var(--radius-control);
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: var(--type-body);
        line-height: 1;
      }

      .input:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .input:disabled {
        background: var(--color-surface-section);
        color: var(--color-text-secondary);
      }

      .price {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-2);
      }

      .price__field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .price__label {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
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
    this.emit({ minPrice: parsed === null ? undefined : parsed });
  }

  onMaxInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.maxSignal.set(value);
    if (this.priceError() !== null) return;
    const parsed = this.parsePrice(value);
    this.emit({ maxPrice: parsed === null ? undefined : parsed });
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
