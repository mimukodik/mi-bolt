/**
 * MIM-350, unit F15 — `ProductListStore` spec.
 *
 * Exercises the store against the live MSW handlers (the same ones
 * the edit page uses), with a router harness so `ActivatedRoute` has
 * a real `queryParamMap` to read. The XSRF/session guard setup
 * follows `products-write.handlers.spec.ts`.
 */
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptors,
  withXhr,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { Component, inject } from '@angular/core';
import type { CollectionViewer, ListRange } from '@angular/cdk/collections';
import { Subject } from 'rxjs';
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
import { SEED_ADMIN } from '../../../../mocks/seed';

import { ProductListStore } from './product-list.store';
import { ProductListDataSource } from './product-list.data-source';

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

/** Drain microtasks so MSW's synchronous handlers deliver their
 *  responses to subscribers and Angular finishes a router navigation. */
async function settle(n = 5): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/** Stub `CollectionViewer` the data source can attach to. The data
 *  source reads `viewChange` once at `connect()` time and otherwise
 *  ignores the viewer, so the stub only needs that property. */
function noopViewer(): CollectionViewer {
  return {
    viewChange: new Subject<ListRange>(),
  };
}

describe('ProductListStore', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('setQuery({ brands }) navigates to a sorted brand query and updates query()', async () => {
    const { store } = await setup();

    store.setQuery({ brands: ['Samsung', 'Apple'] });
    await settle();

    const router = TestBed.inject(Router);
    expect(router.url).toContain('brand=Apple');
    expect(router.url).toContain('brand=Samsung');
    expect(router.url.indexOf('brand=Apple')).toBeLessThan(router.url.indexOf('brand=Samsung'));

    expect(store.query().brands).toEqual(['Apple', 'Samsung']);
  });

  it('a query change replaces the data source; a late response of the old query never reaches the new one', async () => {
    const { store } = await setup();
    let releaseOldPage!: (value: AdminProductPage) => void;
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
    oldDs.connect(noopViewer());

    store.setQuery({ brands: ['Apple'] });
    await settle();

    const newDs = store.dataSource();
    expect(newDs).not.toBe(oldDs);
    newDs.connect(noopViewer());

    for (let i = 0; i < 50 && newDs.total() === null; i += 1) {
      await settle(1);
    }
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
    await settle();

    expect(newDs.total()).toBe(10);
    expect(oldDs.total()).toBe(46);
  });

  it('archive sends If-Match with the row version and updates the row in place', async () => {
    const { db, store } = await setup();
    const ds = store.dataSource();
    ds.connect(noopViewer());
    for (let i = 0; i < 50 && ds.total() === null; i += 1) {
      await settle(1);
    }
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
