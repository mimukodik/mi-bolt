/**
 * T17: cart facade on the 2.0.0 contract.
 *
 * Drives the facade through the 2.0.0 cart mock (GET /cart auto-create,
 * If-Match per dispatch, 412 conflict with background refetch and explicit
 * retry, 410 expiry, 404 and 409 on the error signal with params, clear(),
 * CART_NOT_LOADED before boot) and asserts exact versions, counts and
 * headers on captured requests.
 */

// @vitest-environment jsdom
import '@angular/compiler';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpResponse, http } from 'msw';

import { server, useMswServer } from '../../../../../../tests/msw-server';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';
import { demoSessionInterceptor } from '@mi-bolt/core-api/demo-session.interceptor';
import type { Cart } from '@mi-bolt/api/models/cart';

import { createHandlers } from '@mi-bolt/mocks/create-handlers';
import { CART_TTL_MS } from '@mi-bolt/mocks/cart/cart-store';
import '@mi-bolt/mocks/cart/cart.handlers';
import { loadCatalogFixture } from '@mi-bolt/mocks/catalog/catalog.handlers';
import { isCatalogFixtureShape } from '@mi-bolt/mocks/catalog/catalog.handlers';
import catalogFixture from '../../../../../../docs/api/fixtures/catalog.json';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
} from '@mi-bolt/mocks/scenarios';
import { Repository } from '@mi-bolt/mocks/repository';

import { CartFacade } from './cart.facade';
import { CartCountFacade } from '../../core/navigation/cart-count-facade';
import { CartMutationQueue, type DispatchResult, type MutationIntent } from './cart-mutation-queue';

useMswServer();

const BASE_URL = 'http://localhost/api/v1';
const VARIANT_MOTO_256 = 'motorola-edge-50-fusion--zold--256';
const VARIANT_HONOR_128 = 'honor-x7d--fekete--128';
const VARIANT_IPHONE_OOS = 'apple-iphone-17e--halvany-rozsaszin--256';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function hasQueue(t: object): t is { queue: unknown } {
  return 'queue' in t;
}

function getQueue(target: unknown): CartMutationQueue | null {
  if (typeof target !== 'object' || target === null) return null;
  if (!hasQueue(target)) return null;
  const q = target.queue;
  if (q instanceof CartMutationQueue) return q;
  return null;
}

/** Waits for every queued dispatch and the facade's own `then` continuations. */
async function settled(facade: CartFacade): Promise<void> {
  const queue = getQueue(facade);
  if (queue !== null) await queue.settle();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface CapturedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string | undefined>;
}
const captures: CapturedRequest[] = [];

function requestsTo(method: string, path: string): CapturedRequest[] {
  return captures.filter((c) => c.method === method && c.url === `${BASE_URL}${path}`);
}

/** A 2.0.0 cart literal for the queue tests, no server involved. */
function cartLiteral(version: number): Cart {
  return {
    id: 'cart-literal',
    version,
    items: [],
    lineCount: 0,
    totalQuantity: 0,
    subtotal: { amount: 0, currency: 'HUF' },
    expiresAt: '2026-09-21T10:00:00.000Z',
    notices: [],
  };
}

// ---------------------------------------------------------------------------
// Capture setup
// ---------------------------------------------------------------------------

let clock: ReturnType<typeof createFixedClock>;
let ids: ReturnType<typeof createDeterministicIds>;
let options: {
  repository: Repository;
  clock: ReturnType<typeof createFixedClock>;
  ids: ReturnType<typeof createDeterministicIds>;
  scenario: typeof DEFAULT_SCENARIO;
  apiRoot: string;
};

beforeAll(() => {
  if (!isCatalogFixtureShape(catalogFixture)) {
    throw new Error('[cart.facade.spec] committed fixture does not match expected shape');
  }
  loadCatalogFixture(catalogFixture);
});

beforeEach(() => {
  captures.length = 0;
  clock = createFixedClock('2026-09-20T10:00:00.000Z');
  ids = createDeterministicIds(1);
  options = {
    repository: new Repository(DEFAULT_SCENARIO, ids, clock),
    clock,
    ids,
    scenario: DEFAULT_SCENARIO,
    apiRoot: '/api/v1',
  };
  server.use(...createHandlers(options));

  const handler = ({ request }: { request: Request }): void => {
    const headers: Record<string, string | undefined> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    captures.push({ method: request.method, url: request.url, headers });
  };
  server.events.on('request:start', handler);
});

afterEach(() => {
  server.events.removeAllListeners('request:start');
  server.resetHandlers();
  captures.length = 0;
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function configureTestBed(): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
    ],
    teardown: { destroyAfterEach: true },
  });
}

// ---------------------------------------------------------------------------
// T17-AC01: root-scoped CartFacade is the single owner
// ---------------------------------------------------------------------------
describe('T17-AC01: root-scoped CartFacade is the single owner', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('exposes CartFacade providedIn root so two inject() calls return the same instance', () => {
    const a = TestBed.inject(CartFacade);
    const b = TestBed.inject(CartFacade);
    expect(a).toBe(b);
  });

  it('re-exports the real CartFacade under the CartCountFacade name so the header binds to it', () => {
    const header = TestBed.inject(CartCountFacade);
    const real = TestBed.inject(CartFacade);
    expect(header).toBe(real);
  });

  it('boots by fetching the session cart: version 1, no items, itemCount 0, subtotal 0 HUF', async () => {
    configureTestBed();
    const facade = TestBed.inject(CartFacade);
    await settled(facade);

    expect(requestsTo('GET', '/cart')).toHaveLength(1);
    const [firstGet] = requestsTo('GET', '/cart');
    expect(firstGet.headers['if-match']).toBeUndefined();

    expect(facade.cart()?.version).toBe(1);
    expect(facade.cart()?.items).toEqual([]);
    expect(facade.itemCount()).toBe(0);
    expect(facade.subtotal()).toEqual({ amount: 0, currency: 'HUF' });
    expect(facade.error()).toBeNull();
    expect(facade.pending()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T17-AC02: serialized mutations bind If-Match to the previous response
// ---------------------------------------------------------------------------
describe('T17-AC02: serialized mutations bind If-Match to the previous response', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('queues two addItem intents serially; the second carries the version the first returned', async () => {
    const facade = TestBed.inject(CartFacade);
    await Promise.all([facade.addItem(VARIANT_MOTO_256, 1), facade.addItem(VARIANT_HONOR_128, 1)]);

    const adds = requestsTo('POST', '/cart/items');
    expect(adds).toHaveLength(2);
    expect(adds[0]?.headers['if-match']).toBe('"1"');
    expect(adds[1]?.headers['if-match']).toBe('"2"');
    expect(facade.cart()?.version).toBe(3);
    expect(facade.cart()?.lineCount).toBe(2);
    expect(facade.cart()?.totalQuantity).toBe(2);
    expect(facade.itemCount()).toBe(2);
  });

  it('sends no If-Match on the boot fetch and on refetch()', async () => {
    const facade = TestBed.inject(CartFacade);
    await settled(facade);

    const bootGets = requestsTo('GET', '/cart');
    expect(bootGets).toHaveLength(1);
    expect(bootGets[0]?.headers['if-match']).toBeUndefined();

    await facade.refetch();

    const gets = requestsTo('GET', '/cart');
    expect(gets).toHaveLength(2);
    expect(gets[0]?.headers['if-match']).toBeUndefined();
    expect(gets[1]?.headers['if-match']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T17-AC03: pending controls and authoritative totals
// ---------------------------------------------------------------------------
describe('T17-AC03: pending controls and authoritative totals', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('reports pending>0 while an intent is queued, then drops to 0', async () => {
    const facade = TestBed.inject(CartFacade);
    await settled(facade);

    const p = facade.addItem(VARIANT_MOTO_256, 1);

    expect(facade.pending()).toBe(1);
    expect(facade.itemCount()).toBe(0);

    await p;
    await settled(facade);

    expect(facade.pending()).toBe(0);
    expect(facade.itemCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T17-AC04: 412 conflict surfaces a recovery signal and defers replay
// ---------------------------------------------------------------------------
describe('T17-AC04: 412 conflict surfaces a recovery signal and defers replay', () => {
  let facade: CartFacade;

  beforeEach(async () => {
    configureTestBed();
    facade = TestBed.inject(CartFacade);
    await facade.addItem(VARIANT_MOTO_256, 1);
    const current = facade.cart();
    if (current === null) throw new Error('no cart');
    facade._seedCart({ ...current, version: 1 });
  });

  it('surfaces the conflict on the conflict signal, then refetches in the background', async () => {
    await facade.addItem(VARIANT_HONOR_128, 1);

    expect(facade.conflict()).toEqual({
      code: 'CART_VERSION_CONFLICT',
      status: 412,
      detail: 'The cart changed since the version supplied in If-Match',
      intentKind: 'addItem',
      serverVersion: 1,
    });
    expect(facade.cart()?.lineCount).toBe(1);

    await settled(facade);

    expect(facade.cart()?.version).toBe(2);
    expect(facade.conflict()).toBeNull();
    expect(facade.cart()?.lineCount).toBe(1);
  });

  it('retry() re-submits the failed intent with the refreshed version', async () => {
    await facade.addItem(VARIANT_HONOR_128, 1);
    await settled(facade);

    captures.length = 0;
    await facade.retry();

    const adds = requestsTo('POST', '/cart/items');
    expect(adds).toHaveLength(1);
    expect(adds[0]?.headers['if-match']).toBe('"2"');
    expect(facade.cart()?.version).toBe(3);
    expect(facade.cart()?.lineCount).toBe(2);
    expect(facade.conflict()).toBeNull();
    expect(facade.error()).toBeNull();
  });

  it('retry() is a no-op when nothing failed', async () => {
    configureTestBed();
    const fresh = TestBed.inject(CartFacade);
    await settled(fresh);

    captures.length = 0;
    await fresh.retry();

    expect(captures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T17-AC05: 410 / 404 / 409 recovery; no 401 path
// ---------------------------------------------------------------------------
describe('T17-AC05: 410 / 404 / 409 recovery; no 401 path', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('410 CART_EXPIRED flips cartExpired, drops the snapshot, and refetch() starts a fresh cart', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.addItem(VARIANT_MOTO_256, 1);
    clock.advanceMs(CART_TTL_MS);
    await facade.addItem(VARIANT_HONOR_128, 1);

    expect(facade.cartExpired()).toBe(true);
    expect(facade.cart()).toBeNull();
    expect(facade.error()).toBeNull();

    await facade.refetch();

    expect(facade.cart()?.version).toBe(1);
    expect(facade.cart()?.items).toEqual([]);
    expect(facade.cartExpired()).toBe(false);
  });

  it('ensureCart() keeps an expired cart expired and fetches nothing', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.addItem(VARIANT_MOTO_256, 1);
    clock.advanceMs(CART_TTL_MS);
    await facade.addItem(VARIANT_HONOR_128, 1);

    expect(facade.cartExpired()).toBe(true);

    captures.length = 0;
    await facade.ensureCart();

    expect(facade.cartExpired()).toBe(true);
    expect(facade.cart()).toBeNull();
    expect(requestsTo('GET', '/cart')).toHaveLength(0);
  });

  it('concurrent ensureCart() calls on an expired cart issue one GET /cart and keep the expiry', async () => {
    // The session's cart is left to age past its own expiry on the mock, so
    // the very first read of the facade below answers 410.
    const stale = TestBed.inject(CartFacade);
    await settled(stale);
    clock.advanceMs(CART_TTL_MS);
    configureTestBed();

    // A cold load: the facade is built and the second caller asks in the same
    // task, before that 410 can land on the signal.
    captures.length = 0;
    const facade = TestBed.inject(CartFacade);
    await Promise.all([facade.ensureCart(), facade.ensureCart()]);

    expect(requestsTo('GET', '/cart')).toHaveLength(1);
    expect(facade.cartExpired()).toBe(true);
    expect(facade.cart()).toBeNull();
  });

  it('404 NOT_FOUND on an unknown variant lands on error and keeps the cart', async () => {
    configureTestBed();
    const facade = TestBed.inject(CartFacade);
    await settled(facade);

    await facade.addItem('nope', 1);

    expect(facade.error()).toEqual({
      code: 'NOT_FOUND',
      status: 404,
      detail: 'Unknown variant',
      params: { variantId: 'nope' },
    });
    expect(facade.cart()?.version).toBe(1);
    expect(facade.cartExpired()).toBe(false);
    expect(facade.conflict()).toBeNull();
  });

  it('409 QUANTITY_LIMIT carries max and the merged requested quantity', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.addItem(VARIANT_MOTO_256, 5);
    await facade.addItem(VARIANT_MOTO_256, 1);

    expect(facade.error()?.code).toBe('QUANTITY_LIMIT');
    expect(facade.error()?.status).toBe(409);
    expect(facade.error()?.params).toEqual({ max: 5, requested: 6 });
    expect(facade.cart()?.version).toBe(2);
    expect(facade.itemCount()).toBe(5);
  });

  it('409 OUT_OF_STOCK lands on error', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.addItem(VARIANT_IPHONE_OOS, 1);

    expect(facade.error()?.code).toBe('OUT_OF_STOCK');
    expect(facade.error()?.status).toBe(409);
    expect(facade.cart()?.version).toBe(1);
  });

  it('a write before the cart is loaded fails locally with CART_NOT_LOADED and sends nothing', async () => {
    server.use(
      http.get('*/api/v1/cart', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:service-unavailable',
            title: 'Service unavailable',
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            detail: 'down',
            traceId: 't',
            fieldErrors: [],
          },
          { status: 503 },
        ),
      ),
    );

    configureTestBed();
    const facade = TestBed.inject(CartFacade);
    await settled(facade);

    expect(facade.error()?.code).toBe('SERVICE_UNAVAILABLE');
    expect(facade.error()?.status).toBe(503);
    expect(facade.error()?.detail).toBe('down');

    captures.length = 0;
    await facade.addItem(VARIANT_MOTO_256, 1);

    expect(facade.error()?.code).toBe('CART_NOT_LOADED');
    expect(facade.error()?.status).toBe(0);
    expect(requestsTo('POST', '/cart/items')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// clear()
// ---------------------------------------------------------------------------
describe('clear()', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('empties the cart with If-Match and bumps the version once', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.addItem(VARIANT_MOTO_256, 1);
    await facade.addItem(VARIANT_HONOR_128, 1);
    await facade.clear();

    const dels = requestsTo('DELETE', '/cart/items');
    expect(dels).toHaveLength(1);
    expect(dels[0]?.headers['if-match']).toBe('"3"');

    expect(facade.cart()?.items).toEqual([]);
    expect(facade.cart()?.version).toBe(4);
    expect(facade.itemCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// productNameOf
// ---------------------------------------------------------------------------
describe('productNameOf', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('names a line after a later cart dropped it, and null for a variant it never saw', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.addItem(VARIANT_MOTO_256, 1);

    const loaded = facade.cart();
    if (loaded === null) throw new Error('the cart was not loaded');
    const name = loaded.items.find((item) => item.variantId === VARIANT_MOTO_256)?.productName;
    expect(typeof name).toBe('string');
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('the cart line carries no product name');
    }

    // The next read answers with the line dropped for lost stock, exactly
    // as the mock reports it: the line is gone and the notice names it.
    server.use(
      http.get('*/api/v1/cart', () =>
        HttpResponse.json({
          ...loaded,
          version: loaded.version + 1,
          items: [],
          lineCount: 0,
          totalQuantity: 0,
          notices: [{ code: 'ITEM_REMOVED', variantId: VARIANT_MOTO_256, params: { quantity: 1 } }],
        }),
      ),
    );
    await facade.refetch();

    expect(facade.cart()?.items).toEqual([]);
    expect(facade.productNameOf(VARIANT_MOTO_256)).toBe(name);
    expect(facade.productNameOf('no-such-variant')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// FIX-10: CartFacade acquires its cart on construction
// ---------------------------------------------------------------------------
describe('FIX-10: CartFacade acquires its cart on construction', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('lands a failing boot fetch on the error signal without throwing', async () => {
    server.use(
      http.get('*/api/v1/cart', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:service-unavailable',
            title: 'Service unavailable',
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            detail: 'down',
            traceId: 't',
            fieldErrors: [],
          },
          { status: 503 },
        ),
      ),
    );

    configureTestBed();
    const facade = TestBed.inject(CartFacade);
    await settled(facade);

    expect(facade.cart()).toBeNull();
    expect(facade.error()?.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// T24-AC03: in-flight mutation results are dropped after resetOrderedCart
// ---------------------------------------------------------------------------
describe('T24-AC03: in-flight mutation results are dropped after resetOrderedCart', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('does not resurrect the cart when an addItem resolves after resetOrderedCart', async () => {
    const facade = TestBed.inject(CartFacade);
    const p = facade.addItem(VARIANT_MOTO_256, 1);
    facade.resetOrderedCart();
    await p;
    await settled(facade);

    expect(facade.cart()).toBeNull();
    expect(facade.itemCount()).toBe(0);
    expect(facade.pending()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CartMutationQueue: serialized dispatch + pending count
// ---------------------------------------------------------------------------
describe('CartMutationQueue: serialized dispatch + pending count', () => {
  it('dispatches intents in order and hands each the version the provider returns at dispatch time', async () => {
    const queue = new CartMutationQueue();
    const versions = [1, 2];
    let vi = 0;
    const expectedVersionObserved: number[] = [];
    const kindObserved: string[] = [];

    const dispatcher = (inputs: {
      intent: MutationIntent;
      expectedVersion: number | null;
    }): Promise<DispatchResult> => {
      expectedVersionObserved.push(inputs.expectedVersion ?? -1);
      kindObserved.push(inputs.intent.kind);
      return Promise.resolve({
        ok: true,
        cart: cartLiteral(versions[vi++] ?? 3),
      });
    };

    let pi = 0;
    queue.setVersionProvider(() => versions[pi++] ?? null);

    await queue.enqueue(
      { kind: 'addItem', retry: false, variantId: VARIANT_MOTO_256, quantity: 1 },
      dispatcher,
    );
    await queue.enqueue({ kind: 'clear', retry: false }, dispatcher);

    expect(expectedVersionObserved).toEqual([1, 2]);
    expect(kindObserved).toEqual(['addItem', 'clear']);
  });

  it('pendingCount rises per enqueue and falls per settled dispatch', async () => {
    const queue = new CartMutationQueue();
    queue.setVersionProvider(() => 1);

    expect(queue.pendingCount()).toBe(0);

    const first = queue.enqueue(
      { kind: 'addItem', retry: false, variantId: 'x', quantity: 1 },
      () => Promise.resolve({ ok: true, cart: cartLiteral(1) }),
    );
    const second = queue.enqueue(
      { kind: 'addItem', retry: false, variantId: 'y', quantity: 1 },
      () => Promise.resolve({ ok: true, cart: cartLiteral(2) }),
    );

    expect(queue.pendingCount()).toBe(2);

    await Promise.all([first, second]);
    await settledQueue(queue);

    expect(queue.pendingCount()).toBe(0);
  });

  it('a destroyed queue answers SERVICE_UNAVAILABLE without dispatching', async () => {
    const queue = new CartMutationQueue();
    let dispatched = false;

    queue.destroy();

    const result = await queue.enqueue(
      { kind: 'addItem', retry: false, variantId: 'x', quantity: 1 },
      () => {
        dispatched = true;
        return Promise.resolve({ ok: true, cart: cartLiteral(1) });
      },
    );

    expect(result).toEqual({
      ok: false,
      code: 'SERVICE_UNAVAILABLE',
      status: 0,
      detail: 'queue destroyed',
    });
    expect(dispatched).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mapError: HttpErrorResponse body narrowing
// ---------------------------------------------------------------------------
describe('mapError: HttpErrorResponse body narrowing', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('substitutes UNKNOWN when the body is null', async () => {
    server.use(http.get('*/api/v1/cart', () => new HttpResponse(null, { status: 500 })));

    configureTestBed();
    const facade = TestBed.inject(CartFacade);
    await settled(facade);

    expect(facade.error()?.code).toBe('UNKNOWN');
    expect(facade.error()?.status).toBe(500);
  });

  it('substitutes UNKNOWN when the body is a non-object string', async () => {
    server.use(http.get('*/api/v1/cart', () => HttpResponse.text('boom', { status: 502 })));

    configureTestBed();
    const facade = TestBed.inject(CartFacade);
    await settled(facade);

    expect(facade.error()?.code).toBe('UNKNOWN');
    expect(facade.error()?.status).toBe(502);
  });

  it('passes a coded body through verbatim with its params', async () => {
    server.use(
      http.post('*/api/v1/cart/items', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:quantity-limit',
            title: 'Conflict',
            status: 409,
            code: 'QUANTITY_LIMIT',
            detail: 'x',
            traceId: 't',
            fieldErrors: [],
            params: { max: 5, requested: 6 },
          },
          { status: 409 },
        ),
      ),
    );

    const facade = TestBed.inject(CartFacade);
    await facade.addItem(VARIANT_MOTO_256, 1);

    expect(facade.error()).toEqual({
      code: 'QUANTITY_LIMIT',
      status: 409,
      detail: 'x',
      params: { max: 5, requested: 6 },
    });
  });
});

// ---------------------------------------------------------------------------
// Queue helper: settle the tail chain
// ---------------------------------------------------------------------------
async function settledQueue(queue: CartMutationQueue): Promise<void> {
  await queue.settle();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
