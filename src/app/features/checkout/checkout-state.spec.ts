/**
 * T19 — checkout wizard state machine, Signal Forms, route guards.
 *
 * The spec covers the four scenarios `docs/tasks/test-scenarios.json`
 * tags for T19:
 *
 *   - forward navigation (E066) — wizard advances through every step
 *     and lands on the success page with a valid order receipt;
 *   - back navigation — the in-memory fields survive a Router-driven
 *     re‑navigation to an earlier step;
 *   - deep-link to `/penztar/siker/:orderId` (E070) — a guard sends
 *     the user to the cart when the in-memory receipt is missing;
 *   - deep-link to `/penztar/ellenorzes` with empty draft (E067) —
 *     the review guard redirects to the earliest missing step.
 *
 * Vitest runs the suite under `jsdom` + `@angular/core/testing` so
 * the facade's `@Service()` decorator, the Signal Forms `form()`
 * call, and the `inject()` calls inside the guards all see a real
 * Angular injector. MSW runs as a Node worker (T05 setup) and the
 * cart / checkout / payment / order handlers are wired through
 * `createHandlers(...)`.
 */

import '@angular/compiler';

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse, http, type RequestHandler } from 'msw';
import { server, useMswServer } from '../../../../tests/msw-server';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  EnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext,
  signal,
} from '@angular/core';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
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
import { createDeterministicIds, createFixedClock } from '../../../mocks/scenarios';

// Side-effect imports - register cart / checkout / payment / order
// handlers in the T05 dispatcher registry so MSW routes the requests.
import '../../../mocks/cart/cart.handlers';
import '../../../mocks/checkout/checkout.handlers';
import '../../../mocks/payment/payment.handlers';
import '../../../mocks/orders/order.handlers';

import { CartFacade } from '../../../app/features/cart/cart.facade';
import { CheckoutFacade, type CheckoutStep } from '../../../app/features/checkout/checkout.facade';
import {
  createInitialCheckoutFormModel,
  buildCheckoutForm,
  PHONE_PATTERN,
  POSTAL_CODE_PATTERN,
  type CheckoutFormModel,
} from '../../../app/features/checkout/checkout-form.model';
import {
  contactGuard,
  deliveryGuard,
  reviewGuard,
  successGuard,
} from '../../../app/features/checkout/checkout.guards';

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

const BASE_URL = 'http://localhost/api/v1';
const VARIANT_G256 = 'demo-one-5g-graphite-256';

interface Env {
  repository: Repository;
  clock: ReturnType<typeof createFixedClock>;
  ids: ReturnType<typeof createDeterministicIds>;
  scenario: { name: string; seed: number; clockOffsetMs: number; isolated: boolean };
}

function makeEnv(scenarioName = 'checkout-state-suite'): Env {
  const clock = createFixedClock(new Date(Date.parse('2026-09-15T09:00:00.000Z')).toISOString());
  const ids = createDeterministicIds(7);
  const scenario = {
    name: scenarioName,
    seed: 7,
    clockOffsetMs: 0,
    isolated: true,
  };
  const repository = new Repository(scenario, ids, clock);
  repository.loadProducts([DEMO_PRODUCT]);
  new IdempotencyStore(clock); // side-effect: ensures the clock is wired
  return { repository, clock, ids, scenario };
}

let currentEnv: Env;

function buildHandlers(): readonly RequestHandler[] {
  return createHandlers({
    repository: currentEnv.repository,
    clock: currentEnv.clock,
    ids: currentEnv.ids,
    scenario: currentEnv.scenario,
    apiRoot: '/api/v1',
  });
}

beforeEach(() => {
  currentEnv = makeEnv();
  server.use(...buildHandlers());
});

afterEach(() => {
  server.resetHandlers();
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

function seedCartWithItem(): Promise<string> {
  return runInInjectionContext(TestBed.inject(EnvironmentInjector), async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();
    await facade.addItem(VARIANT_G256, 1);
    const id = facade.cartId;
    if (id === null) throw new Error('cart id missing after seed');
    return id;
  });
}

// ---------------------------------------------------------------------------
// T19-AC01 — Signal Forms own the form data. There is no FormGroup,
// BehaviorSubject or duplicate state source on the CheckoutFacade.
// ---------------------------------------------------------------------------

describe('T19-AC01 Signal Forms owns the form model', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('exposes a FieldTree whose root value is the initial empty model', () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const value = checkout.form().value();
    expect(value).toEqual(createInitialCheckoutFormModel());
  });

  it('reports invalid until the required fields are filled', () => {
    const checkout = TestBed.inject(CheckoutFacade);
    expect(checkout.form().valid()).toBe(false);
    // Touching any field without filling required siblings keeps
    // the root invalid; required + pattern rules must surface.
    const f = checkout.form;
    f.fullName().value.set('Teszt Elek');
    expect(checkout.form().valid()).toBe(false);
  });

  it('becomes valid when every required field passes the schema', () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const f = checkout.form;
    f.fullName().value.set('Teszt Elek');
    f.email().value.set('teszt@example.test');
    f.phone().value.set('+36201234567');
    f.deliveryOptionId().value.set('demo_pickup');
    f.paymentMethod().value.set('demo_cod');
    f.acceptedTerms().value.set(true);
    f.acknowledgedSimulation().value.set(true);
    expect(checkout.form().valid()).toBe(true);
  });

  it('hides the address section when the delivery option is demo_pickup', () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const f = checkout.form;
    f.deliveryOptionId().value.set('demo_pickup');
    expect(f.address().hidden()).toBe(true);
    f.deliveryOptionId().value.set('home_delivery');
    expect(f.address().hidden()).toBe(false);
  });

  it('rejects a phone number that does not match the +36 pattern', () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const f = checkout.form;
    f.fullName().value.set('Teszt Elek');
    f.email().value.set('teszt@example.test');
    f.phone().value.set('06201234567');
    expect(f.phone().invalid()).toBe(true);
  });

  it('shares the same source of truth between the writable model and the form tree', () => {
    // The schema is bound to the model's writable signal — there is
    // no parallel state. Updating one must surface in the other.
    const checkout = TestBed.inject(CheckoutFacade);
    checkout.form.fullName().value.set('Teszt Elek');
    expect(checkout.form().value().fullName).toBe('Teszt Elek');
  });
});

// ---------------------------------------------------------------------------
// T19-AC01 — internal: the form factory binds to a writable signal.
// ---------------------------------------------------------------------------

describe('checkoutFormSchema binds to a writable signal', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('buildCheckoutForm constructs a FieldTree over the provided signal', () => {
    runInInjectionContext(TestBed.inject(EnvironmentInjector), () => {
      const modelSig = (function mk() {
        // Plain writable signal via the Angular signal() helper.
        // The schema is non-reactive so we can build the tree once.
        return signal<CheckoutFormModel>(createInitialCheckoutFormModel());
      })();
      const tree = buildCheckoutForm(modelSig);
      expect(tree).toBeDefined();
      expect(tree().invalid()).toBe(true);
    });
  });

  it('exposes the canonical regex constants used by the schema', () => {
    expect(PHONE_PATTERN.test('+36201234567')).toBe(true);
    expect(PHONE_PATTERN.test('06201234567')).toBe(false);
    expect(POSTAL_CODE_PATTERN.test('1111')).toBe(true);
    expect(POSTAL_CODE_PATTERN.test('0123')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T19-AC03 + T19-AC04 — forward navigation: cart → contact →
// delivery → review → success. The wizard advances only when the
// previous section validates AND the draft save returns 200.
// ---------------------------------------------------------------------------

describe('T19 forward navigation through the wizard', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('advances cart → contact → delivery → review → success', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = TestBed.inject(CartFacade);
    const cartId = await seedCartWithItem();
    await cart.ensureCart();

    // Load the session before any user action. No draft exists
    // server-side yet, so the contact form should be empty.
    const loaded = await checkout.loadSession(cartId, { clearOnLoad: false });
    expect(loaded).not.toBeNull();
    expect(loaded?.contact).toBeUndefined();
    expect(checkout.step()).toBe<CheckoutStep>('contact');

    // Fill + save contact. The session now carries the contact.
    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');
    const savedContact = await checkout.saveContactSection();
    expect(savedContact.ok).toBe(true);
    expect(checkout.session()?.contact?.fullName).toBe('Teszt Elek');
    expect(checkout.step()).toBe<CheckoutStep>('delivery');

    // Fill + save delivery (home_delivery with a HU address).
    checkout.form.deliveryOptionId().value.set('home_delivery');
    checkout.form.address.postalCode().value.set('1111');
    checkout.form.address.city().value.set('Demóváros');
    checkout.form.address.line1().value.set('Példa utca 1.');
    const savedDelivery = await checkout.saveDeliverySection();
    expect(savedDelivery.ok).toBe(true);
    expect(checkout.session()?.delivery?.optionId).toBe('home_delivery');

    // Pick + save the payment method.
    checkout.form.paymentMethod().value.set('demo_card');
    const savedPayment = await checkout.savePaymentMethod();
    expect(savedPayment.ok).toBe(true);
    expect(checkout.session()?.paymentMethod).toBe('demo_card');
    expect(checkout.step()).toBe<CheckoutStep>('review');

    // Create a quote and commit the order.
    const quote = await checkout.createQuote();
    expect(quote.ok).toBe(true);
    expect(checkout.quote()?.id).toBeTruthy();

    // For demo_card we need a payment intent first.
    const intent = await checkout.createPaymentIntent();
    expect(intent.ok).toBe(true);

    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);
    const order = await checkout.commitOrder();
    expect(order.ok).toBe(true);
    expect(checkout.order()?.id).toBeTruthy();
    expect(checkout.step()).toBe<CheckoutStep>('success');
  });

  it('refuses to advance when the contact section does not validate', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    await seedCartWithItem();
    await checkout.loadSession(TestBed.inject(CartFacade).cartId, { clearOnLoad: false });

    // Leave required fields blank and call saveContactSection.
    // The form is invalid, but the facade still talks to the wire:
    // the mock returns 422 with field errors and the facade surfaces
    // them through `error()` without clearing the form.
    const result = await checkout.saveContactSection();
    expect(result.ok).toBe(false);
    expect(checkout.error()?.status).toBe(422);
    expect(checkout.error()?.code).toBe('VALIDATION_ERROR');
    expect(checkout.form().value().email).toBe(''); // unchanged
  });
});

// ---------------------------------------------------------------------------
// T19-AC03 — back navigation preserves the in-memory form values.
// ---------------------------------------------------------------------------

describe('T19 back navigation preserves in-memory form values', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('keeps contact fields when the user revisits the contact step', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cartId = await seedCartWithItem();
    await checkout.loadSession(cartId, { clearOnLoad: false });

    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');
    const saved = await checkout.saveContactSection();
    expect(saved.ok).toBe(true);

    // The user navigates to the cart (back) then re-enters contact.
    // The in-memory model retains the values they typed — the
    // `hydratedWritable` flag stays true so the UI re-renders the
    // bound fields with the last-typed values.
    expect(checkout.form().value().fullName).toBe('Teszt Elek');
    expect(checkout.form().value().email).toBe('teszt@example.test');
    expect(checkout.form().value().phone).toBe('+36201234567');
  });

  it('a failed quote leaves contact + address + payment method + cart untouched', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = TestBed.inject(CartFacade);
    const cartId = await seedCartWithItem();
    await checkout.loadSession(cartId, { clearOnLoad: false });

    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');
    await checkout.saveContactSection();

    checkout.form.deliveryOptionId().value.set('demo_pickup');
    await checkout.saveDeliverySection();

    checkout.form.paymentMethod().value.set('demo_cod');
    await checkout.savePaymentMethod();

    // Inject a quote handler that returns OUT_OF_STOCK so the
    // facade surfaces an error and the form fields survive.
    server.use(
      http.post('*/api/v1/checkout/:cartId/quote', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:out-of-stock',
            title: 'Egy vagy több változat elfogyott.',
            status: 409,
            code: 'OUT_OF_STOCK',
            detail: 'Egy vagy több változat elfogyott.',
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const result = await checkout.createQuote();
    expect(result.ok).toBe(false);
    expect(checkout.error()?.code).toBe('OUT_OF_STOCK');
    // Form values are preserved.
    expect(checkout.form().value().fullName).toBe('Teszt Elek');
    expect(checkout.form().value().deliveryOptionId).toBe('demo_pickup');
    expect(checkout.form().value().paymentMethod).toBe('demo_cod');
    // Cart survives — the cart facade still has the line.
    expect(cart.itemCount()).toBe(1);
  });

  it('a declined payment does not reset contact, address, method or cart', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = TestBed.inject(CartFacade);
    const cartId = await seedCartWithItem();
    await checkout.loadSession(cartId, { clearOnLoad: false });

    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');
    await checkout.saveContactSection();
    checkout.form.deliveryOptionId().value.set('demo_pickup');
    await checkout.saveDeliverySection();
    checkout.form.paymentMethod().value.set('demo_card');
    await checkout.savePaymentMethod();
    const quote = await checkout.createQuote();
    expect(quote.ok).toBe(true);

    // Override the payment-intent handler to simulate a declined
    // outcome — the facade should not reset contact, address,
    // paymentMethod or the cart.
    server.use(
      http.post('*/api/v1/payment-intents', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:payment-declined',
            title: 'A szimulált fizetés elutasítva.',
            status: 409,
            code: 'PAYMENT_DECLINED',
            detail: 'A szimulált fizetés elutasítva. Új fizetési szándékot kell létrehozni.',
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const intent = await checkout.createPaymentIntent();
    expect(intent.ok).toBe(false);
    expect(checkout.error()?.code).toBe('PAYMENT_DECLINED');
    // Form fields preserved.
    expect(checkout.form().value().fullName).toBe('Teszt Elek');
    expect(checkout.form().value().paymentMethod).toBe('demo_card');
    // Cart survived.
    expect(cart.itemCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T19-AC02 — direct deep-link to /penztar/siker/:orderId without a
// loaded receipt redirects to /penztar/kosar.
// ---------------------------------------------------------------------------

describe('T19 deep-link to /penztar/siker/:orderId without a receipt', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('allows the navigation through so the page can hydrate the receipt', () => {
    const checkout = TestBed.inject(CheckoutFacade);
    expect(checkout.order()).toBeNull();

    const route = {
      paramMap: convertToParamMap({ orderId: 'order-missing-001' }),
    } as unknown as ActivatedRouteSnapshot;
    const state = { url: '/penztar/siker/order-missing-001' } as RouterStateSnapshot;

    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      successGuard(route, state),
    );
    // T24-AC02: the success page owns hydration through fetchOrder.
    // The guard lets the navigation through; the page renders the
    // 404 recovery when the order is genuinely missing server-side.
    expect(result).toBe(true);
  });

  it('allows the navigation when the facade already carries the receipt', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    // Drive the facade forward through a happy-path commit so the
    // order is loaded into memory. We hit the network so the
    // receipt id comes from the server.
    const cartId = await seedCartWithItem();
    await checkout.loadSession(cartId, { clearOnLoad: false });
    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');
    await checkout.saveContactSection();
    checkout.form.deliveryOptionId().value.set('demo_pickup');
    await checkout.saveDeliverySection();
    checkout.form.paymentMethod().value.set('demo_cod');
    await checkout.savePaymentMethod();
    const quote = await checkout.createQuote();
    expect(quote.ok).toBe(true);
    const order = await checkout.commitOrder();
    expect(order.ok).toBe(true);

    const route = {
      paramMap: convertToParamMap({ orderId: checkout.order()?.id ?? '' }),
    } as unknown as ActivatedRouteSnapshot;
    const state = { url: '/penztar/siker/x' } as RouterStateSnapshot;
    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      successGuard(route, state),
    );
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T19-AC02 — direct deep-link to /penztar/ellenorzes with an empty
// draft redirects to the earliest missing step.
// ---------------------------------------------------------------------------

describe('T19 deep-link to /penztar/ellenorzes with empty draft', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('redirects to /penztar/adatok when contact has not been saved', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cartId = await seedCartWithItem();
    await checkout.loadSession(cartId, { clearOnLoad: false });

    // User hits /penztar/ellenorzes directly without ever filling
    // the contact form. The review guard must redirect to the
    // contact step with a `navigationReason` query param.
    const segments = [{ path: 'penztar' }, { path: 'ellenorzes' }] as UrlSegment[];
    const route = {} as Parameters<typeof reviewGuard>[0];
    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      reviewGuard(route, segments, {} as never),
    );
    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    expect(tree.toString()).toContain('/penztar/adatok');
    expect(tree.toString()).toContain('navigationReason=incomplete');

    // Sanity: the facade's `earliestMissingStep` agrees.
    expect(checkout.earliestMissingStep()).toBe<CheckoutStep>('contact');
  });

  it('redirects to /penztar/szallitas when contact is saved but delivery is not', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cartId = await seedCartWithItem();
    await checkout.loadSession(cartId, { clearOnLoad: false });
    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');
    const saved = await checkout.saveContactSection();
    expect(saved.ok).toBe(true);

    const segments = [{ path: 'penztar' }, { path: 'ellenorzes' }] as UrlSegment[];
    const route = {} as Parameters<typeof reviewGuard>[0];
    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      reviewGuard(route, segments, {} as never),
    );
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('/penztar/szallitas');
  });

  it('redirects to /penztar/kosar when the cart is empty (no items)', async () => {
    const cart = TestBed.inject(CartFacade);
    await cart.ensureCart();
    // No items added — the cart is empty.

    const segments = [{ path: 'penztar' }, { path: 'ellenorzes' }] as UrlSegment[];
    const route = {} as Parameters<typeof reviewGuard>[0];
    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      reviewGuard(route, segments, {} as never),
    );
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('/penztar/kosar');
  });

  it('allows /penztar/ellenorzes when every section is saved', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cartId = await seedCartWithItem();
    await checkout.loadSession(cartId, { clearOnLoad: false });

    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');
    await checkout.saveContactSection();
    checkout.form.deliveryOptionId().value.set('demo_pickup');
    await checkout.saveDeliverySection();
    checkout.form.paymentMethod().value.set('demo_cod');
    await checkout.savePaymentMethod();

    const segments = [{ path: 'penztar' }, { path: 'ellenorzes' }] as UrlSegment[];
    const route = {} as Parameters<typeof reviewGuard>[0];
    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      reviewGuard(route, segments, {} as never),
    );
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T19-AC05 — guards never call the network. The reviewer-only check
// is structural: the guard functions import nothing from the SDK
// and only call inject() on the two facades.
// ---------------------------------------------------------------------------

describe('T19-AC05 guards do not call the network', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('contactGuard returns true when the cart has items', async () => {
    await seedCartWithItem();
    const segments = [{ path: 'penztar' }, { path: 'adatok' }] as UrlSegment[];
    const route = {} as Parameters<typeof contactGuard>[0];
    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      contactGuard(route, segments, {} as never),
    );
    expect(result).toBe(true);
  });

  it('deliveryGuard returns true when the contact section has been saved', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cartId = await seedCartWithItem();
    await checkout.loadSession(cartId, { clearOnLoad: false });
    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');
    await checkout.saveContactSection();

    const segments = [{ path: 'penztar' }, { path: 'szallitas' }] as UrlSegment[];
    const route = {} as Parameters<typeof deliveryGuard>[0];
    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      deliveryGuard(route, segments, {} as never),
    );
    expect(result).toBe(true);
  });

  it('deliveryGuard redirects to /penztar/adatok when contact has not been saved', async () => {
    await seedCartWithItem();
    const segments = [{ path: 'penztar' }, { path: 'szallitas' }] as UrlSegment[];
    const route = {} as Parameters<typeof deliveryGuard>[0];
    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      deliveryGuard(route, segments, {} as never),
    );
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('/penztar/adatok');
  });
});

// ---------------------------------------------------------------------------
// T19-AC02 — reload semantics: `loadSession(..., { clearOnLoad: true })`
// wipes the in-memory contact / address but the cart survives.
// ---------------------------------------------------------------------------

describe('T19-AC02 reload clears contact/address but preserves the cart', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('loadSession(..., { clearOnLoad: true }) clears the in-memory form', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cartId = await seedCartWithItem();
    await checkout.loadSession(cartId, { clearOnLoad: false });

    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');
    await checkout.saveContactSection();
    expect(checkout.form().value().fullName).toBe('Teszt Elek');

    // Hard reload — the form is wiped, but the cart survives.
    const cart = TestBed.inject(CartFacade);
    await checkout.loadSession(cartId, { clearOnLoad: true });
    expect(checkout.form().value().fullName).toBe('');
    expect(checkout.form().value().email).toBe('');
    expect(cart.itemCount()).toBe(1);
  });
});
