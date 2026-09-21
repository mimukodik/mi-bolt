import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';

import type { CatalogQuery, Sort } from './catalog-query';
import { ALLOWED_STORAGE_GB, SORT_MODES, isStorageBucket } from './catalog-query';
import type { ColorFacetValue } from '../../api/generated/models/color-facet-value';
import type { FacetValue } from '../../api/generated/models/facet-value';
import type { Facets } from '../../api/generated/models/facets';

import { Button } from '../../shared/ui/button/button';
import { FormFieldMessage } from '../../shared/ui/form-field-message/form-field-message';
import { isHTMLInputElement } from '../../shared/utils/event-target';

/** What one storage chip needs to render: the size, its label and
 *  the facet count (null when no `Facets` has loaded yet, so the
 *  chip still appears in the empty state without a number). */
interface StorageBucket {
  readonly gb: 128 | 256 | 512;
  readonly label: string;
  readonly count: number | null;
}

/**
 * What a draft mirrors from the applied query: the one field it shows,
 * plus whether the applied query still carries any filter at all.
 */
interface DraftSource {
  /** The applied value of the mirrored field, rendered as input text. */
  readonly field: string;
  /** `hasActiveFilters()` — false once every filter has been cleared. */
  readonly filtered: boolean;
}

/**
 * `linkedSignal` computation shared by every draft below. A draft is an
 * in-progress copy of one applied field, so the local edit has to win
 * over an unrelated change to `value()`: Angular's own equality check
 * only compares the *stored* draft value against the freshly computed
 * one, so a plain `source` function would reset the draft on ANY change
 * to `value()` and throw away a half-typed price the moment a brand is
 * toggled.
 *
 * The applied value wins back in exactly two cases:
 *   - the mirrored field itself changed — the edit was applied, or the
 *     page replaced it;
 *   - the applied query went from filtered to unfiltered, i.e. a clear.
 *     This is the arm the field comparison cannot reach: a draft the
 *     `invalid` state blocked from committing never entered `value()`,
 *     so a clear looks like "no change" to it and the stale text would
 *     stay on screen with nothing filtered behind it (T27 filter reset).
 *
 * The clear test is deliberately one-way. The other direction —
 * unfiltered to filtered — is an unrelated control switching the first
 * filter on while this draft is still uncommitted (a negative price,
 * say), and that must leave the local edit alone.
 */
function keepDraftUnlessAppliedChanged(
  source: DraftSource,
  previous: { readonly source: DraftSource; readonly value: string } | undefined,
): string {
  if (previous === undefined) return source.field;
  if (previous.source.field !== source.field) return source.field;
  if (previous.source.filtered && !source.filtered) return source.field;
  return previous.value;
}

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
 *   - disabled      — while the catalogue is doing its FIRST load, and
 *                     only then: there are no facets to pick from yet
 *                     and no applied query to compose an intent onto.
 *                     It is deliberately not bound to `refreshing`.
 *                     Every control here puts the vm into `refreshing`
 *                     the instant it is touched, so disabling on that
 *                     status disables the control under the user's
 *                     hands: the browser blurs it, focus falls to
 *                     `<body>` and the rest of what they type is lost.
 *                     The "a slow network can't accumulate stale draft
 *                     clicks" guarantee that binding was reaching for
 *                     lives in `CatalogFacade` instead — `querySignal`
 *                     is written synchronously before each request and
 *                     `switchMap` drops the superseded one. See
 *                     `CatalogPage.controlsDisabled`.
 *   - invalid       — the price range fails the min <= max validation;
 *                     the *price* apply intent is suppressed until the
 *                     user fixes it. Every other control keeps applying,
 *                     because `emit` composes the next query from the
 *                     APPLIED value plus its own field and so can never
 *                     propagate the rejected range.
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

  /** Full `Facets` from the latest successful response, if any. */
  readonly facets = input<Facets | null>(null);

  /** True when the panel should be inert (loading or error refresh). */
  readonly disabled = input<boolean>(false);

  /** Emits the next complete CatalogQuery when the user changes a control. */
  readonly filtersChanged = output<CatalogQuery>();

  /** Storage buckets exposed by the documented storage enum, paired with
   *  the facet count so the chip can show "128 GB (3)". Falls back to
   *  the documented enum with `null` counts when no `Facets` is loaded
   *  yet, so the chips are present on the empty first load. */
  readonly storageFacets = computed<readonly StorageBucket[]>(() => {
    const facets = this.facets();
    if (facets === null) {
      return ALLOWED_STORAGE_GB.map((gb) => ({ gb, label: `${String(gb)} GB`, count: null }));
    }
    const out: StorageBucket[] = [];
    for (const entry of facets.storageGb) {
      const bucket = toStorageBucket(entry);
      if (bucket !== null) out.push(bucket);
    }
    return out;
  });

  /** Stock facet count, or null when the latest response carries none. */
  readonly inStockCount = computed<number | null>(() => this.facets()?.inStock ?? null);

  /** 5G facet count, or null when the latest response carries none. */
  readonly fiveGCount = computed<number | null>(() => this.facets()?.is5g ?? null);

  /** Placeholder hint for the min-price input: the lower bound of the
   *  active result set, so the user can see the floor before they type. */
  readonly priceMinHint = computed<string | null>(() => {
    const range = this.facets()?.priceRange;
    return range === undefined ? null : String(range.min.amount);
  });

  /** Placeholder hint for the max-price input: the upper bound. */
  readonly priceMaxHint = computed<string | null>(() => {
    const range = this.facets()?.priceRange;
    return range === undefined ? null : String(range.max.amount);
  });

  /** Brand facets, falling back to an empty list when none are present. */
  readonly brandFacets = computed(() => this.facets()?.brands ?? []);

  /** The brand list collapses to the first five rows behind a
   *  `Még több gyártó` text link. A brand selected beyond the first
   *  five keeps the list expanded so the chip the user picked stays
   *  visible. */
  readonly brandsExpanded = signal(false);

  /** Brands to render: the first five when collapsed, otherwise the
   *  full list. When collapsed but a brand beyond row five is selected,
   *  the list stays open so the chip stays visible. */
  readonly visibleBrandFacets = computed<readonly FacetValue[]>(() => {
    const all = this.brandFacets();
    if (this.brandsExpanded()) return all;
    if (all.length <= 5) return all;
    const selectedBrands = this.value().brands ?? [];
    const hasDeeperSelection = selectedBrands.some((b) => {
      const idx = all.findIndex((f) => f.value === b);
      return idx >= 5;
    });
    if (hasDeeperSelection) return all;
    return all.slice(0, 5);
  });

  /** Whether every brand facet is currently rendered — either because the
   *  user expanded the list, or because a selection beyond row five forces
   *  it open. Drives both the "more" button's `aria-expanded` and its own
   *  label, so the two can never disagree. */
  readonly brandsAllVisible = computed(
    () => this.visibleBrandFacets().length === this.brandFacets().length,
  );

  toggleBrandsExpanded(): void {
    this.brandsExpanded.update((v) => !v);
  }

  /** Colour facets, falling back to an empty list when none are present. */
  readonly colorFacets = computed<readonly ColorFacetValue[]>(() => this.facets()?.colors ?? []);

  // Local drafts for the controls that need an "in progress" copy. Each
  // is a linkedSignal sourced from its applied field plus the "any
  // filter left" flag: typing wins until the applied state changes in a
  // way the draft must follow — the mirrored field itself changing, or
  // every filter being cleared — at which point the draft re-derives
  // instead of holding stale text (see keepDraftUnlessAppliedChanged,
  // the class doc "invalid" note and T27 filter reset).
  readonly minDraft = linkedSignal<DraftSource, string>({
    source: () => {
      const min = this.value().minPrice;
      return { field: min === undefined ? '' : String(min), filtered: this.hasActiveFilters() };
    },
    computation: keepDraftUnlessAppliedChanged,
  });

  readonly maxDraft = linkedSignal<DraftSource, string>({
    source: () => {
      const max = this.value().maxPrice;
      return { field: max === undefined ? '' : String(max), filtered: this.hasActiveFilters() };
    },
    computation: keepDraftUnlessAppliedChanged,
  });

  readonly searchDraft = linkedSignal<DraftSource, string>({
    source: () => ({ field: this.value().q ?? '', filtered: this.hasActiveFilters() }),
    computation: keepDraftUnlessAppliedChanged,
  });

  readonly hasActiveFilters = computed<boolean>(() => {
    const q = this.value();
    if (q.q !== undefined && q.q.length > 0) return true;
    if ((q.brands?.length ?? 0) > 0) return true;
    if ((q.storageGb?.length ?? 0) > 0) return true;
    if ((q.colors?.length ?? 0) > 0) return true;
    if (q.minPrice !== undefined) return true;
    if (q.maxPrice !== undefined) return true;
    if (q.inStock !== undefined) return true;
    if (q.is5g !== undefined) return true;
    if (q.featured === true) return true;
    return false;
  });

  /** Hungarian reason describing the price range problem, or null. */
  readonly priceError = computed<string | null>(() => {
    const min = this.parsePrice(this.minDraft());
    const max = this.parsePrice(this.maxDraft());
    if (min !== null && min < 0) return 'A minimum ár nem lehet negatív.';
    if (max !== null && max < 0) return 'A maximum ár nem lehet negatív.';
    if (min !== null && max !== null && min > max)
      return 'A minimum nem lehet nagyobb a maximum árnál.';
    return null;
  });

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  onSearchInput(event: Event): void {
    if (!isHTMLInputElement(event.target)) return;
    const value = event.target.value;
    this.searchDraft.set(value);
    // Deliberately NOT gated on priceError(): `emit` composes the next
    // query from the APPLIED value, so a rejected price range cannot
    // ride along, and a term the user can read in the box has to reach
    // the URL and the result count (R18).
    this.emit({ q: value.trim().length > 0 ? value.trim() : undefined });
  }

  onMinInput(event: Event): void {
    if (!isHTMLInputElement(event.target)) return;
    const value = event.target.value;
    this.minDraft.set(value);
    if (this.priceError() !== null) return;
    const parsed = this.parsePrice(value);
    this.emit({ minPrice: parsed ?? undefined });
  }

  onMaxInput(event: Event): void {
    if (!isHTMLInputElement(event.target)) return;
    const value = event.target.value;
    this.maxDraft.set(value);
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
    const next = current.includes(bucket)
      ? current.filter((b) => b !== bucket)
      : [...current, bucket];
    this.emit({ storageGb: next.length > 0 ? next : undefined });
  }

  toggleColor(code: string): void {
    const trimmed = code.trim();
    if (trimmed.length === 0) return;
    const current = this.value().colors ?? [];
    const next = current.includes(trimmed)
      ? current.filter((c) => c !== trimmed)
      : [...current, trimmed];
    this.emit({ colors: next.length > 0 ? next : undefined });
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
    // The drafts are linkedSignals keyed on their applied field plus the
    // "any filter left" flag. This emit clears every filter, so once the
    // parent round-trips it each draft re-derives to '' on its own —
    // a draft that was never applied included, which is why no manual
    // clear is needed here (see keepDraftUnlessAppliedChanged).
    this.emit({
      q: undefined,
      brands: undefined,
      storageGb: undefined,
      colors: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      inStock: undefined,
      is5g: undefined,
      featured: undefined,
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

  isColorSelected(code: string): boolean {
    return (this.value().colors ?? []).includes(code);
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

/** Narrow a `FacetValue` from `Facets.storageGb` into a `StorageBucket`,
 *  returning null when the contract publishes a value the documented
 *  enum does not recognise (forward compatibility: a new size that
 *  this build does not render would otherwise be silently skipped). */
function toStorageBucket(entry: FacetValue): StorageBucket | null {
  const raw = Number(entry.value);
  if (!Number.isInteger(raw)) return null;
  if (!isStorageBucket(raw)) return null;
  return { gb: raw, label: entry.label, count: entry.count };
}

// Keep `Sort` and `SORT_MODES` imports live so future sort controls can
// reuse the same enum without re-importing it. The current FilterPanel does
// not expose the sort control — sort lives in the toolbar.
export const _sortMarker: readonly Sort[] = SORT_MODES;
