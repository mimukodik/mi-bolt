/**
 * MIM-350, unit F15 — `ProductListDataSource` spec.
 *
 * The fake-loader path is the primary test surface: it drives page
 * arithmetic with a `vi.fn`, so 120-row totals and explicit
 * `viewChange` ranges can be asserted deterministically, no matter
 * what the seed holds. The first test still uses the live MSW path
 * with the real seed to prove the loader wires up to the contract's
 * defaults (the row count is 48 - 2 archived = 46 with the default
 * `status=active`).
 *
 * The fake `CollectionViewer` is a `Subject<ListRange>` the test
 * drives with `next({ start, end })`; one Subject per test keeps
 * state isolated.
 */
import { firstValueFrom, Observable, of, Subject, throwError } from 'rxjs';
import type { CollectionViewer, ListRange } from '@angular/cdk/collections';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminProductListItem } from '../../../api/generated/models/admin-product-list-item';
import type { AdminProductPage } from '../../../api/generated/models/admin-product-page';

import { useMswServer, server } from '../../../../testing/msw-server';
import { issueXsrfCookie } from '../../../../mocks/guards';
import { createDb } from '../../../../mocks/db';
import { productsReadHandlers } from '../../../../mocks/products-read.handlers';
import { SEED_ADMIN } from '../../../../mocks/seed';

import { ProductListDataSource } from './product-list.data-source';

useMswServer();

/** A `CollectionViewer` whose `viewChange` is a `Subject<ListRange>`
 *  the test drives by hand. */
class FakeCollectionViewer implements CollectionViewer {
  readonly viewChange = new Subject<ListRange>();
}

function itemOf(id: number): AdminProductListItem {
  return {
    id,
    brand: 'Apple',
    colors: [],
    featured: false,
    maxPrice: { amount: 1, currency: 'HUF' },
    minPrice: { amount: 1, currency: 'HUF' },
    name: `Product ${String(id)}`,
    rank: id,
    releasedAt: '2024-01-01',
    slug: `p-${String(id)}`,
    status: 'active',
    thumbnail: { id: 'a'.repeat(64), src: '/x.jpg', alt: '', width: 1, height: 1 },
    totalStock: 1,
    variantCount: 1,
    version: 0,
  };
}

function pageOf(
  totalElements: number,
  page: number,
  items: AdminProductListItem[],
): AdminProductPage {
  return {
    totalElements,
    page,
    pageSize: 50,
    totalPages: Math.ceil(totalElements / 50),
    items,
  };
}

function firstEmission<T>(source: Observable<T>): Promise<T> {
  return firstValueFrom(source);
}

describe('ProductListDataSource — live MSW', () => {
  beforeEach(() => {
    const db = createDb('default');
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    if (server === undefined) throw new Error('MSW server not initialised');
    server.use(...productsReadHandlers(db));
  });

  it('page 1 yields total 46 (48 seeded - 2 archived, default status active)', async () => {
    const loader = (page: number): Observable<AdminProductPage> =>
      new Observable<AdminProductPage>((subscriber) => {
        const url = new URL('/api/v1/admin/products', document.baseURI);
        url.searchParams.set('status', 'active');
        url.searchParams.set('sort', 'rank');
        url.searchParams.set('direction', 'asc');
        url.searchParams.set('page', String(page));
        url.searchParams.set('pageSize', '50');
        fetch(url.href, { credentials: 'include' })
          .then((r) => r.json())
          .then((value: AdminProductPage) => value)
          .then(
            (value) => {
              subscriber.next(value);
              subscriber.complete();
            },
            (err: unknown) => {
              subscriber.error(err);
            },
          );
      });

    const ds = new ProductListDataSource(loader);
    const stream = ds.connect(new FakeCollectionViewer());

    const first = await firstEmission(stream);
    expect(ds.total()).toBe(46);
    expect(first).toHaveLength(46);
    for (let i = 0; i < 46; i += 1) {
      expect(first[i]).toBeDefined();
    }
    expect(ds.status()).toBe('ready');
    expect(ds.loadedCount()).toBe(46);

    ds.disconnect();
  });
});

describe('ProductListDataSource — fake loader', () => {
  it('emits a 46-row sparse array from page 1 alone (one page of 50 holds all 46)', async () => {
    const items = Array.from({ length: 46 }, (_, i) => itemOf(i + 1));
    const loader = vi.fn((page: number): Observable<AdminProductPage> => {
      if (page !== 1) return throwError(() => new Error(`unexpected page ${String(page)}`));
      return of(pageOf(46, 1, items));
    });

    const ds = new ProductListDataSource(loader);
    const stream = ds.connect(new FakeCollectionViewer());

    const first = await firstEmission(stream);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(1);
    expect(ds.total()).toBe(46);
    expect(first).toHaveLength(46);
    for (let i = 0; i < 46; i += 1) {
      expect(first[i]).toBeDefined();
    }
    expect(ds.status()).toBe('ready');
    expect(ds.loadedCount()).toBe(46);

    ds.disconnect();
  });

  it('requests pages 2 and 3 for viewChange ranges, never duplicates', async () => {
    const loader = vi.fn((page: number): Observable<AdminProductPage> => {
      if (page === 3) {
        const items = Array.from({ length: 20 }, (_, i) => itemOf(100 + i + 1));
        return of(pageOf(120, 3, items));
      }
      const items = Array.from({ length: 50 }, (_, i) => itemOf((page - 1) * 50 + i + 1));
      return of(pageOf(120, page, items));
    });

    const ds = new ProductListDataSource(loader);
    const viewer = new FakeCollectionViewer();
    const stream = ds.connect(viewer);

    await firstEmission(stream);

    const sub = stream.subscribe();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenLastCalledWith(1);

    viewer.viewChange.next({ start: 60, end: 70 });
    await Promise.resolve();
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader).toHaveBeenLastCalledWith(2);

    viewer.viewChange.next({ start: 60, end: 70 });
    await Promise.resolve();
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(2);

    viewer.viewChange.next({ start: 95, end: 110 });
    await Promise.resolve();
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(3);
    expect(loader).toHaveBeenLastCalledWith(3);

    sub.unsubscribe();
    ds.disconnect();
  });

  it('never requests a page past the last one for a range beyond total', async () => {
    const loader = vi.fn((page: number): Observable<AdminProductPage> => {
      if (page === 3) {
        const items = Array.from({ length: 20 }, (_, i) => itemOf(100 + i + 1));
        return of(pageOf(120, 3, items));
      }
      const items = Array.from({ length: 50 }, (_, i) => itemOf((page - 1) * 50 + i + 1));
      return of(pageOf(120, page, items));
    });

    const ds = new ProductListDataSource(loader);
    const viewer = new FakeCollectionViewer();
    const stream = ds.connect(viewer);

    await firstEmission(stream);

    const sub = stream.subscribe();

    viewer.viewChange.next({ start: 200, end: 300 });
    await Promise.resolve();
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenLastCalledWith(1);

    sub.unsubscribe();
    ds.disconnect();
  });

  it('a failed page 1 → status error', () => {
    const loader = vi.fn((): Observable<AdminProductPage> => throwError(() => new Error('boom')));

    const ds = new ProductListDataSource(loader);
    // Connect is synchronous: the loader's error fires before the
    // call returns, so the status is already 'error' by the time
    // we get back the stream.
    ds.connect(new FakeCollectionViewer());

    expect(ds.status()).toBe('error');
    expect(ds.total()).toBeNull();

    ds.disconnect();
  });

  it('replaceItem changes that row only and keeps the array length', async () => {
    const items = Array.from({ length: 46 }, (_, i) => itemOf(i + 1));
    const loader = vi.fn((page: number): Observable<AdminProductPage> => {
      if (page !== 1) return throwError(() => new Error(`unexpected ${String(page)}`));
      return of(pageOf(46, 1, items));
    });

    const ds = new ProductListDataSource(loader);
    const stream = ds.connect(new FakeCollectionViewer());

    await firstEmission(stream);

    const seen: number[] = [];
    const sub = stream.subscribe((value) => {
      seen.push(value.length);
    });

    const replacement: AdminProductListItem = { ...itemOf(5), status: 'archived', version: 7 };
    ds.replaceItem(replacement);

    expect(seen.length).toBeGreaterThanOrEqual(1);
    const last = seen[seen.length - 1] ?? 0;
    expect(last).toBe(46);

    sub.unsubscribe();
    ds.disconnect();
  });

  it('a failed later page sets pageError and forgets the page so viewChange retries it', async () => {
    let call = 0;
    const loader = vi.fn((page: number): Observable<AdminProductPage> => {
      if (page === 2) {
        call += 1;
        if (call === 1) return throwError(() => new Error('boom'));
        const items = Array.from({ length: 50 }, (_, i) => itemOf(50 + i + 1));
        return of(pageOf(120, 2, items));
      }
      if (page === 1) {
        const items = Array.from({ length: 50 }, (_, i) => itemOf(i + 1));
        return of(pageOf(120, 1, items));
      }
      return throwError(() => new Error(`unexpected ${String(page)}`));
    });

    const ds = new ProductListDataSource(loader);
    const viewer = new FakeCollectionViewer();
    const stream = ds.connect(viewer);

    await firstEmission(stream);

    const sub = stream.subscribe();

    viewer.viewChange.next({ start: 60, end: 70 });
    await Promise.resolve();
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(ds.pageError()).toBe(true);

    viewer.viewChange.next({ start: 60, end: 70 });
    await Promise.resolve();
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(3);
    expect(ds.pageError()).toBe(false);

    sub.unsubscribe();
    ds.disconnect();
  });
});
