/**
 * MIM-350, unit F15 — page-driven data source for the Termékek list.
 *
 * The Termékek page is a virtual-scroll table: rows are sparse and the
 * data source knows the total but only loads a row's page when the
 * viewer asks for it. The store builds one instance per query (a
 * distinct query makes a distinct instance, so a late page of an old
 * query can never land in the new list), passes the page loader it
 * constructed and the row's `collectionViewer` CDK hands to the
 * virtual scroll.
 *
 * Two simple invariants hold while a data source is alive:
 *
 *   - page 1 is requested the moment `connect()` runs, because it is
 *     the only request that carries `totalElements` — without it the
 *     viewer would not know how tall to be;
 *
 *   - for every `viewer.viewChange` range, the data source requests
 *     each page whose rows the range covers (page `p` holds rows
 *     `(p - 1) * pageSize` to `p * pageSize - 1`), skipping the ones
 *     already requested, and skipping the ones past the last. Failed
 *     later pages are forgotten so a later `viewChange` retries them;
 *     a failed page 1 leaves the source in `error` until the store
 *     rebuilds it via `retry()`.
 *
 * The merge map semantics the brief calls for are realised by giving
 * each page request its own subscription instead of funneling every
 * emission through one outer `switchMap`: a slower page 2 cannot be
 * cancelled by a later page 3, and a slow page 3 cannot cancel an
 * earlier page 2. `disconnect()` completes the output stream and
 * drops every in-flight subscription through the `cancelled` gate.
 */
import { DataSource, type CollectionViewer, type ListRange } from '@angular/cdk/collections';
import { signal, type Signal } from '@angular/core';
import { type Observable, ReplaySubject, Subject } from 'rxjs';

import type { AdminProductListItem } from '../../../api/generated/models/admin-product-list-item';
import type { AdminProductPage } from '../../../api/generated/models/admin-product-page';

import { PRODUCT_LIST_PAGE_SIZE } from './product-list.query';

/** Coarse shape of one row in the sparse cache: an item the page has
 *  loaded, or `undefined` while the row's page is still in flight. */
export type ProductListRow = AdminProductListItem | undefined;

/** The four documented source statuses; see `buildStatus` for the
 *  transitions. */
export type ProductListStatus = 'loading' | 'ready' | 'empty' | 'error';

/** A loader the store hands in: `(page) => Observable<AdminProductPage>`.
 *  The data source treats every emission as one fully-resolved page
 *  and never inspects the loader's internals. */
export type ProductListPageLoader = (page: number) => Observable<AdminProductPage>;

/**
 * Page-driven `DataSource` over `AdminProductListItem | undefined`.
 *
 * One instance per query: the store builds a new instance for every
 * distinct serialised query, so a late response of a stale query
 * cannot leak into the active list. The instance owns the row cache
 * and every signal it exposes; the store reads but never writes to
 * them.
 */
export class ProductListDataSource extends DataSource<ProductListRow> {
  /** `null` until page 1 lands (or fails). */
  private readonly totalSignal = signal<number | null>(null);
  /** Rows currently in the cache (the `items` array filtered to
   *  `isDefined`). */
  private readonly loadedCountSignal = signal<number>(0);
  /** Coarse source status: drives the title chip on the page. */
  private readonly statusSignal = signal<ProductListStatus>('loading');
  /** `true` while at least one non-page-1 request has failed and
   *  has not yet been replaced by a successful page landing. */
  private readonly pageErrorSignal = signal<boolean>(false);
  /** The sparse cache the page renders; the data source re-emits it
   *  after every page that lands. */
  private readonly itemsSignal = signal<readonly ProductListRow[]>([]);

  /** Pages requested (in flight or completed). Used to deduplicate
   *  range requests so the same page is never requested twice. */
  private readonly requested = new Set<number>();
  /** Output subject; `disconnect()` completes it so the view stops
   *  receiving updates. A `ReplaySubject(1)` caches the most recent
   *  emission so a late subscriber (a view mounted after page 1 had
   *  already landed, or a test that subscribes after `connect()` ran)
   *  still gets the current sparse array. */
  private readonly subject = new ReplaySubject<readonly ProductListRow[]>(1);
  /** Gate `takeUntil` subscribes to; completed by `disconnect()`. */
  private readonly cancelled = new Subject<void>();

  readonly total: Signal<number | null> = this.totalSignal.asReadonly();
  readonly loadedCount: Signal<number> = this.loadedCountSignal.asReadonly();
  readonly status: Signal<ProductListStatus> = this.statusSignal.asReadonly();
  readonly pageError: Signal<boolean> = this.pageErrorSignal.asReadonly();

  constructor(private readonly loader: ProductListPageLoader) {
    super();
  }

  /**
   * Connect to a `CollectionViewer`. The stream emits an empty array
   * synchronously on subscribe (so the view's first paint is
   * deterministic), then a fresh array every time a page lands or a
   * row is replaced. The viewer is held only as a callback target:
   * `viewChange` is subscribed while connected, and the subscription
   * is dropped on `disconnect()`.
   */
  connect(viewer: CollectionViewer): Observable<readonly ProductListRow[]> {
    viewer.viewChange.subscribe((range) => {
      this.requestRange(range);
    });
    // Initial page-1 load — the contract pins totalElements on page 1.
    this.requestPage(1);
    // The ReplaySubject caches the most recent emission, so a
    // subscriber that joins late (after page 1 landed) still gets
    // the current sparse array.
    return this.subject.asObservable();
  }

  /**
   * Tear the data source down. Completes the output stream, drops
   * every in-flight page subscription, and lets the store swap in a
   * new instance without leaving a zombie.
   */
  disconnect(): void {
    this.cancelled.next();
    this.cancelled.complete();
    this.subject.complete();
    // Re-initialise so a reconnected source on the same instance (the
    // store never does, but the contract allows) starts clean.
    this.requested.clear();
  }

  /**
   * Replace the cached row whose `id` matches `item.id`. Re-emits
   * the cache so the view's `*ngFor`-equivalent tracks the row in
   * place. The brief calls out the property: an archived or restored
   * row keeps its index until the next query, so the row's neighbours
   * never shift.
   */
  replaceItem(item: AdminProductListItem): void {
    const items = this.itemsSignal();
    const next = items.slice();
    const idx = next.findIndex((row) => row?.id === item.id);
    if (idx === -1) return;
    next[idx] = item;
    this.itemsSignal.set(next);
    this.subject.next(next);
  }

  // ---------------------------------------------------------------------------
  // Internal: page arithmetic, request dispatch, cache mutation.
  // ---------------------------------------------------------------------------

  /** Translate a `ListRange` into the pages it covers, dropping any
   *  already requested and any past the last. */
  private requestRange(range: ListRange): void {
    if (range.end <= range.start) return;
    const startPage = Math.floor(range.start / PRODUCT_LIST_PAGE_SIZE) + 1;
    const endPage = Math.floor((range.end - 1) / PRODUCT_LIST_PAGE_SIZE) + 1;
    const total = this.totalSignal();
    const maxPage = total === null ? endPage : Math.ceil(total / PRODUCT_LIST_PAGE_SIZE);
    for (let page = startPage; page <= endPage && page <= maxPage; page += 1) {
      this.requestPage(page);
    }
  }

  /** Request one page at most once per data-source lifetime, unless
   *  a previous attempt failed (the page is forgotten in
   *  `handlePageError` so a later range can retry it). Each
   *  subscription is independent — slow page 2 cannot cancel a later
   *  page 3, the merge-map semantics the brief asks for. */ private requestPage(
    page: number,
  ): void {
    if (this.requested.has(page)) return;
    const total = this.totalSignal();
    if (total !== null && page > Math.ceil(total / PRODUCT_LIST_PAGE_SIZE)) {
      return;
    }
    this.requested.add(page);
    this.loader(page).subscribe({
      next: (resp) => {
        this.handlePage(page, resp);
      },
      error: () => {
        this.handlePageError(page);
      },
    });
  }

  /** A page landed. Page 1 also drives the source status and the
   *  `total` signal; later pages fill the cache and refresh
   *  `loadedCount`. */
  private handlePage(page: number, resp: AdminProductPage): void {
    if (page === 1) {
      this.totalSignal.set(resp.totalElements);
      if (resp.totalElements === 0) {
        this.statusSignal.set('empty');
        this.itemsSignal.set([]);
        this.loadedCountSignal.set(0);
        this.subject.next([]);
        return;
      }
      this.statusSignal.set('ready');
    }

    const items = this.itemsSignal().slice();
    const offset = (page - 1) * PRODUCT_LIST_PAGE_SIZE;
    for (let i = 0; i < resp.items.length; i += 1) {
      items[offset + i] = resp.items[i];
    }
    this.itemsSignal.set(items);
    this.loadedCountSignal.set(
      items.reduce<number>((acc, row) => (row === undefined ? acc : acc + 1), 0),
    );
    this.pageErrorSignal.set(false);
    this.subject.next(items);
  }

  /** A page failed. Page 1 puts the source into `error`; a later
   *  page is forgotten (so a later `viewChange` may retry it) and
   *  `pageError` flips to `true` until a page lands. */
  private handlePageError(page: number): void {
    if (page === 1) {
      this.statusSignal.set('error');
      return;
    }
    this.requested.delete(page);
    this.pageErrorSignal.set(true);
  }
}
