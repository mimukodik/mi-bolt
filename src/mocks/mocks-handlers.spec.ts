/**
 * T05 — MSW handler factory, repository, persistence, scenarios.
 *
 * Eight focused unit tests cover the strict acceptance criteria for
 * the T05 deliverable. The repository and persistence layers run in
 * the Node test environment without an MSW worker because they are
 * pure data structures; the handler factory is exercised as a
 * shape-only assertion.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createHandlers } from '../mocks/create-handlers';
import { Repository } from '../mocks/repository';
import {
  createBrowserPersistence,
  snapshotKey,
  type MockSnapshot,
  type PersistedCart,
} from '../mocks/persistence';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
  parseScenarioFromLocation,
  resolveScenario,
} from '../mocks/scenarios';
import { buildSnapshot } from './snapshot';
import { DEMO_PRODUCT } from './cart/cart.handlers';
import { server, useMswServer } from '../../tests/msw-server';

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

const SCENARIO_KEY = 'test-scenario';
const STORAGE_KEY = snapshotKey(SCENARIO_KEY);

function rawStorage(): Storage | null {
  return (globalThis as { sessionStorage?: Storage }).sessionStorage ?? null;
}

function clearStorage(): void {
  rawStorage()?.removeItem(STORAGE_KEY);
}

function writeRaw(value: string): void {
  rawStorage()?.setItem(STORAGE_KEY, value);
}

function makeSnapshot(overrides: Partial<MockSnapshot> = {}): MockSnapshot {
  return {
    schemaVersion: 1,
    providerId: 'mi-bolt',
    simulatedSessionId: 'sess-test-12345',
    savedAt: '2026-09-14T11:00:00.000Z',
    expiresAt: '2026-09-21T11:00:00.000Z',
    cart: undefined,
    receipts: [],
    ...overrides,
  };
}

describe('T05-AC02 handler factory', () => {
  it('returns a RequestHandler[] with the dispatcher shell and exposes the same factory for browser and node', () => {
    const options = {
      repository: new Repository(
        DEFAULT_SCENARIO,
        createDeterministicIds(1),
        createFixedClock('2026-09-14T10:00:00.000Z'),
      ),
      clock: createFixedClock('2026-09-14T10:00:00.000Z'),
      ids: createDeterministicIds(1),
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
    const handlersA = createHandlers(options);
    const handlersB = createHandlers(options);
    expect(Array.isArray(handlersA)).toBe(true);
    expect(Array.isArray(handlersB)).toBe(true);
    expect(handlersA.length).toBeGreaterThan(0);
    // Each MSW handler exposes a `test` predicate used to match requests;
    // verifying it on every entry proves we returned real handlers, not
    // an empty placeholder list.
    for (const h of handlersA) {
      expect(typeof (h as { test?: unknown }).test).toBe('function');
    }
    // Same inputs → same shape (the factory is deterministic).
    expect(handlersA.length).toBe(handlersB.length);
  });
});

describe('T05-AC02 clock + ids injection', () => {
  it('clock.advanceMs shifts now() deterministically and ids produce contract-conforming values', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    expect(clock.now()).toBe('2026-09-14T10:00:00.000Z');
    clock.advanceMs(60_000);
    expect(clock.now()).toBe('2026-09-14T10:01:00.000Z');
    clock.advanceMs(3_600_000);
    expect(clock.now()).toBe('2026-09-14T11:01:00.000Z');

    const ids = createDeterministicIds(42);
    expect(ids.uuid()).toBe('e2e-16-0001');
    expect(ids.uuid()).toBe('e2e-16-0002');
    expect(ids.uuid()).toBe('e2e-16-0003');
    for (let i = 0; i < 5; i++) {
      expect(ids.uuid()).toMatch(/^[a-zA-Z0-9_-]{8,80}$/);
    }
  });
});

describe('T05-AC03 / T05-AC04 persistence', () => {
  beforeEach(() => {
    clearStorage();
  });

  it('round-trips an allowlisted snapshot through save + hydrate', () => {
    const persistence = createBrowserPersistence({
      nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
    });
    const snapshot = makeSnapshot({
      cart: {
        id: 'cart-test-001',
        version: 3,
        items: [
          { id: 'line-1', variantId: 'demo-one-5g-graphite-256', quantity: 2 },
          { id: 'line-2', variantId: 'demo-one-5g-silver-512', quantity: 1 },
        ],
        lastUpdatedAt: '2026-09-14T11:00:00.000Z',
      },
      receipts: [
        {
          id: 'order-test-001',
          orderNumber: 'DEMO-000001',
          total: { amount: 683_980, currency: 'HUF' },
          paymentMethod: 'demo_card',
          createdAt: '2026-09-14T11:00:00.000Z',
          items: [
            {
              variantId: 'demo-one-5g-graphite-256',
              quantity: 2,
              unitPrice: { amount: 339_990, currency: 'HUF' },
              lineTotal: { amount: 679_980, currency: 'HUF' },
            },
          ],
        },
      ],
    });
    persistence.save(SCENARIO_KEY, snapshot);
    expect(persistence.hydrate(SCENARIO_KEY)).toEqual(snapshot);
  });

  it('rejects malformed JSON and clears the corrupted entry', () => {
    writeRaw('not-valid-json{{');
    const persistence = createBrowserPersistence({
      nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
    });
    expect(persistence.hydrate(SCENARIO_KEY)).toBeNull();
    expect(rawStorage()?.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rejects an expired snapshot (>7 days old) and clears it', () => {
    const stale = makeSnapshot({
      savedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-08T00:00:00.000Z',
    });
    writeRaw(JSON.stringify(stale));
    const persistence = createBrowserPersistence({
      nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
    });
    expect(persistence.hydrate(SCENARIO_KEY)).toBeNull();
    expect(rawStorage()?.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rejects a version-mismatched snapshot and clears it', () => {
    writeRaw(JSON.stringify(makeSnapshot({ schemaVersion: 99 })));
    const persistence = createBrowserPersistence({
      nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
    });
    expect(persistence.hydrate(SCENARIO_KEY)).toBeNull();
    expect(rawStorage()?.getItem(STORAGE_KEY)).toBeNull();
  });

  it('storage-denied mode keeps state in memory and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* suppress expected warning */
    });
    const original = rawStorage();
    const denial: Storage = {
      length: 0,
      clear: () => undefined,
      getItem: () => null,
      key: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('QuotaExceededError: sessionStorage denied');
      },
    };
    (globalThis as { sessionStorage?: Storage }).sessionStorage = denial;
    try {
      const persistence = createBrowserPersistence({
        nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
      });
      const snapshot = makeSnapshot();
      persistence.save(SCENARIO_KEY, snapshot);
      expect(warn).toHaveBeenCalledTimes(1);
      // Subsequent saves do not warn again.
      persistence.save(SCENARIO_KEY, snapshot);
      expect(warn).toHaveBeenCalledTimes(1);
      // Hydrate returns the in-memory copy.
      expect(persistence.hydrate(SCENARIO_KEY)).toEqual(snapshot);
    } finally {
      (globalThis as { sessionStorage?: Storage | null }).sessionStorage = original;
      warn.mockRestore();
    }
  });
});

describe('T05-AC06 scenario isolation', () => {
  it('two scenarios keep independent repositories and snapshot storage', () => {
    const repoA = new Repository(
      { ...DEFAULT_SCENARIO, name: 'isolated-A' },
      createDeterministicIds(1),
      createFixedClock('2026-09-14T10:00:00.000Z'),
    );
    const repoB = new Repository(
      { ...DEFAULT_SCENARIO, name: 'isolated-B' },
      createDeterministicIds(2),
      createFixedClock('2026-09-14T10:00:00.000Z'),
    );
    repoA.createCart('sess-a');
    expect(repoA.listCarts()).toHaveLength(1);
    expect(repoB.listCarts()).toHaveLength(0);

    clearStorage();
    const persistence = createBrowserPersistence({
      nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
    });
    const snapshot = makeSnapshot();
    persistence.save('isolated-A', snapshot);
    // B's snapshot key is distinct from A's, so a hydrate for B sees nothing.
    expect(persistence.hydrate('isolated-B')).toBeNull();
    expect(persistence.hydrate('isolated-A')).toEqual(snapshot);
  });

  it('resolveScenario returns the descriptor for known names and a fresh default for unknown ones', () => {
    expect(resolveScenario('default').name).toBe('default');
    expect(resolveScenario(null).name).toBe('default');
    const unknown = resolveScenario('does-not-exist');
    expect(unknown.name).toBe('does-not-exist');
    expect(unknown.seed).toBe(DEFAULT_SCENARIO.seed);
  });

  it('parseScenarioFromLocation reads the mi-scenario query parameter', () => {
    const original = (globalThis as { location?: Location }).location;
    (globalThis as { location?: unknown }).location = {
      search: '?mi-scenario=happy-path&other=ignored',
    };
    try {
      expect(parseScenarioFromLocation().name).toBe('happy-path');
    } finally {
      if (original === undefined) {
        delete (globalThis as { location?: unknown }).location;
      } else {
        (globalThis as { location?: Location }).location = original;
      }
    }
    // Missing location / missing param falls back to default.
    delete (globalThis as { location?: unknown }).location;
    expect(parseScenarioFromLocation().name).toBe('default');
  });
});

describe('FIX-10-AC07 and FIX-10-AC08 snapshot persistence and cart reconnection', () => {
  it('calls persist callback on mutating cart requests and not on read requests', async () => {
    const persistSpy = vi.fn();
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);
    const handlers = createHandlers({
      repository,
      clock,
      ids,
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
      persist: persistSpy,
    });
    server.use(...handlers);

    const sessionId = 'sess-mutating-test';
    const postRes = await fetch('http://localhost/api/v1/carts', {
      method: 'POST',
      headers: {
        'X-Demo-Session': sessionId,
        'Idempotency-Key': 'idem-key-mutating-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ providerId: 'mi-bolt' }),
    });
    expect(postRes.status).toBe(201);
    const rawBody: unknown = await postRes.json();
    const cartId =
      typeof rawBody === 'object' &&
      rawBody !== null &&
      'id' in rawBody &&
      typeof rawBody.id === 'string'
        ? rawBody.id
        : '';
    expect(cartId).not.toBe('');
    expect(persistSpy).toHaveBeenCalledTimes(1);
    expect(persistSpy).toHaveBeenCalledWith(sessionId);

    persistSpy.mockClear();

    const getRes = await fetch(`http://localhost/api/v1/carts/${cartId}`, {
      method: 'GET',
      headers: {
        'X-Demo-Session': sessionId,
      },
    });
    expect(getRes.status).toBe(200);
    expect(persistSpy).not.toHaveBeenCalled();
  });

  it('round-trips buildSnapshot through persistence save and hydrate matching line ids, variant ids, and quantities', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);

    const persistedCart: PersistedCart = {
      id: 'cart-roundtrip-1',
      version: 2,
      items: [{ id: 'line-1', variantId: 'demo-one-5g-graphite-256', quantity: 2 }],
      lastUpdatedAt: '2026-09-14T10:00:00.000Z',
    };
    repository.loadPersistedCart(persistedCart, 'sess-12345');

    const nowMs = Date.parse('2026-09-14T10:00:00.000Z');
    const built = buildSnapshot(repository, 'sess-12345', nowMs);

    const scenarioName = 'snapshot-roundtrip';
    const persistence = createBrowserPersistence({
      nowMs: () => nowMs,
    });
    persistence.save(scenarioName, built);
    const hydrated = persistence.hydrate(scenarioName);

    expect(hydrated).not.toBeNull();
    const repoCart = repository.findCartBySession('sess-12345');
    expect(repoCart).toBeDefined();
    expect(hydrated?.cart?.items).toEqual(
      repoCart?.items.map((it) => ({
        id: it.id,
        variantId: it.variantId,
        quantity: it.quantity,
      })),
    );
  });

  it('buildSnapshot contains only allowlisted keys', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);
    repository.ensureCart('sess-12345');

    const built = buildSnapshot(repository, 'sess-12345', Date.now());
    expect(Object.keys(built).sort()).toEqual([
      'cart',
      'expiresAt',
      'providerId',
      'receipts',
      'savedAt',
      'schemaVersion',
      'simulatedSessionId',
    ]);
  });

  it('reconnects existing persisted cart on ensureCart and findCartBySession (FIX-10-AC08)', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);

    const persistedCart: PersistedCart = {
      id: 'cart-persisted-x',
      version: 1,
      items: [{ id: 'line-1', variantId: 'demo-one-5g-graphite-256', quantity: 1 }],
      lastUpdatedAt: '2026-09-14T10:00:00.000Z',
    };
    repository.loadPersistedCart(persistedCart, 'sess-x');

    expect(repository.ensureCart('sess-x').id).toBe(persistedCart.id);
    expect(repository.findCartBySession('sess-x')?.id).toBe(persistedCart.id);
  });

  it('buildSnapshot round-trips a well-formed receipt item unchanged', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);
    repository.saveOrder({
      id: 'order-wellformed-1',
      orderNumber: 'DEMO-000001',
      sessionId: 'sess-wellformed',
      createdAt: '2026-09-14T10:00:00.000Z',
      total: { amount: 10_000, currency: 'HUF' },
      paymentMethod: 'demo_card',
      items: [
        {
          variantId: 'demo-one-5g-graphite-256',
          quantity: 2,
          unitPrice: { amount: 5_000, currency: 'HUF' },
          lineTotal: { amount: 10_000, currency: 'HUF' },
        },
      ],
    });

    const built = buildSnapshot(repository, 'sess-wellformed', Date.now());

    expect(built.receipts).toHaveLength(1);
    expect(built.receipts[0].items).toEqual([
      {
        variantId: 'demo-one-5g-graphite-256',
        quantity: 2,
        unitPrice: { amount: 5_000, currency: 'HUF' },
        lineTotal: { amount: 10_000, currency: 'HUF' },
      },
    ]);
  });

  it('buildSnapshot degrades a malformed receipt item instead of dropping it', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);
    repository.saveOrder({
      id: 'order-malformed-1',
      orderNumber: 'DEMO-000002',
      sessionId: 'sess-malformed',
      createdAt: '2026-09-14T10:00:00.000Z',
      total: { amount: 0, currency: 'HUF' },
      items: [{ variantId: 42, quantity: 'two', unitPrice: null, lineTotal: 'not-money' }],
    });

    const built = buildSnapshot(repository, 'sess-malformed', Date.now());

    expect(built.receipts).toHaveLength(1);
    expect(built.receipts[0].items).toEqual([
      {
        variantId: '',
        quantity: 1,
        unitPrice: { amount: 0, currency: 'HUF' },
        lineTotal: { amount: 0, currency: 'HUF' },
      },
    ]);
  });

  it('buildSnapshot maps paymentMethod to demo_cod only when the receipt says so', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);
    repository.saveOrder({
      id: 'order-cod-1',
      orderNumber: 'DEMO-000003',
      sessionId: 'sess-payment',
      createdAt: '2026-09-14T10:00:00.000Z',
      total: { amount: 0, currency: 'HUF' },
      paymentMethod: 'demo_cod',
    });
    repository.saveOrder({
      id: 'order-other-1',
      orderNumber: 'DEMO-000004',
      sessionId: 'sess-payment',
      createdAt: '2026-09-14T10:00:00.000Z',
      total: { amount: 0, currency: 'HUF' },
      paymentMethod: 'something-else',
    });
    repository.saveOrder({
      id: 'order-absent-1',
      orderNumber: 'DEMO-000005',
      sessionId: 'sess-payment',
      createdAt: '2026-09-14T10:00:00.000Z',
      total: { amount: 0, currency: 'HUF' },
    });

    const built = buildSnapshot(repository, 'sess-payment', Date.now());
    const byId = (id: string) => built.receipts.find((r) => r.id === id);

    expect(byId('order-cod-1')?.paymentMethod).toBe('demo_cod');
    expect(byId('order-other-1')?.paymentMethod).toBe('demo_card');
    expect(byId('order-absent-1')?.paymentMethod).toBe('demo_card');
  });

  it('buildSnapshot produces an empty items array when the order has no items', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);
    repository.saveOrder({
      id: 'order-noitems-1',
      orderNumber: 'DEMO-000006',
      sessionId: 'sess-noitems',
      createdAt: '2026-09-14T10:00:00.000Z',
      total: { amount: 0, currency: 'HUF' },
    });

    const built = buildSnapshot(repository, 'sess-noitems', Date.now());

    expect(built.receipts).toHaveLength(1);
    expect(built.receipts[0].items).toEqual([]);
  });
});

describe('ensureCart does not resurrect an expired restored cart', () => {
  it('still returns an unexpired restored cart (no regression on FIX-10-AC08)', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);

    const persistedCart: PersistedCart = {
      id: 'cart-unexpired-x',
      version: 1,
      items: [{ id: 'line-1', variantId: 'demo-one-5g-graphite-256', quantity: 1 }],
      lastUpdatedAt: '2026-09-14T10:00:00.000Z',
    };
    repository.loadPersistedCart(persistedCart, 'sess-unexpired');
    // loadPersistedCart sets expiresAt to lastUpdatedAt + 24h; the clock has
    // not advanced, so the cart is still well within its window.
    clock.advanceMs(23 * 60 * 60 * 1000);

    expect(repository.ensureCart('sess-unexpired').id).toBe(persistedCart.id);
  });

  it('mints a fresh, empty cart when the restored cart has already expired', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);

    const persistedCart: PersistedCart = {
      id: 'cart-expired-x',
      version: 1,
      items: [{ id: 'line-1', variantId: 'demo-one-5g-graphite-256', quantity: 1 }],
      lastUpdatedAt: '2026-09-14T10:00:00.000Z',
    };
    repository.loadPersistedCart(persistedCart, 'sess-expired');
    // loadPersistedCart's expiresAt is lastUpdatedAt + 24h; a six-day-old
    // snapshot (well inside persistence's 7-day MAX_AGE_MS) still carries a
    // cart that is long past that 24h mark.
    clock.advanceMs(6 * 24 * 60 * 60 * 1000);

    const fresh = repository.ensureCart('sess-expired');

    expect(fresh.id).not.toBe(persistedCart.id);
    expect(fresh.items).toEqual([]);
    expect(repository.findCartBySession('sess-expired')?.id).toBe(fresh.id);
  });

  it('treats an unparseable expiresAt as not expired (matches CartDomain.isExpired)', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);

    // Built directly through createCart/updateCart rather than
    // loadPersistedCart: loadPersistedCart derives expiresAt from
    // lastUpdatedAt via `new Date(...).toISOString()`, which throws on
    // an unparseable input rather than producing an unparseable
    // expiresAt string. This isolates the guard on `cart.expiresAt`
    // itself, per "Do not change loadPersistedCart's expiry arithmetic".
    const created = repository.createCart('sess-bad-date');
    repository.updateCart({ ...created, expiresAt: 'not-a-real-date' });

    expect(repository.ensureCart('sess-bad-date').id).toBe(created.id);
  });

  it('still mints a fresh cart when the existing cart is not active (pre-existing arm)', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);

    const created = repository.createCart('sess-ordered');
    repository.updateCart({ ...created, status: 'ordered' });

    const fresh = repository.ensureCart('sess-ordered');

    expect(fresh.id).not.toBe(created.id);
    expect(fresh.status).toBe('active');
  });
});
