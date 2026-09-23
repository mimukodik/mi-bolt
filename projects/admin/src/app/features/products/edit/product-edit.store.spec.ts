/**
 * Spec for `ProductEditStore`
 * (projects/admin/src/app/features/products/edit/product-edit.store.ts).
 *
 * The store talks to the admin SDK through Angular's `HttpClient` over MSW,
 * so every request is matched by `productsReadHandlers`/`productsWriteHandlers`
 * driving a per-test `MockDb`. The tests run against the real interceptor
 * stack (`withXhr`, `ifMatchInterceptor`) so the ETag round-trip the store
 * relies on is exercised end to end.
 *
 * Covering `if-match` is captured by a wrapping MSW handler in test 5: the
 * store sends `If-Match: "<version>"` and the handler records the header it
 * saw, so a regression in `withIfMatch` or `withIfMatch(etag)` would fail that
 * case rather than pass on the ETag alone.
 *
 * Expected catalogue values (`productsReadHandlers` answers `ETag: "<version>"`
 * with the seeded version, currently `0`; a future bump of the seed would
 * push that value, and the spec reports it inside the case rather than
 * freezing a literal it cannot keep current).
 */
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { FieldError } from '../../../api/generated/models/field-error';
import type { AdminProduct } from '../../../api/generated/models/admin-product';
import type { AdminProductInput } from '../../../api/generated/models/admin-product-input';
import type { Problem } from '../../../api/generated/models/problem';
import { provideApiConfiguration } from '../../../api/generated/api-configuration';
import { ifMatchInterceptor } from '../../../core/api/if-match.interceptor';

import { server, useMswServer } from '../../../../testing/msw-server';
import { malformedBody, serviceUnavailable } from '../../../../mocks/backend-answers';
import { createDb } from '../../../../mocks/db';
import type { MockDb } from '../../../../mocks/db';
import { SEED_ADMIN } from '../../../../mocks/seed';
import { productsReadHandlers } from '../../../../mocks/products-read.handlers';
import { productsWriteHandlers } from '../../../../mocks/products-write.handlers';

import { ProductEditStore, type SaveResult } from './product-edit.store';

useMswServer();

const TEST_XSRF_TOKEN = 'test-xsrf-token';

const addXsrfInterceptor: HttpInterceptorFn = (request, next) =>
  next(request.clone({ setHeaders: { 'X-XSRF-TOKEN': TEST_XSRF_TOKEN } }));

function signedIn(scenario: 'default' | 'save-conflict' = 'default'): MockDb {
  const db = createDb(scenario);
  db.sessionAdminId = SEED_ADMIN.id;
  db.xsrfToken = TEST_XSRF_TOKEN;
  server?.use(...productsReadHandlers(db), ...productsWriteHandlers(db));
  return db;
}

function inputOf(product: AdminProduct): AdminProductInput {
  return {
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    description: product.description,
    is5g: product.is5g,
    releasedAt: product.releasedAt,
    rank: product.rank,
    popularityScore: product.popularityScore,
    featured: product.featured,
    highlights: product.highlights,
    colors: product.colors.map((color) => ({
      code: color.code,
      name: color.name,
      swatchHex: color.swatchHex,
      imageId: color.image.id,
      alt: color.image.alt,
    })),
    variants: product.variants.map((variant) => ({
      slug: variant.slug,
      colorCode: variant.colorCode,
      storageGb: variant.storageGb,
      price: variant.price,
      stock: variant.stock,
    })),
    specGroups: product.specGroups,
  };
}

function store(): ProductEditStore {
  TestBed.configureTestingModule({
    providers: [
      provideApiConfiguration('/api/v1'),
      provideHttpClient(withXhr(), withInterceptors([ifMatchInterceptor, addXsrfInterceptor])),
      ProductEditStore,
    ],
  });
  return TestBed.inject(ProductEditStore);
}

function isSaved(
  result: SaveResult,
): result is { readonly kind: 'saved'; readonly product: AdminProduct } {
  return result.kind === 'saved';
}

function isInvalid(
  result: SaveResult,
): result is { readonly kind: 'invalid'; readonly fieldErrors: readonly FieldError[] } {
  return result.kind === 'invalid';
}

describe('ProductEditStore', () => {
  it('load(1) → ready, product equals the seeded product 1, etag "<version>"', async () => {
    const db = signedIn();
    const seeded = db.products.get(1);
    if (seeded === undefined) throw new Error('seed missing product 1');

    const s = store();
    await s.load(1);

    expect(s.loadStatus()).toBe('ready');
    expect(s.product()).toEqual(seeded);
    expect(s.etag()).toBe(`"${String(seeded.version)}"`);
  });

  it('load(99999) → not-found; a 503 → error', async () => {
    const db = signedIn();
    if (!db.products.has(1)) throw new Error('seed missing product 1');

    const s = store();
    await s.load(99999);
    expect(s.loadStatus()).toBe('not-found');
    expect(s.product()).toBeNull();
    expect(s.etag()).toBeNull();

    server?.use(
      http.get('/api/v1/admin/products/:productId', () =>
        HttpResponse.json(
          {
            code: 'SERVICE_UNAVAILABLE',
            detail: 'service unavailable',
            fieldErrors: [],
            params: {},
            status: 503,
            title: 'Service unavailable',
            traceId: 't',
            type: 'about:blank',
          },
          { status: 503 },
        ),
      ),
    );

    await s.load(2);
    expect(s.loadStatus()).toBe('error');
  });

  it('create with a fresh slug → saved, new id, etag "<new version>"', async () => {
    const db = signedIn();
    const seeded = db.products.get(1);
    if (seeded === undefined) throw new Error('seed missing product 1');
    const input: AdminProductInput = {
      ...inputOf(seeded),
      slug: 'honor-600-lite-copy',
      featured: false,
    };

    const s = store();
    const result = await s.create(input);

    expect(isSaved(result)).toBe(true);
    if (!isSaved(result)) throw new Error('expected saved');
    expect(result.product.id).toBeGreaterThan(seeded.id);
    expect(result.product.version).toBe(0);
    expect(s.etag()).toBe('"0"');
  });

  it('create with a taken slug → invalid with the mock field error', async () => {
    const db = signedIn();
    const seeded = db.products.get(5);
    if (seeded === undefined) throw new Error('seed missing product 5');
    const input = inputOf(seeded);

    const s = store();
    const result = await s.create(input);

    expect(isInvalid(result)).toBe(true);
    if (!isInvalid(result)) throw new Error('expected invalid');
    expect(result.fieldErrors).toEqual([{ path: '/slug', code: 'SLUG_TAKEN', params: {} }]);
  });

  it('save after load(1) → saved, etag "<next version>", If-Match "<old version>"', async () => {
    const db = signedIn();
    const seeded = db.products.get(1);
    if (seeded === undefined) throw new Error('seed missing product 1');

    let observedIfMatch: string | null = null;
    server?.use(
      http.put('/api/v1/admin/products/:productId', ({ request }) => {
        observedIfMatch = request.headers.get('If-Match');
        return undefined;
      }),
    );

    const s = store();
    await s.load(1);
    const loaded = s.product();
    if (loaded === null) throw new Error('expected product');
    const input = inputOf(loaded);

    const result = await s.save(input);

    expect(observedIfMatch).toBe(`"${String(seeded.version)}"`);
    expect(isSaved(result)).toBe(true);
    if (!isSaved(result)) throw new Error('expected saved');
    expect(result.product.version).toBe(seeded.version + 1);
    expect(s.etag()).toBe(`"${String(seeded.version + 1)}"`);
  });

  it('save in save-conflict → conflict, product and etag unchanged', async () => {
    const db = signedIn('save-conflict');
    const seeded = db.products.get(1);
    if (seeded === undefined) throw new Error('seed missing product 1');

    const s = store();
    await s.load(1);
    const productBefore = s.product();
    const etagBefore = s.etag();
    if (productBefore === null) throw new Error('expected product');
    const input = inputOf(productBefore);

    const result = await s.save(input);

    expect(result).toEqual({ kind: 'conflict' });
    expect(s.product()).toEqual(productBefore);
    expect(s.etag()).toBe(etagBefore);
  });

  it('save with an input the mock rejects (empty name) → invalid with field errors', async () => {
    const db = signedIn();
    const seeded = db.products.get(1);
    if (seeded === undefined) throw new Error('seed missing product 1');

    const s = store();
    await s.load(1);
    const input = { ...inputOf(seeded), name: '' };

    const result = await s.save(input);

    expect(isInvalid(result)).toBe(true);
    if (!isInvalid(result)) throw new Error('expected invalid');
    expect(result.fieldErrors).toEqual([{ path: '/name', code: 'SIZE', params: {} }]);
  });

  it('save without load throws "save before load"', async () => {
    const db = signedIn();
    const seeded = db.products.get(1);
    if (seeded === undefined) throw new Error('seed missing product 1');
    const input = inputOf(seeded);
    const s = store();

    await expect(s.save(input)).rejects.toThrow('save before load');
  });

  it('loadFeaturedCount() reads the seeded count of featured + active; a 503 leaves it null', async () => {
    const db = signedIn();
    const expected = [...db.products.values()].filter(
      (product) => product.featured && product.status === 'active',
    ).length;
    expect(expected).toBeGreaterThan(0);

    const s = store();
    await s.loadFeaturedCount();
    expect(s.featuredCount()).toBe(expected);

    server?.use(
      http.get('/api/v1/admin/products', () =>
        HttpResponse.json(
          {
            code: 'SERVICE_UNAVAILABLE',
            detail: 'service unavailable',
            fieldErrors: [],
            params: {},
            status: 503,
            title: 'Service unavailable',
            traceId: 't',
            type: 'about:blank',
          },
          { status: 503 },
        ),
      ),
    );

    await s.loadFeaturedCount();
    expect(s.featuredCount()).toBeNull();
  });

  it('loadBrands() returns the mock brands exactly; a 503 leaves []', async () => {
    const db = signedIn();
    const expected = [...new Set([...db.products.values()].map((product) => product.brand))].sort(
      (a, b) =>
        a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0,
    );

    const s = store();
    await s.loadBrands();
    expect([...s.brands()]).toEqual(expected);

    server?.use(http.get('/api/v1/admin/brands', () => HttpResponse.json([], { status: 503 })));

    await s.loadBrands();
    expect(s.brands()).toEqual([]);
  });

  it('create answered with a one-off 422 Problem with no field errors → failed, not invalid', async () => {
    const db = signedIn();
    const seeded = db.products.get(1);
    if (seeded === undefined) throw new Error('seed missing product 1');
    const input = inputOf(seeded);

    const emptyFieldErrorsProblem: Problem = {
      type: 'urn:mi-bolt:problem:validation-failed',
      title: 'Section rejected',
      status: 422,
      code: 'VALIDATION_FAILED',
      detail: 'One or more supplied fields are not acceptable',
      traceId: 'test-trace-422-empty-create',
      fieldErrors: [],
    };
    server?.use(
      http.post(
        '/api/v1/admin/products',
        () => HttpResponse.json(emptyFieldErrorsProblem, { status: 422 }),
        { once: true },
      ),
    );

    const s = store();
    const result = await s.create(input);

    expect(result).toEqual({ kind: 'failed', problem: emptyFieldErrorsProblem });
  });

  it('create answered with a one-off 400 from malformedBody() → failed', async () => {
    const db = signedIn();
    const seeded = db.products.get(1);
    if (seeded === undefined) throw new Error('seed missing product 1');
    const input = inputOf(seeded);

    server?.use(http.post('/api/v1/admin/products', () => malformedBody(), { once: true }));

    const s = store();
    const result = await s.create(input);

    expect(result.kind).toBe('failed');
  });

  it('save (after load(1)) answered with a one-off 422 Problem with no field errors → failed, product and etag unchanged', async () => {
    const db = signedIn();
    const seeded = db.products.get(1);
    if (seeded === undefined) throw new Error('seed missing product 1');

    const s = store();
    await s.load(1);
    const productBefore = s.product();
    const etagBefore = s.etag();
    if (productBefore === null) throw new Error('expected product');
    const input = inputOf(productBefore);

    const emptyFieldErrorsProblem: Problem = {
      type: 'urn:mi-bolt:problem:validation-failed',
      title: 'Section rejected',
      status: 422,
      code: 'VALIDATION_FAILED',
      detail: 'One or more supplied fields are not acceptable',
      traceId: 'test-trace-422-empty-save',
      fieldErrors: [],
    };
    server?.use(
      http.put(
        '/api/v1/admin/products/:productId',
        () => HttpResponse.json(emptyFieldErrorsProblem, { status: 422 }),
        { once: true },
      ),
    );

    const result = await s.save(input);

    expect(result.kind).toBe('failed');
    expect(s.product()).toEqual(productBefore);
    expect(s.etag()).toBe(etagBefore);
  });

  it('load(1) held; load(2) completes first; releasing load(1) does not overwrite product 2', async () => {
    const db = signedIn();
    const product2 = db.products.get(2);
    if (product2 === undefined) throw new Error('seed missing product 2');

    let releaseLoad1: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseLoad1 = resolve;
    });
    // Wraps the real handler: awaits the gate, then falls through by
    // returning `undefined`, the same pattern the If-Match test above uses
    // (server.use handlers run before the ones registered in signedIn(),
    // and returning undefined lets the request continue to those).
    server?.use(
      http.get(
        '/api/v1/admin/products/1',
        async () => {
          await gate;
          return undefined;
        },
        { once: true },
      ),
    );

    const s = store();
    const load1 = s.load(1);
    await s.load(2);

    expect(s.product()?.id).toBe(2);
    expect(s.loadStatus()).toBe('ready');

    releaseLoad1();
    await load1;

    expect(s.product()?.id).toBe(2);
    expect(s.etag()).toBe(`"${String(product2.version)}"`);
    expect(s.loadStatus()).toBe('ready');
  });

  it('load(1), save held, load(2) completes; releasing the save resolves saved for product 1 without touching the store', async () => {
    const db = signedIn();
    const product1 = db.products.get(1);
    const product2 = db.products.get(2);
    if (product1 === undefined || product2 === undefined) {
      throw new Error('seed missing product 1 or 2');
    }

    let releaseSave: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    server?.use(
      http.put(
        '/api/v1/admin/products/:productId',
        async () => {
          await gate;
          return undefined;
        },
        { once: true },
      ),
    );

    const s = store();
    await s.load(1);
    const input = inputOf(product1);
    const savePromise = s.save(input);

    await s.load(2);
    expect(s.product()?.id).toBe(2);

    releaseSave();
    const result = await savePromise;

    expect(isSaved(result)).toBe(true);
    if (!isSaved(result)) throw new Error('expected saved');
    expect(result.product.id).toBe(product1.id);

    expect(s.product()?.id).toBe(2);
    expect(s.etag()).toBe(`"${String(product2.version)}"`);
  });

  it('load(1) held and answered 503 after load(2) completed → loadStatus stays ready, product stays 2', async () => {
    const db = signedIn();
    const product2 = db.products.get(2);
    if (product2 === undefined) throw new Error('seed missing product 2');

    let releaseLoad1: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseLoad1 = resolve;
    });
    server?.use(
      http.get(
        '/api/v1/admin/products/1',
        async () => {
          await gate;
          return serviceUnavailable();
        },
        { once: true },
      ),
    );

    const s = store();
    const load1 = s.load(1);
    await s.load(2);

    expect(s.loadStatus()).toBe('ready');
    expect(s.product()?.id).toBe(2);

    releaseLoad1();
    await load1;

    expect(s.loadStatus()).toBe('ready');
    expect(s.product()?.id).toBe(2);
  });
});
