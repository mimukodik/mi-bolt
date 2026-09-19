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
  CATALOG_QUERY_KEYS,
  SORT_MODES,
  serializeCatalogQuery,
  type CatalogQuery,
  type Sort,
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

  /** Trigger button the catalog page opens the filter drawer with — passed
   *  back so the drawer can restore focus to it on close (WCAG SC 2.4.3). */
  protected readonly filterTrigger =
    viewChild<ElementRef<HTMLButtonElement>>('filterDrawerTrigger');

  /** The `x / y` indicator between the two pagination buttons — the
   *  focus target a boundary click hands focus to. See
   *  `handOffPaginationFocus()` for why it, and not a button. */
  private readonly pageIndicator = viewChild<ElementRef<HTMLSpanElement>>('pageIndicator');

  /** Local UI flags that do NOT live in the URL. */
  readonly drawerOpened = signal<boolean>(false);

  /** True while a request is in flight AFTER the first response arrived. */
  readonly isRefreshing = computed<boolean>(() => this.facade.vm().status === 'refreshing');

  /**
   * True while the filter, sort, page-size and pagination controls are
   * inert — the first load only, before there is anything to filter.
   *
   * It is deliberately NOT `isRefreshing()`. Every control in this page
   * puts the facade into `refreshing` the instant it is touched, so
   * binding `disabled` to that status disables the very control the
   * user is operating: the browser then runs the unfocusing steps on
   * it, focus falls to `<body>`, and every keystroke after the first
   * one is dropped on the floor. Typing `150000` into the min-price box
   * left `1` in it.
   *
   * What the disabled state was there for — "a slow network can't
   * accumulate stale draft clicks" (see `FilterPanel`) — is already
   * guaranteed one layer down and does not need the DOM: `CatalogFacade`
   * sets `querySignal` synchronously before each request, so a second
   * intent composes onto the first rather than onto stale state, and
   * its `switchMap` unsubscribes the superseded request so a slow
   * answer can never overwrite a newer one.
   */
  readonly controlsDisabled = computed<boolean>(() => this.facade.vm().status === 'loading');

  /** Snapshot of the current sort option (defaults to 'recommended'). */
  readonly currentSort = computed<Sort>(() => this.facade.query().sort ?? 'recommended');

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
  readonly sortModes: readonly Sort[] = SORT_MODES;

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
    const value = (event.target as HTMLSelectElement).value as Sort;
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
    this.handOffPaginationFocus(page);
    this.facade.setPage(page);
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

  /**
   * Hand focus to the page indicator when the requested page is a
   * boundary — that is, when the pagination button the click was made
   * on is about to disable itself.
   *
   * This is the FIX-25 symptom with a different cause, and the cause
   * is why the cure is different too. Those controls were disabled by
   * an in-flight request, which was simply wrong and was deleted.
   * A pagination button at a boundary is disabled because page 1 has
   * no previous page and the last page has no next one, which is
   * correct, is the `disabled` the design skill's component table
   * asks for ("Native disabled behavior"), and stays. What was wrong
   * is only where focus went afterwards: a browser answers a focused
   * element that stops being a focusable area by handing focus back
   * to the viewport, so a keyboard user who paginated to the last
   * page was dropped on `<body>` and had to tab from the top of the
   * document again (WCAG 2.4.3 Focus Order, 2.4.7 Focus Visible).
   * The same skill requires both halves — "Native disabled behavior"
   * and "active focus must not be lost" — and only the second was
   * being broken.
   *
   * The move runs here, before `setPage`, rather than after the
   * re-render: focus leaves the button before Angular writes
   * `disabled` to it, so the browser never runs its unfocusing steps
   * at all and focus is not lost for even one frame.
   *
   * The target is the `x / y` indicator rather than the sibling
   * button for two reasons. It is the one part of the widget that no
   * page can disable — in the "last page, pressing Előző" direction
   * the sibling is still disabled at the instant of the click, and
   * `focus()` on a disabled button does nothing — and activating it
   * cannot undo the navigation the user just made, which repeatedly
   * pressing Enter on a sibling button would. It reads out the state
   * the click produced ("Oldal: 2 / 2", `aria-current="page"`), and
   * it already carries the `.page:focus-visible` ring, so the focus
   * stays visible without a new style.
   *
   * Nothing is taken from the user here. `onPageChanged` is reachable
   * only from those two buttons, so the focus this moves is the focus
   * the click itself put on the button that is about to die — the
   * unclaimed state `RouteFocusService.focusIsUnclaimed()` describes,
   * one moment before the browser produces it. A page change that
   * reaches no boundary returns without touching focus, which is what
   * keeps this off the WCAG 3.2.2 (On Input) side of the line.
   */
  private handOffPaginationFocus(target: number): void {
    // The template disables `pagination-prev` at page 1 and
    // `pagination-next` at the last page; between them both stay live.
    if (target > 1 && target < this.totalPages()) return;
    this.pageIndicator()?.nativeElement.focus();
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
 * the URL the router writes stay byte-for-byte consistent. Every
 * canonical key is emitted explicitly — `null` for a key the codec
 * omitted — because `queryParamsHandling: 'merge'` only overwrites the
 * keys it is given and only removes a key set explicitly to `null`; a
 * key left out of this object would survive a reset undisturbed.
 */
function serializeForRouter(q: CatalogQuery): Record<string, string | string[] | null> {
  const params = serializeCatalogQuery(q);
  const out: Record<string, string | string[] | null> = {};
  for (const key of CATALOG_QUERY_KEYS) {
    const all = params.getAll(key);
    out[key] = all.length === 0 ? null : all.length > 1 ? all : (all[0] ?? null);
  }
  return out;
}
