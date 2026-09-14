/**
 * Coverage canary — unimported runtime source.
 *
 * This file lives inside `src/app/coverage-canary/` and is owned by
 * T02. It is deliberately not referenced by any spec, component or
 * bootstrap so the runtime manifest contains it but the unit/E2E
 * coverage reports have zero execution for it. The
 * `check-coverage.mjs` gate must fail with `unvisited-owned-file`
 * whenever this file is in the denominator.
 */
export const UNUSED_CONSTANT = 'never-imported';

export function unusedHelper(input: string): string {
  if (input.length === 0) {
    return 'empty';
  }
  if (input.length < 4) {
    return 'short';
  }
  return 'long';
}

export class UnusedGreeter {
  greet(name: string): string {
    return `hello ${name}`;
  }
}