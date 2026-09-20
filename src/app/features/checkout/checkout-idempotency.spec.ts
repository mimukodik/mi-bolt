/**
 * FIX-66 — one Idempotency-Key generator, and a key held per canonical
 * request fingerprint for `saveSection()` / `createQuote()` /
 * `createPaymentIntent()` (`FIX-61` already gives `commitOrder()` this
 * treatment; this file covers the three operations `FIX-61` left
 * unowned, `architecture.md:117`/`:121` and `openapi.yaml:628-635`).
 *
 * Each of the three sub-suites overrides the relevant mock endpoint
 * with a capturing handler (the same technique
 * `order-submission.spec.ts`'s "FIX-61" describe block uses for
 * `/orders`) so the assertion is purely "what header value did the
 * facade send", independent of the mock's own idempotency-replay
 * behaviour.
 *
 *   FIX-66-AC03 — saveSection(): same body -> same key; changed body
 *                 -> different key.
 *   FIX-66-AC04 — createQuote(): same cart version -> same key; a
 *                 version bump -> different key.
 *   FIX-66-AC05 — createPaymentIntent(): a transport failure (no
 *                 response) -> retry carries the SAME key; a
 *                 definitive (declined) response -> the next call
 *                 carries a DIFFERENT key.
 */
import '@angular/compiler';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse, http, type RequestHandler } from 'msw';
import { server, useMswServer } from '../../../../tests/msw-server';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  EnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideApiConfiguration as provideApiConfig } from '../../../app/api/generated/api-configuration';
import { demoSessionInterceptor } from '../../../app/core/api/demo-session.interceptor';

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

// The shared MSW server's lifecycle is registered here in case this
// file runs standalone; `useMswServer()` is idempotent across files
// within one worker (see `tests/msw-server.ts`).
useMswServer();

const BASE_URL = 'http://localhost/api/v1';
const VARIANT_G256 = 'demo-one-5g-graphite-256';

interface Environment {
  repository: Repo;
  clock: ReturnType<typeof createFixedClock>;
  ids: ReturnType<typeof createDeterministicIds>;
  scenario: { name: string; seed: number; clockOffsetMs: number; isolated: boolean };
}

function makeEnvironment(scenarioName = 'fix-66-suite'): Environment {
  const clock = createFixedClock(new Date(Date.parse('2026-09-15T10:00:00.000Z')).toISOString());
  const ids = createDeterministicIds(66);
  const scenario = { name: scenarioName, seed: 66, clockOffsetMs: 0, isolated: true };
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
    ],
    teardown: { destroyAfterEach: true },
  });
}

async function seedCartWithItem(): Promise<string> {
  return runInInjectionContext(TestBed.inject(EnvironmentInjector), async () => {
    const cart = TestBed.inject(CartFacade);
    await cart.ensureCart();
    await cart.addItem(VARIANT_G256, 1);
    const id = cart.cartId;
    if (id === null) throw new Error('cart id missing after seed');
    return id;
  });
}

// ---------------------------------------------------------------------------
// FIX-66-AC03 — saveSection() holds one key per canonical fingerprint.
// ---------------------------------------------------------------------------
describe('FIX-66-AC03 saveSection() holds the idempotency key per fingerprint', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('two saveContactSection() calls with an unchanged body carry the SAME key; a changed body carries a DIFFERENT one', async () => {
    const cartId = await seedCartWithItem();
    const checkout = TestBed.inject(CheckoutFacade);
    await checkout.loadSession(cartId, { clearOnLoad: false });

    const keys: string[] = [];
    server.use(
      http.put('*/api/v1/checkout/:cartId', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        return HttpResponse.json(
          { cartId, cartVersion: 1 },
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');

    const first = await checkout.saveContactSection();
    expect(first.ok).toBe(true);
    const second = await checkout.saveContactSection();
    expect(second.ok).toBe(true);

    expect(keys.length).toBe(2);
    expect(keys[0]).not.toBe('');
    expect(keys[0]).toBe(keys[1]);

    checkout.form.email().value.set('masik@example.test');
    const third = await checkout.saveContactSection();
    expect(third.ok).toBe(true);

    expect(keys.length).toBe(3);
    expect(keys[2]).not.toBe(keys[0]);
  });
});

// ---------------------------------------------------------------------------
// FIX-66-AC04 — createQuote() holds one key per (cartId, cartVersion).
// ---------------------------------------------------------------------------
describe('FIX-66-AC04 createQuote() holds the idempotency key while the cart version is unchanged', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('two createQuote() calls with an unchanged cart version carry the SAME key; a version bump carries a DIFFERENT one', async () => {
    const cartId = await seedCartWithItem();
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = TestBed.inject(CartFacade);
    await checkout.loadSession(cartId, { clearOnLoad: false });

    const keys: string[] = [];
    server.use(
      http.post('*/api/v1/checkout/:cartId/quote', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        return HttpResponse.json(
          {
            id: `quote-${String(keys.length)}`,
            cartId,
            cartVersion: cart.cart()?.version ?? 1,
            subtotal: { amount: 100, currency: 'HUF' },
            shipping: { amount: 0, currency: 'HUF' },
            total: { amount: 100, currency: 'HUF' },
            expiresAt: '2026-09-15T10:05:00.000Z',
          },
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const first = await checkout.createQuote();
    expect(first.ok).toBe(true);
    const second = await checkout.createQuote();
    expect(second.ok).toBe(true);

    expect(keys.length).toBe(2);
    expect(keys[0]).not.toBe('');
    expect(keys[0]).toBe(keys[1]);

    // Bump the cart version the same way a real mutation would.
    await cart.addItem(VARIANT_G256, 1);

    const third = await checkout.createQuote();
    expect(third.ok).toBe(true);

    expect(keys.length).toBe(3);
    expect(keys[2]).not.toBe(keys[0]);
  });
});

// ---------------------------------------------------------------------------
// FIX-66-AC05 — createPaymentIntent() holds the key ONLY across a
// transport failure; any definitive response (including a decline)
// clears it, per openapi.yaml:628-635.
// ---------------------------------------------------------------------------
describe('FIX-66-AC05 createPaymentIntent() key policy follows openapi.yaml, not the general rule', () => {
  beforeEach(() => {
    configureTestBed();
  });

  async function seedToQuoted(): Promise<{ checkout: CheckoutFacade; cartId: string }> {
    const cartId = await seedCartWithItem();
    const checkout = TestBed.inject(CheckoutFacade);
    await checkout.loadSession(cartId, { clearOnLoad: false });

    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');
    expect((await checkout.saveContactSection()).ok).toBe(true);

    checkout.form.deliveryOptionId().value.set('demo_pickup');
    expect((await checkout.saveDeliverySection()).ok).toBe(true);

    checkout.form.paymentMethod().value.set('demo_card');
    expect((await checkout.savePaymentMethod()).ok).toBe(true);

    expect((await checkout.createQuote()).ok).toBe(true);

    return { checkout, cartId };
  }

  it('a retry after a transport failure (no response received) carries the SAME key', async () => {
    const { checkout, cartId } = await seedToQuoted();

    const keys: string[] = [];
    let isFailNext = true;
    server.use(
      http.post('*/api/v1/payment-intents', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        if (isFailNext) {
          isFailNext = false;
          return HttpResponse.error();
        }
        return HttpResponse.json(
          {
            id: 'intent-1',
            cartId,
            quoteId: 'quote-1',
            amount: { amount: 100, currency: 'HUF' },
            isSimulation: true,
            status: 'succeeded',
          },
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const first = await checkout.createPaymentIntent();
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.error.status).toBe(0);

    const second = await checkout.createPaymentIntent();
    expect(second.ok).toBe(true);

    expect(keys.length).toBe(2);
    expect(keys[0]).not.toBe('');
    expect(keys[0]).toBe(keys[1]);
  });

  it('a call following a DECLINED (definitive) 201 response carries a DIFFERENT key from the call that produced the decline', async () => {
    const { checkout, cartId } = await seedToQuoted();

    const keys: string[] = [];
    server.use(
      http.post('*/api/v1/payment-intents', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        return HttpResponse.json(
          {
            id: `intent-${String(keys.length)}`,
            cartId,
            quoteId: 'quote-1',
            amount: { amount: 100, currency: 'HUF' },
            isSimulation: true,
            status: 'declined',
          },
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const first = await checkout.createPaymentIntent();
    expect(first.ok).toBe(true);
    const second = await checkout.createPaymentIntent();
    expect(second.ok).toBe(true);

    expect(keys.length).toBe(2);
    expect(keys[0]).not.toBe('');
    expect(keys[1]).not.toBe(keys[0]);
  });
});
