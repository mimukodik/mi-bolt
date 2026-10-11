import { describe, expect, it } from 'vitest';
import { toUtcInput, utcTimestampKey } from './utc-timestamp';

describe('UTC promotion timestamps', () => {
  it('preserves nanoseconds when converting an offset', () => {
    expect(toUtcInput('2026-10-30T01:00:00.123456789+01:00')).toBe('2026-10-30T00:00:00.123456789');
    const start = utcTimestampKey('2026-10-30T00:00:00.123456789');
    const end = utcTimestampKey('2026-10-30T00:00:00.123456790');
    if (start === null || end === null) throw new Error('valid instant rejected');
    expect(start < end).toBe(true);
  });
  it('rejects invalid calendar days and incomplete input', () => {
    for (const input of ['2026-02-30T00:00:00', '10', '2026-10-30T00:00:00.1234567890'])
      expect(utcTimestampKey(input)).toBeNull();
  });
});
