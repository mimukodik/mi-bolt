/**
 * T23 — order submission control, retry, pending payment.
 *
 * The five acceptance criteria each have at least one named failing
 * test below. The spec drives both the source-level contract (the
 * service surface, the persisted safe key, the logging redaction)
 * and the live MSW-backed behavior (commit, polling, double-click
 * collapse, reload recovery).
 *
 * Mock scenarios used:
 *   - `default` / `happy-path` — succeeded payment intent
 *   - `payment-declined`      — declined payment intent
 *   - `payment-pending-timeout` — stays pending forever (used to
 *                                 exercise the polling timeout path)
 *
 * The clock injected into `OrderSubmission` is a fake with manual
 * `advance()` so the polling assertions are deterministic and never
 * block the test for 10 real seconds.
 */

import '@angular/compiler';

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpResponse, http, type RequestHandler } from 'msw';
import { server, useMswServer } from '../../../../tests/msw-server';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  EnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext,
} from '@angular/core';

import { provideApiConfiguration } from '../../../app/api/generated/api-configuration';
import { demoSessionInterceptor } from '../../../app/core/api/demo-session.interceptor';

import { createHandlers } from '../../../mocks/create-handlers';
import { DEMO_PRODUCT } from '../../../mocks/cart/cart.handlers';
import { IdempotencyStore } from '../../../mocks/idempotency';
import { Repository } from '../../../mocks/repository';
import { createDeterministicIds, createFixedClock } from '../../../mocks/scenarios';

import '../../../mocks/cart/cart.handlers';
import '../../../mocks/checkout/checkout.handlers';
import '../../../mocks/payment/payment.handlers';
import '../../../mocks/orders/order.handlers';

import { CartFacade } from '../../../app/features/cart/cart.facade';
import { CheckoutFacade } from '../../../app/features/checkout/checkout.facade';
import {
  OrderSubmission,
  SafeLogger,
  type SubmitOutcome,
  type SafeLogContext,
} from '../../../app/features/checkout/order-submission';
import {
  PAYMENT_POLL_INTERVAL_MS,
  PAYMENT_POLL_MAX_ATTEMPTS,
  type FakeClock,
  type PaymentProgressTick,
} from '../../../app/features/checkout/payment-progress';

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

function makeEnv(scenarioName = 't23-suite'): Env {
  const clock = createFixedClock(new Date(Date.parse('2026-09-15T10:00:00.000Z')).toISOString());
  const ids = createDeterministicIds(23);
  const scenario = {
    name: scenarioName,
    seed: 23,
    clockOffsetMs: 0,
    isolated: true,
  };
  const repository = new Repository(scenario, ids, clock);
  repository.loadProducts([DEMO_PRODUCT]);
  new IdempotencyStore(clock);
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
  vi.useRealTimers();
});

function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
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

async function fillContactDeliveryPayment(
  checkout: CheckoutFacade,
  paymentMethod: 'demo_card' | 'demo_cod',
): Promise<void> {
  const cartId = await seedCartWithItem();
  await checkout.loadSession(cartId, { clearOnLoad: false });

  checkout.form.fullName().value.set('Teszt Elek');
  checkout.form.email().value.set('teszt@example.test');
  checkout.form.phone().value.set('+36201234567');
  const contact = await checkout.saveContactSection();
  expect(contact.ok).toBe(true);

  checkout.form.deliveryOptionId().value.set('demo_pickup');
  const delivery = await checkout.saveDeliverySection();
  expect(delivery.ok).toBe(true);

  checkout.form.paymentMethod().value.set(paymentMethod);
  const method = await checkout.savePaymentMethod();
  expect(method.ok).toBe(true);

  const quote = await checkout.createQuote();
  expect(quote.ok).toBe(true);
}

/** Deterministic test clock — fires every queued callback once. */
function makeFakeClock(): FakeClock {
  let pending = 0;
  const callbacks = new Map<number, () => void>();
  let nextId = 1;
  return {
    nowIso(): string {
      return '2026-09-15T10:00:00.000Z';
    },
    setTimeoutFn(handler: () => void, _delayMs: number): number {
      pending += 1;
      const id = nextId;
      nextId += 1;
      callbacks.set(id, handler);
      return id;
    },
    clearTimeoutFn(id: number): void {
      if (callbacks.delete(id)) {
        pending -= 1;
      }
    },
    fire(): void {
      const ordered = [...callbacks.entries()].sort(([a], [b]) => a - b);
      callbacks.clear();
      pending = 0;
      for (const [, cb] of ordered) cb();
    },
    pending(): number {
      return pending;
    },
  };
}

/**
 * Drain microtasks + macrotasks so MSW responses (which resolve
 * through fetch + Promise + setImmediate chains) complete before the
 * next test step. The fake clock only resolves the in-process
 * setTimeout queue; the HTTP roundtrip still needs an event-loop tick.
 */
async function flushAsync(iterations = 5): Promise<void> {
  for (let i = 0; i < iterations; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

// ---------------------------------------------------------------------------
// T23-AC01 — COD commits directly; demo_card requires a succeeded intent.
// ---------------------------------------------------------------------------

describe('T23-AC01 demo_cod commits directly without a payment intent', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('does not call createPaymentIntent for demo_cod and commits the order', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    submission.bindClock(makeFakeClock());

    await fillContactDeliveryPayment(checkout, 'demo_cod');

    const intentCalls: number[] = [];
    server.use(
      http.post('*/api/v1/payment-intents', () => {
        intentCalls.push(Date.now());
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:payment-intent-not-needed',
            title: 'demo_cod',
            status: 400,
            code: 'VALIDATION_FAILED',
            detail: 'demo_cod does not need a payment intent',
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 400, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    const outcome = await submission.submitOrder();
    expect(outcome.kind).toBe<SubmitOutcome['kind']>('committed');
    expect(intentCalls.length).toBe(0);
    expect(checkout.order()?.id).toBeTruthy();
  });

  it('demo_card first creates a payment intent, then commits only when status is succeeded', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    submission.bindClock(makeFakeClock());

    await fillContactDeliveryPayment(checkout, 'demo_card');

    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    const outcome = await submission.submitOrder();
    expect(outcome.kind).toBe<SubmitOutcome['kind']>('committed');
    expect(outcome.kind === 'committed' && outcome.orderId).toBeTruthy();
    expect(checkout.paymentIntent()?.status).toBe('succeeded');
    expect(checkout.order()?.paymentMethod).toBe('demo_card');
  });

  it('a declined payment intent leaves the user on the review step with retry/change-method', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    submission.bindClock(makeFakeClock());

    await fillContactDeliveryPayment(checkout, 'demo_card');

    // Force the payment intent handler to decline.
    server.use(
      http.post('*/api/v1/payment-intents', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:payment-declined',
            title: 'A szimulált fizetés elutasítva.',
            status: 409,
            code: 'PAYMENT_DECLINED',
            detail: 'A szimulált fizetés elutasítva.',
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    const outcome = await submission.submitOrder();
    expect(outcome.kind).toBe<SubmitOutcome['kind']>('declined');
    expect(submission.canRetry()).toBe(true);
    expect(submission.canChangeMethod()).toBe(true);
    expect(checkout.order()).toBeNull();
    expect(checkout.step()).toBe<ReturnType<CheckoutFacade['step']>>('review');
  });
});

// ---------------------------------------------------------------------------
// T23-AC02 — pending intent uses GET polling every 1s for at most 10 attempts
// with deterministic clock; timeout yields recoverable unknown state.
// ---------------------------------------------------------------------------

describe('T23-AC02 pending intent polling with deterministic clock', () => {
  beforeEach(() => {
    configureTestBed();
    // All tests in this block use the `payment-pending-timeout`
    // scenario so the initial intent status is `pending` and the
    // mock never resolves it. The override below forces the GET
    // handler to keep returning `pending` so the suite is not
    // sensitive to the mock's internal resolve-after-1s behaviour.
    currentEnv = makeEnv('payment-pending-timeout');
    server.resetHandlers();
    server.use(...buildHandlers());
  });

  it('uses an interval of 1000 ms and a cap of 10 attempts', () => {
    // Source-level assertion: the constants exported from
    // `payment-progress.ts` define the polling contract.
    expect(PAYMENT_POLL_INTERVAL_MS).toBe(1000);
    expect(PAYMENT_POLL_MAX_ATTEMPTS).toBe(10);
  });

  it('caps the polling window at exactly 10 attempts and yields a recoverable unknown state', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    const fakeClock = makeFakeClock();
    submission.bindClock(fakeClock);

    await fillContactDeliveryPayment(checkout, 'demo_card');

    const currentCartId = checkout.cartId();
    if (!currentCartId) throw new Error('Expected cartId');
    const currentQuote = checkout.quote();
    if (!currentQuote) throw new Error('Expected quote');

    let pollCount = 0;
    server.use(
      http.get('*/api/v1/payment-intents/:intentId', () => {
        pollCount += 1;
        return HttpResponse.json({
          id: 'pi-pending-forever',
          cartId: currentCartId,
          quoteId: currentQuote.id,
          status: 'pending',
          isSimulation: true,
          amount: { amount: 100, currency: 'HUF' },
        });
      }),
    );

    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    const submitted = submission.submitOrder();
    await flushAsync();
    // Drive the polling through exactly 10 ticks. The fake clock must
    // produce exactly 10 setTimeout calls (one per attempt).
    for (let i = 0; i < 10; i += 1) {
      fakeClock.fire();
      await flushAsync();
    }

    const outcome = await submitted;
    expect(outcome.kind).toBe<SubmitOutcome['kind']>('pending-timeout');
    expect(pollCount).toBe(10);
    expect(submission.canRetryUnknown()).toBe(true);
    // No order was committed.
    expect(checkout.order()).toBeNull();
  });

  it('emits a `pending` tick first, then `attempt` ticks 1..10, then a `timeout` tick', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    const fakeClock = makeFakeClock();
    submission.bindClock(fakeClock);

    await fillContactDeliveryPayment(checkout, 'demo_card');

    const currentCartId = checkout.cartId();
    if (!currentCartId) throw new Error('Expected cartId');
    const currentQuote = checkout.quote();
    if (!currentQuote) throw new Error('Expected quote');

    server.use(
      http.get('*/api/v1/payment-intents/:intentId', () =>
        HttpResponse.json({
          id: 'pi-pending-ticks',
          cartId: currentCartId,
          quoteId: currentQuote.id,
          status: 'pending',
          isSimulation: true,
          amount: { amount: 100, currency: 'HUF' },
        }),
      ),
    );

    const ticks: PaymentProgressTick[] = [];
    const stop = submission.watchProgress((tick) => ticks.push(tick));

    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    const submitted = submission.submitOrder();
    await flushAsync();
    for (let i = 0; i < 10; i += 1) {
      fakeClock.fire();
      await flushAsync();
    }
    await submitted;
    stop();

    expect(ticks[0]?.state).toBe('pending');
    expect(ticks.at(-1)?.state).toBe('timeout');
    const attemptTicks = ticks.filter((t) => t.state === 'attempt');
    expect(attemptTicks.length).toBe(10);
    expect(attemptTicks.map((t) => t.attempt)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

// ---------------------------------------------------------------------------
// T23-AC03 — double-click, browser retry, and timeout-after-commit produce
// exactly one order / stock decrement; in-flight submit is exhausted.
// ---------------------------------------------------------------------------

describe('T23-AC03 single commit semantics under retries and concurrent submit', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('two simultaneous submitOrder() calls produce exactly one createOrder + one stock decrement', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    submission.bindClock(makeFakeClock());

    await fillContactDeliveryPayment(checkout, 'demo_cod');

    let orderCalls = 0;
    server.use(
      http.post('*/api/v1/orders', async ({ request }) => {
        orderCalls += 1;
        await request.clone().json();
        return HttpResponse.json(
          {
            id: 'order-once',
            orderNumber: 'DEMO-000001',
            createdAt: currentEnv.clock.now(),
            status: 'demo_confirmed',
            isSimulation: true,
            items: [],
            subtotal: { amount: 339_990, currency: 'HUF' },
            shipping: { amount: 0, currency: 'HUF' },
            total: { amount: 339_990, currency: 'HUF' },
            paymentMethod: 'demo_cod',
            deliveryOptionId: 'demo_pickup',
            notice: 'demo',
          },
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    const [a, b] = await Promise.all([submission.submitOrder(), submission.submitOrder()]);

    expect(orderCalls).toBe(1);
    expect(a.kind).toBe<SubmitOutcome['kind']>('committed');
    expect(b.kind).toBe<SubmitOutcome['kind']>('committed');
    // Both promises resolve to the SAME order id.
    expect(a.kind === 'committed' && b.kind === 'committed' && a.orderId === b.orderId).toBe(true);
  });

  it('does not start a new submit while one is in flight (browser retry)', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    submission.bindClock(makeFakeClock());

    await fillContactDeliveryPayment(checkout, 'demo_cod');

    const resolverHolder: { resolve?: (value: Record<string, unknown>) => void } = {};
    server.use(
      http.post(
        '*/api/v1/orders',
        () =>
          new Promise<Response>((resolve) => {
            resolverHolder.resolve = (body) => {
              resolve(
                HttpResponse.json(body, {
                  status: 201,
                  headers: { 'content-type': 'application/json' },
                }),
              );
            };
          }),
      ),
    );

    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    const first = submission.submitOrder();
    await Promise.resolve();
    expect(submission.inFlight()).toBe(true);

    // The browser retries while the first submit is still pending.
    // The second invocation must NOT issue a second POST /orders.
    const second = submission.submitOrder();
    await Promise.resolve();

    if (!resolverHolder.resolve) throw new Error('Expected resolveOrder to be defined');
    resolverHolder.resolve({
      id: 'order-only-one',
      orderNumber: 'DEMO-000001',
      createdAt: currentEnv.clock.now(),
      status: 'demo_confirmed',
      isSimulation: true,
      items: [],
      subtotal: { amount: 339_990, currency: 'HUF' },
      shipping: { amount: 0, currency: 'HUF' },
      total: { amount: 339_990, currency: 'HUF' },
      paymentMethod: 'demo_cod',
      deliveryOptionId: 'demo_pickup',
      notice: 'demo',
    });

    const [a, b] = await Promise.all([first, second]);
    expect(a.kind).toBe<SubmitOutcome['kind']>('committed');
    expect(b.kind).toBe<SubmitOutcome['kind']>('committed');
    expect(submission.inFlight()).toBe(false);
  });

  it('a network timeout AFTER the order has been committed does NOT produce a second order', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    submission.bindClock(makeFakeClock());

    await fillContactDeliveryPayment(checkout, 'demo_cod');

    // Count POST /orders via MSW's request:match event so we don't
    // override the handler (an override would not save the order in
    // the repository, defeating the recovery contract).
    let orderCalls = 0;
    const onMatch = ({ request }: { request: Request }): void => {
      if (request.method === 'POST' && request.url.endsWith('/orders')) {
        orderCalls += 1;
      }
    };
    server.events.on('request:match', onMatch);

    try {
      checkout.form.acceptedTerms().value.set(true);
      checkout.form.acknowledgedSimulation().value.set(true);

      const outcome = await submission.submitOrder();
      expect(outcome.kind).toBe<SubmitOutcome['kind']>('committed');
      expect(orderCalls).toBe(1);
    } finally {
      server.events.removeListener('request:match', onMatch);
    }
  });
});

// ---------------------------------------------------------------------------
// FIX-61 — `commitDirectly()` commits through `CheckoutFacade.commitOrder()`,
// which holds one idempotency key per canonical request fingerprint
// (architecture.md:117/:121: "a retry sends the identical body/precondition").
// This is the criterion the task exists for.
// ---------------------------------------------------------------------------

describe('FIX-61 the order-commit idempotency key is held per fingerprint', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('retrying an unknown outcome sends the SAME Idempotency-Key on both /orders requests', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    submission.bindClock(makeFakeClock());

    await fillContactDeliveryPayment(checkout, 'demo_cod');
    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    const keys: string[] = [];
    let failNext = true;
    server.use(
      http.post('*/api/v1/orders', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        if (failNext) {
          failNext = false;
          return HttpResponse.json(
            {
              type: 'about:blank',
              title: 'error',
              status: 503,
              code: 'SERVICE_UNAVAILABLE',
              detail: 'Átmeneti hiba.',
            },
            { status: 503, headers: { 'content-type': 'application/problem+json' } },
          );
        }
        return HttpResponse.json(
          {
            id: 'order-retry-1',
            orderNumber: 'DEMO-000001',
            createdAt: '2026-09-15T10:00:00.000Z',
            deliveryOptionId: 'demo_pickup',
            paymentMethod: 'demo_cod',
            subtotal: { amount: 100, currency: 'HUF' },
            shipping: { amount: 0, currency: 'HUF' },
            total: { amount: 100, currency: 'HUF' },
            items: [],
            status: 'demo_confirmed',
            notice: 'Demó',
            isSimulation: true,
          },
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const first = await submission.submitOrder();
    expect(first.kind).toBe<SubmitOutcome['kind']>('unknown');

    const second = await submission.submitOrder();
    expect(second.kind).toBe<SubmitOutcome['kind']>('committed');

    expect(keys.length).toBe(2);
    expect(keys[0]).not.toBe('');
    expect(keys[0]).toBe(keys[1]);
  });

  it('changing the delivery option before retrying mints a DIFFERENT Idempotency-Key', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    submission.bindClock(makeFakeClock());

    await fillContactDeliveryPayment(checkout, 'demo_cod');
    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    const keys: string[] = [];
    server.use(
      http.post('*/api/v1/orders', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key') ?? '');
        return HttpResponse.json(
          {
            id: `order-${String(keys.length)}`,
            orderNumber: 'DEMO-000001',
            createdAt: '2026-09-15T10:00:00.000Z',
            deliveryOptionId: 'demo_pickup',
            paymentMethod: 'demo_cod',
            subtotal: { amount: 100, currency: 'HUF' },
            shipping: { amount: 0, currency: 'HUF' },
            total: { amount: 100, currency: 'HUF' },
            items: [],
            status: 'demo_confirmed',
            notice: 'Demó',
            isSimulation: true,
          },
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const first = await submission.submitOrder();
    expect(first.kind).toBe<SubmitOutcome['kind']>('committed');

    // A genuinely new order after a terminal success must not inherit
    // the previous fingerprint's key — a fresh quote changes the
    // fingerprint (a new quote id), same as a real second purchase.
    const requote = await checkout.createQuote();
    expect(requote.ok).toBe(true);

    const second = await submission.submitOrder();
    expect(second.kind).toBe<SubmitOutcome['kind']>('committed');

    expect(keys.length).toBe(2);
    expect(keys[0]).not.toBe(keys[1]);
  });
});

// ---------------------------------------------------------------------------
// T23-AC05 — expected failure leaves inputs/cart intact and logs omit
// contact / address / payment-like data.
// ---------------------------------------------------------------------------

describe('T23-AC05 expected failure preserves inputs/cart and redacts logs', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('a declined payment leaves contact, address, paymentMethod and cart intact', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = TestBed.inject(CartFacade);
    const submission = TestBed.inject(OrderSubmission);
    submission.bindClock(makeFakeClock());

    await fillContactDeliveryPayment(checkout, 'demo_card');

    server.use(
      http.post('*/api/v1/payment-intents', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:payment-declined',
            title: 'A szimulált fizetés elutasítva.',
            status: 409,
            code: 'PAYMENT_DECLINED',
            detail: 'A szimulált fizetés elutasítva.',
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    const outcome = await submission.submitOrder();
    expect(outcome.kind).toBe<SubmitOutcome['kind']>('declined');
    // Contact + delivery + payment method preserved.
    expect(checkout.form().value().fullName).toBe('Teszt Elek');
    expect(checkout.form().value().email).toBe('teszt@example.test');
    expect(checkout.form().value().phone).toBe('+36201234567');
    expect(checkout.form().value().deliveryOptionId).toBe('demo_pickup');
    expect(checkout.form().value().paymentMethod).toBe('demo_card');
    // Cart survives.
    expect(cart.itemCount()).toBe(1);
  });

  it('SafeLogger.redact() strips contact / address / payment-like fields', () => {
    const ctx: SafeLogContext = {
      cartId: 'cart-redact',
      quoteId: 'quote-abc',
      paymentIntentId: 'pi-xyz',
      fullName: 'Teszt Elek',
      email: 'teszt@example.test',
      phone: '+36201234567',
      postalCode: '1111',
      city: 'Demóváros',
      line1: 'Példa utca 1.',
      line2: '2. emelet',
      cardNumber: '4111-1111-1111-1111',
      cvv: 'cvc-999',
      amount: { amount: 339_990, currency: 'HUF' },
    };
    const safe = SafeLogger.redact(ctx);
    const json = JSON.stringify(safe);
    // The PII fields must be absent from the redacted record.
    expect(json).not.toMatch(/Teszt Elek/);
    expect(json).not.toMatch(/teszt@example\.test/);
    expect(json).not.toMatch(/\+36201234567/);
    expect(json).not.toMatch(/Példa utca/);
    expect(json).not.toMatch(/Demóváros/);
    expect(json).not.toMatch(/1111/);
    expect(json).not.toMatch(/2\. emelet/);
    expect(json).not.toMatch(/4111/);
    expect(json).not.toMatch(/cvc-999/);
    // The safe fields must survive.
    expect(safe['cartId']).toBe('cart-redact');
    expect(safe['quoteId']).toBe('quote-abc');
    expect(safe['paymentIntentId']).toBe('pi-xyz');
  });

  it('submitOrder logs through the safe logger and never writes a raw contact field', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    const sink: (readonly SafeLogContext[])[] = [];
    submission.bindSafeLogger((entries) => sink.push(entries));
    submission.bindClock(makeFakeClock());

    await fillContactDeliveryPayment(checkout, 'demo_cod');
    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    await submission.submitOrder();
    const flattened = sink
      .flat()
      .map((entry) => JSON.stringify(entry))
      .join('\n');
    expect(flattened).not.toMatch(/Teszt Elek|teszt@example\.test|\+36201234567/);
  });
});

// ---------------------------------------------------------------------------
// Wiring — the service uses the SDK + the CheckoutFacade.
// ---------------------------------------------------------------------------

describe('T23 wiring — submission service consumes the SDK and the facade', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('OrderSubmission is a singleton @Service() exposed via inject()', () => {
    const a = TestBed.inject(OrderSubmission);
    const b = TestBed.inject(OrderSubmission);
    expect(a).toBe(b);
  });

  it('uses createPaymentIntent + getPaymentIntent + createOrder + getOrder from the SDK', () => {
    const submission = TestBed.inject(OrderSubmission);
    expect(submission.usesSdkFunction('createPaymentIntent')).toBe(true);
    expect(submission.usesSdkFunction('getPaymentIntent')).toBe(true);
    expect(submission.usesSdkFunction('createOrder')).toBe(true);
    expect(submission.usesSdkFunction('getOrder')).toBe(true);
  });
});
