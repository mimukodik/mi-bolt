/**
 * T25-AC01 viewport matrix — MiBolt responsive audit.
 *
 * Visits each of the four commerce screen families and the five
 * checkout states across the project's declared viewport range
 * (320 / 390 / 768 / 1024 / 1440 / 1920 CSS px) and asserts the
 * page-level contract:
 *
 *   - no horizontal overflow (`documentElement.scrollWidth <=
 *     window.innerWidth`)
 *   - the primary shopping controls project at >= 44x44 CSS px
 *     (R21, the project's deliberately more comfortable
 *     target)
 *   - one full-element screenshot per viewport / route pair is
 *     captured under `e2e/design/screenshots/<viewport>/<route>.png`
 *     for AC02 visual comparison.
 *
 * The matrix is driven by data so a new viewport, route or CTA
 * can be added by extending the const tables — the test bodies
 * stay identical.
 *
 * The routes are the eight documented entry points across the four
 * families (S1–S4) and the five checkout steps (S4.1–S4.5). The
 * success page is visited with the deterministic `DEMO-000001`
 * identifier because the MSW order handler resolves any valid
 * six-digit suffix.
 */

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCREENSHOT_ROOT = resolve(REPO_ROOT, 'e2e/design/screenshots');

const VIEWPORTS: ReadonlyArray<{
  readonly name: string;
  readonly width: number;
  readonly height: number;
}> = [
  { name: '320', width: 320, height: 720 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
];

const ROUTES: ReadonlyArray<{
  readonly family: 'home' | 'catalog' | 'product' | 'cart' | 'checkout' | 'success';
  readonly id: string;
  readonly path: string;
}> = [
  { family: 'home', id: 'home', path: '/' },
  { family: 'catalog', id: 'telefonok', path: '/telefonok' },
  // The mock catalog exposes `demo-one-5g` as the deterministic
  // fixture product; the success page uses the same fixture's
  // first deterministic order id.
  { family: 'product', id: 'product', path: '/telefonok/demo-one-5g' },
  { family: 'cart', id: 'cart', path: '/penztar/kosar' },
  { family: 'checkout', id: 'contact', path: '/penztar/adatok' },
  { family: 'checkout', id: 'delivery', path: '/penztar/szallitas' },
  { family: 'checkout', id: 'review', path: '/penztar/ellenorzes' },
  { family: 'success', id: 'success', path: '/penztar/siker/DEMO-000001' },
];

// Selectors that identify the primary shopping controls on each
// page. These are the controls the user actually uses to advance
// through the flow — the catalogue trigger, the cart continue
// button, the contact submit, etc. They are documented in the
// `data-testid` attribute on each element (T18/T20/T21).
const PRIMARY_CTA_BY_ROUTE: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['home', ['app-marketing-layout a[href*="telefonok"]']],
  ['telefonok', ['[data-testid="filter-trigger"]']],
  ['product', ['app-product-page button']],
  ['cart', ['[data-testid="cart-continue"]']],
  ['contact', ['app-contact-step button[type="submit"], button:has-text("Tovább")']],
  ['delivery', ['app-delivery-step button[type="submit"], button:has-text("Tovább")']],
  ['review', ['app-review-step button[type="submit"], button:has-text("Megrendelés")']],
  ['success', ['app-success-step a']],
]);

test.describe('T25-AC01 viewport matrix — overflow + 44px CTAs', () => {
  for (const viewport of VIEWPORTS) {
    test.describe(`viewport ${viewport.name}px (${viewport.width}x${viewport.height})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
      });

      for (const route of ROUTES) {
        test(`${route.id} has no horizontal overflow`, async ({ page }, testInfo) => {
          const response = await page.goto(route.path, {
            waitUntil: 'domcontentloaded',
          });
          // The success page only renders for a known demo order id;
          // an unresolved route is documented as a known limitation
          // in design-review.md instead of being a silent pass.
          expect(response, `navigated to ${route.path}`).not.toBeNull();
          expect(response!.status(), `status for ${route.path}`).toBeLessThan(400);

          // AC01: page-level horizontal overflow guard.
          const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            innerWidth: window.innerWidth,
            bodyScrollWidth: document.body.scrollWidth,
          }));
          expect(
            overflow.scrollWidth,
            `${route.path} at ${viewport.name}px: documentElement.scrollWidth=${overflow.scrollWidth}, innerWidth=${overflow.innerWidth}`,
          ).toBeLessThanOrEqual(overflow.innerWidth + 1);

          // Persist one screenshot per viewport / route pair under
          // e2e/design/screenshots/<viewport>/<route>.png (AC02
          // visual evidence — comparison happens in design-review.md,
          // not in the test).
          const screenshotDir = resolve(SCREENSHOT_ROOT, viewport.name);
          mkdirSync(screenshotDir, { recursive: true });
          const screenshotPath = resolve(screenshotDir, `${route.id}.png`);
          mkdirSync(dirname(screenshotPath), { recursive: true });
          await page.screenshot({
            path: screenshotPath,
            fullPage: true,
          });
          testInfo.attachments.push({
            name: `viewport-${viewport.name}-${route.id}`,
            path: screenshotPath,
            contentType: 'image/png',
          });
        });

        test(`${route.id} primary CTAs >= 44x44 CSS px (R21)`, async ({ page }) => {
          await page.goto(route.path, { waitUntil: 'domcontentloaded' });
          const selectors = PRIMARY_CTA_BY_ROUTE.get(route.id) ?? [];
          if (selectors.length === 0) {
            test.skip(true, `no primary CTA defined for route ${route.id}`);
            return;
          }
          for (const selector of selectors) {
            const elements = page.locator(selector);
            const count = await elements.count();
            for (let i = 0; i < count; i++) {
              const box = await elements.nth(i).boundingBox();
              if (!box) continue;
              // R21 deliberately raises the WCAG 2.2 AA 2.5.8
              // baseline (24x24 CSS px) to 44x44 CSS px. We allow
              // a 1px sub-pixel rounding slack.
              expect(
                box.width,
                `${route.id} ${selector}#${i + 1} width ${box.width}`,
              ).toBeGreaterThanOrEqual(44);
              expect(
                box.height,
                `${route.id} ${selector}#${i + 1} height ${box.height}`,
              ).toBeGreaterThanOrEqual(44);
            }
          }
        });
      }
    });
  }
});
