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
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptors,
  withXhr,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { NavigationEnd, Router, RouterOutlet, provideRouter } from '@angular/router';
import { Component, inject } from '@angular/core';
import type { CollectionViewer, ListRange } from '@angular/cdk/collections';
import { filter, firstValueFrom, Subject } from 'rxjs';
import { http, HttpResponse as MswHttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { provideApiConfiguration } from '../../../api/generated/api-configuration';
import { ifMatchInterceptor } from '../../../core/api/if-match.interceptor';
import type { AdminProductPage } from '../../../api/generated/models/admin-product-page';
import type { AdminProductListItem } from '../../../api/generated/models/admin-product-list-item';

import { useMswServer, server } from '../../../../testing/msw-server';
import { issueXsrfCookie } from '../../../../mocks/guards';
import { createDb } from '../../../../mocks/db';
import type { MockDb } from '../../../../mocks/db';
import { productsReadHandlers } from '../../../../mocks/products-read.handlers';
import { productsWriteHandlers } from '../../../../mocks/products-write.handlers';
import { serviceUnavailable } from '../../../../mocks/backend-answers';
import { SEED_ADMIN } from '../../../../mocks/seed';

import { ProductListStore } from './product-list.store';
import { ProductListDataSource } from './product-list.data-source';
import { DEFAULT_PRODUCT_LIST_QUERY } from './product-list.query';

// A trace id is random per response; the matcher is typed unknown so the lint rule accepts it.
const ANY_TRACE_ID: unknown = expect.any(String);

useMswServer();

/** Read the issued XSRF token out of the document cookie so we can
 *  stamp it on every POST/PUT the store fires. Angular's default
 *  XSRF behaviour reads the cookie too, but the unit-test runner
 *  resets `document.cookie` between specs in ways the default does
 *  not always recover from, so we ship our own interceptor. */
const xsrfHeaderInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.method === 'GET' || request.method === 'HEAD') return next(request);
  const cookieMatch = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/.exec(document.cookie);
  if (cookieMatch === null) return next(request);
  const token = cookieMatch[1];
  if (token.length === 0) return next(request);
  return next(request.clone({ setHeaders: { 'X-XSRF-TOKEN': token } }));
};

/** Trivial route component so the harness router has something to
 *  mount at the test URL. The store reads its `ActivatedRoute`. */
@Component({ selector: 'adm-empty', template: '' })
class EmptyComponent {}

/** Host component that provides the store in its own injector and
 *  exposes it as a public field for tests to grab. */
@Component({
  selector: 'adm-host',
  template: '<router-outlet />',
  imports: [RouterOutlet],
  providers: [ProductListStore],
})
class HostComponent {
  readonly store = inject(ProductListStore);
}

const TEST_ROUTES = [
  {
    path: 'termekek',
    component: EmptyComponent,
  },
  { path: '**', redirectTo: 'termekek' },
];

/** A tiny test harness that mounts the host, navigates to a URL,
 *  and returns the store + router for the test to drive. */
async function setup(scenario: 'default' | 'save-conflict' = 'default'): Promise<{
  db: MockDb;
  store: ProductListStore;
  fixture: { destroy(): void };
}> {
  const db = createDb(scenario);
  db.sessionAdminId = SEED_ADMIN.id;
  const setCookieValue = issueXsrfCookie(db);
  document.cookie = setCookieValue.split(';')[0] ?? '';
  if (server === undefined) throw new Error('MSW server not initialised');
  server.use(...productsReadHandlers(db), ...productsWriteHandlers(db));
  TestBed.configureTestingModule({
    imports: [EmptyComponent, HostComponent],
    providers: [
      provideRouter(TEST_ROUTES),
      provideHttpClient(withXhr(), withInterceptors([ifMatchInterceptor, xsrfHeaderInterceptor])),
      provideApiConfiguration(new URL('/api/v1', document.baseURI).href),
    ],
  });
  const fixture = TestBed.createComponent(HostComponent);
  const router = TestBed.inject(Router);
  await router.navigateByUrl('/termekek');
  await fixture.whenStable();
  return {
    db,
    store: fixture.componentInstance.store,
    fixture: {
      destroy: (): void => {
        fixture.destroy();
      },
    },
  };
}

/** Stub `CollectionViewer` the data source can attach to. The data
 *  source reads `viewChange` once at `connect()` time and otherwise
 *  ignores the viewer, so the stub only needs that property. */
function noopViewer(): CollectionViewer {
  return {
    viewChange: new Subject<ListRange>(),
  };
}

/** Wait for the next `NavigationEnd` emitted by `router.events`. The
 *  store's `setQuery(...)` triggers a `router.navigate(...)`, and the
 *  router emits `NavigationEnd` exactly once on a successful run;
 *  resolving on that event is the supported wait for the navigation
 *  the test caused, without sleeping for an arbitrary amount of time.
 *  See angular.dev/api/router/NavigationEnd — "An event triggered
 *  when a navigation ends successfully." */
function nextNavigationEnd(router: Router): Promise<NavigationEnd> {
  return firstValueFrom(
    router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
  );
}

describe('ProductListStore', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('setQuery({ brands }) navigates to a sorted brand query and updates query()', async () => {
    const { store } = await setup();

    const router = TestBed.inject(Router);
    const navigated = nextNavigationEnd(router);
    store.setQuery({ brands: ['Samsung', 'Apple'] });
    await navigated;

    expect(router.url).toBe('/termekek?brand=Apple&brand=Samsung');
    expect(store.query().brands).toEqual(['Apple', 'Samsung']);
  });

  it('setQuery back to the defaults removes those keys from the URL and query()', async () => {
    const { store } = await setup();
    const router = TestBed.inject(Router);

    const filtered = nextNavigationEnd(router);
    store.setQuery({ status: 'archived', brands: ['Apple'], featured: true });
    await filtered;
    expect(router.url).toBe('/termekek?brand=Apple&status=archived&featured=true');

    const reset = nextNavigationEnd(router);
    store.setQuery({ status: 'active', brands: [], featured: false });
    await reset;
    expect(router.url).toBe('/termekek');
    expect(store.query()).toEqual(DEFAULT_PRODUCT_LIST_QUERY);
  });

  it('a query change replaces the data source; a late response of the old query never reaches the new one', async () => {
    const { store } = await setup();
    let releaseOldPage: (value: AdminProductPage) => void = () => undefined;
    const oldPageGate = new Promise<AdminProductPage>((resolve) => {
      releaseOldPage = resolve;
    });
    // oldCallCount is read by the MSW handler to gate the first
    // call's response on the page-gate.
    let oldCallCount = 0;
    const mswServer = server;
    if (mswServer === undefined) throw new Error('MSW server not initialised');
    mswServer.use(
      http.get('*/api/v1/admin/products', ({ request }) => {
        const url = new URL(request.url);
        const brands = url.searchParams.getAll('brand');
        if (brands.length > 0) {
          const items: AdminProductListItem[] = Array.from({ length: 10 }, (_, i) => ({
            id: 1000 + i,
            brand: brands[0] ?? 'Apple',
            colors: [],
            featured: false,
            maxPrice: { amount: 1, currency: 'HUF' },
            minPrice: { amount: 1, currency: 'HUF' },
            name: `Filtered ${String(i)}`,
            rank: i,
            releasedAt: '2024-01-01',
            slug: `f-${String(i)}`,
            status: 'active',
            thumbnail: { id: 'a'.repeat(64), src: '/x.jpg', alt: '', width: 1, height: 1 },
            totalStock: 1,
            variantCount: 1,
            version: 0,
          }));
          return MswHttpResponse.json({
            items,
            page: 1,
            pageSize: 50,
            totalElements: items.length,
            totalPages: 1,
          });
        }
        if (oldCallCount === 0) {
          oldCallCount += 1;
          const gate = oldPageGate.then((value: AdminProductPage): Response =>
            MswHttpResponse.json(value),
          );
          return new Promise<Response>((resolve) => {
            void gate.then((value) => {
              resolve(value);
            });
          });
        }
        return undefined;
      }),
    );

    const oldDs = store.dataSource();
    expect(oldDs).toBeInstanceOf(ProductListDataSource);
    expect(oldDs.total()).toBeNull();
    const oldRows$ = oldDs.connect(noopViewer());

    const router = TestBed.inject(Router);
    const navigated = nextNavigationEnd(router);
    store.setQuery({ brands: ['Apple'] });
    await navigated;

    const newDs = store.dataSource();
    expect(newDs).not.toBe(oldDs);
    const newRows$ = newDs.connect(noopViewer());
    await firstValueFrom(newRows$);

    expect(newDs.total()).toBe(10);
    expect(oldDs.total()).toBeNull();

    const oldItems: AdminProductListItem[] = Array.from({ length: 46 }, (_, i) => ({
      id: i + 1,
      brand: 'Apple',
      colors: [],
      featured: false,
      maxPrice: { amount: 1, currency: 'HUF' },
      minPrice: { amount: 1, currency: 'HUF' },
      name: `Old ${String(i)}`,
      rank: i,
      releasedAt: '2024-01-01',
      slug: `o-${String(i)}`,
      status: 'active',
      thumbnail: { id: 'a'.repeat(64), src: '/x.jpg', alt: '', width: 1, height: 1 },
      totalStock: 1,
      variantCount: 1,
      version: 0,
    }));
    releaseOldPage({
      items: oldItems,
      page: 1,
      pageSize: 50,
      totalElements: 46,
      totalPages: 1,
    });
    await firstValueFrom(oldRows$.pipe(filter((rows) => rows.length > 0)));

    expect(newDs.total()).toBe(10);
    expect(oldDs.total()).toBe(46);
  });

  it('retry() builds a new data source for the same query', async () => {
    const { store } = await setup();
    const before = store.dataSource();
    const query = store.query();
    store.retry();
    expect(store.dataSource()).not.toBe(before);
    expect(store.dataSource()).toBeInstanceOf(ProductListDataSource);
    expect(store.query()).toEqual(query);
  });

  it('archive answered 503 returns { kind: "failed" } with the problem', async () => {
    const { store } = await setup();
    const ds = store.dataSource();
    const stream$ = ds.connect(noopViewer());
    const first = await firstValueFrom(stream$);
    const row = first[0];
    if (row === undefined) throw new Error('row 1 missing');

    const mswServer = server;
    if (mswServer === undefined) throw new Error('MSW server not initialised');
    mswServer.use(
      http.post('*/api/v1/admin/products/:productId/archive', () => serviceUnavailable()),
    );

    const result = await store.archive(row);
    expect(result).toEqual({
      kind: 'failed',
      problem: {
        type: 'urn:mi-bolt:problem:service-unavailable',
        title: 'Service unavailable',
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        detail: 'The service is temporarily unavailable',
        traceId: ANY_TRACE_ID,
        fieldErrors: [],
      },
    });
  });

  it('archive sends If-Match with the row version and updates the row in place', async () => {
    const { db, store } = await setup();
    const ds = store.dataSource();
    const stream$ = ds.connect(noopViewer());
    await firstValueFrom(stream$);
    expect(ds.total()).toBe(46);

    let sentIfMatch: string | null = null;
    const archiveServer = server;
    if (archiveServer === undefined) throw new Error('MSW server not initialised');
    archiveServer.use(
      http.post('*/api/v1/admin/products/:productId/archive', ({ request }) => {
        sentIfMatch = request.headers.get('If-Match');
        return undefined;
      }),
    );

    const product5 = db.products.get(5);
    if (product5 === undefined) throw new Error('seed missing product 5');
    const item: AdminProductListItem = {
      id: 5,
      brand: product5.brand,
      colors: [],
      featured: false,
      maxPrice: { amount: 1, currency: 'HUF' },
      minPrice: { amount: 1, currency: 'HUF' },
      name: product5.name,
      rank: product5.rank,
      releasedAt: product5.releasedAt,
      slug: product5.slug,
      status: 'active',
      thumbnail: product5.colors[0].image,
      totalStock: 1,
      variantCount: 1,
      version: 0,
    };

    const result = await store.archive(item);
    expect(result.kind).toBe('done');
    if (result.kind === 'done') {
      expect(result.item.status).toBe('archived');
      expect(result.item.version).toBe(1);
    }
    expect(sentIfMatch).toBe('"0"');
  });

  it('a successful archive drops the other cached data sources, so another tab loads afresh', async () => {
    const { store } = await setup();
    const router = TestBed.inject(Router);
    const activeSource = store.dataSource();

    const toAll = nextNavigationEnd(router);
    store.setQuery({ status: 'all' });
    await toAll;
    const allSource = store.dataSource();
    expect(allSource).not.toBe(activeSource);
    const first = await firstValueFrom(allSource.connect(noopViewer()));
    const row = first[0];
    if (row === undefined) throw new Error('row 1 missing');

    const result = await store.archive(row);
    expect(result.kind).toBe('done');
    // The tab on screen keeps its instance: its row was replaced in place.
    expect(store.dataSource()).toBe(allSource);

    const toActive = nextNavigationEnd(router);
    store.setQuery({ status: 'active' });
    await toActive;
    expect(store.dataSource()).not.toBe(activeSource);
  });

  it('a successful restore drops the other cached data sources too', async () => {
    const { store } = await setup();
    const router = TestBed.inject(Router);
    const activeSource = store.dataSource();
    const first = await firstValueFrom(activeSource.connect(noopViewer()));
    const row = first[0];
    if (row === undefined) throw new Error('row 1 missing');
    const archived = await store.archive(row);
    if (archived.kind !== 'done') throw new Error(`archive answered ${archived.kind}`);

    const toArchived = nextNavigationEnd(router);
    store.setQuery({ status: 'archived' });
    await toArchived;
    const archivedSource = store.dataSource();

    const restored = await store.restore(archived.item);
    expect(restored.kind).toBe('done');
    expect(store.dataSource()).toBe(archivedSource);

    const toActive = nextNavigationEnd(router);
    store.setQuery({ status: 'active' });
    await toActive;
    expect(store.dataSource()).not.toBe(activeSource);
  });

  it('archive with a stale version returns { kind: "conflict" }', async () => {
    const { db, store } = await setup();
    const product5 = db.products.get(5);
    if (product5 === undefined) throw new Error('seed missing product 5');
    const item: AdminProductListItem = {
      id: 5,
      brand: product5.brand,
      colors: [],
      featured: false,
      maxPrice: { amount: 1, currency: 'HUF' },
      minPrice: { amount: 1, currency: 'HUF' },
      name: product5.name,
      rank: product5.rank,
      releasedAt: product5.releasedAt,
      slug: product5.slug,
      status: 'active',
      thumbnail: product5.colors[0].image,
      totalStock: 1,
      variantCount: 1,
      version: 7,
    };

    const result = await store.archive(item);
    expect(result.kind).toBe('conflict');
  });

  it('restore of a featured archived product while 4 active products are featured returns featured-limit', async () => {
    const { db, store } = await setup();
    const product47 = db.products.get(47);
    if (product47 === undefined) throw new Error('seed missing product 47');
    // Arrange: archived product 47 becomes featured. The seed has
    // 4 active featured products (ids 1-4), so restoring product 47
    // would push the count of OTHER active featured past 4 and
    // trip the 409 `FEATURED_LIMIT` branch.
    db.products.set(47, { ...product47, featured: true });

    const item: AdminProductListItem = {
      id: 47,
      brand: product47.brand,
      colors: [],
      featured: true,
      maxPrice: { amount: 1, currency: 'HUF' },
      minPrice: { amount: 1, currency: 'HUF' },
      name: product47.name,
      rank: product47.rank,
      releasedAt: product47.releasedAt,
      slug: product47.slug,
      status: 'archived',
      thumbnail: product47.colors[0].image,
      totalStock: 1,
      variantCount: 1,
      version: 0,
    };

    const result = await store.restore(item);
    expect(result.kind).toBe('featured-limit');
  });
});
