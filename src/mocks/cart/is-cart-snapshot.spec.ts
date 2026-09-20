/**
 * Spec for the `isCartSnapshot` type guard
 * (`src/mocks/cart/is-cart-snapshot.ts`).
 *
 * Each case asserts the exact boolean the guard must return for the
 * shape `src/mocks/cart/cart-domain.ts` depends on after idempotency
 * replay. Truthiness checks would not settle a boolean, so every
 * assertion is `expect(...).toBe(...)`. Cases that exercise one
 * field start from the valid cart built here and override (or, for
 * the missing-id case, rest-destructure out) one field; the two
 * primitive inputs (`null`, a bare string) cover the type-guard's
 * entry point and have no field to derive from.
 */
import { describe, expect, it } from 'vitest';

import type { CartSnapshot } from './cart-domain';
import { isCartSnapshot } from './is-cart-snapshot';

const validCart: CartSnapshot = {
  id: 'cart-1',
  version: 1,
  status: 'active',
  sessionId: 'session-12345678',
  items: [],
  createdAt: '2026-09-20T10:00:00.000Z',
  expiresAt: '2026-09-21T10:00:00.000Z',
};

describe('isCartSnapshot', () => {
  it('returns true for a complete valid cart object', () => {
    expect(isCartSnapshot(validCart)).toBe(true);
  });

  it('returns false when id is missing', () => {
    const { id: _id, ...withoutId } = validCart;
    expect(isCartSnapshot(withoutId)).toBe(false);
  });

  it('returns false when version is a string', () => {
    expect(isCartSnapshot({ ...validCart, version: '1' })).toBe(false);
  });

  it('returns false when status is not active or ordered', () => {
    expect(isCartSnapshot({ ...validCart, status: 'pending' })).toBe(false);
  });

  it('returns false when items is an object instead of an array', () => {
    expect(isCartSnapshot({ ...validCart, items: {} })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isCartSnapshot(null)).toBe(false);
  });

  it('returns false for the string "cart"', () => {
    expect(isCartSnapshot('cart')).toBe(false);
  });
});
