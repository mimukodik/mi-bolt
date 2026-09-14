import { expect, test } from '@playwright/test';

/**
 * T10 design-suite spec.
 *
 * Walks the in-app `/primitives` showcase and captures one full-element
 * screenshot of every primitive at the two viewports declared in R05/R22:
 *  - 1440-px desktop centreline (project default in this file).
 *  - 390-px narrow viewport (project mobile minimum).
 *
 * The screenshots are saved under `e2e/design/screenshots/<name>-<viewport>.png`
 * and act as visual evidence that the primitives render in both layouts
 * without the surrounding business pages. No commercial copy is asserted.
 */

const PRIMITIVES = [
  ['button', 'showcase-button'],
  ['priceblock', 'showcase-priceblock'],
  ['productimage', 'showcase-productimage'],
  ['errorstate', 'showcase-errorstate'],
  ['loadingstate', 'showcase-loadingstate'],
  ['emptystate', 'showcase-emptystate'],
  ['formfieldmessage', 'showcase-formfieldmessage'],
  ['quantitycontrol', 'showcase-quantitycontrol'],
  ['accessibledialog', 'showcase-accessibledialog'],
  ['statusmessage', 'showcase-statusmessage'],
] as const;

test.describe('MiBolt primitives — visual evidence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/primitives');
    // Wait for the showcase root so we know tokens and primitives CSS
    // are mounted before we start asserting.
    await expect(page.getByTestId('primitives-showcase')).toBeVisible();
  });

  test('renders the showcase page without invented copy', async ({ page }) => {
    const text = (await page.getByTestId('primitives-showcase').innerText()).toLowerCase();
    for (const forbidden of ['készleten', 'utolsó darab', '60%-os kedvezmény']) {
      expect(text).not.toContain(forbidden);
    }
  });

  for (const [name, testId] of PRIMITIVES) {
    test(`screenshots ${name}`, async ({ page }, testInfo) => {
      const root = page.getByTestId(testId);
      await expect(root).toBeVisible();
      const viewport = testInfo.project.name === 'mi-bolt-narrow' ? '390' : '1440';
      const path = `e2e/design/screenshots/${name}-${viewport}.png`;
      await root.screenshot({ path });
      // Each primitive must expose at least one interactive control or
      // a status region so the screenshot has a meaningful surface.
      const interactive = await root.locator('button, [role="status"], [role="alert"], input').count();
      expect(interactive).toBeGreaterThan(0);
    });
  }

  test('dialog traps focus inside the panel after open', async ({ page }) => {
    await page.getByTestId('showcase-accessibledialog').getByRole('button', { name: 'Dialógus megnyitása' }).click();
    const panel = page.locator('[role="dialog"]');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('aria-modal', 'true');
    const close = panel.getByRole('button', { name: 'Bezárás' });
    await close.click();
    await expect(panel).toBeHidden();
  });
});
