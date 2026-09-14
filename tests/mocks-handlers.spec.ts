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

import { createHandlers } from '../src/mocks/create-handlers';
import { Repository } from '../src/mocks/repository';
import {
  createBrowserPersistence,
  snapshotKey,
  type MockSnapshot,
} from '../src/mocks/persistence';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
  parseScenarioFromLocation,
  resolveScenario,
} from '../src/mocks/scenarios';

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
      repository: new Repository(DEFAULT_SCENARIO, createDeterministicIds(1), createFixedClock('2026-09-14T10:00:00.000Z')),
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
      (globalThis as { sessionStorage?: Storage }).sessionStorage = original;
      warn.mockRestore();
    }
  });
});

describe('T05-AC06 scenario isolation', () => {
  it('two scenarios keep independent repositories and snapshot storage', () => {
    const repoA = new Repository({ ...DEFAULT_SCENARIO, name: 'isolated-A' }, createDeterministicIds(1), createFixedClock('2026-09-14T10:00:00.000Z'));
    const repoB = new Repository({ ...DEFAULT_SCENARIO, name: 'isolated-B' }, createDeterministicIds(2), createFixedClock('2026-09-14T10:00:00.000Z'));
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
