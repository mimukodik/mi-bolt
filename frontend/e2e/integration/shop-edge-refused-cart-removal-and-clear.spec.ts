// spec: specs/shop-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The add control is laid out differently at the two integration viewports:
// below 1024px the desktop CTA block is `display: none` (the `.cta-desktop`
// rule in the product page stylesheet) and the sticky `purchase-rail` carries
// the same "Kosárba teszem" press as its `purchase-cta`. Both mounts stay in
// the DOM at either width, so the viewport decides which one the test drives.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Shop: edge paths', () => {
  test(
    'a refused cart removal and a refused clear leave the cart as it was',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      // The add confirmation is mounted twice — by the page's own status
      // message on the wide layout and by the rail's copy on the narrow one —
      // and the hidden mount carries the same text, so the assertion targets
      // whichever one the viewport shows.
      const addConfirmation = page.getByTestId('status-message').filter({ visible: true });
      const cartLine = page.getByTestId('cart-line');
      const cartCount = page.getByTestId('cart-count');
      const cartBadge = page.getByTestId('cart-badge');
      const cartStatus = page.getByTestId('cart-page').getByTestId('status-message');

      // The product is never named: the scenario picks its card by what the
      // screen shows, and the expected values are read off the page.
      let productName = '';
      let variantLabel = '';

      // 1. Open `/telefonok?mi-scenario=cart-mutation-fails` and wait for the grid.
      await test.step('Open `/telefonok?mi-scenario=cart-mutation-fails` and wait for the grid.', async () => {
        await page.goto('/telefonok?mi-scenario=cart-mutation-fails');
        await expect(page.getByTestId('result-count')).toHaveText(
          '55 találat a szűrt feltételek szerint',
        );
        await expect(page.getByTestId('product-card').first()).toBeVisible();
        // The mock keys its snapshot by the scenario name and this scenario's
        // cart was never filled, so a fresh context holds none.
        await expect(cartBadge).toHaveText('0');
      });

      // 2. Open the first `product-card` that has no `product-card-stock`
      // marker through its `product-card-cta`, then press the add control.
      await test.step('Open the first `product-card` that has no `product-card-stock` marker through its `product-card-cta`, then press the add control ("Kosárba teszem").', async () => {
        const cards = page.getByTestId('product-card');
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');

        // The name, colour and storage are read off the opened page so the
        // confirmation can be checked without naming a product or a slug.
        productName = ((await page.getByTestId('product-name').textContent()) ?? '').trim();
        const colourGroup = page.getByTestId('variant-color-group');
        const storageGroup = page.getByTestId('variant-storage-group');
        const colourText = (await colourGroup.locator('legend strong').textContent()) ?? '';
        const storageText = (await storageGroup.locator('legend strong').textContent()) ?? '';
        variantLabel = `${colourText.trim()}, ${storageText.trim()}`;

        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();
        // The scenario intercepts only the cart's two DELETE routes, so an
        // addition still succeeds and still confirms.
        await expect(addConfirmation).toContainText(
          `${productName}, ${variantLabel} – 1 darab a kosárban.`,
        );
        await expect(cartBadge).toHaveText('1');
      });

      // 3. Open the cart with the header's `cart-link`.
      await test.step("Open the cart with the header's `cart-link`.", async () => {
        await page.getByTestId('cart-link').click();

        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('checkout-header')).toBeVisible();
        // The checkout layout's header carries no cart-badge of its own.
        await expect(cartBadge).toHaveCount(0);
        const cartHeading = page.getByTestId('cart-page').getByRole('heading', { level: 1 });
        await expect(cartHeading).toHaveText('A kosarad');
        await expect(cartLine).toHaveCount(1);
        await expect(cartCount).toHaveText('Kosárban található termékek (1)');
        await expect(page.getByTestId('cart-continue').getByRole('button')).toBeEnabled();
      });

      // 4. Press the line's `cart-line-remove` ("Törlöm").
      await test.step('Press the line\'s `cart-line-remove` ("Törlöm").', async () => {
        await cartLine.getByTestId('cart-line-remove').click();

        await expect(cartStatus).toContainText(
          'A kosár módosítása nem sikerült; a kosár változatlan.',
        );
        await expect(cartLine).toHaveCount(1);
        await expect(cartCount).toHaveText('Kosárban található termékek (1)');
        await expect(page.getByTestId('cart-continue').getByRole('button')).toBeEnabled();
        await expect(cartLine.getByTestId('cart-line-remove')).toBeEnabled();
        // The failed mutation is the page's persistent error, not a
        // dismissible notice, so it carries no "Bezárás" control.
        await expect(cartStatus.getByRole('button', { name: 'Bezárás' })).toHaveCount(0);
      });

      // 5. Press `cart-clear` ("Kosár ürítése").
      await test.step('Press `cart-clear` ("Kosár ürítése").', async () => {
        await page.getByTestId('cart-clear').getByRole('button').click();

        await expect(cartStatus).toContainText(
          'A kosár módosítása nem sikerült; a kosár változatlan.',
        );
        await expect(cartLine).toHaveCount(1);
        await expect(cartCount).toHaveText('Kosárban található termékek (1)');
        await expect(page.getByTestId('empty-state')).toHaveCount(0);
      });

      // 6. Recover through the way out the failure did not block.
      await test.step('Recover through the way out the failure did not block: press "Vásárlás folytatása".', async () => {
        await page.getByRole('button', { name: 'Vásárlás folytatása' }).click();

        await expect(page).toHaveURL(/\/telefonok$/);
        const catalogueHeading = page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' });
        await expect(catalogueHeading).toBeVisible();
        await expect(page.getByTestId('product-card').first()).toBeVisible();
        // The two refused mutations left the cart exactly as it was.
        await expect(cartBadge).toHaveText('1');
      });

      // 7. Add the same variant again from the first card without a
      // `product-card-stock` marker, then open the cart with `cart-link`.
      await test.step('Add the same variant again from the first card without a `product-card-stock` marker, then open the cart with `cart-link`.', async () => {
        const cards = page.getByTestId('product-card');
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
        await addToCartButton.click();
        await expect(addConfirmation).toContainText(
          `${productName}, ${variantLabel} – 2 darab a kosárban.`,
        );
        await expect(cartBadge).toHaveText('2');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        // The mutations this scenario refuses are the only ones that fail.
        await expect(cartLine).toHaveCount(1);
        await expect(cartLine.getByTestId('cart-line-quantity')).toHaveText('2 db');
      });
    },
  );
});
