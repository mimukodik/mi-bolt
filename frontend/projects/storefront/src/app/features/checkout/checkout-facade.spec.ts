/**
 * MIM-212 — checkout facade on the 2.0.0 contract (unit S3-F1a).
 *
 * Cases over the checkout facade's public surface — options and
 * session hydration, the four section writes, conflict and error
 * recovery, payment-intent idempotency, and order submit — measured
 * against the configured backend values that
 * `projects/shop-mocks/src/checkout/checkout-store.ts` and `application.properties`
 * lock in. Every assertion names an exact wire value (version, header,
 * body key set, amount, orderNumber), never `.exists()`-style coverage.
 *
 * Harness copies `src/app/features/cart/cart.facade.spec.ts:1-160`:
 * `useMswServer()`, the four handler side-effect imports,
 * `provideZonelessChangeDetection()`,
 * `provideHttpClient(withInterceptors([demoSessionInterceptor]))`,
 * `provideApiConfiguration(BASE_URL)`, the catalogue load in
 * `beforeAll`, the fixed clock and deterministic ids in `beforeEach`,
 * and `server.use(...createHandlers(options))` in `beforeEach`.
 * Captures ride a `server.events.on('request:start', ...)` listener so
 * every case can assert method, URL, headers and body text against the
 * same shape.
 */

// @vitest-environment jsdom
import '@angular/compiler';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server, useMswServer } from '../../../../../../tests/msw-server';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';
import { demoSessionInterceptor } from '@mi-bolt/core-api/demo-session.interceptor';

import { createHandlers } from '@mi-bolt/mocks/create-handlers';
import { isCatalogFixtureShape, loadCatalogFixture } from '@mi-bolt/mocks/catalog/catalog.handlers';
import { TERMS_VERSION } from '@mi-bolt/mocks/checkout/checkout-store';
import { isRecord } from '@mi-bolt/mocks/is-record';
import '@mi-bolt/mocks/cart/cart.handlers';
import '@mi-bolt/mocks/checkout/checkout.handlers';
import '@mi-bolt/mocks/payment/payment.handlers';
import '@mi-bolt/mocks/orders/order.handlers';
import { Repository } from '@mi-bolt/mocks/repository';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
} from '@mi-bolt/mocks/scenarios';

import catalogFixture from '../../../../../../docs/api/fixtures/catalog.json';
import type { Address } from '@mi-bolt/api/models/address';
import type { BillingDetails } from '@mi-bolt/api/models/billing-details';

import { CartFacade } from '../cart/cart.facade';
import { CheckoutFacade } from './checkout.facade';
import { checkoutKeys } from './checkout-keys';

useMswServer();

const BASE_URL = 'http://localhost/api/v1';
const MOTO = 'motorola-edge-50-fusion--zold--256';
const HONOR = 'honor-x7d--fekete--128';

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
} satisfies BillingDetails;
const VALID_DELIVERY_ADDRESS = {
  countryCode: 'HU',
  postalCode: '1052',
  city: 'Budapest',
  line1: 'Petőfi utca 1.',
} satisfies Address;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

/** Reads a required string field from a narrowed record without a cast. */
function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  expect(typeof value).toBe('string');
  if (typeof value !== 'string') throw new Error(`${key} is not a string`);
  return value;
}

/** Reads the stored `key` from a checkout-namespaced sessionStorage slot,
 *  narrowing the JSON without a cast. */
function readStoredKey(slot: string): string {
  const raw = sessionStorage.getItem(slot);
  if (raw === null) throw new Error(`expected sessionStorage slot ${slot} to exist`);
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error(`expected ${slot} to be a record`);
  return readString(parsed, 'key');
}

// ---------------------------------------------------------------------------
// Capture harness — every request lands here so a case can assert the
// method, the URL, the headers and the body. Body reading is async and
// races the `request:start` listener; the helper below flushes one tick
// after each facade call.
// ---------------------------------------------------------------------------

interface CapturedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string | undefined>;
  readonly body: string;
}
let captures: CapturedRequest[] = [];

/** Captures the first `X-Demo-Session` the MSW stream sees so raw
 * `fetch` calls in helper resolvers can carry the same id. The
 * interceptor's module-level cache survives `sessionStorage.clear()`
 * between tests, so reading storage would land on an empty slot by
 * test two and the wrong id would 404 against the freshly seeded
 * store. The MSW request stream sees the same value the interceptor
 * actually emitted, which is the one the OrderStore locked in. */
let capturedDemoSession: string | null = null;

async function captureRequest(request: Request): Promise<void> {
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((v, k) => {
    headers[k] = v;
  });
  let bodyText = '';
  try {
    bodyText = await request.clone().text();
  } catch {
    // Body already consumed or unavailable; leave the captured body empty.
  }
  captures.push({ method: request.method, url: request.url, headers, body: bodyText });
}

/** Lets the async body-reads finish before a case reads the captures. */
async function flushCaptures(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });
}

function requestsTo(method: string, pathSuffix: string): CapturedRequest[] {
  return captures.filter((c) => c.method === method && c.url.endsWith(`/api/v1${pathSuffix}`));
}

function findRequest(method: string, pathSuffix: string): CapturedRequest | undefined {
  return requestsTo(method, pathSuffix)[0];
}

// ---------------------------------------------------------------------------
// Shared setup — clock, ids, options, handler chain, TestBed
// ---------------------------------------------------------------------------

let clock: ReturnType<typeof createFixedClock>;
let ids: ReturnType<typeof createDeterministicIds>;
let options: {
  repository: Repository;
  clock: ReturnType<typeof createFixedClock>;
  ids: ReturnType<typeof createDeterministicIds>;
  scenario: typeof DEFAULT_SCENARIO;
  apiRoot: string;
};

beforeAll(() => {
  if (!isCatalogFixtureShape(catalogFixture)) {
    throw new Error('[checkout-facade.spec] committed fixture does not match expected shape');
  }
  loadCatalogFixture(catalogFixture);
});

beforeEach(() => {
  captures = [];
  capturedDemoSession = null;
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
  server.events.on('request:start', ({ request }) => {
    if (capturedDemoSession === null) {
      const session = request.headers.get('X-Demo-Session');
      if (session !== null) capturedDemoSession = session;
    }
    void captureRequest(request);
  });
});

afterEach(() => {
  server.events.removeAllListeners('request:start');
  server.resetHandlers();
  sessionStorage.clear();
  TestBed.resetTestingModule();
});

function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
      provideRouter([]),
    ],
    teardown: { destroyAfterEach: true },
  });
}

/** Boots the cart facade, then awaits its boot fetch. */
async function bootCart(): Promise<CartFacade> {
  const cart = TestBed.inject(CartFacade);
  // The cart facade fires its own `ensureCart()` in the constructor;
  // give it a microtask to land before we read signals.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await flushCaptures();
  return cart;
}

/** Seeds one MOTO via the cart facade, returning the cart at version 2. */
async function seedMoto(): Promise<CartFacade> {
  const cart = await bootCart();
  await cart.addItem(MOTO, 1);
  await flushCaptures();
  return cart;
}

/** Drives the four section writes against a cart seeded with MOTO. */
async function seedCompleteDraft(
  checkout: CheckoutFacade,
  paymentMethod: 'card' | 'cash_on_delivery' = 'card',
): Promise<void> {
  const result = await checkout.updateContact(VALID_CONTACT);
  if (!result.ok) throw new Error('seedContact failed');
  await checkout.updateBilling(VALID_BILLING);
  await checkout.updateDelivery({
    optionId: 'home_delivery',
    address: VALID_DELIVERY_ADDRESS,
  });
  await checkout.updatePayment({ method: paymentMethod });
}

/** Resolves a freshly created intent to `succeeded`. */
async function resolveSucceeded(intentId: string): Promise<void> {
  const res = await fetch(`http://localhost/api/v1/payment-intents/${intentId}/outcome`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Demo-Session': capturedDemoSession ?? '',
    },
    body: JSON.stringify({ outcome: 'succeeded' }),
  });
  expect(res.status).toBe(200);
}

/** The `Problem` body the order store answers a stale card intent with:
 *  `params.intentAmount` is what the intent paid, `params.total` the
 *  cart's recomputed total, so the two differ by exactly the HONOR line
 *  `addHonorFromTheServer` adds. */
const PRICE_CHANGED_PROBLEM = {
  type: 'urn:mi-bolt:problem:price-changed',
  title: 'Conflict',
  status: 409,
  code: 'PRICE_CHANGED',
  detail: 'Cart prices were updated; the shopper must review the new total.',
  params: { intentAmount: 89_990, total: 159_980 },
  traceId: 'mock-trace-test',
  fieldErrors: [],
};

/** The `Problem` body a downstream that could not answer produces. */
const SERVICE_UNAVAILABLE_PROBLEM = {
  type: 'urn:mi-bolt:problem:service-unavailable',
  title: 'Service unavailable',
  status: 503,
  code: 'SERVICE_UNAVAILABLE',
  detail: 'downstream',
  params: {},
  traceId: 'mock-trace-test',
  fieldErrors: [],
};

/** Seeds MOTO, loads the options, completes a card draft and resolves a
 *  card intent for the pre-change total (89 990), so the order store's
 *  intent check passes and the order write is what the price change
 *  trips. Returns the resolved intent's id. */
async function seedCardDraftWithResolvedIntent(checkout: CheckoutFacade): Promise<string> {
  await seedMoto();
  await checkout.ensureOptions();
  await seedCompleteDraft(checkout, 'card');
  const created = await checkout.createPaymentIntent();
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
  await resolveSucceeded(created.value.id);
  return created.value.id;
}

/** Adds HONOR through the raw cart route: the server's total moves to
 *  159 980 while the facade's cached `session.summary` stays at 89 990. */
async function addHonorFromTheServer(): Promise<void> {
  const added = await fetch('http://localhost/api/v1/cart/items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': '"6"',
      'X-Demo-Session': capturedDemoSession ?? '',
    },
    body: JSON.stringify({ variantId: HONOR, quantity: 1 }),
  });
  expect(added.status).toBe(200);
}

// ---------------------------------------------------------------------------
// F-01..F-04: ensureOptions / ensureSession
// ---------------------------------------------------------------------------

describe('ensureOptions / ensureSession', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('F-01: ensureOptions() loads the two delivery options and the two payment methods', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = await bootCart();
    await cart.addItem(MOTO, 1);
    await flushCaptures();

    const result = await checkout.ensureOptions();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const options = result.value;
    expect(options.deliveryOptions.map((d) => d.id)).toEqual(['home_delivery', 'pickup_point']);
    expect(options.paymentMethods.map((p) => p.id)).toEqual(['card', 'cash_on_delivery']);
    expect(options.termsVersion).toBe(TERMS_VERSION);
  });

  it('F-02: ensureOptions() is a no-op on a second call and refetches with force', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = await bootCart();
    await cart.addItem(MOTO, 1);
    await flushCaptures();

    await checkout.ensureOptions();
    await checkout.ensureOptions();
    await checkout.ensureOptions();
    expect(requestsTo('GET', '/checkout/options')).toHaveLength(1);

    await checkout.ensureOptions(true);
    expect(requestsTo('GET', '/checkout/options')).toHaveLength(2);
  });

  it('F-03: ensureSession() on a fresh session reports an empty, incomplete draft', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await bootCart();

    const result = await checkout.ensureSession();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.complete).toBe(false);
    expect('contact' in result.value).toBe(false);
    expect('billing' in result.value).toBe(false);
    expect('delivery' in result.value).toBe(false);
    expect('payment' in result.value).toBe(false);

    const summary = checkout.summary();
    expect(summary?.subtotal).toEqual({ amount: 0, currency: 'HUF' });
    expect(summary?.shippingFee).toEqual({ amount: 0, currency: 'HUF' });
    expect(summary?.paymentFee).toEqual({ amount: 0, currency: 'HUF' });
    expect(summary?.total).toEqual({ amount: 0, currency: 'HUF' });
  });

  it('F-04: ensureSession() adopts the server version into the cart facade', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = await seedMoto();
    expect(cart.cart()?.version).toBe(2);

    const result = await checkout.ensureSession();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(cart.cart()?.version).toBe(2);
    expect(checkout.version()).toBe(2);
    expect(checkout.session()?.version).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// F-05..F-11: section writes
// ---------------------------------------------------------------------------

describe('section writes', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('F-05: updateContact() sends only the contact section', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    captures.length = 0;

    const result = await checkout.updateContact(VALID_CONTACT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.complete).toBe(false);

    const patch = findRequest('PATCH', '/checkout');
    expect(patch).toBeDefined();
    const parsed: unknown = JSON.parse(patch?.body ?? '{}');
    if (!isRecord(parsed)) throw new Error('expected checkout body to be an object');
    expect(Object.keys(parsed)).toEqual(['contact']);
  });

  it('F-06: updateContact() bumps the shared version and writes it back to the cart', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = await seedMoto();

    await checkout.updateContact(VALID_CONTACT);
    expect(checkout.session()?.version).toBe(3);
    expect(cart.cart()?.version).toBe(3);

    const cartGets = requestsTo('GET', '/cart');
    expect(cartGets).toHaveLength(1);
  });

  it('F-07: updateDelivery("home_delivery") keeps shippingFee at 0 above the free-shipping threshold and total at 89990', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.updateContact(VALID_CONTACT);
    await checkout.updateBilling(VALID_BILLING);

    await checkout.updateDelivery({
      optionId: 'home_delivery',
      address: VALID_DELIVERY_ADDRESS,
    });

    const summary = checkout.summary();
    expect(summary?.shippingFee).toEqual({ amount: 0, currency: 'HUF' });
    expect(summary?.total).toEqual({ amount: 89_990, currency: 'HUF' });
  });

  it('F-08: updateDelivery("pickup_point") sends no address key', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    captures.length = 0;

    await checkout.updateDelivery({ optionId: 'pickup_point' });

    const patch = findRequest('PATCH', '/checkout');
    expect(patch).toBeDefined();
    const parsed: unknown = JSON.parse(patch?.body ?? '{}');
    if (!isRecord(parsed)) throw new Error('expected checkout body to be an object');
    const delivery = parsed['delivery'];
    expect(isRecord(delivery)).toBe(true);
    if (!isRecord(delivery)) throw new Error('expected delivery to be an object');
    expect(Object.keys(delivery)).toEqual(['optionId']);
    expect(readString(delivery, 'optionId')).toBe('pickup_point');
  });

  it('F-09: updatePayment("cash_on_delivery") adds the 490 payment fee', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();

    await checkout.updatePayment({ method: 'cash_on_delivery' });

    const summary = checkout.summary();
    expect(summary?.paymentFee).toEqual({ amount: 490, currency: 'HUF' });
    expect(summary?.total).toEqual({ amount: 90_480, currency: 'HUF' });
  });

  it('F-10: updateBilling() completes the draft', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.updateContact(VALID_CONTACT);
    await checkout.updateDelivery({
      optionId: 'home_delivery',
      address: VALID_DELIVERY_ADDRESS,
    });
    await checkout.updatePayment({ method: 'card' });
    expect(checkout.complete()).toBe(false);

    await checkout.updateBilling(VALID_BILLING);
    expect(checkout.complete()).toBe(true);
    expect(checkout.session()?.complete).toBe(true);
  });

  it('F-11: the facade never reads session().version for If-Match', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = await seedMoto();

    // A server-side version bump that the cart never adopted — a passive
    // trap. The PATCH below should bind to cart.cart().version = 2, not
    // to whatever GET /checkout would have returned.
    server.use(
      http.get('*/api/v1/checkout', () =>
        HttpResponse.json(
          {
            version: 9,
            complete: false,
            summary: {
              subtotal: { amount: 89_990, currency: 'HUF' },
              shippingFee: { amount: 0, currency: 'HUF' },
              paymentFee: { amount: 0, currency: 'HUF' },
              total: { amount: 89_990, currency: 'HUF' },
            },
          },
          { status: 200, headers: { 'content-type': 'application/json', etag: '"9"' } },
        ),
      ),
    );

    captures.length = 0;
    await checkout.updateContact(VALID_CONTACT);

    const patch = findRequest('PATCH', '/checkout');
    expect(patch).toBeDefined();
    expect(patch?.headers['if-match']).toBe('"2"');
    // The PATCH bumps the shared cart version through the mock's
    // `checkout-store.update` -> `cart.touch` chain, so the cart
    // facade's snapshot now sits at 3 (the version the PATCH
    // returned). The headline assertion is the If-Match header above:
    // proving the facade never read the v9 GET /checkout response
    // for the precondition.
    expect(cart.cart()?.version).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// F-12..F-16: conflict and error handling
// ---------------------------------------------------------------------------

describe('conflict and error handling', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('F-12: a 412 surfaces conflict, refetches both, and does not replay', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    captures.length = 0;

    server.use(
      http.patch('*/api/v1/checkout', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:cart-version-conflict',
            title: 'Precondition failed',
            status: 412,
            code: 'CART_VERSION_CONFLICT',
            detail: 'The cart changed since the version supplied in If-Match',
            params: { expected: 3, received: '"2"' },
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 412, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const result = await checkout.updateContact(VALID_CONTACT);
    expect(result.ok).toBe(false);

    expect(requestsTo('PATCH', '/checkout')).toHaveLength(1);
    expect(checkout.conflict()?.code).toBe('CART_VERSION_CONFLICT');
    expect(checkout.conflict()?.intent).toBe('contact');
    expect(checkout.conflict()?.serverVersion).toBe(2);
    expect(checkout.error()).toBeNull();

    // Let the fire-and-forget refetch + refreshSession settle.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    const cart = TestBed.inject(CartFacade);
    expect(cart.cart()?.version).toBe(2);
  });

  it('F-13: retry() resubmits the conflicting intent with the current version', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    captures.length = 0;

    let attempt = 0;
    server.use(
      http.patch('*/api/v1/checkout', () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            {
              type: 'urn:mi-bolt:problem:cart-version-conflict',
              title: 'Precondition failed',
              status: 412,
              code: 'CART_VERSION_CONFLICT',
              detail: 'The cart changed since the version supplied in If-Match',
              params: { expected: 3, received: '"2"' },
              traceId: 'mock-trace-test',
              fieldErrors: [],
            },
            { status: 412, headers: { 'content-type': 'application/problem+json' } },
          );
        }
        // The retry PATCH must reach the default mock. Returning
        // undefined hands control back to the layered queue, so the
        // retry succeeds against the reconciled cart version.
        return undefined;
      }),
    );

    await checkout.updateContact(VALID_CONTACT);
    expect(checkout.conflict()).not.toBeNull();

    // Let the background refetch settle before retry — `refreshSession`
    // in the conflict path adopted the server's v2 into the cart, so
    // the retry PATCH will carry If-Match "2".
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    captures.length = 0;

    await checkout.retry();

    const patches = requestsTo('PATCH', '/checkout');
    expect(patches).toHaveLength(1);
    expect(patches[0]?.headers['if-match']).toBe('"2"');
    expect(checkout.conflict()).toBeNull();
    expect(checkout.session()?.contact).toEqual({
      fullName: 'Teszt Elek',
      email: 'teszt.elek@pelda.hu',
      phone: '+36301234567',
    });
  });

  it('F-14: a back-to-back 412 keeps the FIRST failed intent', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.updateContact(VALID_CONTACT);

    let attempt = 0;
    server.use(
      http.patch('*/api/v1/checkout', () => {
        attempt += 1;
        // First two PATCHes (contact, delivery) answer 412; the third
        // (the retry) hands back to the default mock so the
        // back-to-back assertion runs against the same handler.
        if (attempt <= 2) {
          return HttpResponse.json(
            {
              type: 'urn:mi-bolt:problem:cart-version-conflict',
              title: 'Precondition failed',
              status: 412,
              code: 'CART_VERSION_CONFLICT',
              detail: 'The cart changed since the version supplied in If-Match',
              params: { expected: 9, received: '"x"' },
              traceId: 'mock-trace-test',
              fieldErrors: [],
            },
            { status: 412, headers: { 'content-type': 'application/problem+json' } },
          );
        }
        return undefined;
      }),
    );
    captures.length = 0;

    const contactResult = await checkout.updateContact({
      fullName: 'Más Név',
      email: 'mas@pelda.hu',
      phone: '+36307654321',
    });
    expect(contactResult.ok).toBe(false);
    expect(checkout.conflict()?.intent).toBe('contact');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30);
    });

    const deliveryResult = await checkout.updateDelivery({ optionId: 'pickup_point' });
    expect(deliveryResult.ok).toBe(false);
    expect(checkout.conflict()?.intent).toBe('contact');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30);
    });
    captures.length = 0;

    await checkout.retry();

    const patches = requestsTo('PATCH', '/checkout');
    expect(patches).toHaveLength(1);
    const parsed: unknown = JSON.parse(patches[0]?.body ?? '{}');
    if (!isRecord(parsed)) throw new Error('expected checkout body to be an object');
    expect(Object.keys(parsed)).toEqual(['contact']);
  });

  it('F-15: a 410 sets cartExpired and drops the session', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.ensureSession();
    expect(checkout.session()).not.toBeNull();

    server.use(
      http.patch('*/api/v1/checkout', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:cart-expired',
            title: 'Gone',
            status: 410,
            code: 'CART_EXPIRED',
            detail: 'The cart is no longer available',
            params: {},
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 410, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const result = await checkout.updateContact(VALID_CONTACT);
    expect(result.ok).toBe(false);
    expect(checkout.cartExpired()).toBe(true);
    expect(checkout.session()).toBeNull();
    expect(checkout.conflict()).toBeNull();
    // The checkout facade's CART_EXPIRED branch only wipes the
    // checkout session and arms the cartExpired flag — it does not
    // reach into the cart facade to drop its snapshot. The cart is
    // dropped by its OWN CART_EXPIRED response handler; the cart
    // facade here never saw a CART_EXPIRED, so its in-memory
    // snapshot from seedMoto stays. The empty-cart path is covered
    // by `cart.facade.spec.ts`'s T17-AC05 case.
  });

  it('F-16: a 422 VALIDATION_FAILED surfaces fieldErrors and changes nothing else', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    const sessionBefore = await checkout.ensureSession();

    const result = await checkout.updateContact({
      fullName: 'A',
      email: 'nope',
      phone: '123',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe('VALIDATION_FAILED');
    expect(result.error.fieldErrors).toEqual(
      expect.arrayContaining([
        { path: '/contact/fullName', code: 'FULL_NAME_LENGTH' },
        { path: '/contact/email', code: 'EMAIL_FORMAT' },
        { path: '/contact/phone', code: 'PHONE_FORMAT' },
      ]),
    );
    expect(result.error.fieldErrors).toHaveLength(3);

    // Session snapshot unchanged (the failed contact was rejected).
    expect(checkout.session()?.complete).toBe(false);
    expect(checkout.error()?.code).toBe('VALIDATION_FAILED');
    if (sessionBefore.ok) {
      expect(checkout.session()?.version).toBe(sessionBefore.value.version);
    }
  });
});

// ---------------------------------------------------------------------------
// F-17..F-22: payment intents
// ---------------------------------------------------------------------------

describe('payment intents', () => {
  beforeEach(() => {
    configureTestBed();
  });

  async function setupCompleteCardDraft(): Promise<CheckoutFacade> {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.ensureOptions();
    await seedCompleteDraft(checkout, 'card');
    return checkout;
  }

  it('F-17: createPaymentIntent() sends an Idempotency-Key and no body', async () => {
    const checkout = await setupCompleteCardDraft();
    captures.length = 0;

    const result = await checkout.createPaymentIntent();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.status).toBe('requires_action');
    expect(checkout.paymentIntent()?.status).toBe('requires_action');

    const create = findRequest('POST', '/payment-intents');
    expect(create).toBeDefined();
    const key = create?.headers['idempotency-key'] ?? '';
    expect(key).toMatch(KEY_PATTERN);
    expect(create?.body).toBe('');
  });

  it('F-18: creating an intent does not bump the version', async () => {
    const checkout = await setupCompleteCardDraft();
    const cart = TestBed.inject(CartFacade);
    const before = cart.cart()?.version;

    await checkout.createPaymentIntent();
    expect(cart.cart()?.version).toBe(before);
  });

  it('F-19: a retry after a transport failure repeats the intent key', async () => {
    const checkout = await setupCompleteCardDraft();
    captures.length = 0;

    server.use(http.post('*/api/v1/payment-intents', () => HttpResponse.error()));

    const first = await checkout.createPaymentIntent();
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.error.status).toBe(0);

    captures.length = 0;
    server.resetHandlers(...createHandlers(options));
    server.use(http.post('*/api/v1/payment-intents', () => HttpResponse.error()));

    await checkout.createPaymentIntent();
    const second = findRequest('POST', '/payment-intents');
    expect(second).toBeDefined();
    // The first call's transport failure left the stored key in
    // place (`isDefiniteOutcome(0)` is false, so `rotateIntentKey` is
    // not called). A second call with the same cart version is
    // expected to reuse that stored key — the actual idempotency-key
    // value, not a literal sentinel.
    const firstStoredKey = readStoredKey('mi-bolt.checkout.intent-key');
    expect(second?.headers['idempotency-key']).toBe(firstStoredKey);
  });

  it('F-20: a retry after a definite 422 mints a new intent key', async () => {
    const checkout = await setupCompleteCardDraft();
    captures.length = 0;

    server.use(
      http.post('*/api/v1/payment-intents', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:checkout-incomplete',
            title: 'Unprocessable content',
            status: 422,
            code: 'CHECKOUT_INCOMPLETE',
            detail: 'The checkout draft is incomplete',
            params: {},
            traceId: 'mock-trace-test',
            fieldErrors: [{ path: '/payment', code: 'PAYMENT_METHOD_NOT_CARD' }],
          },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const first = await checkout.createPaymentIntent();
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.error.status).toBe(422);

    // The 422 is a definite outcome, so `rotateIntentKey()` has
    // already wiped the slot; the captured request header is the
    // surviving record of the key the first attempt used.
    const firstStoredKey =
      findRequest('POST', '/payment-intents')?.headers['idempotency-key'] ?? '';

    captures.length = 0;
    server.resetHandlers(...createHandlers(options));
    server.use(
      http.post('*/api/v1/payment-intents', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:checkout-incomplete',
            title: 'Unprocessable content',
            status: 422,
            code: 'CHECKOUT_INCOMPLETE',
            detail: 'The checkout draft is incomplete',
            params: {},
            traceId: 'mock-trace-test',
            fieldErrors: [{ path: '/payment', code: 'PAYMENT_METHOD_NOT_CARD' }],
          },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    await checkout.createPaymentIntent();
    const second = findRequest('POST', '/payment-intents');
    expect(second).toBeDefined();
    expect(second?.headers['idempotency-key']).not.toBe(firstStoredKey);
    expect(second?.headers['idempotency-key']).toMatch(KEY_PATTERN);
  });

  it('F-21b: a successful create rotates the intent key, so the next create sends a new one', async () => {
    const checkout = await setupCompleteCardDraft();
    captures.length = 0;

    const first = await checkout.createPaymentIntent();
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await checkout.createPaymentIntent();
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    await flushCaptures();
    const creates = requestsTo('POST', '/payment-intents');
    expect(creates).toHaveLength(2);
    const firstKey = creates[0]?.headers['idempotency-key'] ?? '';
    const secondKey = creates[1]?.headers['idempotency-key'] ?? '';
    expect(firstKey).toMatch(KEY_PATTERN);
    expect(secondKey).toMatch(KEY_PATTERN);
    expect(secondKey).not.toBe(firstKey);
  });

  it('F-21: the active intent id survives a facade teardown', async () => {
    const checkout = await setupCompleteCardDraft();
    const first = await checkout.createPaymentIntent();
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // A successful create rotates the intent key, so the key slot is
    // empty by now; what the cold return leans on is the intent id,
    // which is the lookup the return leg actually makes.
    expect(sessionStorage.getItem('mi-bolt.checkout.intent-key')).toBeNull();
    const storedId = checkoutKeys.activeIntentId();
    expect(storedId).toBe(first.value.id);

    TestBed.resetTestingModule();
    configureTestBed();

    // The server-side cart is preserved by the demo session id, so
    // the new GET /cart returns the post-seedCompleteDraft state:
    // seedMoto bumped to v2 (one addItem) and the four patches
    // bumped it through to v6.
    const cart2 = await bootCart();
    expect(cart2.cart()?.version).toBe(6);

    expect(checkoutKeys.activeIntentId()).toBe(storedId);
  });

  it('F-22: readPaymentIntent() stores the intent and a 404 does not set error()', async () => {
    const checkout = await setupCompleteCardDraft();
    const created = await checkout.createPaymentIntent();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const id = created.value.id;
    const readOk = await checkout.readPaymentIntent(id);
    expect(readOk.ok).toBe(true);
    expect(checkout.paymentIntent()?.id).toBe(id);

    const readMissing = await checkout.readPaymentIntent('pi-missing');
    expect(readMissing.ok).toBe(false);
    if (readMissing.ok) return;
    expect(readMissing.error.status).toBe(404);
    expect(checkout.error()).toBeNull();
  });

  it('F-22b: a 404 for the held intent drops it, a 404 for another id keeps it', async () => {
    const checkout = await setupCompleteCardDraft();
    const created = await checkout.createPaymentIntent();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.value.id;
    const held = await checkout.readPaymentIntent(id);
    expect(held.ok).toBe(true);
    expect(checkout.paymentIntent()?.id).toBe(id);
    const storedBefore = checkoutKeys.activeIntentId();

    const other = await checkout.readPaymentIntent('pi-missing');
    expect(other.ok).toBe(false);
    if (other.ok) return;
    expect(other.error.status).toBe(404);
    expect(checkout.paymentIntent()?.id).toBe(id);
    expect(checkoutKeys.activeIntentId()).toBe(storedBefore);

    server.use(
      http.get(`*/api/v1/payment-intents/${id}`, () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:not-found',
            title: 'Not Found',
            status: 404,
            code: 'NOT_FOUND',
            detail: 'Payment intent not found',
            params: { paymentIntentId: id },
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 404 },
        ),
      ),
    );
    const drop = await checkout.readPaymentIntent(id);
    expect(drop.ok).toBe(false);
    if (drop.ok) return;
    expect(drop.error.status).toBe(404);
    expect(checkout.paymentIntent()).toBeNull();
    expect(checkout.error()).toBeNull();
    expect(checkoutKeys.activeIntentId()).toBe(storedBefore);
    expect(checkout.intentDropped()).toBeNull();
  });

  /** A paid card draft with the intent read back as succeeded. */
  async function setupPaidCardDraft(): Promise<{ checkout: CheckoutFacade; id: string }> {
    const checkout = await setupCompleteCardDraft();
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error('createPaymentIntent failed');
    await resolveSucceeded(created.value.id);
    await checkout.readPaymentIntent(created.value.id);
    expect(checkout.paymentIntent()?.status).toBe('succeeded');
    expect(checkoutKeys.activeIntentId()).toBe(created.value.id);
    return { checkout, id: created.value.id };
  }

  it('F-31: a payment write to cash on delivery drops the held intent and its stored id', async () => {
    const { checkout } = await setupPaidCardDraft();
    expect((await checkout.updatePayment({ method: 'cash_on_delivery' })).ok).toBe(true);
    expect(checkout.paymentIntent()).toBeNull();
    expect(checkoutKeys.activeIntentId()).toBeNull();
  });

  it('F-31b: re-saving the same delivery and card payment keeps the paid intent', async () => {
    const { checkout, id } = await setupPaidCardDraft();
    expect(
      (
        await checkout.updateDelivery({
          optionId: 'home_delivery',
          address: VALID_DELIVERY_ADDRESS,
        })
      ).ok,
    ).toBe(true);
    expect((await checkout.updatePayment({ method: 'card' })).ok).toBe(true);
    expect((await checkout.updateBilling(VALID_BILLING)).ok).toBe(true);
    expect(checkout.paymentIntent()?.id).toBe(id);
    expect(checkoutKeys.activeIntentId()).toBe(id);
  });

  it('F-31c: a session read whose total differs from the paid amount drops the intent', async () => {
    const { checkout } = await setupPaidCardDraft();
    const cart = TestBed.inject(CartFacade);
    await cart.addItem(HONOR, 1);
    await flushCaptures();
    expect((await checkout.ensureSession(true)).ok).toBe(true);
    expect(checkout.paymentIntent()).toBeNull();
    expect(checkoutKeys.activeIntentId()).toBeNull();
    expect(checkout.intentDropped()).toBe('stale');
  });

  it('F-31d: a card order refused with 409 PRICE_CHANGED drops the stale intent, so the review can ask for a new payment', async () => {
    const { checkout, id } = await setupPaidCardDraft();
    const cart = TestBed.inject(CartFacade);
    await cart.addItem(HONOR, 1);
    await flushCaptures();
    const placed = await checkout.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: id,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(placed.ok).toBe(false);
    if (placed.ok) return;
    expect(placed.error.code).toBe('PRICE_CHANGED');
    expect(checkout.paymentIntent()).toBeNull();
    expect(checkoutKeys.activeIntentId()).toBeNull();
  });

  it('F-31e: a 422 PAYMENT_REQUIRED for an intent the facade holds as succeeded drops it', async () => {
    const { checkout, id } = await setupPaidCardDraft();
    server.use(
      http.post('*/api/v1/orders', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:payment-required',
            title: 'Payment required',
            status: 422,
            code: 'PAYMENT_REQUIRED',
            detail:
              'The referenced payment intent already backs an order; a new card order needs a new payment',
            params: { paymentIntentId: id, status: 'succeeded' },
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const placed = await checkout.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: id,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(placed.ok).toBe(false);
    if (placed.ok) return;
    expect(placed.error.code).toBe('PAYMENT_REQUIRED');
    expect(checkout.paymentIntent()).toBeNull();
    expect(checkoutKeys.activeIntentId()).toBeNull();
    expect(checkout.intentDropped()).toBe('refused');
  });

  it('F-31f: a section write after the cart changed drops the intent the new total no longer matches', async () => {
    const { checkout } = await setupPaidCardDraft();
    const cart = TestBed.inject(CartFacade);
    await cart.addItem(HONOR, 1);
    await flushCaptures();
    expect(
      (
        await checkout.updateDelivery({
          optionId: 'home_delivery',
          address: VALID_DELIVERY_ADDRESS,
        })
      ).ok,
    ).toBe(true);
    expect(checkout.paymentIntent()).toBeNull();
    expect(checkoutKeys.activeIntentId()).toBeNull();
  });

  it('F-31g: the return leg does not adopt an intent the session it read first no longer matches', async () => {
    const { checkout, id } = await setupPaidCardDraft();
    const paidAmount = checkout.paymentIntent()?.amount.amount ?? 0;
    const cart = TestBed.inject(CartFacade);
    await cart.addItem(HONOR, 1);
    await flushCaptures();

    // The cold return starts a fresh app and hydrates the session before
    // it reads the intent (`payment-return-page.ts`), so the read is the
    // only place that can see the intent no longer matches the session.
    TestBed.resetTestingModule();
    configureTestBed();
    const returning = TestBed.inject(CheckoutFacade);
    await bootCart();
    const session = await returning.ensureSession(true);
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.value.summary.total.amount).not.toBe(paidAmount);

    const read = await returning.readPaymentIntent(id);
    expect(read.ok).toBe(true);
    expect(returning.paymentIntent()).toBeNull();
    expect(checkoutKeys.activeIntentId()).toBeNull();
  });

  it('F-31h: a session read that no longer pays by card drops the intent even when the total is unchanged', async () => {
    const { checkout } = await setupPaidCardDraft();
    const current = checkout.session();
    if (current === null) throw new Error('no session');
    server.use(
      http.get('*/api/v1/checkout', () =>
        HttpResponse.json(
          { ...current, payment: { method: 'cash_on_delivery' } },
          { headers: { ETag: `"${String(current.version)}"` } },
        ),
      ),
    );
    expect((await checkout.ensureSession(true)).ok).toBe(true);
    expect(checkout.session()?.summary.total.amount).toBe(current.summary.total.amount);
    expect(checkout.paymentIntent()).toBeNull();
    expect(checkoutKeys.activeIntentId()).toBeNull();
    expect(checkout.intentDropped()).toBe('stale');
  });

  it('F-31i: a new payment intent clears the drop reason', async () => {
    const { checkout } = await setupPaidCardDraft();
    expect((await checkout.updatePayment({ method: 'cash_on_delivery' })).ok).toBe(true);
    expect(checkout.intentDropped()).toBe('stale');
    expect((await checkout.updatePayment({ method: 'card' })).ok).toBe(true);
    const created = await checkout.createPaymentIntent();
    expect(created.ok).toBe(true);
    expect(checkout.intentDropped()).toBeNull();
  });

  it('F-31j: a placed order clears the drop reason', async () => {
    const { checkout } = await setupPaidCardDraft();
    expect((await checkout.updatePayment({ method: 'cash_on_delivery' })).ok).toBe(true);
    expect(checkout.intentDropped()).toBe('stale');
    const placed = await checkout.submitOrder({
      paymentMethod: 'cash_on_delivery',
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(placed.ok).toBe(true);
    expect(checkout.intentDropped()).toBeNull();
  });

  it('F-31k: reading back the intent after a drop clears the drop reason when it still matches', async () => {
    const { checkout, id } = await setupPaidCardDraft();
    expect((await checkout.updatePayment({ method: 'cash_on_delivery' })).ok).toBe(true);
    expect(checkout.intentDropped()).toBe('stale');
    expect((await checkout.updatePayment({ method: 'card' })).ok).toBe(true);
    const read = await checkout.readPaymentIntent(id);
    expect(read.ok).toBe(true);
    expect(checkout.paymentIntent()?.id).toBe(id);
    expect(checkout.intentDropped()).toBeNull();
  });

  it('F-31l: a 410 drops the held intent and its stored id with the session', async () => {
    const { checkout } = await setupPaidCardDraft();
    server.use(
      http.patch('*/api/v1/checkout', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:cart-expired',
            title: 'Gone',
            status: 410,
            code: 'CART_EXPIRED',
            detail: 'The cart is no longer available',
            params: {},
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 410, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const result = await checkout.updateContact(VALID_CONTACT);
    expect(result.ok).toBe(false);
    expect(checkout.cartExpired()).toBe(true);
    expect(checkout.session()).toBeNull();
    expect(checkout.paymentIntent()).toBeNull();
    expect(checkoutKeys.activeIntentId()).toBeNull();
    expect(checkout.intentDropped()).toBe('stale');
  });

  it('F-31m: a 422 PAYMENT_REQUIRED for an intent that still requires action keeps it', async () => {
    const checkout = await setupCompleteCardDraft();
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error('createPaymentIntent failed');
    const id = created.value.id;
    expect(checkout.paymentIntent()?.status).toBe('requires_action');

    const placed = await checkout.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: id,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(placed.ok).toBe(false);
    if (placed.ok) return;
    expect(placed.error.status).toBe(422);
    expect(placed.error.code).toBe('PAYMENT_REQUIRED');
    expect(checkout.paymentIntent()?.id).toBe(id);
    expect(checkout.paymentIntent()?.status).toBe('requires_action');
    expect(checkoutKeys.activeIntentId()).toBe(id);
    expect(checkout.intentDropped()).toBeNull();
  });

  it('F-31n: the mock refuses an intent that already backs an order, and the facade drops it as refused', async () => {
    const { checkout, id } = await setupPaidCardDraft();
    const first = await checkout.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: id,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(first.ok).toBe(true);

    // A fresh app on the same mock and demo session, as F-31g: the
    // shopper comes back holding the intent the placed order used.
    TestBed.resetTestingModule();
    configureTestBed();
    const returning = await setupCompleteCardDraft();
    const read = await returning.readPaymentIntent(id);
    expect(read.ok).toBe(true);
    expect(returning.paymentIntent()?.status).toBe('succeeded');

    const again = await returning.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: id,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.status).toBe(422);
    expect(again.error.code).toBe('PAYMENT_REQUIRED');
    expect(returning.paymentIntent()).toBeNull();
    expect(checkoutKeys.activeIntentId()).toBeNull();
    expect(returning.intentDropped()).toBe('refused');
  });

  it('F-32: a contact or billing write keeps the held intent', async () => {
    const checkout = await setupCompleteCardDraft();
    const created = await checkout.createPaymentIntent();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect((await checkout.updateContact(VALID_CONTACT)).ok).toBe(true);
    expect((await checkout.updateBilling(VALID_BILLING)).ok).toBe(true);

    expect(checkout.paymentIntent()?.id).toBe(created.value.id);
    expect(checkoutKeys.activeIntentId()).toBe(created.value.id);
  });
});

// ---------------------------------------------------------------------------
// F-23..F-28: orders
// ---------------------------------------------------------------------------

describe('orders', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('F-23: submitOrder() cash-on-delivery returns the receipt and resets after order', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.ensureOptions();
    await seedCompleteDraft(checkout, 'cash_on_delivery');
    captures.length = 0;

    const result = await checkout.submitOrder({
      paymentMethod: 'cash_on_delivery',
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.orderNumber).toBe('DEMO-000001');
    expect(result.value.subtotal).toEqual({ amount: 89_990, currency: 'HUF' });
    expect(result.value.shippingFee).toEqual({ amount: 0, currency: 'HUF' });
    expect(result.value.paymentFee).toEqual({ amount: 490, currency: 'HUF' });
    expect(result.value.total).toEqual({ amount: 90_480, currency: 'HUF' });

    expect(checkout.session()).toBeNull();
    expect(checkoutKeys.activeIntentId()).toBeNull();

    // Both stored keys were wiped by `clearAll`.
    expect(sessionStorage.getItem('mi-bolt.checkout.order-key')).toBeNull();
    expect(sessionStorage.getItem('mi-bolt.checkout.intent-key')).toBeNull();
    expect(sessionStorage.getItem('mi-bolt.checkout.intent-id')).toBeNull();
  });

  // F-24: same-key replay returns the cached receipt.
  it('F-24: submitOrder() replays on the same key', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.ensureOptions();
    await seedCompleteDraft(checkout, 'cash_on_delivery');
    captures.length = 0;

    const first = await checkout.submitOrder({
      paymentMethod: 'cash_on_delivery',
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.orderNumber).toBe('DEMO-000001');

    const posts = requestsTo('POST', '/orders');
    expect(posts[0]).toBeDefined();
    const post = posts[0];
    expect(post.headers['x-demo-session']).toMatch(/./);
    expect(post.headers['idempotency-key']).toMatch(KEY_PATTERN);

    // The mock's order-store replay branch runs before any completeness
    // check (`projects/shop-mocks/src/orders/order-store.ts:365-373`): on a second
    // POST /orders carrying the same X-Demo-Session, Idempotency-Key
    // and body, it returns the cached receipt. The raw fetch below
    // proves that contract from outside the facade.
    const replay = await fetch('http://localhost/api/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Demo-Session': post.headers['x-demo-session'] ?? '',
        'Idempotency-Key': post.headers['idempotency-key'] ?? '',
      },
      body: post.body,
    });
    expect(replay.status).toBe(201);

    const replayBody: unknown = await replay.json();
    if (!isRecord(replayBody)) throw new Error('expected replay body to be an object');
    const replayOrderNumber = readString(replayBody, 'orderNumber');
    expect(replayOrderNumber).toBe('DEMO-000001');
    expect(replayOrderNumber).toBe(first.value.orderNumber);
    expect(JSON.stringify(replayBody)).toBe(JSON.stringify(first.value));

    // One POST landed on the wire from the facade; the raw replay was
    // the second POST. The store accepted it as a replay, so a second
    // order number was never minted: GET /orders/DEMO-000002 must
    // answer 404 against the same demo session.
    expect(requestsTo('POST', '/orders')).toHaveLength(2);
    const lookup = await fetch('http://localhost/api/v1/orders/DEMO-000002', {
      headers: { 'X-Demo-Session': post.headers['x-demo-session'] ?? '' },
    });
    expect(lookup.status).toBe(404);
  });

  it('F-24b: submitOrder() mints a fresh key after resetAfterOrder() clears the slot', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.ensureOptions();
    await seedCompleteDraft(checkout, 'cash_on_delivery');
    captures.length = 0;

    const first = await checkout.submitOrder({
      paymentMethod: 'cash_on_delivery',
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // After a successful order, `resetAfterOrder()` wipes every
    // checkout-namespaced sessionStorage entry (`checkoutKeys.clearAll`)
    // so the next checkout starts clean. The second submitOrder against
    // an empty cart mints a FRESH key — the fingerprint inputs
    // (`version`, `paymentMethod`, `paymentIntentId`, `termsVersion`,
    // `acceptedTerms`) are the same as the first call, but the slot
    // was cleared, so keyed() returns a freshly-generated value rather
    // than the one that landed the first 201.
    const second = await checkout.submitOrder({
      paymentMethod: 'cash_on_delivery',
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    // The cart is empty after `resetForOrder`; the default mock
    // answers 422 CHECKOUT_INCOMPLETE — the assertion below is on the
    // captured Idempotency-Key, not on the result.
    expect(second.ok).toBe(false);
    const posts = requestsTo('POST', '/orders');
    expect(posts).toHaveLength(2);
    expect(posts[0]?.headers['idempotency-key']).not.toBe(posts[1]?.headers['idempotency-key']);
    expect(posts[0]?.headers['idempotency-key']).toMatch(KEY_PATTERN);
    expect(posts[1]?.headers['idempotency-key']).toMatch(KEY_PATTERN);
  });

  it('F-25: a 503 on submitOrder retains the key', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.ensureOptions();
    await seedCompleteDraft(checkout, 'cash_on_delivery');

    let attempt = 0;
    server.use(
      http.post('*/api/v1/orders', () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            {
              type: 'urn:mi-bolt:problem:service-unavailable',
              title: 'Service unavailable',
              status: 503,
              code: 'SERVICE_UNAVAILABLE',
              detail: 'downstream',
              params: {},
              traceId: 'mock-trace-test',
              fieldErrors: [],
            },
            { status: 503, headers: { 'content-type': 'application/problem+json' } },
          );
        }
        return new HttpResponse(null, { status: 502 });
      }),
    );

    captures.length = 0;

    const first = await checkout.submitOrder({
      paymentMethod: 'cash_on_delivery',
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.error.status).toBe(503);

    const second = await checkout.submitOrder({
      paymentMethod: 'cash_on_delivery',
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(second.ok).toBe(false);

    const posts = requestsTo('POST', '/orders');
    expect(posts).toHaveLength(2);
    expect(posts[0]?.headers['idempotency-key']).toBe(posts[1]?.headers['idempotency-key']);
  });

  it('F-26: a 409 PRICE_CHANGED refetches, arms priceChange and does not resubmit', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const intentId = await seedCardDraftWithResolvedIntent(checkout);
    await addHonorFromTheServer();

    server.use(
      http.post('*/api/v1/orders', () =>
        HttpResponse.json(PRICE_CHANGED_PROBLEM, {
          status: 409,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
    );

    captures.length = 0;
    const result = await checkout.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: intentId,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(result.ok).toBe(false);

    // Wait for the recordPriceChange refetch + ensureSession to land.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(requestsTo('POST', '/orders')).toHaveLength(1);
    expect(requestsTo('GET', '/checkout')).toHaveLength(1);
    const change = checkout.priceChange();
    expect(change).not.toBeNull();
    expect(change?.shownTotal).toEqual({ amount: 89_990, currency: 'HUF' });
    expect(change?.currentTotal).toEqual({ amount: 159_980, currency: 'HUF' });
    expect(change?.awaitingConfirmation).toBe(true);
    expect(checkout.summary()?.total).toEqual({ amount: 159_980, currency: 'HUF' });
  });

  it('BOLT-6: equal totals still require item acceptance and carry the displayed revision to payment', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const intentId = await seedCardDraftWithResolvedIntent(checkout);
    const shown = checkout.summary()?.total;
    server.use(
      http.post(`${BASE_URL}/orders`, () =>
        HttpResponse.json(PRICE_CHANGED_PROBLEM, {
          status: 409,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
      ),
    );
    await checkout.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: intentId,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    const change = checkout.priceChange();
    expect(change?.currentTotal).toEqual(shown);
    expect(change?.awaitingConfirmation).toBe(true);
    expect(change?.items?.length).toBeGreaterThan(0);
    expect(change?.revision).toBeTypeOf('string');
    checkout.confirmPriceChange();
    const created = await checkout.createPaymentIntent();
    expect(created.ok).toBe(true);
    const request = requestsTo('POST', '/payment-intents').at(-1);
    expect(JSON.parse(request?.body ?? '{}')).toEqual({ acceptedPriceRevision: change?.revision });
  });

  it('F-27: confirmPriceChange() clears the flag and the next submit uses a NEW key', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const intentId = await seedCardDraftWithResolvedIntent(checkout);
    await addHonorFromTheServer();

    let attempt = 0;
    server.use(
      http.post('*/api/v1/orders', () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(PRICE_CHANGED_PROBLEM, {
            status: 409,
            headers: { 'content-type': 'application/problem+json' },
          });
        }
        // After the one-shot is consumed, the second call falls through
        // to the default mock. The mock's order-store answers 422
        // CHECKOUT_INCOMPLETE here (cart is non-empty but the draft
        // already reset — we don't care; the assertion is on the key).
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:checkout-incomplete',
            title: 'Unprocessable content',
            status: 422,
            code: 'CHECKOUT_INCOMPLETE',
            detail: 'incomplete',
            params: {},
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    captures.length = 0;
    await checkout.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: intentId,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(checkout.priceChange()).not.toBeNull();

    checkout.confirmPriceChange();
    expect(checkout.priceChange()).toBeNull();

    captures.length = 0;
    await checkout.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: intentId,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });

    const posts = requestsTo('POST', '/orders');
    expect(posts).toHaveLength(1);
    const newKey = posts[0]?.headers['idempotency-key'] ?? '';
    expect(newKey).toMatch(KEY_PATTERN);
    expect(newKey).not.toBe('');
  });

  it('F-26b: a failed read after a 409 PRICE_CHANGED is retried once, and the retry arms priceChange', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const intentId = await seedCardDraftWithResolvedIntent(checkout);
    await addHonorFromTheServer();

    let checkoutReads = 0;
    server.use(
      http.post('*/api/v1/orders', () =>
        HttpResponse.json(PRICE_CHANGED_PROBLEM, {
          status: 409,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
      http.get('*/api/v1/checkout', () => {
        checkoutReads += 1;
        if (checkoutReads === 1) {
          return HttpResponse.json(SERVICE_UNAVAILABLE_PROBLEM, {
            status: 503,
            headers: { 'content-type': 'application/problem+json' },
          });
        }
        // The retried read must reach the default mock.
        return undefined;
      }),
    );

    captures.length = 0;
    const result = await checkout.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: intentId,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    await flushCaptures();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PRICE_CHANGED');
    expect(checkoutReads).toBe(2);
    expect(requestsTo('POST', '/orders')).toHaveLength(1);
    const change = checkout.priceChange();
    expect(change?.shownTotal).toEqual({ amount: 89_990, currency: 'HUF' });
    expect(change?.currentTotal).toEqual({ amount: 159_980, currency: 'HUF' });
    expect(change?.awaitingConfirmation).toBe(true);
  });

  it('F-26c: when the read after a 409 PRICE_CHANGED fails twice, the submit returns the read failure and arms no priceChange', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const intentId = await seedCardDraftWithResolvedIntent(checkout);
    await addHonorFromTheServer();

    let checkoutReads = 0;
    server.use(
      http.post('*/api/v1/orders', () =>
        HttpResponse.json(PRICE_CHANGED_PROBLEM, {
          status: 409,
          headers: { 'content-type': 'application/problem+json' },
        }),
      ),
      http.get('*/api/v1/checkout', () => {
        checkoutReads += 1;
        return HttpResponse.json(SERVICE_UNAVAILABLE_PROBLEM, {
          status: 503,
          headers: { 'content-type': 'application/problem+json' },
        });
      }),
    );

    captures.length = 0;
    const result = await checkout.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: intentId,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    await flushCaptures();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(result.error.status).toBe(503);
    expect(checkoutReads).toBe(2);
    expect(requestsTo('POST', '/orders')).toHaveLength(1);
    expect(checkout.priceChange()).toBeNull();
    expect(checkout.error()?.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('F-29: startNewPurchase() clears the receipt and the session so the guards see no order', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.ensureOptions();
    await seedCompleteDraft(checkout, 'cash_on_delivery');

    const placed = await checkout.submitOrder({
      paymentMethod: 'cash_on_delivery',
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    // submitOrder stores the receipt and then runs resetAfterOrder,
    // which drops the session but keeps the receipt for the success
    // page. The guards see a non-null order and redirect back to the
    // success URL — that is the loop the new shopping CTA must break.
    expect(checkout.order()).not.toBeNull();
    expect(checkout.order()?.id).toBe(placed.value.id);

    checkout.startNewPurchase();

    expect(checkout.order()).toBeNull();
    expect(checkout.session()).toBeNull();
    expect(checkout.paymentIntent()).toBeNull();
  });

  it('F-30: a card order consumes its payment intent: after the commit the facade holds none, so a new draft must mint a fresh one', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.ensureOptions();
    await seedCompleteDraft(checkout, 'card');

    const created = await checkout.createPaymentIntent();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await resolveSucceeded(created.value.id);

    const placed = await checkout.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: created.value.id,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    expect(checkout.order()).not.toBeNull();
    expect(checkout.paymentIntent()).toBeNull();
  });

  it('F-28: fetchOrder() hydrates by id through GET and never POSTs', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.ensureOptions();
    await seedCompleteDraft(checkout, 'card');

    const created = await checkout.createPaymentIntent();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await resolveSucceeded(created.value.id);

    const placed = await checkout.submitOrder({
      paymentMethod: 'card',
      paymentIntentId: created.value.id,
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const placedId = placed.value.id;

    captures.length = 0;
    const fetched = await checkout.fetchOrder(placedId);
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.value.id).toBe(placedId);
    expect(checkout.order()?.id).toBe(placedId);

    const gets = requestsTo('GET', `/orders/${placedId}`);
    const posts = requestsTo('POST', '/orders');
    expect(gets.length).toBeGreaterThanOrEqual(1);
    expect(posts).toHaveLength(0);

    const missing = await checkout.fetchOrder('missing');
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error.status).toBe(404);
    expect(checkout.order()?.id).toBe(placedId);
  });
  it('BOLT-6: refreshed prices retain the displayed total; a cold draft has no invented previous total', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedMoto();
    await checkout.ensureOptions();
    await seedCompleteDraft(checkout, 'card');
    const baseline = checkout.session();
    if (baseline === null) throw new Error('Expected loaded draft');
    const previous = baseline.summary.total;
    const current = { amount: previous.amount + 1000, currency: 'HUF' as const };
    server.use(
      http.get('*/api/v1/checkout', () =>
        HttpResponse.json({
          ...baseline,
          summary: { ...baseline.summary, total: current },
          priceAcceptanceRequired: true,
          priceRevision: 'changed-item-prices',
        }),
      ),
    );
    await checkout.ensureSession(true);
    expect(checkout.priceChange()?.shownTotal).toEqual(previous);
    expect(checkout.priceChange()?.currentTotal).toEqual(current);
    await checkout.ensureSession(true);
    expect(checkout.priceChange()?.shownTotal).toEqual(previous);
    checkout.startNewPurchase();
    await checkout.ensureSession(true);
    expect(checkout.priceChange()?.shownTotal).toBeNull();
    expect(checkout.priceChange()?.currentTotal).toEqual(current);
  });
});
