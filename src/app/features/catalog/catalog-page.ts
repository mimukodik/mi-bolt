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
  buildChips,
  CATALOG_QUERY_KEYS,
  isStorageBucket,
  serializeCatalogQuery,
  type CatalogQuery,
  type Sort,
} from './catalog-query';
import { FilterPanel } from './filter-panel';
import { FilterDrawer } from './filter-drawer';
import { ProductCard } from './product-card';
import { CatalogToolbar } from './catalog-toolbar';
import { AppliedFilters } from './applied-filters';
import { Pagination } from './pagination';

import { AsyncContent } from '../../shared/ui/async-content/async-content';
import { Button } from '../../shared/ui/button/button';
import type { AsyncStatus } from '../../shared/types/async-status';
import type { UiProblem } from '../../shared/types/ui-problem';
import type { FilterIdentity } from '../../shared/types/filter-identity';

/**
 * T13 — Catalogue list page (S2).
 *
 * Responsibilities:
 *
 *   - Compose the toolbar, applied-filter chips, async grid content and
 *     pagination — `FIX-60` extracted the four into
 *     `CatalogToolbar`, `AppliedFilters`, `AsyncContent` and
 *     `Pagination` — around the filter panel / drawer and the
 *     `CatalogFacade` vm.
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
    CatalogToolbar,
    AppliedFilters,
    AsyncContent,
    Pagination,
    Button,
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
   *  back so the drawer can restore focus to it on close (WCAG SC 2.4.3).
   *  The button itself now lives in `CatalogToolbar`'s template, which
   *  exposes it through `filterTriggerEl()` rather than through the
   *  declared input/output surface `components.md:371` names. */
  private readonly toolbar = viewChild(CatalogToolbar);
  protected readonly filterTrigger = computed<HTMLElement | null>(
    () => this.toolbar()?.filterTriggerEl() ?? null,
  );

  /**
  Local UI flags that do NOT live in the URL.
  */
  readonly drawerOpened = signal<boolean>(false);

  /** True while the filter, sort, page-size and pagination controls are
   *  inert — the first load only, before there is anything to filter.
   *
   *  It is deliberately NOT bound to `refreshing`. Every control in
   *  this page puts the facade into `refreshing` the instant it is
   *  touched, so binding `disabled` to that status disables the very
   *  control the user is operating: the browser then runs the
   *  unfocusing steps on it, focus falls to `<body>`, and every
   *  keystroke after the first one is dropped on the floor (FIX-25).
   *  What the disabled state was there for — "a slow network can't
   *  accumulate stale draft clicks" — is already guaranteed one layer
   *  down and does not need the DOM: `CatalogFacade` sets `querySignal`
   *  synchronously before each request, so a second intent composes
   *  onto the first rather than onto stale state. */
  readonly controlsDisabled = computed<boolean>(() => this.facade.vm().status === 'loading');

  /** `AsyncContent`'s `status`, mapped from `CatalogStatus` at the call
   *  site — `'refreshing'` becomes `'loading'`, distinguished from a
   *  first load by `hasPrevious()`. */
  readonly asyncStatus = computed<AsyncStatus>(() => {
    const status = this.facade.vm().status;
    return status === 'refreshing' ? 'loading' : status;
  });

  /** True while a request is in flight that has previous usable data to
   *  keep showing (`AsyncContent`'s "previous usable data can remain
   *  under explicit refresh warning"). */
  readonly hasPrevious = computed<boolean>(() => this.facade.vm().status === 'refreshing');

  /** `AsyncContent`'s `problem` — the facade only ever surfaces a plain
   *  message string, so it is adapted into the documented `UiProblem`
   *  shape at the call site, the same way `asyncStatus` adapts the
   *  status. */
  readonly problem = computed<UiProblem | null>(() => {
    const message = this.facade.vm().error;
    return message === null
      ? null
      : { code: 'catalog-error', message, fieldErrors: [], retryable: true };
  });

  /** `CatalogToolbar`'s `status` — the toolbar's own wording branches on
   *  this, so the toolbar needs more than a loading/not-loading
   *  distinction: `controlsDisabled` still wins and yields `'loading'`,
   *  `'error'` passes through so the counter can say so too
   *  (otherwise it falls through to the zero-results test and reports
   *  an empty result set at the moment a screen-reader user pressed
   *  retry), and every remaining status collapses onto `'success'`. */
  readonly toolbarStatus = computed<AsyncStatus>(() => {
    const status = this.facade.vm().status;
    if (this.controlsDisabled()) return 'loading';
    return status === 'error' ? 'error' : 'success';
  });

  /**
  Snapshot of the current sort option (defaults to 'recommended').
  */
  readonly currentSort = computed<Sort>(() => this.facade.query().sort ?? 'recommended');

  /**
  Snapshot of the current page size.
  */
  readonly currentPageSize = computed<12 | 24>(() => this.facade.query().pageSize);

  /**
  Snapshot of the current page (1-based).
  */
  readonly currentPage = computed<number>(() => this.facade.query().page);

  readonly shouldShowPagination = computed<boolean>(
    () => this.facade.vm().total > this.currentPageSize(),
  );

  /** `CatalogToolbar`'s `appliedCount` — the mobile filter trigger's
   *  selected-count cue, derived the same way `AppliedFilters` derives
   *  its own chip row. */
  readonly appliedChipCount = computed<number>(() => buildChips(this.facade.query()).length);

  constructor() {
    // Mirror the URL query into the facade on every navigation. The
    // facade's own debounce + switchMap pipeline guarantees that a
    // back / forward jump never re-fires the SDK twice for the same
    // canonical state. We subscribe to the route's reactive
    // queryParamMap (not the snapshot) so back / forward, deep links
    // and manual URL edits all reach the facade.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((parameters) => {
      const search = new URLSearchParams();
      for (const key of parameters.keys) {
        for (const v of parameters.getAll(key)) search.append(key, v);
      }
      this.facade.loadFromParams(search);
    });

    // Mirror the facade back into the URL whenever the canonical
    // query changes (filter writes, sort, page). We use merge so we
    // never drop a sibling param the URL might carry in a different
    // route, and we skip the very first read so we do not bounce.
    let isFirst = true;
    effect(() => {
      const q = this.facade.query();
      if (isFirst) {
        isFirst = false;
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

    // Reflect the drawer's open state onto the toolbar trigger's
    // aria-expanded (WCAG 4.1.2 — a disclosure control must say
    // whether what it discloses is open), through the same
    // non-input/output channel `filterTrigger` above reads in the
    // other direction.
    effect(() => {
      this.toolbar()?.drawerExpanded.set(this.drawerOpened());
    });
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  onFiltersChanged(next: CatalogQuery): void {
    this.facade.setFilters(next);
  }

  onSortChanged(value: Sort): void {
    this.facade.setSort(value);
  }

  onPageSizeChanged(value: 12 | 24): void {
    this.facade.setPageSize(value);
  }

  onPageChanged(page: number): void {
    if (page < 1) return;
    this.facade.setPage(page);
  }

  onChipRemoved(identity: FilterIdentity): void {
    this.focusResultCount();
    switch (identity.name) {
      case 'q': {
        this.facade.setSearch('');
        break;
      }
      case 'brands': {
        if (typeof identity.value === 'string') this.facade.toggleBrand(identity.value);
        break;
      }
      case 'storageGb': {
        if (typeof identity.value === 'number' && isStorageBucket(identity.value)) {
          this.facade.toggleStorage(identity.value);
        }
        break;
      }
      case 'inStock': {
        this.facade.setInStock(undefined);
        break;
      }
      case 'is5g': {
        this.facade.setIs5g(undefined);
        break;
      }
      case 'minPrice': {
        this.facade.setPriceRange(undefined, this.facade.query().maxPrice);
        break;
      }
      case 'maxPrice': {
        this.facade.setPriceRange(this.facade.query().minPrice, undefined);
        break;
      }
      case 'featured': {
        this.facade.setFeatured(undefined);
        break;
      }
    }
  }

  onClearAll(): void {
    this.focusResultCount();
    this.facade.reset();
  }

  onRetry(): void {
    this.focusResultCount();
    this.facade.retry();
  }

  /** Hand focus to the live results counter. Used by the three handlers
   *  that remove the control the user just activated from the DOM —
   *  removing a filter chip, clearing all filters and the empty-state
   *  reset action share `onClearAll`, and retrying from the error state
   *  destroys the retry button under the user's hands — so a keyboard
   *  user is not left with focus on `<body>` and has to tab from the
   *  top of the document again (WCAG 2.4.3, 2.4.7). The counter is
   *  rendered unconditionally and is never destroyed, so the call is
   *  synchronous and moves focus off the doomed button before the
   *  re-render removes it — the same reason `Pagination.onBoundary`
   *  works synchronously, stated in its own docstring. The user chose
   *  this target on 2026-09-20 because it is the result of the action
   *  and one target serves all five cases. This is the DOM-removal
   *  arm of the same problem `Pagination.onBoundary` answers for the
   *  disabling arm. */
  private focusResultCount(): void {
    this.toolbar()?.resultCountEl()?.focus();
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

  /**
   * Toggle the host's data-layout-mode based on the viewport width so
   * the CSS media queries can hide whichever filter mount is unused.
   * Pure read of the actual DOM size — guard against SSR. The listener
   * is removed on destroy so a long-lived SPA cannot accumulate stale
   * references to torn-down components.
   */
  private applyLayoutMode(): void {
    if (typeof window === 'undefined') return;
    const mql = globalThis.matchMedia('(min-width: 1024px)');
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
  const parameters = serializeCatalogQuery(q);
  const out: Record<string, string | string[] | null> = {};
  for (const key of CATALOG_QUERY_KEYS) {
    const all = parameters.getAll(key);
    out[key] = all.length === 0 ? null : all.length > 1 ? all : (all[0] ?? null);
  }
  return out;
}
