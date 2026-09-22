import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PROXY_TIMEOUT_MS,
  MAX_TIMER_MS,
  parseProxyTimeout,
} from '../../scripts/proxy-timeout.mjs';

describe('parseProxyTimeout', () => {
  it.each([
    [undefined, 30000],
    ['', 30000],
    ['abc', 30000],
    ['0', 30000],
    ['-5', 30000],
    ['1e3', 1000],
    [' 5000 ', 5000],
    ['2147483647', 2147483647],
    ['2147483648', 30000],
    ['99999999999999', 30000],
  ])('%j gives %i', (raw, expected) => {
    expect(parseProxyTimeout(raw)).toBe(expected);
  });

  it('exports the Node timer ceiling and the default', () => {
    expect(MAX_TIMER_MS).toBe(2147483647);
    expect(DEFAULT_PROXY_TIMEOUT_MS).toBe(30000);
  });
});
