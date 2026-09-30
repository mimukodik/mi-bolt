/**
 * T05 — tab-scoped sessionStorage snapshot adapter.
 *
 * The persistence layer is the only place that writes to
 * `sessionStorage`. Snapshot v2 carries the cart, the checkout draft,
 * the payment intents and the order receipts read from the three live
 * mock stores at save time, and seeds them back through
 * `options.snapshot` at handler construction time.
 *
 * `hydrate()` rejects malformed JSON, expired snapshots (older than
 * the documented `MAX_AGE_MS`), version mismatches and any field that
 * fails the allowlist shape. A rejection clears the corrupted entry
 * so the next save starts from a clean slate, and the reason is kept
 * in `Persistence.lastDiscard()` so the shop can say why the saved
 * cart it expected is gone.
 *
 * Storage-denied mode (private browsing, security errors) keeps
 * state in an in-memory cache scoped to the adapter instance and
 * announces the limitation via a single `console.warn` so the user
 * understands why a reload would lose the cart.
 */

import type { BillingDetails } from '@mi-bolt/api/models/billing-details';
import type { Contact } from '@mi-bolt/api/models/contact';
import type { DeliverySelection } from '@mi-bolt/api/models/delivery-selection';
import type { OrderReceipt } from '@mi-bolt/api/models/order-receipt';
import type { PaymentIntent } from '@mi-bolt/api/models/payment-intent';
import type { PaymentSelection } from '@mi-bolt/api/models/payment-selection';
import type { Address } from '@mi-bolt/api/models/address';
import type { OrderLine } from '@mi-bolt/api/models/order-line';
import type { CheckoutSummary } from '@mi-bolt/api/models/checkout-summary';

import { isRecord } from './is-record';
import type { ScenarioName } from './scenarios';
import type { PersistedIdempotencyRecord } from './idempotency';

/** Snapshot key prefix; the scenario name namespaces the entry. */
const SNAPSHOT_KEY_PREFIX = 'mi-bolt.snapshot.';

/**
 * Bumped whenever the on-disk shape changes incompatibly.
 * Version 3 added `idempotency`: the unexpired records held in
 * `IdempotencyStore`. A v2 entry found in a browser is discarded
 * on the next hydrate — that is the intended behaviour for a
 * schema change, since the cart and draft would otherwise look
 * alive without their replay answers. Version 4 added
 * `usedPaymentIntentIds`: the card intents that already back an
 * order, so a reload cannot let one back a second order.
 */
export const SNAPSHOT_SCHEMA_VERSION = 5;

/** Snapshots older than this are considered stale and discarded. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimal cart line kept across reload. */
export interface PersistedCartLine {
  variantId: string;
  quantity: number;
  unitPrice?: number;
}

/** Cart snapshot — id, version, timestamps, line items. */
export interface PersistedCart {
  basketRevision?: number;
  priceChanged?: boolean;
  id: string;
  version: number;
  createdAt: string;
  expiresAt: string;
  items: readonly PersistedCartLine[];
}

/** The four draft sections the checkout store keeps per session. */
export interface PersistedCheckoutDraft {
  revision?: number;
  contact?: Contact;
  billing?: BillingDetails;
  delivery?: DeliverySelection;
  payment?: PaymentSelection;
}

/** Accepted commercial values only; no shopper details are kept here. */
export interface PersistedPaymentIntent extends PaymentIntent {
  draftRevision?: number;
  approvedCartId?: string;
  approvedItems?: OrderLine[];
  approvedSummary?: CheckoutSummary;
  draftFingerprint?: string;
}

/** Root snapshot written under `${SNAPSHOT_KEY_PREFIX}${scenarioName}`. */
export interface MockSnapshot {
  schemaVersion: number;
  providerId: 'mi-bolt';
  simulatedSessionId: string;
  savedAt: string;
  expiresAt: string;
  cart?: PersistedCart;
  checkoutDraft?: PersistedCheckoutDraft;
  paymentIntents: readonly PersistedPaymentIntent[];
  receipts: readonly OrderReceipt[];
  usedPaymentIntentIds: readonly string[];
  idempotency: readonly PersistedIdempotencyRecord[];
}

export interface PersistenceOptions {
  /** Injectable clock so tests can exercise age/v expiry deterministically. */
  nowMs: () => number;
  /** Injectable storage adapter; defaults to `globalThis.sessionStorage`. */
  storage?: StorageLike | null;
}

/** Storage shape used by the adapter — works for both `Storage` and stubs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Single-warn flag carried per-instance so test setup stays isolated. */
class SessionStorageAdapter {
  private denied: boolean;
  private warned = false;
  private readonly memory = new Map<string, string>();

  constructor(
    private readonly storage: StorageLike | null,
    denied = false,
  ) {
    this.denied = denied;
  }

  read(key: string): string | null {
    if (this.storage !== null && !this.denied) {
      try {
        return this.storage.getItem(key);
      } catch {
        this.denied = true;
      }
    }
    return this.memory.get(key) ?? null;
  }

  write(key: string, value: string): { ok: boolean } {
    if (this.storage !== null && !this.denied) {
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
    if (this.storage !== null && !this.denied) {
      try {
        this.storage.removeItem(key);
      } catch {
        this.denied = true;
      }
    }
    this.memory.delete(key);
  }

  /** Whether storage access has failed and the adapter is using the in-memory fallback. */
  isDenied(): boolean {
    return this.denied;
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
 * Returns the snapshot key for a scenario. Exported so tests can
 * reference the same naming convention.
 */
export function snapshotKey(scenarioName: ScenarioName): string {
  return `${SNAPSHOT_KEY_PREFIX}${scenarioName}`;
}

/** True when `value` is an object shaped like `StorageLike` (get/set/remove item). */
function isStorageLike(value: unknown): value is StorageLike {
  if (!isRecord(value)) return false;
  return (
    typeof value['getItem'] === 'function' &&
    typeof value['setItem'] === 'function' &&
    typeof value['removeItem'] === 'function'
  );
}

/** Outcome of looking for a usable `sessionStorage` on a global object. */
interface StorageProbe {
  /** The storage to use, `null` when there is none or it is blocked. */
  readonly storage: StorageLike | null;
  /** True when the read itself was refused, so access is denied outright. */
  readonly denied: boolean;
}

/**
 * Looks for a storage-like `sessionStorage` on `value`. `value` is read
 * as `unknown` first because a Node/SSR runtime has no `sessionStorage`
 * at all, whatever the DOM lib types assume.
 *
 * The property read is guarded because the `sessionStorage` getter throws
 * a `SecurityError` DOMException when the browser blocks site data or
 * cookies, and `'sessionStorage' in value` stays `true` there — the `in`
 * operator never calls the getter, so a shape check alone is not enough
 * (https://html.spec.whatwg.org/multipage/webstorage.html). A throw is a
 * denial rather than an absent value: the adapter starts in its
 * in-memory mode and `DemoNotice` announces the reload limitation.
 */
function probeSessionStorage(value: unknown): StorageProbe {
  if (!isRecord(value)) return { storage: null, denied: false };
  if (!('sessionStorage' in value)) return { storage: null, denied: false };
  let candidate: unknown;
  try {
    candidate = value['sessionStorage'];
  } catch {
    return { storage: null, denied: true };
  }
  return { storage: isStorageLike(candidate) ? candidate : null, denied: false };
}

/** Detects Node and other non-DOM environments where sessionStorage is missing. */
function resolveDefaultStorage(): StorageProbe {
  const globalScope: unknown = globalThis;
  return probeSessionStorage(globalScope);
}

/**
 * Factory used by the browser bootstrap. The returned Persistence
 * instance can also be used from Node tests; pass `storage: undefined`
 * (the default) to read from `globalThis.sessionStorage` when
 * available and fall back to in-memory otherwise.
 */
export function createBrowserPersistence(options: PersistenceOptions): Persistence {
  const resolved: StorageProbe =
    options.storage === undefined
      ? resolveDefaultStorage()
      : { storage: options.storage, denied: false };
  const adapter = new SessionStorageAdapter(resolved.storage, resolved.denied);
  return new Persistence(adapter, options.nowMs);
}

/**
 * Why the last `hydrate()` dropped the stored entry: `'corrupt'` for
 * unparsable JSON, an unparsable timestamp or a shape the allowlist
 * rejects, `'version'` for an entry another `SNAPSHOT_SCHEMA_VERSION`
 * wrote, `'stale'` for one that is too old or already expired.
 */
export type SnapshotDiscard = 'corrupt' | 'version' | 'stale';

/**
 * Pure persistence façade. The class does not touch the DOM or
 * `globalThis` directly; tests construct it with their own storage
 * stub to exercise success and failure paths without a browser.
 */
export class Persistence {
  private lastSnapshot: MockSnapshot | null = null;

  private lastDiscardReason: SnapshotDiscard | null = null;

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
   * broken state, and `lastDiscard()` holds the reason so the shop
   * can say so.
   */
  hydrate(scenarioName: ScenarioName): MockSnapshot | null {
    const key = snapshotKey(scenarioName);
    this.lastDiscardReason = null;
    const raw = this.adapter.read(key);
    if (raw === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.lastDiscardReason = 'corrupt';
      this.adapter.remove(key);
      return null;
    }
    // The version is checked before the allowlist: a real entry from an
    // older schema fails `isValidSnapshot` on the field that version
    // added, and would otherwise be reported as corrupt rather than as
    // a version mismatch.
    if (
      isRecord(parsed) &&
      typeof parsed['schemaVersion'] === 'number' &&
      parsed['schemaVersion'] !== SNAPSHOT_SCHEMA_VERSION
    ) {
      this.lastDiscardReason = 'version';
      this.adapter.remove(key);
      return null;
    }
    if (!isValidSnapshot(parsed)) {
      this.lastDiscardReason = 'corrupt';
      this.adapter.remove(key);
      return null;
    }
    const savedAt = Date.parse(parsed.savedAt);
    const expiresAt = Date.parse(parsed.expiresAt);
    if (Number.isNaN(savedAt) || Number.isNaN(expiresAt)) {
      this.lastDiscardReason = 'corrupt';
      this.adapter.remove(key);
      return null;
    }
    const ageMs = this.nowMs() - savedAt;
    if (ageMs < 0 || ageMs > MAX_AGE_MS || expiresAt < this.nowMs()) {
      this.lastDiscardReason = 'stale';
      this.adapter.remove(key);
      return null;
    }
    this.lastSnapshot = parsed;
    return parsed;
  }

  /**
   * Why the last `hydrate()` dropped the stored entry, or `null` when
   * it restored one or found none. The shop reads this to explain why
   * a cart it expected to find is gone.
   */
  lastDiscard(): SnapshotDiscard | null {
    return this.lastDiscardReason;
  }

  /** Clears the snapshot for the given scenario (used by tests and `reset`). */
  clear(scenarioName: ScenarioName): void {
    this.adapter.remove(snapshotKey(scenarioName));
  }

  /** Returns the last hydrated snapshot, useful for handler factories. */
  peekLast(): MockSnapshot | null {
    return this.lastSnapshot;
  }

  /**
   * Whether the underlying storage has been denied (private browsing,
   * blocked site data, a security error) and the adapter has fallen back
   * to an in-memory cache for the rest of this session. `DemoNotice`'s
   * `'memory'` state (FIX-70-AC05) reads this.
   */
  isDenied(): boolean {
    return this.adapter.isDenied();
  }
}

/**
 * Allowlist validator. Every field referenced here is on the
 * persisted contract; anything else fails the parse and the entry
 * is cleared. The validator returns a typed object on success so
 * downstream code can rely on the narrow shape.
 */
function isValidSnapshot(value: unknown): value is MockSnapshot {
  if (!isRecord(value)) return false;
  const v = value;
  if (typeof v['schemaVersion'] !== 'number') return false;
  if (v['providerId'] !== 'mi-bolt') return false;
  if (typeof v['simulatedSessionId'] !== 'string') return false;
  if (typeof v['savedAt'] !== 'string') return false;
  if (typeof v['expiresAt'] !== 'string') return false;
  if (!Array.isArray(v['paymentIntents'])) return false;
  if (!Array.isArray(v['receipts'])) return false;
  if (!Array.isArray(v['usedPaymentIntentIds'])) return false;
  if (!Array.isArray(v['idempotency'])) return false;
  const cart = v['cart'];
  if (cart !== undefined && !isValidCart(cart)) return false;
  const draft = v['checkoutDraft'];
  if (draft !== undefined && !isValidCheckoutDraft(draft)) return false;
  for (const intent of v['paymentIntents']) {
    if (!isValidPaymentIntent(intent)) return false;
  }
  for (const receipt of v['receipts']) {
    if (!isValidOrderReceipt(receipt)) return false;
  }
  for (const id of v['usedPaymentIntentIds']) {
    if (typeof id !== 'string') return false;
  }
  for (const record of v['idempotency']) {
    if (!isValidIdempotencyRecord(record)) return false;
  }
  // Any unknown top-level property means a future change accidentally
  // added a field and we should fail closed.
  const allowed = new Set([
    'schemaVersion',
    'providerId',
    'simulatedSessionId',
    'savedAt',
    'expiresAt',
    'cart',
    'checkoutDraft',
    'paymentIntents',
    'receipts',
    'usedPaymentIntentIds',
    'idempotency',
  ]);
  for (const key of Object.keys(v)) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

function isValidCart(value: unknown): value is PersistedCart {
  if (!isRecord(value)) return false;
  const c = value;
  if (typeof c['id'] !== 'string') return false;
  if (typeof c['version'] !== 'number' || !Number.isInteger(c['version']) || c['version'] < 1)
    return false;
  if (typeof c['createdAt'] !== 'string' || !Number.isFinite(Date.parse(c['createdAt'])))
    return false;
  if (typeof c['expiresAt'] !== 'string' || !Number.isFinite(Date.parse(c['expiresAt'])))
    return false;
  if (Date.parse(c['expiresAt']) <= Date.parse(c['createdAt'])) return false;
  if (!Array.isArray(c['items'])) return false;
  if (
    c['basketRevision'] !== undefined &&
    (!Number.isSafeInteger(c['basketRevision']) ||
      typeof c['basketRevision'] !== 'number' ||
      c['basketRevision'] < 0)
  )
    return false;
  if (c['priceChanged'] !== undefined && typeof c['priceChanged'] !== 'boolean') return false;
  const allowed = new Set([
    'id',
    'version',
    'createdAt',
    'expiresAt',
    'items',
    'basketRevision',
    'priceChanged',
  ]);
  for (const key of Object.keys(c)) {
    if (!allowed.has(key)) return false;
  }
  for (const item of c['items']) {
    if (!isValidCartLine(item)) return false;
  }
  return true;
}

function isValidCartLine(value: unknown): value is PersistedCartLine {
  if (!isRecord(value)) return false;
  const i = value;
  if (typeof i['variantId'] !== 'string') return false;
  if (!isPositiveInteger(i['quantity'])) return false;
  if (
    i['unitPrice'] !== undefined &&
    (typeof i['unitPrice'] !== 'number' ||
      !Number.isSafeInteger(i['unitPrice']) ||
      i['unitPrice'] < 0)
  )
    return false;
  const allowed = new Set(['variantId', 'quantity', 'unitPrice']);
  for (const key of Object.keys(i)) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

function isValidIdempotencyRecord(value: unknown): value is PersistedIdempotencyRecord {
  if (!isRecord(value)) return false;
  const r = value;
  if (typeof r['key'] !== 'string') return false;
  if (typeof r['status'] !== 'number' || !Number.isInteger(r['status'])) return false;
  if (!isRecord(r['body'])) return false;
  if (typeof r['payloadHash'] !== 'string') return false;
  if (
    typeof r['expiresAtMs'] !== 'number' ||
    !Number.isInteger(r['expiresAtMs']) ||
    r['expiresAtMs'] < 1
  )
    return false;
  const allowed = new Set(['key', 'status', 'body', 'payloadHash', 'expiresAtMs']);
  for (const key of Object.keys(r)) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

function isValidPaymentIntent(value: unknown): value is PersistedPaymentIntent {
  if (!isRecord(value)) return false;
  const v = value;
  if (typeof v['id'] !== 'string') return false;
  if (typeof v['createdAt'] !== 'string') return false;
  if (typeof v['expiresAt'] !== 'string') return false;
  if (typeof v['redirectUrl'] !== 'string') return false;
  if (typeof v['returnUrl'] !== 'string') return false;
  const status = v['status'];
  if (
    status !== 'requires_action' &&
    status !== 'succeeded' &&
    status !== 'declined' &&
    status !== 'pending'
  ) {
    return false;
  }
  if (!isValidMoney(v['amount'])) return false;
  if (
    v['basketRevision'] !== undefined &&
    (typeof v['basketRevision'] !== 'number' ||
      !Number.isSafeInteger(v['basketRevision']) ||
      v['basketRevision'] < 0)
  )
    return false;
  if (v['approvedCartId'] !== undefined) {
    if (typeof v['approvedCartId'] !== 'string' || typeof v['draftFingerprint'] !== 'string')
      return false;
    if (
      typeof v['draftRevision'] !== 'number' ||
      !Number.isSafeInteger(v['draftRevision']) ||
      v['draftRevision'] < 0
    )
      return false;
    if (!Array.isArray(v['approvedItems']) || !v['approvedItems'].every(isValidOrderLine))
      return false;
    const summary = v['approvedSummary'];
    if (
      !isRecord(summary) ||
      !['subtotal', 'shippingFee', 'paymentFee', 'total'].every((key) => isValidMoney(summary[key]))
    )
      return false;
    if (
      Object.keys(summary).some(
        (key) => !['subtotal', 'shippingFee', 'paymentFee', 'total'].includes(key),
      )
    )
      return false;
  } else if (
    v['approvedItems'] !== undefined ||
    v['approvedSummary'] !== undefined ||
    v['draftRevision'] !== undefined ||
    v['draftFingerprint'] !== undefined
  )
    return false;
  const allowed = new Set([
    'id',
    'createdAt',
    'expiresAt',
    'redirectUrl',
    'returnUrl',
    'status',
    'amount',
    'basketRevision',
    'approvedCartId',
    'approvedItems',
    'approvedSummary',
    'draftFingerprint',
    'draftRevision',
  ]);
  for (const key of Object.keys(v)) if (!allowed.has(key)) return false;
  return true;
}

function isValidOrderReceipt(value: unknown): value is OrderReceipt {
  if (!isRecord(value)) return false;
  const r = value;
  if (typeof r['id'] !== 'string') return false;
  if (typeof r['orderNumber'] !== 'string') return false;
  if (typeof r['createdAt'] !== 'string') return false;
  if (typeof r['contactEmail'] !== 'string') return false;
  if (typeof r['notice'] !== 'string') return false;
  if (r['status'] !== 'confirmed') return false;
  if (!isValidBillingDetails(r['billing'])) return false;
  if (!isValidDeliverySelection(r['delivery'])) return false;
  if (!isValidMoney(r['subtotal'])) return false;
  if (!isValidMoney(r['shippingFee'])) return false;
  if (!isValidMoney(r['paymentFee'])) return false;
  if (!isValidMoney(r['total'])) return false;
  const method = r['paymentMethod'];
  if (method !== 'card' && method !== 'cash_on_delivery') return false;
  if (!Array.isArray(r['items'])) return false;
  const allowed = new Set([
    'id',
    'orderNumber',
    'createdAt',
    'contactEmail',
    'notice',
    'status',
    'billing',
    'delivery',
    'subtotal',
    'shippingFee',
    'paymentFee',
    'total',
    'paymentMethod',
    'items',
  ]);
  for (const key of Object.keys(r)) if (!allowed.has(key)) return false;
  for (const item of r['items']) {
    if (!isValidOrderLine(item)) return false;
  }
  return true;
}

function isValidOrderLine(value: unknown): value is OrderLine {
  if (!isRecord(value)) return false;
  const i = value;
  if (typeof i['variantId'] !== 'string') return false;
  if (typeof i['productName'] !== 'string') return false;
  if (typeof i['colorName'] !== 'string') return false;
  if (i['storageGb'] !== 128 && i['storageGb'] !== 256 && i['storageGb'] !== 512) return false;
  if (!isPositiveInteger(i['quantity'])) return false;
  if (!isValidMoney(i['unitPrice'])) return false;
  if (!isValidMoney(i['lineTotal'])) return false;
  const allowed = new Set([
    'variantId',
    'productName',
    'colorName',
    'storageGb',
    'quantity',
    'unitPrice',
    'lineTotal',
  ]);
  for (const key of Object.keys(i)) if (!allowed.has(key)) return false;
  return true;
}

function isValidBillingDetails(value: unknown): value is BillingDetails {
  if (!isRecord(value)) return false;
  const v = value;
  if (typeof v['name'] !== 'string') return false;
  if (!isValidAddress(v['address'])) return false;
  const allowed = new Set(['name', 'address']);
  for (const key of Object.keys(v)) if (!allowed.has(key)) return false;
  return true;
}

function isValidAddress(value: unknown): value is Address {
  if (!isRecord(value)) return false;
  const a = value;
  if (typeof a['city'] !== 'string') return false;
  if (a['countryCode'] !== 'HU') return false;
  if (typeof a['line1'] !== 'string') return false;
  const line2 = a['line2'];
  if (line2 !== undefined && typeof line2 !== 'string') return false;
  if (typeof a['postalCode'] !== 'string') return false;
  const allowed = new Set(['city', 'countryCode', 'line1', 'line2', 'postalCode']);
  for (const key of Object.keys(a)) if (!allowed.has(key)) return false;
  return true;
}

function isValidDeliverySelection(value: unknown): value is DeliverySelection {
  if (!isRecord(value)) return false;
  const v = value;
  const optionId = v['optionId'];
  if (optionId === 'home_delivery') {
    if (!isValidAddress(v['address'])) return false;
    const allowed = new Set(['optionId', 'address']);
    for (const key of Object.keys(v)) if (!allowed.has(key)) return false;
    return true;
  }
  if (optionId === 'pickup_point') {
    const allowed = new Set(['optionId']);
    for (const key of Object.keys(v)) if (!allowed.has(key)) return false;
    return true;
  }
  return false;
}

function isValidContact(value: unknown): value is Contact {
  if (!isRecord(value)) return false;
  const v = value;
  if (typeof v['email'] !== 'string') return false;
  if (typeof v['fullName'] !== 'string') return false;
  if (typeof v['phone'] !== 'string') return false;
  const allowed = new Set(['email', 'fullName', 'phone']);
  for (const key of Object.keys(v)) if (!allowed.has(key)) return false;
  return true;
}

function isValidPaymentSelection(value: unknown): value is PaymentSelection {
  if (!isRecord(value)) return false;
  const v = value;
  const method = v['method'];
  if (method !== 'card' && method !== 'cash_on_delivery') return false;
  const allowed = new Set(['method']);
  for (const key of Object.keys(v)) if (!allowed.has(key)) return false;
  return true;
}

function isValidCheckoutDraft(value: unknown): value is PersistedCheckoutDraft {
  if (!isRecord(value)) return false;
  const v = value;
  if (
    v['revision'] !== undefined &&
    (typeof v['revision'] !== 'number' || !Number.isSafeInteger(v['revision']) || v['revision'] < 0)
  )
    return false;
  if (v['contact'] !== undefined && !isValidContact(v['contact'])) return false;
  if (v['billing'] !== undefined && !isValidBillingDetails(v['billing'])) return false;
  if (v['delivery'] !== undefined && !isValidDeliverySelection(v['delivery'])) return false;
  if (v['payment'] !== undefined && !isValidPaymentSelection(v['payment'])) return false;
  const allowed = new Set(['contact', 'billing', 'delivery', 'payment', 'revision']);
  for (const key of Object.keys(v)) if (!allowed.has(key)) return false;
  return true;
}

function isValidMoney(value: unknown): value is { amount: number; currency: 'HUF' } {
  if (!isRecord(value)) return false;
  const m = value;
  if (typeof m['amount'] !== 'number' || !Number.isFinite(m['amount']) || m['amount'] < 0)
    return false;
  if (m['currency'] !== 'HUF') return false;
  return true;
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0
  );
}
