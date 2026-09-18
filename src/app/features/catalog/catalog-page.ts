import {
  Component,
  computed,
  effect,
  inject,
  signal,
  ElementRef,
  viewChild,
  DestroyRef,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CatalogFacade } from './catalog.facade';
import {
  SORT_MODES,
  serializeCatalogQuery,
  type CatalogQuery,
  type SortMode,
} from './catalog-query';
import { FilterPanel } from './filter-panel';
import { FilterDrawer } from './filter-drawer';
import { ProductCard } from './product-card';

import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';

/**
 * T13 — Catalogue list page (S2).
 *
 * Responsibilities:
 *
 *   - Compose the filter panel / drawer, toolbar, applied chip row,
 *     product grid and pagination around the `CatalogFacade` vm.
 *   - Bind every write to the URL via `Router.navigate({ queryParams,
 *     queryParamsHandling: 'merge' })`. The facade is the canonical
 *     state owner; the URL is its mirror.
 *   - Reflect the router query into the facade on every navigation
 *     (browser back / forward, deep links, manual URL edit).
 *
 * Layout:
 *
 *   - >=1280px: 264px filter sidebar + 3-column grid.
 *   - 1024-1279: sidebar + 2-column grid.
 *   - 640-1023: drawer trigger + 2-column grid.
 *   - <640: drawer trigger + 1 column.
 *
 * The host element carries `data-layout-mode="sidebar|drawer"` so the
 * CSS media queries can hide whichever branch is not in use; both the
 * sidebar and the drawer are mounted so the focus / scroll /
 * background rules of the dialog primitive (R23) are honoured at all
 * viewports.
 */
@Component({
  selector: 'app-catalog-page',
  imports: [
    RouterLink,
    FilterPanel,
    FilterDrawer,
    ProductCard,
    EmptyState,
    ErrorState,
    LoadingState,
  ],
  templateUrl: './catalog-page.html',
  styleUrl: './catalog-page.scss',
})
export class CatalogPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly facade = inject(CatalogFacade);

  private readonly searchEl = viewChild<ElementRef<HTMLInputElement>>('search');
  /** Trigger button the catalog page opens the filter drawer with — passed
   *  back so the drawer can restore focus to it on close (WCAG SC 2.4.3). */
  protected readonly filterTrigger =
    viewChild<ElementRef<HTMLButtonElement>>('filterDrawerTrigger');

  /** Local UI flags that do NOT live in the URL. */
  readonly drawerOpened = signal<boolean>(false);

  /** True while a request is in flight AFTER the first response arrived. */
  readonly isRefreshing = computed<boolean>(() => this.facade.vm().status === 'refreshing');

  /** Snapshot of the current sort option (defaults to 'recommended'). */
  readonly currentSort = computed<SortMode>(() => this.facade.query().sort ?? 'recommended');

  /** Snapshot of the current page size. */
  readonly currentPageSize = computed<12 | 24>(() => this.facade.query().pageSize);

  /** Snapshot of the current page (1-based). */
  readonly currentPage = computed<number>(() => this.facade.query().page);

  /** Total page count, derived from total + pageSize. */
  readonly totalPages = computed<number>(() => {
    const total = this.facade.vm().total;
    const size = this.currentPageSize();
    if (total <= 0) return 1;
    return Math.max(1, Math.ceil(total / size));
  });

  readonly shouldShowPagination = computed<boolean>(
    () => this.facade.vm().total > this.currentPageSize(),
  );

  /** Live, human-readable chip set derived from the canonical query. */
  readonly appliedQuery = computed<{
    readonly appliedChips: readonly AppliedChip[];
  }>(() => ({ appliedChips: buildChips(this.facade.query()) }));

  /** Number of currently applied filters (drives the drawer trigger label). */
  readonly appliedChipCount = computed<number>(() => this.appliedQuery().appliedChips.length);

  /** Sort modes exposed by the documented enum. */
  readonly sortModes: readonly SortMode[] = SORT_MODES;

  readonly resultCountLabel = computed<string>(() => {
    const vm = this.facade.vm();
    if (vm.status === 'loading') return 'Keresés a katalógusban…';
    if (vm.status === 'refreshing') {
      return `Találatok: ${String(vm.total)} (frissítés alatt)`;
    }
    if (vm.total === 0) return 'Nincs találat.';
    return `Találatok: ${String(vm.total)}`;
  });

  constructor() {
    // Mirror the URL query into the facade on every navigation. The
    // facade's own debounce + switchMap pipeline guarantees that a
    // back / forward jump never re-fires the SDK twice for the same
    // canonical state. We subscribe to the route's reactive
    // queryParamMap (not the snapshot) so back / forward, deep links
    // and manual URL edits all reach the facade.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const search = new URLSearchParams();
      params.keys.forEach((key) => {
        for (const v of params.getAll(key)) search.append(key, v);
      });
      this.facade.loadFromParams(search);
    });

    // Mirror the facade back into the URL whenever the canonical
    // query changes (filter writes, sort, page). We use merge so we
    // never drop a sibling param the URL might carry in a different
    // route, and we skip the very first read so we do not bounce.
    let first = true;
    effect(() => {
      const q = this.facade.query();
      if (first) {
        first = false;
        return;
      }
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: serializeForRouter(q),
        queryParamsHandling: 'merge',
        replaceUrl: false,
      });
    });

    // Drive the host data-layout-mode from the current viewport so
    // the CSS can flip between sidebar and drawer.
    this.applyLayoutMode();
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  onFiltersChanged(next: CatalogQuery): void {
    this.facade.setFilters(next);
  }

  onSortChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as SortMode;
    this.facade.setSort(value);
  }

  onPageSizeChanged(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (value === 12 || value === 24) {
      this.facade.setPageSize(value);
    }
  }

  onPageChanged(page: number): void {
    if (page < 1) return;
    this.facade.setPage(page);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.facade.setSearch(value);
  }

  commitSearch(): void {
    // Used by tests to flush a search debounce; no UI surface.
    const el = this.searchEl()?.nativeElement;
    if (el) this.facade.setSearch(el.value);
  }

  onChipRemoved(kind: AppliedChip['kind'], value: string | number | undefined): void {
    switch (kind) {
      case 'q':
        this.facade.setSearch('');
        break;
      case 'brand':
        if (typeof value === 'string') this.facade.toggleBrand(value);
        break;
      case 'storage':
        if (typeof value === 'number') this.facade.toggleStorage(value as 128 | 256 | 512);
        break;
      case 'inStock':
        this.facade.setInStock(undefined);
        break;
      case 'is5g':
        this.facade.setIs5g(undefined);
        break;
      case 'minPrice':
        this.facade.setPriceRange(undefined, this.facade.query().maxPrice);
        break;
      case 'maxPrice':
        this.facade.setPriceRange(this.facade.query().minPrice, undefined);
        break;
      case 'featured':
        this.facade.setFeatured(undefined);
        break;
    }
  }

  onClearAll(): void {
    this.facade.reset();
  }

  onRetry(): void {
    this.facade.retry();
  }

  openDrawer(): void {
    this.drawerOpened.set(true);
  }

  closeDrawer(): void {
    this.drawerOpened.set(false);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  sortLabel(mode: SortMode): string {
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

  /**
   * Toggle the host's data-layout-mode based on the viewport width so
   * the CSS media queries can hide whichever filter mount is unused.
   * Pure read of the actual DOM size — guard against SSR. The listener
   * is removed on destroy so a long-lived SPA cannot accumulate stale
   * references to torn-down components.
   */
  private applyLayoutMode(): void {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 1024px)');
    const apply = (): void => {
      const host: unknown = this.host.nativeElement;
      if (host instanceof HTMLElement) {
        host.dataset['layoutMode'] = mql.matches ? 'sidebar' : 'drawer';
      }
    };
    apply();
    mql.addEventListener('change', apply);
    this.destroyRef.onDestroy(() => {
      mql.removeEventListener('change', apply);
    });
  }
}

interface AppliedChip {
  readonly id: string;
  readonly kind:
    'q' | 'brand' | 'storage' | 'inStock' | 'is5g' | 'minPrice' | 'maxPrice' | 'featured';
  readonly label: string;
  readonly value?: string | number;
}

function buildChips(q: CatalogQuery): readonly AppliedChip[] {
  const chips: AppliedChip[] = [];
  if (q.q !== undefined && q.q.length > 0) {
    chips.push({ id: 'q', kind: 'q', label: `Keresés: „${q.q}”` });
  }
  for (const brand of q.brands ?? []) {
    chips.push({ id: `brand:${brand}`, kind: 'brand', label: brand, value: brand });
  }
  for (const bucket of q.storageGb ?? []) {
    chips.push({
      id: `storage:${String(bucket)}`,
      kind: 'storage',
      label: `${String(bucket)} GB`,
      value: bucket,
    });
  }
  if (q.minPrice !== undefined) {
    chips.push({
      id: 'minPrice',
      kind: 'minPrice',
      label: `Min. ár: ${q.minPrice.toLocaleString('hu-HU')} Ft`,
      value: q.minPrice,
    });
  }
  if (q.maxPrice !== undefined) {
    chips.push({
      id: 'maxPrice',
      kind: 'maxPrice',
      label: `Max. ár: ${q.maxPrice.toLocaleString('hu-HU')} Ft`,
      value: q.maxPrice,
    });
  }
  if (q.inStock === true) {
    chips.push({ id: 'inStock', kind: 'inStock', label: 'Csak raktáron' });
  }
  if (q.is5g === true) {
    chips.push({ id: 'is5g', kind: 'is5g', label: 'Csak 5G' });
  }
  if (q.featured === true) {
    chips.push({ id: 'featured', kind: 'featured', label: 'Kiemelt termékek' });
  }
  return chips;
}

/**
 * Convert a CatalogQuery into the bare Router `queryParams` argument.
 * Delegates to `serializeCatalogQuery` so the URL the facade emits and
 * the URL the router writes stay byte-for-byte consistent.
 */
function serializeForRouter(q: CatalogQuery): Record<string, string | string[] | null> {
  const params = serializeCatalogQuery(q);
  const out: Record<string, string | string[] | null> = {};
  for (const key of new Set<string>(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length > 1 ? all : (all[0] ?? null);
  }
  return out;
}
