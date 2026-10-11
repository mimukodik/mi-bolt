/**
 * T05 — MSW handler factory, repository, persistence, scenarios.
 *
 * Eight focused unit tests cover the strict acceptance criteria for
 * the T05 deliverable. The repository and persistence layers run in
 * the Node test environment without an MSW worker because they are
 * pure data structures; the handler factory is exercised as a
 * shape-only assertion.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHandlers } from './create-handlers';
import { Repository } from './repository';
import {
  SNAPSHOT_SCHEMA_VERSION,
  createBrowserPersistence,
  snapshotKey,
  type MockSnapshot,
  type PersistedCart,
  type PersistedCheckoutDraft,
} from './persistence';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
  parseScenarioFromLocation,
  resolveScenario,
  type Clock,
  type Ids,
} from './scenarios';
import { buildSnapshot } from './snapshot';
import { CartStore, type VariantLookupFn } from './cart/cart-store';
import { CheckoutStore, TERMS_VERSION } from './checkout/checkout-store';
import { OrderStore } from './orders/order-store';
import { IdempotencyStore } from './idempotency';
import { cartStore } from './cart/cart.handlers';
import { checkoutStore, orderStore } from './checkout/checkout.handlers';
import { PAYMENT_PENDING_RESOLVES_SCENARIO } from './payment/payment.handlers';
import './orders/order.handlers';
import { isCatalogFixtureShape, loadCatalogFixture } from './catalog/catalog.handlers';
import { isRecord } from './is-record';
import type { VariantLookup } from './catalog/catalog-store';
import { server, useMswServer } from '../../../tests/msw-server';
import catalogFixture from '../../../docs/api/fixtures/catalog.json';

// Stand-in literals typed directly against `VariantLookup`'s own
// shape — the generated SDK types — and shared by every `describe`
// block that needs a successful lookup hit.
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

/** The neutral address a saved receipt carries in place of a real one
 *  (`order-store.ts`, `REDACTED_ADDRESS`). Spelled out here rather than
 *  imported, so the assertions do not rest on the constant they pin. */
const REDACTED_ADDRESS = {
  countryCode: 'HU' as const,
  postalCode: '0000',
  city: 'redacted',
  line1: 'redacted',
};

/** The neutral e-mail a saved receipt carries in place of the typed one. */
const REDACTED_CONTACT_EMAIL = 'redacted@example.invalid';

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
    usedPaymentIntentIds: [],
    idempotency: [],
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
    expect(persistence.lastDiscard()).toBeNull();
    expect(persistence.isDenied()).toBe(false);
  });

  it('rejects malformed JSON and clears the corrupted entry', () => {
    writeRaw('not-valid-json{{');
    const persistence = createBrowserPersistence({
      nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
    });
    expect(persistence.hydrate(SCENARIO_KEY)).toBeNull();
    expect(rawStorage()?.getItem(STORAGE_KEY)).toBeNull();
    expect(persistence.lastDiscard()).toBe('corrupt');
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
    expect(persistence.lastDiscard()).toBe('stale');
  });

  it('rejects a version-mismatched snapshot and clears it', () => {
    writeRaw(JSON.stringify(makeSnapshot({ schemaVersion: 99 })));
    const persistence = createBrowserPersistence({
      nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
    });
    expect(persistence.hydrate(SCENARIO_KEY)).toBeNull();
    expect(rawStorage()?.getItem(STORAGE_KEY)).toBeNull();
    expect(persistence.lastDiscard()).toBe('version');
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
    // Reject arm of `hasSessionStorage` (projects/shop-mocks/src/persistence.ts):
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

  it('falls back to denied in-memory storage when reading globalThis.sessionStorage throws SecurityError', () => {
    // A browser whose user blocked site data or cookies throws a
    // `SecurityError` DOMException from the `sessionStorage` getter
    // itself, so `'sessionStorage' in globalThis` stays `true` while the
    // read blows up (HTML standard, sessionStorage getter:
    // https://html.spec.whatwg.org/multipage/webstorage.html).
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* suppress expected warning */
    });
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    try {
      const persistence = createBrowserPersistence({
        nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
      });
      // The denial is known at construction: `startMocks` hydrates and
      // reads `isDenied()` before anything is written, and that value
      // drives `DemoNotice`'s memory text.
      expect(persistence.isDenied()).toBe(true);
      expect(persistence.hydrate(SCENARIO_KEY)).toBeNull();
      const snapshot = makeSnapshot();
      persistence.save(SCENARIO_KEY, snapshot);
      // The first save announces the limitation exactly once.
      expect(warn).toHaveBeenCalledTimes(1);
      // The snapshot round-trips through the in-memory cache.
      expect(persistence.hydrate(SCENARIO_KEY)).toEqual(snapshot);
      persistence.save(SCENARIO_KEY, snapshot);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      if (originalDescriptor === undefined) {
        // jsdom defines `sessionStorage` as an own property; if it ever
        // stops doing so, the override is removed again instead of being
        // restored to a descriptor that never existed.
        Reflect.deleteProperty(globalThis, 'sessionStorage');
      } else {
        Object.defineProperty(globalThis, 'sessionStorage', originalDescriptor);
      }
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

  it('parseScenarioFromLocation falls back to default when location.search is not a string', () => {
    // Reject arm of `hasLocationSearch` (projects/shop-mocks/src/scenarios.ts): a
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
    {
      name: 'idempotency record',
      patch: (b) => ({
        ...b,
        idempotency: [
          {
            key: 'POST|/orders|sess|k',
            status: 201,
            body: {},
            payloadHash: '{}',
            expiresAtMs: 1,
            extra: 'junk',
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
      expect(persistence.lastDiscard()).toBe('corrupt');
    });
  }

  it('rejects a usedPaymentIntentIds entry that is not a string', () => {
    writeRaw(JSON.stringify({ ...makeSnapshot(), usedPaymentIntentIds: [42] }));
    const persistence = createBrowserPersistence({
      nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
    });
    expect(persistence.hydrate(SCENARIO_KEY)).toBeNull();
    expect(rawStorage()?.getItem(STORAGE_KEY)).toBeNull();
    expect(persistence.lastDiscard()).toBe('corrupt');
  });

  it('a version 3 entry without usedPaymentIntentIds is a version discard, not a corrupt one', () => {
    // A real older browser holds a version 3 entry: it has no
    // `usedPaymentIntentIds` at all, so the allowlist would call it
    // corrupt. The version check runs first and names the real cause.
    const { usedPaymentIntentIds: _removed, ...version3 } = makeSnapshot({ schemaVersion: 3 });
    writeRaw(JSON.stringify(version3));
    const persistence = createBrowserPersistence({
      nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
    });
    expect(persistence.hydrate(SCENARIO_KEY)).toBeNull();
    expect(rawStorage()?.getItem(STORAGE_KEY)).toBeNull();
    expect(persistence.lastDiscard()).toBe('version');
  });

  it('an entry with an unparsable savedAt is a corrupt discard', () => {
    writeRaw(JSON.stringify(makeSnapshot({ savedAt: 'not-a-date' })));
    const persistence = createBrowserPersistence({
      nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
    });
    expect(persistence.hydrate(SCENARIO_KEY)).toBeNull();
    expect(rawStorage()?.getItem(STORAGE_KEY)).toBeNull();
    expect(persistence.lastDiscard()).toBe('corrupt');
  });

  it('lastDiscard() resets on the next hydrate', () => {
    writeRaw('not-valid-json{{');
    const persistence = createBrowserPersistence({
      nowMs: () => Date.parse('2026-09-14T12:00:00.000Z'),
    });
    expect(persistence.hydrate(SCENARIO_KEY)).toBeNull();
    expect(persistence.lastDiscard()).toBe('corrupt');
    expect(persistence.hydrate(SCENARIO_KEY)).toBeNull();
    expect(persistence.lastDiscard()).toBeNull();
  });
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
    if (persisted === undefined) return;
    expect(persisted.items).toEqual([
      { variantId: 'demo-one-5g-graphite-256', quantity: 2, acceptedUnitPrice: 339990 },
    ]);

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
      usedIntentIds: [],
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

describe('OrderStore used card intents (MIM-293)', () => {
  it('a used intent restored from the snapshot cannot back a second order', () => {
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

    cart.add('sess-orders', '"1"', 'demo-one-5g-graphite-256', 1);
    checkout.seedFromSnapshot('sess-orders', {
      contact: { fullName: 'a', email: 'a@b.c', phone: '+361' },
      billing: {
        name: 'a',
        address: { countryCode: 'HU', postalCode: '1', city: 'a', line1: 'a' },
      },
      delivery: { optionId: 'pickup_point' },
      payment: { method: 'card' },
    });

    order.seedFromSnapshot('sess-orders', {
      intents: [
        {
          id: 'pi-used',
          createdAt: '2026-09-14T10:00:00.000Z',
          expiresAt: '2026-09-14T10:30:00.000Z',
          redirectUrl: '/demo-fizetes/pi-used',
          returnUrl: '/penztar?paymentIntentId=pi-used',
          status: 'succeeded',
          amount: { amount: 0, currency: 'HUF' },
        },
      ],
      receipts: [],
      usedIntentIds: ['pi-used'],
    });
    expect(order.toPersistedOrderState('sess-orders').usedIntentIds).toEqual(['pi-used']);

    const reused = order.createOrder('sess-orders', 'idem-key-reuse-1', `"2"`, {
      acceptedTerms: true,
      termsVersion: '2026-09',
      paymentMethod: 'card',
      paymentIntentId: 'pi-used',
    });
    expect(reused.ok).toBe(false);
    if (reused.ok) return;
    expect(reused.problem.status).toBe(422);
    expect(reused.problem.code).toBe('PAYMENT_REQUIRED');
    expect(reused.problem.detail).toBe(
      'The referenced payment intent already backs an order; a new card order needs a new payment',
    );
    expect(reused.problem.params).toEqual({ paymentIntentId: 'pi-used', status: 'succeeded' });
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
      'idempotency',
      'paymentIntents',
      'providerId',
      'receipts',
      'savedAt',
      'schemaVersion',
      'simulatedSessionId',
      'usedPaymentIntentIds',
    ]);
  });
});

describe('ensureCart does not resurrect an expired restored cart', () => {
  it('treats an unparseable expiresAt as not expired (matches CartDomain.isExpired)', () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const ids = createDeterministicIds(1);
    const repository = new Repository(DEFAULT_SCENARIO, ids, clock);

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

    order.seedFromSnapshot('sess-a', {
      intents: [intentA],
      receipts: [receiptA],
      usedIntentIds: [],
    });
    order.seedFromSnapshot('sess-b', {
      intents: [intentB],
      receipts: [receiptB],
      usedIntentIds: [],
    });

    const a = order.toPersistedOrderState('sess-a');
    expect(a.intents).toEqual([intentA]);
    // The persisted receipt carries the neutral placeholders in place of the
    // typed e-mail and billing name; its pickup delivery is kept as it is.
    expect(a.receipts).toEqual([
      {
        ...receiptA,
        contactEmail: REDACTED_CONTACT_EMAIL,
        billing: { name: 'redacted', address: REDACTED_ADDRESS },
      },
    ]);

    const b = order.toPersistedOrderState('sess-b');
    expect(b.intents).toEqual([intentB]);
    expect(b.receipts).toEqual([
      {
        ...receiptB,
        contactEmail: REDACTED_CONTACT_EMAIL,
        billing: { name: 'redacted', address: REDACTED_ADDRESS },
      },
    ]);
  });
});

describe('IdempotencyStore persisted round trip (MIM-212 Unit P0c)', () => {
  it('toPersisted and seedFromSnapshot round-trip unexpired records, drop expired ones', () => {
    const clock = createFixedClock('2026-09-20T10:00:00.000Z');
    const store = new IdempotencyStore(clock);
    const keyA = 'POST|/orders|sess|k-aaaaa';
    const hashA = '{"paymentMethod":"cash_on_delivery"}';
    const bodyA = { id: 'r-a', orderNumber: 'DEMO-000001' };
    store.record(keyA, hashA, { status: 201, body: bodyA });

    const keyB = 'POST|/orders|sess|k-bbbbb';
    const hashB = '{"paymentMethod":"card","paymentIntentId":"pi-b"}';
    const bodyB = { id: 'r-b', orderNumber: 'DEMO-000002' };
    store.record(keyB, hashB, { status: 201, body: bodyB });

    const persisted = store.toPersisted();
    expect(persisted).toHaveLength(2);
    const byKey = new Map(persisted.map((entry) => [entry.key, entry]));
    const expectedExpiry = Date.parse('2026-09-20T10:00:00.000Z') + 24 * 60 * 60 * 1000;
    expect(byKey.get(keyA)).toEqual({
      key: keyA,
      status: 201,
      body: bodyA,
      payloadHash: hashA,
      expiresAtMs: expectedExpiry,
    });
    expect(byKey.get(keyB)).toEqual({
      key: keyB,
      status: 201,
      body: bodyB,
      payloadHash: hashB,
      expiresAtMs: expectedExpiry,
    });

    // A second store, seeded from the first, replays both entries.
    const store2 = new IdempotencyStore(clock);
    store2.seedFromSnapshot(persisted);
    expect(store2.find(keyA, hashA)).toEqual({ status: 201, body: bodyA });
    expect(store2.find(keyB, hashB)).toEqual({ status: 201, body: bodyB });

    // An expired entry is dropped at seed time and returns null on find.
    const staleKey = 'POST|/orders|sess|k-stale';
    const staleHash = '{}';
    const store3 = new IdempotencyStore(clock);
    store3.seedFromSnapshot([
      {
        key: staleKey,
        status: 201,
        body: { x: 1 },
        payloadHash: staleHash,
        expiresAtMs: 1,
      },
    ]);
    expect(store3.find(staleKey, staleHash)).toBeNull();
  });
});

describe('snapshot v2 — persist and seed round trip (MIM-212 Unit 2)', () => {
  beforeAll(() => {
    if (!isCatalogFixtureShape(catalogFixture)) {
      throw new Error('[mocks-handlers.spec] committed fixture does not match expected shape');
    }
    loadCatalogFixture(catalogFixture);
  });

  const SESSION_1 = 'spec-session-0001';
  const HONOR = 'honor-x7d--fekete--128';
  const MOTO = 'motorola-edge-50-fusion--zold--256';

  const VALID_CONTACT = {
    fullName: 'Teszt Elek',
    email: 'Teszt.Elek@Pelda.hu',
    phone: '+36301234567',
  };
  const VALID_BILLING = {
    name: 'Teszt Elek',
    address: {
      countryCode: 'HU',
      postalCode: '1052',
      city: 'Budapest',
      line1: 'Petőfi utca 1.',
    },
  };
  const VALID_DELIVERY_ADDRESS = {
    countryCode: 'HU',
    postalCode: '1052',
    city: 'Budapest',
    line1: 'Petőfi utca 1.',
  };

  let clock: Clock;
  let ids: Ids;
  let options: {
    repository: Repository;
    clock: Clock;
    ids: Ids;
    scenario: ReturnType<Repository['getScenario']>;
    apiRoot: string;
  };

  beforeEach(() => {
    clock = createFixedClock('2026-09-20T10:00:00.000Z');
    ids = createDeterministicIds(1);
    options = {
      repository: new Repository(DEFAULT_SCENARIO, ids, clock),
      clock,
      ids,
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
  });

  function session1Headers(): Record<string, string> {
    return { 'X-Demo-Session': SESSION_1, 'Content-Type': 'application/json' };
  }

  function expectRecord(value: unknown): asserts value is Record<string, unknown> {
    if (!isRecord(value)) {
      throw new Error('expected an object');
    }
  }

  function findRecord(arr: readonly unknown[]): Record<string, unknown> | undefined {
    for (const candidate of arr) {
      if (isRecord(candidate)) return candidate;
    }
    return undefined;
  }

  it('POST /cart/items persists once and a rebuilt handler set serves the same line', async () => {
    let captured: MockSnapshot | null = null;
    const persistCalls: string[] = [];
    const persist = (sessionId: string): void => {
      persistCalls.push(sessionId);
      const cart = cartStore.current;
      const checkout = checkoutStore.current;
      const order = orderStore.current;
      if (cart === null || checkout === null || order === null)
        throw new Error('stores not initialised');
      captured = buildSnapshot({ cart, checkout, order }, sessionId, Date.parse(clock.now()));
    };
    server.use(...createHandlers({ ...options, persist }));

    const addRes = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: HONOR, quantity: 1 }),
    });
    expect(addRes.status).toBe(200);
    expect(persistCalls).toEqual([SESSION_1]);
    expect(captured).not.toBeNull();

    server.resetHandlers();
    server.use(...createHandlers({ ...options, snapshot: captured }));

    const getRes = await fetch('http://localhost/api/v1/cart', { headers: session1Headers() });
    expect(getRes.status).toBe(200);
    const body: unknown = await getRes.json();
    expectRecord(body);
    const items = body['items'];
    if (!Array.isArray(items)) throw new Error('items not an array');
    const itemRecord = findRecord(items);
    if (itemRecord === undefined) {
      throw new Error('cart has no item record');
    }
    const item: Record<string, unknown> = itemRecord;
    expect(item['variantId']).toBe(HONOR);
    expect(item['quantity']).toBe(1);
    expect(body['version']).toBe(2);
  });

  it('POST /payment-intents/:id/outcome persists and the intent survives the rebuild', async () => {
    let captured: MockSnapshot | null = null;
    const persistCalls: string[] = [];
    const persist = (sessionId: string): void => {
      persistCalls.push(sessionId);
      const cart = cartStore.current;
      const checkout = checkoutStore.current;
      const order = orderStore.current;
      if (cart === null || checkout === null || order === null)
        throw new Error('stores not initialised');
      captured = buildSnapshot({ cart, checkout, order }, sessionId, Date.parse(clock.now()));
    };
    server.use(...createHandlers({ ...options, persist }));

    // Seed the cart with one line.
    const motoRes = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: MOTO, quantity: 1 }),
    });
    expect(motoRes.status).toBe(200);

    // Patch a complete draft (contact + billing + delivery + payment).
    const patchRes = await fetch('http://localhost/api/v1/checkout', {
      method: 'PATCH',
      headers: { ...session1Headers(), 'If-Match': '"2"' },
      body: JSON.stringify({
        contact: VALID_CONTACT,
        billing: VALID_BILLING,
        delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS },
        payment: { method: 'card' },
      }),
    });
    expect(patchRes.status).toBe(200);

    // Create a payment intent.
    const intentRes = await fetch('http://localhost/api/v1/payment-intents', {
      method: 'POST',
      headers: {
        ...session1Headers(),
        'If-Match': '"3"',
        'Idempotency-Key': 'idem-int-roundtrip-1',
      },
      body: '',
    });
    expect(intentRes.status).toBe(201);
    const intentBody: unknown = await intentRes.json();
    expectRecord(intentBody);
    const intentId = intentBody['id'];
    if (typeof intentId !== 'string') throw new Error('id not a string');

    const persistCountBefore = persistCalls.length;

    // Resolve the intent as succeeded.
    const outcomeRes = await fetch(`http://localhost/api/v1/payment-intents/${intentId}/outcome`, {
      method: 'POST',
      headers: session1Headers(),
      body: JSON.stringify({ outcome: 'succeeded' }),
    });
    expect(outcomeRes.status).toBe(200);
    expect(persistCalls.length).toBe(persistCountBefore + 1);

    expect(captured).not.toBeNull();

    server.resetHandlers();
    server.use(...createHandlers({ ...options, snapshot: captured }));

    const getIntentRes = await fetch(`http://localhost/api/v1/payment-intents/${intentId}`, {
      headers: session1Headers(),
    });
    expect(getIntentRes.status).toBe(200);
    const intentGetBody: unknown = await getIntentRes.json();
    expectRecord(intentGetBody);
    expect(intentGetBody['status']).toBe('succeeded');
  });

  it('POST /orders replays after a rebuild from the captured snapshot', async () => {
    let captured: MockSnapshot | null = null;
    const persistCalls: string[] = [];
    const persist = (sessionId: string): void => {
      persistCalls.push(sessionId);
      const cart = cartStore.current;
      const checkout = checkoutStore.current;
      const order = orderStore.current;
      if (cart === null || checkout === null || order === null)
        throw new Error('stores not initialised');
      captured = buildSnapshot({ cart, checkout, order }, sessionId, Date.parse(clock.now()));
    };
    server.use(...createHandlers({ ...options, persist }));

    // Seed the cart, patch a complete cash-on-delivery draft, then
    // place the first order with the documented Idempotency-Key.
    const motoRes = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: MOTO, quantity: 1 }),
    });
    expect(motoRes.status).toBe(200);

    const patchRes = await fetch('http://localhost/api/v1/checkout', {
      method: 'PATCH',
      headers: { ...session1Headers(), 'If-Match': '"2"' },
      body: JSON.stringify({
        contact: VALID_CONTACT,
        billing: VALID_BILLING,
        delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS },
        payment: { method: 'cash_on_delivery' },
      }),
    });
    expect(patchRes.status).toBe(200);

    const first = await fetch('http://localhost/api/v1/orders', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"3"', 'Idempotency-Key': 'idem-ord-p0c' },
      body: JSON.stringify({
        paymentMethod: 'cash_on_delivery',
        termsVersion: '2026-09',
        acceptedTerms: true,
      }),
    });
    expect(first.status).toBe(201);
    const firstBody: unknown = await first.json();
    expectRecord(firstBody);

    expect(captured).not.toBeNull();

    // Rebuild the handler set from the captured snapshot. The new
    // checkoutHandlersEntry seeds the order store's idempotency
    // cache from `options.snapshot.idempotency`, so a replay with
    // the same key and body returns the original 201 receipt rather
    // than falling through to the consumed cart.
    server.resetHandlers();
    server.use(...createHandlers({ ...options, snapshot: captured }));

    const replay = await fetch('http://localhost/api/v1/orders', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"', 'Idempotency-Key': 'idem-ord-p0c' },
      body: JSON.stringify({
        paymentMethod: 'cash_on_delivery',
        termsVersion: '2026-09',
        acceptedTerms: true,
      }),
    });
    expect(replay.status).toBe(201);
    const replayBody: unknown = await replay.json();
    expectRecord(replayBody);
    // The rebuilt store answers from the snapshot's idempotency cache, whose
    // body is the redacted receipt: same order, neutral placeholders.
    expect(JSON.stringify(replayBody)).toBe(
      JSON.stringify({
        ...firstBody,
        contactEmail: REDACTED_CONTACT_EMAIL,
        billing: { name: 'redacted', address: REDACTED_ADDRESS },
        delivery: { optionId: 'home_delivery', address: REDACTED_ADDRESS },
      }),
    );
  });
});

describe('payment-pending-resolves scenario (E094)', () => {
  beforeAll(() => {
    if (!isCatalogFixtureShape(catalogFixture)) {
      throw new Error('[mocks-handlers.spec] committed fixture does not match expected shape');
    }
    loadCatalogFixture(catalogFixture);
  });

  const SESSION_1 = 'spec-session-e094';
  const MOTO = 'motorola-edge-50-fusion--zold--256';

  const VALID_CONTACT = {
    fullName: 'Teszt Elek',
    email: 'Teszt.Elek@Pelda.hu',
    phone: '+36301234567',
  };
  const VALID_BILLING = {
    name: 'Teszt Elek',
    address: {
      countryCode: 'HU',
      postalCode: '1052',
      city: 'Budapest',
      line1: 'Petőfi utca 1.',
    },
  };
  const VALID_DELIVERY_ADDRESS = {
    countryCode: 'HU',
    postalCode: '1052',
    city: 'Budapest',
    line1: 'Petőfi utca 1.',
  };

  let clock: Clock;
  let ids: Ids;
  let options: {
    repository: Repository;
    clock: Clock;
    ids: Ids;
    scenario: ReturnType<Repository['getScenario']>;
    apiRoot: string;
  };

  beforeEach(() => {
    clock = createFixedClock('2026-09-20T10:00:00.000Z');
    ids = createDeterministicIds(1);
    options = {
      repository: new Repository(DEFAULT_SCENARIO, ids, clock),
      clock,
      ids,
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
  });

  function session1Headers(): Record<string, string> {
    return { 'X-Demo-Session': SESSION_1, 'Content-Type': 'application/json' };
  }

  function expectRecord(value: unknown): asserts value is Record<string, unknown> {
    if (!isRecord(value)) {
      throw new Error('expected an object');
    }
  }

  /** Installs one handler list for the named scenario and the persist spy. */
  function installHandlers(scenarioName: string, persist: (sessionId: string) => void): void {
    server.use(...createHandlers({ ...options, scenario: resolveScenario(scenarioName), persist }));
  }

  /** Seeds one cart line, patches a complete card draft and creates an intent. */
  async function createCardIntent(): Promise<string> {
    const cartRes = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: MOTO, quantity: 1 }),
    });
    expect(cartRes.status).toBe(200);

    const patchRes = await fetch('http://localhost/api/v1/checkout', {
      method: 'PATCH',
      headers: { ...session1Headers(), 'If-Match': '"2"' },
      body: JSON.stringify({
        contact: VALID_CONTACT,
        billing: VALID_BILLING,
        delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS },
        payment: { method: 'card' },
      }),
    });
    expect(patchRes.status).toBe(200);

    const intentRes = await fetch('http://localhost/api/v1/payment-intents', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"3"', 'Idempotency-Key': 'idem-int-e094-1' },
      body: '',
    });
    expect(intentRes.status).toBe(201);
    const body: unknown = await intentRes.json();
    expectRecord(body);
    const id = body['id'];
    if (typeof id !== 'string') throw new Error('id not a string');
    return id;
  }

  /** Resolves the intent as pending through the outcome endpoint. */
  async function resolvePending(intentId: string): Promise<void> {
    const res = await fetch(`http://localhost/api/v1/payment-intents/${intentId}/outcome`, {
      method: 'POST',
      headers: session1Headers(),
      body: JSON.stringify({ outcome: 'pending' }),
    });
    expect(res.status).toBe(200);
  }

  /** Reads the intent and returns the wire status. */
  async function readStatus(intentId: string): Promise<unknown> {
    const res = await fetch(`http://localhost/api/v1/payment-intents/${intentId}`, {
      headers: session1Headers(),
    });
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expectRecord(body);
    return body['status'];
  }

  it('a pending intent answers pending twice and succeeded on the third read', async () => {
    const persist = vi.fn();
    installHandlers(PAYMENT_PENDING_RESOLVES_SCENARIO, persist);
    const intentId = await createCardIntent();
    await resolvePending(intentId);

    expect(await readStatus(intentId)).toBe('pending');
    expect(await readStatus(intentId)).toBe('pending');
    expect(await readStatus(intentId)).toBe('succeeded');
    expect(await readStatus(intentId)).toBe('succeeded');
  });

  it('the resolving read persists the session once', async () => {
    const persist = vi.fn();
    installHandlers(PAYMENT_PENDING_RESOLVES_SCENARIO, persist);
    const intentId = await createCardIntent();
    await resolvePending(intentId);
    persist.mockClear();

    await readStatus(intentId);
    expect(persist).toHaveBeenCalledTimes(0);
    await readStatus(intentId);
    expect(persist).toHaveBeenCalledTimes(0);
    await readStatus(intentId);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(SESSION_1);
    await readStatus(intentId);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('an intent that is not pending does not count its reads', async () => {
    const persist = vi.fn();
    installHandlers(PAYMENT_PENDING_RESOLVES_SCENARIO, persist);
    const intentId = await createCardIntent();

    expect(await readStatus(intentId)).toBe('requires_action');
    expect(await readStatus(intentId)).toBe('requires_action');
    expect(await readStatus(intentId)).toBe('requires_action');

    await resolvePending(intentId);

    expect(await readStatus(intentId)).toBe('pending');
    expect(await readStatus(intentId)).toBe('pending');
    expect(await readStatus(intentId)).toBe('succeeded');
  });

  it('the default scenario keeps a pending intent pending', async () => {
    const persist = vi.fn();
    installHandlers(DEFAULT_SCENARIO.name, persist);
    const intentId = await createCardIntent();
    await resolvePending(intentId);
    persist.mockClear();

    expect(await readStatus(intentId)).toBe('pending');
    expect(await readStatus(intentId)).toBe('pending');
    expect(await readStatus(intentId)).toBe('pending');
    expect(await readStatus(intentId)).toBe('pending');
    expect(persist).toHaveBeenCalledTimes(0);
  });
});

const HONOR_BLACK_512_MOCK = 'honor-magic-v6--fekete--512';
const MOCK_TERMS_VERSION = '2026-09';

async function mockAddLine(variantId: string, ifMatch: string): Promise<void> {
  const res = await fetch('http://localhost/api/v1/cart/items', {
    method: 'POST',
    headers: { ...S1_HEADERS(), 'If-Match': ifMatch },
    body: JSON.stringify({ variantId, quantity: 1 }),
  });
  expect(res.status).toBe(200);
}

async function mockPatchCardDraft(ifMatch: string): Promise<void> {
  const res = await fetch('http://localhost/api/v1/checkout', {
    method: 'PATCH',
    headers: { ...S1_HEADERS(), 'If-Match': ifMatch },
    body: JSON.stringify({
      contact: VALID_CONTACT_LOCAL,
      billing: VALID_BILLING_LOCAL,
      delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS_LOCAL },
      payment: { method: 'card' },
    }),
  });
  expect(res.status).toBe(200);
}

async function mockCreateCardIntent(
  ifMatch: string,
  idempotencyKey: string,
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const res = await fetch('http://localhost/api/v1/payment-intents', {
    method: 'POST',
    headers: {
      ...S1_HEADERS(),
      'If-Match': ifMatch,
      'Idempotency-Key': idempotencyKey,
    },
    body: '',
  });
  const body: unknown = await res.json();
  return { status: res.status, body, headers: res.headers };
}

async function mockResolveIntent(
  intentId: string,
  outcome: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://localhost/api/v1/payment-intents/${intentId}/outcome`, {
    method: 'POST',
    headers: S1_HEADERS(),
    body: JSON.stringify({ outcome }),
  });
  const body: unknown = await res.json();
  return { status: res.status, body };
}

const S1_HEADERS = (): Record<string, string> => ({
  'X-Demo-Session': 'spec-session-0001',
  'Content-Type': 'application/json',
});
const VALID_CONTACT_LOCAL = {
  fullName: 'Teszt Elek',
  email: 'Teszt.Elek@Pelda.hu',
  phone: '+36301234567',
};
const VALID_BILLING_LOCAL = {
  name: 'Teszt Elek',
  address: {
    countryCode: 'HU',
    postalCode: '1052',
    city: 'Budapest',
    line1: 'Petőfi utca 1.',
  },
};
const VALID_DELIVERY_ADDRESS_LOCAL = {
  countryCode: 'HU',
  postalCode: '1052',
  city: 'Budapest',
  line1: 'Petőfi utca 1.',
};

function expectRecord(value: unknown): asserts value is Record<string, unknown> {
  expect(isRecord(value)).toBe(true);
}

describe('stock ledger reload (AC13)', () => {
  const localClock = createFixedClock('2026-09-14T11:00:00.000Z');
  const localIds = createDeterministicIds(1);
  const localOptions = {
    repository: new Repository(DEFAULT_SCENARIO, localIds, localClock),
    clock: localClock,
    ids: localIds,
    scenario: DEFAULT_SCENARIO,
    apiRoot: '/api/v1',
  };
  beforeEach(() => {
    server.use(...createHandlers(localOptions));
  });
  it('S-05 a reload rebuilds the sales from the persisted receipts', async () => {
    let captured: MockSnapshot | null = null;
    const persistCalls: string[] = [];
    const persist = (sessionId: string): void => {
      persistCalls.push(sessionId);
      const cart = cartStore.current;
      const checkout = checkoutStore.current;
      const order = orderStore.current;
      if (cart === null || checkout === null || order === null)
        throw new Error('stores not initialised');
      captured = buildSnapshot({ cart, checkout, order }, sessionId, Date.parse(localClock.now()));
    };
    server.use(...createHandlers({ ...localOptions, persist }));

    await mockAddLine(HONOR_BLACK_512_MOCK, '"1"');
    await mockPatchCardDraft('"2"');
    const intentRes = await mockCreateCardIntent('"3"', 'idem-int-stock-reload-0005');
    expect(intentRes.status).toBe(201);
    const intentBody = intentRes.body as Record<string, unknown>;
    const paymentIntentId = intentBody['id'];
    expect(typeof paymentIntentId === 'string').toBe(true);
    const resolved = await mockResolveIntent(paymentIntentId as string, 'succeeded');
    expect(resolved.status).toBe(200);

    const orderRes = await fetch('http://localhost/api/v1/orders', {
      method: 'POST',
      headers: {
        ...S1_HEADERS(),
        'If-Match': '"3"',
        'Idempotency-Key': 'idem-stock-reload-0005',
      },
      body: JSON.stringify({
        paymentMethod: 'card',
        paymentIntentId,
        termsVersion: MOCK_TERMS_VERSION,
        acceptedTerms: true,
      }),
    });
    expect(orderRes.status).toBe(201);

    expect(captured).not.toBeNull();
    server.resetHandlers();
    server.use(...createHandlers({ ...localOptions, snapshot: captured }));

    const productRes = await fetch('http://localhost/api/v1/products/honor-magic-v6', {
      headers: S1_HEADERS(),
    });
    expect(productRes.status).toBe(200);
    const productBody: unknown = await productRes.json();
    expectRecord(productBody);
    const variants = productBody['variants'];
    expect(Array.isArray(variants)).toBe(true);
    let match: Record<string, unknown> | undefined;
    for (const candidate of variants as readonly unknown[]) {
      expectRecord(candidate);
      if (candidate['id'] === HONOR_BLACK_512_MOCK) {
        match = candidate;
        break;
      }
    }
    expect(match).toBeDefined();
    expect(match?.['maxQuantity']).toBe(1);
    expect(match?.['availability']).toBe('in_stock');
  });
});

describe('checkout draft storage: card path only (E016)', () => {
  beforeAll(() => {
    if (!isCatalogFixtureShape(catalogFixture)) {
      throw new Error('[mocks-handlers.spec] committed fixture does not match expected shape');
    }
    loadCatalogFixture(catalogFixture);
  });

  const SESSION_1 = 'spec-session-e016';
  const MOTO = 'motorola-edge-50-fusion--zold--256';

  const VALID_CONTACT = {
    fullName: 'Teszt Elek',
    email: 'teszt.elek@pelda.hu',
    phone: '+36301234567',
  };
  const VALID_BILLING = {
    name: 'Teszt Elek',
    address: {
      countryCode: 'HU',
      postalCode: '1052',
      city: 'Budapest',
      line1: 'Petőfi utca 1.',
    },
  };
  const VALID_DELIVERY_ADDRESS = {
    countryCode: 'HU',
    postalCode: '1052',
    city: 'Budapest',
    line1: 'Petőfi utca 1.',
  };

  let clock: Clock;
  let ids: Ids;
  let options: {
    repository: Repository;
    clock: Clock;
    ids: Ids;
    scenario: ReturnType<Repository['getScenario']>;
    apiRoot: string;
  };

  beforeEach(() => {
    clock = createFixedClock('2026-09-20T10:00:00.000Z');
    ids = createDeterministicIds(1);
    options = {
      repository: new Repository(DEFAULT_SCENARIO, ids, clock),
      clock,
      ids,
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
  });

  function session1Headers(): Record<string, string> {
    return { 'X-Demo-Session': SESSION_1, 'Content-Type': 'application/json' };
  }

  function expectRecord(value: unknown): asserts value is Record<string, unknown> {
    if (!isRecord(value)) {
      throw new Error('expected an object');
    }
  }

  function installCapture(
    state: { captured: MockSnapshot | null },
    counter: { n: number },
    snapshot: MockSnapshot | null = null,
  ): void {
    server.resetHandlers();
    const persist = (sessionId: string): void => {
      counter.n += 1;
      const cart = cartStore.current;
      const checkout = checkoutStore.current;
      const order = orderStore.current;
      if (cart === null || checkout === null || order === null)
        throw new Error('stores not initialised');
      state.captured = buildSnapshot({ cart, checkout, order }, sessionId, Date.parse(clock.now()));
    };
    server.use(...createHandlers({ ...options, persist, snapshot }));
  }

  async function addCartLine(): Promise<void> {
    const res = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: MOTO, quantity: 1 }),
    });
    expect(res.status).toBe(200);
  }

  async function patchFullCardDraft(ifMatch = '"2"'): Promise<void> {
    const res = await fetch('http://localhost/api/v1/checkout', {
      method: 'PATCH',
      headers: { ...session1Headers(), 'If-Match': ifMatch },
      body: JSON.stringify({
        contact: {
          fullName: 'Teszt Elek',
          email: 'Teszt.Elek@Pelda.hu',
          phone: '+36301234567',
        },
        billing: VALID_BILLING,
        delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS },
        payment: { method: 'card' },
      }),
    });
    expect(res.status).toBe(200);
  }

  async function patchPaymentOnly(
    ifMatch: string,
    method: 'card' | 'cash_on_delivery',
  ): Promise<void> {
    const res = await fetch('http://localhost/api/v1/checkout', {
      method: 'PATCH',
      headers: { ...session1Headers(), 'If-Match': ifMatch },
      body: JSON.stringify({ payment: { method } }),
    });
    expect(res.status).toBe(200);
  }

  async function createIntent(idempotencyKey: string, ifMatch = '"3"'): Promise<string> {
    const res = await fetch('http://localhost/api/v1/payment-intents', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': ifMatch, 'Idempotency-Key': idempotencyKey },
      body: '',
    });
    expect(res.status).toBe(201);
    const body: unknown = await res.json();
    expectRecord(body);
    const id = body['id'];
    if (typeof id !== 'string') throw new Error('id not a string');
    return id;
  }

  async function resolveIntent(intentId: string, outcome: 'succeeded' | 'pending'): Promise<void> {
    const res = await fetch(`http://localhost/api/v1/payment-intents/${intentId}/outcome`, {
      method: 'POST',
      headers: session1Headers(),
      body: JSON.stringify({ outcome }),
    });
    expect(res.status).toBe(200);
  }

  it('D-01 a draft with no card payment in flight stays out of storage', async () => {
    const state = { captured: null as MockSnapshot | null };
    const counter = { n: 0 };
    installCapture(state, counter);

    await addCartLine();
    await patchFullCardDraft();

    expect(state.captured).not.toBeNull();
    expect(state.captured?.checkoutDraft).toBeUndefined();

    await patchPaymentOnly('"3"', 'cash_on_delivery');

    expect(state.captured).not.toBeNull();
    expect(state.captured?.checkoutDraft).toBeUndefined();
  });

  it('D-02 creating a card intent writes the draft', async () => {
    const state = { captured: null as MockSnapshot | null };
    const counter = { n: 0 };
    installCapture(state, counter);

    await addCartLine();
    await patchFullCardDraft();
    await createIntent('idem-e016-d02', '"3"');

    expect(state.captured).not.toBeNull();
    expect(state.captured?.checkoutDraft).toBeDefined();
    expect(state.captured?.checkoutDraft?.contact).toEqual(VALID_CONTACT);
  });

  it('D-03 the draft rides through the payment page', async () => {
    const d02 = { captured: null as MockSnapshot | null };
    const c02 = { n: 0 };
    installCapture(d02, c02);
    await addCartLine();
    await patchFullCardDraft();
    const intentId = await createIntent('idem-e016-d03', '"3"');
    const d02Snap = d02.captured;
    expect(d02Snap).not.toBeNull();

    const d03 = { captured: null as MockSnapshot | null };
    const c03 = { n: 0 };
    installCapture(d03, c03, d02Snap);
    await resolveIntent(intentId, 'succeeded');

    expect(d03.captured).not.toBeNull();
    expect(d03.captured?.checkoutDraft).toBeDefined();
    expect(d03.captured?.checkoutDraft?.contact).toEqual(VALID_CONTACT);
  });

  it('D-04 the first checkout read after the return drops the stored draft and keeps it on the page', async () => {
    const d02 = { captured: null as MockSnapshot | null };
    const c02 = { n: 0 };
    installCapture(d02, c02);
    await addCartLine();
    await patchFullCardDraft();
    const intentId = await createIntent('idem-e016-d04', '"3"');
    const d02Snap = d02.captured;
    expect(d02Snap).not.toBeNull();

    const d03 = { captured: null as MockSnapshot | null };
    const c03 = { n: 0 };
    installCapture(d03, c03, d02Snap);
    await resolveIntent(intentId, 'succeeded');
    const d03Snap = d03.captured;
    expect(d03Snap).not.toBeNull();

    const d04 = { captured: null as MockSnapshot | null };
    const c04 = { n: 0 };
    installCapture(d04, c04, d03Snap);

    const get1 = await fetch('http://localhost/api/v1/checkout', {
      headers: session1Headers(),
    });
    expect(get1.status).toBe(200);
    const get1Body: unknown = await get1.json();
    expectRecord(get1Body);
    expectRecord(get1Body['contact']);
    const contact = get1Body['contact'];
    expectRecord(contact);
    expect(contact['email']).toBe(VALID_CONTACT.email);
    expect(c04.n).toBe(1);
    expect(d04.captured).not.toBeNull();
    expect(d04.captured?.checkoutDraft).toBeUndefined();

    const get2 = await fetch('http://localhost/api/v1/checkout', {
      headers: session1Headers(),
    });
    expect(get2.status).toBe(200);
    expect(c04.n).toBe(1);

    const version = get1Body['version'];
    if (typeof version !== 'number') throw new Error('version not a number');
    const orderRes = await fetch('http://localhost/api/v1/orders', {
      method: 'POST',
      headers: {
        ...session1Headers(),
        'If-Match': `"${String(version)}"`,
        'Idempotency-Key': 'idem-e016-d04-order',
      },
      body: JSON.stringify({
        paymentMethod: 'card',
        paymentIntentId: intentId,
        termsVersion: TERMS_VERSION,
        acceptedTerms: true,
      }),
    });
    expect(orderRes.status).toBe(201);
  });

  it('D-05 a reload after the return finds no draft and keeps the cart', async () => {
    const d02 = { captured: null as MockSnapshot | null };
    const c02 = { n: 0 };
    installCapture(d02, c02);
    await addCartLine();
    await patchFullCardDraft();
    const intentId = await createIntent('idem-e016-d05', '"3"');
    const d02Snap = d02.captured;
    expect(d02Snap).not.toBeNull();

    const d03 = { captured: null as MockSnapshot | null };
    const c03 = { n: 0 };
    installCapture(d03, c03, d02Snap);
    await resolveIntent(intentId, 'succeeded');
    const d03Snap = d03.captured;
    expect(d03Snap).not.toBeNull();

    const d04 = { captured: null as MockSnapshot | null };
    const c04 = { n: 0 };
    installCapture(d04, c04, d03Snap);
    const get1 = await fetch('http://localhost/api/v1/checkout', {
      headers: session1Headers(),
    });
    expect(get1.status).toBe(200);
    const d04Snap = d04.captured;
    expect(c04.n).toBe(1);

    const d05 = { captured: null as MockSnapshot | null };
    const c05 = { n: 0 };
    installCapture(d05, c05, d04Snap);

    const getC = await fetch('http://localhost/api/v1/checkout', {
      headers: session1Headers(),
    });
    expect(getC.status).toBe(200);
    const getCBody: unknown = await getC.json();
    expectRecord(getCBody);
    expect(getCBody['contact']).toBeUndefined();

    const getCart = await fetch('http://localhost/api/v1/cart', {
      headers: session1Headers(),
    });
    expect(getCart.status).toBe(200);
    const cartBody: unknown = await getCart.json();
    expectRecord(cartBody);
    const items = cartBody['items'];
    if (!Array.isArray(items)) throw new Error('items not an array');
    expect(items.length).toBe(1);
  });

  it('D-06 an unpaid intent keeps the draft only while the draft pays by card', async () => {
    const state = { captured: null as MockSnapshot | null };
    const counter = { n: 0 };
    installCapture(state, counter);

    await addCartLine();
    await patchFullCardDraft();
    await createIntent('idem-e016-d06', '"3"');

    await patchPaymentOnly('"3"', 'card');
    expect(state.captured).not.toBeNull();
    expect(state.captured?.checkoutDraft).toBeDefined();
    expect(state.captured?.checkoutDraft?.payment).toEqual({ method: 'card' });

    await patchPaymentOnly('"4"', 'cash_on_delivery');
    expect(state.captured).not.toBeNull();
    expect(state.captured?.checkoutDraft).toBeUndefined();
  });
});

describe('receipts in storage keep no personal data (E102)', () => {
  beforeAll(() => {
    if (!isCatalogFixtureShape(catalogFixture)) {
      throw new Error('[mocks-handlers.spec] committed fixture does not match expected shape');
    }
    loadCatalogFixture(catalogFixture);
  });

  const SESSION_1 = 'spec-session-e102';
  const MOTO = 'motorola-edge-50-fusion--zold--256';
  const IDEMPOTENCY_KEY = 'idem-e102-order';

  const VALID_CONTACT = {
    fullName: 'Teszt Elek',
    email: 'Teszt.Elek@Pelda.hu',
    phone: '+36301234567',
  };
  const VALID_BILLING = {
    name: 'Teszt Elek',
    address: {
      countryCode: 'HU',
      postalCode: '1052',
      city: 'Budapest',
      line1: 'Petőfi utca 1.',
    },
  };
  const VALID_DELIVERY_ADDRESS = {
    countryCode: 'HU',
    postalCode: '1052',
    city: 'Budapest',
    line1: 'Petőfi utca 1.',
  };

  /** Everything the shopper typed that must not reach the snapshot. */
  const PII: readonly string[] = [
    VALID_CONTACT.email,
    VALID_CONTACT.email.toLowerCase(),
    VALID_CONTACT.fullName,
    VALID_CONTACT.phone,
    VALID_BILLING.address.line1,
  ];

  let clock: Clock;
  let ids: Ids;
  let options: {
    repository: Repository;
    clock: Clock;
    ids: Ids;
    scenario: ReturnType<Repository['getScenario']>;
    apiRoot: string;
  };

  beforeEach(() => {
    clock = createFixedClock('2026-09-20T10:00:00.000Z');
    ids = createDeterministicIds(1);
    options = {
      repository: new Repository(DEFAULT_SCENARIO, ids, clock),
      clock,
      ids,
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
  });

  function session1Headers(): Record<string, string> {
    return { 'X-Demo-Session': SESSION_1, 'Content-Type': 'application/json' };
  }

  function expectRecord(value: unknown): asserts value is Record<string, unknown> {
    if (!isRecord(value)) {
      throw new Error('expected an object');
    }
  }

  function findRecord(arr: readonly unknown[]): Record<string, unknown> | undefined {
    for (const candidate of arr) {
      if (isRecord(candidate)) return candidate;
    }
    return undefined;
  }

  /**
   * Seeds the cart, patches a complete home-delivery cash-on-delivery draft
   * and places the order through the real handlers, with a `persist` hook
   * that captures the snapshot `buildSnapshot` produced. Returns the 201 body.
   */
  async function placeCashOnDeliveryOrder(state: {
    captured: MockSnapshot | null;
  }): Promise<Record<string, unknown>> {
    const persist = (sessionId: string): void => {
      const cart = cartStore.current;
      const checkout = checkoutStore.current;
      const order = orderStore.current;
      if (cart === null || checkout === null || order === null)
        throw new Error('stores not initialised');
      state.captured = buildSnapshot({ cart, checkout, order }, sessionId, Date.parse(clock.now()));
    };
    server.use(...createHandlers({ ...options, persist }));

    const motoRes = await fetch('http://localhost/api/v1/cart/items', {
      method: 'POST',
      headers: { ...session1Headers(), 'If-Match': '"1"' },
      body: JSON.stringify({ variantId: MOTO, quantity: 1 }),
    });
    expect(motoRes.status).toBe(200);

    const patchRes = await fetch('http://localhost/api/v1/checkout', {
      method: 'PATCH',
      headers: { ...session1Headers(), 'If-Match': '"2"' },
      body: JSON.stringify({
        contact: VALID_CONTACT,
        billing: VALID_BILLING,
        delivery: { optionId: 'home_delivery', address: VALID_DELIVERY_ADDRESS },
        payment: { method: 'cash_on_delivery' },
      }),
    });
    expect(patchRes.status).toBe(200);

    const first = await fetch('http://localhost/api/v1/orders', {
      method: 'POST',
      headers: {
        ...session1Headers(),
        'If-Match': '"3"',
        'Idempotency-Key': IDEMPOTENCY_KEY,
      },
      body: JSON.stringify({
        paymentMethod: 'cash_on_delivery',
        termsVersion: '2026-09',
        acceptedTerms: true,
      }),
    });
    expect(first.status).toBe(201);
    const firstBody: unknown = await first.json();
    expectRecord(firstBody);
    return firstBody;
  }

  it('R-01 the saved receipt holds none of the typed personal data', async () => {
    const state = { captured: null as MockSnapshot | null };
    await placeCashOnDeliveryOrder(state);
    if (state.captured === null) throw new Error('snapshot not captured');

    expect(state.captured.receipts).toHaveLength(1);
    const serialized = JSON.stringify(state.captured.receipts);
    for (const needle of PII) {
      expect(serialized).not.toContain(needle);
    }

    const receipt = findRecord(state.captured.receipts);
    if (receipt === undefined) throw new Error('no receipt in the snapshot');
    expect(receipt['contactEmail']).toBe(REDACTED_CONTACT_EMAIL);
    const billing = receipt['billing'];
    expectRecord(billing);
    expect(billing['name']).toBe('redacted');
  });

  it('R-02 the saved replay body holds none of it either', async () => {
    const state = { captured: null as MockSnapshot | null };
    await placeCashOnDeliveryOrder(state);
    if (state.captured === null) throw new Error('snapshot not captured');

    // The cash-on-delivery order is the only idempotent mutation here, so
    // the one cached record is the `POST /orders` replay body.
    expect(state.captured.idempotency).toHaveLength(1);
    const serialized = JSON.stringify(state.captured.idempotency);
    for (const needle of PII) {
      expect(serialized).not.toContain(needle);
    }
  });

  it('R-03 a reload answers the same order without the personal data', async () => {
    const state = { captured: null as MockSnapshot | null };
    const firstBody = await placeCashOnDeliveryOrder(state);
    if (state.captured === null) throw new Error('snapshot not captured');
    const orderId = firstBody['id'];
    if (typeof orderId !== 'string') throw new Error('order id is not a string');

    server.resetHandlers();
    server.use(...createHandlers({ ...options, snapshot: state.captured }));

    const reload = await fetch(`http://localhost/api/v1/orders/${orderId}`, {
      headers: session1Headers(),
    });
    expect(reload.status).toBe(200);
    const reloadBody: unknown = await reload.json();
    expectRecord(reloadBody);
    expect(reloadBody['id']).toBe(firstBody['id']);
    expect(reloadBody['orderNumber']).toBe(firstBody['orderNumber']);
    expect(reloadBody['items']).toEqual(firstBody['items']);
    expect(reloadBody['total']).toEqual(firstBody['total']);
    const billing = reloadBody['billing'];
    expectRecord(billing);
    expect(billing['name']).toBe('redacted');
    const delivery = reloadBody['delivery'];
    expectRecord(delivery);
    const address = delivery['address'];
    expectRecord(address);
    expect(address['line1']).toBe('redacted');

    const replay = await fetch('http://localhost/api/v1/orders', {
      method: 'POST',
      headers: {
        ...session1Headers(),
        'If-Match': '"1"',
        'Idempotency-Key': IDEMPOTENCY_KEY,
      },
      body: JSON.stringify({
        paymentMethod: 'cash_on_delivery',
        termsVersion: '2026-09',
        acceptedTerms: true,
      }),
    });
    expect(replay.status).toBe(201);
    const replayBody: unknown = await replay.json();
    expectRecord(replayBody);
    expect(replayBody['id']).toBe(firstBody['id']);
    const serialized = JSON.stringify(replayBody);
    for (const needle of PII) {
      expect(serialized).not.toContain(needle);
    }
  });

  it('R-04 the page that placed the order still reads it whole', async () => {
    const state = { captured: null as MockSnapshot | null };
    const firstBody = await placeCashOnDeliveryOrder(state);
    const orderId = firstBody['id'];
    if (typeof orderId !== 'string') throw new Error('order id is not a string');

    const live = await fetch(`http://localhost/api/v1/orders/${orderId}`, {
      headers: session1Headers(),
    });
    expect(live.status).toBe(200);
    const liveBody: unknown = await live.json();
    expectRecord(liveBody);
    expect(liveBody['contactEmail']).toBe(firstBody['contactEmail']);
    expect(liveBody['contactEmail']).not.toBe(REDACTED_CONTACT_EMAIL);
    expect(liveBody['billing']).toEqual(VALID_BILLING);
  });
});

describe('dispatcher shell', () => {
  it('answers an unregistered /api/v1 route with the English NOT_FOUND Problem', async () => {
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    server.use(
      ...createHandlers({
        repository: new Repository(DEFAULT_SCENARIO, createDeterministicIds(1), clock),
        clock,
        ids: createDeterministicIds(1),
        scenario: DEFAULT_SCENARIO,
        apiRoot: 'http://localhost/api/v1',
      }),
    );
    const res = await fetch('http://localhost/api/v1/no-such-route');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(await res.json()).toEqual({
      type: 'urn:mi-bolt:problem:not-found',
      title: 'Resource not found',
      status: 404,
      code: 'NOT_FOUND',
      detail: 'No mock handler is registered for this route.',
      traceId: 'mock-trace-default',
      fieldErrors: [],
    });
  });
});
