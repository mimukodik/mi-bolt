/**
 * T07 — idempotency cache.
 *
 * Replay window: 24 hours from the first successful response,
 * determined by the same injected `Clock` the repository uses so a
 * scenario advances both clocks in lockstep. The store is keyed by
 * `method|path|session|idempotencyKey` and carries the canonical
 * hash of the request body. Replays that match both the key and the
 * hash return the cached status+body. Replays that match the key
 * but not the hash surface as a 409 `IDEMPOTENCY_CONFLICT` so the
 * client cannot accidentally reuse a key for a different operation.
 *
 * The store is intentionally pure: it has no dependency on MSW, the
 * repository or the request body shape. Callers normalize the body
 * through `hashPayload` before asking the store anything; that lets
 * the same cache back cart, checkout, payment and order mutations
 * without each slice re-implementing canonicalization.
 */

import { isRecord } from './is-record';
import type { Clock } from './scenarios';

/** OpenAPI Idempotency-Key window — 24 hours from first success. */
export const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Outcome cached for a successful (or domain-rejected) replay. */
export interface IdempotencyOutcome {
  status: number;
  body: unknown;
}

/** Internal record — payload hash + expiry so replays do not leak. */
type IdempotencyRecord = IdempotencyOutcome & {
  payloadHash: string;
  expiresAtMs: number;
};

/** One cache entry as the snapshot carries it: the derived key plus the record. */
export interface PersistedIdempotencyRecord {
  key: string;
  status: number;
  body: unknown;
  payloadHash: string;
  expiresAtMs: number;
}

/**
 * Builds the cache key for an idempotent mutation. Method and path
 * are normalized to upper-case so `POST /carts` and `post /carts`
 * never accidentally create two cache entries.
 */
export function deriveIdempotencyKey(
  method: string,
  path: string,
  sessionId: string,
  idempotencyKey: string,
): string {
  return `${method.toUpperCase()}|${path}|${sessionId}|${idempotencyKey}`;
}

/**
 * Canonical, deterministic hash of an idempotent request body.
 * Objects are visited with sorted keys, arrays preserve order,
 * primitives are JSON-stringified. The result is itself a JSON
 * string so equality comparison is a plain string compare.
 */
export function hashPayload(payload: unknown): string {
  return canonicalize(payload);
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (typeof value === 'object') {
    // `typeof value === 'object'` alone narrows to `{}`; the guard keeps
    // the index access below sound for TypeScript without bringing the
    // `null`/array cases back, since both are already filtered above.
    if (!isRecord(value)) {
      return 'null';
    }
    const keys = Object.keys(value).sort();
    const parts: string[] = [];
    for (const key of keys) {
      if (value[key] === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${canonicalize(value[key])}`);
    }
    return `{${parts.join(',')}}`;
  }
  return 'null';
}

/**
 * Idempotency cache for atomic mock mutations. The store uses the
 * injected `Clock` to decide whether a record is still inside its
 * 24h window; expired entries are dropped on the next access.
 */
export class IdempotencyStore {
  private readonly entries = new Map<string, IdempotencyRecord>();

  constructor(private readonly clock: Clock) {}

  /**
   * Returns the cached outcome for `key` when its payload hash
   * matches and the record is still inside the replay window. Any
   * mismatch (hash, expiry, or missing entry) returns `null` so
   * callers proceed with a fresh execution.
   */
  find(key: string, payloadHash: string): IdempotencyOutcome | null {
    const record = this.entries.get(key);
    if (!record) return null;
    if (this.isExpired(record)) {
      this.entries.delete(key);
      return null;
    }
    if (record.payloadHash !== payloadHash) return null;
    return { status: record.status, body: record.body };
  }

  /**
   * Returns `true` when `key` is already cached with a different
   * payload hash inside the replay window. The caller MUST abort
   * the operation and surface a 409 `IDEMPOTENCY_CONFLICT` so a
   * stale key cannot rewrite state.
   */
  hasConflictingPayload(key: string, payloadHash: string): boolean {
    const record = this.entries.get(key);
    if (!record) return false;
    if (this.isExpired(record)) {
      this.entries.delete(key);
      return false;
    }
    return record.payloadHash !== payloadHash;
  }

  /**
   * Records the outcome of an idempotent operation. The record
   * expires 24 hours after the call so the next access after that
   * window sees no entry and the operation runs again.
   */
  record(key: string, payloadHash: string, outcome: IdempotencyOutcome): void {
    const nowMs = Date.parse(this.clock.now());
    this.entries.set(key, {
      status: outcome.status,
      body: outcome.body,
      payloadHash,
      expiresAtMs: nowMs + IDEMPOTENCY_WINDOW_MS,
    });
  }

  /** Every unexpired entry, for the snapshot builder. */
  toPersisted(): readonly PersistedIdempotencyRecord[] {
    const out: PersistedIdempotencyRecord[] = [];
    for (const [key, record] of this.entries) {
      if (this.isExpired(record)) continue;
      out.push({ key, ...record });
    }
    return out;
  }

  /** Restores the entries a snapshot carried; expired ones are dropped at seed time. */
  seedFromSnapshot(records: readonly PersistedIdempotencyRecord[]): void {
    for (const { key, ...record } of records) {
      if (this.isExpired(record)) continue;
      this.entries.set(key, record);
    }
  }

  /** Test-only: returns the number of cached entries (including expired). */
  size(): number {
    return this.entries.size;
  }

  /** Test-only: drops every cached entry. */
  clear(): void {
    this.entries.clear();
  }

  private isExpired(record: IdempotencyRecord): boolean {
    const nowMs = Date.parse(this.clock.now());
    return nowMs >= record.expiresAtMs;
  }
}
