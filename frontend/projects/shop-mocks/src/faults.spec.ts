/**
 * Per-endpoint fault scenarios — focused unit suite.
 *
 * The `fail-<operation>` scenario answers one storefront endpoint with
 * a 503 SERVICE_UNAVAILABLE Problem and the `offline-<operation>`
 * scenario with a network error, for every operation `FAULT_OPERATIONS`
 * lists, so an e2e run can drive each facade's error path from the URL.
 * The `fail-once-<operation>` and `offline-once-<operation>` scenarios
 * answer the first matching request of a handler list the same way and
 * serve the rest, so a retry can recover. The `slow-once-<operation>`
 * scenarios hold the first matching request of a handler list back for
 * `SLOW_ONCE_DELAY_MS` and answer it normally, so a caller can let a
 * newer request overtake an older one. Each fault is scoped to its own
 * operation and no other scenario name produces a fault.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import catalogFixture from '../../../docs/api/fixtures/catalog.json';
import { isCatalogFixtureShape, loadCatalogFixture } from './catalog/catalog.handlers';
import './cart/cart.handlers';
import './checkout/checkout.handlers';
import './orders/order.handlers';
import './payment/payment.handlers';
import { createHandlers, type CreateHandlersOptions } from './create-handlers';
import {
  FAULT_OPERATIONS,
  LOST_RESPONSE_OPERATIONS,
  SLOW_ONCE_DELAY_MS,
  faultResponse,
  type FaultOperation,
} from './faults';
import { isRecord } from './is-record';
import { PROBLEM_CONTENT_TYPE } from './problem-response';
import { Repository } from './repository';
import {
  BUILT_IN_SCENARIOS,
  createDeterministicIds,
  createFixedClock,
  resolveScenario,
  type Clock,
  type Ids,
} from './scenarios';
import { server, useMswServer } from '../../../tests/msw-server';

useMswServer();

/** One endpoint a fault scenario can break. */
interface FaultCase {
  readonly operation: FaultOperation;
  /** Narrow on purpose: a typo'd method would make `fetch` reject with the
   *  same `TypeError` the `offline-*` suite asserts. */
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly url: string;
}

const FAULT_CASES: readonly FaultCase[] = [
  { operation: 'products', method: 'GET', url: 'http://localhost/api/v1/products' },
  { operation: 'product', method: 'GET', url: 'http://localhost/api/v1/products/any-slug' },
  {
    operation: 'related-products',
    method: 'GET',
    url: 'http://localhost/api/v1/products/any-slug/related',
  },
  { operation: 'cart', method: 'GET', url: 'http://localhost/api/v1/cart' },
  { operation: 'cart-add', method: 'POST', url: 'http://localhost/api/v1/cart/items' },
  {
    operation: 'cart-quantity',
    method: 'PATCH',
    url: 'http://localhost/api/v1/cart/items/any-variant',
  },
  { operation: 'checkout-options', method: 'GET', url: 'http://localhost/api/v1/checkout/options' },
  { operation: 'checkout', method: 'GET', url: 'http://localhost/api/v1/checkout' },
  { operation: 'checkout-update', method: 'PATCH', url: 'http://localhost/api/v1/checkout' },
  { operation: 'order', method: 'POST', url: 'http://localhost/api/v1/orders' },
  { operation: 'order-read', method: 'GET', url: 'http://localhost/api/v1/orders/any-order' },
  { operation: 'payment-intent', method: 'POST', url: 'http://localhost/api/v1/payment-intents' },
  {
    operation: 'payment-intent-read',
    method: 'GET',
    url: 'http://localhost/api/v1/payment-intents/any-intent',
  },
];

let clock: Clock;
let ids: Ids;

/** Every built-in scenario name, so the no-fault check cannot miss one. */
const REGISTERED_SCENARIOS: string[] = Object.keys(BUILT_IN_SCENARIOS);

beforeAll(() => {
  if (!isCatalogFixtureShape(catalogFixture)) {
    throw new Error('[faults.spec] committed fixture does not match expected shape');
  }
  loadCatalogFixture(catalogFixture);
});

beforeEach(() => {
  clock = createFixedClock('2026-09-20T10:00:00.000Z');
  ids = createDeterministicIds(1);
});

function buildOptions(scenarioName: string): CreateHandlersOptions {
  const scenario = resolveScenario(scenarioName);
  return {
    repository: new Repository(scenario, ids, clock),
    clock,
    ids,
    scenario,
    apiRoot: '/api/v1',
  };
}

function useScenario(scenarioName: string): void {
  server.use(...createHandlers(buildOptions(scenarioName)));
}

function expectRecord(value: unknown): asserts value is Record<string, unknown> {
  expect(isRecord(value)).toBe(true);
}

/** One in-flight request and whether its response has arrived yet. */
interface TrackedResponse {
  readonly promise: Promise<Response>;
  readonly settled: () => boolean;
}

/**
 * Wraps a request so a test can tell "not answered yet" from "answered"
 * without waiting on a wall clock: the timer suite drives the delay.
 */
function trackSettlement(promise: Promise<Response>): TrackedResponse {
  let isSettled = false;
  const tracked = promise.then((response) => {
    isSettled = true;
    return response;
  });
  return { promise: tracked, settled: () => isSettled };
}

/**
 * Lets the request reach its handler and schedule its delay, without
 * moving the clock. Called before the assertions that count milliseconds,
 * because a timer registered after the first advance would be due later
 * than the assertions expect.
 */
async function flushRequestPath(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

afterEach(() => {
  vi.useRealTimers();
});

describe.each(FAULT_CASES)('fail-$operation scenario', (faultCase) => {
  beforeEach(() => {
    useScenario(`fail-${faultCase.operation}`);
  });

  it(`answers ${faultCase.method} ${faultCase.url} with a 503 SERVICE_UNAVAILABLE Problem`, async () => {
    const response = await fetch(faultCase.url, { method: faultCase.method });
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toBe(PROBLEM_CONTENT_TYPE);
    const body: unknown = await response.json();
    expectRecord(body);
    expect(body['code']).toBe('SERVICE_UNAVAILABLE');
    expect(body['detail']).toBe(`Simulated failure (fail-${faultCase.operation} scenario)`);
  });
});

describe.each(FAULT_CASES)('offline-$operation scenario', (faultCase) => {
  beforeEach(() => {
    useScenario(`offline-${faultCase.operation}`);
  });

  it(`rejects ${faultCase.method} ${faultCase.url} with a network error`, async () => {
    await expect(fetch(faultCase.url, { method: faultCase.method })).rejects.toBeInstanceOf(
      TypeError,
    );
  });
});

describe.each(FAULT_CASES)('fail-once-$operation scenario', (faultCase) => {
  beforeEach(() => {
    useScenario(`fail-once-${faultCase.operation}`);
  });

  it(`answers the first ${faultCase.method} ${faultCase.url} with a 503 SERVICE_UNAVAILABLE Problem`, async () => {
    const response = await fetch(faultCase.url, { method: faultCase.method });
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toBe(PROBLEM_CONTENT_TYPE);
    const body: unknown = await response.json();
    expectRecord(body);
    expect(body['code']).toBe('SERVICE_UNAVAILABLE');
    expect(body['detail']).toBe(`Simulated failure (fail-once-${faultCase.operation} scenario)`);
  });

  it(`serves the second ${faultCase.method} ${faultCase.url} normally`, async () => {
    const first = await fetch(faultCase.url, { method: faultCase.method });
    expect(first.status).toBe(503);
    const second = await fetch(faultCase.url, { method: faultCase.method });
    expect(second.status).not.toBe(503);
  });
});

describe.each(FAULT_CASES)('offline-once-$operation scenario', (faultCase) => {
  beforeEach(() => {
    useScenario(`offline-once-${faultCase.operation}`);
  });

  it(`rejects the first ${faultCase.method} ${faultCase.url} with a network error`, async () => {
    await expect(fetch(faultCase.url, { method: faultCase.method })).rejects.toBeInstanceOf(
      TypeError,
    );
  });

  it(`serves the second ${faultCase.method} ${faultCase.url} normally`, async () => {
    await expect(fetch(faultCase.url, { method: faultCase.method })).rejects.toBeInstanceOf(
      TypeError,
    );
    const second = await fetch(faultCase.url, { method: faultCase.method });
    expect(second.status).not.toBe(503);
  });
});

describe.each(FAULT_CASES)('slow-once-$operation scenario', (faultCase) => {
  it(`holds the first ${faultCase.method} ${faultCase.url} for ${String(SLOW_ONCE_DELAY_MS)} ms and then answers it normally`, async () => {
    useScenario('default');
    const expected = await fetch(faultCase.url, { method: faultCase.method });

    useScenario(`slow-once-${faultCase.operation}`);
    vi.useFakeTimers();
    const tracked = trackSettlement(fetch(faultCase.url, { method: faultCase.method }));
    await flushRequestPath();
    await vi.advanceTimersByTimeAsync(SLOW_ONCE_DELAY_MS - 1);
    expect(tracked.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const response = await tracked.promise;
    expect(tracked.settled()).toBe(true);
    expect(response.status).toBe(expected.status);
  });

  it(`answers the second ${faultCase.method} ${faultCase.url} at once`, async () => {
    useScenario('default');
    const expected = await fetch(faultCase.url, { method: faultCase.method });

    useScenario(`slow-once-${faultCase.operation}`);
    vi.useFakeTimers();
    const first = trackSettlement(fetch(faultCase.url, { method: faultCase.method }));
    await flushRequestPath();
    await vi.advanceTimersByTimeAsync(SLOW_ONCE_DELAY_MS);
    await first.promise;

    const second = trackSettlement(fetch(faultCase.url, { method: faultCase.method }));
    await flushRequestPath();
    expect(second.settled()).toBe(true);
    const response = await second.promise;
    expect(response.status).toBe(expected.status);
  });
});

describe('fault scoping', () => {
  beforeEach(() => {
    useScenario('fail-cart');
  });

  it('leaves an endpoint outside the operation answering 200', async () => {
    const response = await fetch('http://localhost/api/v1/products');
    expect(response.status).toBe(200);
  });
});

describe('once-only fault scoping', () => {
  beforeEach(() => {
    useScenario('fail-once-cart');
  });

  it('breaks the operation and leaves an endpoint outside it answering 200', async () => {
    const scoped = await fetch('http://localhost/api/v1/cart');
    expect(scoped.status).toBe(503);
    const outside = await fetch('http://localhost/api/v1/products');
    expect(outside.status).toBe(200);
  });
});

describe('once-only fault lifetime', () => {
  it('answers the first request of a fresh handler list with a 503 again', async () => {
    useScenario('fail-once-products');
    const first = await fetch('http://localhost/api/v1/products');
    expect(first.status).toBe(503);

    // A page load builds a new handler list, so the once-fault is armed again.
    useScenario('fail-once-products');
    const second = await fetch('http://localhost/api/v1/products');
    expect(second.status).toBe(503);
  });
});

describe('faultResponse outside a fault scenario', () => {
  // Driven off the registry rather than two hand-picked names, so a
  // built-in scenario added later cannot silently start matching the
  // `fail-<operation>` / `offline-<operation>` name pattern.
  it.each(REGISTERED_SCENARIOS)('returns null for every operation under %s', (scenarioName) => {
    const options = buildOptions(scenarioName);
    for (const operation of FAULT_OPERATIONS) {
      expect(faultResponse(options, operation)).toBeNull();
    }
  });
});

describe('faultResponse under a lost-once scenario', () => {
  // A lost-once scenario lets the store commit and drops the response
  // afterwards, so it may never short-circuit a request: an
  // implementation matching on the operation suffix alone would. The
  // names come off `LOST_RESPONSE_OPERATIONS`, so an operation added to
  // that table is covered here without a second list to keep in step.
  it.each(LOST_RESPONSE_OPERATIONS.map((operation) => `lost-once-${operation}`))(
    'returns null for every operation under %s',
    (scenarioName) => {
      const options = buildOptions(scenarioName);
      for (const operation of FAULT_OPERATIONS) {
        expect(faultResponse(options, operation)).toBeNull();
      }
    },
  );
});

describe('FAULT_OPERATIONS', () => {
  it('lists the thirteen operation keys in the table order', () => {
    expect(FAULT_OPERATIONS).toEqual([
      'products',
      'product',
      'related-products',
      'cart',
      'cart-add',
      'cart-quantity',
      'checkout-options',
      'checkout',
      'checkout-update',
      'order',
      'order-read',
      'payment-intent',
      'payment-intent-read',
    ]);
  });

  it('matches the operation keys of the fault table', () => {
    expect(FAULT_OPERATIONS).toEqual(FAULT_CASES.map((faultCase) => faultCase.operation));
  });
});

describe('slow-once scoping', () => {
  it('answers an endpoint outside the operation without waiting', async () => {
    useScenario('slow-once-cart');
    vi.useFakeTimers();
    const tracked = trackSettlement(fetch('http://localhost/api/v1/products'));
    await flushRequestPath();
    expect(tracked.settled()).toBe(true);
    const response = await tracked.promise;
    expect(response.status).toBe(200);
  });
});

describe('slow-once lifetime', () => {
  it('holds the first request of a fresh handler list back again', async () => {
    useScenario('slow-once-products');
    vi.useFakeTimers();
    const first = trackSettlement(fetch('http://localhost/api/v1/products'));
    await flushRequestPath();
    await vi.advanceTimersByTimeAsync(SLOW_ONCE_DELAY_MS);
    await first.promise;

    // A page load builds a new handler list, so the delay is armed again.
    useScenario('slow-once-products');
    const second = trackSettlement(fetch('http://localhost/api/v1/products'));
    await flushRequestPath();
    await vi.advanceTimersByTimeAsync(SLOW_ONCE_DELAY_MS - 1);
    expect(second.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(second.settled()).toBe(true);
    const response = await second.promise;
    expect(response.status).toBe(200);
  });
});

describe('faultResponse under a slow-once scenario', () => {
  // A slow-once scenario delays its handler's normal response and may
  // never short-circuit a request: an implementation matching on the
  // operation suffix alone would. The names come off `FAULT_OPERATIONS`,
  // so an operation added to that table is covered here without a second
  // list to keep in step.
  it.each(FAULT_OPERATIONS.map((operation) => `slow-once-${operation}`))(
    'returns null for every operation under %s',
    (scenarioName) => {
      const options = buildOptions(scenarioName);
      for (const operation of FAULT_OPERATIONS) {
        expect(faultResponse(options, operation)).toBeNull();
      }
    },
  );
});

describe('SLOW_ONCE_DELAY_MS', () => {
  it('is 2000 ms, between the search debounce and the expect timeout', () => {
    expect(SLOW_ONCE_DELAY_MS).toBe(2000);
  });
});
