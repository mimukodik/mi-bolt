/**
 * Coverage canary unit specs — visit both branches of
 * `branch(flag)` so the unit coverage run hits 100% on the canary
 * file and every other owned runtime source touched by this spec.
 *
 * The companion `coverage-canary-negative.spec.ts` deliberately
 * visits only branch A and is invoked separately by
 * `check-coverage.mjs --unit` to prove the gate fails on an
 * unvisited branch.
 */
import { describe, expect, it } from 'vitest';

import { branch, defaultBranch } from '../src/app/coverage-canary/canary';

describe('T02-AC01: coverage canary — both branches visited', () => {
  it('returns "A" when flag is true', () => {
    expect(branch(true)).toBe('A');
  });

  it('returns "B" when flag is false', () => {
    expect(branch(false)).toBe('B');
  });

  it('defaultBranch returns "A"', () => {
    expect(defaultBranch()).toBe('A');
  });
});