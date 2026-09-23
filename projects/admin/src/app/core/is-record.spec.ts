/**
 * Spec for `isRecord` (projects/admin/src/app/core/is-record.ts).
 *
 * The guard's truth table is fixed: a plain object returns true, every
 * other shape (null, array, primitive) returns false. Every case
 * below pins one cell of that table with an exact `toBe` assertion;
 * a truthiness check would let `undefined` and `0` slip through as
 * "object-ish".
 */
import { describe, expect, it } from 'vitest';

import { isRecord } from './is-record';

describe('isRecord', () => {
  it('returns true for an empty object', () => {
    expect(isRecord({})).toBe(true);
  });

  it('returns false for an array', () => {
    expect(isRecord([])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isRecord('x')).toBe(false);
  });
});
