/**
 * Canonical opaque idempotency key generator, in the contract range
 * `^[a-zA-Z0-9_-]{8,80}$`. The single declaration for the whole
 * application (`FIX-66`) — every mutating call that needs a fresh
 * key imports this rather than declaring its own copy.
 */
export function freshIdempotencyKey(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
