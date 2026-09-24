/**
 * MIM-211 — cart mock focused unit suite.
 *
 * Each acceptance criterion has at least one named assertion in the
 * file. The suite exercises every line of `cart-store.ts` and the
 * cart handler dispatch path so the coverage gate stays green on
 * the owned runtime surface.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import catalogFixture from '../../../../docs/api/fixtures/catalog.json';
import { createHandlers } from '../create-handlers';
import {
  catalogStore,
  isCatalogFixtureShape,
  loadCatalogFixture,
} from '../catalog/catalog.handlers';
import { type VariantLookup } from '../catalog/catalog-store';
import { CART_TTL_MS, CartStore, type VariantLookupFn } from '../cart/cart-store';
import '../cart/cart.handlers';
import { Repository } from '../repository';
import {
  BUILT_IN_SCENARIOS,
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
  type Clock,
  type Ids,
} from '../scenarios';
import { server, useMswServer } from '../../../../tests/msw-server';
import { isRecord } from '../is-record';

useMswServer();

const SESSION_1 = 'spec-session-0001';
const SESSION_2 = 'spec-session-0002';
const VARIANT_MOTO_256 = 'motorola-edge-50-fusion--zold--256';
const VARIANT_HONOR_128 = 'honor-x7d--fekete--128';
const VARIANT_IPHONE_OOS = 'apple-iphone-17e--halvany-rozsaszin--256';
const VARIANT_IPHONE_BURGUNDI = 'apple-iphone-18-pro-max--burgundi--256';

let clock: Clock;
let ids: Ids;
let options: {
  repository: Repository;
  clock: Clock;
  ids: Ids;
  scenario: ReturnType<Repository['getScenario']>;
  apiRoot: string;
};

beforeAll(() => {
  if (!isCatalogFixtureShape(catalogFixture)) {
    throw new Error('[cart-mock.spec] committed fixture does not match expected shape');
  }
  loadCatalogFixture(catalogFixture);
});

beforeEach(() => {
  clock = createFixedClock('2026-09-20T10:00:00.000Z');
  ids = createDeterministicIds(1);
  options = {
    repository: new Repository(DEFAULT_SCENARIO, ids, clock),
    clock,
    ids,
    scenario: DEFAULT_SCENARIO,
    apiRoot: '/api/v1',
  };
  server.use(...createHandlers(options));
});

function session1Headers(): Record<string, string> {
  return { 'X-Demo-Session': SESSION_1, 'Content-Type': 'application/json' };
}

function session2Headers(): Record<string, string> {
  return { 'X-Demo-Session': SESSION_2, 'Content-Type': 'application/json' };
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

describe('GET /cart on a fresh session', () => {
  it('returns the session cart with ETag "1", empty items, and an expiresAt 30 days later', async () => {
    const res = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"1"');
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['items']).toEqual([]);
    expect(readNumber(body, 'lineCount')).toBe(0);
    expect(readNumber(body, 'totalQuantity')).toBe(0);
    expect(body['subtotal']).toEqual({ amount: 0, currency: 'HUF' });
    expect(body['notices']).toEqual([]);
    expect(readNumber(body, 'version')).toBe(1);
    expect(readString(body, 'expiresAt')).toBe('2026-10-20T10:00:00.000Z');
    const id = readString(body, 'id');
    expect(id.length).toBeGreaterThan(0);
    // Second GET returns the same id.
    const second = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    expect(second.status).toBe(200);
    const secondBody: unknown = await second.json();
    expectRecord(secondBody);
    expect(readString(secondBody, 'id')).toBe(id);
  });

  it('returns 400 INVALID_REQUEST when the X-Demo-Session header is missing', async () => {
    const res = await fetch('http://localhost/api/v1/cart');
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('INVALID_REQUEST');
    expect(body['type']).toBe('urn:mi-bolt:problem:invalid-request');
  });
});

describe('POST /cart/items', () => {
  it('adds a variant with the merged line shape, ETag bumped to "2"', async () => {
    const res = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 2 }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"2"');
    const body: unknown = await res.json();
    expectRecord(body);
    const items = body['items'];
    expect(Array.isArray(items)).toBe(true);
    if (!Array.isArray(items)) throw new Error('items not an array');
    expect(items).toHaveLength(1);
    const item: unknown = items[0];
    expectRecord(item);
    expect(item['productSlug']).toBe('motorola-edge-50-fusion');
    expect(item['variantSlug']).toBe('zold-256gb');
    expect(item['colorName']).toBe('Zöld');
    expect(item['storageGb']).toBe(256);
    expect(item['unitPrice']).toEqual({ amount: 89_990, currency: 'HUF' });
    expect(item['lineTotal']).toEqual({ amount: 179_980, currency: 'HUF' });
    expect(item['maxQuantity']).toBe(5);
    expect(item['availability']).toBe('in_stock');
    expect(item['quantity']).toBe(2);
    expect(readNumber(body, 'lineCount')).toBe(1);
    expect(readNumber(body, 'totalQuantity')).toBe(2);
    expect(body['subtotal']).toEqual({ amount: 179_980, currency: 'HUF' });
  });

  it('merges a second add into the same line and clamps at the variant cap with QUANTITY_LIMIT', async () => {
    const first = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 2 }),
    });
    expect(first.status).toBe(200);
    const second = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"2"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 3 }),
    });
    expect(second.status).toBe(200);
    expect(second.headers.get('ETag')).toBe('"3"');
    const body: unknown = await second.json();
    expectRecord(body);
    const items = body['items'];
    expect(Array.isArray(items)).toBe(true);
    if (!Array.isArray(items)) throw new Error('items not an array');
    expect(items).toHaveLength(1);
    const merged: unknown = items[0];
    expectRecord(merged);
    expect(readNumber(merged, 'quantity')).toBe(5);

    const over = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"3"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });
    expect(over.status).toBe(409);
    const overBody: unknown = await over.json();
    expectRecord(overBody);
    expect(overBody['code']).toBe('QUANTITY_LIMIT');
    expect(overBody['type']).toBe('urn:mi-bolt:problem:quantity-limit');
    expect(overBody['params']).toEqual({ max: 5, requested: 6 });

    // The following GET still shows version 3 (the rejection did not mutate).
    const get = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    expect(get.status).toBe(200);
    const getBody: unknown = await get.json();
    expectRecord(getBody);
    expect(readNumber(getBody, 'version')).toBe(3);
  });

  it('returns 412 CART_VERSION_CONFLICT when If-Match is stale, missing, or malformed', async () => {
    // First bring the cart to version 3.
    await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });
    await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"2"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });

    const stale = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });
    expect(stale.status).toBe(412);
    const staleBody: unknown = await stale.json();
    expectRecord(staleBody);
    expect(staleBody['code']).toBe('CART_VERSION_CONFLICT');
    expect(staleBody['params']).toEqual({ expected: 3, received: '"1"' });

    const missing = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: session1Headers(),
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });
    expect(missing.status).toBe(412);
    const missingBody: unknown = await missing.json();
    expectRecord(missingBody);
    expect(missingBody['params']).toEqual({ expected: 3, received: null });

    const malformed = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '3' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });
    expect(malformed.status).toBe(412);
  });

  it('returns 409 OUT_OF_STOCK, 404 NOT_FOUND, and 400 for invalid bodies', async () => {
    const oos = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_IPHONE_OOS, quantity: 1 }),
    });
    expect(oos.status).toBe(409);
    const oosBody: unknown = await oos.json();
    expectRecord(oosBody);
    expect(oosBody['code']).toBe('OUT_OF_STOCK');

    const unknown = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: 'nope', quantity: 1 }),
    });
    expect(unknown.status).toBe(404);
    const unknownBody: unknown = await unknown.json();
    expectRecord(unknownBody);
    expect(unknownBody['code']).toBe('NOT_FOUND');

    const zero = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 0 }),
    });
    expect(zero.status).toBe(400);

    const eleven = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 11 }),
    });
    expect(eleven.status).toBe(400);

    const fractional = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1.5 }),
    });
    expect(fractional.status).toBe(400);

    const missingVariant = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ quantity: 1 }),
    });
    expect(missingVariant.status).toBe(400);
  });
});

describe('PATCH /cart/items/:variantId', () => {
  it('updates the line, bumps version, and rejects above-cap with QUANTITY_LIMIT', async () => {
    await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 2 }),
    });

    const ok = await fetch(`http://localhost/api/v1/cart/items/${VARIANT_MOTO_256}`, {
      method: 'PATCH',
      headers: { ...session1Headers(), 'If-Match': '"2"' },
      body: JSON.stringify({ quantity: 1 }),
    });
    expect(ok.status).toBe(200);
    const okBody: unknown = await ok.json();
    expectRecord(okBody);
    const items = okBody['items'];
    expect(Array.isArray(items)).toBe(true);
    if (!Array.isArray(items)) throw new Error('items not an array');
    expect(items).toHaveLength(1);
    const line: unknown = items[0];
    expectRecord(line);
    expect(readNumber(line, 'quantity')).toBe(1);
    expect(readNumber(okBody, 'totalQuantity')).toBe(1);
    expect(readNumber(okBody, 'version')).toBe(3);

    const over = await fetch(`http://localhost/api/v1/cart/items/${VARIANT_MOTO_256}`, {
      method: 'PATCH',
      headers: { ...session1Headers(), 'If-Match': '"3"' },
      body: JSON.stringify({ quantity: 6 }),
    });
    expect(over.status).toBe(409);
    const overBody: unknown = await over.json();
    expectRecord(overBody);
    expect(overBody['code']).toBe('QUANTITY_LIMIT');
    expect(overBody['params']).toEqual({ max: 5, requested: 6 });

    const missing = await fetch(`http://localhost/api/v1/cart/items/${VARIANT_HONOR_128}`, {
      method: 'PATCH',
      headers: { ...session1Headers(), 'If-Match': '"3"' },
      body: JSON.stringify({ quantity: 1 }),
    });
    expect(missing.status).toBe(404);
  });
});

describe('DELETE /cart/items/:variantId', () => {
  it('drops an absent-but-known variant with 200 and unchanged version', async () => {
    const res = await fetch(`http://localhost/api/v1/cart/items/${VARIANT_HONOR_128}`, {
      method: 'DELETE',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(readNumber(body, 'version')).toBe(1);
    expect(body['items']).toEqual([]);
  });

  it('returns 404 NOT_FOUND for an unknown variant id', async () => {
    const res = await fetch('http://localhost/api/v1/cart/items/nope', {
      method: 'DELETE',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
    });
    expect(res.status).toBe(404);
  });

  it('drops an in-cart variant and bumps the version', async () => {
    await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });
    const res = await fetch(`http://localhost/api/v1/cart/items/${VARIANT_MOTO_256}`, {
      method: 'DELETE',
      headers: { ...session1Headers(), 'If-Match': '"2"' },
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['items']).toEqual([]);
    expect(readNumber(body, 'version')).toBe(3);
  });

  it('checks If-Match and expiry before the variant lookup', async () => {
    await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });

    const stale = await fetch('http://localhost/api/v1/cart/items/nope', {
      method: 'DELETE',
      headers: { ...session1Headers(), 'If-Match': '"9"' },
    });
    expect(stale.status).toBe(412);
    const staleBody: unknown = await stale.json();
    expectRecord(staleBody);
    expect(staleBody['code']).toBe('CART_VERSION_CONFLICT');

    clock.advanceMs(CART_TTL_MS);
    const expired = await fetch('http://localhost/api/v1/cart/items/nope', {
      method: 'DELETE',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
    });
    expect(expired.status).toBe(410);
    const expiredBody: unknown = await expired.json();
    expectRecord(expiredBody);
    expect(expiredBody['code']).toBe('CART_EXPIRED');
  });
});

describe('DELETE /cart/items (clear)', () => {
  it('empties two different lines and bumps the version by one', async () => {
    await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });
    await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"2"' },
      body: JSON.stringify({ variantId: VARIANT_HONOR_128, quantity: 1 }),
    });
    const res = await fetch('http://localhost/api/v1/cart/items', {
      method: 'DELETE',
      headers: { ...session1Headers(), 'If-Match': '"3"' },
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['items']).toEqual([]);
    expect(readNumber(body, 'lineCount')).toBe(0);
    expect(readNumber(body, 'version')).toBe(4);
  });

  it('keeps the version when the cart is already empty', async () => {
    const res = await fetch('http://localhost/api/v1/cart/items', {
      method: 'DELETE',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(readNumber(body, 'version')).toBe(1);
  });
});

describe('expiry', () => {
  it('returns 410 CART_EXPIRED and forgets the cart; the next GET starts a new one', async () => {
    await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });
    clock.advanceMs(CART_TTL_MS);

    const expired = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    expect(expired.status).toBe(410);
    const expiredBody: unknown = await expired.json();
    expectRecord(expiredBody);
    expect(expiredBody['code']).toBe('CART_EXPIRED');
    expect(expiredBody['type']).toBe('urn:mi-bolt:problem:cart-expired');

    const fresh = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    expect(fresh.status).toBe(200);
    const freshBody: unknown = await fresh.json();
    expectRecord(freshBody);
    expect(readNumber(freshBody, 'version')).toBe(1);
    expect(readString(freshBody, 'id').length).toBeGreaterThan(0);
  });

  it('pushes expiresAt forward on a mutation and leaves it alone on a read', async () => {
    const created = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    const createdBody: unknown = await created.json();
    expectRecord(createdBody);
    expect(readString(createdBody, 'expiresAt')).toBe('2026-10-20T10:00:00.000Z');

    clock.advanceMs(60_000);
    const added = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });
    expect(added.status).toBe(200);
    const addedBody: unknown = await added.json();
    expectRecord(addedBody);
    expect(readString(addedBody, 'expiresAt')).toBe('2026-10-20T10:01:00.000Z');

    clock.advanceMs(60_000);
    const read = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    const readBody: unknown = await read.json();
    expectRecord(readBody);
    expect(readString(readBody, 'expiresAt')).toBe('2026-10-20T10:01:00.000Z');
  });
});

describe('reconcile', () => {
  function lookupForVariant(variantId: string, maxQuantity: number): VariantLookup {
    const hit = catalogStore.current?.getVariant(variantId);
    if (hit === undefined) {
      throw new Error(`variant ${variantId} missing from fixture`);
    }
    return {
      product: hit.product,
      variant: { ...hit.variant, maxQuantity },
    };
  }

  it('emits QUANTITY_REDUCED with from/to when reconcile clamps to a lower maxQuantity', () => {
    let cap = 4;
    const lookup: VariantLookupFn = (id) =>
      id === VARIANT_IPHONE_BURGUNDI ? lookupForVariant(id, cap) : undefined;
    const store = new CartStore(options, lookup);
    const added = store.add(SESSION_1, '"1"', VARIANT_IPHONE_BURGUNDI, 4);
    if (!added.ok) throw new Error('add failed');
    expect(added.cart.version).toBe(2);
    expect(added.cart.notices).toEqual([]);

    cap = 2;
    const result = store.get(SESSION_1);
    if (!result.ok) throw new Error('get failed');
    expect(result.cart.version).toBe(3);
    expect(result.cart.items).toHaveLength(1);
    expect(result.cart.items[0]?.quantity).toBe(2);
    expect(result.cart.notices).toEqual([
      {
        code: 'QUANTITY_REDUCED',
        variantId: VARIANT_IPHONE_BURGUNDI,
        params: { from: 4, to: 2 },
      },
    ]);
  });

  it('emits ITEM_REMOVED when reconcile cannot resolve the variant id', () => {
    let known = true;
    const lookup: VariantLookupFn = (id) =>
      known && id === VARIANT_IPHONE_BURGUNDI ? lookupForVariant(id, 4) : undefined;
    const store = new CartStore(options, lookup);
    const added = store.add(SESSION_1, '"1"', VARIANT_IPHONE_BURGUNDI, 4);
    if (!added.ok) throw new Error('add failed');
    expect(added.cart.version).toBe(2);

    known = false;
    const result = store.get(SESSION_1);
    if (!result.ok) throw new Error('get failed');
    expect(result.cart.version).toBe(3);
    expect(result.cart.items).toEqual([]);
    expect(result.cart.notices).toEqual([
      { code: 'ITEM_REMOVED', variantId: VARIANT_IPHONE_BURGUNDI },
    ]);
  });
});

describe('session isolation', () => {
  it('keeps two sessions on independent versions and item lists', async () => {
    // Session 1: add one line, version 2.
    await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });

    const other = await fetch('http://localhost/api/v1/cart', { headers: session2Headers() });
    expect(other.status).toBe(200);
    const body: unknown = await other.json();
    expectRecord(body);
    expect(readNumber(body, 'version')).toBe(1);
    expect(body['items']).toEqual([]);
    // Different id from session 1's cart.
    const session1 = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    const session1Body: unknown = await session1.json();
    expectRecord(session1Body);
    expect(readString(session1Body, 'id')).not.toBe(readString(body, 'id'));
  });
});

describe('cart-mutation-fails scenario', () => {
  beforeEach(() => {
    const scenario = BUILT_IN_SCENARIOS['cart-mutation-fails'];
    if (scenario === undefined) throw new Error('cart-mutation-fails is not registered');
    options = { ...options, repository: new Repository(scenario, ids, clock), scenario };
    server.use(...createHandlers(options));
  });

  it('answers a line removal with 503 SERVICE_UNAVAILABLE and keeps the line', async () => {
    const added = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });
    expect(added.status).toBe(200);
    const res = await fetch(`http://localhost/api/v1/cart/items/${VARIANT_MOTO_256}`, {
      method: 'DELETE',
      headers: { ...session1Headers(), 'If-Match': '"2"' },
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    const problem: unknown = await res.json();
    expectRecord(problem);
    expect(problem['code']).toBe('SERVICE_UNAVAILABLE');
    const cart = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    const body: unknown = await cart.json();
    expectRecord(body);
    expect(readNumber(body, 'version')).toBe(2);
    expect(readNumber(body, 'lineCount')).toBe(1);
  });

  it('answers a cart clear with 503 SERVICE_UNAVAILABLE and keeps the lines', async () => {
    await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: VARIANT_MOTO_256, quantity: 1 }),
    });
    const res = await fetch('http://localhost/api/v1/cart/items', {
      method: 'DELETE',
      headers: { ...session1Headers(), 'If-Match': '"2"' },
    });
    expect(res.status).toBe(503);
    const problem: unknown = await res.json();
    expectRecord(problem);
    expect(problem['code']).toBe('SERVICE_UNAVAILABLE');
    const cart = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    const body: unknown = await cart.json();
    expectRecord(body);
    expect(readNumber(body, 'version')).toBe(2);
    expect(readNumber(body, 'lineCount')).toBe(1);
  });
});
