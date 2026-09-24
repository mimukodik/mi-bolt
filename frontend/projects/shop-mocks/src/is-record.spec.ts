/**
 * Spec for the `isRecord` type guard (`projects/shop-mocks/src/is-record.ts`).
 *
 * Each case asserts the exact boolean the guard must return for the
 * canonical "is this an indexable plain object?" question the nine
 * call sites under `projects/shop-mocks/src/` need answered. Truthiness checks would
 * not settle a boolean, so every assertion is `expect(...).toBe(...)`.
 */
import { describe, expect, it } from 'vitest';

import { isRecord } from './is-record';

describe('isRecord', () => {
  it('returns true for an empty object', () => {
    expect(isRecord({})).toBe(true);
  });

  it('returns true for a populated object', () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it('returns false for an empty array', () => {
    expect(isRecord([])).toBe(false);
  });

  it('returns false for a populated array', () => {
    expect(isRecord([1, 2])).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isRecord('x')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isRecord(42)).toBe(false);
  });
});
