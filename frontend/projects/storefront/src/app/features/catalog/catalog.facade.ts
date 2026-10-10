/**
 * T12 — root-provided signal facade for the catalogue page.
 *
 * The URL query string is the single source of truth for filters,
 * page, page size and sort. The page pushes URL changes here via
 * `loadFromParams(url)`; the page also subscribes to `query()` (or
 * `vm()`) and writes the resulting canonical URL back into the
 * router. Browser back / forward and direct deep links therefore
 * round-trip through `loadFromParams` and never diverge from the
 * facade's internal state.
 *
 * The read path is a per-facade controller built on RxJS:
 *
 *   searchInput$ → debounceTime(300) → distinctUntilChanged → ⤵
 *                                                   scan-with-current
 *   queryChange$ (immediate filter/sort/page changes) ────────────→ ⤵
 *                                                   distinctUntilChanged
 *                                                   tap(set querySignal)
 *                                                   switchMap(api.list)
 *                                                   tap(set result|error)
 *
 * `switchMap` ensures a slow old response never overwrites a newer
 * query (the in-flight observable is unsubscribed on every new
 * emission), and `distinctUntilChanged` guarantees a no-op update
 * (the same query emitted twice in a row) never re-fires the API.
 *
 * The `vm` signal folds the in-flight, result and error signals into
 * the five documented states — `loading`, `refreshing`, `success`,
 * `empty`, `error` — while preserving the last known items, total
 * and facets across every transition that does not have a fresh
 * payload of its own.
 */

import { computed, DestroyRef, inject, Service, signal } from '@angular/core';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  merge,
  of,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { PriceRefresh } from '../../shared/utils/price-refresh';
import { Api } from '@mi-bolt/api/api';
import { listProducts } from '@mi-bolt/api/fn/catalog/list-products';
import type { CatalogItem } from '@mi-bolt/api/models/catalog-item';
import type { ColorFacetValue } from '@mi-bolt/api/models/color-facet-value';
import type { FacetValue } from '@mi-bolt/api/models/facet-value';
import type { Facets } from '@mi-bolt/api/models/facets';
import {
  DEFAULT_CATALOG_QUERY,
  parseCatalogQuery,
  SEARCH_DEBOUNCE_MS,
  serializeCatalogQuery,
  type CatalogQuery,
  type Sort,
} from './catalog-query';

/** Status of the most recent `vm` snapshot. */
export type CatalogStatus = 'loading' | 'refreshing' | 'success' | 'empty' | 'error';

/** A point-in-time view of the catalogue, derived from the live signals. */
export interface CatalogVm {
  readonly status: CatalogStatus;
  readonly query: CatalogQuery;
  readonly items: readonly CatalogItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: 12 | 24;
  /** The full `Facets` from the latest successful response, or `null`
   *  until the first response lands. The page renders every facet the
   *  contract exposes from this object directly. */
  readonly facets: Facets | null;
  readonly error: string | null;
}

/** Coarse shape of the catalogue response — only what the VM exposes. */
interface CatalogResult {
  readonly items: readonly CatalogItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: 12 | 24;
  readonly facets: Facets;
}

/** Every brand and colour value the facade has seen since it was
 *  constructed, in first-seen order, each carrying the count of the
 *  latest response or 0 (MIM-228). */
export interface FacetUniverse {
  readonly brands: readonly FacetValue[];
  readonly colors: readonly ColorFacetValue[];
}

/**
 * Two queries are equal when every documented field carries the same
 * value. Field-level comparison avoids the `serializeCatalogQuery`
 * allocation cost that the canonical-string approach paid on every
 * keystroke through the debounced search pipeline.
 */
function queryEquals(a: CatalogQuery, b: CatalogQuery): boolean {
  if (a.q !== b.q) return false;
  if (!arrayShallowEqual(a.brands, b.brands)) return false;
  if (!arrayShallowEqual(a.storageGb, b.storageGb)) return false;
  if (!arrayShallowEqual(a.colors, b.colors)) return false;
  if (a.minPrice !== b.minPrice) return false;
  if (a.maxPrice !== b.maxPrice) return false;
  if (a.inStock !== b.inStock) return false;
  if (a.is5g !== b.is5g) return false;
  if (a.featured !== b.featured) return false;
  if (a.activePromotion !== b.activePromotion) return false;
  if (a.sort !== b.sort) return false;
  if (a.page !== b.page) return false;
  if (a.pageSize !== b.pageSize) return false;
  return true;
}

function arrayShallowEqual<T>(a: readonly T[] | undefined, b: readonly T[] | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Translate a `CatalogQuery` into the SDK's `ListProducts$Params`. */
function toSdkParams(q: CatalogQuery): Parameters<typeof listProducts>[2] {
  const params: Parameters<typeof listProducts>[2] = {};
  if (q.q !== undefined) params.q = q.q;
  if (q.brands !== undefined && q.brands.length > 0) {
    params.brand = q.brands.slice();
  }
  if (q.storageGb !== undefined && q.storageGb.length > 0) {
    params.storageGb = q.storageGb.slice();
  }
  if (q.colors !== undefined && q.colors.length > 0) {
    params.color = q.colors.slice();
  }
  if (q.minPrice !== undefined) params.minPrice = q.minPrice;
  if (q.maxPrice !== undefined) params.maxPrice = q.maxPrice;
  if (q.inStock !== undefined) params.inStock = q.inStock;
  if (q.is5g !== undefined) params.is5g = q.is5g;
  if (q.featured !== undefined) params.featured = q.featured;
  if (q.activePromotion !== undefined) params.activePromotion = q.activePromotion;
  if (q.sort !== undefined) params.sort = q.sort;
  params.page = q.page;
  params.pageSize = q.pageSize;
  return params;
}

/** Best-effort error message extraction for the `error` field. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Ismeretlen hiba a katalógus betöltése közben.';
}

/**
 * Merges a fresh `Facets` into the accumulated universe and returns the
 * `Facets` the page renders (MIM-228). A brand or colour absent from the
 * response keeps its row with count 0, so a filter click never makes the
 * brand or colour list shrink and grow; a value new in the response is
 * appended once, even when the response repeats it; a value present takes
 * the response's entry. `storageGb`, `inStock`, `is5g` and `priceRange`
 * pass through from the response.
 */
export function mergeFacetsIntoUniverse(universe: FacetUniverse, fresh: Facets): Facets {
  return {
    ...fresh,
    brands: mergeRows(universe.brands, fresh.brands),
    colors: mergeRows(universe.colors, fresh.colors),
  };
}

function mergeRows<T extends { readonly value: string; readonly count: number }>(
  known: readonly T[],
  fresh: readonly T[],
): T[] {
  const freshByValue = new Map(fresh.map((row) => [row.value, row]));
  const merged = known.map((row) => freshByValue.get(row.value) ?? { ...row, count: 0 });
  const knownValues = new Set(known.map((row) => row.value));
  for (const [value, row] of freshByValue) {
    if (!knownValues.has(value)) merged.push(row);
  }
  return merged;
}

/**
 * Root-provided facade. Single instance per application; consumers
 * inject it directly (no token wrapper) so swapping the facade for a
 * test stub is a single TestBed provider line.
 */
@Service()
export class CatalogFacade {
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);

  private readonly priceRefresh = new PriceRefresh(this.destroyRef, () => {
    this.retry$.next();
  });

  private readonly searchInput$ = new Subject<string>();
  private readonly queryChange$ = new Subject<CatalogQuery>();
  /**
   * Retry channel — bypasses `distinctUntilChanged` because the user
   * explicitly asked us to fire the current query again. The
   * facade only forwards to this stream when an error is in flight,
   * so a retry after a successful request is a deliberate no-op.
   */
  private readonly retry$ = new Subject<void>();

  /** Counts catalogue page visits (`beginVisit`). The visit is part of
   *  the query key, so a new visit with the same query reads the list
   *  again instead of keeping what an earlier visit read. */
  private visit = 0;

  /** Live URL-derived query state — single source of truth. */
  private readonly querySignal = signal<CatalogQuery>(DEFAULT_CATALOG_QUERY);

  /** Last successful `ProductPage` from the SDK, if any. */
  private readonly resultSignal = signal<CatalogResult | null>(null);

  /** Every brand and colour row rendered so far, in first-seen order
   *  (MIM-228); see `mergeFacetsIntoUniverse`. */
  private readonly facetUniverseSignal = signal<FacetUniverse>({ brands: [], colors: [] });

  /** True while a request is in flight (drives `loading` / `refreshing`). */
  private readonly inFlightSignal = signal<boolean>(false);

  /** Error from the most recent failed request, if any. */
  private readonly errorSignal = signal<string | null>(null);

  /**
   * True when the latest query change moved a page past the last one
   * back to the last page. A URL such as `/telefonok?page=99` opens the
   * last page and the URL follows (the owner's decision); the page reads
   * this flag to replace that URL instead of pushing a history entry, so
   * Back does not return to the out-of-range page.
   */
  private readonly pageClampedSignal = signal<boolean>(false);

  /** Set right before a clamped query is emitted; the pipeline's `tap` turns it into `pageClamped`. */
  private clampPending = false;

  /** Read-only view of the canonical query — UI binds to this. */
  readonly query = this.querySignal.asReadonly();

  /** Read-only view of the current `vm` — UI binds to this. */
  readonly vm = computed<CatalogVm>(() => this.buildVm());

  /** Read-only view of the clamp flag — the page's URL writer reads it. */
  readonly pageClamped = this.pageClampedSignal.asReadonly();

  constructor() {
    // Debounced search pipeline: every keystroke resets the 300 ms
    // timer; only the trailing value reaches the canonical stream,
    // and the subscriber below drops a value that changes nothing.
    const debouncedSearch = this.searchInput$.pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      map((raw) => raw.trim()),
    );

    const searchSub = debouncedSearch.subscribe((q) => {
      const current = this.querySignal();
      const next: CatalogQuery = {
        ...current,
        ...(q.length > 0 ? { q } : { q: undefined }),
        page: 1,
      };
      if (queryEquals(next, current)) return;
      this.queryChange$.next(next);
    });

    // Canonical query stream. Each emission is the full next state;
    // `distinctUntilChanged` skips no-op updates so a duplicate
    // setter call never re-fires the SDK.
    const querySub = merge(
      this.queryChange$.pipe(
        map((query) => ({ query, visit: this.visit })),
        distinctUntilChanged((a, b) => a.visit === b.visit && queryEquals(a.query, b.query)),
        map(({ query }) => query),
      ),
      this.retry$.pipe(map(() => this.querySignal())),
    )
      .pipe(
        tap((q) => {
          this.pageClampedSignal.set(this.clampPending);
          this.clampPending = false;
          this.querySignal.set(q);
          this.errorSignal.set(null);
          this.inFlightSignal.set(true);
        }),
        switchMap((q) =>
          this.api.invoke(listProducts, toSdkParams(q)).pipe(
            map((page) => ({ kind: 'ok' as const, query: q, page })),
            catchError((err: unknown) =>
              of({ kind: 'err' as const, query: q, error: describeError(err) }),
            ),
          ),
        ),
      )
      .subscribe((event) => {
        this.inFlightSignal.set(false);
        if (event.kind === 'ok') {
          this.priceRefresh.schedule(event.page.serverTime, event.page.nextPriceChangeAt);
          // The contract echoes a requested page past the last one with no
          // items and the real total, so the facade asks for the last page.
          const lastPage = event.page.totalPages;
          if (event.page.items.length === 0 && lastPage >= 1 && event.query.page > lastPage) {
            this.clampPending = true;
            this.queryChange$.next({ ...event.query, page: lastPage });
            return;
          }
          const facets = mergeFacetsIntoUniverse(this.facetUniverseSignal(), event.page.facets);
          this.facetUniverseSignal.set({ brands: facets.brands, colors: facets.colors });
          this.resultSignal.set({
            items: event.page.items,
            total: event.page.total,
            page: event.page.page,
            pageSize: event.page.pageSize,
            facets,
          });
        } else {
          this.errorSignal.set(event.error);
        }
      });

    this.destroyRef.onDestroy(() => {
      searchSub.unsubscribe();
      querySub.unsubscribe();
      this.searchInput$.complete();
      this.queryChange$.complete();
      this.retry$.complete();
    });
  }

  // ---------------------------------------------------------------------------
  // Mutators — every setter writes through to the URL source of truth.
  // ---------------------------------------------------------------------------

  /**
   * Apply a free-form search string. The value is debounced; an empty
   * trimmed value clears the search filter and resets the page.
   */
  setSearch(value: string): void {
    this.searchInput$.next(value);
  }

  /**
   * Apply a partial filter set. Any absent field falls back to the
   * current value, and the page always resets to 1: a filter change
   * shows the new list from its start. The filter panel and drawer emit
   * the whole query, page included, so a page in the partial is ignored
   * here (`setPage` and `setPageSize` own the page).
   */
  setFilters(partial: Partial<CatalogQuery>): void {
    const current = this.querySignal();
    const next: CatalogQuery = {
      ...current,
      ...partial,
      page: 1,
    };
    this.queryChange$.next(next);
  }

  /** Apply a sort mode and reset the page to 1. */
  setSort(value: Sort): void {
    const current = this.querySignal();
    const next: CatalogQuery = { ...current, sort: value, page: 1 };
    this.queryChange$.next(next);
  }

  /** Move to an explicit page — does not reset other filters. */
  setPage(page: number): void {
    const current = this.querySignal();
    const next: CatalogQuery = { ...current, page };
    this.queryChange$.next(next);
  }

  /** Change page size and reset the page to 1. */
  setPageSize(pageSize: 12 | 24): void {
    const current = this.querySignal();
    const next: CatalogQuery = { ...current, pageSize, page: 1 };
    this.queryChange$.next(next);
  }

  /** Add or remove a brand from the active filter set. */
  toggleBrand(brand: string): void {
    const trimmed = brand.trim();
    if (trimmed.length === 0) return;
    const current = this.querySignal().brands ?? [];
    const present = current.includes(trimmed);
    const next = present ? current.filter((b) => b !== trimmed) : [...current, trimmed];
    this.setFilters({ brands: next.length > 0 ? next : undefined });
  }

  /** Add or remove a storage bucket from the active filter set. */
  toggleStorage(storageGb: 128 | 256 | 512): void {
    const current = this.querySignal().storageGb ?? [];
    const present = current.includes(storageGb);
    const next = present ? current.filter((s) => s !== storageGb) : [...current, storageGb];
    this.setFilters({ storageGb: next.length > 0 ? next : undefined });
  }

  /** Add or remove a colour code from the active filter set. */
  toggleColor(colorCode: string): void {
    const trimmed = colorCode.trim();
    if (trimmed.length === 0) return;
    const current = this.querySignal().colors ?? [];
    const present = current.includes(trimmed);
    const next = present ? current.filter((c) => c !== trimmed) : [...current, trimmed];
    this.setFilters({ colors: next.length > 0 ? next : undefined });
  }

  /** Replace the inclusive price range; `undefined` clears the bound. */
  setPriceRange(min: number | undefined, max: number | undefined): void {
    this.setFilters({ minPrice: min, maxPrice: max });
  }

  /** Set the `inStock` flag; pass `undefined` to clear the filter. */
  setInStock(value: boolean | undefined): void {
    this.setFilters({ inStock: value });
  }

  /** Set the `is5g` flag; pass `undefined` to clear the filter. */
  setIs5g(value: boolean | undefined): void {
    this.setFilters({ is5g: value });
  }

  /** Set the `featured` flag; pass `undefined` to clear the filter. */
  setFeatured(value: boolean | undefined): void {
    this.setFilters({ featured: value });
  }

  /** Reset every filter back to the documented defaults. */
  reset(): void {
    this.queryChange$.next({ ...DEFAULT_CATALOG_QUERY });
  }

  /**
   * Re-fire the current query without changing it. Only effective
   * after an errored request — a retry on a successful query is
   * a no-op so it cannot trigger the `distinctUntilChanged` guard
   * to swallow a legitimate same-state mutation later.
   */
  retry(): void {
    if (this.errorSignal() === null) return;
    this.retry$.next();
  }

  /**
   * Sync the facade with an external URL change (browser back /
   * forward, deep link, manual navigation). The codec normalises
   * empty / default / unknown values so the page never inherits
   * garbage from the URL.
   */
  loadFromParams(params: URLSearchParams): void {
    const next = parseCatalogQuery(params);
    this.queryChange$.next(next);
  }

  /**
   * Opens a new page visit. The catalogue page calls it once per
   * instance, before its first `loadFromParams()`: this root facade
   * outlives the page, so without it a revisit with the same query
   * would collapse onto the earlier visit's read.
   */
  beginVisit(): void {
    this.visit += 1;
  }

  /** Canonical query string for the current state — push to the router. */
  currentParams(): URLSearchParams {
    return serializeCatalogQuery(this.querySignal());
  }

  // ---------------------------------------------------------------------------
  // Internal: derive the `vm` from the three live signals.
  // ---------------------------------------------------------------------------

  private buildVm(): CatalogVm {
    const query = this.querySignal();
    const result = this.resultSignal();
    const inFlight = this.inFlightSignal();
    const error = this.errorSignal();

    // Error wins over everything else so a failed retry never shows
    // the stale data as if it were the latest fetch.
    if (error !== null) {
      return {
        status: 'error',
        query,
        items: result?.items ?? [],
        total: result?.total ?? 0,
        page: result?.page ?? query.page,
        pageSize: result?.pageSize ?? query.pageSize,
        facets: result?.facets ?? null,
        error,
      };
    }

    // No result yet — first load. Either `loading` (request in flight)
    // or `loading` with no spinner (still empty before the first emit).
    if (result === null) {
      return {
        status: 'loading',
        query,
        items: [],
        total: 0,
        page: query.page,
        pageSize: query.pageSize,
        facets: null,
        error: null,
      };
    }

    // We have a result; the current request either completed
    // (`success` / `empty`) or is still in flight (`refreshing`,
    // showing the previous useful content rather than a blank screen).
    if (inFlight) {
      return {
        status: 'refreshing',
        query,
        items: result.items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        facets: result.facets,
        error: null,
      };
    }

    if (result.total === 0 || result.items.length === 0) {
      return {
        status: 'empty',
        query,
        items: result.items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        facets: result.facets,
        error: null,
      };
    }

    return {
      status: 'success',
      query,
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      facets: result.facets,
      error: null,
    };
  }
}
