// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: from the cart to the receipt', () => {
  test(
    'the empty cart offers its way back to the catalogue',
    { tag: '@integration' },
    async ({ page }) => {
      const cartPage = page.getByTestId('cart-page');
      const emptyState = page.getByTestId('empty-state');
      const cartLine = page.getByTestId('cart-line');
      const catalogHeading = page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' });
      const productCard = page.getByTestId('product-card');
      const reasonBanner = page.getByTestId('navigation-reason');

      // 1. Open `/penztar/kosar` in the fresh context (the mock keeps the cart
      // in this context's `sessionStorage`, so it starts with no lines).
      await test.step("Open `/penztar/kosar` in the fresh context (the mock keeps the cart in this context's `sessionStorage`, so it starts with no lines).", async () => {
        await page.goto('/penztar/kosar');

        await expect(cartPage).toBeVisible();
        const emptyTitle = emptyState.getByRole('heading', { name: 'A kosarad még üres.' });
        await expect(emptyTitle).toBeVisible();
        await expect(
          emptyState.getByText('Nézd meg a demókészülékeket, és válaszd ki a kedvenced.'),
        ).toBeVisible();
        await expect(emptyState.getByRole('button', { name: 'Telefonokat nézek' })).toBeVisible();
        await expect(cartLine).toHaveCount(0);
        // `cart-badge` is the shop layout's header widget; `/penztar/*` runs
        // under the checkout layout, whose header renders no badge at all (it
        // carries "Vissza a shopba" instead), so the badge the empty cart
        // leaves at "0" is read on the catalogue once step 2 returns to the
        // shop layout.
      });

      // 2. Press "Telefonokat nézek".
      await test.step('Press "Telefonokat nézek".', async () => {
        await emptyState.getByRole('button', { name: 'Telefonokat nézek' }).click();

        await expect(catalogHeading).toBeVisible();
        await expect(productCard.first()).toBeVisible();
        await expect(page.getByTestId('cart-badge')).toHaveText('0');
      });

      // 3. Deep-link the first checkout step with the cart still empty: open
      // `/penztar/adatok`.
      await test.step('Deep-link the first checkout step with the cart still empty: open `/penztar/adatok`.', async () => {
        await page.goto('/penztar/adatok');

        await expect(page).toHaveURL(/\/penztar\/kosar\?navigationReason=empty-cart$/);
        await expect(reasonBanner).toBeVisible();
        await expect(reasonBanner).toContainText('A kosarad üres, ezért ide irányítottunk.');
        await expect(page.getByTestId('contact-page')).toHaveCount(0);
      });

      // 4. Deep-link the last step as well: open `/penztar/ellenorzes`.
      await test.step('Deep-link the last step as well: open `/penztar/ellenorzes`.', async () => {
        await page.goto('/penztar/ellenorzes');

        await expect(page).toHaveURL(/\/penztar\/kosar\?navigationReason=empty-cart$/);
        await expect(reasonBanner).toBeVisible();
        await expect(reasonBanner).toContainText('A kosarad üres, ezért ide irányítottunk.');
        await expect(page.getByTestId('review-page')).toHaveCount(0);
      });
    },
  );
});
