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
  template: `
    <section class="catalog flex flex-col gap-7 mx-auto p-6" data-layout-mode="sidebar">
      <header class="heading flex flex-col gap-2">
        <nav class="breadcrumbs flex gap-2 items-center" aria-label="Navigáció">
          <a routerLink="/" class="breadcrumb no-underline">Főoldal</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <span class="breadcrumb is-current" aria-current="page">Mobiltelefonok</span>
        </nav>
        <h1 class="title m-0">Mobiltelefonok</h1>
        <p class="lede m-0 max-w-prose">
          A teljes demó katalógus 16 készülékkel — szűrj, rendezz, lapozz a kanonikus URL-en
          keresztül.
        </p>
      </header>

      <div class="layout gap-6">
        <aside class="sidebar hidden lg:block" data-testid="filter-sidebar">
          <app-filter-panel
            [value]="facade.query()"
            [facets]="facade.vm().facets"
            [disabled]="isRefreshing()"
            (filtersChanged)="onFiltersChanged($event)"
          ></app-filter-panel>
        </aside>

        <div class="results flex flex-col gap-5 min-w-0">
          <div class="toolbar flex flex-wrap items-center justify-between gap-3">
            <div class="result-count" data-testid="result-count">
              {{ resultCountLabel() }}
            </div>
            <div class="toolbar__controls flex items-center gap-3 flex-wrap">
              <button
                type="button"
                class="trigger hidden lg:inline-flex items-center min-h-10 px-4 rounded font-medium cursor-pointer"
                data-testid="filter-trigger"
                #filterDrawerTrigger
                (click)="openDrawer()"
                [attr.aria-expanded]="drawerOpened() ? 'true' : 'false'"
                [attr.aria-controls]="'filter-drawer'"
              >
                Szűrők{{ appliedChipCount() > 0 ? ' (' + appliedChipCount() + ')' : '' }}
              </button>
              <label class="sort inline-flex items-center gap-2">
                <span class="sort__label">Rendezés</span>
                <select
                  class="select min-h-10 px-3 rounded font-inherit cursor-pointer"
                  data-testid="catalog-sort"
                  [value]="currentSort()"
                  [disabled]="isRefreshing()"
                  (change)="onSortChanged($event)"
                >
                  @for (mode of sortModes; track mode) {
                    <option [value]="mode">{{ sortLabel(mode) }}</option>
                  }
                </select>
              </label>
              <label class="page-size inline-flex items-center gap-2">
                <span class="sort__label">Oldalméret</span>
                <select
                  class="select min-h-10 px-3 rounded font-inherit cursor-pointer"
                  data-testid="catalog-page-size"
                  [value]="currentPageSize()"
                  [disabled]="isRefreshing()"
                  (change)="onPageSizeChanged($event)"
                >
                  <option value="12">12 / oldal</option>
                  <option value="24">24 / oldal</option>
                </select>
              </label>
            </div>
          </div>

          @if (appliedQuery().appliedChips.length > 0) {
            <div class="chips flex flex-wrap gap-2 items-center" data-testid="applied-filters">
              @for (chip of appliedQuery().appliedChips; track chip.id) {
                <span
                  class="chip inline-flex items-center gap-2 px-2 rounded-full leading-snug"
                  [attr.data-testid]="'applied-chip'"
                >
                  <span class="chip__label">{{ chip.label }}</span>
                  <button
                    type="button"
                    class="chip__remove bg-transparent border-0 cursor-pointer px-1 min-h-10 leading-none"
                    [attr.aria-label]="'Szűrő eltávolítása: ' + chip.label"
                    [attr.data-testid]="'applied-chip-remove-' + chip.kind"
                    (click)="onChipRemoved(chip.kind, chip.value)"
                  >
                    ×
                  </button>
                </span>
              }
              <button
                type="button"
                class="chip-clear bg-transparent border-0 font-inherit cursor-pointer px-2 py-1 min-h-10"
                data-testid="applied-filters-clear"
                (click)="onClearAll()"
              >
                Összes szűrő törlése
              </button>
            </div>
          }

          <div
            class="grid gap-5"
            [class.grid--refreshing]="isRefreshing() && facade.vm().items.length > 0"
            data-testid="catalog-grid"
          >
            @switch (facade.vm().status) {
              @case ('loading') {
                <div
                  class="state state--loading col-span-full flex items-center justify-center p-6 rounded min-h-60"
                  data-testid="catalog-loading"
                >
                  <app-loading-state variant="card" label="Katalógus betöltése"></app-loading-state>
                </div>
              }
              @case ('refreshing') {
                @if (facade.vm().items.length > 0) {
                  @for (item of facade.vm().items; track item.id) {
                    <app-product-card [product]="item"></app-product-card>
                  }
                } @else {
                  <div
                    class="state state--loading col-span-full flex items-center justify-center p-6 rounded min-h-60"
                  >
                    <app-loading-state
                      variant="card"
                      label="Katalógus frissítése"
                    ></app-loading-state>
                  </div>
                }
              }
              @case ('empty') {
                <div
                  class="state state--empty col-span-full flex items-center justify-center p-6 rounded min-h-60"
                  data-testid="catalog-empty"
                >
                  <app-empty-state
                    title="Nincs a szűrőknek megfelelő készülék."
                    message="Próbáld meg kevesebb szűrővel, vagy töröld az aktív szűrőket."
                    actionLabel="Szűrők törlése"
                    actionVariant="primary"
                    (actionRequested)="onClearAll()"
                  >
                    <span data-testid="empty-reset" hidden></span>
                  </app-empty-state>
                </div>
              }
              @case ('error') {
                <div
                  class="state state--error col-span-full flex items-center justify-center p-6 rounded min-h-60"
                  data-testid="catalog-error"
                >
                  <app-error-state
                    title="Nem sikerült betölteni a katalógust."
                    [message]="
                      facade.vm().error ?? 'Ismeretlen hiba a katalógus lekérdezése közben.'
                    "
                    [pending]="isRefreshing()"
                    [preserving]="true"
                    (retryRequested)="onRetry()"
                  >
                    <span data-testid="error-retry" hidden></span>
                  </app-error-state>
                </div>
              }
              @default {
                @for (item of facade.vm().items; track item.id) {
                  <app-product-card [product]="item"></app-product-card>
                }
              }
            }
          </div>

          @if (shouldShowPagination()) {
            <nav
              class="pagination flex items-center justify-center gap-3 pt-4"
              data-testid="catalog-pagination"
              aria-label="Lapozás"
            >
              <button
                type="button"
                class="page min-h-10 min-w-10 px-4 rounded font-inherit cursor-pointer"
                data-testid="pagination-prev"
                [disabled]="currentPage() <= 1 || isRefreshing()"
                (click)="onPageChanged(currentPage() - 1)"
              >
                Előző
              </button>
              <span class="page page--current font-bold cursor-default" aria-current="page"
                >{{ currentPage() }} / {{ totalPages() }}</span
              >
              <button
                type="button"
                class="page min-h-10 min-w-10 px-4 rounded font-inherit cursor-pointer"
                data-testid="pagination-next"
                [disabled]="currentPage() >= totalPages() || isRefreshing()"
                (click)="onPageChanged(currentPage() + 1)"
              >
                Következő
              </button>
            </nav>
          }
        </div>
      </div>

      <app-filter-drawer
        id="filter-drawer"
        [applied]="facade.query()"
        [facets]="facade.vm().facets"
        [opened]="drawerOpened()"
        [disabled]="isRefreshing()"
        [restoreEl]="filterTrigger()?.nativeElement ?? null"
        (filtersChanged)="onFiltersChanged($event)"
        (closed)="closeDrawer()"
      ></app-filter-drawer>

      <input
        #search
        type="search"
        class="sr-only absolute w-px h-px overflow-hidden"
        data-testid="catalog-search"
        [value]="facade.query().q ?? ''"
        (input)="onSearchInput($event)"
      />
      <button
        #searchCommit
        type="button"
        class="sr-only absolute w-px h-px overflow-hidden"
        data-testid="search-commit"
        (click)="commitSearch()"
      >
        commit
      </button>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        background: var(--color-surface-light);
        color: var(--color-text-primary);
      }

      .catalog {
        display: flex;
        flex-direction: column;
        gap: var(--space-7);
        max-width: var(--layout-container-max);
        margin: 0 auto;
        padding: var(--space-6) var(--space-4);
      }

      @media (min-width: 1024px) {
        .catalog {
          padding: var(--space-7) var(--layout-gutter-desktop);
        }
      }

      .heading {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .breadcrumbs {
        display: flex;
        gap: var(--space-2);
        align-items: center;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .breadcrumb {
        color: var(--color-text-secondary);
        text-decoration: none;
      }

      .breadcrumb:hover,
      .breadcrumb:focus-visible {
        color: var(--color-brand-ink);
        text-decoration: underline;
      }

      .breadcrumb.is-current {
        color: var(--color-text-primary);
      }

      .breadcrumb__sep {
        color: var(--color-text-secondary);
      }

      .title {
        margin: 0;
        font-size: var(--type-page-title-mobile);
        line-height: var(--line-height-heading);
      }

      @media (min-width: 1024px) {
        .title {
          font-size: var(--type-page-title);
        }
      }

      .lede {
        margin: 0;
        font-size: var(--type-body);
        color: var(--color-text-secondary);
        line-height: var(--line-height-body);
        max-width: 60ch;
      }

      .layout {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-6);
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(1, minmax(0, 1fr));
        gap: var(--space-5);
        min-height: 240px;
      }

      .grid--refreshing {
        opacity: 0.85;
      }

      @media (min-width: 640px) {
        .grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (min-width: 1024px) {
        .layout {
          grid-template-columns: 264px 1fr;
          gap: var(--space-7);
        }
      }

      @media (min-width: 1280px) {
        .grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      .sidebar {
        display: block;
      }

      @media (max-width: 1023px) {
        .sidebar {
          display: none;
        }
      }

      .results {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
        min-width: 0;
      }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }

      .toolbar__controls {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-wrap: wrap;
      }

      .result-count {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .trigger {
        display: none;
        min-height: var(--size-control);
        padding: 0 var(--space-4);
        border: 1px solid var(--color-brand-ink);
        border-radius: var(--radius-control);
        background: var(--color-surface-light);
        color: var(--color-brand-ink);
        font-family: inherit;
        font-size: var(--type-body);
        font-weight: var(--weight-medium);
        cursor: pointer;
      }

      @media (max-width: 1023px) {
        .trigger {
          display: inline-flex;
          align-items: center;
        }
      }

      .trigger:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .sort,
      .page-size {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .sort__label {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .select {
        min-height: var(--size-control);
        padding: 0 var(--space-3);
        border: 1px solid var(--color-border-control);
        border-radius: var(--radius-control);
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: var(--type-body);
        cursor: pointer;
      }

      .select:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        align-items: center;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: 0 var(--space-2);
        border: 1px solid var(--color-brand-ink);
        border-radius: var(--radius-badge);
        background: var(--color-brand-accent-soft);
        color: var(--color-brand-ink);
        font-size: var(--type-helper);
        line-height: 1.4;
      }

      .chip__remove {
        background: transparent;
        border: 0;
        color: var(--color-brand-ink);
        cursor: pointer;
        font-size: 1rem;
        padding: 0 var(--space-1);
        min-height: var(--size-control);
        line-height: 1;
      }

      .chip__remove:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .chip-clear {
        background: transparent;
        border: 0;
        color: var(--color-brand-ink);
        font-family: inherit;
        font-size: var(--type-helper);
        cursor: pointer;
        padding: var(--space-1) var(--space-2);
        min-height: var(--size-control);
      }

      .chip-clear:hover,
      .chip-clear:focus-visible {
        text-decoration: underline;
      }

      .chip-clear:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
        border-radius: var(--radius-control);
      }

      .state {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-6);
        background: var(--color-surface-section);
        border-radius: var(--radius-card);
        min-height: 240px;
      }

      .state--error {
        background: var(--color-surface-light);
        border: 1px solid var(--color-status-error);
      }

      .pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-3);
        padding-top: var(--space-4);
      }

      .page {
        min-height: var(--size-control);
        min-width: var(--size-control);
        padding: 0 var(--space-4);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-control);
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: var(--type-body);
        cursor: pointer;
      }

      .page:disabled {
        color: var(--color-text-secondary);
        cursor: not-allowed;
      }

      .page:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .page--current {
        background: var(--color-brand-accent-soft);
        color: var(--color-brand-ink);
        font-weight: var(--weight-bold);
        border-color: var(--color-brand-ink);
        cursor: default;
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
