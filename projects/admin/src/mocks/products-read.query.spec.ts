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

describe('productsReadHandlers list query — Java conversions (MIM-296 follow-up)', () => {
  // Fails if convertBoolean stops trimming a Java-whitespace control character (U+0001, U+001F) like String.trim().
  it('accepts featured with a control character trimmed like Java String.trim()', async () => {
    signedIn();
    const plain = await getJson(`${LIST_URL}?featured=true`);
    const soh = await getJson(`${LIST_URL}?featured=%01true`);
    const unitSeparator = await getJson(`${LIST_URL}?featured=%1Ftrue`);
    expect(soh.status).toBe(200);
    expect(unitSeparator.status).toBe(200);
    expect(asListPage(soh.body).totalElements).toBe(asListPage(plain.body).totalElements);
    expect(asListPage(unitSeparator.body).totalElements).toBe(asListPage(plain.body).totalElements);
  });

  // Fails if convertBoolean trims a character JS trim() strips but Java's String.trim() does not
  // (U+00A0, U+2003, U+FEFF are all above 0x20, so Java leaves them and the value fails to convert).
  it('rejects featured/outOfStock padded with a character Java trim does not strip', async () => {
    signedIn();
    const nbsp = await getJson(`${LIST_URL}?featured=%C2%A0true`);
    const emSpace = await getJson(`${LIST_URL}?featured=%E2%80%83true`);
    const bom = await getJson(`${LIST_URL}?featured=%EF%BB%BFtrue`);
    for (const { status, body } of [nbsp, emSpace, bom]) {
      expect(status).toBe(400);
      expect(asProblem(body)).toEqual({
        status: 400,
        code: 'INVALID_REQUEST',
        title: 'Invalid request',
        detail: 'Query or path parameter has the wrong type',
        params: { parameter: 'featured', reason: 'type Boolean' },
      });
    }
    const outOfStockNbsp = await getJson(`${LIST_URL}?outOfStock=%C2%A0true`);
    expect(outOfStockNbsp.status).toBe(400);
    expect(asProblem(outOfStockNbsp.body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'outOfStock', reason: 'type Boolean' },
    });
  });

  // Fails if convertInteger stops removing a Character.isWhitespace character that sits inside the digits
  // (StringUtils.trimAllWhitespace removes every such character, wherever it stands, not only at the ends).
  it('removes an inner Java-whitespace character from pageSize like StringUtils.trimAllWhitespace', async () => {
    signedIn();
    const emSpace = await getJson(`${LIST_URL}?pageSize=1%E2%80%830`);
    const unitSeparator = await getJson(`${LIST_URL}?pageSize=1%1F0`);
    const ideographicSpace = await getJson(`${LIST_URL}?pageSize=1%E3%80%800`);
    for (const { status, body } of [emSpace, unitSeparator, ideographicSpace]) {
      expect(status).toBe(200);
      expect(asListPage(body).pageSize).toBe(10);
    }
  });

  // Fails if convertInteger/convertLong remove a character StringUtils.trimAllWhitespace does not
  // (U+00A0, U+202F, U+2007, U+FEFF, U+0085 are not Character.isWhitespace; U+0001 is a control the
  // backend does not treat as whitespace either), so the digits stay split and the value does not convert.
  it('rejects pageSize/page with an inner character that is not Java whitespace', async () => {
    signedIn();
    const nbsp = await getJson(`${LIST_URL}?pageSize=1%C2%A00`);
    const narrowNbsp = await getJson(`${LIST_URL}?pageSize=1%E2%80%AF0`);
    const figureSpace = await getJson(`${LIST_URL}?pageSize=1%E2%80%870`);
    const bom = await getJson(`${LIST_URL}?pageSize=1%EF%BB%BF0`);
    const nel = await getJson(`${LIST_URL}?pageSize=1%C2%850`);
    const soh = await getJson(`${LIST_URL}?pageSize=1%01%30`);
    for (const { status, body } of [nbsp, narrowNbsp, figureSpace, bom, nel, soh]) {
      expect(status).toBe(400);
      expect(asProblem(body)).toEqual({
        status: 400,
        code: 'INVALID_REQUEST',
        title: 'Invalid request',
        detail: 'Query or path parameter has the wrong type',
        params: { parameter: 'pageSize', reason: 'type Integer' },
      });
    }
    const pageNbsp = await getJson(`${LIST_URL}?page=%C2%A01`);
    expect(pageNbsp.status).toBe(400);
    expect(asProblem(pageNbsp.body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'page', reason: 'type Integer' },
    });
  });

  // Fails if convertLong (parseProductId's path) stops applying the same Java-whitespace removal as the query integers.
  it('applies the same Java-whitespace rule to the path productId', async () => {
    signedIn();
    const emSpacePadded = await getJson(detailUrl(0).replace(/0$/, '%E2%80%833'));
    expect(emSpacePadded.status).toBe(200);
    expect(isRecord(emSpacePadded.body) ? emSpacePadded.body['id'] : undefined).toBe(3);

    const nbspPadded = await getJson(detailUrl(0).replace(/0$/, '%C2%A03'));
    expect(nbspPadded.status).toBe(400);
    expect(asProblem(nbspPadded.body)).toEqual({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'productId', reason: 'type Long' },
    });
  });

  // Fails if matchesQuery/normalise stop matching the backend: the needle is trimmed with Java's
  // String.trim() (so a no-break space survives and matches nothing) and the haystack is never trimmed.
  it('trims only the search needle with Java String.trim(), like AdminProductQueryService', async () => {
    signedIn();
    const nbspApple = await getJson(`${LIST_URL}?q=%C2%A0Apple`);
    expect(nbspApple.status).toBe(200);
    expect(asListPage(nbspApple.body).totalElements).toBe(0);

    const spacedApple = await getJson(`${LIST_URL}?q=%20Apple%20`);
    const plainApple = await getJson(`${LIST_URL}?q=Apple`);
    expect(spacedApple.status).toBe(200);
    expect(asListPage(spacedApple.body).totalElements).toBe(
      asListPage(plainApple.body).totalElements,
    );

    const nbspOnly = await getJson(`${LIST_URL}?q=%C2%A0`);
    expect(nbspOnly.status).toBe(200);
    expect(asListPage(nbspOnly.body).totalElements).toBe(0);

    const spacesOnly = await getJson(`${LIST_URL}?q=%20%20`);
    const noQuery = await getJson(LIST_URL);
    expect(spacesOnly.status).toBe(200);
    expect(asListPage(spacesOnly.body).totalElements).toBe(asListPage(noQuery.body).totalElements);
  });
});
