/**
 * T05 — tab-scoped sessionStorage snapshot adapter.
 *
 * The persistence layer is the only place that writes to
 * `sessionStorage`. The allowlist excludes every PII field per the
 * privacy contract: contact details, addresses, draft checkout
 * sections, pending payment intent bodies and raw idempotency-key
 * bodies are never serialized. Only committed cart identity, cart
 * line items, cart version and the privacy-minimized committed
 * order receipt survive a reload.
 *
 * `hydrate()` rejects malformed JSON, expired snapshots (older than
 * 7 days), version mismatches and any field that fails the
 * allowlist shape. A rejection clears the corrupted entry so the
 * next save starts from a clean slate.
 *
 * Storage-denied mode (private browsing, security errors) keeps
 * state in an in-memory cache scoped to the adapter instance and
 * announces the limitation via a single `console.warn` so the user
 * understands why a reload would lose the cart.
 */

import type { ScenarioName } from './scenarios';

/** Snapshot key prefix; the scenario name namespaces the entry. */
const SNAPSHOT_KEY_PREFIX = 'mi-bolt.snapshot.';

/** Bumped whenever the on-disk shape changes incompatibly. */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/** Snapshots older than this are considered stale and discarded. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimal cart line kept across reload. */
export type PersistedCartLine = {
  id: string;
  variantId: string;
  quantity: number;
};

/** Cart snapshot — line ids, variant ids, quantities, version. */
export type PersistedCart = {
  id: string;
  version: number;
  items: readonly PersistedCartLine[];
  lastUpdatedAt: string;
};

/** Single committed order line in a privacy-minimized receipt. */
export type PersistedReceiptItem = {
  variantId: string;
  quantity: number;
  unitPrice: { amount: number; currency: string };
  lineTotal: { amount: number; currency: string };
};

/** Receipt kept across reload — order id, total, items, method, date. */
export type PersistedReceipt = {
  id: string;
  orderNumber: string;
  total: { amount: number; currency: string };
  paymentMethod: 'demo_card' | 'demo_cod';
  createdAt: string;
  items: readonly PersistedReceiptItem[];
};

/** Root snapshot written under `${SNAPSHOT_KEY_PREFIX}${scenarioName}`. */
export type MockSnapshot = {
  schemaVersion: number;
  providerId: 'mi-bolt';
  simulatedSessionId: string;
  savedAt: string;
  expiresAt: string;
  cart?: PersistedCart;
  receipts: readonly PersistedReceipt[];
};

export type PersistenceOptions = {
  /** Injectable clock so tests can exercise age/v expiry deterministically. */
  nowMs: () => number;
  /** Injectable storage adapter; defaults to `globalThis.sessionStorage`. */
  storage?: StorageLike | null;
};

/** Storage shape used by the adapter — works for both `Storage` and stubs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Single-warn flag carried per-instance so test setup stays isolated. */
class SessionStorageAdapter {
  private denied = false;
  private warned = false;
  private memory = new Map<string, string>();

  constructor(private readonly storage: StorageLike | null) {}

  read(key: string): string | null {
    if (this.storage && !this.denied) {
      try {
        return this.storage.getItem(key);
      } catch {
        this.denied = true;
      }
    }
    return this.memory.get(key) ?? null;
  }

  write(key: string, value: string): { ok: boolean } {
    if (this.storage && !this.denied) {
      try {
        this.storage.setItem(key, value);
        return { ok: true };
      } catch {
        this.denied = true;
        this.announceDenied();
      }
    } else {
      this.announceDenied();
    }
    this.memory.set(key, value);
    return { ok: false };
  }

  remove(key: string): void {
    if (this.storage && !this.denied) {
      try {
        this.storage.removeItem(key);
      } catch {
        this.denied = true;
      }
    }
    this.memory.delete(key);
  }

  private announceDenied(): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(
      '[mi-bolt] persistence: sessionStorage denied, using in-memory cache; reload will not restore snapshot.',
    );
  }
}

/**
 * Returns the snapshot key for a scenario. Exported so the E2E
 * fixture can reference the same naming convention.
 */
export function snapshotKey(scenarioName: ScenarioName): string {
  return `${SNAPSHOT_KEY_PREFIX}${scenarioName}`;
}

/** Detects Node and other non-DOM environments where sessionStorage is missing. */
function resolveDefaultStorage(): StorageLike | null {
  const candidate = (globalThis as { sessionStorage?: StorageLike | undefined })
    .sessionStorage;
  if (!candidate) return null;
  return candidate;
}

/**
 * Factory used by the browser bootstrap. The returned Persistence
 * instance can also be used from Node tests; pass `storage: undefined`
 * (the default) to read from `globalThis.sessionStorage` when
 * available and fall back to in-memory otherwise.
 */
export function createBrowserPersistence(options: PersistenceOptions): Persistence {
  const storage = options.storage === undefined ? resolveDefaultStorage() : options.storage;
  const adapter = new SessionStorageAdapter(storage);
  return new Persistence(adapter, options.nowMs);
}

/**
 * Pure persistence façade. The class does not touch the DOM or
 * `globalThis` directly; tests construct it with their own storage
 * stub to exercise success and failure paths without a browser.
 */
export class Persistence {
  private lastSnapshot: MockSnapshot | null = null;

  constructor(
    private readonly adapter: SessionStorageAdapter,
    private readonly nowMs: () => number,
  ) {}

  /** Persists a snapshot for the given scenario. */
  save(scenarioName: ScenarioName, snapshot: MockSnapshot): { ok: boolean } {
    const key = snapshotKey(scenarioName);
    const result = this.adapter.write(key, JSON.stringify(snapshot));
    this.lastSnapshot = snapshot;
    return result;
  }

  /**
   * Restores the snapshot for the given scenario. Returns `null`
   * when no entry exists, the entry is malformed, expired, or fails
   * the version/allowlist checks. The corrupted entry is cleared
   * before returning so subsequent saves do not replay the same
   * broken state.
   */
  hydrate(scenarioName: ScenarioName): MockSnapshot | null {
    const key = snapshotKey(scenarioName);
    const raw = this.adapter.read(key);
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.adapter.remove(key);
      return null;
    }
    if (!isValidSnapshot(parsed)) {
      this.adapter.remove(key);
      return null;
    }
    if (parsed.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      this.adapter.remove(key);
      return null;
    }
    const savedAt = Date.parse(parsed.savedAt);
    const expiresAt = Date.parse(parsed.expiresAt);
    if (Number.isNaN(savedAt) || Number.isNaN(expiresAt)) {
      this.adapter.remove(key);
      return null;
    }
    const ageMs = this.nowMs() - savedAt;
    if (ageMs < 0 || ageMs > MAX_AGE_MS || expiresAt < this.nowMs()) {
      this.adapter.remove(key);
      return null;
    }
    this.lastSnapshot = parsed;
    return parsed;
  }

  /** Clears the snapshot for the given scenario (used by tests and `reset`). */
  clear(scenarioName: ScenarioName): void {
    this.adapter.remove(snapshotKey(scenarioName));
  }

  /** Returns the last hydrated snapshot, useful for handler factories. */
  peekLast(): MockSnapshot | null {
    return this.lastSnapshot;
  }
}

/**
 * Allowlist validator. Every field referenced here is on the
 * persisted contract; anything else fails the parse and the entry
 * is cleared. The validator returns a typed object on success so
 * downstream code can rely on the narrow shape.
 */
function isValidSnapshot(value: unknown): value is MockSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = record(value);
  if (typeof v['schemaVersion'] !== 'number') return false;
  if (v['providerId'] !== 'mi-bolt') return false;
  if (typeof v['simulatedSessionId'] !== 'string') return false;
  if (typeof v['savedAt'] !== 'string') return false;
  if (typeof v['expiresAt'] !== 'string') return false;
  if (!Array.isArray(v['receipts'])) return false;
  const cart = v['cart'];
  if (cart !== undefined && !isValidCart(cart)) return false;
  for (const receipt of v['receipts']) {
    if (!isValidReceipt(receipt)) return false;
  }
  // The PII denylist is enforced by shape: any unknown top-level
  // property means a future change accidentally added a field and
  // we should fail closed.
  const allowed = new Set([
    'schemaVersion',
    'providerId',
    'simulatedSessionId',
    'savedAt',
    'expiresAt',
    'cart',
    'receipts',
  ]);
  for (const key of Object.keys(v)) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

function isValidCart(value: unknown): value is PersistedCart {
  if (!value || typeof value !== 'object') return false;
  const c = record(value);
  if (typeof c['id'] !== 'string') return false;
  if (typeof c['version'] !== 'number') return false;
  if (!Array.isArray(c['items'])) return false;
  if (typeof c['lastUpdatedAt'] !== 'string') return false;
  const allowed = new Set(['id', 'version', 'items', 'lastUpdatedAt']);
  for (const key of Object.keys(c)) {
    if (!allowed.has(key)) return false;
  }
  for (const item of c['items']) {
    if (!isValidCartLine(item)) return false;
  }
  return true;
}

function isValidCartLine(value: unknown): value is PersistedCartLine {
  if (!value || typeof value !== 'object') return false;
  const i = record(value);
  if (typeof i['id'] !== 'string') return false;
  if (typeof i['variantId'] !== 'string') return false;
  if (!isPositiveInteger(i['quantity'])) return false;
  const allowed = new Set(['id', 'variantId', 'quantity']);
  for (const key of Object.keys(i)) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

function isValidReceipt(value: unknown): value is PersistedReceipt {
  if (!value || typeof value !== 'object') return false;
  const r = record(value);
  if (typeof r['id'] !== 'string') return false;
  if (typeof r['orderNumber'] !== 'string') return false;
  if (typeof r['createdAt'] !== 'string') return false;
  const method = r['paymentMethod'];
  if (method !== 'demo_card' && method !== 'demo_cod') return false;
  if (!isValidMoney(r['total'])) return false;
  if (!Array.isArray(r['items'])) return false;
  const allowed = new Set([
    'id',
    'orderNumber',
    'total',
    'paymentMethod',
    'createdAt',
    'items',
  ]);
  for (const key of Object.keys(r)) {
    if (!allowed.has(key)) return false;
  }
  for (const item of r['items']) {
    if (!isValidReceiptItem(item)) return false;
  }
  return true;
}

function isValidReceiptItem(value: unknown): value is PersistedReceiptItem {
  if (!value || typeof value !== 'object') return false;
  const i = record(value);
  if (typeof i['variantId'] !== 'string') return false;
  if (!isPositiveInteger(i['quantity'])) return false;
  if (!isValidMoney(i['unitPrice'])) return false;
  if (!isValidMoney(i['lineTotal'])) return false;
  const allowed = new Set(['variantId', 'quantity', 'unitPrice', 'lineTotal']);
  for (const key of Object.keys(i)) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

function isValidMoney(value: unknown): value is { amount: number; currency: string } {
  if (!value || typeof value !== 'object') return false;
  const m = record(value);
  if (typeof m['amount'] !== 'number' || !Number.isFinite(m['amount']) || m['amount'] < 0) return false;
  if (typeof m['currency'] !== 'string') return false;
  return true;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function record(value: object): Record<string, unknown> {
  return value as Record<string, unknown>;
}
