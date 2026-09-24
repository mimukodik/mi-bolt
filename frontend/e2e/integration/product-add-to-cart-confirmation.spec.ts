// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// Below 1024px the desktop CTA block — `add-to-cart-button` and its siblings —
// is `display: none` (product-page.scss:120-124), so the element is present but
// hidden and carries no role to match; on a phone the visible add control is
// the sticky purchase rail's `purchase-cta`. At 1024px and above the desktop
// block is the visible one and the rail is `display: none` (mobile-buy-rail.scss).
// The add CTA is therefore selected by viewport, never as a single test id.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Product: variant choice and add to cart', () => {
  test(
    'adding the selected variant to the cart confirms it and updates the header',
    { tag: '@integration' },
    async ({ page }) => {
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN_WIDTH;
      const addToCartCta = desktopViewport
        ? page.getByTestId('add-to-cart-button').getByRole('button')
        : page.getByTestId('purchase-cta').getByRole('button');

      // Read off the opened product page, never pinned: the cart line has to
      // carry this product's own name, colour and storage.
      let productName = '';
      let colourName = '';
      let storageLabel = '';

      await test.step('1. Navigate to /telefonok. The phone listing page renders a header for the telefonok category and a grid of product cards, each marked with the test id product-card.', async () => {
        await page.goto('/telefonok');
        await expect(page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' })).toBeVisible();
        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();
      });

      await test.step('2. Pick the first product-card that is in stock (no Elfogyott label) and open that card by clicking its product-card-cta.', async () => {
        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();
        const cardCount = await cards.count();
        let pickedIndex = -1;
        for (let i = 0; i < cardCount; i++) {
          const card = cards.nth(i);
          if ((await card.getByTestId('product-card-stock').count()) > 0) continue;
          pickedIndex = i;
          break;
        }
        expect(pickedIndex).toBeGreaterThanOrEqual(0);
        const pickedCard = cards.nth(pickedIndex);
        await pickedCard.getByTestId('product-card-cta').click();
        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(addToCartCta).toBeVisible();
      });

      await test.step('3. If the product page asks for a variant (e.g. storage capacity, colour), pick the first available variant before adding to cart.', async () => {
        const colorGroup = page.getByTestId('variant-color-group');
        if (await colorGroup.isVisible().catch(() => false)) {
          const selectedColor = colorGroup.locator(
            'button[data-testid^="variant-color-"][aria-pressed="true"]',
          );
          if ((await selectedColor.count()) > 0) {
            colourName = ((await selectedColor.getAttribute('aria-label')) ?? '').replace(
              /, kiválasztva$/,
              '',
            );
          }
          const firstColor = colorGroup.locator(
            'button[data-testid^="variant-color-"]:not([disabled])',
          );
          await expect(firstColor.first()).toBeVisible();
        }
        const storageGroup = page.getByTestId('variant-storage-group');
        if (await storageGroup.isVisible().catch(() => false)) {
          const selectedStorage = storageGroup.locator(
            'button[data-testid^="variant-storage-"][aria-pressed="true"]',
          );
          if ((await selectedStorage.count()) > 0) {
            storageLabel = ((await selectedStorage.getAttribute('aria-label')) ?? '').replace(
              /, kiválasztva$/,
              '',
            );
          }
          const firstStorage = storageGroup.locator(
            'button[data-testid^="variant-storage-"]:not([disabled])',
          );
          await expect(firstStorage.first()).toBeVisible();
        }
        productName = ((await page.getByTestId('product-name').textContent()) ?? '').trim();
        expect(productName).not.toBe('');
        await expect(addToCartCta).toBeEnabled();
      });

      await test.step('4. Click add-to-cart-button. The cart updates; the header shows the new item count.', async () => {
        await addToCartCta.click();
        await expect(page.getByTestId('cart-badge')).not.toHaveText('0');
      });

      await test.step('5. Open the cart page (cart icon / cart-continue link from header). The cart page lists the added line.', async () => {
        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);
        await expect(page.getByTestId('cart-continue')).toBeVisible();
      });

      await test.step('6. Verify cart line content: name matches product, variant contains colour and storage, quantity is 1 db, price shows variant price.', async () => {
        const cartLine = page.getByTestId('cart-line').nth(0);
        await expect(cartLine.getByTestId('cart-line-name')).toHaveText(productName);
        // The line's variant text is its first `p.variant` paragraph
        // (cart-line.html): the colour, a "·" separator, then the storage in GB.
        // It has no test id of its own, so it is read as the line renders it.
        const variantLine = cartLine.locator('p.variant').first();
        await expect(variantLine).toBeVisible();
        if (colourName !== '') await expect(variantLine).toContainText(colourName);
        if (storageLabel !== '') await expect(variantLine).toContainText(storageLabel);
        await expect(variantLine).toContainText(/·\s*\d+\s*GB/);
        await expect(cartLine.getByTestId('cart-line-quantity')).toHaveText('1 db');
        await expect(cartLine.getByTestId('price-amount')).toBeVisible();
      });

      await test.step('7. Verify cart count in header reads "Kosárban található termékek (1)" and cart-continue is enabled.', async () => {
        await expect(page.getByTestId('cart-count')).toHaveText('Kosárban található termékek (1)');
        await expect(page.getByTestId('cart-continue').getByRole('button')).toBeEnabled();
      });
    },
  );
});
