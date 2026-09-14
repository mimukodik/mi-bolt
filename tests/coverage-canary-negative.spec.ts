/**
 * Coverage canary RED spec — visits ONLY branch A.
 *
 * Invoked by itself (no companion spec that visits branch B) so the
 * resulting `coverage/coverage-final.json` reports branch B as
 * unvisited. `check-coverage.mjs --unit` must fail with
 * `threshold-not-met` on the branches metric for this run, which
 * proves the gate rejects an unvisited branch.
 *
 * Run with:
 *   npx vitest run tests/coverage-canary-negative.spec.ts --coverage
 */
import { describe, expect, it } from 'vitest';

import { branch, defaultBranch } from '../src/app/coverage-canary/canary';

describe('T02-AC01 RED: coverage canary — only branch A', () => {
  it('returns "A" when flag is true', () => {
    expect(branch(true)).toBe('A');
  });

  it('does not call branch(false)', () => {
    // Deliberately not invoked: the negative suite proves the gate
    // rejects an unvisited branch.
    expect(typeof branch).toBe('function');
    expect(defaultBranch()).toBe('A');
  });
});