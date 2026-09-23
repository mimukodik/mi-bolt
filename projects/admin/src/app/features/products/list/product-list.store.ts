/**
 * MIM-350, unit F15 — store for the Termékek list.
 *
 * The URL query string is the single source of truth for the page
 * (`docs/spec/architecture.md:67`): `ProductListStore` reads it
 * through `parseProductListQuery` and writes it back through
 * `serializeProductListQuery`. The page calls `setQuery({ ... })`
 * to change a filter, the router navigates, the signal picks the
 * new value up, and a fresh `ProductListDataSource` is built for the
 * new query. The old data source stays around only long enough to
 * finish any page it had in flight; its emissions go into its own
 * cache, never the new one's.
 *
 * The brief calls out the property: a late response of an old query
 * must never reach the new data source. The store realises that by
 * caching data sources by the serialised params, so a different
 * query always gets a different instance. `replaceItem` updates only
 * the cache of the *current* data source; an archive or a restore
 * therefore never bleeds across a query change.
 *
 * `archive` and `restore` are the two wire actions. Each one posts
 * the current row's `version` quoted as the `If-Match` header
 * (`withIfMatch`), waits for the row's new version, applies the
 * result through `replaceItem`, and resolves to a small tagged
 * union so the page can branch on the outcome without inspecting
 * HTTP status codes itself.
 */
import { computed, DestroyRef, inject, Injectable, signal, type Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AdminApi } from '../../../api/generated/admin-api';
import type { AdminProductListItem } from '../../../api/generated/models/admin-product-list-item';
import type { AdminProduct } from '../../../api/generated/models/admin-product';
import type { Problem } from '../../../api/generated/models/problem';
import { archiveAdminProduct } from '../../../api/generated/fn/admin-products/archive-admin-product';
import { restoreAdminProduct } from '../../../api/generated/fn/admin-products/restore-admin-product';
import { listAdminProducts } from '../../../api/generated/fn/admin-products/list-admin-products';

import { withIfMatch } from '../../../core/api/if-match.interceptor';
import { problemOf } from '../../../core/api/problem';

import {
  DEFAULT_PRODUCT_LIST_QUERY,
  parseProductListQuery,
  serializeProductListQuery,
  toListParams,
  type ProductListQuery,
} from './product-list.query';
import {
  ProductListDataSource,
  type ProductListPageLoader,
  type ProductListStatus,
} from './product-list.data-source';

/** Tagged outcome of `archive` and `restore`. */
export type RowActionResult =
  | { readonly kind: 'done'; readonly item: AdminProductListItem }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'featured-limit' }
  | { readonly kind: 'failed'; readonly problem: Problem | null };

/** A function that posts a single row action. The two endpoints
 *  share the same response shape, so the store keeps one private
 *  `rowAction` helper instead of two. */
type RowActionFn = typeof archiveAdminProduct | typeof restoreAdminProduct;

/**
 * `@Injectable()` — the Termékek page provides this store in its own
 * injector, so a fresh store is built for every navigation to the
 * page (the canonical URL state is recreated, and the data source
 * cache is empty).
 */
@Injectable()
export class ProductListStore {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AdminApi);
  private readonly destroyRef = inject(DestroyRef);

  /** Re-parse every router `queryParamMap` emission through the
   *  codec, into the canonical typed query. The codec is the single
   *  source of normalisations. */
  private readonly parsedQuery = signal<ProductListQuery>(DEFAULT_PRODUCT_LIST_QUERY);

  /** Public view of the typed query. The codec guarantees the
   *  default-when-junk rule, so consumers can rely on the union. */
  readonly query: Signal<ProductListQuery> = this.parsedQuery.asReadonly();

  /** Trigger for `retry()`: a separate signal so the data-source
   *  computed can depend on it without depending on the query. */
  private readonly retryTick = signal<number>(0);

  /** Cache of `ProductListDataSource` instances keyed by serialised
   *  params. A different query always gets a different instance; the
   *  same query always gets the same one until `retry()` discards it. */
  private readonly cache = new Map<string, ProductListDataSource>();

  /** The data source the page renders. A new instance for every
   *  distinct query (or for every `retry()` call against the same
   *  query). */
  readonly dataSource: Signal<ProductListDataSource> = computed(() => {
    // Read `retryTick` so the computed re-evaluates on retry even
    // when the query itself has not changed.
    this.retryTick();
    const q = this.parsedQuery();
    const key = JSON.stringify(serializeProductListQuery(q));
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const loader: ProductListPageLoader = (page: number) =>
      this.api.invoke(listAdminProducts, toListParams(q, page));
    const ds = new ProductListDataSource(loader);
    this.cache.set(key, ds);
    return ds;
  });

  /** `total` signal — delegates to the current data source. */
  readonly total: Signal<number | null> = computed(() => this.dataSource().total());
  /** `loadedCount` signal — delegates to the current data source. */
  readonly loadedCount: Signal<number> = computed(() => this.dataSource().loadedCount());
  /** `status` signal — delegates to the current data source. */
  readonly status: Signal<ProductListStatus> = computed(() => this.dataSource().status());

  constructor() {
    // Bridge the router queryParamMap stream into the parsed-query
    // signal: every router emission yields a fresh typed query.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.parsedQuery.set(parseProductListQuery(params));
    });
  }

  /**
   * Push a partial query change through the router. The store never
   * writes state directly; navigation is the only writer, and the
   * codec normalises the merged value before it lands back here.
   */
  setQuery(patch: Partial<ProductListQuery>): void {
    const next: ProductListQuery = { ...this.parsedQuery(), ...patch };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: serializeProductListQuery(next),
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Re-fire the current query. Discards the cached data source for
   * the same query and bumps `retryTick` so the computed rebuilds;
   * the page receives a fresh data source whose page 1 is in flight.
   */
  retry(): void {
    const q = this.parsedQuery();
    const key = JSON.stringify(serializeProductListQuery(q));
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      cached.disconnect();
      this.cache.delete(key);
    }
    this.retryTick.update((n) => n + 1);
  }

  /**
   * Archive a row. The wire call carries the row's current `version`
   * in `If-Match`. A 200 response yields a `{ kind: 'done', item }`
   * with the row's new status and version, and the data source
   * replaces the cached row in place so the table does not shift.
   */
  archive(item: AdminProductListItem): Promise<RowActionResult> {
    return this.rowAction(item, archiveAdminProduct);
  }

  /** Restore a row — mirror of `archive`, with the restore endpoint
   *  and the 409 `FEATURED_LIMIT` branch. */
  restore(item: AdminProductListItem): Promise<RowActionResult> {
    return this.rowAction(item, restoreAdminProduct);
  }

  // ---------------------------------------------------------------------------
  // Internal: shared archive/restore flow.
  // ---------------------------------------------------------------------------

  private rowAction(item: AdminProductListItem, fn: RowActionFn): Promise<RowActionResult> {
    const result = firstValueFrom(
      this.api.invoke(fn, { productId: item.id }, withIfMatch(`"${String(item.version)}"`)),
    ).then(
      (body: AdminProduct): RowActionResult => {
        const next: AdminProductListItem = {
          ...item,
          status: body.status,
          version: body.version,
        };
        this.dataSource().replaceItem(next);
        return { kind: 'done', item: next };
      },
      (err: unknown): RowActionResult => {
        const problem = problemOf(err);
        if (problem?.code === 'PRODUCT_VERSION_CONFLICT') return { kind: 'conflict' };
        if (problem?.code === 'FEATURED_LIMIT') return { kind: 'featured-limit' };
        return { kind: 'failed', problem };
      },
    );
    return result;
  }
}
