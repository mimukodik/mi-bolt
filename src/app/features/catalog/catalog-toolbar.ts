import { Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';

import { SORT_MODES, type Sort } from './catalog-query';
import type { AsyncStatus } from '../../shared/types/async-status';

/** Type guard for a `<select>`'s raw string value against the
 *  documented sort modes — avoids an `as Sort` assertion. */
function isSortMode(value: string): value is Sort {
  return (SORT_MODES as readonly string[]).includes(value);
}

/**
 * `CatalogToolbar` — `docs/spec/components.md:371`.
 *
 * Live result count, sort and page-size controls, and the mobile filter
 * trigger with its selected-count cue. Extracted out of `CatalogPage`
 * by `FIX-60`.
 *
 * `appliedCount` is the one input beyond the entry's declared surface,
 * required by the entry's own Functions line ("mobile filter trigger
 * with selected-count cue"): a presentation component cannot compute a
 * count it is forbidden to own the filter state for, so the count
 * arrives as an input.
 */
@Component({
  selector: 'app-catalog-toolbar',
  templateUrl: './catalog-toolbar.html',
  styleUrl: './catalog-toolbar.scss',
})
export class CatalogToolbar {
  readonly total = input.required<number>();
  readonly sort = input.required<Sort>();
  readonly pageSize = input.required<12 | 24>();
  readonly status = input.required<AsyncStatus>();
  readonly appliedCount = input<number>(0);

  readonly sortChanged = output<Sort>();
  readonly pageSizeChanged = output<12 | 24>();
  readonly openFilters = output();

  readonly sortModes: readonly Sort[] = SORT_MODES;

  /** Live result count label. `status()` is `AsyncStatus`, which has no
   *  `refreshing` member — the caller maps `CatalogStatus`'s
   *  `'refreshing'` onto `'loading'` at the call site (see
   *  `AsyncContent`), so the refresh-specific wording the pre-extraction
   *  label carried ("… (frissítés alatt)") is not reproducible from this
   *  input alone; the doc's own item 2 asks for "a computed over
   *  total() and status()", so this is the deliberate result. */
  readonly resultCountLabel = computed<string>(() => {
    if (this.status() === 'loading') return 'Keresés a katalógusban…';
    if (this.total() === 0) return 'Nincs találat.';
    return `Találatok: ${String(this.total())}`;
  });

  /** The filter-trigger button, exposed so `CatalogPage` can pass it as
   *  `FilterDrawer.restoreEl` — WCAG focus restoration back onto the
   *  control that opened the drawer. Not part of the declared
   *  input/output surface `components.md:371` names; a plain public
   *  property a parent can read is not one of those two things. */
  private readonly filterTriggerRef = viewChild<ElementRef<HTMLButtonElement>>('filterTrigger');
  readonly filterTriggerEl = computed<HTMLButtonElement | null>(
    () => this.filterTriggerRef()?.nativeElement ?? null,
  );

  /** Whether the drawer this trigger opens is currently open, pushed in
   *  by `CatalogPage` and reflected onto the trigger's
   *  `aria-expanded`/`aria-controls` (WCAG 4.1.2: a disclosure control
   *  must say what it discloses and whether it is open). A plain
   *  writable signal, not a declared input, for the same reason
   *  `filterTriggerEl()` above is a plain public property: it is
   *  neither an input nor an output, so `components.md:371`'s declared
   *  surface and FIX-60-AC02's one-addition limit (`appliedCount`) are
   *  both unaffected. */
  readonly drawerExpanded = signal(false);

  sortLabel(mode: Sort): string {
    switch (mode) {
      case 'recommended':
        return 'Ajánlott sorrend';
      case 'price_asc':
        return 'Ár szerint növekvő';
      case 'price_desc':
        return 'Ár szerint csökkenő';
      case 'name_asc':
        return 'Név szerint';
    }
  }

  onSortChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (isSortMode(target.value)) {
      this.sortChanged.emit(target.value);
    }
  }

  onPageSizeChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = Number(target.value);
    if (value === 12 || value === 24) {
      this.pageSizeChanged.emit(value);
    }
  }
}
