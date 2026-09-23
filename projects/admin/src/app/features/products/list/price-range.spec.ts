/**
 * Spec for the Ár column formatter (MIM-351, F16a): `formatHuf` groups a
 * whole forint amount by thousands with a no-break space, and
 * `formatPriceRange` joins the min/max `Money` into the plan's
 * "599 990–717 990 Ft" shape, collapsing to one amount when both ends
 * are equal. Both separators are built from `String.fromCharCode` here
 * too, so the expectation never depends on how the editor renders a
 * pasted non-break space or en dash.
 */
import { describe, expect, it } from 'vitest';

import type { Money } from '../../../api/generated/models/money';

import { formatHuf, formatPriceRange } from './price-range';

const NBSP = String.fromCharCode(0xa0);
const DASH = String.fromCharCode(0x2013);

function huf(amount: number): Money {
  return { amount, currency: 'HUF' };
}

describe('formatHuf', () => {
  it('groups a six-digit amount by thousands with a no-break space', () => {
    // Fails if the thousands separator regex or the NBSP constant drifts.
    expect(formatHuf(599990)).toBe(`599${NBSP}990`);
  });

  it('groups a seven-digit amount at both thousand boundaries', () => {
    // Fails if the regex only inserts one separator instead of every boundary.
    expect(formatHuf(1000000)).toBe(`1${NBSP}000${NBSP}000`);
  });

  it('leaves a three-digit amount with no separator', () => {
    // Fails if the regex inserts a separator before the first digit.
    expect(formatHuf(990)).toBe('990');
  });

  it('renders zero unchanged', () => {
    // Fails if the regex mishandles the single-digit case.
    expect(formatHuf(0)).toBe('0');
  });
});

describe('formatPriceRange', () => {
  it('joins two different ends with an en dash and a single trailing Ft', () => {
    // Fails if the dash/NBSP constants drift or if both ends get their own "Ft".
    expect(formatPriceRange(huf(599990), huf(717990))).toBe(
      `599${NBSP}990${DASH}717${NBSP}990${NBSP}Ft`,
    );
  });

  it('collapses to a single amount when both ends are equal', () => {
    // Fails if the equal-ends branch is dropped and a dash is always emitted.
    expect(formatPriceRange(huf(149990), huf(149990))).toBe(`149${NBSP}990${NBSP}Ft`);
  });
});
