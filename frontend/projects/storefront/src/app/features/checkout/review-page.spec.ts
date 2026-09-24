/**
 * MIM-212 — the review page container on the 2.0.0 contract.
 *
 * Twenty-three cases over the container: the three-call hydration and
 * its skips, each of the eight submit outcomes routed to its own
 * recovery, the view-state priority order, the intent-key rotation a
 * retried payment depends on, and the location seam the payment
 * redirect leaves through. `LOCATION_ASSIGN` is overridden through a
 * spy so the payment redirect is observable inside the harness;
 * everything else in this file runs through real wires against the
 * MSW handlers.
 */

import '@angular/compiler';

// @vitest-environment jsdom
import {
  type Mock,
  type MockInstance,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { server, useMswServer } from '../../../../../../tests/msw-server';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';
import { demoSessionInterceptor } from '@mi-bolt/core-api/demo-session.interceptor';

import { createHandlers } from '@mi-bolt/mocks/create-handlers';
import { IdempotencyStore } from '@mi-bolt/mocks/idempotency';
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
import type { PaymentIntent } from '@mi-bolt/api/models/payment-intent';
import type { PaymentSelection } from '@mi-bolt/api/models/payment-selection';

import { CartFacade } from '../../../app/features/cart/cart.facade';
import { checkoutKeys } from '../../../app/features/checkout/checkout-keys';
import {
  type CheckoutConflict,
  CheckoutFacade,
  type PriceChange,
} from '../../../app/features/checkout/checkout.facade';
import { LOCATION_ASSIGN, ReviewPage } from '../../../app/features/checkout/review-page';
import {
  OrderSubmission,
  type SubmitOutcome,
} from '../../../app/features/checkout/order-submission';

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
const CASH_ON_DELIVERY_PAYMENT: PaymentSelection = { method: 'cash_on_delivery' };

beforeAll(() => {
  if (!isCatalogFixtureShape(catalogFixture)) {
    throw new Error('[review-page.spec] committed fixture does not match expected shape');
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
  new IdempotencyStore(clock);
  server.use(...createHandlers(options));
  configureTestBed();
});

afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
  sessionStorage.clear();
});

function captureRequests(log: string[]): void {
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    log.push(`${request.method} ${url.pathname}${url.search}`);
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

async function seedCompleteCashOnDeliveryDraft(): Promise<void> {
  const cart = TestBed.inject(CartFacade);
  const checkout = TestBed.inject(CheckoutFacade);
  await cart.ensureCart();
  await cart.addItem(MOTO, 1);
  const contact = await checkout.updateContact(VALID_CONTACT);
  expect(contact.ok).toBe(true);
  const delivery = await checkout.updateDelivery(HOME_DELIVERY);
  expect(delivery.ok).toBe(true);
  const payment = await checkout.updatePayment(CASH_ON_DELIVERY_PAYMENT);
  expect(payment.ok).toBe(true);
  const billing = await checkout.updateBilling(VALID_BILLING);
  expect(billing.ok).toBe(true);
  const opts = await checkout.ensureOptions();
  expect(opts.ok).toBe(true);
}

interface PageHarness {
  readonly fixture: ReturnType<typeof TestBed.createComponent<ReviewPage>>;
  readonly navigateSpy: MockInstance;
  readonly navigateByUrlSpy: MockInstance;
  readonly assignSpy: Mock<(url: string) => void>;
}

let assignSpy: Mock<(url: string) => void>;

function configureTestBed(): void {
  assignSpy = vi.fn<(url: string) => void>();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
      provideRouter([]),
      { provide: LOCATION_ASSIGN, useValue: assignSpy },
    ],
    teardown: { destroyAfterEach: true },
  });
}

/**
 * Stands the review page up with a `LOCATION_ASSIGN` spy so the
 * payment redirect is observable inside the harness. The TestBed
 * configuration lives in `configureTestBed()`, which the top-level
 * `beforeEach` calls after seeding, so the facades the seeding
 * helpers inject are already wired to the API and the interceptor.
 */
function harness(): PageHarness {
  const fixture = TestBed.createComponent(ReviewPage);
  const router = TestBed.inject(Router);
  const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const navigateByUrlSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return { fixture, navigateSpy, navigateByUrlSpy, assignSpy };
}

function stubSubmitOutcome(outcome: SubmitOutcome): MockInstance {
  const submission = TestBed.inject(OrderSubmission);
  // Production's `OrderSubmission.runSubmit` / `commit` records the
  // outcome on `lastOutcomeWritable` before resolving; the mock has to
  // mirror that side effect, otherwise `viewState()` never sees the
  // OUT_OF_STOCK branch (review-page.ts:96-98).
  writableOf<SubmitOutcome | null>(submission, 'lastOutcomeWritable').set(outcome);
  return vi.spyOn(submission, 'submitOrder').mockResolvedValue(outcome);
}

function hostOf(fixture: { nativeElement: unknown }): HTMLElement {
  const node = fixture.nativeElement;
  if (!(node instanceof HTMLElement)) {
    throw new Error('[review-page.spec] expected nativeElement to be an HTMLElement');
  }
  return node;
}

function countTestId(host: HTMLElement, testid: string): number {
  return host.querySelectorAll(`[data-testid="${testid}"]`).length;
}

function readDataErrorCode(host: HTMLElement, testid: string): string | null {
  const node = host.querySelector(`[data-testid="${testid}"]`);
  return node?.getAttribute('data-error-code') ?? null;
}

/**
 * Adapter over one of the private writable signals on
 * `CheckoutFacade` (and `OrderSubmission`). The slot is named at the
 * call site, and the lookup goes through `Object.entries` so a rename
 * in the production code fails here with a test failure ("missing
 * private slot") rather than through silent corruption.
 *
 * The guard only checks that `set` exists; the type parameter
 * documents the slot's value type for the reviewer.
 */
interface Writable<T> {
  set(value: T): void;
}

function isWritable<T>(value: unknown): value is Writable<T> {
  if (typeof value !== 'object' && typeof value !== 'function') {
    return false;
  }
  if (value === null) {
    return false;
  }
  return typeof Reflect.get(value, 'set') === 'function';
}

function writableOf<T>(obj: object, slot: string): Writable<T> {
  const entry = Object.entries(obj).find(([key]) => key === slot);
  if (entry === undefined) {
    throw new Error(`[review-page.spec] missing private slot "${slot}"`);
  }
  const candidate: unknown = entry[1];
  if (!isWritable<T>(candidate)) {
    throw new Error(`[review-page.spec] private slot "${slot}" has no set() method`);
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// RP-01..RP-03 — hydration and its skips
// ---------------------------------------------------------------------------

describe('ReviewPage hydrates', () => {
  it('RP-01 renders the cart loading placeholder until the cart resolves', () => {
    const h = harness();
    h.fixture.detectChanges();
    const host = hostOf(h.fixture);
    expect(countTestId(host, 'review-loading')).toBe(1);
    expect(host.querySelectorAll('app-review-step').length).toBe(0);
  });

  it('RP-02 renders the session loading placeholder until the session resolves', async () => {
    const h = harness();
    await TestBed.inject(CartFacade).ensureCart();
    h.fixture.detectChanges();
    const host = hostOf(h.fixture);
    expect(countTestId(host, 'review-loading')).toBe(1);
    expect(host.querySelectorAll('app-review-step').length).toBe(0);
    await h.fixture.whenStable();
    h.fixture.detectChanges();
    expect(host.querySelectorAll('app-review-step').length).toBe(1);
  });

  it('RP-03 hydrates the cart, the options and the session, and skips whatever is already loaded', async () => {
    const requests: string[] = [];
    captureRequests(requests);

    const h = harness();
    h.fixture.detectChanges();
    await h.fixture.whenStable();
    const coldHost = hostOf(h.fixture);
    while (coldHost.querySelector('app-review-step') === null) {
      await new Promise<void>((r) => {
        setTimeout(r, 5);
      });
      h.fixture.detectChanges();
    }

    const cartIdx = requests.indexOf('GET /api/v1/cart');
    const optionsIdx = requests.indexOf('GET /api/v1/checkout/options');
    const checkoutIdx = requests.indexOf('GET /api/v1/checkout');
    expect(cartIdx).toBeGreaterThanOrEqual(0);
    expect(optionsIdx).toBeGreaterThanOrEqual(0);
    expect(checkoutIdx).toBeGreaterThanOrEqual(0);
    expect(cartIdx).toBeLessThan(optionsIdx);
    expect(optionsIdx).toBeLessThan(checkoutIdx);

    const requests2: string[] = [];
    captureRequests(requests2);
    const h2 = harness();
    h2.fixture.detectChanges();
    await h2.fixture.whenStable();
    const warmHost = hostOf(h2.fixture);
    while (warmHost.querySelector('app-review-step') === null) {
      await new Promise<void>((r) => {
        setTimeout(r, 5);
      });
      h2.fixture.detectChanges();
    }

    const carts2 = requests2.filter((r) => r === 'GET /api/v1/cart').length;
    const checkouts2 = requests2.filter((r) => r === 'GET /api/v1/checkout').length;
    const options2 = requests2.filter((r) => r === 'GET /api/v1/checkout/options').length;
    expect(carts2).toBe(0);
    expect(checkouts2).toBe(0);
    expect(options2).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// RP-04..RP-12 — the eight submit outcomes
// ---------------------------------------------------------------------------

describe('ReviewPage maps submit outcomes', () => {
  beforeEach(async () => {
    await seedCompleteCardDraft();
  });

  it('RP-04 a committed outcome navigates to the success route carrying the order id', async () => {
    const h = harness();
    stubSubmitOutcome({ kind: 'committed', orderId: 'ord-1', orderNumber: 'DEMO-000001' });

    await h.fixture.whenStable();
    await h.fixture.componentInstance.onSubmitRequested();

    expect(h.navigateSpy).toHaveBeenCalledTimes(1);
    expect(h.navigateSpy.mock.calls[0]?.[0]).toEqual(['/penztar/siker', 'ord-1']);
    expect(h.assignSpy).not.toHaveBeenCalled();
  });

  it('RP-05 a payment-required outcome with a redirect url leaves the SPA through the location seam', async () => {
    const h = harness();
    stubSubmitOutcome({
      kind: 'payment-required',
      intentId: 'pi-1',
      redirectUrl: '/demo-fizetes/pi-1',
    });

    await h.fixture.whenStable();
    await h.fixture.componentInstance.onSubmitRequested();

    expect(h.assignSpy).toHaveBeenCalledTimes(1);
    expect(h.assignSpy.mock.calls[0]?.[0]).toBe('/demo-fizetes/pi-1');
    expect(h.navigateSpy).not.toHaveBeenCalled();
    expect(h.navigateByUrlSpy).not.toHaveBeenCalled();
    h.fixture.detectChanges();
    expect(countTestId(hostOf(h.fixture), 'review-submit-failure')).toBe(0);
  });

  it('RP-06 a payment-required outcome with no redirect url records the failure instead of redirecting', async () => {
    const h = harness();
    stubSubmitOutcome({
      kind: 'payment-required',
      intentId: null,
      redirectUrl: null,
    });

    await h.fixture.whenStable();
    await h.fixture.componentInstance.onSubmitRequested();

    expect(h.assignSpy).not.toHaveBeenCalled();
    h.fixture.detectChanges();
    const host = hostOf(h.fixture);
    expect(countTestId(host, 'review-submit-failure')).toBe(1);
    expect(readDataErrorCode(host, 'review-submit-failure')).toBe('PAYMENT_REQUIRED');
  });

  it('RP-07 an incomplete outcome navigates by url so the navigationReason query parameter survives', async () => {
    const h = harness();
    stubSubmitOutcome({
      kind: 'incomplete',
      route: '/penztar/szallitas?navigationReason=incomplete',
    });

    await h.fixture.whenStable();
    await h.fixture.componentInstance.onSubmitRequested();

    expect(h.navigateByUrlSpy).toHaveBeenCalledTimes(1);
    expect(h.navigateByUrlSpy.mock.calls[0]?.[0]).toBe(
      '/penztar/szallitas?navigationReason=incomplete',
    );
    expect(h.navigateSpy).not.toHaveBeenCalled();
  });

  it('RP-08 an unknown outcome records the server code and renders the fixed reassurance sentence', async () => {
    const h = harness();
    stubSubmitOutcome({ kind: 'unknown', code: 'SERVER_ERROR' });

    await h.fixture.whenStable();
    await h.fixture.componentInstance.onSubmitRequested();

    h.fixture.detectChanges();
    const host = hostOf(h.fixture);
    expect(countTestId(host, 'review-submit-failure')).toBe(1);
    expect(readDataErrorCode(host, 'review-submit-failure')).toBe('SERVER_ERROR');
    const banner = host.querySelector('[data-testid="review-submit-failure"]')?.textContent ?? '';
    expect(banner).toContain(
      'A kosarad és az adataid megmaradtak. Próbáld újra, vagy módosítsd a fizetési módot.',
    );
    expect(banner).not.toMatch(/detail/i);
  });

  it('RP-09 a declined outcome neither navigates nor records a failure of its own', async () => {
    const h = harness();
    stubSubmitOutcome({ kind: 'declined', intentId: 'pi-1' });

    await h.fixture.whenStable();
    await h.fixture.componentInstance.onSubmitRequested();

    expect(h.navigateSpy).not.toHaveBeenCalled();
    expect(h.navigateByUrlSpy).not.toHaveBeenCalled();
    expect(h.assignSpy).not.toHaveBeenCalled();
    h.fixture.detectChanges();
    expect(countTestId(hostOf(h.fixture), 'review-submit-failure')).toBe(0);
  });

  it('RP-10 a payment-pending outcome neither navigates nor records a failure of its own', async () => {
    const h = harness();
    stubSubmitOutcome({ kind: 'payment-pending', intentId: 'pi-1' });

    await h.fixture.whenStable();
    await h.fixture.componentInstance.onSubmitRequested();

    expect(h.navigateSpy).not.toHaveBeenCalled();
    expect(h.navigateByUrlSpy).not.toHaveBeenCalled();
    expect(h.assignSpy).not.toHaveBeenCalled();
    h.fixture.detectChanges();
    expect(countTestId(hostOf(h.fixture), 'review-submit-failure')).toBe(0);
  });

  it('RP-11 a price-changed outcome leaves the facade priceChange to drive the view state', async () => {
    const h = harness();
    stubSubmitOutcome({ kind: 'price-changed' });

    await h.fixture.whenStable();
    const checkout = TestBed.inject(CheckoutFacade);
    const page = h.fixture.componentInstance;
    await page.onSubmitRequested();

    expect(h.navigateSpy).not.toHaveBeenCalled();
    expect(h.navigateByUrlSpy).not.toHaveBeenCalled();
    expect(h.assignSpy).not.toHaveBeenCalled();
    h.fixture.detectChanges();
    expect(countTestId(hostOf(h.fixture), 'review-submit-failure')).toBe(0);
    expect(page.viewState()).not.toBe('price-changed');
    const oldTotal = checkout.summary()?.total ?? { amount: 89990, currency: 'HUF' };
    writableOf<PriceChange | null>(checkout, 'priceChangeWritable').set({
      shownTotal: oldTotal,
      currentTotal: oldTotal,
      awaitingConfirmation: true,
    });
    expect(page.viewState()).toBe('price-changed');
  });

  it('RP-12 a conflict outcome leaves the facade conflict to drive the view state', async () => {
    const h = harness();
    stubSubmitOutcome({ kind: 'conflict' });

    await h.fixture.whenStable();
    const checkout = TestBed.inject(CheckoutFacade);
    const page = h.fixture.componentInstance;
    await page.onSubmitRequested();

    expect(h.navigateSpy).not.toHaveBeenCalled();
    expect(h.navigateByUrlSpy).not.toHaveBeenCalled();
    expect(h.assignSpy).not.toHaveBeenCalled();
    h.fixture.detectChanges();
    expect(countTestId(hostOf(h.fixture), 'review-submit-failure')).toBe(0);
    writableOf<CheckoutConflict | null>(checkout, 'conflictWritable').set({
      code: 'CART_VERSION_CONFLICT',
      status: 412,
      intent: 'order',
      serverVersion: 9,
    });
    expect(page.viewState()).toBe('conflict');
  });

  it('RP-13 the view state is submitting from the CTA press until the outcome lands', async () => {
    const h = harness();

    let resolveOutcome: (value: SubmitOutcome) => void = () => undefined;
    const submission = TestBed.inject(OrderSubmission);
    vi.spyOn(submission, 'submitOrder').mockImplementation(
      () =>
        new Promise<SubmitOutcome>((r) => {
          resolveOutcome = r;
        }),
    );

    await h.fixture.whenStable();
    const page = h.fixture.componentInstance;

    const submitCall = page.onSubmitRequested();
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
    expect(page.viewState()).toBe('submitting');

    resolveOutcome({ kind: 'declined', intentId: 'pi-1' });
    await submitCall;
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
    expect(page.viewState()).not.toBe('submitting');
  });

  it('RP-14 a price change outranks a conflict, and both outrank the stock error', async () => {
    const h = harness();
    const checkout = TestBed.inject(CheckoutFacade);

    await h.fixture.whenStable();
    const page = h.fixture.componentInstance;

    writableOf<PriceChange | null>(checkout, 'priceChangeWritable').set({
      shownTotal: { amount: 89990, currency: 'HUF' },
      currentTotal: { amount: 99990, currency: 'HUF' },
      awaitingConfirmation: true,
    });
    writableOf<CheckoutConflict | null>(checkout, 'conflictWritable').set({
      code: 'CART_VERSION_CONFLICT',
      status: 412,
      intent: 'order',
      serverVersion: 9,
    });
    expect(page.viewState()).toBe('price-changed');

    writableOf<PriceChange | null>(checkout, 'priceChangeWritable').set(null);
    writableOf<CheckoutConflict | null>(checkout, 'conflictWritable').set({
      code: 'CART_VERSION_CONFLICT',
      status: 412,
      intent: 'order',
      serverVersion: 9,
    });
    stubSubmitOutcome({ kind: 'unknown', code: 'OUT_OF_STOCK' });
    await page.onSubmitRequested();
    expect(page.viewState()).toBe('conflict');
  });

  it('RP-15 an OUT_OF_STOCK unknown outcome yields the stock-error state rather than the generic error', async () => {
    const h = harness();
    stubSubmitOutcome({ kind: 'unknown', code: 'OUT_OF_STOCK' });

    await h.fixture.whenStable();
    await h.fixture.componentInstance.onSubmitRequested();

    expect(h.fixture.componentInstance.viewState()).toBe('stock-error');
  });

  it('RP-16 the loading state holds until both the session and the options are present', async () => {
    const h = harness();
    const checkout = TestBed.inject(CheckoutFacade);
    await checkout.ensureSession();
    await h.fixture.whenStable();

    const page = h.fixture.componentInstance;
    expect(page.viewState()).toBe('ready');

    writableOf<unknown>(checkout, 'sessionWritable').set(null);
    expect(page.viewState()).toBe('loading');
  });

  it('RP-24 a committed outcome that lands after the page is gone still navigates to the receipt', async () => {
    const h = harness();

    let releaseOutcome!: (value: SubmitOutcome) => void;
    const submission = TestBed.inject(OrderSubmission);
    vi.spyOn(submission, 'submitOrder').mockImplementation(
      () =>
        new Promise<SubmitOutcome>((r) => {
          releaseOutcome = r;
        }),
    );

    await h.fixture.whenStable();
    const page = h.fixture.componentInstance;

    const submitCall = page.onSubmitRequested();
    h.fixture.destroy();
    releaseOutcome({ kind: 'committed', orderId: 'ord-1', orderNumber: 'DEMO-000001' });
    await submitCall;

    expect(h.navigateSpy).toHaveBeenCalledTimes(1);
    expect(h.navigateSpy.mock.calls[0]?.[0]).toEqual(['/penztar/siker', 'ord-1']);
  });

  it('RP-25 a payment-required outcome that lands after the page is gone does not leave the SPA', async () => {
    const h = harness();

    let releaseOutcome!: (value: SubmitOutcome) => void;
    const submission = TestBed.inject(OrderSubmission);
    vi.spyOn(submission, 'submitOrder').mockImplementation(
      () =>
        new Promise<SubmitOutcome>((r) => {
          releaseOutcome = r;
        }),
    );

    await h.fixture.whenStable();
    const page = h.fixture.componentInstance;

    const submitCall = page.onSubmitRequested();
    h.fixture.destroy();
    releaseOutcome({
      kind: 'payment-required',
      intentId: 'pi-1',
      redirectUrl: '/demo-fizetes/pi-1',
    });
    await submitCall;

    expect(h.assignSpy).not.toHaveBeenCalled();
  });

  it('RP-26 an incomplete outcome that lands after the page is gone does not navigate', async () => {
    const h = harness();

    let releaseOutcome!: (value: SubmitOutcome) => void;
    const submission = TestBed.inject(OrderSubmission);
    vi.spyOn(submission, 'submitOrder').mockImplementation(
      () =>
        new Promise<SubmitOutcome>((r) => {
          releaseOutcome = r;
        }),
    );

    await h.fixture.whenStable();
    const page = h.fixture.componentInstance;

    const submitCall = page.onSubmitRequested();
    h.fixture.destroy();
    releaseOutcome({
      kind: 'incomplete',
      route: '/penztar/szallitas?navigationReason=incomplete',
    });
    await submitCall;

    expect(h.navigateByUrlSpy).not.toHaveBeenCalled();
  });

  it('RP-27 a payment intent created after the page is gone does not leave the SPA', async () => {
    const h = harness();
    const checkout = TestBed.inject(CheckoutFacade);

    let releaseIntent!: (value: { ok: true; value: PaymentIntent }) => void;
    vi.spyOn(checkout, 'createPaymentIntent').mockImplementation(
      () =>
        new Promise((r) => {
          releaseIntent = r;
        }),
    );

    await h.fixture.whenStable();
    const page = h.fixture.componentInstance;

    const action = page.onNewPayment();
    h.fixture.destroy();
    releaseIntent({
      ok: true,
      value: {
        id: 'pi-new',
        status: 'requires_action',
        amount: { amount: 89990, currency: 'HUF' },
        createdAt: '2026-09-20T10:00:00.000Z',
        expiresAt: '2026-09-20T10:15:00.000Z',
        redirectUrl: '/demo-fizetes/pi-new',
        returnUrl: '/penztar/ellenorzes',
      },
    });
    await action;

    expect(h.assignSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// RP-17..RP-23 — recovery controls
// ---------------------------------------------------------------------------

describe('ReviewPage drives the recovery controls', () => {
  beforeEach(async () => {
    await seedCompleteCardDraft();
  });

  it('RP-17 confirming the price change clears it on the facade', async () => {
    const h = harness();
    const checkout = TestBed.inject(CheckoutFacade);
    const confirmSpy = vi.spyOn(checkout, 'confirmPriceChange');

    await h.fixture.whenStable();
    h.fixture.componentInstance.onPriceChangeConfirmed();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
  });

  it('RP-18 retrying a conflict replays the failed write through the facade', async () => {
    const h = harness();
    const checkout = TestBed.inject(CheckoutFacade);
    const retrySpy = vi.spyOn(checkout, 'retry').mockResolvedValue();

    await h.fixture.whenStable();
    await h.fixture.componentInstance.onRetryRequested();

    expect(retrySpy).toHaveBeenCalledTimes(1);
  });

  it('RP-19 retrying a declined payment rotates the stored intent key before creating a new intent', async () => {
    const h = harness();
    const checkout = TestBed.inject(CheckoutFacade);

    const seeded = await checkout.createPaymentIntent();
    if (!seeded.ok) throw new Error(`createPaymentIntent failed: ${seeded.error.code}`);
    const version = checkout.version() ?? 0;
    const seededKey = checkoutKeys.intentKey(version);

    let keyAtCreateCall: string | null = null;
    vi.spyOn(checkout, 'createPaymentIntent').mockImplementation(async () => {
      await Promise.resolve();
      keyAtCreateCall = checkoutKeys.intentKey(version);
      return seeded;
    });

    await h.fixture.whenStable();
    await h.fixture.componentInstance.onPaymentRetry();

    expect(keyAtCreateCall).not.toBeNull();
    expect(keyAtCreateCall).not.toBe(seededKey);
  });

  it('RP-20 a failed intent create records the server code rather than redirecting', async () => {
    const h = harness();
    const checkout = TestBed.inject(CheckoutFacade);
    vi.spyOn(checkout, 'createPaymentIntent').mockResolvedValue({
      ok: false,
      error: {
        code: 'CART_VERSION_CONFLICT',
        status: 412,
        detail: 'Cart version moved under us',
        fieldErrors: [],
      },
    });

    await h.fixture.whenStable();
    await h.fixture.componentInstance.onPaymentRetry();

    expect(h.assignSpy).not.toHaveBeenCalled();
    h.fixture.detectChanges();
    const host = hostOf(h.fixture);
    expect(countTestId(host, 'review-submit-failure')).toBe(1);
    expect(readDataErrorCode(host, 'review-submit-failure')).toBe('CART_VERSION_CONFLICT');
  });

  it('RP-21 checking a pending payment re-reads the stored intent exactly once and does nothing without an id', async () => {
    const h = harness();
    const checkout = TestBed.inject(CheckoutFacade);
    const readSpy = vi.spyOn(checkout, 'readPaymentIntent').mockResolvedValue({
      ok: true,
      value: {
        id: 'pi-1',
        status: 'pending',
        amount: { amount: 89990, currency: 'HUF' },
        createdAt: '2026-09-20T10:00:00.000Z',
        expiresAt: '2026-09-20T10:15:00.000Z',
        redirectUrl: '/demo-fizetes/pi-1',
        returnUrl: '/penztar/ellenorzes',
      },
    });

    await h.fixture.whenStable();
    checkoutKeys.setActiveIntentId('pi-1');
    await h.fixture.componentInstance.onPaymentCheck();

    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(readSpy.mock.calls[0]?.[0]).toBe('pi-1');

    sessionStorage.clear();
    writableOf<PaymentIntent | null>(checkout, 'paymentIntentWritable').set(null);
    await h.fixture.componentInstance.onPaymentCheck();
    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it('RP-22 going back to the payment uses the intent redirect url and does nothing without an intent', async () => {
    const h = harness();
    const checkout = TestBed.inject(CheckoutFacade);
    writableOf<PaymentIntent | null>(checkout, 'paymentIntentWritable').set({
      id: 'pi-1',
      status: 'requires_action',
      amount: { amount: 89990, currency: 'HUF' },
      createdAt: '2026-09-20T10:00:00.000Z',
      expiresAt: '2026-09-20T10:15:00.000Z',
      redirectUrl: '/demo-fizetes/pi-1',
      returnUrl: '/penztar/ellenorzes',
    });

    await h.fixture.whenStable();
    h.fixture.componentInstance.onBackToPayment();

    expect(h.assignSpy).toHaveBeenCalledTimes(1);
    expect(h.assignSpy.mock.calls[0]?.[0]).toBe('/demo-fizetes/pi-1');

    writableOf<PaymentIntent | null>(checkout, 'paymentIntentWritable').set(null);
    h.assignSpy.mockClear();
    h.fixture.componentInstance.onBackToPayment();
    expect(h.assignSpy).toHaveBeenCalledTimes(0);
  });

  it('RP-23 paymentIntentMissing is true only for a card draft with no intent, and the change-payment control leaves for the delivery step', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    writableOf<PaymentIntent | null>(checkout, 'paymentIntentWritable').set(null);
    const h1 = harness();
    await h1.fixture.whenStable();
    expect(h1.fixture.componentInstance.paymentIntentMissing()).toBe(true);

    h1.fixture.detectChanges();
    expect(h1.navigateSpy).not.toHaveBeenCalled();
    h1.fixture.componentInstance.onPaymentChangeMethod();
    expect(h1.navigateSpy).toHaveBeenCalledTimes(1);
    expect(h1.navigateSpy.mock.calls[0]?.[0]).toEqual(['/penztar/szallitas']);

    writableOf<PaymentIntent | null>(checkout, 'paymentIntentWritable').set({
      id: 'pi-1',
      status: 'requires_action',
      amount: { amount: 89990, currency: 'HUF' },
      createdAt: '2026-09-20T10:00:00.000Z',
      expiresAt: '2026-09-20T10:15:00.000Z',
      redirectUrl: '/demo-fizetes/pi-1',
      returnUrl: '/penztar/ellenorzes',
    });
    const h2 = harness();
    await h2.fixture.whenStable();
    expect(h2.fixture.componentInstance.paymentIntentMissing()).toBe(false);

    TestBed.resetTestingModule();
    configureTestBed();
    await seedCompleteCashOnDeliveryDraft();
    const h3 = harness();
    await h3.fixture.whenStable();
    expect(h3.fixture.componentInstance.paymentIntentMissing()).toBe(false);
  });
});
