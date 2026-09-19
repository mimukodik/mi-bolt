/**
 * T17: global cart signal facade.
 *
 * Each acceptance criterion has at least one named failing test. The
 * suite wires the real SDK over MSW (T07 cart handlers) so the
 * `If-Match`, `Idempotency-Key` and `X-Demo-Session` headers go
 * through the same code paths the browser uses, and the facade's
 * signals (cart / itemCount / subtotal / pending / error / conflict
 * / cartGone / cartExpired) are observed through the public surface.
 *
 * Vitest's esbuild/oxc parser is fragile on chained `??` / `||`
 * patterns. The test bodies use plain ternary / explicit branches so
 * the build does not regress on T11-style parser workarounds.
 */

// @vitest-environment jsdom
import '@angular/compiler';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { type RequestHandler } from 'msw';
import { server } from '../../../../tests/msw-server';

import { provideApiConfiguration } from '../../../app/api/generated/api-configuration';
import { demoSessionInterceptor } from '../../../app/core/api/demo-session.interceptor';

import { DEMO_PRODUCT, cartHandlersEntry } from '../../../mocks/cart/cart.handlers';
import { CART_DURATION_MS, CartDomain } from '../../../mocks/cart/cart-domain';
import { IdempotencyStore } from '../../../mocks/idempotency';
import { Repository } from '../../../mocks/repository';
import { createDeterministicIds, createFixedClock } from '../../../mocks/scenarios';

import { CartFacade } from '../../../app/features/cart/cart.facade';
import { CartCountFacade } from '../../../app/core/navigation/cart-count-facade';
import {
  CartMutationQueue,
  settleQueue,
  type MutationIntent,
  type DispatchResult,
} from '../../../app/features/cart/cart-mutation-queue';

const BASE_URL = 'http://localhost/api/v1';
const VARIANT_G256 = 'demo-one-5g-graphite-256';
const VARIANT_G512 = 'demo-one-5g-graphite-512';
const VARIANT_S256 = 'demo-one-5g-silver-256';

function getQueue(target: unknown): CartMutationQueue | null {
  if (typeof target !== 'object' || target === null) return null;
  if (!('queue' in target)) return null;
  const q = target.queue;
  if (q instanceof CartMutationQueue) return q;
  return null;
}

// ---------------------------------------------------------------------------
// Capture every outgoing request so AC02 can assert header values.
// ---------------------------------------------------------------------------
interface CapturedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string | undefined>;
  readonly body: string;
}
const captures: CapturedRequest[] = [];

function captureRequest(request: Request, body: string): void {
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  captures.push({
    method: request.method,
    url: request.url,
    headers,
    body,
  });
}

let currentDomain: CartDomain;
let currentEnv: {
  repository: Repository;
  clock: { now(): string; advanceMs(n: number): void };
  ids: { uuid(): string };
  scenario: { name: string; seed: number; clockOffsetMs: number; isolated: boolean };
};

function makeEnv(): typeof currentEnv {
  const clock = createFixedClock(new Date(Date.parse('2026-09-14T10:00:00.000Z')).toISOString());
  const ids = createDeterministicIds(7);
  const scenario = {
    name: 'cart-facade-suite',
    seed: 7,
    clockOffsetMs: 0,
    isolated: true,
  };
  const repository = new Repository(scenario, ids, clock);
  repository.loadProducts([DEMO_PRODUCT]);
  currentDomain = new CartDomain(repository, clock, ids, new IdempotencyStore(clock));
  return { repository, clock, ids, scenario };
}

function buildHandlers(): RequestHandler[] {
  const env = currentEnv;
  return [
    ...cartHandlersEntry({
      repository: env.repository,
      clock: env.clock,
      ids: env.ids,
      scenario: env.scenario,
      apiRoot: '/api/v1',
    }),
  ];
}

/**
 * Attaches a request capture handler directly to the MSW server
 * events so we can assert on actual headers (including `If-Match`)
 * without monkey-patching each cart handler's `run`.
 */
function attachRequestCapture(serverInstance: typeof server): () => void {
  const handler = async ({ request }: { request: Request }): Promise<void> => {
    const cloned = request.clone();
    const bodyText = await cloned.text().catch(() => '');
    captureRequest(request, bodyText);
  };
  serverInstance.events.on('request:start', handler);
  return () => {
    serverInstance.events.removeListener('request:start', handler);
  };
}

let detachCapture: (() => void) | null = null;

beforeEach(() => {
  captures.length = 0;
  currentEnv = makeEnv();
  server.use(...buildHandlers());
  detachCapture = attachRequestCapture(server);
});

afterEach(() => {
  if (detachCapture) detachCapture();
  detachCapture = null;
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

function patchesTo(cartId: string, itemId: string): CapturedRequest[] {
  return captures.filter(
    (c) => c.method === 'PATCH' && c.url.endsWith(`/carts/${cartId}/items/${itemId}`),
  );
}

function addsTo(cartId: string): CapturedRequest[] {
  return captures.filter((c) => c.method === 'POST' && c.url.endsWith(`/carts/${cartId}/items`));
}

/**
 * Reads the X-Demo-Session header that the interceptor set on the
 * most recent cart-bound request. The cart-domain uses this id to
 * namespace carts, so OOB operations must match it exactly.
 */
function readDemoSessionId(): string {
  for (let i = captures.length - 1; i >= 0; i--) {
    const value = captures[i]?.headers['x-demo-session'];
    if (typeof value === 'string') return value;
  }
  throw new Error('No captured request found: call facade.ensureCart() first.');
}

// ---------------------------------------------------------------------------
// T17-AC01: Header (T11), product add (T18/T15), and checkout (T19+)
// read the same root-scoped CartFacade. No sibling event bus. No
// duplicate totals.
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

  it('re-exports the real CartFacade under the CartCountFacade name so T11 header still binds', () => {
    const header = TestBed.inject(CartCountFacade);
    const real = TestBed.inject(CartFacade);
    expect(header).toBe(real);
    expect(typeof header.addItem).toBe('function');
    expect(typeof header.setQuantity).toBe('function');
    expect(typeof header.removeItem).toBe('function');
    expect(typeof header.ensureCart).toBe('function');
    expect(typeof header.retry).toBe('function');
  });

  it('starts with itemCount=0, subtotal=0 HUF, no error and no pending intents', () => {
    const facade = TestBed.inject(CartFacade);
    expect(facade.itemCount()).toBe(0);
    expect(facade.subtotal()).toEqual({ amount: 0, currency: 'HUF' });
    expect(facade.pending()).toBe(0);
    expect(facade.error()).toBeNull();
    expect(facade.conflict()).toBeNull();
    expect(facade.cartGone()).toBe(false);
    expect(facade.cartExpired()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T17-AC02: serialize mutations and bind expected version at dispatch.
// Fresh idempotency key per intent, same key only on retry.
// ---------------------------------------------------------------------------
describe('T17-AC02: serialized mutations, If-Match at dispatch, fresh idempotency per intent', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('queues two addCartItem intents serially; the second uses the version returned by the first', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();
    const cartId = facade.cartId;

    const p1 = facade.addItem(VARIANT_G256, 1);
    const p2 = facade.addItem(VARIANT_G512, 1);
    await Promise.all([p1, p2]);

    const adds = addsTo(cartId ?? '');
    expect(adds.length).toBe(2);
    const ifMatch1 = adds[0]?.headers['if-match'];
    const ifMatch2 = adds[1]?.headers['if-match'];
    expect(ifMatch1).toBe('"1"');
    expect(ifMatch2).toBe('"2"');
    expect(ifMatch2).not.toBe(ifMatch1);
  });

  it('issues a fresh Idempotency-Key for each new intent', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();
    await facade.addItem(VARIANT_G256, 1);
    await facade.addItem(VARIANT_G512, 2);

    const idemKeys = captures
      .filter((c) => c.method === 'POST' && c.url.endsWith('/items'))
      .map((c) => c.headers['idempotency-key']);
    expect(idemKeys.length).toBe(2);
    expect(idemKeys[0]).toBeTruthy();
    expect(idemKeys[1]).toBeTruthy();
    expect(idemKeys[0]).not.toBe(idemKeys[1]);
  });
});

// ---------------------------------------------------------------------------
// T17-AC03: Wait for authoritative response; pending controls prevent
// contradictory writes.
// ---------------------------------------------------------------------------
describe('T17-AC03: pending controls and authoritative totals', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('reports pending>0 while an intent is queued, then drops to 0', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();

    const promise = facade.addItem(VARIANT_G256, 1);
    await Promise.resolve();
    expect(facade.pending()).toBeGreaterThan(0);
    await promise;
    expect(facade.pending()).toBe(0);
  });

  it('serializes setQuantity(5) then setQuantity(2); the second If-Match binds to the first response version', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();
    await facade.addItem(VARIANT_G256, 1);
    const itemId = facade.cart()?.items[0]?.id ?? '';

    const p1 = facade.setQuantity(itemId, 5);
    const p2 = facade.setQuantity(itemId, 2);
    await Promise.all([p1, p2]);

    const patches = patchesTo(facade.cartId ?? '', itemId);
    expect(patches.length).toBe(2);
    expect(patches[0]?.headers['if-match']).toBe('"2"');
    expect(patches[1]?.headers['if-match']).toBe('"3"');
    expect(facade.itemCount()).toBe(2);
    expect(facade.cart()?.version).toBe(4);
  });

  it('only mutates itemCount after the server confirms the change', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();
    const before = facade.itemCount();
    await facade.addItem(VARIANT_G256, 3);
    expect(facade.itemCount()).toBe(before + 3);
  });
});

// ---------------------------------------------------------------------------
// T17-AC04: 409 requires refetch + explicit user correction. No blind
// replay of an absolute quantity.
// ---------------------------------------------------------------------------
describe('T17-AC04: 409 conflict surfaces a recovery signal and defers replay', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('surfaces the conflict on the conflict signal and refetches the cart', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();
    const cartId = facade.cartId ?? '';

    // Advance the server-side cart out-of-band while the facade
    // still believes version is 1. The next facade mutation will
    // dispatch If-Match: "1" and receive a 409 CART_VERSION_CONFLICT.
    const facadeCart = facade.cart();
    expect(facadeCart).not.toBeNull();
    // Use the cart-domain directly to seed the next version. The
    // facade never sees this; its local cart snapshot stays at v1.
    const sessionId = readDemoSessionId();
    const seed = currentDomain.addCartItem({
      sessionId,
      cartId,
      ifMatch: '"1"',
      idempotencyKey: 'oob-seed',
      variantId: VARIANT_S256,
      quantity: 1,
    });
    expect(seed.ok).toBe(true);

    captures.length = 0;
    await facade.addItem(VARIANT_G256, 1).catch(() => undefined);

    expect(facade.conflict()).not.toBeNull();
    expect(facade.conflict()?.code).toBe('CART_VERSION_CONFLICT');

    // The refetch is fire-and-forget; wait for the queue to drain
    // so the GET request lands before the assertion runs.
    const queue = getQueue(facade);
    if (!queue) throw new Error('Expected CartMutationQueue');
    await settleQueue(queue);

    // The facade must have refetched the cart via GET after the 409.
    const refetchCalls = captures.filter(
      (c) => c.method === 'GET' && c.url.endsWith(`/carts/${cartId}`),
    );
    expect(refetchCalls.length).toBeGreaterThan(0);
    // The local cart snapshot must now reflect the post-OOB version.
    expect(facade.cart()?.version).toBe(2);
  });

  it('retry() re-submits the failed intent with the same Idempotency-Key and the new version', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();
    await facade.addItem(VARIANT_G256, 1);
    const cartId = facade.cartId ?? '';
    const itemId = facade.cart()?.items[0]?.id ?? '';

    // Seed an OOB version bump so the next setQuantity on the facade
    // sees a 409.
    const sessionId = readDemoSessionId();
    const oob = currentDomain.addCartItem({
      sessionId,
      cartId,
      ifMatch: '"2"',
      idempotencyKey: 'oob-retry',
      variantId: VARIANT_S256,
      quantity: 1,
    });
    expect(oob.ok).toBe(true);

    captures.length = 0;
    await facade.setQuantity(itemId, 4).catch(() => undefined);
    expect(facade.conflict()).not.toBeNull();

    const conflictKey = captures
      .filter((c) => c.method === 'PATCH')
      .map((c) => c.headers['idempotency-key'])
      .pop();

    captures.length = 0;
    await facade.retry();

    const retryPatch = captures.find((c) => c.method === 'PATCH');
    expect(retryPatch).toBeDefined();
    expect(retryPatch?.headers['idempotency-key']).toBe(conflictKey);
    // The retry must bind the new server-side version (v3), not the
    // stale v2 used by the failed intent.
    expect(retryPatch?.headers['if-match']).toBe('"3"');
  });

  it('does not auto-replay: a 409 leaves the visible cart at the pre-conflict version', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();
    await facade.addItem(VARIANT_G256, 1);

    const beforeVersion = facade.cart()?.version;

    const sessionId = readDemoSessionId();
    const cartId = facade.cartId ?? '';
    const oob = currentDomain.addCartItem({
      sessionId,
      cartId,
      ifMatch: `"${String(facade.cart()?.version ?? 0)}"`,
      idempotencyKey: 'oob-no-replay',
      variantId: VARIANT_S256,
      quantity: 1,
    });
    expect(oob.ok).toBe(true);

    // Fire a second intent that will 409.
    await facade.addItem(VARIANT_G512, 1).catch(() => undefined);
    const queue = getQueue(facade);
    if (!queue) throw new Error('Expected CartMutationQueue');
    await settleQueue(queue);
    // After the conflict + refetch, the version reflects the server,
    // but the line quantities that the facade displays match the
    // server's authoritative state (NOT a replayed intent).
    expect(facade.cart()?.items.length).toBe(2);
    expect(facade.cart()?.version).toBeGreaterThan(beforeVersion ?? 0);
  });
});

// ---------------------------------------------------------------------------
// T17-AC05: 401 is never invented for the unauthenticated demo. The
// documented 404/410/storage-loss paths surface as explicit signals.
// ---------------------------------------------------------------------------
describe('T17-AC05: 404/410/explicit recovery; no 401 path', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('404 NOT_FOUND flips the cartGone signal so the UI can offer a fresh start', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();
    // Drive the facade into the missing-cart branch by triggering an
    // addItem against a forced-missing cart via the test seam.
    facade._seedMissingCart();
    await facade.addItem(VARIANT_G256, 1).catch(() => undefined);
    expect(facade.cartGone()).toBe(true);
  });

  it('410 CART_EXPIRED flips the cartExpired signal so the UI can offer a fresh cart', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();
    const cartId = facade.cartId;
    // Advance the deterministic clock past the cart expiry.
    currentEnv.clock.advanceMs(CART_DURATION_MS + 1);

    await facade.addItem(VARIANT_G256, 1).catch(() => undefined);
    expect(facade.cartExpired()).toBe(true);
    // The local snapshot is dropped on 410 so the next ensureCart()
    // actually creates a fresh cart instead of seeing an "active"
    // status the server will reject.
    expect(facade.cart()).toBeNull();
    expect(cartId).not.toBeNull();
  });

  it('does not invent a 401 signal: there is no auth surface in this demo', () => {
    const facade = TestBed.inject(CartFacade);
    // The signal surface intentionally has no `unauthorized` / `401`
    // member. This test pins the contract: any future addition must
    // be a deliberate decision, not a derived assertion.
    const names = Object.keys(facade);
    expect(names.some((k) => k.toLowerCase().includes('unauthor'))).toBe(false);
    expect(names.some((k) => k.toLowerCase().includes('auth'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T24-AC03 regression: in-flight mutations against the just-ordered
// cart must not resurrect the cleared snapshot. A click on "Kosárba
// teszem" immediately before pressing "Demórendelés véglegesítése"
// can land an `addItem` intent in the queue at the exact moment the
// success page calls `resetOrderedCart()`; without a token gate the
// dispatch's successful resolution would call `applySuccess(...)` and
// the header would show the items the user already ordered.
// ---------------------------------------------------------------------------
describe('T24-AC03: in-flight mutation results are dropped after resetOrderedCart', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('does not resurrect the cart when an addItem resolves after resetOrderedCart', async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();
    const cartIdBefore = facade.cartId;
    expect(cartIdBefore).not.toBeNull();

    // Kick the in-flight addItem but do NOT await it yet: we want to
    // call `resetOrderedCart()` while the dispatch is in flight, so
    // the `applySuccess(...)` path is exercised AFTER the reset.
    const inFlight = facade.addItem(VARIANT_G256, 1);
    const ordered = currentEnv.repository.getCart(cartIdBefore ?? '');
    if (ordered) {
      currentEnv.repository.updateCart({ ...ordered, status: 'ordered' });
    }
    facade.resetOrderedCart();
    await inFlight;

    // The cart snapshot stays cleared; the header badge reads 0.
    expect(facade.cart()).toBeNull();
    expect(facade.itemCount()).toBe(0);
    // A fresh ensureCart() rebuilds the cart with a different id so
    // the post-reset purchase does not collide with the ordered one.
    await facade.ensureCart();
    expect(facade.cartId).not.toBe(cartIdBefore);
    expect(facade.itemCount()).toBe(0);
  });
});
describe('CartMutationQueue: serialized dispatch + pending count', () => {
  it('runs intents strictly in order and binds the version provided at dispatch time', async () => {
    const queue = new CartMutationQueue();
    let currentVersion = 1;
    const seenVersions: number[] = [];
    const seenKeys: string[] = [];

    const dispatcher = (inputs: {
      intent: MutationIntent;
      expectedVersion: number | null;
    }): Promise<DispatchResult> => {
      const version = inputs.expectedVersion;
      seenVersions.push(version ?? -1);
      seenKeys.push(inputs.intent.idempotencyKey);
      const next = (version ?? 0) + 1;
      currentVersion = next;
      return Promise.resolve({
        ok: true,
        cart: {
          id: 'cart-1',
          version: next,
          items: [],
          itemCount: 0,
          subtotal: { amount: 0, currency: 'HUF' },
          status: 'active',
          expiresAt: '2026-09-15T10:00:00.000Z',
        },
        replayed: false,
      });
    };

    queue.setVersionProvider(() => currentVersion);

    const p1 = queue.enqueue(
      { kind: 'addItem', idempotencyKey: 'k1', retry: false, payload: {} },
      dispatcher,
    );
    const p2 = queue.enqueue(
      { kind: 'addItem', idempotencyKey: 'k2', retry: false, payload: {} },
      dispatcher,
    );
    await Promise.all([p1, p2]);

    expect(seenVersions).toEqual([1, 2]);
    expect(seenKeys).toEqual(['k1', 'k2']);
  });

  it('pendingCount signal reflects the queue depth', async () => {
    const queue = new CartMutationQueue();
    queue.setVersionProvider(() => 1);
    let resolveDispatch: () => void = () => {
      // noop
    };
    const dispatcher = (): Promise<DispatchResult> =>
      new Promise<DispatchResult>((resolve) => {
        resolveDispatch = () => {
          resolve({
            ok: true,
            cart: {
              id: 'cart-1',
              version: 1,
              items: [],
              itemCount: 0,
              subtotal: { amount: 0, currency: 'HUF' },
              status: 'active',
              expiresAt: '2026-09-15T10:00:00.000Z',
            },
            replayed: false,
          });
        };
      });

    const p = queue.enqueue(
      { kind: 'addItem', idempotencyKey: 'k', retry: false, payload: {} },
      dispatcher,
    );
    await Promise.resolve();
    expect(queue.pendingCount()).toBe(1);
    resolveDispatch();
    await p;
    expect(queue.pendingCount()).toBe(0);
  });

  it('serialize=true is the default: parallel dispatch would race', async () => {
    const queue = new CartMutationQueue();
    queue.setVersionProvider(() => 1);
    const order: string[] = [];
    const make = (label: string): Promise<DispatchResult> =>
      new Promise<DispatchResult>((resolve) => {
        setTimeout(() => {
          order.push(label);
          resolve({
            ok: true,
            cart: {
              id: 'cart-1',
              version: 1,
              items: [],
              itemCount: 0,
              subtotal: { amount: 0, currency: 'HUF' },
              status: 'active',
              expiresAt: '2026-09-15T10:00:00.000Z',
            },
            replayed: false,
          });
        }, 10);
      });
    const a = queue.enqueue(
      { kind: 'addItem', idempotencyKey: 'a', retry: false, payload: {} },
      () => make('a'),
    );
    const b = queue.enqueue(
      { kind: 'addItem', idempotencyKey: 'b', retry: false, payload: {} },
      () => make('b'),
    );
    await Promise.all([a, b]);
    expect(order).toEqual(['a', 'b']);
  });
});
