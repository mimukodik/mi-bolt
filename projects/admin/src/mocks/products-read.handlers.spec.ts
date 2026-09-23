/**
 * Spec for `productsReadHandlers`
 * (projects/admin/src/mocks/products-read.handlers.ts).
 *
 * The handler answers `GET /api/v1/admin/products`,
 * `GET /api/v1/admin/products/:productId` and
 * `GET /api/v1/admin/brands` exactly the way the backend's query
 * service does: every list call goes through `sessionRejection` (401
 * without an admin), then an unknown query key, then a query or path
 * value that does not convert or that breaks its constraint, worded
 * exactly as `backend-answers.ts` words `ProblemAdvice` (MIM-334, fix
 * round F7-R2), then applies filters, the sort key with the id as the
 * tie-break, paging, and the list-item projection; the detail call
 * carries the `ETag` header whose value is the product `version`
 * quoted; the brands call returns the distinct brand names, archived
 * included, sorted case-insensitively. The `list-error` and
 * `empty-catalog` scenarios follow the contract.
 *
 * Values are read from the seed and the fixture directly, never
 * computed with the code under test: the catalogue has 48 products,
 * 46 active and 2 archived (`xiaomi-17t`, `apple-iphone-15`); the
 * default sort is `rank` ascending so the first page is the first
 * three seeds in source order. Brand counts (active only, the default
 * status filter): Apple 10, Samsung 12, Xiaomi 8, HONOR 8, Google
 * Pixel 4, Motorola 1, Vivo 3. The brief's `brand=Apple,Nokia` case
 * uses `HONOR,Vivo` instead: the seed has no `Nokia` brand, and HONOR
 * (8) plus Vivo (3) is 11 active products with no archived member.
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

/** The five fields every `Problem` rejection is pinned on: status, code, title, detail, params. */
interface ProblemShape {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  readonly params: unknown;
}

function asProblem(value: unknown): ProblemShape {
  if (!isRecord(value)) throw new Error('expected a problem');
  return {
    status: numberOf(value['status']),
    code: stringOf(value['code']),
    title: stringOf(value['title']),
    detail: stringOf(value['detail']),
    params: value['params'],
  };
}

describe('productsReadHandlers list — auth and validation', () => {
  it('returns 401 when no admin is signed in', async () => {
    server?.use(...adminHandlers(createDb()));
    const { status, body } = await getJson(LIST_URL);
    expect(status).toBe(401);
    expect(body).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  // Fails if firstUnknownQueryParam ever lets an undeclared key through phase 1,
  // or if unknownQueryParameter's wording drifts from ProblemAdvice.
  it('returns 400 for an unknown query parameter and names it', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?colour=red`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Unknown query parameter',
      params: { parameter: 'colour' },
    });
  });

  // Fails if phase 3's page MIN check ever runs before phase 1's unknown-key check.
  it('rejects an unknown query parameter before checking page (phase 1 before phase 3)', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?colour=red&page=0`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Unknown query parameter',
      params: { parameter: 'colour' },
    });
  });

  // Fails if convertEnum accepts a status value not in STATUS_VALUES.
  it('returns 400 when status is outside the enum', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?status=bogus`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'status', reason: 'type AdminProductStatusFilter' },
    });
  });

  // Fails if STATUS_VALUES drops the ACTIVE constant-name alias.
  it('accepts the ACTIVE constant name for status, same items as no query', async () => {
    signedIn();
    const noQuery = await getJson(LIST_URL);
    const constantName = await getJson(`${LIST_URL}?status=ACTIVE`);
    expect(constantName.status).toBe(200);
    expect(constantName.body).toEqual(noQuery.body);
  });

  // Fails if convertEnum starts matching status case-insensitively instead of by exact key.
  it('rejects a status value that only differs in case', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?status=Active`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'status', reason: 'type AdminProductStatusFilter' },
    });
  });

  // Fails if convertEnum stops treating '' as the default rather than an unmapped value.
  it('treats an empty status as the default, same items as no query', async () => {
    signedIn();
    const noQuery = await getJson(LIST_URL);
    const emptyStatus = await getJson(`${LIST_URL}?status=`);
    expect(emptyStatus.status).toBe(200);
    expect(emptyStatus.body).toEqual(noQuery.body);
  });

  // Fails if SORT_VALUES or DIRECTION_VALUES drop a constant-name alias.
  it('accepts the RELEASED_AT/DESC constant names, same order as the wire values', async () => {
    signedIn();
    const wireValues = await getJson(`${LIST_URL}?sort=releasedAt&direction=desc`);
    const constantNames = await getJson(`${LIST_URL}?sort=RELEASED_AT&direction=DESC`);
    expect(constantNames.status).toBe(200);
    expect(constantNames.body).toEqual(wireValues.body);
  });

  // Fails if convertEnum accepts a sort value not in SORT_VALUES.
  it('returns 400 when sort is outside the enum', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?sort=bogus`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'sort', reason: 'type AdminProductSortField' },
    });
  });

  // Fails if convertEnum accepts a direction value not in DIRECTION_VALUES.
  it('returns 400 when direction is outside the enum', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?direction=up`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'direction', reason: 'type SortDirection' },
    });
  });

  // Fails if convertBoolean drops the 'yes' alias for true.
  it('accepts featured=YES as true, only featured products', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?featured=YES`);
    expect(status).toBe(200);
    const page = asListPage(body);
    expect(page.totalElements).toBe(4);
    expect(page.items.every((item) => item.featured)).toBe(true);
  });

  // Fails if convertBoolean stops mapping '0' to false.
  it('accepts featured=0 as false, only products that are not featured', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?featured=0&pageSize=100`);
    expect(status).toBe(200);
    const page = asListPage(body);
    expect(page.totalElements).toBe(42);
    expect(page.items.every((item) => !item.featured)).toBe(true);
  });

  // Fails if convertBoolean stops treating '' as "no filter".
  it('treats an empty featured as no filter, same items as no query', async () => {
    signedIn();
    const noQuery = await getJson(LIST_URL);
    const emptyFeatured = await getJson(`${LIST_URL}?featured=`);
    expect(emptyFeatured.status).toBe(200);
    expect(emptyFeatured.body).toEqual(noQuery.body);
  });

  // Fails if the 'featured' name or the Boolean reason drifts from wrongType's wording.
  it('returns 400 when featured is not a boolean', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?featured=maybe`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'featured', reason: 'type Boolean' },
    });
  });

  // Fails if convertBoolean stops mapping '0' to false for outOfStock (it used to be rejected outright).
  it('accepts outOfStock=0 as false; every seed product has stock, so nothing is excluded', async () => {
    signedIn();
    const noQuery = await getJson(LIST_URL);
    const falseOutOfStock = await getJson(`${LIST_URL}?outOfStock=0`);
    expect(falseOutOfStock.status).toBe(200);
    expect(falseOutOfStock.body).toEqual(noQuery.body);
  });

  // Fails if convertBoolean stops trimming surrounding whitespace before matching 'on'.
  it('accepts outOfStock=" on " (trimmed) as true, only zero-stock products', async () => {
    const db = signedIn();
    const product = db.products.get(1);
    if (product === undefined) throw new Error('seed product 1 missing');
    product.variants[0].stock = 0;

    const { status, body } = await getJson(`${LIST_URL}?outOfStock=%20on%20`);
    expect(status).toBe(200);
    const page = asListPage(body);
    expect(page.totalElements).toBe(1);
    expect(page.items[0]?.slug).toBe('motorola-edge-50-fusion');
  });

  // Fails if convertInteger accepts a decimal-point shape like '1.5'.
  it('returns 400 when page is not an integer', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?page=1.5`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'page', reason: 'type Integer' },
    });
  });

  // Fails if isInt32 stops bounding a converted decimal to the 32-bit signed range.
  it('returns 400 when page is outside the 32-bit signed range', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?page=99999999999`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'page', reason: 'type Integer' },
    });
  });

  // Fails if convertInteger stops accepting the 0x hex shape.
  it('accepts a 0x-prefixed hex page', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?page=0x2&pageSize=1`);
    expect(status).toBe(200);
    const page = asListPage(body);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(1);
  });

  // Fails if HEX_INTEGER (line 104) still allows a leading '+' before a hex prefix: Spring's
  // NumberUtils.isHexNumber strips only '-', so '+0x1' falls through to Integer.valueOf and errors.
  it('rejects a +0x-prefixed page (the backend only strips a leading minus before hex)', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?page=%2B0x1`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'page', reason: 'type Integer' },
    });
  });

  // Fails if DECIMAL_INTEGER stops accepting a leading '+' on a decimal page.
  it('accepts a +-prefixed decimal page', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?page=%2B1`);
    expect(status).toBe(200);
    const page = asListPage(body);
    expect(page.page).toBe(1);
  });

  // Fails if phase 3's pageSize MAX check ever runs before phase 2's page conversion.
  it('rejects an unconvertible page before checking pageSize (phase 2 before phase 3)', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?page=abc&pageSize=500`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'page', reason: 'type Integer' },
    });
  });

  // Fails if the page MIN constraint or its reason drifts from notAcceptable's wording.
  it('returns 400 when page is below 1', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?page=0`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter is not acceptable',
      params: { parameter: 'page', reason: 'MIN' },
    });
  });

  // Fails if the pageSize MAX constraint or its reason drifts from notAcceptable's wording.
  it('returns 400 when pageSize is above 100', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?pageSize=101`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter is not acceptable',
      params: { parameter: 'pageSize', reason: 'MAX' },
    });
  });

  // Fails if phase 3 stops checking constraints in declaration order (page before pageSize).
  it('reports page, not pageSize, when both violate a constraint (the lowest index wins)', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?page=0&pageSize=500`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter is not acceptable',
      params: { parameter: 'page', reason: 'MIN' },
    });
  });

  // Fails if the q SIZE constraint stops running before the page MIN constraint (q's declaration index is lower).
  it('reports q, not page, when both violate a constraint', async () => {
    signedIn();
    const q = 'x'.repeat(101);
    const { status, body } = await getJson(`${LIST_URL}?q=${q}&page=0`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter is not acceptable',
      params: { parameter: 'q', reason: 'SIZE' },
    });
  });

  // Fails if convertBrand stops treating an absent brand as no filter.
  it('treats an empty brand as no filter, same items as no query', async () => {
    signedIn();
    const noQuery = await getJson(LIST_URL);
    const emptyBrand = await getJson(`${LIST_URL}?brand=`);
    expect(emptyBrand.status).toBe(200);
    expect(emptyBrand.body).toEqual(noQuery.body);
  });

  // Fails if convertBrand stops splitting a single repeated value on ','.
  it('splits a single brand=HONOR,Vivo value on the comma', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?brand=HONOR,Vivo`);
    expect(status).toBe(200);
    const page = asListPage(body);
    expect(page.totalElements).toBe(11);
    expect(new Set(page.items.map((item) => item.brand))).toEqual(new Set(['HONOR', 'Vivo']));
  });

  // Fails if convertBrand starts splitting two-or-more repeated values instead of taking them as given.
  it('ignores empty brand values and filters only the named ones', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?brand=&brand=Apple`);
    expect(status).toBe(200);
    const page = asListPage(body);
    expect(page.totalElements).toBe(10);
    expect(new Set(page.items.map((item) => item.brand))).toEqual(new Set(['Apple']));
  });

  // Fails if the 503 detail falls back to the title instead of serviceUnavailable's wording.
  it('returns 503 SERVICE_UNAVAILABLE for list-error', async () => {
    signedIn('list-error');
    const { status, body } = await getJson(LIST_URL);
    expect(status).toBe(503);
    expect(asProblem(body)).toEqual({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      title: 'Service unavailable',
      detail: 'The service is temporarily unavailable',
      params: undefined,
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

  // Fails if the 'productId' name or the Long reason drifts from wrongType's wording.
  it('returns 400 when productId is not an integer', async () => {
    signedIn();
    const { status, body } = await getJson(detailUrl(0).replace(/0$/, 'abc'));
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'productId', reason: 'type Long' },
    });
  });

  // Fails if the productId MIN constraint or its reason drifts from notAcceptable's wording.
  it('returns 400 when productId is below 1', async () => {
    signedIn();
    const { status, body } = await getJson(detailUrl(0));
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter is not acceptable',
      params: { parameter: 'productId', reason: 'MIN' },
    });
  });

  // Fails if convertLong stops bounding a converted decimal to the 64-bit signed range.
  it('returns 400 when productId is outside the 64-bit signed range', async () => {
    signedIn();
    const { status, body } = await getJson(detailUrl(0).replace(/0$/, '99999999999999999999'));
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'productId', reason: 'type Long' },
    });
  });

  // Fails if convertLong stops accepting the 0x hex shape for productId.
  it('accepts a 0x-prefixed hex productId', async () => {
    signedIn();
    const { status, body } = await getJson(detailUrl(0).replace(/0$/, '0x1'));
    expect(status).toBe(200);
    const product = asDetail(body);
    expect(product.id).toBe(1);
  });

  // Fails if HEX_INTEGER (line 104) still allows a leading '+' before a hex prefix: Spring's
  // NumberUtils.isHexNumber strips only '-', so '+0x1' falls through to Long.valueOf and errors.
  it('rejects a +0x-prefixed productId (the backend only strips a leading minus before hex)', async () => {
    signedIn();
    const { status, body } = await getJson(detailUrl(0).replace(/0$/, '+0x1'));
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'productId', reason: 'type Long' },
    });
  });

  // Fails if convertLong stops applying the '-' sign to a hex magnitude.
  it('applies the sign to a negative hex productId, then rejects it as below MIN', async () => {
    signedIn();
    const { status, body } = await getJson(detailUrl(0).replace(/0$/, '-0x1'));
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter is not acceptable',
      params: { parameter: 'productId', reason: 'MIN' },
    });
  });

  // Fails if the detail handler stops checking for an unknown query key (getAdminProduct declares none).
  it('returns 400 for an unknown query parameter on a valid productId', async () => {
    signedIn();
    const { status, body } = await getJson(`${detailUrl(1)}?x=1`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Unknown query parameter',
      params: { parameter: 'x' },
    });
  });

  // Fails if the unknown-key check ever runs after the path conversion instead of before it.
  it('rejects an unknown query parameter before an invalid productId', async () => {
    signedIn();
    const { status, body } = await getJson(`${detailUrl(0).replace(/0$/, 'abc')}?x=1`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Unknown query parameter',
      params: { parameter: 'x' },
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

  // Fails if the brands handler stops checking for an unknown query key (listAdminBrands declares none).
  it('returns 400 for an unknown query parameter', async () => {
    signedIn();
    const { status, body } = await getJson(`${BRANDS_URL}?sort=name`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Unknown query parameter',
      params: { parameter: 'sort' },
    });
  });
});
