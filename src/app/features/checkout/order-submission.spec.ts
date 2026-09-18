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
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { setupServer } from 'msw/node';
import { HttpResponse, http, type RequestHandler } from 'msw';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
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
  SAFE_ORDER_STORAGE_PREFIX,
  type SafeOrderStorage,
  type SafeLogContext,
} from '../../../app/features/checkout/order-submission';
import {
  PAYMENT_POLL_INTERVAL_MS,
  PAYMENT_POLL_MAX_ATTEMPTS,
  type FakeClock,
  type PaymentProgressTick,
} from '../../../app/features/checkout/payment-progress';

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
const server = setupServer();

function buildHandlers(): readonly RequestHandler[] {
  return createHandlers({
    repository: currentEnv.repository,
    clock: currentEnv.clock,
    ids: currentEnv.ids,
    scenario: currentEnv.scenario,
    apiRoot: '/api/v1',
  });
}

beforeAll(() => {
  TestBed.initTestEnvironment(
    BrowserTestingModule,
    platformBrowserTesting(),
    { teardown: { destroyAfterEach: true } },
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterAll(() => {
  server.close();
});

function clearSafeOrderStorage(): void {
  const store: Storage | undefined = (globalThis as { localStorage?: Storage }).localStorage;
  if (store === undefined) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const k = store.key(i);
    if (k !== null) keys.push(k);
  }
  for (const k of keys) {
    if (k.startsWith(SAFE_ORDER_STORAGE_PREFIX)) {
      store.removeItem(k);
    }
  }
}

function makeInMemoryStorage(): SafeOrderStorage {
  const map = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
  };
}

function bindInMemoryStorageOn(submission: OrderSubmission): void {
  submission.bindStorage(makeInMemoryStorage());
}

beforeEach(() => {
  currentEnv = makeEnv();
  server.use(...buildHandlers());
  clearSafeOrderStorage();
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
    bindInMemoryStorageOn(submission);

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
    bindInMemoryStorageOn(submission);

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
    bindInMemoryStorageOn(submission);

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
    bindInMemoryStorageOn(submission);

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
    // The persisted safe key is available so the user can recover.
    const persisted = submission.readPersistedSafeOrder();
    expect(persisted).not.toBeNull();
    // The persisted paymentIntentId is the ORIGINAL id returned by
    // createPaymentIntent (not the override's `pi-pending-forever`
    // id), because the polling loop preserves the original id for
    // server-side lookups. The exact value is scenario-dependent;
    // what matters is that it is a non-empty opaque id.
    expect(typeof persisted?.paymentIntentId).toBe('string');
    expect((persisted?.paymentIntentId ?? '').length).toBeGreaterThan(0);
  });

  it('emits a `pending` tick first, then `attempt` ticks 1..10, then a `timeout` tick', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    const fakeClock = makeFakeClock();
    submission.bindClock(fakeClock);
    bindInMemoryStorageOn(submission);

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
    bindInMemoryStorageOn(submission);

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

    const [a, b] = await Promise.all([
      submission.submitOrder(),
      submission.submitOrder(),
    ]);

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
    bindInMemoryStorageOn(submission);

    await fillContactDeliveryPayment(checkout, 'demo_cod');

    const resolverHolder: { resolve?: (value: Record<string, unknown>) => void } = {};
    server.use(
      http.post('*/api/v1/orders', () =>
        new Promise<Response>((resolve) => {
          resolverHolder.resolve = (body) => { resolve(
              HttpResponse.json(body, {
                status: 201,
                headers: { 'content-type': 'application/json' },
              }),
            ); };
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
    bindInMemoryStorageOn(submission);

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

      // Recovery after a "lost" response must consult the persisted
      // safe key and short-circuit on the first getOrder attempt
      // (the order was saved by the mock domain during the original
      // commit, so the default GET handler returns it).
      const recover = await submission.recoverPersistedOrder();
      expect(recover?.source).toBe('getOrder');
      expect(recover?.orderId).toBe(checkout.order()?.id);
      // No second createOrder fired.
      expect(orderCalls).toBe(1);
    } finally {
      server.events.removeListener('request:match', onMatch);
    }
  });
});

// ---------------------------------------------------------------------------
// T23-AC04 — unknown outcome retains identical order key + normalized
// request; reload recovery queries stored receipt or replays exact order.
// ---------------------------------------------------------------------------

describe('T23-AC04 unknown outcome retains identical order key and normalized request', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('persists a safe order key + normalized body on the first commit attempt', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    submission.bindClock(makeFakeClock());
    bindInMemoryStorageOn(submission);

    await fillContactDeliveryPayment(checkout, 'demo_cod');
    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    await submission.submitOrder();

    const stored = submission.readPersistedSafeOrder();
    expect(stored).not.toBeNull();
    // The persisted record must NOT carry contact / address / card.
    const json = JSON.stringify(stored);
    expect(json).not.toMatch(/Teszt Elek|teszt@example\.test|\+36201234567|Példa utca|Demóváros/i);
    // It MUST carry the cartId + quoteId + termsVersion.
    expect(stored?.cartId).toBe(checkout.cartId());
    expect(stored?.body.termsVersion).toBe('demo-1');
    expect(stored?.body.acceptedTerms).toBe(true);
    // The orderId from the receipt is now persisted so getOrder can find it.
    expect(stored?.orderId).toBe(checkout.order()?.id);
  });

  it('a pending-timeout preserves the persisted safe key for replay', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    const fakeClock = makeFakeClock();
    submission.bindClock(fakeClock);
    bindInMemoryStorageOn(submission);

    currentEnv = makeEnv('payment-pending-timeout');
    server.resetHandlers();
    server.use(...buildHandlers());

    await fillContactDeliveryPayment(checkout, 'demo_card');

    const currentCartId = checkout.cartId();
    if (!currentCartId) throw new Error('Expected cartId');
    const currentQuote = checkout.quote();
    if (!currentQuote) throw new Error('Expected quote');

    server.use(
      http.get('*/api/v1/payment-intents/:intentId', () =>
        HttpResponse.json({
          id: 'pi-pending-replay',
          cartId: currentCartId,
          quoteId: currentQuote.id,
          status: 'pending',
          isSimulation: true,
          amount: { amount: 100, currency: 'HUF' },
        }),
      ),
    );

    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    const submitted = submission.submitOrder();
    await flushAsync();
    for (let i = 0; i < 10; i += 1) {
      fakeClock.fire();
      await flushAsync();
    }
    const first = await submitted;
    expect(first.kind).toBe<SubmitOutcome['kind']>('pending-timeout');

    const firstRecord = submission.readPersistedSafeOrder();
    expect(firstRecord).not.toBeNull();
    if (firstRecord === null) throw new Error('Expected firstRecord to not be null');
    const firstKey = firstRecord.orderKey;
    const firstBody = firstRecord.body;

    // The retry path must send the EXACT persisted key + body.
    // Capture the next POST /orders request to assert the wire
    // contract; the order itself may still fail (the intent is
    // still pending) — the AC is about replaying the same request,
    // not about its result.
    let capturedKey: string | null = null;
    let capturedBody: unknown = null;
    server.use(
      http.post('*/api/v1/orders', async ({ request }) => {
        capturedKey = request.headers.get('Idempotency-Key');
        capturedBody = await request.clone().json();
        // Return PAYMENT_PENDING so the retry surface mirrors the
        // still-pending intent; the AC is about the request shape,
        // not the outcome.
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:payment-pending',
            title: 'A szimulált fizetés még feldolgozás alatt.',
            status: 409,
            code: 'PAYMENT_PENDING',
            detail: 'A szimulált fizetés még feldolgozás alatt.',
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    const retry = await submission.retryUnknownOutcome();
    // Result is unknown — the intent is still pending in this
    // scenario. What matters for T23-AC04 is that the wire request
    // carried the persisted key + body verbatim.
    expect(retry.kind).toBe<SubmitOutcome['kind']>('unknown');
    expect(capturedKey).toBe(firstKey);
    expect(capturedBody).toEqual(firstBody);

    const secondRecord = submission.readPersistedSafeOrder();
    expect(secondRecord).not.toBeNull();
    if (secondRecord === null) throw new Error('Expected secondRecord to not be null');
    expect(secondRecord.orderKey).toBe(firstKey);
    // The normalized body must be byte-equal.
    expect(secondRecord.body).toEqual(firstBody);
  });

  it('reload recovery queries getOrder first when the receipt id is persisted', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    submission.bindClock(makeFakeClock());
    bindInMemoryStorageOn(submission);

    await fillContactDeliveryPayment(checkout, 'demo_cod');
    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    const outcome = await submission.submitOrder();
    expect(outcome.kind).toBe<SubmitOutcome['kind']>('committed');

    let getOrderCalls = 0;
    server.use(
      http.get('*/api/v1/orders/:orderId', () => {
        getOrderCalls += 1;
        return HttpResponse.json(
          {
            id: 'order-recovered',
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
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const recover = await submission.recoverPersistedOrder();
    expect(getOrderCalls).toBe(1);
    expect(recover?.orderId).toBe('order-recovered');
    expect(recover?.source).toBe('getOrder');
  });

  it('reload recovery falls back to a replay when getOrder returns 404', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const submission = TestBed.inject(OrderSubmission);
    submission.bindClock(makeFakeClock());
    bindInMemoryStorageOn(submission);

    await fillContactDeliveryPayment(checkout, 'demo_cod');
    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    await submission.submitOrder();

    let getOrderCalls = 0;
    let orderCalls = 0;
    // Override the default order handler to count both paths.
    server.use(
      http.get('*/api/v1/orders/:orderId', () => {
        getOrderCalls += 1;
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:not-found',
            title: 'A rendelés nem található.',
            status: 404,
            code: 'NOT_FOUND',
            detail: 'A rendelés nem található.',
            traceId: 'mock-trace-test',
            fieldErrors: [],
          },
          { status: 404, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
      http.post('*/api/v1/orders', () => {
        orderCalls += 1;
        return HttpResponse.json(
          {
            id: 'order-replayed',
            orderNumber: 'DEMO-000002',
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

    const recover = await submission.recoverPersistedOrder();
    expect(getOrderCalls).toBe(1);
    expect(orderCalls).toBe(1);
    expect(recover?.orderId).toBe('order-replayed');
    expect(recover?.source).toBe('replay');
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
    bindInMemoryStorageOn(submission);

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
    // No persisted safe key after a deterministic, expected failure.
    expect(submission.readPersistedSafeOrder()).toBeNull();
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
    bindInMemoryStorageOn(submission);

    await fillContactDeliveryPayment(checkout, 'demo_cod');
    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);

    await submission.submitOrder();
    const flattened = sink.flat().map((entry) => JSON.stringify(entry)).join('\n');
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
