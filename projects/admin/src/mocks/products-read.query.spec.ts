/**
 * Spec for the list query conversions in `productsReadHandlers`
 * (projects/admin/src/mocks/products-read.handlers.ts): the `brand`
 * trimming rule (one value is split on `,` and each element trimmed
 * like Java's `String.trim()`, several values are taken as sent) plus
 * two `parseListQuery` gaps (`pageSize=0`, `outOfStock=maybe`). The
 * backend answers this spec pins were measured on a booted jar
 * (branch `eggprojec/mim-296-admin`, PostgreSQL, signed in).
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

describe('productsReadHandlers list query — parameter gaps', () => {
  it('returns 400 MIN when pageSize is 0', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?pageSize=0`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter is not acceptable',
      params: { parameter: 'pageSize', reason: 'MIN' },
    });
  });

  it('returns 400 when outOfStock is not a boolean', async () => {
    signedIn();
    const { status, body } = await getJson(`${LIST_URL}?outOfStock=maybe`);
    expect(status).toBe(400);
    expect(asProblem(body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'outOfStock', reason: 'type Boolean' },
    });
  });
});

describe('productsReadHandlers list query — brand trimming', () => {
  it('trims each element of one comma-separated brand value', async () => {
    signedIn();
    const padded = await getJson(`${LIST_URL}?brand=%20Apple%20,%20Samsung%20&pageSize=100`);
    const repeated = await getJson(`${LIST_URL}?brand=Apple&brand=Samsung&pageSize=100`);
    expect(padded.status).toBe(200);
    expect(asListPage(repeated.body).totalElements).toBe(22);
    expect(padded.body).toEqual(repeated.body);
  });

  it('keeps two brand values as sent, so a padded one matches nothing', async () => {
    signedIn();
    const padded = await getJson(`${LIST_URL}?brand=%20Apple&brand=Samsung&pageSize=100`);
    const samsungOnly = await getJson(`${LIST_URL}?brand=Samsung&pageSize=100`);
    expect(padded.status).toBe(200);
    expect(padded.body).toEqual(samsungOnly.body);
  });

  it('trims a U+001F like Java trim, but keeps a no-break space', async () => {
    signedIn();
    const controlPadded = await getJson(`${LIST_URL}?brand=%1FApple&pageSize=100`);
    const plain = await getJson(`${LIST_URL}?brand=Apple&pageSize=100`);
    expect(controlPadded.body).toEqual(plain.body);

    const nbspPadded = await getJson(`${LIST_URL}?brand=%C2%A0Apple&pageSize=100`);
    expect(asListPage(nbspPadded.body).totalElements).toBe(0);
  });
});
