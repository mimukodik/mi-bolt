/**
 * MIM-212 — `DeliveryPage` spec on the 2.0.0 contract (S3-F2-3).
 *
 * Twelve cases that cover what the container `S3-C4` added: the
 * options load and its retry, the form seeded from the saved session,
 * the three gated section saves in order with their exact wire
 * payloads, and the failure banner that stops the sequence before the
 * navigation.
 *
 * The harness is facade spies, not MSW: every wire call the page
 * makes goes through `vi.spyOn(CheckoutFacade, ...)`, so no request
 * leaves the spec. Routing is spied the same way. The harness mirrors
 * `payment-return-page.spec.ts`'s provider list; the difference is
 * that this page makes wire-shaped calls only through the facade, so
 * every domain method under test is replaceable from the start.
 */

import '@angular/compiler';

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection, computed } from '@angular/core';
import { Router, provideRouter } from '@angular/router';

import { provideApiConfiguration } from '../../api/generated/api-configuration';
import { demoSessionInterceptor } from '../../core/api/demo-session.interceptor';

import { CheckoutFacade, type CheckoutError, type CheckoutResult } from './checkout.facade';
import { DeliveryPage } from './delivery-page';

import type { CheckoutOptions } from '../../api/generated/models/checkout-options';
import type { CheckoutSession } from '../../api/generated/models/checkout-session';
import type { CheckoutSummary } from '../../api/generated/models/checkout-summary';
import type { Contact } from '../../api/generated/models/contact';
import type { Money } from '../../api/generated/models/money';

const BASE_URL = 'http://localhost/api/v1';

const ZERO_MONEY: Money = { amount: 0, currency: 'HUF' };

const OPTIONS: CheckoutOptions = {
  deliveryOptions: [
    {
      id: 'home_delivery',
      label: 'Házhoz szállítás',
      description: 'Futárral, 1–2 munkanapon belül.',
      fee: { amount: 1490, currency: 'HUF' },
      requiresAddress: true,
      estimatedDays: 2,
      available: true,
    },
    {
      id: 'pickup_point',
      label: 'Átvételi pont',
      description: 'Csomagponton, 2–3 munkanapon belül.',
      estimatedDays: 3,
      fee: { amount: 990, currency: 'HUF' },
      requiresAddress: false,
      available: true,
    },
  ],
  paymentMethods: [
    {
      id: 'card',
      label: 'Bankkártya',
      description: 'Online kártyás fizetés.',
      fee: { amount: 0, currency: 'HUF' },
      available: true,
    },
    {
      id: 'cash_on_delivery',
      label: 'Utánvét',
      description: 'Készpénzzel vagy kártyával a futárnál.',
      fee: { amount: 490, currency: 'HUF' },
      available: true,
    },
  ],
  termsVersion: '2026-09',
};

const SAVED_CONTACT: Contact = {
  fullName: 'Teszt Elek',
  email: 'teszt@example.com',
  phone: '+36301234567',
};

interface HuAddress {
  countryCode: 'HU';
  postalCode: string;
  city: string;
  line1: string;
}

const SAVED_ADDRESS: HuAddress = {
  countryCode: 'HU',
  postalCode: '1051',
  city: 'Budapest',
  line1: 'Fő utca 1.',
};

const SAVED_BILLING_ADDRESS: HuAddress = {
  countryCode: 'HU',
  postalCode: '4024',
  city: 'Debrecen',
  line1: 'Kossuth utca 2.',
};

function buildSummary(): CheckoutSummary {
  return {
    subtotal: ZERO_MONEY,
    shippingFee: ZERO_MONEY,
    paymentFee: ZERO_MONEY,
    total: ZERO_MONEY,
  };
}

function buildFullSession(): CheckoutSession {
  return {
    version: 1,
    complete: true,
    summary: buildSummary(),
    contact: SAVED_CONTACT,
    delivery: { optionId: 'home_delivery', address: SAVED_ADDRESS },
    payment: { method: 'card' },
    billing: { name: 'Teszt Elek Billing', address: SAVED_BILLING_ADDRESS },
  };
}

function buildSessionWithContactOnly(): CheckoutSession {
  return {
    version: 1,
    complete: false,
    summary: buildSummary(),
    contact: SAVED_CONTACT,
  };
}

const CONFLICT_ERROR: CheckoutError = {
  code: 'CART_VERSION_CONFLICT',
  status: 412,
  detail: 'Version mismatch.',
  fieldErrors: [],
};

const UNKNOWN_ERROR: CheckoutError = {
  code: 'UNKNOWN',
  status: 500,
  detail: 'Network unreachable',
  fieldErrors: [],
};

afterEach(() => {
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
 * Stubs the options fetch with the given result. Must run BEFORE
 * `TestBed.createComponent`, because the constructor kicks the fetch
 * (delivery-page.ts:108-110).
 */
function pinEnsureOptions(result: CheckoutResult<CheckoutOptions>): void {
  const facade = TestBed.inject(CheckoutFacade);
  vi.spyOn(facade, 'ensureOptions').mockResolvedValue(result);
}

/** Mirrors `pinEnsureOptions`, but the promise never settles —
 *  the loading state survives past `detectChanges()` so DP-01 can
 *  assert it. */
function pinEnsureOptionsNever(): void {
  const facade = TestBed.inject(CheckoutFacade);
  const never = new Promise<CheckoutResult<CheckoutOptions>>(() => {
    /* never resolves */
  });
  vi.spyOn(facade, 'ensureOptions').mockReturnValue(never);
}

/**
 * Replaces the public `session` signal with one carrying the given
 * session. Must run BEFORE `TestBed.createComponent`, because the
 * page's `buildInitialModel()` reads it synchronously in its field
 * initialiser (delivery-page.ts:66, 200-232).
 */
function pinSession(session: CheckoutSession | null): void {
  const facade = TestBed.inject(CheckoutFacade);
  const fakeSignal = computed<CheckoutSession | null>(() => session);
  // `CheckoutFacade.session` is declared `readonly`, so direct
  // assignment is a TS error. `Object.defineProperty` bypasses the
  // readonly check; the field is configurable on the instance because
  // `useDefineForClassFields` is `true` under the project's
  // `target: ES2022`.
  Object.defineProperty(facade, 'session', {
    configurable: true,
    value: fakeSignal,
  });
}

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (raw instanceof HTMLElement) return raw;
  throw new Error('Expected HTMLElement');
}

function queryOne(parent: Element, selector: string): HTMLElement | null {
  const el = parent.querySelector(selector);
  if (el === null) return null;
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Expected HTMLElement matching "${selector}"`);
  }
  return el;
}

function queryAll(parent: Element, selector: string): HTMLElement[] {
  return Array.from(parent.querySelectorAll(selector)).filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  );
}

function createReady(options: CheckoutOptions = OPTIONS): ComponentFixture<DeliveryPage> {
  pinEnsureOptions({ ok: true, value: options });
  const fixture = TestBed.createComponent(DeliveryPage);
  fixture.detectChanges();
  // The constructor's `loadOptions(false)` returns synchronously here
  // through the spy's resolved value; the next microtask drains inside
  // `whenStable()`.
  void fixture.whenStable();
  return fixture;
}

async function createReadySettled(
  options: CheckoutOptions = OPTIONS,
): Promise<ComponentFixture<DeliveryPage>> {
  const fixture = createReady(options);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

async function createWithSession(
  session: CheckoutSession | null,
  options: CheckoutOptions = OPTIONS,
): Promise<ComponentFixture<DeliveryPage>> {
  pinEnsureOptions({ ok: true, value: options });
  pinSession(session);
  const fixture = TestBed.createComponent(DeliveryPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

/** Sets the six fields a "complete home delivery" model needs. */
function fillCompleteHomeDelivery(fixture: ComponentFixture<DeliveryPage>): void {
  const { fields } = fixture.componentInstance;
  fields.deliveryOptionId().value.set('home_delivery');
  fields.address.postalCode().value.set('1051');
  fields.address.city().value.set('Budapest');
  fields.address.line1().value.set('Fő utca 1.');
  fields.paymentMethod().value.set('card');
  fields.billingName().value.set('Teszt Elek Billing');
  fixture.detectChanges();
}

// ---------------------------------------------------------------------------
// DP-01..DP-02 — initial load and ready state
// ---------------------------------------------------------------------------

describe('DP-01..DP-02 initial load', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('DP-01 renders the loading placeholder until the options resolve', () => {
    pinEnsureOptionsNever();
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();

    expect(fixture.componentInstance.state().kind).toBe('loading');
    const root = getRootElement(fixture);
    const placeholders = queryAll(root, '[data-testid="delivery-loading"]');
    expect(placeholders).toHaveLength(1);
    expect(queryOne(root, 'app-delivery-step')).toBeNull();
  });

  it('DP-02 renders the delivery step once the options land', async () => {
    const fixture = await createReadySettled();

    expect(fixture.componentInstance.state().kind).toBe('ready');
    const root = getRootElement(fixture);
    expect(queryOne(root, '[data-testid="delivery-loading"]')).toBeNull();
    expect(queryOne(root, 'app-delivery-step')).not.toBeNull();
    // The page binds `[options]="readyOptions()"`, so the step's
    // input is the same object reference the spy returned.
    expect(fixture.componentInstance.readyOptions()).toEqual(OPTIONS);
  });
});

// ---------------------------------------------------------------------------
// DP-03..DP-04 — options load failure and its retry
// ---------------------------------------------------------------------------

describe('DP-03..DP-04 options load failure', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('DP-03 a failed options load renders the error state with a retry control and never picks a fallback option', async () => {
    pinEnsureOptions({ ok: false, error: UNKNOWN_ERROR });
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.state().kind).toBe('error');
    const root = getRootElement(fixture);
    const errorState = queryOne(root, 'app-error-state');
    expect(errorState).not.toBeNull();
    // The exact, hard-coded message the page renders for any
    // options-load failure (delivery-page.ts:99-126). Generic by
    // design (R15): the wire's own detail never reaches the DOM.
    expect(errorState?.textContent).toContain(
      'A szállítási és fizetési opciók betöltése sikertelen.',
    );
    expect(root.textContent).not.toContain('Network unreachable');
    expect(queryOne(root, 'app-delivery-step')).toBeNull();
    expect(fixture.componentInstance.readyOptions()).toBeNull();
  });

  it('DP-04 the error retry re-requests the options with force and reaches the ready state', async () => {
    let calls = 0;
    let lastForce: boolean | undefined;
    const facade = TestBed.inject(CheckoutFacade);
    vi.spyOn(facade, 'ensureOptions').mockImplementation((force?: boolean) => {
      calls += 1;
      lastForce = force;
      if (force === true) {
        return Promise.resolve({ ok: true, value: OPTIONS });
      }
      return Promise.resolve({ ok: false, error: UNKNOWN_ERROR });
    });

    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.state().kind).toBe('error');
    expect(calls).toBe(1);
    expect(lastForce).toBe(false);

    fixture.componentInstance.onRetry();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(calls).toBe(2);
    expect(lastForce).toBe(true);
    expect(fixture.componentInstance.state().kind).toBe('ready');
    const root = getRootElement(fixture);
    expect(queryOne(root, 'app-delivery-step')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DP-05..DP-06 — initial model seeded from the saved session
// ---------------------------------------------------------------------------

describe('DP-05..DP-06 initial model from session', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it("DP-05 the form model is seeded from the session's contact, delivery, payment and billing", async () => {
    const fixture = await createWithSession(buildFullSession());

    const { fields } = fixture.componentInstance;
    expect(fields.fullName().value()).toBe('Teszt Elek');
    expect(fields.email().value()).toBe('teszt@example.com');
    expect(fields.phone().value()).toBe('+36301234567');
    expect(fields.deliveryOptionId().value()).toBe('home_delivery');
    expect(fields.address.postalCode().value()).toBe('1051');
    expect(fields.address.city().value()).toBe('Budapest');
    expect(fields.address.line1().value()).toBe('Fő utca 1.');
    expect(fields.paymentMethod().value()).toBe('card');
    expect(fields.billingName().value()).toBe('Teszt Elek Billing');
    // The saved billing address (Debrecen) differs from the saved
    // delivery address (Budapest), so the checkbox starts unchecked.
    expect(fields.billingSameAsDelivery().value()).toBe(false);
  });

  it('DP-06 the billing name defaults to the contact full name when no billing section is saved', async () => {
    const fixture = await createWithSession(buildSessionWithContactOnly());

    const { fields } = fixture.componentInstance;
    // §6.2: the billing name is prefilled from the contact's fullName
    // so the user does not retype it on a fresh draft.
    expect(fields.billingName().value()).toBe('Teszt Elek');
    // No saved billing section → the billing-same-as-delivery checkbox
    // stays at its initial-model default of true.
    expect(fields.billingSameAsDelivery().value()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DP-13..DP-14 — the same-as-delivery tick comes back from the saved session
// ---------------------------------------------------------------------------

describe('DP-13..DP-14 same-as-delivery tick from the saved session', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('DP-13 a saved billing address equal to the saved home-delivery address restores the tick', async () => {
    const fixture = await createWithSession({
      ...buildFullSession(),
      billing: { name: 'Teszt Elek Billing', address: { ...SAVED_ADDRESS } },
    });

    const { fields } = fixture.componentInstance;
    expect(fields.billingSameAsDelivery().value()).toBe(true);
    const root = getRootElement(fixture);
    const checkbox = queryOne(root, '[data-testid="billing-same-as-delivery"]');
    if (!(checkbox instanceof HTMLInputElement))
      throw new Error('Expected the same-as-delivery checkbox');
    expect(checkbox.checked).toBe(true);
  });

  it('DP-14 pin: a saved billing section with a pickup-point delivery keeps the tick off and the saved billing address', async () => {
    // A pin, not a red-first test: the pickup variant carries no address,
    // so the home-delivery check in buildInitialModel is enforced by the
    // type system and the tick was off here before the change too. It
    // guards against a later rewrite that ticks the box without a
    // delivery address to compare.
    const fixture = await createWithSession({
      ...buildFullSession(),
      delivery: { optionId: 'pickup_point' },
      billing: { name: 'Teszt Elek Billing', address: { ...SAVED_ADDRESS } },
    });

    const { fields } = fixture.componentInstance;
    expect(fields.billingSameAsDelivery().value()).toBe(false);
    expect(fields.billingAddress.postalCode().value()).toBe('1051');
  });
});

// ---------------------------------------------------------------------------
// DP-07..DP-09 — the three gated section saves and their exact payloads
// ---------------------------------------------------------------------------

describe('DP-07..DP-09 gated section saves', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('DP-07 continuing saves delivery, payment and billing in that order and then navigates to the review step', async () => {
    const fixture = await createReadySettled();
    const facade = TestBed.inject(CheckoutFacade);
    const fullSession = buildFullSession();
    const updateDelivery = vi
      .spyOn(facade, 'updateDelivery')
      .mockResolvedValue({ ok: true, value: fullSession });
    const updatePayment = vi
      .spyOn(facade, 'updatePayment')
      .mockResolvedValue({ ok: true, value: fullSession });
    const updateBilling = vi
      .spyOn(facade, 'updateBilling')
      .mockResolvedValue({ ok: true, value: fullSession });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fillCompleteHomeDelivery(fixture);
    await fixture.componentInstance.onContinueRequested();
    fixture.detectChanges();

    expect(updateDelivery).toHaveBeenCalledTimes(1);
    expect(updatePayment).toHaveBeenCalledTimes(1);
    expect(updateBilling).toHaveBeenCalledTimes(1);

    const deliveryArg = updateDelivery.mock.calls[0]?.[0];
    expect(deliveryArg).toBeDefined();
    // Exact wire payload: `optionId`, the four-part address,
    // and no `line2` key (toWireAddress() omits an empty line2).
    // `toStrictEqual` enforces exact key sets — `toEqual` would
    // tolerate extra keys, which is why this matcher is used here.
    expect(deliveryArg).toStrictEqual({
      optionId: 'home_delivery',
      address: {
        countryCode: 'HU',
        postalCode: '1051',
        city: 'Budapest',
        line1: 'Fő utca 1.',
      },
    });

    // The container calls them sequentially and gates each one on
    // the previous result; `invocationCallOrder` is the cross-spy
    // monotonic index vitest assigns to each call.
    const deliveryOrder = updateDelivery.mock.invocationCallOrder[0] ?? 0;
    const paymentOrder = updatePayment.mock.invocationCallOrder[0] ?? 0;
    const billingOrder = updateBilling.mock.invocationCallOrder[0] ?? 0;
    const navigateOrder = navigate.mock.invocationCallOrder[0] ?? 0;
    expect(deliveryOrder).toBeLessThan(paymentOrder);
    expect(paymentOrder).toBeLessThan(billingOrder);
    expect(billingOrder).toBeLessThan(navigateOrder);

    expect(navigate).toHaveBeenCalledWith(['/penztar/ellenorzes']);
  });

  it('DP-15 a save sequence that lands after the page is gone does not navigate', async () => {
    const fixture = await createReadySettled();
    const facade = TestBed.inject(CheckoutFacade);
    const fullSession = buildFullSession();
    let releaseDelivery!: (value: CheckoutResult<CheckoutSession>) => void;
    const updateDelivery = vi.spyOn(facade, 'updateDelivery').mockImplementation(
      () =>
        new Promise<CheckoutResult<CheckoutSession>>((r) => {
          releaseDelivery = r;
        }),
    );
    const updatePayment = vi
      .spyOn(facade, 'updatePayment')
      .mockResolvedValue({ ok: true, value: fullSession });
    const updateBilling = vi
      .spyOn(facade, 'updateBilling')
      .mockResolvedValue({ ok: true, value: fullSession });
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fillCompleteHomeDelivery(fixture);
    const action = fixture.componentInstance.onContinueRequested();
    fixture.destroy();
    releaseDelivery({ ok: true, value: fullSession });
    await action;

    expect(updateDelivery).toHaveBeenCalledTimes(1);
    expect(updatePayment).toHaveBeenCalledTimes(1);
    expect(updateBilling).toHaveBeenCalledTimes(1);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('DP-08 a pickup selection sends no address key', async () => {
    const fixture = await createReadySettled();
    const facade = TestBed.inject(CheckoutFacade);
    const fullSession = buildFullSession();
    const updateDelivery = vi
      .spyOn(facade, 'updateDelivery')
      .mockResolvedValue({ ok: true, value: fullSession });
    const updatePayment = vi
      .spyOn(facade, 'updatePayment')
      .mockResolvedValue({ ok: true, value: fullSession });
    const updateBilling = vi
      .spyOn(facade, 'updateBilling')
      .mockResolvedValue({ ok: true, value: fullSession });
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const { fields } = fixture.componentInstance;
    fields.deliveryOptionId().value.set('pickup_point');
    fields.paymentMethod().value.set('card');
    fields.billingName().value.set('Teszt Elek Billing');
    fixture.detectChanges();

    await fixture.componentInstance.onContinueRequested();
    fixture.detectChanges();

    expect(updateDelivery).toHaveBeenCalledTimes(1);
    const arg = updateDelivery.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    // The exact wire payload for a pickup selection is
    // `{ optionId: 'pickup_point' }` — `optionId` and nothing else.
    expect(arg).toStrictEqual({ optionId: 'pickup_point' });
    // The other two writes also succeed; the brief's pin here is
    // exclusively on the delivery payload.
    expect(updatePayment).toHaveBeenCalledTimes(1);
    expect(updateBilling).toHaveBeenCalledTimes(1);
  });

  it('DP-09 same-as-delivery reuses the delivery address for billing, and unchecking it sends the billing address', async () => {
    // Subcase A: `billingSameAsDelivery` stays at the initial-model
    // default of true, with home delivery.
    const fixtureA = await createReadySettled();
    const facadeA = TestBed.inject(CheckoutFacade);
    const fullSession = buildFullSession();
    const billingA = vi
      .spyOn(facadeA, 'updateBilling')
      .mockResolvedValue({ ok: true, value: fullSession });
    vi.spyOn(facadeA, 'updateDelivery').mockResolvedValue({ ok: true, value: fullSession });
    vi.spyOn(facadeA, 'updatePayment').mockResolvedValue({ ok: true, value: fullSession });
    const routerA = TestBed.inject(Router);
    vi.spyOn(routerA, 'navigate').mockResolvedValue(true);

    {
      const fields = fixtureA.componentInstance.fields;
      fields.deliveryOptionId().value.set('home_delivery');
      fields.address.postalCode().value.set('1051');
      fields.address.city().value.set('Budapest');
      fields.address.line1().value.set('Fő utca 1.');
      fields.paymentMethod().value.set('card');
      fields.billingName().value.set('Teszt Elek Billing');
      // `billingSameAsDelivery` stays at the initial-model default
      // (true) — the literal set would just be noise.
      fixtureA.detectChanges();

      await fixtureA.componentInstance.onContinueRequested();
      fixtureA.detectChanges();
    }

    expect(billingA).toHaveBeenCalledTimes(1);
    const argA = billingA.mock.calls[0]?.[0];
    expect(argA).toEqual({
      name: 'Teszt Elek Billing',
      address: { countryCode: 'HU', postalCode: '1051', city: 'Budapest', line1: 'Fő utca 1.' },
    });

    // Subcase B: same setup with the checkbox unchecked and a
    // distinct billing address. Both fixtures share the root-scoped
    // facade, and vi.spyOn on an already mocked method returns the
    // same mock, so subcase A's call is cleared before B runs.
    billingA.mockClear();
    const fixtureB = await createReadySettled();
    const facadeB = TestBed.inject(CheckoutFacade);
    const billingB = vi
      .spyOn(facadeB, 'updateBilling')
      .mockResolvedValue({ ok: true, value: fullSession });
    vi.spyOn(facadeB, 'updateDelivery').mockResolvedValue({ ok: true, value: fullSession });
    vi.spyOn(facadeB, 'updatePayment').mockResolvedValue({ ok: true, value: fullSession });

    {
      const fields = fixtureB.componentInstance.fields;
      fields.deliveryOptionId().value.set('home_delivery');
      fields.address.postalCode().value.set('1051');
      fields.address.city().value.set('Budapest');
      fields.address.line1().value.set('Fő utca 1.');
      fields.paymentMethod().value.set('card');
      fields.billingName().value.set('Teszt Elek Billing');
      fields.billingSameAsDelivery().value.set(false);
      fields.billingAddress.postalCode().value.set('4024');
      fields.billingAddress.city().value.set('Debrecen');
      fields.billingAddress.line1().value.set('Kossuth utca 2.');
      fixtureB.detectChanges();

      await fixtureB.componentInstance.onContinueRequested();
      fixtureB.detectChanges();
    }

    expect(billingB).toHaveBeenCalledTimes(1);
    const argB = billingB.mock.calls[0]?.[0];
    expect(argB).toEqual({
      name: 'Teszt Elek Billing',
      address: {
        countryCode: 'HU',
        postalCode: '4024',
        city: 'Debrecen',
        line1: 'Kossuth utca 2.',
      },
    });
  });
});

// ---------------------------------------------------------------------------
// DP-10..DP-11 — failures and the gated sequence
// ---------------------------------------------------------------------------

describe('DP-10..DP-11 save failures', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('DP-10 a failed delivery save renders the failure banner, calls neither updatePayment nor updateBilling, and does not navigate', async () => {
    const fixture = await createReadySettled();
    const facade = TestBed.inject(CheckoutFacade);
    vi.spyOn(facade, 'updateDelivery').mockResolvedValue({
      ok: false,
      error: CONFLICT_ERROR,
    });
    const paymentSpy = vi.spyOn(facade, 'updatePayment');
    const billingSpy = vi.spyOn(facade, 'updateBilling');
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fillCompleteHomeDelivery(fixture);
    await fixture.componentInstance.onContinueRequested();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(queryOne(root, '[data-testid="delivery-save-failure-detail"]')).not.toBeNull();
    expect(paymentSpy).not.toHaveBeenCalled();
    expect(billingSpy).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.saveState()).toBe('error');
  });

  it('DP-11 a failed payment save stops before the billing save, and a failed billing save still does not navigate', async () => {
    // Subcase A: updatePayment failing → updateBilling is never called
    // and `navigate` is never called.
    const fixtureA = await createReadySettled();
    const facadeA = TestBed.inject(CheckoutFacade);
    const fullSession = buildFullSession();
    vi.spyOn(facadeA, 'updateDelivery').mockResolvedValue({ ok: true, value: fullSession });
    vi.spyOn(facadeA, 'updatePayment').mockResolvedValue({
      ok: false,
      error: CONFLICT_ERROR,
    });
    const billingA = vi.spyOn(facadeA, 'updateBilling');
    const routerA = TestBed.inject(Router);
    const navigateA = vi.spyOn(routerA, 'navigate').mockResolvedValue(true);

    fillCompleteHomeDelivery(fixtureA);
    await fixtureA.componentInstance.onContinueRequested();
    fixtureA.detectChanges();

    expect(billingA).not.toHaveBeenCalled();
    expect(navigateA).not.toHaveBeenCalled();
    const rootA = getRootElement(fixtureA);
    expect(queryOne(rootA, '[data-testid="delivery-save-failure-detail"]')).not.toBeNull();

    // Subcase B: updateBilling failing → `navigate` is never called,
    // but the banner IS rendered.
    const fixtureB = await createReadySettled();
    const facadeB = TestBed.inject(CheckoutFacade);
    vi.spyOn(facadeB, 'updateDelivery').mockResolvedValue({ ok: true, value: fullSession });
    vi.spyOn(facadeB, 'updatePayment').mockResolvedValue({ ok: true, value: fullSession });
    vi.spyOn(facadeB, 'updateBilling').mockResolvedValue({
      ok: false,
      error: CONFLICT_ERROR,
    });
    const routerB = TestBed.inject(Router);
    const navigateB = vi.spyOn(routerB, 'navigate').mockResolvedValue(true);

    fillCompleteHomeDelivery(fixtureB);
    await fixtureB.componentInstance.onContinueRequested();
    fixtureB.detectChanges();

    expect(navigateB).not.toHaveBeenCalled();
    const rootB = getRootElement(fixtureB);
    expect(queryOne(rootB, '[data-testid="delivery-save-failure-detail"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DP-12 — failure banner wording and the retry-clears-it path
// ---------------------------------------------------------------------------

describe('DP-12 failure banner wording and retry', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it("DP-12 the failure banner carries the wire detail plus the fixed reassurance sentence, and the step's retry clears it", async () => {
    // Subcase A: detail present — wire detail is followed by the
    // single-space-padded reassurance sentence.
    const fixtureA = await createReadySettled();
    const facadeA = TestBed.inject(CheckoutFacade);
    vi.spyOn(facadeA, 'updateDelivery').mockResolvedValue({
      ok: false,
      error: CONFLICT_ERROR,
    });
    vi.spyOn(facadeA, 'updatePayment');
    vi.spyOn(facadeA, 'updateBilling');
    // Pin the options-load response so subcase C's `loadOptions(true)`
    // reaches a settled result deterministically. Without this the
    // spy would call through to the original `ensureOptions`, which
    // would attempt a wire request the harness does not stand up.
    const ensureSpyA = vi
      .spyOn(facadeA, 'ensureOptions')
      .mockResolvedValue({ ok: true, value: OPTIONS });

    fillCompleteHomeDelivery(fixtureA);
    await fixtureA.componentInstance.onContinueRequested();
    fixtureA.detectChanges();

    const rootA = getRootElement(fixtureA);
    const bannerA = queryOne(rootA, '[data-testid="delivery-save-failure-detail"]');
    if (bannerA === null) {
      throw new Error('DP-12 expected the failure banner in subcase A');
    }
    expect(bannerA.textContent.trim()).toBe(
      'Version mismatch. A kosarad és az adataid megmaradtak. Próbáld újra.',
    );

    // Subcase B: empty detail → just the reassurance sentence.
    const fixtureB = await createReadySettled();
    const facadeB = TestBed.inject(CheckoutFacade);
    vi.spyOn(facadeB, 'updateDelivery').mockResolvedValue({
      ok: false,
      error: {
        code: 'CART_VERSION_CONFLICT',
        status: 412,
        detail: '',
        fieldErrors: [],
      },
    });
    vi.spyOn(facadeB, 'updatePayment');
    vi.spyOn(facadeB, 'updateBilling');

    fillCompleteHomeDelivery(fixtureB);
    await fixtureB.componentInstance.onContinueRequested();
    fixtureB.detectChanges();

    const rootB = getRootElement(fixtureB);
    const bannerB = queryOne(rootB, '[data-testid="delivery-save-failure-detail"]');
    if (bannerB === null) {
      throw new Error('DP-12 expected the failure banner in subcase B');
    }
    expect(bannerB.textContent.trim()).toBe('A kosarad és az adataid megmaradtak. Próbáld újra.');

    // Subcase C: emitting `retryOptions` from the step clears the
    // stale banner and re-requests options with force.
    const callsBefore = ensureSpyA.mock.calls.length;
    fixtureA.componentInstance.onRetryOptions();
    await fixtureA.whenStable();
    fixtureA.detectChanges();

    expect(fixtureA.componentInstance.saveFailure()).toBeNull();
    expect(fixtureA.componentInstance.saveState()).toBe('idle');
    const rootC = getRootElement(fixtureA);
    expect(queryOne(rootC, '[data-testid="delivery-save-failure-detail"]')).toBeNull();
    expect(ensureSpyA.mock.calls.length).toBe(callsBefore + 1);
    expect(ensureSpyA.mock.calls[ensureSpyA.mock.calls.length - 1][0]).toBe(true);
  });
});
