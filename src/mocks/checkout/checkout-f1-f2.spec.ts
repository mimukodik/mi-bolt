/**
 * F1 regression pin: `GET /api/v1/checkout/options` returns 200
 * when handlers are registered one-by-one via `server.use(handler)`
 * - the production browser pattern. Without the early-return guard
 * in `getCheckoutSession` for `cartId === 'options'`, the
 * parameterised handler shadows the literal one and MSW returns
 * 404 "A kosár nem található.".
 */
import { describe, expect, it } from 'vitest';

import { createHandlers, registerBusinessHandlers } from '../../mocks/create-handlers';
// Side-effect imports - register cart + checkout handlers in the
// T05 registry so `createHandlers` builds them in the same order
// the live application does.
import { DEMO_PRODUCT } from '../../mocks/cart/cart.handlers';
import { checkoutHandlersEntry } from '../../mocks/checkout/checkout.handlers';
import { Repository } from '../../mocks/repository';
import { createDeterministicIds, createFixedClock } from '../../mocks/scenarios';
import { server, useMswServer } from '../../../tests/msw-server';

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

interface CheckoutOptionsBody {
  deliveryOptions: { id: string }[];
  paymentMethods: string[];
}

function isCheckoutOptionsBody(data: unknown): data is CheckoutOptionsBody {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  return 'deliveryOptions' in data && 'paymentMethods' in data;
}

// Force-register the checkout entry.
registerBusinessHandlers(checkoutHandlersEntry);

describe('F1 - checkout.options responds 200 when handlers are added individually', () => {
  it('returns 200 from GET /checkout/options (browser-style registration)', async () => {
    const clock = createFixedClock(new Date('2026-09-16T00:00:00.000Z').toISOString());
    const ids = createDeterministicIds(7);
    const scenario = {
      name: 'f1-f2-suite',
      seed: 7,
      clockOffsetMs: 0,
      isolated: true,
    };
    const repository = new Repository(scenario, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);
    const handlers = createHandlers({
      repository,
      clock,
      ids,
      scenario,
      apiRoot: '/api/v1',
    });

    // Match `browser.ts` exactly: each handler is registered via
    // its own server.use() call so the worker queue ends up with
    // handlers in registration order (the dispatcher shell lands
    // at the back and the literal `getCheckoutOptions` handler
    // ends up before the parameterised `getCheckoutSession`).
    for (const handler of handlers) {
      server.use(handler);
    }

    const response = await fetch('http://127.0.0.1/api/v1/checkout/options');
    expect(response.status).toBe(200);

    const body: unknown = await response.json();
    if (!isCheckoutOptionsBody(body)) {
      throw new Error('Invalid response body');
    }
    expect(body.deliveryOptions.map((d) => d.id)).toEqual(['home_delivery', 'demo_pickup']);
    expect(body.paymentMethods).toEqual(['demo_card', 'demo_cod']);
  });
});
