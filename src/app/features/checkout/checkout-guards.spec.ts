/**
 * MIM-212 — checkout wizard guard cases on the 2.0.0 contract.
 *
 * Eleven guard cases on the 2.0.0 checkout session and
 * `CheckoutFacade.updateContact` /
 * `updateDelivery` / `updatePayment` / `updateBilling` write the four
 * sections, and the three guards (`contactGuard`, `deliveryGuard`,
 * `reviewGuard`) run against the in-memory snapshot. The harness
 * mirrors the 2.0.0 mock spec (catalog fixture in `beforeAll`, fixed
 * clock, deterministic ids, per-test `options` and `server.use(...)`).
 */

import '@angular/compiler';

// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { server, useMswServer } from '../../../../tests/msw-server';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import {
  GuardResult,
  PartialMatchRouteSnapshot,
  Router,
  UrlSegment,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';

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

beforeAll(() => {
  if (!isCatalogFixtureShape(catalogFixture)) {
    throw new Error('[checkout-guards.spec] committed fixture does not match expected shape');
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
  } satisfies Env['options'];
  // Side-effect: ensures the clock is wired to the idempotency store.
  new IdempotencyStore(clock);
  server.use(...createHandlers(options));
});

afterEach(() => {
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

async function seedCartWithItem(): Promise<void> {
  const cart = TestBed.inject(CartFacade);
  await cart.ensureCart();
  await cart.addItem(MOTO, 1);
  expect(cart.cart()?.items.length).toBe(1);
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

async function savePayment(): Promise<void> {
  const checkout = TestBed.inject(CheckoutFacade);
  const result = await checkout.updatePayment(CARD_PAYMENT);
  expect(result.ok).toBe(true);
}

async function saveBilling(): Promise<void> {
  const checkout = TestBed.inject(CheckoutFacade);
  const result = await checkout.updateBilling(VALID_BILLING);
  expect(result.ok).toBe(true);
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

function runContact(): boolean | UrlTree {
  const result = TestBed.runInInjectionContext(() =>
    contactGuard({}, contactSegments(), emptySnapshot),
  );
  return unwrapGuard(result);
}

function runDelivery(): boolean | UrlTree {
  const result = TestBed.runInInjectionContext(() =>
    deliveryGuard({}, deliverySegments(), emptySnapshot),
  );
  return unwrapGuard(result);
}

function runReview(): boolean | UrlTree {
  const result = TestBed.runInInjectionContext(() =>
    reviewGuard({}, reviewSegments(), emptySnapshot),
  );
  return unwrapGuard(result);
}

/**
 * CanMatchFn in Angular 22 returns `MaybeAsync<GuardResult>`, whose
 * `GuardResult` is `boolean | UrlTree | RedirectCommand`. The guards
 * under test only ever return `true` or a `UrlTree`, so the observed
 * result is either a boolean or a UrlTree; `RedirectCommand` would
 * only appear if a guard changed shape, which is itself a regression.
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
// contactGuard — cart snapshot awareness (G-01..G-03)
// ---------------------------------------------------------------------------

describe('contactGuard', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('G-01 contactGuard redirects with navigationReason=deep-link when the cart has not loaded yet', () => {
    const cart = TestBed.inject(CartFacade);
    expect(cart.cart()).toBeNull();

    const tree = expectUrlTree(runContact());
    const url = serialise(tree);
    expect(url).toContain('/penztar/kosar');
    expect(url).toContain('navigationReason=deep-link');
  });

  it('G-02 contactGuard redirects with navigationReason=empty-cart when the cart is loaded but empty', async () => {
    const cart = TestBed.inject(CartFacade);
    await cart.ensureCart();
    expect(cart.cart()).not.toBeNull();
    expect(cart.cart()?.items.length).toBe(0);

    const tree = expectUrlTree(runContact());
    const url = serialise(tree);
    expect(url).toContain('/penztar/kosar');
    expect(url).toContain('navigationReason=empty-cart');
  });

  it('G-03 contactGuard returns true when the cart has items', async () => {
    await seedCartWithItem();
    expect(runContact()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deliveryGuard — contact presence (G-04, G-05)
// ---------------------------------------------------------------------------

describe('deliveryGuard', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('G-04 deliveryGuard redirects to /penztar/adatok when contact has not been saved', async () => {
    await seedCartWithItem();

    const tree = expectUrlTree(runDelivery());
    const url = serialise(tree);
    expect(url).toContain('/penztar/adatok');
    expect(url).toContain('navigationReason=incomplete');
  });

  it('G-05 deliveryGuard returns true when the contact section has been saved', async () => {
    await seedCartWithItem();
    await saveContact();

    expect(runDelivery()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reviewGuard — section presence and the order success redirect (G-06..G-11)
// ---------------------------------------------------------------------------

describe('reviewGuard', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('G-06 reviewGuard redirects to /penztar/adatok when contact has not been saved', async () => {
    await seedCartWithItem();

    const tree = expectUrlTree(runReview());
    const url = serialise(tree);
    expect(url).toContain('/penztar/adatok');
    expect(url).toContain('navigationReason=incomplete');
  });

  it('G-07 reviewGuard redirects to /penztar/szallitas when delivery is missing', async () => {
    await seedCartWithItem();
    await saveContact();

    const tree = expectUrlTree(runReview());
    const url = serialise(tree);
    expect(url).toContain('/penztar/szallitas');
    expect(url).toContain('navigationReason=incomplete');
  });

  it('G-08 reviewGuard redirects to /penztar/szallitas when payment is missing', async () => {
    await seedCartWithItem();
    await saveContact();
    await saveDelivery();

    const tree = expectUrlTree(runReview());
    const url = serialise(tree);
    expect(url).toContain('/penztar/szallitas');
    expect(url).toContain('navigationReason=incomplete');
  });

  it('G-09 reviewGuard redirects to /penztar/szallitas when billing is missing', async () => {
    await seedCartWithItem();
    await saveContact();
    await saveDelivery();
    await savePayment();

    const tree = expectUrlTree(runReview());
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

    expect(runReview()).toBe(true);
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
    await savePayment();
    await saveBilling();

    // submitOrder reads `optionsWritable().termsVersion` directly and
    // returns NO_OPTIONS when the snapshot is null; it does NOT call
    // ensureOptions internally. We seed it explicitly because the body
    // the brief specifies is cash on delivery, which has no card side
    // and would otherwise strand on the missing termsVersion.
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
      const tree = expectUrlTree(guard());
      const url = serialise(tree);
      expect(url).toContain(`/penztar/siker/${orderId}`);
    }
  });
});
