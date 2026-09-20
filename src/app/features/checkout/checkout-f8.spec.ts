/**
 * F8 regression pin: `applySession()` after a section PUT must NOT
 * reset the in-memory form fields that the snapshot omits.
 *
 * The mock's `updateDraft` merges only the supplied sections, so a
 * PUT that carries only `{ delivery }` returns a session whose
 * `paymentMethod` is absent. The previous `hydrateCheckoutFormModel`
 * unconditionally reset `paymentMethod` to `''`, which made the
 * follow-up `savePaymentMethod()` PUT send an empty string and
 * return 422 VALIDATION_ERROR — the wizard then dead-ended on
 * `/penztar/szallitas` and `router.navigate(['/penztar/ellenorzes'])`
 * never fired.
 *
 * Two test groups cover the fix from the inside (pure form model)
 * and the outside (full HTTP round-trip through
 * `saveDeliverySection` + `savePaymentMethod`):
 *
 *   - the pure hydrate tests prove `hydrateCheckoutFormModel` keeps
 *     the base `paymentMethod` / `deliveryOptionId` when the
 *     snapshot omits them;
 *   - the wire test proves that after `saveDeliverySection()` the
 *     in-memory paymentMethod survives the applySession rehydrate
 *     and the subsequent `savePaymentMethod()` returns 200 instead
 *     of 422.
 */
import '@angular/compiler';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RequestHandler } from 'msw';
import { server, useMswServer } from '../../../../tests/msw-server';

import { TestBed } from '@angular/core/testing';
import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { provideApiConfiguration as provideApiConfig } from '../../../app/api/generated/api-configuration';
import { demoSessionInterceptor } from '../../../app/core/api/demo-session.interceptor';

import {
  createInitialCheckoutFormModel,
  hydrateCheckoutFormModel,
} from '../../../app/features/checkout/checkout-form.model';

import { createHandlers } from '../../../mocks/create-handlers';
import { DEMO_PRODUCT } from '../../../mocks/cart/cart.handlers';
import { IdempotencyStore } from '../../../mocks/idempotency';
import { Repository as Repo } from '../../../mocks/repository';
import { createDeterministicIds, createFixedClock } from '../../../mocks/scenarios';

import '../../../mocks/cart/cart.handlers';
import '../../../mocks/checkout/checkout.handlers';
import '../../../mocks/payment/payment.handlers';
import '../../../mocks/orders/order.handlers';

import { CartFacade } from '../../../app/features/cart/cart.facade';
import { CheckoutFacade } from '../../../app/features/checkout/checkout.facade';

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

const BASE_URL = 'http://localhost/api/v1';
const VARIANT_G256 = 'demo-one-5g-graphite-256';

interface Environment {
  repository: Repo;
  clock: ReturnType<typeof createFixedClock>;
  ids: ReturnType<typeof createDeterministicIds>;
  scenario: { name: string; seed: number; clockOffsetMs: number; isolated: boolean };
}

function makeEnvironment(scenarioName = 'checkout-f8-suite'): Environment {
  const clock = createFixedClock(new Date(Date.parse('2026-09-15T09:00:00.000Z')).toISOString());
  const ids = createDeterministicIds(11);
  const scenario = {
    name: scenarioName,
    seed: 11,
    clockOffsetMs: 0,
    isolated: true,
  };
  const repo = new Repo(scenario, ids, clock);
  repo.loadProducts([DEMO_PRODUCT]);
  new IdempotencyStore(clock);
  return { repository: repo, clock, ids, scenario };
}

let currentEnvironment: Environment;

function buildHandlers(): readonly RequestHandler[] {
  return createHandlers({
    repository: currentEnvironment.repository,
    clock: currentEnvironment.clock,
    ids: currentEnvironment.ids,
    scenario: currentEnvironment.scenario,
    apiRoot: '/api/v1',
  });
}

beforeEach(() => {
  currentEnvironment = makeEnvironment();
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
      provideApiConfig(BASE_URL),
      provideRouter([]),
    ],
    teardown: { destroyAfterEach: true },
  });
}

function seedCartWithItem(): Promise<string> {
  return runInInjectionContext(TestBed.inject(EnvironmentInjector), async () => {
    const cart = TestBed.inject(CartFacade);
    await cart.ensureCart();
    await cart.addItem(VARIANT_G256, 1);
    const id = cart.cartId;
    if (id === null) {
      throw new Error('A seedCartWithItem lépés nem hozott létre kosarat.');
    }
    return id;
  });
}

describe('F8 — hydrateCheckoutFormModel preserves base when snapshot omits a section', () => {
  it('keeps paymentMethod from base when the snapshot has none', () => {
    const base = {
      ...createInitialCheckoutFormModel(),
      paymentMethod: 'demo_cod' as const,
    };
    const hydrated = hydrateCheckoutFormModel(base, {
      delivery: { optionId: 'home_delivery' },
    });
    expect(hydrated.paymentMethod).toBe('demo_cod');
  });

  it('keeps paymentMethod from base when the snapshot has null', () => {
    const base = {
      ...createInitialCheckoutFormModel(),
      paymentMethod: 'demo_card' as const,
    };
    const hydrated = hydrateCheckoutFormModel(base, {
      paymentMethod: null,
    });
    expect(hydrated.paymentMethod).toBe('demo_card');
  });

  it('keeps deliveryOptionId from base when the snapshot has no delivery', () => {
    const base = {
      ...createInitialCheckoutFormModel(),
      deliveryOptionId: 'home_delivery' as const,
    };
    const hydrated = hydrateCheckoutFormModel(base, {
      paymentMethod: 'demo_cod',
    });
    expect(hydrated.deliveryOptionId).toBe('home_delivery');
  });

  it('overwrites paymentMethod when the snapshot carries a real value', () => {
    const base = {
      ...createInitialCheckoutFormModel(),
      paymentMethod: 'demo_cod' as const,
    };
    const hydrated = hydrateCheckoutFormModel(base, {
      paymentMethod: 'demo_card',
    });
    expect(hydrated.paymentMethod).toBe('demo_card');
  });
});

describe('F8 — savePaymentMethod returns 200 after saveDeliverySection', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('keeps the in-memory paymentMethod across the delivery PUT', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cartId = await seedCartWithItem();
    await checkout.loadSession(cartId, { clearOnLoad: false });

    // Seed the contact so the wizard reaches the delivery step.
    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');
    const contactSave = await checkout.saveContactSection();
    expect(contactSave.ok).toBe(true);

    // Pick delivery + payment, fill the address.
    checkout.form.deliveryOptionId().value.set('home_delivery');
    checkout.form.address.postalCode().value.set('1111');
    checkout.form.address.city().value.set('Budapest');
    checkout.form.address.line1().value.set('Példa utca 1.');
    checkout.form.paymentMethod().value.set('demo_cod');

    const deliverySave = await checkout.saveDeliverySection();
    expect(deliverySave.ok).toBe(true);

    // The mock only merged the `delivery` section, so the returned
    // session has no `paymentMethod`. Before the F8 fix the hydrate
    // step wiped the form value back to '' and this assertion would
    // fail with the user's pick gone.
    expect(checkout.form().value().paymentMethod).toBe('demo_cod');
    expect(checkout.session()?.paymentMethod).toBeUndefined();

    const paymentSave = await checkout.savePaymentMethod();
    expect(paymentSave.ok).toBe(true);
    expect(checkout.session()?.paymentMethod).toBe('demo_cod');
  });
});
