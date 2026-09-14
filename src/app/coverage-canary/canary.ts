/**
 * Coverage canary for T02 — 100% coverage and network-isolation proof.
 *
 * The `branch(flag)` function has two distinct return paths so a unit
 * test that visits only one return path must fail the
 * `check-coverage.mjs` gate on the branches metric. The companion
 * Angular component `CoverageCanary` wraps the function for the E2E
 * suite and is lazy-loaded behind `/canary?branch=true|false`.
 */
export type Branch = 'A' | 'B';

export function branch(flag: boolean): Branch {
  if (flag) {
    return 'A';
  } else {
    return 'B';
  }
}

/**
 * Default branch used by callers that do not pass an explicit flag. The
 * helper exists so the standalone component template can render a
 * stable label without rebuilding the conditional tree.
 */
export function defaultBranch(): Branch {
  return 'A';
}