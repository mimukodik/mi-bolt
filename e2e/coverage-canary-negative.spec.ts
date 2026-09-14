/**
 * E2E coverage canary — RED suite that visits only one branch.
 *
 * The companion `coverage-canary.spec.ts` visits both branches and
 * produces a `coverage-final.json` whose `canary-page.ts` is at 100%.
 * Running this RED spec on its own leaves branch B unvisited and
 * forces the E2E gate (`check-coverage.mjs --e2e`) to fail with
 * `threshold-not-met` on the branches metric.
 */
import { expect } from '@playwright/test';

import { test } from './fixtures/test';

test.describe('T02-AC01 RED E2E coverage canary — only branch A', () => {
  test('visits /canary?branch=true only', async ({ page, coverage }) => {
    await page.goto('/canary?branch=true');
    await expect(page.getByTestId('canary-branch')).toHaveText('A');

    const segments = await coverage.read();
    expect(segments.length).toBeGreaterThan(0);
    // Deliberately not navigating to branch B here.
  });
});