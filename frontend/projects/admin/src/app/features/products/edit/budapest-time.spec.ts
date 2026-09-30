import { describe, expect, it } from 'vitest';
import { budapestInstant, budapestLocal } from './budapest-time';

describe('Budapest campaign time', () => {
  it('uses Hungarian midnight, not the browser time zone', () => {
    expect(budapestInstant('2026-11-01T00:00')).toBe('2026-10-31T23:00:00.000Z');
    expect(budapestInstant('2026-10-01T00:00')).toBe('2026-09-30T22:00:00.000Z');
  });
  it('rejects DST gaps and ambiguous folds', () => {
    expect(budapestInstant('2026-03-29T02:30')).toBeNull();
    expect(budapestInstant('2026-10-25T02:30')).toBeNull();
  });
  it('round-trips valid times and rejects malformed dates', () => {
    expect(budapestLocal('2026-10-31T23:00:00Z')).toBe('2026-11-01T00:00');
    expect(budapestInstant('2026-02-30T00:00')).toBeNull();
    expect(budapestInstant('bad')).toBeNull();
    expect(budapestLocal('bad')).toBe('');
  });
});
