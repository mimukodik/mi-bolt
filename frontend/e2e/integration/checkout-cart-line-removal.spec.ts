// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: from the cart to the receipt', () => {
  test('removing the cart line empties the cart', { tag: '@integration' }, async ({ page }) => {
    // The purchase control is laid out differently at the two integration
    // viewports: below 1024px the desktop CTA column is `display: none`
    // (product-page.scss:120-124) and the sticky `purchase-rail` carries the
    // same "Kosárba teszem" press as its `purchase-cta`
    // (mobile-buy-rail.scss:13-39). Both mounts stay in the DOM at either
    // width, so the viewport decides which one the test drives.
    const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
    const addToCartButton = narrowViewport
      ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
      : page.getByTestId('add-to-cart-button').getByRole('button');
    const cartLine = page.getByTestId('cart-line');
    const cartBadge = page.getByTestId('cart-badge');
    const emptyState = page.getByTestId('empty-state');

    // 1. Open `/telefonok`, wait for the grid, open the first in-stock card
    // (the first `product-card` without a `product-card-stock` marker) and add
    // it with the inner button of `add-to-cart-button`, then open the cart
    // with the header's `cart-link`.
    await test.step("Open `/telefonok`, wait for the grid, open the first in-stock card and add it with the inner button of `add-to-cart-button`, then open the cart with the header's `cart-link`.", async () => {
      await page.goto('/telefonok');
      const cards = page.getByTestId('product-card');
      await expect(cards.first()).toBeVisible();
      const inStockCard = cards.filter({ hasNot: page.getByTestId('product-card-stock') }).first();
      await inStockCard.getByTestId('product-card-cta').click();

      await expect(page.getByTestId('product-page')).toBeVisible();
      await addToCartButton.click();
      // The add is a request of its own; the header badge reaching 1 is what
      // says it has landed before the cart is opened.
      await expect(cartBadge).toHaveText('1');

      await page.getByTestId('cart-link').click();
      await expect(page.getByTestId('cart-page')).toBeVisible();
      await expect(cartLine).toHaveCount(1);
      await expect(cartLine.getByTestId('cart-line-remove')).toBeVisible();
      await expect(cartLine.getByTestId('cart-line-remove')).toHaveText('Törlöm');
      await expect(page.getByTestId('cart-clear')).toBeVisible();
      await expect(page.getByTestId('cart-clear')).toHaveText('Kosár ürítése');
    });

    // 2. Press `cart-line-remove`.
    await test.step('Press `cart-line-remove`.', async () => {
      await cartLine.getByTestId('cart-line-remove').click();

      await expect(cartLine).toHaveCount(0);
      await expect(emptyState).toBeVisible();
      const emptyTitle = emptyState.getByRole('heading', { name: 'A kosarad még üres.' });
      await expect(emptyTitle).toBeVisible();
      await expect(
        emptyState.getByText('Nézd meg a demókészülékeket, és válaszd ki a kedvenced.'),
      ).toBeVisible();
      await expect(emptyState.getByRole('button', { name: 'Telefonokat nézek' })).toBeVisible();
      await expect(page.getByTestId('cart-count')).toHaveCount(0);
      await expect(page.getByTestId('cart-continue')).toHaveCount(0);
      await expect(page.getByTestId('order-summary')).toHaveCount(0);
    });

    // 3. Press the empty state's "Telefonokat nézek" action.
    await test.step('Press the empty state\'s "Telefonokat nézek" action.', async () => {
      await emptyState.getByRole('button', { name: 'Telefonokat nézek' }).click();

      await expect(page).toHaveURL(/\/telefonok$/);
      await expect(page.getByTestId('product-card').first()).toBeVisible();
      // `cart-badge` is read here rather than on the cart page: `/penztar/*`
      // runs under the checkout layout, whose header renders no badge at all
      // (header-nav.html:1-32 carries "Vissza a shopba" instead), so the
      // badge the removed line leaves at "0" is the shop header's, and that
      // header returns with the catalogue.
      await expect(cartBadge).toHaveText('0');
    });
  });
});
