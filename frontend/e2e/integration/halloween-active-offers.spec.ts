// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Halloween: active campaign offers', () => {
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
