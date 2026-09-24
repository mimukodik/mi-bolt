/**
 * Per-endpoint fault scenarios — focused unit suite.
 *
 * The `fail-<operation>` scenario answers one storefront endpoint with
 * a 503 SERVICE_UNAVAILABLE Problem and the `offline-<operation>`
 * scenario with a network error, for every operation `FAULT_OPERATIONS`
 * lists, so an e2e run can drive each facade's error path from the URL.
 * Each fault is scoped to its own operation and no other scenario name
 * produces a fault.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import catalogFixture from '../../../docs/api/fixtures/catalog.json';
import { isCatalogFixtureShape, loadCatalogFixture } from './catalog/catalog.handlers';
import './cart/cart.handlers';
import './checkout/checkout.handlers';
import './orders/order.handlers';
import './payment/payment.handlers';
import { createHandlers, type CreateHandlersOptions } from './create-handlers';
import { FAULT_OPERATIONS, faultResponse, type FaultOperation } from './faults';
import { isRecord } from './is-record';
import { PROBLEM_CONTENT_TYPE } from './problem-response';
import { Repository } from './repository';
import {
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
  readonly method: string;
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

describe('fault scoping', () => {
  beforeEach(() => {
    useScenario('fail-cart');
  });

  it('leaves an endpoint outside the operation answering 200', async () => {
    const response = await fetch('http://localhost/api/v1/products');
    expect(response.status).toBe(200);
  });
});

describe('faultResponse outside a fault scenario', () => {
  it.each(FAULT_OPERATIONS)('returns null for %s under the default scenario', (operation) => {
    expect(faultResponse(buildOptions('default'), operation)).toBeNull();
  });

  it.each(FAULT_OPERATIONS)('returns null for %s under cart-mutation-fails', (operation) => {
    expect(faultResponse(buildOptions('cart-mutation-fails'), operation)).toBeNull();
  });
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
