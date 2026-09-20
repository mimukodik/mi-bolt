/**
 * Cart-snapshot predicate for the cart mock layer. Built on the
 * `isRecord` guard from `src/mocks/is-record.ts`, the same shape the
 * four idempotency replay sites in `src/mocks/cart/cart-domain.ts`
 * used to narrow with a bare `as CartSnapshot` cast. The check covers
 * the seven fields a cart wire payload carries and does not walk
 * `items` — the only values that reach this guard were produced by
 * this same mock layer, so the items array is well-formed by
 * construction.
 */

import { isRecord } from '../is-record';
import type { CartSnapshot } from './cart-domain';

/**
 * True when `value` matches the cart wire shape: a record with string
 * `id`, numeric `version`, status in `{'active','ordered'}`, string
 * `sessionId`, array `items`, and ISO string `createdAt`/`expiresAt`.
 * Returns a type guard so callers read `value` as `CartSnapshot`
 * without a cast.
 */
export function isCartSnapshot(value: unknown): value is CartSnapshot {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['version'] === 'number' &&
    (value['status'] === 'active' || value['status'] === 'ordered') &&
    typeof value['sessionId'] === 'string' &&
    Array.isArray(value['items']) &&
    typeof value['createdAt'] === 'string' &&
    typeof value['expiresAt'] === 'string'
  );
}
