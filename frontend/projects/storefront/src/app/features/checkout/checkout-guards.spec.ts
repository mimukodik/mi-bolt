/**
 * MIM-212 — checkout wizard guard cases on the 2.0.0 contract.
 *
 * Seventeen guard cases on the 2.0.0 checkout session.
 * `CheckoutFacade.updateContact` / `updateDelivery` / `updatePayment` /
 * `updateBilling` write the four sections, and the three guards
 * (`contactGuard`, `deliveryGuard`, `reviewGuard`) run against the
 * snapshots they hydrate themselves. A reload is reproduced by
 * `reloadDocument()`: the MSW stores and the demo session id stay,
 * the injector tree is thrown away, so the facades start with null
 * snapshots exactly as they do on a fresh document load. The harness
 * mirrors the 2.0.0 mock spec (catalog fixture in `beforeAll`, fixed
 * clock, deterministic ids, per-test `options` and `server.use(...)`).
 */

import '@angular/compiler';

// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { server, useMswServer } from '../../../../tests/msw-server';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { GuardResult, PartialMatchRouteSnapshot } from '@angular/router';
import { Router, UrlSegment, UrlTree, convertToParamMap, provideRouter } from '@angular/router';

import { provideApiConfiguration } from '../../../app/api/generated/api-configuration';
import { demoSessionInterceptor } from '../../../app/core/api/demo-session.interceptor';

import { createHandlers } from '../../../mocks/create-handlers';
import { IdempotencyStore } from '../../../mocks/idempotency';
import { Repository } from '../../../mocks/repository';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
} from '../../../mocks/scenarios';
import { TERMS_VERSION } from '../../../mocks/checkout/checkout-store';
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
import type { Problem } from '../../../app/api/generated/models/problem';

import { CartFacade } from '../../../app/features/cart/cart.facade';
import { CheckoutFacade } from '../../../app/features/checkout/checkout.facade';
import {
  contactGuard,
  deliveryGuard,
  reviewGuard,
} from '../../../app/features/checkout/checkout.guards';

useMswServer();

const BASE_URL = 'http://localhost/api/v1';
const MOTO = 'motorola-edge-50-fusion--zold--256';

const VALID_CONTACT: Contact = {
  fullName: 'Teszt Elek',
  email: 'Teszt.Elek@Pelda.hu',
  phone: '+36301234567',
};

/** `VALID_CONTACT` as the server stores it: the email is lower-cased
 *  by `normalizeContactEmail` (`src/mocks/checkout/validate-checkout.ts`). */
const STORED_CONTACT: Contact = {
  fullName: 'Teszt Elek',
  email: 'teszt.elek@pelda.hu',
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

interface Env {
  readonly repository: Repository;
  readonly clock: ReturnType<typeof createFixedClock>;
  readonly ids: ReturnType<typeof createDeterministicIds>;
  readonly options: {
    readonly repository: Repository;
    readonly clock: ReturnType<typeof createFixedClock>;
    readonly ids: ReturnType<typeof createDeterministicIds>;
    readonly scenario: ReturnType<Repository['getScenario']>;
    readonly apiRoot: string;
  };
}

/**
 * Every request the guards cause, as `"<METHOD> <pathname>"`, in the
 * order MSW saw it. Recorded synchronously in the `request:start`
 * listener so a case can compare the whole list to an exact array.
 */
let requestLog: string[] = [];

beforeAll(() => {
  if (!isCatalogFixtureShape(catalogFixture)) {
    throw new Error('[checkout-guards.spec] committed fixture does not match expected shape');
  }
  loadCatalogFixture(catalogFixture);
});

beforeEach((): void => {
  requestLog = [];
  const clock = createFixedClock('2026-09-20T10:00:00.000Z');
  const ids = createDeterministicIds(1);
  const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
  const options = {
    repository,
    clock,
    ids,
    scenario: DEFAULT_SCENARIO,
    apiRoot: '/api/v1',
  } satisfies Env['options'];
  // Side-effect: ensures the clock is wired to the idempotency store.
  new IdempotencyStore(clock);
  server.use(...createHandlers(options));
  server.events.on('request:start', ({ request }) => {
    requestLog.push(`${request.method} ${new URL(request.url).pathname}`);
  });
});

afterEach(() => {
  server.events.removeAllListeners('request:start');
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
 * Reproduces a document reload: the injector tree (and with it every
 * facade snapshot) is dropped and rebuilt, while the MSW stores and
 * the `sessionStorage` demo session id survive, so the server still
 * holds the cart and the draft the case seeded. The request log is
 * cleared with it, so a case measures only what the guard issues.
 */
function reloadDocument(): void {
  TestBed.resetTestingModule();
  configureTestBed();
  requestLog = [];
}

async function seedCartWithItem(): Promise<void> {
  const cart = TestBed.inject(CartFacade);
  await cart.ensureCart();
  await cart.addItem(MOTO, 1);
  expect(cart.cart()?.items.length).toBe(1);
}

/** Creates the session's cart without putting anything in it. */
async function seedEmptyCart(): Promise<void> {
  const cart = TestBed.inject(CartFacade);
  await cart.ensureCart();
  expect(cart.cart()?.items.length).toBe(0);
}

async function saveContact(): Promise<void> {
  const checkout = TestBed.inject(CheckoutFacade);
  const result = await checkout.updateContact(VALID_CONTACT);
  expect(result.ok).toBe(true);
}

async function saveDelivery(): Promise<void> {
  const checkout = TestBed.inject(CheckoutFacade);
  const result = await checkout.updateDelivery(HOME_DELIVERY);
  expect(result.ok).toBe(true);
}

async function savePayment(selection: PaymentSelection = CARD_PAYMENT): Promise<void> {
  const checkout = TestBed.inject(CheckoutFacade);
  const result = await checkout.updatePayment(selection);
  expect(result.ok).toBe(true);
}

/** Empties the session cart through `DELETE /cart/items`. */
async function emptyTheCart(): Promise<void> {
  const cart = TestBed.inject(CartFacade);
  await cart.clear();
  expect(cart.cart()?.items.length).toBe(0);
}

async function saveBilling(): Promise<void> {
  const checkout = TestBed.inject(CheckoutFacade);
  const result = await checkout.updateBilling(VALID_BILLING);
  expect(result.ok).toBe(true);
}

/**
 * Fails every `GET /cart` with the 503 the contract declares for the
 * operation (`docs/api/openapi.yaml:290-291`), in the Problem shape the
 * generated model requires: the `urn:mi-bolt:problem:…` type
 * `problemType()` builds (`src/mocks/cart/cart-store.ts`), plus the
 * mandatory `traceId` and `fieldErrors`.
 */
function failCartReads(): void {
  const problem: Problem = {
    type: 'urn:mi-bolt:problem:service-unavailable',
    title: 'Service unavailable',
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    detail: 'The cart store is unavailable.',
    traceId: 'mock-trace-guards',
    fieldErrors: [],
  };
  server.use(
    http.get('*/api/v1/cart', () =>
      HttpResponse.json(problem, {
        status: 503,
        headers: { 'content-type': 'application/problem+json' },
      }),
    ),
  );
}

function contactSegments(): UrlSegment[] {
  return [new UrlSegment('penztar', {}), new UrlSegment('adatok', {})];
}

function deliverySegments(): UrlSegment[] {
  return [new UrlSegment('penztar', {}), new UrlSegment('szallitas', {})];
}

function reviewSegments(): UrlSegment[] {
  return [new UrlSegment('penztar', {}), new UrlSegment('ellenorzes', {})];
}

/**
 * `CanMatchFn`'s third parameter is a `PartialMatchRouteSnapshot`, a
 * narrow `Pick` of `ActivatedRouteSnapshot`. The guards under test
 * only inspect `params` and `queryParams`, so an empty snapshot is
 * enough to exercise the redirect branches without a real router.
 */
const emptySnapshot: PartialMatchRouteSnapshot = {
  routeConfig: null,
  url: [],
  params: {},
  queryParams: {},
  fragment: null,
  data: {},
  outlet: 'primary',
  title: undefined,
  paramMap: convertToParamMap({}),
  queryParamMap: convertToParamMap({}),
};

async function runContact(): Promise<boolean | UrlTree> {
  const result: unknown = await TestBed.runInInjectionContext(() =>
    contactGuard({}, contactSegments(), emptySnapshot),
  );
  return unwrapGuard(result);
}

async function runDelivery(): Promise<boolean | UrlTree> {
  const result: unknown = await TestBed.runInInjectionContext(() =>
    deliveryGuard({}, deliverySegments(), emptySnapshot),
  );
  return unwrapGuard(result);
}

async function runReview(): Promise<boolean | UrlTree> {
  const result: unknown = await TestBed.runInInjectionContext(() =>
    reviewGuard({}, reviewSegments(), emptySnapshot),
  );
  return unwrapGuard(result);
}

/**
 * CanMatchFn in Angular 22 returns `MaybeAsync<GuardResult>`, whose
 * `GuardResult` is `boolean | UrlTree | RedirectCommand`. The guards
 * under test resolve to `true` or a `UrlTree`, so the awaited result
 * is either a boolean or a UrlTree; `RedirectCommand` would only
 * appear if a guard changed shape, which is itself a regression.
 */
function unwrapGuard(result: unknown): boolean | UrlTree {
  if (result instanceof UrlTree) return result;
  if (result === true || result === false) return result;
  throw new Error(`unexpected guard result: ${String(result)}`);
}

/**
 * Narrows a `GuardResult` to `UrlTree`. `toBeInstanceOf` does not
 * narrow the static type, so the assertion alone leaves the call site
 * with a union and forces a cast; the helper performs both the check
 * and the narrowing in one place.
 */
function expectUrlTree(result: GuardResult): UrlTree {
  expect(result).toBeInstanceOf(UrlTree);
  if (result instanceof UrlTree) {
    return result;
  }
  throw new Error('the guard did not return a UrlTree');
}

function serialise(tree: UrlTree): string {
  return TestBed.inject(Router).serializeUrl(tree);
}

// ---------------------------------------------------------------------------
// contactGuard — hydration and cart state (G-01..G-03, G-17)
// ---------------------------------------------------------------------------

describe('contactGuard', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('G-01 contactGuard hydrates the cart and the draft on a reload and matches', async () => {
    await seedCartWithItem();
    await saveContact();

    reloadDocument();
    const cart = TestBed.inject(CartFacade);
    const checkout = TestBed.inject(CheckoutFacade);
    expect(cart.cart()).toBeNull();
    expect(checkout.session()).toBeNull();

    expect(await runContact()).toBe(true);

    expect(requestLog).toEqual(['GET /api/v1/cart', 'GET /api/v1/checkout']);
    expect(cart.cart()?.items.length).toBe(1);
    expect(checkout.session()?.contact).toEqual(STORED_CONTACT);
  });

  it('G-02 contactGuard redirects with navigationReason=empty-cart when the hydrated cart is empty', async () => {
    await seedEmptyCart();

    reloadDocument();
    expect(TestBed.inject(CartFacade).cart()).toBeNull();

    const tree = expectUrlTree(await runContact());
    expect(serialise(tree)).toBe('/penztar/kosar?navigationReason=empty-cart');
    expect(requestLog).toEqual(['GET /api/v1/cart', 'GET /api/v1/checkout']);
    expect(TestBed.inject(CartFacade).cart()?.items.length).toBe(0);
  });

  it('G-03 contactGuard returns true when the cart has items', async () => {
    await seedCartWithItem();
    expect(await runContact()).toBe(true);
  });

  it('G-17 contactGuard issues no request when the cart and the draft are already in memory', async () => {
    await seedCartWithItem();
    await saveContact();
    expect(await runContact()).toBe(true);

    // The first run left both snapshots loaded; a navigation inside the
    // wizard must therefore cost nothing. The line this pins is
    // `CheckoutFacade.ensureSession`'s `existing !== null` early return:
    // removing it makes this case read ['GET /api/v1/checkout']. The cart
    // side is guarded twice, by `CartFacade.ensureCart`'s early return and
    // by the re-check inside its queue callback, so removing either one
    // alone issues no request.
    requestLog = [];
    expect(await runContact()).toBe(true);
    expect(requestLog).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deliveryGuard — contact presence and hydration (G-04, G-05, G-12, G-14)
// ---------------------------------------------------------------------------

describe('deliveryGuard', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('G-04 deliveryGuard redirects to /penztar/adatok when contact has not been saved', async () => {
    await seedCartWithItem();

    const tree = expectUrlTree(await runDelivery());
    const url = serialise(tree);
    expect(url).toContain('/penztar/adatok');
    expect(url).toContain('navigationReason=incomplete');
  });

  it('G-05 deliveryGuard returns true when the contact section has been saved', async () => {
    await seedCartWithItem();
    await saveContact();

    expect(await runDelivery()).toBe(true);
  });

  it('G-12 deliveryGuard hydrates the saved contact on a reload and matches', async () => {
    await seedCartWithItem();
    await saveContact();

    reloadDocument();
    const checkout = TestBed.inject(CheckoutFacade);
    expect(checkout.session()).toBeNull();

    expect(await runDelivery()).toBe(true);

    expect(requestLog).toEqual(['GET /api/v1/cart', 'GET /api/v1/checkout']);
    expect(checkout.session()?.contact).toEqual(STORED_CONTACT);
  });

  it('G-14 deliveryGuard redirects with navigationReason=empty-cart when the hydrated cart is empty', async () => {
    await seedEmptyCart();
    await saveContact();

    reloadDocument();

    const tree = expectUrlTree(await runDelivery());
    expect(serialise(tree)).toBe('/penztar/kosar?navigationReason=empty-cart');
  });
});

// ---------------------------------------------------------------------------
// reviewGuard — section presence, hydration and the order success redirect
// (G-06..G-11, G-13, G-15)
// ---------------------------------------------------------------------------

describe('reviewGuard', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('G-06 reviewGuard redirects to /penztar/adatok when contact has not been saved', async () => {
    await seedCartWithItem();

    const tree = expectUrlTree(await runReview());
    const url = serialise(tree);
    expect(url).toContain('/penztar/adatok');
    expect(url).toContain('navigationReason=incomplete');
  });

  it('G-07 reviewGuard redirects to /penztar/szallitas when delivery is missing', async () => {
    await seedCartWithItem();
    await saveContact();

    const tree = expectUrlTree(await runReview());
    const url = serialise(tree);
    expect(url).toContain('/penztar/szallitas');
    expect(url).toContain('navigationReason=incomplete');
  });

  it('G-08 reviewGuard redirects to /penztar/szallitas when payment is missing', async () => {
    await seedCartWithItem();
    await saveContact();
    await saveDelivery();

    const tree = expectUrlTree(await runReview());
    const url = serialise(tree);
    expect(url).toContain('/penztar/szallitas');
    expect(url).toContain('navigationReason=incomplete');
  });

  it('G-09 reviewGuard redirects to /penztar/szallitas when billing is missing', async () => {
    await seedCartWithItem();
    await saveContact();
    await saveDelivery();
    await savePayment();

    const tree = expectUrlTree(await runReview());
    const url = serialise(tree);
    expect(url).toContain('/penztar/szallitas');
    expect(url).toContain('navigationReason=incomplete');
  });

  it('G-10 reviewGuard allows /penztar/ellenorzes when every section is saved', async () => {
    await seedCartWithItem();
    await saveContact();
    await saveDelivery();
    await savePayment();
    await saveBilling();

    expect(await runReview()).toBe(true);
  });

  it('G-13 reviewGuard hydrates every saved section on a reload and matches', async () => {
    await seedCartWithItem();
    await saveContact();
    await saveDelivery();
    await savePayment();
    await saveBilling();

    reloadDocument();
    const checkout = TestBed.inject(CheckoutFacade);
    expect(checkout.session()).toBeNull();

    expect(await runReview()).toBe(true);

    expect(requestLog).toEqual(['GET /api/v1/cart', 'GET /api/v1/checkout']);
    const session = checkout.session();
    expect(session?.contact).toEqual(STORED_CONTACT);
    expect(session?.delivery).toEqual(HOME_DELIVERY);
    expect(session?.payment).toEqual(CARD_PAYMENT);
    expect(session?.billing).toEqual(VALID_BILLING);
  });

  it('G-15 reviewGuard redirects with navigationReason=empty-cart when the hydrated cart is empty', async () => {
    // Every section is saved first and the cart emptied afterwards, so
    // the case proves the cart check runs ahead of the section checks
    // rather than merely finding a missing section. A section cannot be
    // written against an empty cart: the delivery option and the
    // payment method are both unavailable while the cart has no lines
    // (`src/mocks/checkout/checkout-store.ts`, `CART_EMPTY`).
    await seedCartWithItem();
    await saveContact();
    await saveDelivery();
    await savePayment();
    await saveBilling();
    await emptyTheCart();

    reloadDocument();

    const tree = expectUrlTree(await runReview());
    expect(serialise(tree)).toBe('/penztar/kosar?navigationReason=empty-cart');
  });
});

// ---------------------------------------------------------------------------
// A failed cart read is not an empty cart (G-16)
// ---------------------------------------------------------------------------

describe('guards report an unreadable cart as cart-unavailable', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('G-16 contact, delivery and review guards redirect with navigationReason=cart-unavailable when GET /cart fails', async () => {
    await seedCartWithItem();
    await saveContact();

    reloadDocument();
    failCartReads();

    for (const guard of [runContact, runDelivery, runReview] as const) {
      const tree = expectUrlTree(await guard());
      expect(serialise(tree)).toBe('/penztar/kosar?navigationReason=cart-unavailable');
    }
    expect(TestBed.inject(CartFacade).cart()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Order success — once an order exists, all three guards redirect to /penztar/siker/{id}
// ---------------------------------------------------------------------------

describe('guards redirect to the success URL once an order exists', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('G-11 contact, delivery and review guards redirect to the success URL once an order exists', async () => {
    await seedCartWithItem();
    await saveContact();
    await saveDelivery();
    // The draft's payment method and the order body's must agree, or
    // the server answers 422 PAYMENT_METHOD_MISMATCH
    // (`src/mocks/orders/order-store.ts`), so the draft carries the
    // cash-on-delivery method this case submits.
    await savePayment(COD_PAYMENT);
    await saveBilling();

    // submitOrder reads `optionsWritable().termsVersion` directly and
    // returns NO_OPTIONS when the snapshot is null; it does NOT call
    // ensureOptions internally. We seed it explicitly because the body
    // submitted here is cash on delivery, which has no card side and
    // would otherwise strand on the missing termsVersion.
    const checkout = TestBed.inject(CheckoutFacade);
    const optionsResult = await checkout.ensureOptions();
    expect(optionsResult.ok).toBe(true);

    const placed = await checkout.submitOrder({
      paymentMethod: 'cash_on_delivery',
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    if (!placed.ok) throw new Error(`submitOrder failed: ${placed.error.code}`);
    const orderId = placed.value.id;
    expect(typeof orderId).toBe('string');

    // The success page resets the cart once it renders (`success-step.ts`);
    // the guard's precondition is reproduced here by calling
    // `resetOrderedCart()` directly.
    TestBed.inject(CartFacade).resetOrderedCart();

    for (const guard of [runContact, runDelivery, runReview] as const) {
      const tree = expectUrlTree(await guard());
      const url = serialise(tree);
      expect(url).toContain(`/penztar/siker/${orderId}`);
    }
  });
});
