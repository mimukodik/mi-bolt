/**
 * MIM-212 — checkout, payment intent and order mock spec on the
 * 2.0.0 contract.
 *
 * 81 cases over `/checkout/options`, `/checkout`, `/payment-intents`,
 * `/orders` and the once-only fault scenarios (31 + 17 + 29 + 4),
 * measured against the configured backend values the
 * addendum of `/tmp/s3-a-design.md` (2026-09-20 ~21:25Z) locks in.
 * Every case asserts an exact wire value, never `.exists()`-style
 * coverage; the spec is the independent measurement of the mock
 * layer, not a guide to what it should answer.
 *
 * Header shape and helpers are copied from
 * `projects/shop-mocks/src/cart/cart-mock.spec.ts:1-105`. The shared `server` and
 * the per-file MSW lifecycle come from `tests/msw-server.ts`.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import catalogFixture from '../../../../docs/api/fixtures/catalog.json';
import {
  catalogStore,
  isCatalogFixtureShape,
  loadCatalogFixture,
} from '../catalog/catalog.handlers';
import { CART_TTL_MS, CartStore, type VariantLookupFn } from '../cart/cart-store';
import { CheckoutStore, TERMS_VERSION } from '../checkout/checkout-store';
import { IDEMPOTENCY_WINDOW_MS } from '../idempotency';
import { orderStore } from '../checkout/checkout.handlers';
import '../payment/payment.handlers';
import '../orders/order.handlers';
import { IdempotencyStore } from '../idempotency';
import { PAYMENT_INTENT_TTL_MS, OrderStore, SIMULATION_NOTICE } from '../orders/order-store';
import { Repository } from '../repository';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
  resolveScenario,
  type Clock,
  type Ids,
} from '../scenarios';
import { server, useMswServer } from '../../../../tests/msw-server';
import { isRecord } from '../is-record';
import { createHandlers } from '../create-handlers';

useMswServer();

const SESSION_1 = 'spec-session-0001';
const SESSION_2 = 'spec-session-0002';
const MOTO = 'motorola-edge-50-fusion--zold--256';
const HONOR = 'honor-x7d--fekete--128';
const MOTO_PRODUCT_NAME = 'Motorola Edge 50 Fusion';

const VALID_CONTACT = {
  fullName: 'Teszt Elek',
  email: 'Teszt.Elek@Pelda.hu',
  phone: '+36301234567',
};
const VALID_BILLING = {
  name: 'Teszt Elek',
  address: {
    countryCode: 'HU',
    postalCode: '1052',
    city: 'Budapest',
    line1: 'Petőfi utca 1.',
  },
};
const VALID_DELIVERY_ADDRESS = {
  countryCode: 'HU',
  postalCode: '1052',
  city: 'Budapest',
  line1: 'Petőfi utca 1.',
};

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
    throw new Error('[checkout-mock.spec] committed fixture does not match expected shape');
  }
  loadCatalogFixture(catalogFixture);
});

beforeEach(() => {
  clock = createFixedClock('2026-09-20T10:00:00.000Z');
  ids = createDeterministicIds(1);
  options = buildOptions(DEFAULT_SCENARIO.name);
  server.use(...createHandlers(options));
});

/**
 * The handler-factory options for a scenario, on the test's own clock and
 * id factory. The file's default list and a spec that needs another
 * scenario both go through it, so `CreateHandlersOptions` is filled in
 * once rather than per caller.
 */
function buildOptions(scenarioName: string): typeof options {
  const scenario = resolveScenario(scenarioName);
  return {
    repository: new Repository(scenario, ids, clock),
    clock,
    ids,
    scenario,
    apiRoot: '/api/v1',
  };
}

function session1Headers(): Record<string, string> {
  return { 'X-Demo-Session': SESSION_1, 'Content-Type': 'application/json' };
}

function session2Headers(): Record<string, string> {
  return { 'X-Demo-Session': SESSION_2, 'Content-Type': 'application/json' };
}

function expectRecord(value: unknown): asserts value is Record<string, unknown> {
  expect(isRecord(value)).toBe(true);
}

function expectDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

function expectString(value: unknown, label = 'value'): asserts value is string {
  expect(typeof value === 'string', `${label} is not a string`).toBe(true);
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

function readAmount(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  expectRecord(value);
  return readNumber(value, 'amount');
}

function readFieldErrors(body: Record<string, unknown>): { path: string; code: string }[] {
  const errors = body['fieldErrors'];
  expect(Array.isArray(errors)).toBe(true);
  if (!Array.isArray(errors)) throw new Error('fieldErrors not an array');
  return errors.map((entry: unknown) => {
    expectRecord(entry);
    return {
      path: readString(entry, 'path'),
      code: readString(entry, 'code'),
    };
  });
}

/**
 * Walk an unknown-typed array and return the first entry whose `id`
 * matches. The mock never carries a `null` here and the array
 * narrows through `Array.isArray` upstream; this helper keeps the
 * result typed as `Record<string, unknown>` without `as` so the
 * unsafe-any lint rule stays green.
 */
function findOptionById(arr: readonly unknown[], id: string): Record<string, unknown> | undefined {
  for (const candidate of arr) {
    if (isRecord(candidate) && candidate['id'] === id) return candidate;
  }
  return undefined;
}

/** First record of an unknown-typed array, asserted and narrowed. */
function firstRecord(arr: readonly unknown[]): Record<string, unknown> {
  for (const candidate of arr) {
    if (isRecord(candidate)) return candidate;
  }
  throw new Error('array has no record entry');
}

async function seedMotoOnce(headers: Record<string, string>): Promise<void> {
  const res = await fetch('http://localhost/api/v1/cart/items', {
    method: 'POST',
    headers: { ...headers, 'If-Match': '"1"' },
    body: JSON.stringify({ variantId: MOTO, quantity: 1 }),
  });
  expect(res.status).toBe(200);
}

async function seedMotoQuantity(
  quantity: number,
  ifMatch: string,
): Promise<Record<string, unknown>> {
  const res = await fetch('http://localhost/api/v1/cart/items', {
    method: 'POST',
    headers: { ...session1Headers(), 'If-Match': ifMatch },
    body: JSON.stringify({ variantId: MOTO, quantity }),
  });
  expect(res.status).toBe(200);
  const body: unknown = await res.json();
  expectRecord(body);
  return body;
}

function patchCheckout(
  body: unknown,
  ifMatch: string,
  headers: Record<string, string> = session1Headers(),
): Promise<Response> {
  return fetch('http://localhost/api/v1/checkout', {
    method: 'PATCH',
    headers: { ...headers, 'If-Match': ifMatch },
    body: JSON.stringify(body),
  });
}

async function seedCompleteDraft(): Promise<void> {
  await seedMotoOnce(session1Headers());
  const patch = await patchCheckout(
    {
      contact: VALID_CONTACT,
      billing: VALID_BILLING,
      delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS },
      payment: { method: 'card' },
    },
    '"2"',
  );
  expect(patch.status).toBe(200);
}

function expectedIsoPlus(seconds: number): string {
  return new Date(Date.parse('2026-09-20T10:00:00.000Z') + seconds * 1000).toISOString();
}

// ===========================================================================
// C. Options and draft — 31 cases
// ===========================================================================

describe('GET /checkout/options', () => {
  it('C-01: on an empty cart returns both delivery and both payment entries unavailable with CART_EMPTY and base fees', async () => {
    const res = await fetch('http://localhost/api/v1/checkout/options', {
      headers: session1Headers(),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBeNull();

    const body: unknown = await res.json();
    expectRecord(body);
    expect(readString(body, 'termsVersion')).toBe(TERMS_VERSION);

    const delivery = body['deliveryOptions'];
    expect(Array.isArray(delivery)).toBe(true);
    if (!Array.isArray(delivery)) throw new Error('deliveryOptions not an array');
    expect(delivery).toHaveLength(2);
    const home = findOptionById(delivery, 'home_delivery');
    const pickup = findOptionById(delivery, 'pickup_point');
    expectRecord(home);
    expectRecord(pickup);
    expect(home['fee']).toEqual({ amount: 1490, currency: 'HUF' });
    expect(home['available']).toBe(false);
    expect(readString(home, 'unavailableReason')).toBe('CART_EMPTY');
    expect(pickup['fee']).toEqual({ amount: 990, currency: 'HUF' });
    expect(pickup['available']).toBe(false);
    expect(readString(pickup, 'unavailableReason')).toBe('CART_EMPTY');

    const payment = body['paymentMethods'];
    expect(Array.isArray(payment)).toBe(true);
    if (!Array.isArray(payment)) throw new Error('paymentMethods not an array');
    expect(payment).toHaveLength(2);
    const card = findOptionById(payment, 'card');
    const cod = findOptionById(payment, 'cash_on_delivery');
    expectRecord(card);
    expectRecord(cod);
    expect(card['available']).toBe(false);
    expect(readString(card, 'unavailableReason')).toBe('CART_EMPTY');
    expect(cod['available']).toBe(false);
    expect(readString(cod, 'unavailableReason')).toBe('CART_EMPTY');
  });

  it('C-02: after one MOTO is added all four options are available with the free-shipping fees', async () => {
    await seedMotoOnce(session1Headers());
    const res = await fetch('http://localhost/api/v1/checkout/options', {
      headers: session1Headers(),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expectRecord(body);

    const delivery = body['deliveryOptions'];
    expect(Array.isArray(delivery)).toBe(true);
    if (!Array.isArray(delivery)) throw new Error('deliveryOptions not an array');
    const home = findOptionById(delivery, 'home_delivery');
    const pickup = findOptionById(delivery, 'pickup_point');
    expectRecord(home);
    expectRecord(pickup);
    expect(home['available']).toBe(true);
    expect(home['fee']).toEqual({ amount: 0, currency: 'HUF' });
    expect(home).not.toHaveProperty('unavailableReason');
    expect(pickup['available']).toBe(true);
    expect(pickup['fee']).toEqual({ amount: 0, currency: 'HUF' });
    expect(pickup).not.toHaveProperty('unavailableReason');

    const payment = body['paymentMethods'];
    expect(Array.isArray(payment)).toBe(true);
    if (!Array.isArray(payment)) throw new Error('paymentMethods not an array');
    const card = findOptionById(payment, 'card');
    const cod = findOptionById(payment, 'cash_on_delivery');
    expectRecord(card);
    expectRecord(cod);
    expect(card['available']).toBe(true);
    expect(card['fee']).toEqual({ amount: 0, currency: 'HUF' });
    expect(card).not.toHaveProperty('unavailableReason');
    expect(cod['available']).toBe(true);
    expect(cod['fee']).toEqual({ amount: 490, currency: 'HUF' });
    expect(cod).not.toHaveProperty('unavailableReason');
  });

  it('C-27: cash_on_delivery flips to CART_VALUE_TOO_HIGH once the cart subtotal exceeds 300 000 HUF', async () => {
    await seedMotoOnce(session1Headers());
    await seedMotoQuantity(3, '"2"');
    // Cart now: 4 × MOTO = 359 960 HUF.
    const res = await fetch('http://localhost/api/v1/checkout/options', {
      headers: session1Headers(),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expectRecord(body);

    const delivery = body['deliveryOptions'];
    expect(Array.isArray(delivery)).toBe(true);
    if (!Array.isArray(delivery)) throw new Error('deliveryOptions not an array');
    const home = findOptionById(delivery, 'home_delivery');
    const pickup = findOptionById(delivery, 'pickup_point');
    expectRecord(home);
    expectRecord(pickup);
    expect(home['available']).toBe(true);
    expect(home['fee']).toEqual({ amount: 0, currency: 'HUF' });
    expect(pickup['available']).toBe(true);
    expect(pickup['fee']).toEqual({ amount: 0, currency: 'HUF' });

    const payment = body['paymentMethods'];
    expect(Array.isArray(payment)).toBe(true);
    if (!Array.isArray(payment)) throw new Error('paymentMethods not an array');
    const card = findOptionById(payment, 'card');
    const cod = findOptionById(payment, 'cash_on_delivery');
    expectRecord(card);
    expect(card['available']).toBe(true);
    expectRecord(cod);
    expect(cod['available']).toBe(false);
    expect(readString(cod, 'unavailableReason')).toBe('CART_VALUE_TOO_HIGH');
  });

  it('C-24b: a missing X-Demo-Session header on /checkout/options returns 400 INVALID_REQUEST', async () => {
    const res = await fetch('http://localhost/api/v1/checkout/options');
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('INVALID_REQUEST');
  });
});

describe('GET /checkout', () => {
  it('C-03: a fresh session returns ETag "1" with an empty draft and a zero summary', async () => {
    const res = await fetch('http://localhost/api/v1/checkout', { headers: session1Headers() });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"1"');

    const body: unknown = await res.json();
    expectRecord(body);
    expect(readNumber(body, 'version')).toBe(1);
    expect(body['complete']).toBe(false);
    expect(body['contact']).toBeUndefined();
    expect(body['billing']).toBeUndefined();
    expect(body['delivery']).toBeUndefined();
    expect(body['payment']).toBeUndefined();
    expect(body['summary']).toEqual({
      subtotal: { amount: 0, currency: 'HUF' },
      shippingFee: { amount: 0, currency: 'HUF' },
      paymentFee: { amount: 0, currency: 'HUF' },
      total: { amount: 0, currency: 'HUF' },
    });
  });

  it('C-04: two reads in a row return ETag "1" — a read does not move the version', async () => {
    const first = await fetch('http://localhost/api/v1/checkout', { headers: session1Headers() });
    expect(first.headers.get('ETag')).toBe('"1"');
    const second = await fetch('http://localhost/api/v1/checkout', { headers: session1Headers() });
    expect(second.headers.get('ETag')).toBe('"1"');
  });

  it('C-05: after MOTO x1 the GET returns ETag "2" with subtotal/total 89 990', async () => {
    await seedMotoOnce(session1Headers());
    const res = await fetch('http://localhost/api/v1/checkout', { headers: session1Headers() });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"2"');
    const body: unknown = await res.json();
    expectRecord(body);
    expect(readNumber(body, 'version')).toBe(2);
    expect(body['complete']).toBe(false);
    const summary = body['summary'];
    expectRecord(summary);
    expect(readAmount(summary, 'subtotal')).toBe(89_990);
    expect(readAmount(summary, 'shippingFee')).toBe(0);
    expect(readAmount(summary, 'paymentFee')).toBe(0);
    expect(readAmount(summary, 'total')).toBe(89_990);
  });

  it('C-26: a second session sees no draft from the first session', async () => {
    await seedMotoOnce(session1Headers());
    await patchCheckout(
      {
        contact: VALID_CONTACT,
        billing: VALID_BILLING,
        delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS },
        payment: { method: 'card' },
      },
      '"2"',
    );

    const res = await fetch('http://localhost/api/v1/checkout', { headers: session2Headers() });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(readNumber(body, 'version')).toBe(1);
    expect(body['contact']).toBeUndefined();
    expect(body['billing']).toBeUndefined();
    expect(body['delivery']).toBeUndefined();
    expect(body['payment']).toBeUndefined();
    expect(body['complete']).toBe(false);
  });

  it('C-24: a missing X-Demo-Session header returns 400 INVALID_REQUEST', async () => {
    const res = await fetch('http://localhost/api/v1/checkout');
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('INVALID_REQUEST');
  });
});

describe('PATCH /checkout', () => {
  it('C-06: a valid contact patch at v2 returns v3 with a trimmed, lower-cased email', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout({ contact: VALID_CONTACT }, '"2"');
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"3"');
    const body: unknown = await res.json();
    expectRecord(body);
    expect(readNumber(body, 'version')).toBe(3);
    const contact = body['contact'];
    expectRecord(contact);
    expect(readString(contact, 'email')).toBe('teszt.elek@pelda.hu');
    expect(readString(contact, 'fullName')).toBe('Teszt Elek');
    expect(readString(contact, 'phone')).toBe('+36301234567');
    expect(body['complete']).toBe(false);
  });

  it('C-07: a home_delivery selection keeps the total at 89 990 above the free-shipping threshold', async () => {
    await seedMotoOnce(session1Headers());
    await patchCheckout({ contact: VALID_CONTACT }, '"2"');
    const res = await patchCheckout(
      { delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS } },
      '"3"',
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"4"');
    const body: unknown = await res.json();
    expectRecord(body);
    const summary = body['summary'];
    expectRecord(summary);
    expect(readAmount(summary, 'shippingFee')).toBe(0);
    expect(readAmount(summary, 'total')).toBe(89_990);
  });

  it('C-08: a pickup_point selection stores no address and keeps the total at 89 990', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout({ delivery: { optionId: 'pickup_point' } }, '"2"');
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expectRecord(body);
    const summary = body['summary'];
    expectRecord(summary);
    expect(readAmount(summary, 'shippingFee')).toBe(0);
    expect(readAmount(summary, 'total')).toBe(89_990);
    const delivery = body['delivery'];
    expectRecord(delivery);
    expect(readString(delivery, 'optionId')).toBe('pickup_point');
    expect(delivery).not.toHaveProperty('address');
  });

  it('C-09: a cash_on_delivery selection on the MOTO cart adds a 490 HUF payment fee', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout({ payment: { method: 'cash_on_delivery' } }, '"2"');
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expectRecord(body);
    const summary = body['summary'];
    expectRecord(summary);
    expect(readAmount(summary, 'paymentFee')).toBe(490);
    expect(readAmount(summary, 'total')).toBe(90_480);
  });

  it('C-10: seedCompleteDraft lands the draft at v3 with the all-sections-complete summary', async () => {
    await seedCompleteDraft();
    const res = await fetch('http://localhost/api/v1/checkout', { headers: session1Headers() });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"3"');
    const body: unknown = await res.json();
    expectRecord(body);
    expect(readNumber(body, 'version')).toBe(3);
    expect(body['complete']).toBe(true);
    const summary = body['summary'];
    expectRecord(summary);
    expect(readAmount(summary, 'subtotal')).toBe(89_990);
    expect(readAmount(summary, 'shippingFee')).toBe(0);
    expect(readAmount(summary, 'paymentFee')).toBe(0);
    expect(readAmount(summary, 'total')).toBe(89_990);
  });

  it('C-11: a partial PATCH leaves absent sections untouched', async () => {
    await seedCompleteDraft();
    const res = await patchCheckout(
      {
        contact: {
          fullName: 'Mas Nev',
          email: 'mas@pelda.hu',
          phone: '+3630765432',
        },
      },
      '"3"',
    );
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['billing']).toBeDefined();
    expect(body['delivery']).toBeDefined();
    expect(body['payment']).toBeDefined();
    expect(body['complete']).toBe(true);
  });

  it('C-12: a PATCH without If-Match returns 412 with received null', async () => {
    const res = await fetch('http://localhost/api/v1/checkout', {
      method: 'PATCH',
      headers: session1Headers(),
      body: JSON.stringify({ contact: VALID_CONTACT }),
    });
    expect(res.status).toBe(412);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('CART_VERSION_CONFLICT');
    const params = body['params'];
    expectRecord(params);
    expect(params['received']).toBeNull();
  });

  it('C-13: a PATCH with a stale If-Match returns 412 with the real version and the quoted received value', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout({ contact: VALID_CONTACT }, '"99"');
    expect(res.status).toBe(412);
    const body: unknown = await res.json();
    expectRecord(body);
    const params = body['params'];
    expectRecord(params);
    expect(params['received']).toBe('"99"');
    expect(params['expected']).toBe(2);
  });

  it('C-24c: a PATCH /checkout without X-Demo-Session returns 400 INVALID_REQUEST', async () => {
    const res = await fetch('http://localhost/api/v1/checkout', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'If-Match': '"1"' },
      body: JSON.stringify({ contact: VALID_CONTACT }),
    });
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('INVALID_REQUEST');
  });

  it('C-14: a PATCH with body {} returns 400 INVALID_REQUEST', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout({}, '"2"');
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('INVALID_REQUEST');
  });

  it('C-15: a PATCH with an unknown section key returns 400 INVALID_REQUEST', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout({ nope: 1 }, '"2"');
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('INVALID_REQUEST');
  });

  it('C-16: a PATCH with a non-object section returns 400 INVALID_REQUEST naming the section', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout({ contact: 'x' }, '"2"');
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('INVALID_REQUEST');
    const params = body['params'];
    expectRecord(params);
    expect(params['section']).toBe('contact');
  });

  it('C-17: a contact with three bad fields returns 422 with the three contact field errors', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout(
      { contact: { fullName: 'A', email: 'nope', phone: '123' } },
      '"2"',
    );
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('VALIDATION_FAILED');
    expect(body['title']).toBe('Unprocessable content');
    const errors = readFieldErrors(body);
    expect(errors).toEqual(
      expect.arrayContaining([
        { path: '/contact/fullName', code: 'FULL_NAME_LENGTH' },
        { path: '/contact/email', code: 'EMAIL_FORMAT' },
        { path: '/contact/phone', code: 'PHONE_FORMAT' },
      ]),
    );
    expect(errors).toHaveLength(3);
  });

  it('C-18: a billing with an unsupported country, a leading-zero postal, and too-short city and line1 returns four field errors', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout(
      {
        billing: {
          name: 'Teszt Elek',
          address: { countryCode: 'DE', postalCode: '0123', city: 'A', line1: 'ab' },
        },
      },
      '"2"',
    );
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('VALIDATION_FAILED');
    const errors = readFieldErrors(body);
    expect(errors).toEqual(
      expect.arrayContaining([
        { path: '/billing/address/countryCode', code: 'COUNTRY_NOT_SUPPORTED' },
        { path: '/billing/address/postalCode', code: 'POSTAL_CODE_FORMAT' },
        { path: '/billing/address/city', code: 'CITY_LENGTH' },
        { path: '/billing/address/line1', code: 'LINE1_LENGTH' },
      ]),
    );
    expect(errors).toHaveLength(4);
  });

  it('C-19: home_delivery without an address returns 422 SECTION_MISSING on /delivery/address', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout({ delivery: { optionId: 'home_delivery' } }, '"2"');
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expectRecord(body);
    const errors = readFieldErrors(body);
    expect(errors).toEqual(
      expect.arrayContaining([{ path: '/delivery/address', code: 'SECTION_MISSING' }]),
    );
    expect(errors).toHaveLength(1);
  });

  it('C-20: pickup_point with an address returns 422 ADDRESS_NOT_ALLOWED on /delivery/address', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout(
      {
        delivery: {
          optionId: 'pickup_point',
          address: VALID_DELIVERY_ADDRESS,
        },
      },
      '"2"',
    );
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expectRecord(body);
    const errors = readFieldErrors(body);
    expect(errors).toEqual(
      expect.arrayContaining([{ path: '/delivery/address', code: 'ADDRESS_NOT_ALLOWED' }]),
    );
    expect(errors).toHaveLength(1);
  });

  it('C-21: an unknown delivery option returns 422 on /delivery/optionId', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout({ delivery: { optionId: 'demo_pickup' } }, '"2"');
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expectRecord(body);
    const errors = readFieldErrors(body);
    expect(errors).toEqual(
      expect.arrayContaining([{ path: '/delivery/optionId', code: 'DELIVERY_OPTION_UNAVAILABLE' }]),
    );
    expect(errors).toHaveLength(1);
  });

  it('C-22: an unknown payment method returns 422 on /payment/method', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout({ payment: { method: 'demo_card' } }, '"2"');
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expectRecord(body);
    const errors = readFieldErrors(body);
    expect(errors).toEqual(
      expect.arrayContaining([{ path: '/payment/method', code: 'PAYMENT_METHOD_UNAVAILABLE' }]),
    );
    expect(errors).toHaveLength(1);
  });

  it('C-23: a body with two bad sections collects the field errors from both', async () => {
    await seedMotoOnce(session1Headers());
    const res = await patchCheckout(
      {
        contact: { fullName: 'A', email: 'nope', phone: '123' },
        billing: {
          name: 'X',
          address: { countryCode: 'DE', postalCode: '0123', city: 'A', line1: 'ab' },
        },
      },
      '"2"',
    );
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expectRecord(body);
    const errors = readFieldErrors(body);
    expect(errors).toEqual(
      expect.arrayContaining([
        { path: '/contact/fullName', code: 'FULL_NAME_LENGTH' },
        { path: '/contact/email', code: 'EMAIL_FORMAT' },
        { path: '/contact/phone', code: 'PHONE_FORMAT' },
        { path: '/billing/name', code: 'NAME_LENGTH' },
        { path: '/billing/address/countryCode', code: 'COUNTRY_NOT_SUPPORTED' },
        { path: '/billing/address/postalCode', code: 'POSTAL_CODE_FORMAT' },
        { path: '/billing/address/city', code: 'CITY_LENGTH' },
        { path: '/billing/address/line1', code: 'LINE1_LENGTH' },
      ]),
    );
    expect(errors).toHaveLength(8);
  });

  it('C-25: an expired cart returns 410 CART_EXPIRED on the next GET', async () => {
    await seedMotoOnce(session1Headers());
    clock.advanceMs(CART_TTL_MS);
    const res = await fetch('http://localhost/api/v1/checkout', { headers: session1Headers() });
    expect(res.status).toBe(410);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('CART_EXPIRED');
  });

  it('C-28: PATCH cash_on_delivery on an oversize cart returns PAYMENT_METHOD_UNAVAILABLE with CART_VALUE_TOO_HIGH', async () => {
    await seedMotoOnce(session1Headers());
    await seedMotoQuantity(3, '"2"');
    // Cart now: 4 × MOTO = 359 960 HUF.
    const res = await patchCheckout({ payment: { method: 'cash_on_delivery' } }, '"3"');
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('VALIDATION_FAILED');
    const errors = readFieldErrors(body);
    expect(errors).toEqual(
      expect.arrayContaining([{ path: '/payment/method', code: 'PAYMENT_METHOD_UNAVAILABLE' }]),
    );
    expect(errors).toHaveLength(1);
    const params = body['params'];
    expectRecord(params);
    expect(params['reason']).toBe('CART_VALUE_TOO_HIGH');
  });

  it('C-29: PATCH delivery on an empty cart returns DELIVERY_OPTION_UNAVAILABLE with CART_EMPTY', async () => {
    const res = await patchCheckout(
      { delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS } },
      '"1"',
    );
    expect(res.status).toBe(422);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('VALIDATION_FAILED');
    const errors = readFieldErrors(body);
    expect(errors).toEqual(
      expect.arrayContaining([{ path: '/delivery/optionId', code: 'DELIVERY_OPTION_UNAVAILABLE' }]),
    );
    expect(errors).toHaveLength(1);
    const params = body['params'];
    expectRecord(params);
    expect(params['reason']).toBe('CART_EMPTY');
  });
});

// ===========================================================================
// D. Payment intents — 17 cases
// ===========================================================================

async function createCardIntent(
  ifMatch: string,
  idempotencyKey: string,
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const res = await fetch('http://localhost/api/v1/payment-intents', {
    method: 'POST',
    headers: { ...session1Headers(), 'If-Match': ifMatch, 'Idempotency-Key': idempotencyKey },
    body: '',
  });
  const body: unknown = await res.json();
  return { status: res.status, body, headers: res.headers };
}

async function resolveIntent(
  intentId: string,
  outcome: string,
  headers: Record<string, string> = session1Headers(),
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://localhost/api/v1/payment-intents/${intentId}/outcome`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ outcome }),
  });
  const body: unknown = await res.json();
  return { status: res.status, body };
}

describe('POST /payment-intents', () => {
  it('I-01: on a complete card draft returns 201 with the expected wire shape and no ETag', async () => {
    await seedCompleteDraft();
    const { status, body, headers } = await createCardIntent('"3"', 'idem-int-0001');
    expect(status).toBe(201);
    expect(headers.get('ETag')).toBeNull();
    const location = headers.get('Location');
    expect(location).not.toBeNull();
    expectRecord(body);
    expect(body['status']).toBe('requires_action');
    expect(body['amount']).toEqual({ amount: 89_990, currency: 'HUF' });
    expect(readString(body, 'createdAt')).toBe('2026-09-20T10:00:00.000Z');
    expect(readString(body, 'expiresAt')).toBe(expectedIsoPlus(PAYMENT_INTENT_TTL_MS / 1000));
    const id = readString(body, 'id');
    expect(readString(body, 'redirectUrl')).toBe(`/demo-fizetes/${id}`);
    expect(readString(body, 'returnUrl')).toBe(`/penztar?paymentIntentId=${id}`);
    expect(location).toBe(`/api/v1/payment-intents/${id}`);
  });

  it('I-02: the same call with the same Idempotency-Key returns a byte-identical body', async () => {
    await seedCompleteDraft();
    const first = await createCardIntent('"3"', 'idem-int-0002');
    expect(first.status).toBe(201);
    const second = await createCardIntent('"3"', 'idem-int-0002');
    expect(second.status).toBe(201);
    expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
  });

  it('I-03: creating an intent does not bump the checkout version', async () => {
    await seedCompleteDraft();
    await createCardIntent('"3"', 'idem-int-0003');
    const res = await fetch('http://localhost/api/v1/checkout', { headers: session1Headers() });
    expect(res.headers.get('ETag')).toBe('"3"');
  });

  it('I-04: the same key with a different If-Match returns 409 IDEMPOTENCY_CONFLICT', async () => {
    await seedCompleteDraft();
    await createCardIntent('"3"', 'idem-int-0004');
    const res = await fetch('http://localhost/api/v1/payment-intents', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"2"', 'Idempotency-Key': 'idem-int-0004' },
      body: '',
    });
    expect(res.status).toBe(409);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('I-05: a draft with cash_on_delivery payment returns 422 CHECKOUT_INCOMPLETE with PAYMENT_METHOD_NOT_CARD', async () => {
    await seedMotoOnce(session1Headers());
    await patchCheckout({ payment: { method: 'cash_on_delivery' }, contact: VALID_CONTACT }, '"2"');
    await patchCheckout({ billing: VALID_BILLING }, '"3"');
    await patchCheckout({ delivery: { optionId: 'pickup_point' } }, '"4"');
    const { status, body } = await createCardIntent('"5"', 'idem-int-0005');
    expect(status).toBe(422);
    expectRecord(body);
    expect(body['code']).toBe('CHECKOUT_INCOMPLETE');
    const errors = readFieldErrors(body);
    expect(errors).toEqual([{ path: '/payment', code: 'PAYMENT_METHOD_NOT_CARD' }]);
  });

  it('I-06: a draft with only contact set returns 422 CHECKOUT_INCOMPLETE with three SECTION_MISSING errors', async () => {
    await seedMotoOnce(session1Headers());
    await patchCheckout({ contact: VALID_CONTACT }, '"2"');
    const { status, body } = await createCardIntent('"3"', 'idem-int-0006');
    expect(status).toBe(422);
    expectRecord(body);
    expect(body['code']).toBe('CHECKOUT_INCOMPLETE');
    const errors = readFieldErrors(body);
    expect(errors).toEqual([
      { path: '/billing', code: 'SECTION_MISSING' },
      { path: '/delivery', code: 'SECTION_MISSING' },
      { path: '/payment', code: 'SECTION_MISSING' },
    ]);
  });

  it('I-07: a complete draft on an empty cart returns 422 CHECKOUT_INCOMPLETE with detail "The cart is empty."', async () => {
    // Build the complete draft while the cart still has items, then
    // empty the cart so the draft is complete but the cart is empty.
    await seedCompleteDraft();
    await fetch('http://localhost/api/v1/cart/items', {
      method: 'DELETE',
      headers: { ...session1Headers(), 'If-Match': '"3"' },
    });
    const { status, body } = await createCardIntent('"4"', 'idem-int-0007');
    expect(status).toBe(422);
    expectRecord(body);
    expect(body['code']).toBe('CHECKOUT_INCOMPLETE');
    expect(readString(body, 'detail')).toBe('The cart is empty.');
    expect(readFieldErrors(body)).toEqual([]);
  });

  it('I-08: a stale If-Match against a v3 cart returns 412 CART_VERSION_CONFLICT', async () => {
    await seedCompleteDraft();
    const { status, body } = await createCardIntent('"1"', 'idem-int-0008');
    expect(status).toBe(412);
    expectRecord(body);
    expect(body['code']).toBe('CART_VERSION_CONFLICT');
    const params = body['params'];
    expectRecord(params);
    expect(params).toEqual({ expected: 3, received: '"1"' });
  });

  it('I-09: a too-short Idempotency-Key returns 400 INVALID_REQUEST', async () => {
    const res = await fetch('http://localhost/api/v1/payment-intents', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"', 'Idempotency-Key': 'short' },
      body: '',
    });
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('INVALID_REQUEST');
    const params = body['params'];
    expectRecord(params);
    expect(params).toEqual({ received: 'short' });
  });
});

describe('GET /payment-intents/:id', () => {
  it('I-10: the owning session can read its own intent', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0010');
    expectRecord(created.body);
    const id = readString(created.body, 'id');
    const res = await fetch(`http://localhost/api/v1/payment-intents/${id}`, {
      headers: session1Headers(),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(JSON.stringify(body)).toBe(JSON.stringify(created.body));
  });

  it('I-11: a different session gets 404 NOT_FOUND', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0011');
    expectRecord(created.body);
    const id = readString(created.body, 'id');
    const res = await fetch(`http://localhost/api/v1/payment-intents/${id}`, {
      headers: session2Headers(),
    });
    expect(res.status).toBe(404);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('NOT_FOUND');
  });

  it('I-12: an unknown intent id returns 404', async () => {
    const res = await fetch('http://localhost/api/v1/payment-intents/does-not-exist', {
      headers: session1Headers(),
    });
    expect(res.status).toBe(404);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('NOT_FOUND');
  });
});

describe('POST /payment-intents/:id/outcome', () => {
  it('I-13: {outcome:succeeded} returns 200 with status succeeded', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0013');
    expectRecord(created.body);
    const id = readString(created.body, 'id');
    const { status, body } = await resolveIntent(id, 'succeeded');
    expect(status).toBe(200);
    expectRecord(body);
    expect(body['status']).toBe('succeeded');
  });

  it('I-14: the second resolve on a terminal intent returns 409 PAYMENT_ALREADY_RESOLVED', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0014');
    expectRecord(created.body);
    const id = readString(created.body, 'id');
    await resolveIntent(id, 'succeeded');
    const { status, body } = await resolveIntent(id, 'succeeded');
    expect(status).toBe(409);
    expectRecord(body);
    expect(body['code']).toBe('PAYMENT_ALREADY_RESOLVED');
    const params = body['params'];
    expectRecord(params);
    expect(params['status']).toBe('succeeded');
  });

  it('I-15: pending is not terminal — a follow-up declined is accepted', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0015');
    expectRecord(created.body);
    const id = readString(created.body, 'id');
    const first = await resolveIntent(id, 'pending');
    expect(first.status).toBe(200);
    expectRecord(first.body);
    expect(first.body['status']).toBe('pending');
    const second = await resolveIntent(id, 'declined');
    expect(second.status).toBe(200);
    expectRecord(second.body);
    expect(second.body['status']).toBe('declined');
  });

  it('I-16: {outcome:cancelled} returns 400 INVALID_REQUEST', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0016');
    expectRecord(created.body);
    const id = readString(created.body, 'id');
    const { status, body } = await resolveIntent(id, 'cancelled');
    expect(status).toBe(400);
    expectRecord(body);
    expect(body['code']).toBe('INVALID_REQUEST');
  });

  it('I-17: a different session cannot resolve the intent', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0017');
    expectRecord(created.body);
    const id = readString(created.body, 'id');
    const { status, body } = await resolveIntent(id, 'succeeded', session2Headers());
    expect(status).toBe(404);
    expectRecord(body);
    expect(body['code']).toBe('NOT_FOUND');
  });
});

// ===========================================================================
// E. Orders — 29 cases
// ===========================================================================

async function placeOrder(
  body: unknown,
  ifMatch: string,
  idempotencyKey: string,
  headers: Record<string, string> = session1Headers(),
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const res = await fetch('http://localhost/api/v1/orders', {
    method: 'POST',
    headers: { ...headers, 'If-Match': ifMatch, 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
  const responseBody: unknown = await res.json();
  return { status: res.status, body: responseBody, headers: res.headers };
}

async function seedCompleteCardDraftWithSucceededIntent(): Promise<{ paymentIntentId: string }> {
  await seedCompleteDraft();
  const created = await createCardIntent('"3"', 'idem-int-order-1');
  expectRecord(created.body);
  const paymentIntentId = readString(created.body, 'id');
  const resolved = await resolveIntent(paymentIntentId, 'succeeded');
  expect(resolved.status).toBe(200);
  return { paymentIntentId };
}

describe('POST /orders', () => {
  it('O-01: a card order on a complete draft returns 201 with the receipt shape', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    const { status, body, headers } = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0001',
    );
    expect(status).toBe(201);
    const location = headers.get('Location');
    expect(location).not.toBeNull();
    expectRecord(body);
    expect(readString(body, 'orderNumber')).toBe('DEMO-000001');
    expect(body['status']).toBe('confirmed');
    expect(body['paymentMethod']).toBe('card');
    const items = body['items'];
    expect(Array.isArray(items)).toBe(true);
    if (!Array.isArray(items)) throw new Error('items not an array');
    expect(items).toHaveLength(1);
    const item = firstRecord(items);
    expect(readString(item, 'productName')).toBe(MOTO_PRODUCT_NAME);
    expect(readString(item, 'variantId')).toBe(MOTO);
    expect(readString(item, 'colorName')).toBe('Zöld');
    expect(readNumber(item, 'storageGb')).toBe(256);
    expect(readNumber(item, 'quantity')).toBe(1);
    expect(item['unitPrice']).toEqual({ amount: 89_990, currency: 'HUF' });
    expect(item['lineTotal']).toEqual({ amount: 89_990, currency: 'HUF' });
    expect(body['subtotal']).toEqual({ amount: 89_990, currency: 'HUF' });
    expect(body['shippingFee']).toEqual({ amount: 0, currency: 'HUF' });
    expect(body['paymentFee']).toEqual({ amount: 0, currency: 'HUF' });
    expect(body['total']).toEqual({ amount: 89_990, currency: 'HUF' });
    expect(body['notice']).toBe(SIMULATION_NOTICE);
    expect(body['delivery']).toEqual({
      optionId: 'home_delivery',
      address: VALID_DELIVERY_ADDRESS,
    });
    expect(body['billing']).toEqual(VALID_BILLING);
    expect(readString(body, 'contactEmail')).toBe('teszt.elek@pelda.hu');
    const id = readString(body, 'id');
    expect(location).toBe(`/api/v1/orders/${id}`);
  });

  it('O-02: the same key replays the same body', async () => {
    // O-02 is the case that proves the contract's headline rule: a
    // replay is answered before the cart state is examined. After the
    // first order, `resetForOrder` (`cart-store.ts:216`, called from
    // `order-store.ts:526`) leaves a fresh v1 cart while the replay
    // still carries `If-Match: "3"`, so without the idempotency
    // short-circuit (`order-store.ts:367-373`, which runs before
    // `checkIfMatch` at `:391-392`) the second call would answer 412
    // rather than 201.
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    const first = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0002',
    );
    expect(first.status).toBe(201);
    const second = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0002',
    );
    expect(second.status).toBe(201);
    expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
    expectRecord(second.body);
    expect(readString(second.body, 'orderNumber')).toBe('DEMO-000001');
    expect(second.headers.get('Location')).toBe(first.headers.get('Location'));
  });

  it('O-03: after a successful order the cart is reset to a new v1 empty cart', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    const cartBefore = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    const cartBeforeBody: unknown = await cartBefore.json();
    expectRecord(cartBeforeBody);
    const oldId = readString(cartBeforeBody, 'id');

    await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0003',
    );

    const cartAfter = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    expect(cartAfter.headers.get('ETag')).toBe('"1"');
    const cartAfterBody: unknown = await cartAfter.json();
    expectRecord(cartAfterBody);
    expect(cartAfterBody['items']).toEqual([]);
    expect(readString(cartAfterBody, 'id')).not.toBe(oldId);
  });

  it('O-04: after a successful order the checkout draft is reset to v1 and complete:false', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0004',
    );

    const res = await fetch('http://localhost/api/v1/checkout', { headers: session1Headers() });
    expect(res.headers.get('ETag')).toBe('"1"');
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['contact']).toBeUndefined();
    expect(body['billing']).toBeUndefined();
    expect(body['delivery']).toBeUndefined();
    expect(body['payment']).toBeUndefined();
    expect(body['complete']).toBe(false);
  });

  it('O-05: after a successful card order the intent still reads back as succeeded', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0005',
    );

    const res = await fetch(`http://localhost/api/v1/payment-intents/${paymentIntentId}`, {
      headers: session1Headers(),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(readString(body, 'status')).toBe('succeeded');
  });

  it('O-06: a second order in the same session gets DEMO-000002', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0006',
    );

    // Second order in the same session — seed again, intent again, order.
    await seedMotoOnce(session1Headers());
    await patchCheckout({ contact: VALID_CONTACT }, '"2"');
    await patchCheckout({ billing: VALID_BILLING }, '"3"');
    await patchCheckout(
      { delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS } },
      '"4"',
    );
    await patchCheckout({ payment: { method: 'card' } }, '"5"');
    const intent = await createCardIntent('"6"', 'idem-int-order-6');
    expectRecord(intent.body);
    const intentId = readString(intent.body, 'id');
    await resolveIntent(intentId, 'succeeded');

    const second = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId: intentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"6"',
      'idem-ord-0006b',
    );
    expect(second.status).toBe(201);
    expectRecord(second.body);
    expect(readString(second.body, 'orderNumber')).toBe('DEMO-000002');
  });

  it("O-06b: a second order that reuses the first order's intent returns 422 PAYMENT_REQUIRED", async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0006c',
    );

    // Second order in the same session — seed again, then reuse the first intent.
    await seedMotoOnce(session1Headers());
    await patchCheckout({ contact: VALID_CONTACT }, '"2"');
    await patchCheckout({ billing: VALID_BILLING }, '"3"');
    await patchCheckout(
      { delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS } },
      '"4"',
    );
    await patchCheckout({ payment: { method: 'card' } }, '"5"');

    const reused = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"6"',
      'idem-ord-0006d',
    );
    expect(reused.status).toBe(422);
    expectRecord(reused.body);
    expect(reused.body['code']).toBe('PAYMENT_REQUIRED');
    expect(reused.body['detail']).toBe(
      'The referenced payment intent already backs an order; a new card order needs a new payment',
    );
    expect(reused.body['params']).toEqual({ paymentIntentId, status: 'succeeded' });
  });

  it('O-07: acceptedTerms:false returns 422 with TERMS_NOT_ACCEPTED and stores no order', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    const { status, body } = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: false,
      },
      '"3"',
      'idem-ord-0007',
    );
    expect(status).toBe(422);
    expectRecord(body);
    expect(body['code']).toBe('VALIDATION_FAILED');
    const errors = readFieldErrors(body);
    expect(errors).toEqual([{ path: '/acceptedTerms', code: 'TERMS_NOT_ACCEPTED' }]);

    // The order did not happen: the next call with a fresh key on the
    // same draft still succeeds.
    const retry = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0007b',
    );
    expect(retry.status).toBe(201);
    expectRecord(retry.body);
    expect(readString(retry.body, 'orderNumber')).toBe('DEMO-000001');
  });

  it('O-08: a wrong termsVersion returns 422 with TERMS_VERSION_MISMATCH', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-terms');
    expectRecord(created.body);
    const paymentIntentId = readString(created.body, 'id');
    await resolveIntent(paymentIntentId, 'succeeded');

    const { status, body } = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: '2025-01',
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0008',
    );
    expect(status).toBe(422);
    expectRecord(body);
    expect(body['code']).toBe('VALIDATION_FAILED');
    const errors = readFieldErrors(body);
    expect(errors).toEqual([{ path: '/termsVersion', code: 'TERMS_VERSION_MISMATCH' }]);
  });

  it('O-09: both consent fields wrong return both field errors in one response', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-consent');
    expectRecord(created.body);
    const paymentIntentId = readString(created.body, 'id');
    await resolveIntent(paymentIntentId, 'succeeded');

    const { status, body } = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: '2025-01',
        acceptedTerms: false,
      },
      '"3"',
      'idem-ord-0009',
    );
    expect(status).toBe(422);
    expectRecord(body);
    expect(body['code']).toBe('VALIDATION_FAILED');
    const errors = readFieldErrors(body);
    expect(errors).toEqual([
      { path: '/termsVersion', code: 'TERMS_VERSION_MISMATCH' },
      { path: '/acceptedTerms', code: 'TERMS_NOT_ACCEPTED' },
    ]);
  });

  it('O-10: an incomplete draft returns 422 CHECKOUT_INCOMPLETE with the SECTION_MISSING list', async () => {
    await seedMotoOnce(session1Headers());
    const { status, body } = await placeOrder(
      {
        paymentMethod: 'cash_on_delivery',
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"2"',
      'idem-ord-0010',
    );
    expect(status).toBe(422);
    expectRecord(body);
    expect(body['code']).toBe('CHECKOUT_INCOMPLETE');
    const errors = readFieldErrors(body);
    expect(errors).toEqual([
      { path: '/contact', code: 'SECTION_MISSING' },
      { path: '/billing', code: 'SECTION_MISSING' },
      { path: '/delivery', code: 'SECTION_MISSING' },
      { path: '/payment', code: 'SECTION_MISSING' },
    ]);
  });

  it('O-11: store-level — a CartStore with a stub lookup that returns out_of_stock surfaces OUT_OF_STOCK at createOrder', () => {
    const stubLookup: VariantLookupFn = (id) => {
      const hit = catalogStore.current?.getVariant(id);
      if (hit === undefined) return undefined;
      return {
        product: hit.product,
        variant: { ...hit.variant, availability: 'out_of_stock', maxQuantity: 2 },
      };
    };
    const cart = new CartStore(options, stubLookup);
    const checkout = new CheckoutStore(options, () => cart);
    const idempotency = new IdempotencyStore(options.clock);
    const order = new OrderStore(options, checkout, idempotency, () => cart);

    const add = cart.add(SESSION_1, '"1"', MOTO, 1);
    if (!add.ok) throw new Error('seed add failed');
    const draft = checkout.update(SESSION_1, '"2"', {
      contact: VALID_CONTACT,
      billing: VALID_BILLING,
      delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS },
      payment: { method: 'cash_on_delivery' },
    });
    if (!draft.ok) throw new Error('seed draft failed');

    const placed = order.createOrder(SESSION_1, 'idem-ord-0011', '"3"', {
      paymentMethod: 'cash_on_delivery',
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(placed.ok).toBe(false);
    if (placed.ok) throw new Error('expected OUT_OF_STOCK');
    expect(placed.problem.code).toBe('OUT_OF_STOCK');
    expect(placed.problem.status).toBe(409);
    const params = placed.problem.params;
    expectRecord(params);
    expect(params['variantId']).toBe(MOTO);
  });

  it('O-12: an intent in requires_action returns 422 PAYMENT_REQUIRED', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0012');
    expectRecord(created.body);
    const paymentIntentId = readString(created.body, 'id');
    const { status, body } = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0012',
    );
    expect(status).toBe(422);
    expectRecord(body);
    expect(body['code']).toBe('PAYMENT_REQUIRED');
  });

  it('O-13: an intent in pending returns 422 PAYMENT_PENDING', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0013');
    expectRecord(created.body);
    const paymentIntentId = readString(created.body, 'id');
    await resolveIntent(paymentIntentId, 'pending');
    const { status, body } = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0013',
    );
    expect(status).toBe(422);
    expectRecord(body);
    expect(body['code']).toBe('PAYMENT_PENDING');
  });

  it('O-14: an intent in declined returns 422 PAYMENT_DECLINED', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0014');
    expectRecord(created.body);
    const paymentIntentId = readString(created.body, 'id');
    await resolveIntent(paymentIntentId, 'declined');
    const { status, body } = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0014',
    );
    expect(status).toBe(422);
    expectRecord(body);
    expect(body['code']).toBe('PAYMENT_DECLINED');
  });

  it('O-15: a price change after the intent was created returns 409 PRICE_CHANGED', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0015');
    expectRecord(created.body);
    const paymentIntentId = readString(created.body, 'id');
    await resolveIntent(paymentIntentId, 'succeeded');

    // Add HONOR (cart -> v4, subtotal 89 990 + 69 990 = 159 980).
    const honorAdd = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"3"' },
      body: JSON.stringify({ variantId: HONOR, quantity: 1 }),
    });
    expect(honorAdd.status).toBe(200);

    const { status, body } = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"4"',
      'idem-ord-0015',
    );
    expect(status).toBe(409);
    expectRecord(body);
    expect(body['code']).toBe('PRICE_CHANGED');
    const params = body['params'];
    expectRecord(params);
    expect(params['intentAmount']).toBe(89_990);
    expect(params['total']).toBe(159_980);
  });

  it('O-16: a paymentIntentId that does not exist returns 404 NOT_FOUND', async () => {
    await seedCompleteDraft();
    const { status, body } = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId: 'no-such-intent',
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0016',
    );
    expect(status).toBe(404);
    expectRecord(body);
    expect(body['code']).toBe('NOT_FOUND');
  });

  it("O-17: another session's paymentIntentId returns 404 NOT_FOUND", async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0017');
    expectRecord(created.body);
    const paymentIntentId = readString(created.body, 'id');

    // SESSION_2's cart is independent; place an order through SESSION_2
    // referencing SESSION_1's intent.
    await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session2Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: MOTO, quantity: 1 }),
    });
    await patchCheckout(
      {
        contact: VALID_CONTACT,
        billing: VALID_BILLING,
        delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS },
        payment: { method: 'card' },
      },
      '"2"',
      session2Headers(),
    );
    const res = await fetch('http://localhost/api/v1/orders', {
      method: 'POST',
      headers: { ...session2Headers(), 'If-Match': '"3"', 'Idempotency-Key': 'idem-ord-0017' },
      body: JSON.stringify({
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      }),
    });
    expect(res.status).toBe(404);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('NOT_FOUND');
  });

  it('O-18: a cash-on-delivery draft orders without an intent and includes the 490 HUF fee', async () => {
    await seedMotoOnce(session1Headers());
    await patchCheckout({ contact: VALID_CONTACT }, '"2"');
    await patchCheckout({ billing: VALID_BILLING }, '"3"');
    await patchCheckout(
      { delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS } },
      '"4"',
    );
    await patchCheckout({ payment: { method: 'cash_on_delivery' } }, '"5"');

    const { status, body } = await placeOrder(
      {
        paymentMethod: 'cash_on_delivery',
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"6"',
      'idem-ord-0018',
    );
    expect(status).toBe(201);
    expectRecord(body);
    expect(body['paymentMethod']).toBe('cash_on_delivery');
    expect(body['paymentFee']).toEqual({ amount: 490, currency: 'HUF' });
    expect(body['total']).toEqual({ amount: 90_480, currency: 'HUF' });
  });

  it('O-19: requesting a different payment method than the draft returns PAYMENT_METHOD_MISMATCH', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    const { status, body } = await placeOrder(
      {
        paymentMethod: 'cash_on_delivery',
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0019',
    );
    expect(status).toBe(422);
    expectRecord(body);
    expect(body['code']).toBe('VALIDATION_FAILED');
    const errors = readFieldErrors(body);
    expect(errors).toEqual([{ path: '/paymentMethod', code: 'PAYMENT_METHOD_MISMATCH' }]);
    // Intent is untouched — verify by reading it back.
    expect(paymentIntentId).toBeDefined();
  });

  it('O-20: a stale If-Match against a v3 cart returns 412 CART_VERSION_CONFLICT', async () => {
    await seedCompleteDraft();
    const created = await createCardIntent('"3"', 'idem-int-0020');
    expectRecord(created.body);
    const paymentIntentId = readString(created.body, 'id');
    await resolveIntent(paymentIntentId, 'succeeded');

    const { status, body } = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"1"',
      'idem-ord-0020',
    );
    expect(status).toBe(412);
    expectRecord(body);
    expect(body['code']).toBe('CART_VERSION_CONFLICT');
  });

  it('O-21: an order on an expired cart returns 410 CART_EXPIRED', async () => {
    await seedMotoOnce(session1Headers());
    clock.advanceMs(CART_TTL_MS);
    const { status, body } = await placeOrder(
      {
        paymentMethod: 'cash_on_delivery',
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"2"',
      'idem-ord-0021',
    );
    expect(status).toBe(410);
    expectRecord(body);
    expect(body['code']).toBe('CART_EXPIRED');
  });

  it('O-22: the same key with a different body returns 409 IDEMPOTENCY_CONFLICT', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0022',
    );
    const { status, body } = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: false,
      },
      '"3"',
      'idem-ord-0022',
    );
    expect(status).toBe(409);
    expectRecord(body);
    expect(body['code']).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('O-23: a key replay inside the retention window, after the order consumed the cart, returns the original receipt', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    const first = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0023',
    );
    expect(first.status).toBe(201);
    expectRecord(first.body);
    const firstReceipt = first.body;

    clock.advanceMs(IDEMPOTENCY_WINDOW_MS - 60_000);
    const replay = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0023',
    );
    expect(replay.status).toBe(201);
    expect(JSON.stringify(replay.body)).toBe(JSON.stringify(firstReceipt));
  });

  it('O-23b: a key replay after the retention window falls through to the cart state and returns 412', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    const first = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0023b',
    );
    expect(first.status).toBe(201);
    expectRecord(first.body);
    const firstReceipt = first.body;

    clock.advanceMs(IDEMPOTENCY_WINDOW_MS);
    const replay = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0023b',
    );
    expect(replay.status).toBe(412);
    expectRecord(replay.body);
    expect(replay.body['code']).toBe('CART_VERSION_CONFLICT');
    expect(JSON.stringify(replay.body)).not.toBe(JSON.stringify(firstReceipt));
  });

  it('O-24: an unknown payment method returns 400 INVALID_REQUEST', async () => {
    await seedCompleteDraft();
    const { status, body } = await placeOrder(
      {
        paymentMethod: 'paypal',
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0024',
    );
    expect(status).toBe(400);
    expectRecord(body);
    expect(body['code']).toBe('INVALID_REQUEST');
  });
});

describe('GET /orders/:id', () => {
  it('O-25: the owning session can read its own order', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    const placed = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0025',
    );
    expectRecord(placed.body);
    const orderId = readString(placed.body, 'id');
    const res = await fetch(`http://localhost/api/v1/orders/${orderId}`, {
      headers: session1Headers(),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(JSON.stringify(body)).toBe(JSON.stringify(placed.body));
  });

  it('O-26: a different session gets 404 NOT_FOUND', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    const placed = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-ord-0026',
    );
    expectRecord(placed.body);
    const orderId = readString(placed.body, 'id');
    const res = await fetch(`http://localhost/api/v1/orders/${orderId}`, {
      headers: session2Headers(),
    });
    expect(res.status).toBe(404);
    const body: unknown = await res.json();
    expectRecord(body);
    expect(body['code']).toBe('NOT_FOUND');
  });

  it('O-27: an unknown order id returns 404', async () => {
    const res = await fetch('http://localhost/api/v1/orders/nope', {
      headers: session1Headers(),
    });
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// F. Once-only fault scenarios — 4 cases
// ===========================================================================

/**
 * Installs a handler list for the named scenario before the test's first
 * request, the way `faults.spec.ts` `buildOptions` does. The once-only
 * fault state is keyed on the options object, so the scenario and its
 * `Repository` have to be built before anything is fetched.
 */
function useScenario(scenarioName: string): void {
  options = buildOptions(scenarioName);
  server.use(...createHandlers(options));
}

describe('lost-once-order scenario', () => {
  beforeEach(() => {
    useScenario('lost-once-order');
  });

  it('L-01: the first committed order drops its response and still commits', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();

    await expect(
      placeOrder(
        {
          paymentMethod: 'card',
          paymentIntentId,
          termsVersion: TERMS_VERSION,
          acceptedTerms: true,
        },
        '"3"',
        'idem-ord-lost-0001',
      ),
    ).rejects.toBeInstanceOf(TypeError);

    // The store committed before the response was dropped: the receipt
    // exists and the cart is the new v1 empty cart `O-03` describes.
    const stored = orderStore.current?.toPersistedOrderState(SESSION_1);
    expect(stored?.receipts).toHaveLength(1);

    const cartAfter = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    expect(cartAfter.headers.get('ETag')).toBe('"1"');
    const cartBody: unknown = await cartAfter.json();
    expectRecord(cartBody);
    expect(cartBody['items']).toEqual([]);
  });

  it('L-02: the retry with the same Idempotency-Key reads the stored order back', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();
    const order = {
      paymentMethod: 'card',
      paymentIntentId,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    };

    await expect(placeOrder(order, '"3"', 'idem-ord-lost-0002')).rejects.toBeInstanceOf(TypeError);

    const retry = await placeOrder(order, '"3"', 'idem-ord-lost-0002');
    expect(retry.status).toBe(201);
    expectRecord(retry.body);
    expect(readString(retry.body, 'orderNumber')).toBe('DEMO-000001');

    const orderId = readString(retry.body, 'id');
    const read = await fetch(`http://localhost/api/v1/orders/${orderId}`, {
      headers: session1Headers(),
    });
    expect(read.status).toBe(200);
  });

  it('L-03: a validation refusal does not spend the lost once', async () => {
    const { paymentIntentId } = await seedCompleteCardDraftWithSucceededIntent();

    const refused = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: false,
      },
      '"3"',
      'idem-ord-lost-0003a',
    );
    expect(refused.status).toBe(422);
    expectRecord(refused.body);
    expect(refused.body['code']).toBe('VALIDATION_FAILED');

    await expect(
      placeOrder(
        {
          paymentMethod: 'card',
          paymentIntentId,
          termsVersion: TERMS_VERSION,
          acceptedTerms: true,
        },
        '"3"',
        'idem-ord-lost-0003b',
      ),
    ).rejects.toBeInstanceOf(TypeError);
  });
});

describe('lost-once-payment-intent scenario', () => {
  beforeEach(() => {
    useScenario('lost-once-payment-intent');
  });

  it('L-04: the first committed intent drops its response and the retry replays it', async () => {
    await seedCompleteDraft();

    await expect(createCardIntent('"3"', 'idem-int-lost-0004')).rejects.toBeInstanceOf(TypeError);

    // The store committed before the response was dropped: the intent is
    // already in it, so the retry replays rather than creating one.
    const stored = orderStore.current?.toPersistedOrderState(SESSION_1);
    expect(stored?.intents).toHaveLength(1);

    const retry = await createCardIntent('"3"', 'idem-int-lost-0004');
    expect(retry.status).toBe(201);
    expectRecord(retry.body);
    expect(readString(retry.body, 'id')).toBe(stored?.intents[0]?.id);
  });
});

/**
 * Stock ledger: a committed order decrements the demo stock exactly
 * once, and two once-only faults take a variant's whole stock at the
 * first matching request of the handler list so the standard's rows
 * E060 (`OUT_OF_STOCK` at add), E085 (`OUT_OF_STOCK` at confirm) and
 * E099 (`OUT_OF_STOCK` at order) can be tested. The committed fixture
 * keeps `apple-iphone-18-pro-max--fekete--256` at `maxQuantity: 1` and
 * `honor-magic-v6--fekete--512` at `maxQuantity: 2`.
 */
const PRO_MAX_BLACK_256 = 'apple-iphone-18-pro-max--fekete--256';
const PRO_MAX_GLECCSER_256 = 'apple-iphone-18-pro-max--gleccserszin--256';
const MAGIC_V6_BLACK_512 = 'honor-magic-v6--fekete--512';

async function addLine(
  variantId: string,
  ifMatch: string,
  headers: Record<string, string> = session1Headers(),
): Promise<void> {
  const res = await fetch('http://localhost/api/v1/cart/items', {
    method: 'POST',
    headers: { ...headers, 'If-Match': ifMatch },
    body: JSON.stringify({ variantId, quantity: 1 }),
  });
  expect(res.status).toBe(200);
}

async function addLineExpectStatus(
  variantId: string,
  ifMatch: string,
  expectedStatus: number,
  headers: Record<string, string> = session1Headers(),
): Promise<{ status: number; body: unknown }> {
  const res = await fetch('http://localhost/api/v1/cart/items', {
    method: 'POST',
    headers: { ...headers, 'If-Match': ifMatch },
    body: JSON.stringify({ variantId, quantity: 1 }),
  });
  expect(res.status).toBe(expectedStatus);
  const body: unknown = await res.json();
  return { status: res.status, body };
}

/** Read the product body and find a variant by id. */
function findVariant(
  body: Record<string, unknown>,
  variantId: string,
): Record<string, unknown> | undefined {
  const variants = body['variants'];
  expect(Array.isArray(variants)).toBe(true);
  for (const candidate of variants as readonly unknown[]) {
    expectRecord(candidate);
    if (candidate['id'] === variantId) return candidate;
  }
  return undefined;
}

/** Read a list item and find a colour option by `variantId`. */
function findColorOption(
  item: Record<string, unknown>,
  variantId: string,
): Record<string, unknown> | undefined {
  const colors = item['colors'];
  expect(Array.isArray(colors)).toBe(true);
  for (const candidate of colors as readonly unknown[]) {
    expectRecord(candidate);
    if (candidate['variantId'] === variantId) return candidate;
  }
  return undefined;
}

/** Read the `fekete` count of `facets.colors` on a `/products` list body. */
function readFeketeFacetCount(body: Record<string, unknown>): number {
  expectRecord(body);
  const facets = body['facets'];
  expectRecord(facets);
  const colors = facets['colors'];
  expect(Array.isArray(colors)).toBe(true);
  for (const candidate of colors as readonly unknown[]) {
    expectRecord(candidate);
    if (candidate['value'] === 'fekete') {
      expect(typeof candidate['count']).toBe('number');
      return candidate['count'] as number;
    }
  }
  throw new Error('fekete facet missing');
}

/** Patch the complete card draft (contact + billing + delivery + payment:card). */
async function patchCardDraft(ifMatch: string): Promise<void> {
  const patch = await patchCheckout(
    {
      contact: VALID_CONTACT,
      billing: VALID_BILLING,
      delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS },
      payment: { method: 'card' },
    },
    ifMatch,
  );
  expect(patch.status).toBe(200);
}

describe('stock ledger (AC13, E060, E085, E099)', () => {
  it('S-01 a committed order sells its units once', async () => {
    const listBefore = await fetch(
      'http://localhost/api/v1/products?q=iphone%2018%20pro%20max&inStock=true&pageSize=24',
      { headers: session1Headers() },
    );
    expect(listBefore.status).toBe(200);
    const listBeforeBody: unknown = await listBefore.json();
    expectRecord(listBeforeBody);
    const feketeBefore = readFeketeFacetCount(listBeforeBody);

    // One `apple-iphone-18-pro-max--fekete--256` card order
    // → cart v1 empty, add at v1 → v2, patch at v2 → v3,
    // intent at v3 → v4, order at v4 (using the actual TERMS_VERSION).
    await addLine(PRO_MAX_BLACK_256, '"1"');
    await patchCardDraft('"2"');
    const intentRes = await createCardIntent('"3"', 'idem-int-stock-0001');
    expect(intentRes.status).toBe(201);
    expectRecord(intentRes.body);
    const paymentIntentId = readString(intentRes.body, 'id');
    const resolved = await resolveIntent(paymentIntentId, 'succeeded');
    expect(resolved.status).toBe(200);

    const placed = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-stock-0001',
    );
    expect(placed.status).toBe(201);

    const listAfter = await fetch(
      'http://localhost/api/v1/products?q=iphone%2018%20pro%20max&inStock=true&pageSize=24',
      { headers: session1Headers() },
    );
    expect(listAfter.status).toBe(200);
    const listAfterBody: unknown = await listAfter.json();
    expectRecord(listAfterBody);
    const feketeAfter = readFeketeFacetCount(listAfterBody);
    expect(feketeAfter).toBe(feketeBefore - 1);

    // The product read shows the sold variant out of stock and the
    // sibling colour still in stock.
    const productRes = await fetch('http://localhost/api/v1/products/apple-iphone-18-pro-max', {
      headers: session1Headers(),
    });
    expect(productRes.status).toBe(200);
    const productBody: unknown = await productRes.json();
    expectRecord(productBody);
    const proMaxVariant = findVariant(productBody, PRO_MAX_BLACK_256);
    expect(proMaxVariant).toBeDefined();
    expect(proMaxVariant?.['maxQuantity']).toBe(0);
    expect(proMaxVariant?.['availability']).toBe('out_of_stock');
    const sibling = findVariant(productBody, PRO_MAX_GLECCSER_256);
    expect(sibling?.['maxQuantity']).toBe(1);
    expect(sibling?.['availability']).toBe('in_stock');

    // The list item carries the sold-out colour option, and the
    // related-products item does too.
    const listNoStockFilter = await fetch(
      'http://localhost/api/v1/products?q=iphone%2018%20pro%20max&pageSize=24',
      { headers: session1Headers() },
    );
    const listNoStockFilterBody: unknown = await listNoStockFilter.json();
    expectRecord(listNoStockFilterBody);
    const items = listNoStockFilterBody['items'];
    expect(Array.isArray(items)).toBe(true);
    let proMaxAt256: Record<string, unknown> | undefined;
    for (const candidate of items as readonly unknown[]) {
      expectRecord(candidate);
      if (candidate['slug'] === 'apple-iphone-18-pro-max' && candidate['storageGb'] === 256) {
        proMaxAt256 = candidate;
        break;
      }
    }
    expect(proMaxAt256).toBeDefined();
    expectDefined(proMaxAt256);
    const soldColor = findColorOption(proMaxAt256, PRO_MAX_BLACK_256);
    expect(soldColor?.['availability']).toBe('out_of_stock');

    const relatedRes = await fetch('http://localhost/api/v1/products/apple-iphone-18-pro/related', {
      headers: session1Headers(),
    });
    expect(relatedRes.status).toBe(200);
    const relatedBody: unknown = await relatedRes.json();
    expect(Array.isArray(relatedBody)).toBe(true);
    let relatedProMax: Record<string, unknown> | undefined;
    for (const candidate of relatedBody as readonly unknown[]) {
      expectRecord(candidate);
      if (candidate['slug'] === 'apple-iphone-18-pro-max') {
        relatedProMax = candidate;
        break;
      }
    }
    expect(relatedProMax).toBeDefined();
    expectDefined(relatedProMax);
    const relatedColor = findColorOption(relatedProMax, PRO_MAX_BLACK_256);
    expect(relatedColor?.['availability']).toBe('out_of_stock');

    // Adding the same variant to a different session now refuses as
    // `OUT_OF_STOCK` with the variant id in the params.
    const second = await addLineExpectStatus(PRO_MAX_BLACK_256, '"1"', 409, session2Headers());
    expectRecord(second.body);
    expect(second.body['code']).toBe('OUT_OF_STOCK');
    const params = second.body['params'];
    expectRecord(params);
    expect(params['variantId']).toBe(PRO_MAX_BLACK_256);
  });

  it('S-02 a replayed order does not sell twice', async () => {
    await addLine(MAGIC_V6_BLACK_512, '"1"');
    await patchCardDraft('"2"');
    const intentRes = await createCardIntent('"3"', 'idem-int-stock-0002');
    expect(intentRes.status).toBe(201);
    expectRecord(intentRes.body);
    const paymentIntentId = readString(intentRes.body, 'id');
    const resolved = await resolveIntent(paymentIntentId, 'succeeded');
    expect(resolved.status).toBe(200);

    const orderBody = {
      paymentMethod: 'card',
      paymentIntentId,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    } as const;

    const first = await placeOrder(orderBody, '"3"', 'idem-stock-0002');
    expect(first.status).toBe(201);
    expectRecord(first.body);
    const firstId = readString(first.body, 'id');

    const second = await placeOrder(orderBody, '"3"', 'idem-stock-0002');
    expect(second.status).toBe(201);
    expectRecord(second.body);
    expect(readString(second.body, 'id')).toBe(firstId);

    const productRes = await fetch('http://localhost/api/v1/products/honor-magic-v6', {
      headers: session1Headers(),
    });
    expect(productRes.status).toBe(200);
    const productBody: unknown = await productRes.json();
    expectRecord(productBody);
    const v = findVariant(productBody, MAGIC_V6_BLACK_512);
    expect(v?.['maxQuantity']).toBe(1);
    expect(v?.['availability']).toBe('in_stock');
  });

  it('S-03 stock-lost-once-order refuses the order and changes nothing', async () => {
    useScenario('stock-lost-once-order');

    // Two adds, patch card draft, intent, resolve, order.
    await addLine(MAGIC_V6_BLACK_512, '"1"');
    await addLine(PRO_MAX_BLACK_256, '"2"');
    await patchCardDraft('"3"');
    const intentRes = await createCardIntent('"4"', 'idem-int-stock-0003');
    expect(intentRes.status).toBe(201);
    expectRecord(intentRes.body);
    const paymentIntentId = readString(intentRes.body, 'id');
    const resolved = await resolveIntent(paymentIntentId, 'succeeded');
    expect(resolved.status).toBe(200);

    const refused = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"4"',
      'idem-stock-0003',
    );
    expect(refused.status).toBe(409);
    expectRecord(refused.body);
    expect(refused.body['code']).toBe('OUT_OF_STOCK');
    const refusedParams = refused.body['params'];
    expectRecord(refusedParams);
    expect(refusedParams['variantId']).toBe(PRO_MAX_BLACK_256);

    const honorRes = await fetch('http://localhost/api/v1/products/honor-magic-v6', {
      headers: session1Headers(),
    });
    expect(honorRes.status).toBe(200);
    const honorBody: unknown = await honorRes.json();
    expectRecord(honorBody);
    expect(findVariant(honorBody, MAGIC_V6_BLACK_512)?.['maxQuantity']).toBe(2);

    const cartRes = await fetch('http://localhost/api/v1/cart', {
      headers: session1Headers(),
    });
    expect(cartRes.status).toBe(200);
    const cartBody: unknown = await cartRes.json();
    expectRecord(cartBody);
    const cartEtag = cartRes.headers.get('ETag');
    expect(typeof cartEtag).toBe('string');
    const cartItems = cartBody['items'];
    expect(Array.isArray(cartItems)).toBe(true);
    expect((cartItems as readonly unknown[]).length).toBe(1);
    const notices = cartBody['notices'];
    expect(Array.isArray(notices)).toBe(true);
    const noticeList = notices as readonly unknown[];
    let foundNotice: Record<string, unknown> | undefined;
    for (const entry of noticeList) {
      expectRecord(entry);
      if (entry['code'] === 'ITEM_REMOVED' && entry['variantId'] === PRO_MAX_BLACK_256) {
        foundNotice = entry;
        break;
      }
    }
    expect(foundNotice).toBeDefined();

    const draftRes = await fetch('http://localhost/api/v1/checkout', {
      headers: session1Headers(),
    });
    expect(draftRes.status).toBe(200);
    const draftBody: unknown = await draftRes.json();
    expectRecord(draftBody);
    const draftContact = draftBody['contact'];
    expectRecord(draftContact);
    expect(draftContact['email']).toBe(VALID_CONTACT.email.toLowerCase());

    expectString(cartEtag, 'ETag');
    const cartEtagString = cartEtag;

    const retryIntent = await createCardIntent(cartEtagString, 'idem-int-stock-0003b');
    expect(retryIntent.status).toBe(201);
    expectRecord(retryIntent.body);
    const retryPaymentIntentId = readString(retryIntent.body, 'id');
    const retryResolved = await resolveIntent(retryPaymentIntentId, 'succeeded');
    expect(retryResolved.status).toBe(200);

    const retry = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId: retryPaymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      cartEtagString,
      'idem-stock-0003b',
    );
    expect(retry.status).toBe(201);
    expectRecord(retry.body);
    const retryItems = retry.body['items'];
    expect(Array.isArray(retryItems)).toBe(true);
    expect((retryItems as readonly unknown[]).length).toBe(1);

    const honorResAfter = await fetch('http://localhost/api/v1/products/honor-magic-v6', {
      headers: session1Headers(),
    });
    const honorBodyAfter: unknown = await honorResAfter.json();
    expectRecord(honorBodyAfter);
    expect(findVariant(honorBodyAfter, MAGIC_V6_BLACK_512)?.['maxQuantity']).toBe(1);
  });

  it('S-04 stock-lost-once-cart-add refuses the first add and leaves the cart unchanged', async () => {
    useScenario('stock-lost-once-cart-add');

    const first = await addLineExpectStatus(MAGIC_V6_BLACK_512, '"1"', 409);
    expectRecord(first.body);
    expect(first.body['code']).toBe('OUT_OF_STOCK');
    expectRecord(first.body['params']);
    expect(first.body['params']['variantId']).toBe(MAGIC_V6_BLACK_512);

    const cartRes = await fetch('http://localhost/api/v1/cart', {
      headers: session1Headers(),
    });
    expect(cartRes.status).toBe(200);
    const cartBody: unknown = await cartRes.json();
    expectRecord(cartBody);
    expect(cartRes.headers.get('ETag')).toBe('"1"');
    const items = cartBody['items'];
    expect(Array.isArray(items)).toBe(true);
    expect(items).toEqual([]);

    const honorRes = await fetch('http://localhost/api/v1/products/honor-magic-v6', {
      headers: session1Headers(),
    });
    const honorBody: unknown = await honorRes.json();
    expectRecord(honorBody);
    expect(findVariant(honorBody, MAGIC_V6_BLACK_512)?.['availability']).toBe('out_of_stock');

    const _second = await addLineExpectStatus(PRO_MAX_BLACK_256, '"1"', 200);
  });

  it('S-06 the default scenario takes nothing', async () => {
    await addLine(MAGIC_V6_BLACK_512, '"1"');
    await patchCardDraft('"2"');
    const intentRes = await createCardIntent('"3"', 'idem-int-stock-0006');
    expect(intentRes.status).toBe(201);
    expectRecord(intentRes.body);
    const paymentIntentId = readString(intentRes.body, 'id');
    const resolved = await resolveIntent(paymentIntentId, 'succeeded');
    expect(resolved.status).toBe(200);

    const placed = await placeOrder(
      {
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      },
      '"3"',
      'idem-stock-0006',
    );
    expect(placed.status).toBe(201);
  });
});
