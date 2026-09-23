/**
 * Spec for `productsWriteHandlers`
 * (projects/admin/src/mocks/products-write.handlers.ts): create, replace,
 * archive and restore over the Node MSW server, the way `guards.spec.ts`
 * drives the XSRF/session guards.
 *
 * Expected values for the seeded catalogue (48 products, `nextProductId`
 * 49, ids 1-4 the only featured products, ids 47/48 archived, product 5
 * `honor-600-lite` with colours `fekete`/`zold` and first variant id
 * `honor-600-lite--fekete--128`) are literals read from
 * `docs/api/fixtures/catalog-source.json` through `seed.ts`, never
 * computed with the handler code under test.
 */
import { describe, expect, it } from 'vitest';

import type { AdminProduct } from '../app/api/generated/models/admin-product';
import type { AdminProductInput } from '../app/api/generated/models/admin-product-input';
import type { ProblemCode } from '../app/api/generated/models/problem-code';
import { isRecord } from '../app/core/is-record';

import { useMswServer, server } from '../testing/msw-server';
import { createDb } from './db';
import type { MockDb } from './db';
import { XSRF_HEADER, issueXsrfCookie } from './guards';
import { productsWriteHandlers } from './products-write.handlers';
import type { ScenarioName } from './scenario';
import { SEED_ADMIN } from './seed';

useMswServer();

function productsUrl(): string {
  return new URL('/api/v1/admin/products', document.baseURI).href;
}

function productUrl(id: number | string): string {
  return new URL(`/api/v1/admin/products/${String(id)}`, document.baseURI).href;
}

function archiveUrl(id: number | string): string {
  return new URL(`/api/v1/admin/products/${String(id)}/archive`, document.baseURI).href;
}

function restoreUrl(id: number | string): string {
  return new URL(`/api/v1/admin/products/${String(id)}/restore`, document.baseURI).href;
}

function setup(scenario: ScenarioName = 'default'): MockDb {
  const db = createDb(scenario);
  db.sessionAdminId = SEED_ADMIN.id;
  issueXsrfCookie(db);
  server?.use(...productsWriteHandlers(db));
  return db;
}

function requireProduct(db: MockDb, id: number): AdminProduct {
  const product = db.products.get(id);
  if (product === undefined) throw new Error(`product ${String(id)} missing from seed`);
  return product;
}

/** Maps an `AdminProduct` back to a valid `AdminProductInput`, as the edit form would. */
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

function headersFor(db: MockDb, overrides: Record<string, string | undefined> = {}): HeadersInit {
  const merged: Record<string, string | undefined> = {
    'content-type': 'application/json',
    [XSRF_HEADER]: db.xsrfToken ?? '',
    ...overrides,
  };
  const present = Object.entries(merged).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return Object.fromEntries(present);
}

function post(
  url: string,
  db: MockDb,
  body: unknown,
  headerOverrides: Record<string, string | undefined> = {},
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: headersFor(db, headerOverrides),
    body: JSON.stringify(body),
  });
}

function put(
  url: string,
  db: MockDb,
  body: unknown,
  headerOverrides: Record<string, string | undefined> = {},
): Promise<Response> {
  return fetch(url, {
    method: 'PUT',
    headers: headersFor(db, headerOverrides),
    body: JSON.stringify(body),
  });
}

function action(
  url: string,
  db: MockDb,
  headerOverrides: Record<string, string | undefined> = {},
): Promise<Response> {
  return fetch(url, { method: 'POST', headers: headersFor(db, headerOverrides) });
}

function expectRecord(value: unknown): asserts value is Record<string, unknown> {
  expect(isRecord(value)).toBe(true);
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  expect(typeof value).toBe('string');
  if (typeof value !== 'string') throw new Error(`${key} is not a string`);
  return value;
}

function readNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  expect(typeof value).toBe('number');
  if (typeof value !== 'number') throw new Error(`${key} is not a number`);
  return value;
}

function readArray(body: Record<string, unknown>, key: string): unknown[] {
  const value = body[key];
  expect(Array.isArray(value)).toBe(true);
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value;
}

function fieldErrorsOf(body: Record<string, unknown>): Record<string, unknown>[] {
  return readArray(body, 'fieldErrors').map((item) => {
    expectRecord(item);
    return item;
  });
}

async function readJsonRecord(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  expectRecord(body);
  return body;
}

async function expectProblem(
  response: Response,
  status: number,
  code: ProblemCode,
): Promise<Record<string, unknown>> {
  expect(response.status).toBe(status);
  const body = await readJsonRecord(response);
  expect(readString(body, 'code')).toBe(code);
  return body;
}

describe('productsWriteHandlers', () => {
  describe('create', () => {
    it('creates a product: 201, ETag "0", Location, id 49, stored in db', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input: AdminProductInput = {
        ...inputOf(product5),
        slug: 'honor-600-lite-copy',
        featured: false,
      };

      const response = await post(productsUrl(), db, input);

      expect(response.status).toBe(201);
      expect(response.headers.get('ETag')).toBe('"0"');
      expect(response.headers.get('Location')).toBe('/api/v1/admin/products/49');
      const body = await readJsonRecord(response);
      expect(readNumber(body, 'id')).toBe(49);
      expect(readString(body, 'status')).toBe('active');
      expect(readNumber(body, 'version')).toBe(0);
      const variants = readArray(body, 'variants');
      const firstVariant = variants[0];
      expectRecord(firstVariant);
      expect(readString(firstVariant, 'id')).toBe('honor-600-lite-copy--fekete--128');
      expect(db.products.get(49)).toBeDefined();
    });

    it('rejects without the XSRF header (403)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input = { ...inputOf(product5), slug: 'honor-600-lite-copy' };

      const response = await post(productsUrl(), db, input, { [XSRF_HEADER]: undefined });

      await expectProblem(response, 403, 'CSRF_TOKEN_INVALID');
    });

    it('rejects with no session (401)', async () => {
      const db = setup();
      db.sessionAdminId = null;
      const product5 = requireProduct(db, 5);
      const input = { ...inputOf(product5), slug: 'honor-600-lite-copy' };

      const response = await post(productsUrl(), db, input);

      await expectProblem(response, 401, 'UNAUTHENTICATED');
    });

    it('rejects a body missing slug (400, /slug REQUIRED)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const { slug: _slug, ...withoutSlug } = inputOf(product5);

      const response = await post(productsUrl(), db, withoutSlug);

      const body = await expectProblem(response, 400, 'INVALID_REQUEST');
      const errors = fieldErrorsOf(body);
      expect(errors).toHaveLength(1);
      expect(readString(errors[0], 'path')).toBe('/slug');
      expect(readString(errors[0], 'code')).toBe('REQUIRED');
    });

    it('rejects a slug failing the pattern (422, PATTERN)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input = { ...inputOf(product5), slug: 'Bad Slug' };

      const response = await post(productsUrl(), db, input);

      const body = await expectProblem(response, 422, 'VALIDATION_FAILED');
      const errors = fieldErrorsOf(body);
      expect(errors).toEqual([{ path: '/slug', code: 'PATTERN', params: {} }]);
    });

    it('rejects a duplicated colour code (422, /colors/2/code DUPLICATE_COLOR_CODE)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const base = inputOf(product5);
      const input = {
        ...base,
        slug: 'honor-600-lite-copy',
        colors: [...base.colors, base.colors[0]],
      };

      const response = await post(productsUrl(), db, input);

      const body = await expectProblem(response, 422, 'VALIDATION_FAILED');
      const errors = fieldErrorsOf(body);
      expect(errors).toEqual([
        { path: '/colors/2/code', code: 'DUPLICATE_COLOR_CODE', params: {} },
      ]);
    });

    it('rejects a duplicated variant (422, /variants/2 DUPLICATE_VARIANT_SLUG and DUPLICATE_VARIANT)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const base = inputOf(product5);
      const input = {
        ...base,
        slug: 'honor-600-lite-copy',
        variants: [...base.variants, base.variants[0]],
      };

      const response = await post(productsUrl(), db, input);

      const body = await expectProblem(response, 422, 'VALIDATION_FAILED');
      const errors = fieldErrorsOf(body);
      // An appended clone repeats both its slug and its (colorCode, storageGb) pair, and the
      // validator checks each independently, in that order.
      expect(errors).toEqual([
        { path: '/variants/2/slug', code: 'DUPLICATE_VARIANT_SLUG', params: {} },
        { path: '/variants/2/storageGb', code: 'DUPLICATE_VARIANT', params: {} },
      ]);
    });

    it('rejects a taken slug (422, /slug SLUG_TAKEN)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input = inputOf(product5);

      const response = await post(productsUrl(), db, input);

      const body = await expectProblem(response, 422, 'VALIDATION_FAILED');
      const errors = fieldErrorsOf(body);
      expect(errors).toEqual([{ path: '/slug', code: 'SLUG_TAKEN', params: {} }]);
    });

    it('rejects featured past the limit (422, /featured FEATURED_LIMIT max:4)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input = { ...inputOf(product5), slug: 'honor-600-lite-copy', featured: true };

      const response = await post(productsUrl(), db, input);

      const body = await expectProblem(response, 422, 'VALIDATION_FAILED');
      const errors = fieldErrorsOf(body);
      expect(errors).toEqual([{ path: '/featured', code: 'FEATURED_LIMIT', params: { max: 4 } }]);
    });

    it('rejects an unknown imageId (422, /colors/0/imageId UNKNOWN_IMAGE)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const base = inputOf(product5);
      const input = {
        ...base,
        slug: 'honor-600-lite-copy',
        // 64 lowercase hex digits: passes the bean-validation PATTERN so the request reaches
        // stage 3, where it is not a registered image.
        colors: [{ ...base.colors[0], imageId: '0'.repeat(64) }, ...base.colors.slice(1)],
      };

      const response = await post(productsUrl(), db, input);

      const body = await expectProblem(response, 422, 'VALIDATION_FAILED');
      const errors = fieldErrorsOf(body);
      expect(errors).toEqual([{ path: '/colors/0/imageId', code: 'UNKNOWN_IMAGE', params: {} }]);
    });
  });

  describe('replace', () => {
    it('replaces a product: 200, ETag "1", version 1, new name, variant ids unchanged', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input = { ...inputOf(product5), name: 'Honor 600 Lite Plus' };

      const response = await put(productUrl(5), db, input, { 'If-Match': '"0"' });

      expect(response.status).toBe(200);
      expect(response.headers.get('ETag')).toBe('"1"');
      const body = await readJsonRecord(response);
      expect(readNumber(body, 'version')).toBe(1);
      expect(readString(body, 'name')).toBe('Honor 600 Lite Plus');
      const variants = readArray(body, 'variants');
      const firstVariant = variants[0];
      expectRecord(firstVariant);
      expect(readString(firstVariant, 'id')).toBe('honor-600-lite--fekete--128');
    });

    it('rejects without If-Match (428)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input = inputOf(product5);

      const response = await put(productUrl(5), db, input);

      await expectProblem(response, 428, 'PRECONDITION_REQUIRED');
    });

    it('rejects a stale If-Match (412, expected 0 received 7)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input = inputOf(product5);

      const response = await put(productUrl(5), db, input, { 'If-Match': '"7"' });

      const body = await expectProblem(response, 412, 'PRODUCT_VERSION_CONFLICT');
      const params = body['params'];
      expectRecord(params);
      expect(readNumber(params, 'expected')).toBe(0);
      expect(readNumber(params, 'received')).toBe(7);
    });

    it('rejects a malformed If-Match (400, parameter ifMatch, reason PATTERN)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input = inputOf(product5);

      const response = await put(productUrl(5), db, input, { 'If-Match': 'abc' });

      const body = await expectProblem(response, 400, 'INVALID_REQUEST');
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('ifMatch');
      expect(readString(params, 'reason')).toBe('PATTERN');
    });

    it('rejects an unknown product id (404, params.productId 999)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input = inputOf(product5);

      const response = await put(productUrl(999), db, input, { 'If-Match': '"0"' });

      const body = await expectProblem(response, 404, 'NOT_FOUND');
      const params = body['params'];
      expectRecord(params);
      expect(readNumber(params, 'productId')).toBe(999);
    });

    it('rejects a malformed path id (400, parameter productId)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input = inputOf(product5);

      const response = await put(productUrl('abc'), db, input, { 'If-Match': '"0"' });

      const body = await expectProblem(response, 400, 'INVALID_REQUEST');
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('productId');
    });

    it('scenario save-conflict always answers 412, even with a matching If-Match', async () => {
      const db = setup('save-conflict');
      const product5 = requireProduct(db, 5);
      const input = inputOf(product5);

      const response = await put(productUrl(5), db, input, { 'If-Match': '"0"' });

      const body = await expectProblem(response, 412, 'PRODUCT_VERSION_CONFLICT');
      const params = body['params'];
      expectRecord(params);
      expect(readNumber(params, 'expected')).toBe(0);
      expect(readNumber(params, 'received')).toBe(0);
    });

    it('rejects a slug change (422, /slug SLUG_IMMUTABLE)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input = { ...inputOf(product5), slug: 'honor-600-lite-renamed' };

      const response = await put(productUrl(5), db, input, { 'If-Match': '"0"' });

      const body = await expectProblem(response, 422, 'VALIDATION_FAILED');
      const errors = fieldErrorsOf(body);
      expect(errors).toEqual([{ path: '/slug', code: 'SLUG_IMMUTABLE', params: {} }]);
    });

    it('rejects featured past the limit on an active product (422, FEATURED_LIMIT)', async () => {
      const db = setup();
      const product5 = requireProduct(db, 5);
      const input = { ...inputOf(product5), featured: true };

      const response = await put(productUrl(5), db, input, { 'If-Match': '"0"' });

      const body = await expectProblem(response, 422, 'VALIDATION_FAILED');
      const errors = fieldErrorsOf(body);
      expect(errors).toEqual([{ path: '/featured', code: 'FEATURED_LIMIT', params: { max: 4 } }]);
    });

    it('allows featured:true on an archived product (200)', async () => {
      const db = setup();
      const product47 = requireProduct(db, 47);
      const input = { ...inputOf(product47), featured: true };

      const response = await put(productUrl(47), db, input, { 'If-Match': '"0"' });

      expect(response.status).toBe(200);
    });

    // Fails if replaceHandler stops calling csrfRejection first.
    it('rejects without the XSRF header (403)', async () => {
      const db = setup();
      const input = inputOf(requireProduct(db, 5));

      const response = await put(productUrl(5), db, input, {
        'If-Match': '"0"',
        [XSRF_HEADER]: undefined,
      });

      await expectProblem(response, 403, 'CSRF_TOKEN_INVALID');
    });

    // Fails if replaceHandler stops calling sessionRejection.
    it('rejects with no session (401)', async () => {
      const db = setup();
      db.sessionAdminId = null;
      const input = inputOf(requireProduct(db, 5));

      const response = await put(productUrl(5), db, input, { 'If-Match': '"0"' });

      await expectProblem(response, 401, 'UNAUTHENTICATED');
    });
  });

  describe('archive', () => {
    it('archives a product: 200, status archived, archivedAt present, version 1', async () => {
      const db = setup();

      const response = await action(archiveUrl(5), db, { 'If-Match': '"0"' });

      expect(response.status).toBe(200);
      expect(response.headers.get('ETag')).toBe('"1"');
      const body = await readJsonRecord(response);
      expect(readString(body, 'status')).toBe('archived');
      expect(typeof body['archivedAt']).toBe('string');
      expect(readNumber(body, 'version')).toBe(1);
    });

    it('archiving an already archived product is idempotent (200, version unchanged)', async () => {
      const db = setup();
      const first = await action(archiveUrl(5), db, { 'If-Match': '"0"' });
      expect(first.status).toBe(200);

      const second = await action(archiveUrl(5), db, { 'If-Match': '"1"' });

      expect(second.status).toBe(200);
      const body = await readJsonRecord(second);
      expect(readNumber(body, 'version')).toBe(1);
    });

    it('rejects without If-Match (428)', async () => {
      const db = setup();

      const response = await action(archiveUrl(5), db);

      await expectProblem(response, 428, 'PRECONDITION_REQUIRED');
    });

    it('rejects a stale If-Match (412)', async () => {
      const db = setup();

      const response = await action(archiveUrl(5), db, { 'If-Match': '"7"' });

      await expectProblem(response, 412, 'PRODUCT_VERSION_CONFLICT');
    });

    it('rejects an unknown product id (404)', async () => {
      const db = setup();

      const response = await action(archiveUrl(999), db, { 'If-Match': '"0"' });

      await expectProblem(response, 404, 'NOT_FOUND');
    });

    // Fails if archiveHandler stops calling csrfRejection first.
    it('rejects without the XSRF header (403)', async () => {
      const db = setup();

      const response = await action(archiveUrl(5), db, {
        'If-Match': '"0"',
        [XSRF_HEADER]: undefined,
      });

      await expectProblem(response, 403, 'CSRF_TOKEN_INVALID');
    });

    // Fails if archiveHandler stops calling sessionRejection.
    it('rejects with no session (401)', async () => {
      const db = setup();
      db.sessionAdminId = null;

      const response = await action(archiveUrl(5), db, { 'If-Match': '"0"' });

      await expectProblem(response, 401, 'UNAUTHENTICATED');
    });
  });

  describe('restore', () => {
    it('restores an archived product: 200, status active, no archivedAt, version 1', async () => {
      const db = setup();

      const response = await action(restoreUrl(47), db, { 'If-Match': '"0"' });

      expect(response.status).toBe(200);
      const body = await readJsonRecord(response);
      expect(readString(body, 'status')).toBe('active');
      expect(body['archivedAt']).toBeUndefined();
      expect(readNumber(body, 'version')).toBe(1);
    });

    it('restoring an already active product is idempotent (200, version unchanged)', async () => {
      const db = setup();

      const response = await action(restoreUrl(5), db, { 'If-Match': '"0"' });

      expect(response.status).toBe(200);
      const body = await readJsonRecord(response);
      expect(readNumber(body, 'version')).toBe(0);
    });

    it('rejects restoring a featured product past the limit (409, FEATURED_LIMIT)', async () => {
      const db = setup();
      const product47 = requireProduct(db, 47);
      db.products.set(47, { ...product47, featured: true });

      const response = await action(restoreUrl(47), db, { 'If-Match': '"0"' });

      await expectProblem(response, 409, 'FEATURED_LIMIT');
    });

    // Fails if restoreHandler stops answering 428 when If-Match is absent.
    it('rejects without If-Match (428)', async () => {
      const db = setup();

      const response = await action(restoreUrl(47), db);

      await expectProblem(response, 428, 'PRECONDITION_REQUIRED');
    });

    // Fails if restoreHandler stops comparing If-Match with the stored version.
    it('rejects a stale If-Match (412, expected 0 received 7)', async () => {
      const db = setup();

      const response = await action(restoreUrl(47), db, { 'If-Match': '"7"' });

      const body = await expectProblem(response, 412, 'PRODUCT_VERSION_CONFLICT');
      const params = body['params'];
      expectRecord(params);
      expect(readNumber(params, 'expected')).toBe(0);
      expect(readNumber(params, 'received')).toBe(7);
    });

    // Fails if restoreHandler stops answering 404 for an id the catalogue does not hold.
    it('rejects an unknown product id (404, params.productId 999)', async () => {
      const db = setup();

      const response = await action(restoreUrl(999), db, { 'If-Match': '"0"' });

      const body = await expectProblem(response, 404, 'NOT_FOUND');
      const params = body['params'];
      expectRecord(params);
      expect(readNumber(params, 'productId')).toBe(999);
    });

    // Fails if restoreHandler stops calling csrfRejection first.
    it('rejects without the XSRF header (403)', async () => {
      const db = setup();

      const response = await action(restoreUrl(47), db, {
        'If-Match': '"0"',
        [XSRF_HEADER]: undefined,
      });

      await expectProblem(response, 403, 'CSRF_TOKEN_INVALID');
    });

    // Fails if restoreHandler stops calling sessionRejection.
    it('rejects with no session (401)', async () => {
      const db = setup();
      db.sessionAdminId = null;

      const response = await action(restoreUrl(47), db, { 'If-Match': '"0"' });

      await expectProblem(response, 401, 'UNAUTHENTICATED');
    });
  });
});
