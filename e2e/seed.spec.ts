// KONVENCIÓ: page.reload() TILTOTT, helyette MINDIG page.goto(page.url()).
// Indok: Playwright #37012 + MSW location.reload() → reload loop firefox-on.

import { test, expect } from '@playwright/test';

test.describe('Test group', () => {
  test('seed', async ({ page }) => {
    // Seed/setup baseline: navigate to the app root and assert the app served a
    // successful document response (the seed precondition for downstream specs).
    const response = await page.goto('/');
    expect(response?.ok()).toBe(true);
  });
});
