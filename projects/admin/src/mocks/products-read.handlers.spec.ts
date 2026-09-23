/**
 * Spec for `productsReadHandlers`
 * (projects/admin/src/mocks/products-read.handlers.ts).
 *
 * The handler answers `GET /api/v1/admin/products`,
 * `GET /api/v1/admin/products/:productId` and
 * `GET /api/v1/admin/brands` exactly the way the backend's query
 * service does: every list call goes through `sessionRejection` (401
 * without an admin), then validates the query and path parameters
 * with the same 400 shape, then applies filters, the sort key with
 * the id as the tie-break, paging, and the list-item projection;
 * the detail call carries the `ETag` header whose value is the
 * product `version` quoted; the brands call returns the distinct
 * brand names, archived included, sorted case-insensitively. The
 * `list-error` and `empty-catalog` scenarios follow the contract.
 *
 * Values are read from the seed and the fixture directly, never
 * computed with the code under test: the catalogue has 48 products,
 * 46 active and 2 archived (`xiaomi-17t`, `apple-iphone-15`); the
 * default sort is `rank` ascending so the first page is the first
 * three seeds in source order.
 */
import { describe, expect, it } from 'vitest';

import { server, useMswServer } from '../testing/msw-server';
import { isRecord } from '../app/core/is-record';
import type { MockDb } from './db';
import { createDb } from './db';
import { adminHandlers } from './handlers';
import { SEED_ADMIN } from './seed';

useMswServer();

const LIST_URL = new URL('/api/v1/admin/products', document.baseURI).href;
const BRANDS_URL = new URL('/api/v1/admin/brands', document.baseURI).href;
const detailUrl = (id: number): string =>
  new URL(`/api/v1/admin/products/${String(id)}`, document.baseURI).href;

function signedIn(scenario: 'default' | 'empty-catalog' | 'list-error' = 'default'): MockDb {
  const db = createDb(scenario);
  db.sessionAdminId = SEED_ADMIN.id;
  server?.use(...adminHandlers(db));
  return db;
}

interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
}

async function getJson(url: string): Promise<JsonResponse> {
  const response = await fetch(url);
  return { status: response.status, body: await response.json(), headers: response.headers };
}

function arrayOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOf(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

interface ListItemShape {
  readonly id: number;
  readonly slug: string;
  readonly brand: string;
  readonly featured: boolean;
}

function asListItem(value: unknown): ListItemShape {
  if (!isRecord(value)) throw new Error('expected list item');
  return {
    id: numberOf(value['id']),
    slug: stringOf(value['slug']),
    brand: stringOf(value['brand']),
    featured: value['featured'] === true,
  };
}

interface ListPageShape {
  readonly items: readonly ListItemShape[];
  readonly page: number;
  readonly pageSize: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

function asListPage(value: unknown): ListPageShape {
  if (!isRecord(value)) throw new Error('expected list page');
  return {
    items: arrayOf(value['items']).map(asListItem),
    page: numberOf(value['page']),
    pageSize: numberOf(value['pageSize']),
    totalElements: numberOf(value['totalElements']),
    totalPages: numberOf(value['totalPages']),
  };
}

interface DetailShape {
  readonly id: number;
  readonly slug: string;
  readonly version: number;
}

function asDetail(value: unknown): DetailShape {
  if (!isRecord(value)) throw new Error('expected detail');
  return {
    id: numberOf(value['id']),
    slug: stringOf(value['slug']),
    version: numberOf(value['version']),
  };
}

function asStringArray(value: unknown): readonly string[] {
  return arrayOf(value).map(stringOf);
}

describe('productsReadHandlers list — auth and validation', () => {
  it('returns 401 when no admin is signed in', async () => {
    server?.use(...adminHandlers(createDb()));
    const { status, body } = await getJson(LIST_URL);
    expect(status).toBe(401);
    expect(body).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('returns 400 when pageSize > 100', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?pageSize=101`);
    expect(status).toBe(400);
    expect(body).toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
      params: { parameter: 'pageSize' },
    });
  });

  it('returns 400 when sort is outside the enum', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?sort=bogus`);
    expect(status).toBe(400);
    expect(body).toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
      params: { parameter: 'sort' },
    });
  });
});

describe('productsReadHandlers list — default behaviour', () => {
  it('pages the catalogue by rank asc; page 1 has the first three seeds', async () => {
    signedIn();
    const { status, body } = await getJson(LIST_URL);
    expect(status).toBe(200);
    const page = asListPage(body);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(50);
    expect(page.totalElements).toBe(46);
    expect(page.totalPages).toBe(1);
    expect(page.items.slice(0, 3).map((item) => item.slug)).toEqual([
      'motorola-edge-50-fusion',
      'honor-x7d',
      'apple-iphone-18-pro-max',
    ]);
  });
});

describe('productsReadHandlers list — sort fields', () => {
  it('sorts by name asc and the tie-break keeps the lower id first', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?sort=name&direction=asc`);
    const page = asListPage(body);
    expect(page.items.slice(0, 3).map((item) => item.slug)).toEqual([
      'apple-iphone-16',
      'apple-iphone-16-plus',
      'apple-iphone-16e',
    ]);
  });

  it('sorts by name desc and reverses only the name', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?sort=name&direction=desc`);
    const page = asListPage(body);
    expect(page.items[0]?.slug).toBe('xiaomi-redmi-note-17-pro-max-5g');
  });

  it('sorts by brand asc case-insensitively', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?sort=brand&direction=asc`);
    const page = asListPage(body);
    expect(page.items.slice(0, 3).map((item) => item.slug)).toEqual([
      'apple-iphone-18-pro-max',
      'apple-iphone-18-pro',
      'apple-iphone-17e',
    ]);
  });

  it('sorts by brand desc case-insensitively', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?sort=brand&direction=desc`);
    const page = asListPage(body);
    expect(page.items[0]?.brand).toBe('Xiaomi');
  });

  it('sorts by releasedAt asc', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?sort=releasedAt&direction=asc`);
    const page = asListPage(body);
    expect(page.items.slice(0, 3).map((item) => item.slug)).toEqual([
      'honor-magic-8-lite',
      'xiaomi-17t-pro',
      'honor-400-5g',
    ]);
  });

  it('sorts by minPrice asc', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?sort=minPrice&direction=asc`);
    const page = asListPage(body);
    expect(page.items.slice(0, 3).map((item) => item.slug)).toEqual([
      'honor-x7d',
      'motorola-edge-50-fusion',
      'xiaomi-redmi-17',
    ]);
  });

  it('sorts by totalStock desc', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?sort=totalStock&direction=desc`);
    const page = asListPage(body);
    expect(page.items[0]?.slug).toBe('apple-iphone-18-pro-max');
  });

  it('sorts by featured desc so featured products come first', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?sort=featured&direction=desc`);
    const page = asListPage(body);
    expect(page.items.slice(0, 4).every((item) => item.featured)).toBe(true);
    expect(page.items[0]?.slug).toBe('motorola-edge-50-fusion');
  });
});

describe('productsReadHandlers list — filters', () => {
  it('matches a slug-only substring', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?q=pixel-11`);
    const page = asListPage(body);
    expect(page.totalElements).toBe(3);
    expect(page.items.map((item) => item.slug)).toEqual([
      'google-pixel-11',
      'google-pixel-11-pro',
      'google-pixel-11-pro-xl',
    ]);
  });

  it('trims and upper-cases the query before matching', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?q=%20%20APPLE%20%20`);
    const page = asListPage(body);
    expect(page.totalElements).toBe(10);
    expect(page.items.every((item) => item.slug.startsWith('apple-'))).toBe(true);
  });

  it('ORs the brand filter across repeats', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?brand=Apple&brand=Samsung&pageSize=100`);
    const page = asListPage(body);
    expect(page.totalElements).toBe(22);
    expect(new Set(page.items.map((item) => item.brand))).toEqual(new Set(['Apple', 'Samsung']));
  });

  it('returns the two archived products for status=archived', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?status=archived`);
    const page = asListPage(body);
    expect(page.totalElements).toBe(2);
    expect(page.items.map((item) => item.slug)).toEqual(['xiaomi-17t', 'apple-iphone-15']);
  });

  it('returns every product for status=all', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?status=all&pageSize=100`);
    const page = asListPage(body);
    expect(page.totalElements).toBe(48);
    expect(page.items).toHaveLength(48);
  });

  it('keeps only featured products', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?featured=true`);
    const page = asListPage(body);
    expect(page.totalElements).toBe(4);
    expect(page.items.every((item) => item.featured)).toBe(true);
  });

  it('keeps only out-of-stock products after a variant goes to zero', async () => {
    const db = signedIn();
    const product = db.products.get(1);
    if (product === undefined) throw new Error('seed product 1 missing');
    product.variants[0].stock = 0;

    const { body } = await getJson(`${LIST_URL}?outOfStock=true`);
    const page = asListPage(body);
    expect(page.totalElements).toBe(1);
    expect(page.items[0]?.slug).toBe('motorola-edge-50-fusion');
  });

  it('excludes the zero-stock product when outOfStock=false', async () => {
    const db = signedIn();
    const product = db.products.get(1);
    if (product === undefined) throw new Error('seed product 1 missing');
    product.variants[0].stock = 0;

    const { body } = await getJson(`${LIST_URL}?outOfStock=false&pageSize=100`);
    const page = asListPage(body);
    expect(page.totalElements).toBe(45);
    expect(page.items.some((item) => item.slug === 'motorola-edge-50-fusion')).toBe(false);
  });
});

describe('productsReadHandlers list — paging', () => {
  it('returns the second page of size 1', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?page=2&pageSize=1`);
    const page = asListPage(body);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(1);
    expect(page.totalElements).toBe(46);
    expect(page.items[0]?.slug).toBe('honor-x7d');
  });

  it('returns empty items past the last page with the totals unchanged', async () => {
    signedIn();
    const { body } = await getJson(`${LIST_URL}?page=999&pageSize=10`);
    const page = asListPage(body);
    expect(page.items).toEqual([]);
    expect(page.totalElements).toBe(46);
    expect(page.totalPages).toBe(5);
  });
});

describe('productsReadHandlers list — tie-break', () => {
  it('breaks ties on id asc, even when direction=desc', async () => {
    const db = signedIn();
    const productA = db.products.get(1);
    const productB = db.products.get(2);
    if (productA === undefined || productB === undefined) throw new Error('seed missing');
    productB.name = productA.name;

    const asc = await getJson(`${LIST_URL}?sort=name&direction=asc`);
    const desc = await getJson(`${LIST_URL}?sort=name&direction=desc`);
    const ascPage = asListPage(asc.body);
    const descPage = asListPage(desc.body);
    const ascIds = ascPage.items
      .filter((item) => item.id === 1 || item.id === 2)
      .map((item) => item.id);
    const descIds = descPage.items
      .filter((item) => item.id === 1 || item.id === 2)
      .map((item) => item.id);
    expect(ascIds).toEqual([1, 2]);
    expect(descIds).toEqual([1, 2]);
  });
});

describe('productsReadHandlers list — scenarios', () => {
  it('returns 503 SERVICE_UNAVAILABLE for list-error', async () => {
    signedIn('list-error');
    const { status, body } = await getJson(LIST_URL);
    expect(status).toBe(503);
    expect(body).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });

  it('returns an empty page with zero totals for empty-catalog', async () => {
    signedIn('empty-catalog');
    const { status, body } = await getJson(LIST_URL);
    expect(status).toBe(200);
    const page = asListPage(body);
    expect(page.items).toEqual([]);
    expect(page.totalElements).toBe(0);
    expect(page.totalPages).toBe(0);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(50);
  });
});

describe('productsReadHandlers detail', () => {
  it('returns 200 with the full product and ETag "0" for seed product 1', async () => {
    signedIn();
    const { status, body, headers } = await getJson(detailUrl(1));
    expect(status).toBe(200);
    const product = asDetail(body);
    expect(product.id).toBe(1);
    expect(product.slug).toBe('motorola-edge-50-fusion');
    expect(product.version).toBe(0);
    expect(headers.get('ETag')).toBe('"0"');
  });

  it('returns 404 with the productId in params for an unknown id', async () => {
    signedIn();
    const { status, body } = await getJson(detailUrl(99999));
    expect(status).toBe(404);
    expect(body).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      params: { productId: 99999 },
    });
  });

  it('returns 400 when productId is not an integer', async () => {
    signedIn();
    const { status, body } = await getJson(detailUrl(0).replace(/0$/, 'abc'));
    expect(status).toBe(400);
    expect(body).toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
      params: { parameter: 'productId' },
    });
  });
});

describe('productsReadHandlers brands', () => {
  it('returns every brand, archived included, sorted case-insensitively', async () => {
    signedIn();
    const { status, body } = await getJson(BRANDS_URL);
    expect(status).toBe(200);
    expect(asStringArray(body)).toEqual([
      'Apple',
      'Google Pixel',
      'HONOR',
      'Motorola',
      'Samsung',
      'Vivo',
      'Xiaomi',
    ]);
  });
});
