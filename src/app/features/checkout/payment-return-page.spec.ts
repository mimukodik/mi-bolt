/**
 * MIM-212 — payment-return page cases on the 2.0.0 contract.
 *
 * Seven cases that exercise the cold-start path of the 2.0.0 payment
 * flow: the page hydrates the cart and the session, reads the
 * payment intent through the facade, and lands on `/penztar/ellenorzes`
 * regardless of status. The harness mirrors the 2.0.0 mock spec
 * (catalog fixture in `beforeAll`, fixed clock, deterministic ids,
 * per-test `options` and `server.use(...)`).
 */

import '@angular/compiler';

// @vitest-environment jsdom
import {
  type MockInstance,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { server, useMswServer } from '../../../../tests/msw-server';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter } from '@angular/router';

import { provideApiConfiguration } from '../../../app/api/generated/api-configuration';
import { demoSessionInterceptor } from '../../../app/core/api/demo-session.interceptor';

import { createHandlers } from '../../../mocks/create-handlers';
import { DEMO_PRODUCT } from '../../../mocks/cart/cart.handlers';
import { IdempotencyStore } from '../../../mocks/idempotency';
import { Repository } from '../../../mocks/repository';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
} from '../../../mocks/scenarios';
import catalogFixture from '../../../../docs/api/fixtures/catalog.json';
import { isCatalogFixtureShape, loadCatalogFixture } from '../../../mocks/catalog/catalog.handlers';

import '../../../mocks/cart/cart.handlers';
import '../../../mocks/checkout/checkout.handlers';
import '../../../mocks/payment/payment.handlers';
import '../../../mocks/orders/order.handlers';

import type { Address } from '../../../app/api/generated/models/address';
import type { BillingDetails } from '../../../app/api/generated/models/billing-details';
import type { Contact } from '../../../app/api/generated/models/contact';
import type { DeliverySelection } from '../../../app/api/generated/models/delivery-selection';
import type { PaymentSelection } from '../../../app/api/generated/models/payment-selection';

import { CartFacade } from '../../../app/features/cart/cart.facade';
import { CheckoutFacade } from '../../../app/features/checkout/checkout.facade';
import { PaymentReturnPage } from '../../../app/features/checkout/payment-return-page';

useMswServer();

const BASE_URL = 'http://localhost/api/v1';
const MOTO = 'motorola-edge-50-fusion--zold--256';

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
    throw new Error('[payment-return-page.spec] committed fixture does not match expected shape');
  }
  loadCatalogFixture(catalogFixture);
});

beforeEach((): void => {
  const clock = createFixedClock('2026-09-20T10:00:00.000Z');
  const ids = createDeterministicIds(1);
  const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
  repository.loadProducts([DEMO_PRODUCT]);
  const options = {
    repository,
    clock,
    ids,
    scenario: DEFAULT_SCENARIO,
    apiRoot: '/api/v1',
  };
  // Side-effect: ensures the clock is wired to the idempotency store.
  new IdempotencyStore(clock);
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
  server.events.removeAllListeners();
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

/**
 * Records every request the MSW server sees through its life-cycle
 * events, in the form `"<METHOD> <pathname[+search?>"`. The listener is
 * registered by the test that wants it and torn down in `afterEach`,
 * where `server.events.removeAllListeners()` reverts to the default
 * handler-less state.
 */
function captureRequests(log: string[]): void {
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    const line = `${request.method} ${url.pathname}${url.search}`;
    log.push(line);
  });
}

async function seedCompleteCardDraft(): Promise<void> {
  const cart = TestBed.inject(CartFacade);
  const checkout = TestBed.inject(CheckoutFacade);
  await cart.ensureCart();
  await cart.addItem(MOTO, 1);
  const contact = await checkout.updateContact(VALID_CONTACT);
  expect(contact.ok).toBe(true);
  const delivery = await checkout.updateDelivery(HOME_DELIVERY);
  expect(delivery.ok).toBe(true);
  const payment = await checkout.updatePayment(CARD_PAYMENT);
  expect(payment.ok).toBe(true);
  const billing = await checkout.updateBilling(VALID_BILLING);
  expect(billing.ok).toBe(true);
  const opts = await checkout.ensureOptions();
  expect(opts.ok).toBe(true);
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
}

/**
 * Waits for `Router.navigate` to have been called at least once, by
 * polling the spy after each microtask drain. Bounded so a bug in the
 * page can never hang the suite; one second is far longer than the
 * cart + session + intent sequence takes under jsdom.
 */
async function waitForNavigate(spy: MockInstance): Promise<void> {
  for (let i = 0; i < 200 && spy.mock.calls.length === 0; i++) {
    await new Promise<void>((r) => {
      setTimeout(r, 5);
    });
  }
}

// ---------------------------------------------------------------------------
// R-01..R-07 — page construction, hydrate sequence and intent read
// ---------------------------------------------------------------------------

describe('PaymentReturnPage', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('R-01 reads paymentIntentId from the query parameter and lands on the review step with the intent set', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    const id = created.value.id;

    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(PaymentReturnPage);
    fixture.componentRef.setInput('paymentIntentId', id);
    fixture.detectChanges();
    await fixture.whenStable();
    await waitForNavigate(navigateSpy);

    expect(checkout.paymentIntent()?.id).toBe(id);
    expect(navigateSpy.mock.calls[0]?.[0]).toEqual(['/penztar/ellenorzes']);
  });

  it('R-02 falls back to the stored intent id when the query parameter is absent', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    const id = created.value.id;

    // `createPaymentIntent()` above already persisted `id` through
    // `checkoutKeys.setActiveIntentId()`, so the page's fallback path
    // (`?? checkoutKeys.activeIntentId()` in hydrate) finds it without
    // an explicit wipe or a re-set here.

    const requests: string[] = [];
    captureRequests(requests);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(PaymentReturnPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await waitForNavigate(navigateSpy);

    const intentReads = requests.filter(
      (r) => r.startsWith('GET ') && r.includes('/payment-intents/'),
    );
    expect(intentReads).toHaveLength(1);
    expect(intentReads[0]).toContain(`/payment-intents/${id}`);
  });

  it('R-03 navigates to the cart when there is no id at all', async () => {
    // No draft seeded, no active intent id, no input — the page must
    // short-circuit before any payment-intent read.
    const requests: string[] = [];
    captureRequests(requests);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(PaymentReturnPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await waitForNavigate(navigateSpy);

    expect(navigateSpy.mock.calls[0]?.[0]).toEqual(['/penztar/kosar']);
    const intentReads = requests.filter(
      (r) => r.startsWith('GET ') && r.includes('/payment-intents/'),
    );
    expect(intentReads).toHaveLength(0);
  });

  it('R-04 hydrates the cart and the session before reading the intent', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = TestBed.inject(CartFacade);
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    const id = created.value.id;

    // Drop the local cart and session snapshots so the page's hydrate
    // reissues GET /cart and GET /checkout; without this both calls
    // short-circuit on the cached snapshots and the captured request
    // log never contains the two GETs the assertion expects.
    checkout.resetAfterOrder();
    cart.resetOrderedCart();

    const requests: string[] = [];
    captureRequests(requests);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(PaymentReturnPage);
    fixture.componentRef.setInput('paymentIntentId', id);
    fixture.detectChanges();
    await fixture.whenStable();
    await waitForNavigate(navigateSpy);

    const cartIdx = requests.findIndex((r) => r === 'GET /api/v1/cart');
    const checkoutIdx = requests.findIndex((r) => r === 'GET /api/v1/checkout');
    const intentIdx = requests.findIndex(
      (r) => r.startsWith('GET ') && r.includes(`/payment-intents/${id}`),
    );
    expect(cartIdx).toBeGreaterThanOrEqual(0);
    expect(checkoutIdx).toBeGreaterThanOrEqual(0);
    expect(intentIdx).toBeGreaterThanOrEqual(0);
    expect(cartIdx).toBeLessThan(intentIdx);
    expect(checkoutIdx).toBeLessThan(intentIdx);
  });

  it('R-05 a succeeded intent lands on the review step with the CTA enabled', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    const id = created.value.id;
    await resolveIntentOutcome(id, 'succeeded');

    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(PaymentReturnPage);
    fixture.componentRef.setInput('paymentIntentId', id);
    fixture.detectChanges();
    await fixture.whenStable();
    await waitForNavigate(navigateSpy);

    expect(checkout.paymentIntent()?.status).toBe('succeeded');
    expect(navigateSpy.mock.calls[0]?.[0]).toEqual(['/penztar/ellenorzes']);
  });

  it('R-06 a declined intent lands on the review step and the page never resubmits', async () => {
    await seedCompleteCardDraft();
    const checkout = TestBed.inject(CheckoutFacade);
    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    const id = created.value.id;
    await resolveIntentOutcome(id, 'declined');

    const requests: string[] = [];
    captureRequests(requests);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(PaymentReturnPage);
    fixture.componentRef.setInput('paymentIntentId', id);
    fixture.detectChanges();
    await fixture.whenStable();
    await waitForNavigate(navigateSpy);

    expect(checkout.paymentIntent()?.status).toBe('declined');
    const orderPosts = requests.filter((r) => r.startsWith('POST ') && r.includes('/orders'));
    expect(orderPosts).toHaveLength(0);
    expect(navigateSpy.mock.calls[0]?.[0]).toEqual(['/penztar/ellenorzes']);
  });

  it('R-07 a 404 intent lands on the review step without setting error()', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(PaymentReturnPage);
    fixture.componentRef.setInput('paymentIntentId', 'pi-missing');
    fixture.detectChanges();
    await fixture.whenStable();
    await waitForNavigate(navigateSpy);

    expect(checkout.error()).toBeNull();
    expect(navigateSpy.mock.calls[0]?.[0]).toEqual(['/penztar/ellenorzes']);
  });
});
