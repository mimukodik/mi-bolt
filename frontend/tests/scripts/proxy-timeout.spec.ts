import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PROXY_TIMEOUT_MS,
  MAX_TIMER_MS,
  parseProxyTimeout,
} from '../../scripts/proxy-timeout.mjs';

describe('parseProxyTimeout', () => {
  it.each([
    [undefined, DEFAULT_PROXY_TIMEOUT_MS],
    ['', DEFAULT_PROXY_TIMEOUT_MS],
    ['abc', DEFAULT_PROXY_TIMEOUT_MS],
    ['0', DEFAULT_PROXY_TIMEOUT_MS],
    ['-5', DEFAULT_PROXY_TIMEOUT_MS],
    ['1e3', 1000],
    [' 5000 ', 5000],
    [String(MAX_TIMER_MS), MAX_TIMER_MS],
    [String(MAX_TIMER_MS + 1), DEFAULT_PROXY_TIMEOUT_MS],
    ['99999999999999', DEFAULT_PROXY_TIMEOUT_MS],
    ['Infinity', DEFAULT_PROXY_TIMEOUT_MS],
    ['NaN', DEFAULT_PROXY_TIMEOUT_MS],
    ['null', DEFAULT_PROXY_TIMEOUT_MS],
  ])('%j gives %i', (raw, expected) => {
    expect(parseProxyTimeout(raw)).toBe(expected);
  });

  it('exports the Node timer ceiling and the default', () => {
    expect(MAX_TIMER_MS).toBe(2147483647);
    expect(DEFAULT_PROXY_TIMEOUT_MS).toBe(30000);
  });
});
