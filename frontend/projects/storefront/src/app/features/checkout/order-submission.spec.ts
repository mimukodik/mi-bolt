/**
 * MIM-212 — order submission spec on the 2.0.0 contract.
 *
 * Thirteen cases over the eight `SubmitOutcome` kinds, the in-flight
 * mutex, the no-session and incomplete guards, the four intent-status
 * branches, the price-change refusal and the safe-logger whitelist.
 * The harness mirrors the 2.0.0 mock spec (catalog fixture in
 * `beforeAll`, fixed clock, deterministic ids, per-test `options` and
 * `server.use(...)`).
 */

import '@angular/compiler';

// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server, useMswServer } from '../../../../../../tests/msw-server';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';
import { demoSessionInterceptor } from '@mi-bolt/core-api/demo-session.interceptor';

import { createHandlers } from '@mi-bolt/mocks/create-handlers';
import { isRecord } from '@mi-bolt/mocks/is-record';
import { Repository } from '@mi-bolt/mocks/repository';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
} from '@mi-bolt/mocks/scenarios';
import catalogFixture from '../../../../../../docs/api/fixtures/catalog.json';
import { isCatalogFixtureShape, loadCatalogFixture } from '@mi-bolt/mocks/catalog/catalog.handlers';

import '@mi-bolt/mocks/cart/cart.handlers';
import '@mi-bolt/mocks/checkout/checkout.handlers';
import '@mi-bolt/mocks/payment/payment.handlers';
import '@mi-bolt/mocks/orders/order.handlers';

import type { Address } from '@mi-bolt/api/models/address';
import type { BillingDetails } from '@mi-bolt/api/models/billing-details';
import type { Contact } from '@mi-bolt/api/models/contact';
import type { DeliverySelection } from '@mi-bolt/api/models/delivery-selection';
import type { PaymentSelection } from '@mi-bolt/api/models/payment-selection';

import { CartFacade } from '../../../app/features/cart/cart.facade';
import { CheckoutFacade } from '../../../app/features/checkout/checkout.facade';
import {
  OrderSubmission,
  SafeLogger,
  type SubmitOutcome,
} from '../../../app/features/checkout/order-submission';

useMswServer();

const BASE_URL = 'http://localhost/api/v1';
const MOTO = 'motorola-edge-50-fusion--zold--256';
const HONOR = 'honor-x7d--fekete--128';

const VALID_CONTACT: Contact = {
  fullName: 'Teszt Elek',
  email: 'Teszt.Elek@Pelda.hu',
  phone: '+36301234567',
};

const VALID_DELIVERY_ADDRESS: Address = {
  countryCode: 'HU',
  postalCode: '1052',
  city: 'Budapest',
  line1: 'Petőfi utca 1.',
};

const VALID_BILLING: BillingDetails = {
  name: 'Teszt Elek',
  address: VALID_DELIVERY_ADDRESS,
};

const HOME_DELIVERY: DeliverySelection = {
  optionId: 'home_delivery',
  address: VALID_DELIVERY_ADDRESS,
};

const CARD_PAYMENT: PaymentSelection = { method: 'card' };
const COD_PAYMENT: PaymentSelection = { method: 'cash_on_delivery' };

/** Captures the first `X-Demo-Session` the MSW stream sees so raw
 * `fetch` calls in helper resolvers can carry the same id. The
 * interceptor's module-level cache survives `sessionStorage.clear()`
 * between tests, so reading storage would land on an empty slot by
 * test two and the wrong id would 404 against the freshly seeded
 * store. The MSW request stream sees the same value the interceptor
 * actually emitted, which is the one the OrderStore locked in. */
let capturedDemoSession: string | null = null;

beforeAll(() => {
  if (!isCatalogFixtureShape(catalogFixture)) {
    throw new Error('[order-submission.spec] committed fixture does not match expected shape');
  }
  loadCatalogFixture(catalogFixture);
});

beforeEach((): void => {
  const clock = createFixedClock('2026-09-20T10:00:00.000Z');
  const ids = createDeterministicIds(1);
  const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
  const options = {
    repository,
    clock,
    ids,
    scenario: DEFAULT_SCENARIO,
    apiRoot: '/api/v1',
  };
  capturedDemoSession = null;
  server.use(...createHandlers(options));
  server.events.on('request:start', ({ request }) => {
    if (capturedDemoSession === null) {
      const session = request.headers.get('X-Demo-Session');
      if (session !== null) capturedDemoSession = session;
    }
  });
});

afterEach(() => {
  server.events.removeAllListeners('request:start');
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
  sessionStorage.clear();
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

/** Captured request line plus, for POSTs, the JSON body. The body
 *  is read off `request.clone().json()` so the underlying handler
 *  still receives the unconsumed body. */
interface CapturedRequest {
  readonly line: string;
  readonly body: unknown;
}

function captureRequests(log: CapturedRequest[]): void {
  server.events.on('request:start', async ({ request }) => {
    const url = new URL(request.url);
    const line = `${request.method} ${url.pathname}${url.search}`;
    if (request.method !== 'POST' && request.method !== 'PUT' && request.method !== 'PATCH') {
      log.push({ line, body: null });
      return;
    }
    let body: unknown = null;
    try {
      body = await request.clone().json();
    } catch {
      // Leave `body` at its null initial value; an unreadable body
      // becomes the literal `null` in the captured entry.
    }
    log.push({ line, body });
  });
}

/** Returns the JSON bodies of every POST that targeted `path` (substring
 *  match on the request line). */
function bodiesByPath(log: readonly CapturedRequest[], path: string): unknown[] {
  return log
    .filter((entry) => entry.line.startsWith('POST ') && entry.line.includes(path))
    .map((entry) => entry.body);
}

/** Counts POST requests that targeted `path`. */
function postsTo(log: readonly CapturedRequest[], path: string): number {
  return log.filter((entry) => entry.line.startsWith('POST ') && entry.line.includes(path)).length;
}

async function seedCompleteDraft(paymentMethod: PaymentSelection): Promise<void> {
  const cart = TestBed.inject(CartFacade);
  const checkout = TestBed.inject(CheckoutFacade);
  await cart.ensureCart();
  await cart.addItem(MOTO, 1);
  const contact = await checkout.updateContact(VALID_CONTACT);
  expect(contact.ok).toBe(true);
  const delivery = await checkout.updateDelivery(HOME_DELIVERY);
  expect(delivery.ok).toBe(true);
  const payment = await checkout.updatePayment(paymentMethod);
  expect(payment.ok).toBe(true);
  const billing = await checkout.updateBilling(VALID_BILLING);
  expect(billing.ok).toBe(true);
  const opts = await checkout.ensureOptions();
  expect(opts.ok).toBe(true);
}

async function seedCompleteCardDraft(): Promise<void> {
  await seedCompleteDraft(CARD_PAYMENT);
}

async function seedCompleteCodDraft(): Promise<void> {
  await seedCompleteDraft(COD_PAYMENT);
}

async function resolveIntentOutcome(
  intentId: string,
  outcome: 'succeeded' | 'declined',
): Promise<void> {
  const res = await fetch(`http://localhost/api/v1/payment-intents/${intentId}/outcome`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Demo-Session': capturedDemoSession ?? '',
    },
    body: JSON.stringify({ outcome }),
  });
  expect(res.status).toBe(200);
  // The mock store flipped the intent, but the facade's paymentIntentWritable
  // still holds the pre-resolution 'requires_action' snapshot. Refetching here
  // is what makes the next `submitOrder()` see the resolved status.
  const refetched = await TestBed.inject(CheckoutFacade).readPaymentIntent(intentId);
  expect(refetched.ok).toBe(true);
}

describe('OrderSubmission', () => {
  beforeEach(() => {
    configureTestBed();
  });

  // -------------------------------------------------------------------------
  // OS-01 — COD commit, no intent ever created
  // -------------------------------------------------------------------------

  it('OS-01: a cash on delivery draft commits without ever creating a payment intent', async () => {
    await seedCompleteCodDraft();
    const service = TestBed.inject(OrderSubmission);
    const log: CapturedRequest[] = [];
    captureRequests(log);

    const outcome = await service.submitOrder();

    expect(postsTo(log, '/payment-intents')).toBe(0);
    expect(postsTo(log, '/orders')).toBe(1);
    expect(outcome.kind).toBe('committed');
    if (outcome.kind !== 'committed') throw new Error('expected committed');
    expect(outcome.orderNumber).toBe('DEMO-000001');

    const bodies = bodiesByPath(log, '/orders');
    expect(bodies[0]).toEqual({
      paymentMethod: 'cash_on_delivery',
      acceptedTerms: true,
      termsVersion: '2026-09',
    });
  });

  // -------------------------------------------------------------------------
  // OS-02 — card commit, terms version from options
  // -------------------------------------------------------------------------

  it('OS-02: a card draft sends the stored intent id and the wire terms version', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    const intentId = created.value.id;
    await resolveIntentOutcome(intentId, 'succeeded');

    const service = TestBed.inject(OrderSubmission);
    const log: CapturedRequest[] = [];
    captureRequests(log);
    const outcome = await service.submitOrder();
    expect(outcome.kind).toBe('committed');
    if (outcome.kind !== 'committed') throw new Error('expected committed');

    const bodies = bodiesByPath(log, '/orders');
    expect(bodies[0]).toEqual({
      paymentMethod: 'card',
      paymentIntentId: intentId,
      acceptedTerms: true,
      termsVersion: '2026-09',
    });
    expect(checkout.paymentIntent()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // OS-03 — terms version is read from the options signal
  // -------------------------------------------------------------------------

  it('OS-03: the terms version comes from the options signal rather than a literal', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);

    // Override GET /checkout/options so the server's terms version is
    // the marker value '2026-10'; `force=true` in ensureOptions below
    // forces the facade to refetch and adopt the override.
    server.use(
      http.get('*/api/v1/checkout/options', () =>
        HttpResponse.json({
          termsVersion: '2026-10',
          deliveryOptions: [],
          paymentMethods: [],
        }),
      ),
    );
    const opts = await checkout.ensureOptions(true);
    expect(opts.ok).toBe(true);
    if (opts.ok) expect(opts.value.termsVersion).toBe('2026-10');

    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    const intentId = created.value.id;
    await resolveIntentOutcome(intentId, 'succeeded');

    const service = TestBed.inject(OrderSubmission);
    const log: CapturedRequest[] = [];
    captureRequests(log);
    await service.submitOrder();

    const bodies = bodiesByPath(log, '/orders');
    const body = bodies[0];
    if (!isRecord(body)) throw new Error('expected body object');
    expect(body['termsVersion']).toBe('2026-10');
  });

  // -------------------------------------------------------------------------
  // OS-04 — in-flight mutex: double call collapses to one order
  // -------------------------------------------------------------------------

  it('OS-04: two simultaneous submitOrder calls produce exactly one order', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    await resolveIntentOutcome(created.value.id, 'succeeded');

    const service = TestBed.inject(OrderSubmission);
    const log: CapturedRequest[] = [];
    captureRequests(log);

    const a = service.submitOrder();
    const b = service.submitOrder();
    const [outA, outB] = await Promise.all([a, b]);

    expect(postsTo(log, '/orders')).toBe(1);
    expect(outA.kind).toBe('committed');
    expect(outB.kind).toBe('committed');
    if (outA.kind === 'committed' && outB.kind === 'committed') {
      expect(outA.orderId).toBe(outB.orderId);
    }
  });

  // -------------------------------------------------------------------------
  // OS-05 — inFlight signal reflects the mutex
  // -------------------------------------------------------------------------

  it('OS-05: no new submit starts while one is in flight', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    await resolveIntentOutcome(created.value.id, 'succeeded');

    const service = TestBed.inject(OrderSubmission);
    const log: CapturedRequest[] = [];
    captureRequests(log);

    const promise = service.submitOrder();
    expect(service.inFlight()).toBe(true);
    await promise;
    expect(service.inFlight()).toBe(false);
    expect(postsTo(log, '/orders')).toBe(1);
  });

  // -------------------------------------------------------------------------
  // OS-06 — no session or options → unknown NO_SESSION, no wire
  // -------------------------------------------------------------------------

  it('OS-06: an unloaded session or options yields NO_SESSION and never reaches the wire', async () => {
    const service = TestBed.inject(OrderSubmission);
    const log: CapturedRequest[] = [];
    captureRequests(log);

    const outcome = await service.submitOrder();

    expect(outcome.kind).toBe('unknown');
    if (outcome.kind !== 'unknown') throw new Error('expected unknown');
    expect(outcome.code).toBe('NO_SESSION');
    expect(postsTo(log, '/orders')).toBe(0);
  });

  // -------------------------------------------------------------------------
  // OS-07 — incomplete draft routes to the first missing section
  // -------------------------------------------------------------------------

  it('OS-07: an incomplete draft never reaches the wire and routes to the first missing section', async () => {
    const cart = TestBed.inject(CartFacade);
    const checkout = TestBed.inject(CheckoutFacade);
    await cart.ensureCart();
    await cart.addItem(MOTO, 1);
    // The cart facade does not load the checkout session on its own;
    // a session refetch is what makes OrderSubmission's `session()` non-null.
    const loaded = await checkout.ensureSession();
    expect(loaded.ok).toBe(true);

    // Nothing saved: the first missing section is contact → adatok.
    const log: CapturedRequest[] = [];
    captureRequests(log);
    const service = TestBed.inject(OrderSubmission);
    const outcomeEmpty = await service.submitOrder();
    expect(outcomeEmpty.kind).toBe('incomplete');
    if (outcomeEmpty.kind !== 'incomplete') throw new Error('expected incomplete');
    expect(outcomeEmpty.route).toBe('/penztar/adatok?navigationReason=incomplete');
    expect(postsTo(log, '/orders')).toBe(0);

    // Contact saved only: the first missing section is billing →
    // szallitas.
    const contact = await checkout.updateContact(VALID_CONTACT);
    expect(contact.ok).toBe(true);
    const outcomePartial = await service.submitOrder();
    expect(outcomePartial.kind).toBe('incomplete');
    if (outcomePartial.kind !== 'incomplete') throw new Error('expected incomplete');
    expect(outcomePartial.route).toBe('/penztar/szallitas?navigationReason=incomplete');
    expect(postsTo(log, '/orders')).toBe(0);
  });

  // -------------------------------------------------------------------------
  // OS-13 — complete draft but options never loaded → unknown NO_OPTIONS
  // -------------------------------------------------------------------------

  it('OS-13: a complete draft with the options not yet loaded reports unknown NO_OPTIONS and issues no request', async () => {
    // Seed a complete COD draft the way `seedCompleteDraft` does, but
    // skip `checkout.ensureOptions()`. The draft cannot be completed
    // without options; with options() left at its initial null the
    // `runSubmit` step 2 guard at order-submission.ts:197-199 fires
    // and returns an `unknown` / `NO_OPTIONS` outcome without touching
    // the wire.
    const cart = TestBed.inject(CartFacade);
    const checkout = TestBed.inject(CheckoutFacade);
    await cart.ensureCart();
    await cart.addItem(MOTO, 1);
    const loaded = await checkout.ensureSession();
    expect(loaded.ok).toBe(true);
    const contact = await checkout.updateContact(VALID_CONTACT);
    expect(contact.ok).toBe(true);
    const delivery = await checkout.updateDelivery(HOME_DELIVERY);
    expect(delivery.ok).toBe(true);
    const payment = await checkout.updatePayment(COD_PAYMENT);
    expect(payment.ok).toBe(true);
    const billing = await checkout.updateBilling(VALID_BILLING);
    expect(billing.ok).toBe(true);
    // The draft is complete (session().complete === true) but
    // checkout.options() is still null — the facet that drives
    // the `NO_OPTIONS` branch.
    expect(checkout.options()).toBeNull();

    const log: CapturedRequest[] = [];
    captureRequests(log);
    const service = TestBed.inject(OrderSubmission);
    const outcome = await service.submitOrder();

    expect(outcome.kind).toBe('unknown');
    if (outcome.kind !== 'unknown') throw new Error('expected unknown');
    expect(outcome.code).toBe('NO_OPTIONS');
    expect(postsTo(log, '/orders')).toBe(0);
    expect(postsTo(log, '/payment-intents')).toBe(0);
  });

  // -------------------------------------------------------------------------
  // OS-08 — complete card draft with no intent → payment-required
  // -------------------------------------------------------------------------

  it('OS-08: a complete card draft with no intent yields payment-required with no redirect url', async () => {
    await seedCompleteCardDraft();
    const service = TestBed.inject(OrderSubmission);
    const log: CapturedRequest[] = [];
    captureRequests(log);

    const outcome = await service.submitOrder();

    expect(outcome.kind).toBe('payment-required');
    if (outcome.kind !== 'payment-required') throw new Error('expected payment-required');
    expect(outcome.intentId).toBeNull();
    expect(outcome.redirectUrl).toBeNull();
    expect(postsTo(log, '/orders')).toBe(0);
    expect(service.canChangeMethod()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // OS-09 — requires_action intent → payment-required with redirectUrl
  // -------------------------------------------------------------------------

  it('OS-09: a requires_action intent yields payment-required carrying the intent redirect url', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    const intentId = created.value.id;

    const service = TestBed.inject(OrderSubmission);
    const log: CapturedRequest[] = [];
    captureRequests(log);
    const outcome = await service.submitOrder();

    expect(outcome.kind).toBe('payment-required');
    if (outcome.kind !== 'payment-required') throw new Error('expected payment-required');
    expect(outcome.intentId).toBe(intentId);
    expect(outcome.redirectUrl).toBe(checkout.paymentIntent()?.redirectUrl);
    expect(postsTo(log, '/orders')).toBe(0);
  });

  // -------------------------------------------------------------------------
  // OS-10 — declined intent → declined + recovery controls armed
  // -------------------------------------------------------------------------

  it('OS-10: a declined intent yields declined and arms both recovery controls', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    const intentId = created.value.id;
    await resolveIntentOutcome(intentId, 'declined');

    const service = TestBed.inject(OrderSubmission);
    const log: CapturedRequest[] = [];
    captureRequests(log);
    const outcome = await service.submitOrder();

    expect(outcome.kind).toBe('declined');
    if (outcome.kind !== 'declined') throw new Error('expected declined');
    expect(outcome.intentId).toBe(intentId);
    expect(postsTo(log, '/orders')).toBe(0);
    expect(service.canRetry()).toBe(true);
    expect(service.canChangeMethod()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // OS-11 — 422 PAYMENT_PENDING through POST /orders maps to payment-pending
  // -------------------------------------------------------------------------

  it('OS-11: a 422 PAYMENT_PENDING from the order endpoint maps to payment-pending, not declined', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    await resolveIntentOutcome(created.value.id, 'succeeded');

    // The mock refuses to flip a succeeded intent back to pending; the
    // race we want to exercise is therefore driven at the order
    // endpoint: with the intent already succeeded on the facade side,
    // a 422 PAYMENT_PENDING from POST /orders proves mapFailure maps
    // the code, not the local intent status, onto the outcome kind.
    server.use(
      http.post('*/api/v1/orders', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:payment-pending',
            title: 'Payment pending',
            status: 422,
            code: 'PAYMENT_PENDING',
            detail: 'The referenced payment intent has not reached a terminal status yet.',
            traceId: 'spec-os-11',
            fieldErrors: [],
            params: { paymentIntentId: created.value.id },
          },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const service = TestBed.inject(OrderSubmission);
    const outcome: SubmitOutcome = await service.submitOrder();

    expect(outcome.kind).toBe('payment-pending');
    expect('declined' in outcome).toBe(false);
    if (outcome.kind === 'payment-pending') {
      expect(outcome.intentId).toBe(created.value.id);
    }
    expect(service.canRetry()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // OS-12 — price change → price-changed, exactly one POST /orders
  // -------------------------------------------------------------------------

  it('OS-12: a price change after the intent was created yields price-changed and issues exactly one order request', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = TestBed.inject(CartFacade);
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    await resolveIntentOutcome(created.value.id, 'succeeded');

    // Add HONOR so the subtotal becomes 89 990 + 69 990 = 159 980.
    await cart.addItem(HONOR, 1);

    const service = TestBed.inject(OrderSubmission);
    const log: CapturedRequest[] = [];
    captureRequests(log);
    const outcome = await service.submitOrder();

    expect(outcome.kind).toBe('price-changed');
    expect(postsTo(log, '/orders')).toBe(1);
    const priceChange = checkout.priceChange();
    expect(priceChange).not.toBeNull();
    expect(priceChange?.currentTotal.amount).toBe(159_980);
  });

  // -------------------------------------------------------------------------
  // OS-14 — SafeLogger.redact keeps the whitelist, drops the rest
  // -------------------------------------------------------------------------

  it('OS-14: redact keeps only the whitelist fields and drops everything else', () => {
    const money = { amount: 89_990, currency: 'HUF' as const };
    const redacted = SafeLogger.redact({
      paymentIntentId: 'pi-001',
      orderId: 'o-001',
      scenario: 'default',
      step: 'commit',
      attempt: 1,
      outcome: 'committed',
      amount: money,
    });

    expect(redacted['paymentIntentId']).toBe('pi-001');
    expect(redacted['orderId']).toBe('o-001');
    expect(redacted['scenario']).toBe('default');
    expect(redacted['step']).toBe('commit');
    expect(redacted['attempt']).toBe(1);
    expect(redacted['outcome']).toBe('committed');
    const amount = redacted['amount'];
    expect(amount).toEqual({ amount: 89_990, currency: 'HUF' });
    // The amount entry is a frozen {amount, currency} pair.
    expect(Object.isFrozen(amount)).toBe(true);

    const piiKeys = [
      'fullName',
      'email',
      'phone',
      'postalCode',
      'city',
      'line1',
      'line2',
      'cardNumber',
      'paymentMethod',
    ];
    for (const key of piiKeys) {
      const single = SafeLogger.redact({ [key]: 'sensitive' });
      expect(key in single).toBe(false);
    }
  });
});
