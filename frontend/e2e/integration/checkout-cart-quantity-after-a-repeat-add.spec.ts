// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: from the cart to the receipt', () => {
  test(
    "a second add of the same variant raises the cart line's quantity",
    { tag: '@integration' },
    async ({ page }) => {
      // The purchase control is laid out differently at the two integration
      // viewports: below 1024px the desktop CTA column is `display: none` (the
      // `.cta-desktop` rule in the product page stylesheet) and the sticky
      // `purchase-rail` carries the same "Kosárba teszem" press as its
      // `purchase-cta` (the mobile buy rail's `@media (max-width: 1023px)`
      // block). Both mounts stay in the DOM at either width, so the viewport
      // decides which one the test drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      // The add confirmation is mounted twice — by the page's own status
      // message on the wide layout and by the rail's copy on the narrow one —
      // and the hidden mount carries the same text, so the assertion targets
      // whichever one the viewport shows.
      const confirmation = page.getByTestId('status-message').filter({ visible: true });
      const cartLine = page.getByTestId('cart-line');

      // The product is never named here: the scenario picks its card by what
      // the screen shows, and every expected value is read off the page.
      let productName = '';
      let variantLabel = '';
      let devicePriceText = '';

      // 1. Open `/telefonok`, wait for the grid, and open the first in-stock
      // card (the first `product-card` without a `product-card-stock` marker)
      // through its `product-card-cta`. Note the "Készülékár" amount.
      await test.step('Open `/telefonok`, wait for the grid, and open the first in-stock card (the first `product-card` without a `product-card-stock` marker) through its `product-card-cta`. Note the "Készülékár" amount.', async () => {
        await page.goto('/telefonok');
        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
        await expect(addToCartButton).toBeEnabled();
        await expect(page.getByTestId('cart-badge')).toHaveText('0');

        productName = ((await page.getByTestId('product-name').textContent()) ?? '').trim();
        const colourLabel = page.getByTestId('variant-color-group').locator('legend strong');
        const storageLabel = page.getByTestId('variant-storage-group').locator('legend strong');
        const colour = ((await colourLabel.textContent()) ?? '').trim();
        const storage = ((await storageLabel.textContent()) ?? '').trim();
        variantLabel = `${colour}, ${storage}`;
        const devicePrice = page
          .getByTestId('product-page')
          .getByRole('region', { name: 'Árak' })
          .getByTestId('price-amount');
        devicePriceText = ((await devicePrice.textContent()) ?? '').trim();
      });

      // 2. Press the inner button of `add-to-cart-button` once.
      await test.step('Press the inner button of `add-to-cart-button` once.', async () => {
        await addToCartButton.click();
        await expect(confirmation).toContainText(
          `${productName}, ${variantLabel} – 1 darab a kosárban.`,
        );
        await expect(page.getByTestId('cart-badge')).toHaveText('1');
      });

      // 3. Press the same button a second time, without changing the selected
      // colour or storage.
      await test.step('Press the same button a second time, without changing the selected colour or storage.', async () => {
        await addToCartButton.click();
        await expect(confirmation).toContainText(
          `${productName}, ${variantLabel} – 2 darab a kosárban.`,
        );
        await expect(page.getByTestId('cart-badge')).toHaveText('2');
      });

      // 4. Open the cart with the header's `cart-link`.
      await test.step("Open the cart with the header's `cart-link`.", async () => {
        await page.getByTestId('cart-link').click();

        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(cartLine).toHaveCount(1);
        await expect(cartLine.getByTestId('cart-line-quantity')).toHaveText('2 db');
        await expect(page.getByTestId('cart-count')).toHaveText('Kosárban található termékek (1)');
        await expect(cartLine.getByText('Részösszeg')).toBeVisible();

        const unitPrice = Number(devicePriceText.replace(/\D/g, ''));
        const lineSubtotalText = (await cartLine.getByTestId('price-amount').textContent()) ?? '';
        expect(Number(lineSubtotalText.replace(/\D/g, ''))).toBe(unitPrice * 2);
      });

      // 5. Read the line card's controls.
      await test.step("Read the line card's controls.", async () => {
        await expect(cartLine.getByTestId('cart-line-name')).toHaveText(productName);
        await expect(cartLine.getByTestId('cart-line-quantity')).toHaveText('2 db');
        await expect(cartLine.getByTestId('cart-line-remove')).toHaveText('Törlöm');
        await expect(cartLine.getByTestId('cart-line-remove')).toHaveAccessibleName(
          `Törlöm: ${productName}`,
        );
        await expect(cartLine.getByText('Részösszeg')).toBeVisible();
        // The line shows the quantity as read-only text (like yettel.hu): no
        // number input and no stepper is rendered inside it.
        await expect(cartLine.locator('input, select, [role="spinbutton"]')).toHaveCount(0);
      });
    },
  );
});
