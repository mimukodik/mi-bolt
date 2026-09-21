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
  SNAPSHOT_SCHEMA_VERSION,
  createBrowserPersistence,
  snapshotKey,
  type MockSnapshot,
  type PersistedCart,
  type PersistedCheckoutDraft,
} from '../mocks/persistence';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
  parseScenarioFromLocation,
  resolveScenario,
} from '../mocks/scenarios';
import { buildSnapshot } from './snapshot';
import { CartStore, type VariantLookupFn } from './cart/cart-store';
import { CheckoutStore } from './checkout/checkout-store';
import { OrderStore } from './orders/order-store';
import { IdempotencyStore } from './idempotency';
import { DEMO_PRODUCT } from './cart/cart.handlers';
import type { VariantLookup } from './catalog/catalog-store';
import { useMswServer } from '../../tests/msw-server';

// Stand-in literals typed directly against `VariantLookup`'s own
// shape — the generated SDK types — and shared by every `describe`
// block that needs a successful lookup hit. `DEMO_PRODUCT` lives in
// the repository's mock-local shape (it omits `slug`/`releasedAt`
// the SDK requires), so wrapping it in a cast hides a real gap.
const LOOKUP_PRODUCT: VariantLookup['product'] = {
  id: 'p-01',
  slug: 'demo-one-5g',
  brand: 'MiBolt Demo',
  name: 'Demo One 5G',
  highlights: [],
  is5g: true,
  releasedAt: '2026-01-01T00:00:00.000Z',
  description: 'Demo',
  variants: [],
  specGroups: [],
};

const LOOKUP_VARIANT: VariantLookup['variant'] = {
  id: 'demo-one-5g-graphite-256',
  slug: 'demo-one-5g-graphite-256',
  colorCode: 'graphite',
  colorName: 'Grafit',
  swatchHex: '#343B43',
  storageGb: 256,
  price: { amount: 339_990, currency: 'HUF' },
  availability: 'in_stock',
  maxQuantity: 5,
  images: [
    {
      id: 'img-demo-one-5g-graphite-256',
      src: '/assets/demo/demo-one-5g-graphite-256.png',
      alt: 'Demo One 5G Grafit',
      width: 800,
      height: 600,
    },
  ],
};

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
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    providerId: 'mi-bolt',
    simulatedSessionId: 'sess-test-12345',
    savedAt: '2026-09-14T11:00:00.000Z',
    expiresAt: '2026-09-21T11:00:00.000Z',
    cart: undefined,
    paymentIntents: [],
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
        createdAt: '2026-09-14T10:00:00.000Z',
        expiresAt: '2026-09-15T10:00:00.000Z',
        items: [
          { variantId: 'demo-one-5g-graphite-256', quantity: 2 },
          { variantId: 'demo-one-5g-silver-512', quantity: 1 },
        ],
      },
      checkoutDraft: {
        contact: { fullName: 'Test User', email: 'test@example.com', phone: '+36123456789' },
        billing: {
          name: 'Test User',
          address: {
            countryCode: 'HU',
            postalCode: '1111',
            city: 'Budapest',
            line1: 'Fo utca 1',
          },
        },
        delivery: { optionId: 'pickup_point' },
        payment: { method: 'card' },
      },
      paymentIntents: [
        {
          id: 'pi-1',
          createdAt: '2026-09-14T11:00:00.000Z',
          expiresAt: '2026-09-14T11:30:00.000Z',
          redirectUrl: '/demo-fizetes/pi-1',
          returnUrl: '/penztar?paymentIntentId=pi-1',
          status: 'requires_action',
          amount: { amount: 683_980, currency: 'HUF' },
        },
      ],
      receipts: [
        {
          id: 'order-test-001',
          orderNumber: 'DEMO-000001',
          status: 'confirmed',
          createdAt: '2026-09-14T11:00:00.000Z',
          contactEmail: 'test@example.com',
          notice: 'A demo notification.',
          paymentMethod: 'card',
          billing: {
            name: 'Test User',
            address: {
              countryCode: 'HU',
              postalCode: '1111',
              city: 'Budapest',
              line1: 'Fo utca 1',
            },
          },
          delivery: {
            optionId: 'home_delivery',
            address: {
              countryCode: 'HU',
              postalCode: '1111',
              city: 'Budapest',
              line1: 'Fo utca 1',
            },
          },
          items: [
            {
              variantId: 'demo-one-5g-graphite-256',
              productName: 'Demo One 5G',
              colorName: 'Graphite',
              storageGb: 256,
              quantity: 2,
              unitPrice: { amount: 339_990, currency: 'HUF' },
              lineTotal: { amount: 679_980, currency: 'HUF' },
            },
          ],
          subtotal: { amount: 679_980, currency: 'HUF' },
          shippingFee: { amount: 1490, currency: 'HUF' },
          paymentFee: { amount: 0, currency: 'HUF' },
          total: { amount: 683_970, currency: 'HUF' },
        },
      ],
    });
    persistence.save(SCENARIO_KEY, snapshot);
    expect(persistence.hydrate(SCENARIO_KEY)).toEqual(snapshot);
    expect(persistence.isDenied()).toBe(false);
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
      // FIX-70-AC05: `isDenied()` is what lets `AppShell` drive
      // `DemoNotice`'s 'memory' state — before it existed this call
      // failed to compile (no such method on `Persistence`).
      expect(persistence.isDenied()).toBe(true);
    } finally {
      (globalThis as { sessionStorage?: Storage | null }).sessionStorage = original;
      warn.mockRestore();
    }
  });

  it('falls back to in-memory storage when globalThis.sessionStorage is not storage-like', () => {
    // Reject arm of `hasSessionStorage` (src/mocks/persistence.ts):
    // an object present at `globalThis.sessionStorage` but missing the
    // getItem/setItem/removeItem methods is treated the same as no
    // sessionStorage at all, rather than being handed to the adapter and
    // failing on first use.
    const original = rawStorage();
    (globalThis as { sessionStorage?: unknown }).sessionStorage = { notAStorage: true };
    try {
      const persistence = createBrowserPersistence({
        nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
      });
      const snapshot = makeSnapshot();
      persistence.save(SCENARIO_KEY, snapshot);
      expect(persistence.hydrate(SCENARIO_KEY)).toEqual(snapshot);
      expect(persistence.isDenied()).toBe(false);
    } finally {
      (globalThis as { sessionStorage?: Storage | null }).sessionStorage = original;
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

  it('parseScenarioFromLocation falls back to default when location.search is not a string', () => {
    // Reject arm of `hasLocationSearch` (src/mocks/scenarios.ts): a
    // `location` object is present, but `search` is missing/non-string.
    // An array is used (rather than e.g. a number) because
    // `new URLSearchParams(...)` would otherwise silently coerce a
    // non-string value instead of surfacing the guard's absence.
    const original = (globalThis as { location?: Location }).location;
    (globalThis as { location?: unknown }).location = { search: ['not-a-string'] };
    try {
      expect(parseScenarioFromLocation().name).toBe('default');
    } finally {
      if (original === undefined) {
        delete (globalThis as { location?: unknown }).location;
      } else {
        (globalThis as { location?: Location }).location = original;
      }
    }
  });

  it('parseScenarioFromLocation falls back to default when globalThis.location is not an object', () => {
    // Reject arm of `hasLocationSearch` at its outer `isRecord` check.
    const original = (globalThis as { location?: Location }).location;
    (globalThis as { location?: unknown }).location = 'not-an-object';
    try {
      expect(parseScenarioFromLocation().name).toBe('default');
    } finally {
      if (original === undefined) {
        delete (globalThis as { location?: unknown }).location;
      } else {
        (globalThis as { location?: Location }).location = original;
      }
    }
  });
});

describe('snapshot v2 — allowlist rejects unknown keys at every level', () => {
  beforeEach(() => {
    clearStorage();
  });

  // Each case adds an unknown key at the level named in the test name;
  // every nested validator has its own allowlist and rejects the same way.
  const cases: readonly { name: string; patch: (base: MockSnapshot) => MockSnapshot }[] = [
    {
      name: 'top-level',
      patch: (b) => ({ ...b, extra: 'junk' }),
    },
    {
      name: 'cart',
      patch: (b) => ({
        ...b,
        cart: {
          id: 'c',
          version: 1,
          createdAt: '2026-09-14T10:00:00.000Z',
          expiresAt: '2026-09-15T10:00:00.000Z',
          items: [],
          extra: 'junk',
        },
      }),
    },
    {
      name: 'cart line',
      patch: (b) => ({
        ...b,
        cart: {
          id: 'c',
          version: 1,
          createdAt: '2026-09-14T10:00:00.000Z',
          expiresAt: '2026-09-15T10:00:00.000Z',
          items: [{ variantId: 'x', quantity: 1, extra: 'junk' }],
        },
      }),
    },
    {
      name: 'checkoutDraft',
      patch: (b) => ({ ...b, checkoutDraft: { ...(b.checkoutDraft ?? {}), extra: 'junk' } }),
    },
    {
      name: 'contact',
      patch: (b) => ({
        ...b,
        checkoutDraft: {
          ...(b.checkoutDraft ?? {}),
          contact: { fullName: 'a', email: 'a@b.c', phone: '+361', extra: 'junk' },
        },
      }),
    },
    {
      name: 'billing',
      patch: (b) => ({
        ...b,
        checkoutDraft: {
          ...(b.checkoutDraft ?? {}),
          billing: {
            name: 'a',
            address: { countryCode: 'HU', postalCode: '1', city: 'a', line1: 'a' },
            extra: 'junk',
          },
        },
      }),
    },
    {
      name: 'address',
      patch: (b) => ({
        ...b,
        checkoutDraft: {
          ...(b.checkoutDraft ?? {}),
          billing: {
            name: 'a',
            address: { countryCode: 'HU', postalCode: '1', city: 'a', line1: 'a', extra: 'junk' },
          },
        },
      }),
    },
    {
      name: 'delivery (home)',
      patch: (b) => ({
        ...b,
        checkoutDraft: {
          ...(b.checkoutDraft ?? {}),
          delivery: {
            optionId: 'home_delivery',
            address: { countryCode: 'HU', postalCode: '1', city: 'a', line1: 'a' },
            extra: 'junk',
          },
        },
      }),
    },
    {
      name: 'delivery (pickup)',
      patch: (b) => ({
        ...b,
        checkoutDraft: {
          ...(b.checkoutDraft ?? {}),
          delivery: { optionId: 'pickup_point', extra: 'junk' },
        },
      }),
    },
    {
      name: 'payment',
      patch: (b) => ({
        ...b,
        checkoutDraft: {
          ...(b.checkoutDraft ?? {}),
          payment: { method: 'card', extra: 'junk' },
        },
      }),
    },
    {
      name: 'paymentIntent',
      patch: (b) => ({
        ...b,
        paymentIntents: [
          {
            id: 'pi-x',
            createdAt: '2026-09-14T11:00:00.000Z',
            expiresAt: '2026-09-14T11:30:00.000Z',
            redirectUrl: '/x',
            returnUrl: '/y',
            status: 'requires_action',
            amount: { amount: 0, currency: 'HUF' },
            extra: 'junk',
          },
        ],
      }),
    },
    {
      name: 'orderReceipt',
      patch: (b) => ({
        ...b,
        receipts: [
          {
            id: 'r-1',
            orderNumber: 'DEMO-000001',
            status: 'confirmed' as const,
            createdAt: '2026-09-14T11:00:00.000Z',
            contactEmail: 'a@b.c',
            notice: 'n',
            paymentMethod: 'card' as const,
            billing: {
              name: 'a',
              address: { countryCode: 'HU' as const, postalCode: '1', city: 'a', line1: 'a' },
            },
            delivery: { optionId: 'pickup_point' as const },
            items: [],
            subtotal: { amount: 0, currency: 'HUF' as const },
            shippingFee: { amount: 0, currency: 'HUF' as const },
            paymentFee: { amount: 0, currency: 'HUF' as const },
            total: { amount: 0, currency: 'HUF' as const },
            extra: 'junk',
          },
        ],
      }),
    },
    {
      name: 'orderLine',
      patch: (b) => ({
        ...b,
        receipts: [
          {
            id: 'r-1',
            orderNumber: 'DEMO-000001',
            status: 'confirmed' as const,
            createdAt: '2026-09-14T11:00:00.000Z',
            contactEmail: 'a@b.c',
            notice: 'n',
            paymentMethod: 'card' as const,
            billing: {
              name: 'a',
              address: { countryCode: 'HU' as const, postalCode: '1', city: 'a', line1: 'a' },
            },
            delivery: { optionId: 'pickup_point' as const },
            items: [
              {
                variantId: 'v',
                productName: 'p',
                colorName: 'c',
                storageGb: 256 as const,
                quantity: 1,
                unitPrice: { amount: 0, currency: 'HUF' as const },
                lineTotal: { amount: 0, currency: 'HUF' as const },
                extra: 'junk',
              },
            ],
            subtotal: { amount: 0, currency: 'HUF' as const },
            shippingFee: { amount: 0, currency: 'HUF' as const },
            paymentFee: { amount: 0, currency: 'HUF' as const },
            total: { amount: 0, currency: 'HUF' as const },
          },
        ],
      }),
    },
  ];

  for (const { name, patch } of cases) {
    it(`rejects an unknown key at the ${name} level`, () => {
      writeRaw(JSON.stringify(patch(makeSnapshot())));
      const persistence = createBrowserPersistence({
        nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
      });
      expect(persistence.hydrate(SCENARIO_KEY)).toBeNull();
      expect(rawStorage()?.getItem(STORAGE_KEY)).toBeNull();
    });
  }
});

describe('CartStore seed / persist round-trip (MIM-212 Unit 1)', () => {
  // Minimal VariantLookupFn that returns a valid hit for the one
  // variantId used in the test data, so the cart store's reconcile
  // pass does not drop the seeded line.
  const lookup: VariantLookupFn = (variantId): VariantLookup | undefined => {
    if (variantId === 'demo-one-5g-graphite-256') {
      return { product: LOOKUP_PRODUCT, variant: LOOKUP_VARIANT };
    }
    return undefined;
  };

  it('seedFromSnapshot seeds lines, get() returns them', () => {
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
    const store = new CartStore(options, lookup);
    const persisted: PersistedCart = {
      id: 'cart-seeded-1',
      version: 5,
      createdAt: '2026-09-14T10:00:00.000Z',
      expiresAt: '2026-09-15T10:00:00.000Z',
      items: [{ variantId: 'demo-one-5g-graphite-256', quantity: 3 }],
    };
    store.seedFromSnapshot('sess-seed', persisted);
    const result = store.get('sess-seed');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cart.id).toBe('cart-seeded-1');
    expect(result.cart.version).toBe(5);
    expect(result.cart.items).toHaveLength(1);
    expect(result.cart.items[0].variantId).toBe('demo-one-5g-graphite-256');
    expect(result.cart.items[0].quantity).toBe(3);
  });

  it('toPersistedCart round-trips through seedFromSnapshot', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const options = {
      repository: new Repository(DEFAULT_SCENARIO, createDeterministicIds(1), clock),
      clock,
      ids: createDeterministicIds(1),
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
    const store = new CartStore(options, lookup);
    // add a line through the public API
    const firstAdd = store.add('sess-rt', '"1"', 'demo-one-5g-graphite-256', 2);
    expect(firstAdd.ok).toBe(true);

    const persisted = store.toPersistedCart('sess-rt');
    expect(persisted).toBeDefined();
    if (!persisted) return;
    expect(persisted.items).toEqual([{ variantId: 'demo-one-5g-graphite-256', quantity: 2 }]);

    // Second store, seeded from the first store's persisted snapshot.
    const store2 = new CartStore(options, lookup);
    store2.seedFromSnapshot('sess-rt-2', persisted);
    const fromSeed = store2.toPersistedCart('sess-rt-2');
    expect(fromSeed).toEqual(persisted);
  });

  it('a seeded cart with a past expiresAt 410s on the next get()', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const options = {
      repository: new Repository(DEFAULT_SCENARIO, createDeterministicIds(1), clock),
      clock,
      ids: createDeterministicIds(1),
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
    const store = new CartStore(options, lookup);
    const stale: PersistedCart = {
      id: 'cart-stale-1',
      version: 1,
      createdAt: '2026-09-14T09:00:00.000Z',
      // expiresAt is in the past relative to the seeded clock.
      expiresAt: '2026-09-14T09:30:00.000Z',
      items: [{ variantId: 'demo-one-5g-graphite-256', quantity: 1 }],
    };
    store.seedFromSnapshot('sess-stale', stale);

    const result = store.get('sess-stale');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.status).toBe(410);
    expect(result.problem.code).toBe('CART_EXPIRED');
  });
});

describe('OrderStore.seedFromSnapshot leaves next orderNumber above restored ones', () => {
  it('seeds DEMO-000042 and the next nextOrderNumber-driven order is above it', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const options = {
      repository: new Repository(DEFAULT_SCENARIO, ids, clock),
      clock,
      ids,
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
    const lookup: VariantLookupFn = (variantId): VariantLookup | undefined =>
      variantId === 'demo-one-5g-graphite-256'
        ? { product: LOOKUP_PRODUCT, variant: LOOKUP_VARIANT }
        : undefined;
    const cart = new CartStore(options, lookup);
    const checkout = new CheckoutStore(options, () => cart);
    const idempotency = new IdempotencyStore(clock);
    const order = new OrderStore(options, checkout, idempotency, () => cart);

    // Seed a cart line so `createOrder`'s CHECKOUT_INCOMPLETE guard
    // has items to count; then patch a complete draft onto the
    // checkout store for the same session so the cash-on-delivery
    // order can be committed end-to-end.
    cart.add('sess-orders', '"1"', 'demo-one-5g-graphite-256', 1);
    checkout.seedFromSnapshot('sess-orders', {
      contact: { fullName: 'a', email: 'a@b.c', phone: '+361' },
      billing: {
        name: 'a',
        address: { countryCode: 'HU', postalCode: '1', city: 'a', line1: 'a' },
      },
      delivery: { optionId: 'pickup_point' },
      payment: { method: 'cash_on_delivery' },
    });

    order.seedFromSnapshot('sess-orders', {
      intents: [],
      receipts: [
        {
          id: 'r-1',
          orderNumber: 'DEMO-000042',
          status: 'confirmed',
          createdAt: '2026-09-14T10:00:00.000Z',
          contactEmail: 'a@b.c',
          notice: 'n',
          paymentMethod: 'card',
          billing: {
            name: 'a',
            address: { countryCode: 'HU', postalCode: '1', city: 'a', line1: 'a' },
          },
          delivery: { optionId: 'pickup_point' },
          items: [],
          subtotal: { amount: 0, currency: 'HUF' },
          shippingFee: { amount: 0, currency: 'HUF' },
          paymentFee: { amount: 0, currency: 'HUF' },
          total: { amount: 0, currency: 'HUF' },
        },
      ],
    });

    const committed = order.createOrder('sess-orders', 'idem-key-neworder-1', `"2"`, {
      acceptedTerms: true,
      termsVersion: '2026-09',
      paymentMethod: 'cash_on_delivery',
    });
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    const num = Number(committed.receipt.orderNumber.replace(/^DEMO-/, ''));
    expect(Number.isFinite(num)).toBe(true);
    expect(num).toBeGreaterThan(42);
  });
});

describe('snapshot v2 — buildSnapshot reads from stores and yields exactly the expected top-level keys', () => {
  it('contains exactly the allowlisted top-level keys when no cart or draft is present', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const options = {
      repository: new Repository(DEFAULT_SCENARIO, ids, clock),
      clock,
      ids,
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
    const cart = new CartStore(options, () => undefined);
    const checkout = new CheckoutStore(options, () => cart);
    const idempotency = new IdempotencyStore(clock);
    const order = new OrderStore(options, checkout, idempotency, () => cart);

    const built = buildSnapshot({ cart, checkout, order }, 'sess-keys', Date.now());
    expect(Object.keys(built).sort()).toEqual([
      'expiresAt',
      'paymentIntents',
      'providerId',
      'receipts',
      'savedAt',
      'schemaVersion',
      'simulatedSessionId',
    ]);
  });
});

describe('ensureCart does not resurrect an expired restored cart', () => {
  it('treats an unparseable expiresAt as not expired (matches CartDomain.isExpired)', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
    repository.loadProducts([DEMO_PRODUCT]);

    // Built directly through createCart/updateCart rather than
    // loadPersistedCart: loadPersistedCart was retired with the v2
    // snapshot path. This isolates the guard on `cart.expiresAt`
    // itself.
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

describe('CheckoutStore.seedFromSnapshot / toPersistedDraft (MIM-212 Unit 1)', () => {
  const lookup: VariantLookupFn = (variantId): VariantLookup | undefined =>
    variantId === 'demo-one-5g-graphite-256'
      ? { product: LOOKUP_PRODUCT, variant: LOOKUP_VARIANT }
      : undefined;

  it('seedFromSnapshot restores all four sections intact through get()', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const options = {
      repository: new Repository(DEFAULT_SCENARIO, ids, clock),
      clock,
      ids,
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
    const cart = new CartStore(options, lookup);
    const checkout = new CheckoutStore(options, () => cart);
    cart.add('sess-seed', '"1"', 'demo-one-5g-graphite-256', 1);

    const draft = {
      contact: { fullName: 'Test User', email: 'test@example.com', phone: '+36123456789' },
      billing: {
        name: 'Test User',
        address: {
          countryCode: 'HU',
          postalCode: '1111',
          city: 'Budapest',
          line1: 'Fo utca 1',
        },
      },
      delivery: { optionId: 'pickup_point' },
      payment: { method: 'card' },
    } satisfies PersistedCheckoutDraft;
    checkout.seedFromSnapshot('sess-seed', draft);

    const result = checkout.get('sess-seed');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.contact).toEqual(draft.contact);
    expect(result.session.billing).toEqual(draft.billing);
    expect(result.session.delivery).toEqual(draft.delivery);
    expect(result.session.payment).toEqual(draft.payment);
  });

  it('toPersistedDraft returns undefined for a session with no draft and the seeded draft for one with a draft', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const options = {
      repository: new Repository(DEFAULT_SCENARIO, ids, clock),
      clock,
      ids,
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
    const cart = new CartStore(options, lookup);
    const checkout = new CheckoutStore(options, () => cart);
    cart.add('sess-with', '"1"', 'demo-one-5g-graphite-256', 1);

    expect(checkout.toPersistedDraft('sess-without')).toBeUndefined();

    const seeded = {
      contact: { fullName: 'Test User', email: 'test@example.com', phone: '+36123456789' },
      billing: {
        name: 'Test User',
        address: {
          countryCode: 'HU',
          postalCode: '1111',
          city: 'Budapest',
          line1: 'Fo utca 1',
        },
      },
      delivery: { optionId: 'pickup_point' },
      payment: { method: 'card' },
    } satisfies PersistedCheckoutDraft;
    checkout.seedFromSnapshot('sess-with', seeded);

    expect(checkout.toPersistedDraft('sess-with')).toEqual(seeded);
  });
});

describe('OrderStore.toPersistedOrderState isolates per-session data (MIM-212 Unit 1)', () => {
  const lookup: VariantLookupFn = (variantId): VariantLookup | undefined =>
    variantId === 'demo-one-5g-graphite-256'
      ? { product: LOOKUP_PRODUCT, variant: LOOKUP_VARIANT }
      : undefined;

  it('excludes intents and receipts belonging to a different session', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const options = {
      repository: new Repository(DEFAULT_SCENARIO, ids, clock),
      clock,
      ids,
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
    const cart = new CartStore(options, lookup);
    const checkout = new CheckoutStore(options, () => cart);
    const idempotency = new IdempotencyStore(clock);
    const order = new OrderStore(options, checkout, idempotency, () => cart);

    const intentA = {
      id: 'pi-a',
      createdAt: '2026-09-14T10:00:00.000Z',
      expiresAt: '2026-09-14T10:30:00.000Z',
      redirectUrl: '/demo-fizetes/pi-a',
      returnUrl: '/penztar?paymentIntentId=pi-a',
      status: 'requires_action' as const,
      amount: { amount: 339_990, currency: 'HUF' as const },
    };
    const receiptA = {
      id: 'r-a',
      orderNumber: 'DEMO-000001',
      status: 'confirmed' as const,
      createdAt: '2026-09-14T10:00:00.000Z',
      contactEmail: 'a@example.com',
      notice: 'a',
      paymentMethod: 'card' as const,
      billing: {
        name: 'A',
        address: { countryCode: 'HU' as const, postalCode: '1111', city: 'A', line1: 'A' },
      },
      delivery: { optionId: 'pickup_point' as const },
      items: [],
      subtotal: { amount: 0, currency: 'HUF' as const },
      shippingFee: { amount: 0, currency: 'HUF' as const },
      paymentFee: { amount: 0, currency: 'HUF' as const },
      total: { amount: 0, currency: 'HUF' as const },
    };
    const intentB = {
      ...intentA,
      id: 'pi-b',
      returnUrl: '/penztar?paymentIntentId=pi-b',
      redirectUrl: '/demo-fizetes/pi-b',
    };
    const receiptB = {
      ...receiptA,
      id: 'r-b',
      orderNumber: 'DEMO-000002',
      contactEmail: 'b@example.com',
      notice: 'b',
      billing: {
        name: 'B',
        address: { countryCode: 'HU' as const, postalCode: '2222', city: 'B', line1: 'B' },
      },
    };

    order.seedFromSnapshot('sess-a', { intents: [intentA], receipts: [receiptA] });
    order.seedFromSnapshot('sess-b', { intents: [intentB], receipts: [receiptB] });

    const a = order.toPersistedOrderState('sess-a');
    expect(a.intents).toEqual([intentA]);
    expect(a.receipts).toEqual([receiptA]);

    const b = order.toPersistedOrderState('sess-b');
    expect(b.intents).toEqual([intentB]);
    expect(b.receipts).toEqual([receiptB]);
  });
});
