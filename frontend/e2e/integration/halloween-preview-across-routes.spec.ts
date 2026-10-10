// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Halloween: design preview across routes', () => {
  test(
    'the preview survives navigation and reopening and can be dismissed',
    { tag: '@integration' },
    async ({ page }) => {
      // Document boots and in-app clicks exercise both persistence and routing.
      test.setTimeout(60_000);
      const shell = page.locator('app-app-shell');
      const close = page.getByRole('button', { name: 'Előnézet bezárása' });
      await test.step('1. Opt into the design preview on the real home page.', async () => {
        await page.goto('/');
        await expect(page.getByTestId('hero-heading')).toBeVisible();
        await page.goto('/primitives/halloween');
        await expect(page).toHaveURL(/\/$/);
        await expect(close).toBeVisible();
        await expect(shell).toHaveClass(/halloween/);
        await expect(page.getByTestId('hero-heading')).toBeVisible();
      });
      await test.step('2. Navigate through catalogue, product and cart with the same preview.', async () => {
        await page.getByTestId('main-header').getByRole('link', { name: 'Mobiltelefonok' }).click();
        await expect(
          page.getByRole('heading', { name: 'Mobiltelefonok', exact: true }),
        ).toBeVisible();
        await expect(close).toBeVisible();
        await expect(shell).toHaveClass(/halloween/);
        await page.getByTestId('product-card').first().getByTestId('product-card-cta').click();
        await expect(page.getByTestId('product-name')).toBeVisible();
        await expect(close).toBeVisible();
        await expect(shell).toHaveClass(/halloween/);
        await page.goto('/penztar/kosar');
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(close).toBeVisible();
        await expect(shell).toHaveClass(/halloween/);
      });
      await test.step('3. Reopen the cart, dismiss the preview and retain dismissal.', async () => {
        await page.goto(page.url());
        await expect(close).toBeVisible();
        await close.click();
        await expect(close).toBeHidden();
        await expect(shell).not.toHaveClass(/halloween/);
        await page.goto('/telefonok');
        await expect(page.getByTestId('product-card').first()).toBeVisible();
        await expect(close).toBeHidden();
        await expect(shell).not.toHaveClass(/halloween/);
      });
    },
  );

  test(
    'the promotion banner keeps active offers on reload and its filter can be removed',
    { tag: '@integration' },
    async ({ page }) => {
      test.setTimeout(60_000);
      const banner = page.getByRole('link', {
        name: 'Válassz ijesztően jó halloweeni ajánlataink közül!',
      });
      const cards = page.getByTestId('catalog-grid').getByTestId('product-card');
      await test.step('1. Open an active campaign and follow its banner.', async () => {
        await page.goto('/?mi-scenario=halloween');
        await expect(banner).toBeVisible();
        await banner.click();
        await expect(page).toHaveURL(/activePromotion=true/);
        await expect(cards.first()).toBeVisible();
        await expect(cards.first()).toHaveClass(/card--promotion/);
        await expect(cards.first().getByTestId('reference-price')).toBeVisible();
      });
      await test.step('2. Reload the URL and retain the active-offer filter.', async () => {
        await page.goto(page.url());
        await expect(page).toHaveURL(/activePromotion=true/);
        await expect(cards.first()).toBeVisible();
        await expect(cards.first()).toHaveClass(/card--promotion/);
        await expect(cards.first().getByTestId('reference-price')).toBeVisible();
      });
      await test.step('3. Remove the chip and return to the unfiltered catalogue.', async () => {
        await page
          .getByRole('button', { name: 'Szűrő eltávolítása: Aktív halloweeni ajánlatok' })
          .click();
        await expect(page).not.toHaveURL(/activePromotion=true/);
        await expect(page.getByTestId('applied-filters')).toBeHidden();
        await expect(cards.first()).toBeVisible();
      });
    },
  );
});
