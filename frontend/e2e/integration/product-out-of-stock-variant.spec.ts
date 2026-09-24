// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// Below 1024px the desktop CTA block — the `add-to-cart-button` and the reason
// hint beside it — is `display: none` (product-page.scss:120-124); the sticky
// `purchase-rail` carries the visible `purchase-cta` there and the visible
// reason is the `product-stock` status line. The reason hint is therefore
// asserted only at the desktop mount.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Product: variant choice and add to cart', { tag: '@integration' }, () => {
  test('an out-of-stock variant cannot be added to the cart', async ({ page }) => {
    const desktopViewport = (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN_WIDTH;
    // The visible CTA is the in-flow `add-to-cart-button` at the desktop mount
    // and the sticky rail's `purchase-cta` at the mobile one; the other mount is
    // `display: none`, so its button carries no role to match at all.
    const addToCartCta = desktopViewport
      ? page.getByTestId('add-to-cart-button').getByRole('button')
      : page.getByTestId('purchase-cta').getByRole('button');

    await test.step('Open `/telefonok`, wait for the grid, and page forward until a card carries the `product-card-stock` marker', async () => {
      await page.goto('/telefonok');
      await expect(page.locator('[data-testid="product-card"]')).not.toHaveCount(0);

      // The default (recommended) order places the out-of-stock entries on
      // later pages, so the grid is paged forward until one of them appears.
      // Each click is confirmed by the pager's own page counter and by the
      // first card's name changing, so the marker is never read while the
      // previous page's cards are still on screen.
      const cards = page.locator('[data-testid="product-card"]');
      const outOfStockCards = cards.filter({ has: page.getByTestId('product-card-stock') });
      const next = page.getByTestId('pagination-next');
      const current = page.getByTestId('pagination-current');

      let pageNumber = 1;
      while ((await outOfStockCards.count()) === 0) {
        await expect(next).toBeEnabled();
        const firstCardBefore = (
          await cards.first().getByRole('heading', { level: 3 }).innerText()
        ).trim();
        await next.click();
        pageNumber += 1;
        await expect(current).toHaveText(String(pageNumber));
        await expect(async () => {
          const firstCardNow = (
            await cards.first().getByRole('heading', { level: 3 }).innerText()
          ).trim();
          expect(firstCardNow).not.toBe(firstCardBefore);
        }).toPass();
      }

      await expect(outOfStockCards.first()).toBeVisible();
    });

    await test.step('Click the `product-card-cta` of the first card that carries the `product-card-stock` marker', async () => {
      const firstOutOfStockCard = page
        .locator('[data-testid="product-card"]')
        .filter({ has: page.getByTestId('product-card-stock') })
        .first();
      await firstOutOfStockCard.getByTestId('product-card-cta').click();
      await expect(page.getByTestId('product-page')).toBeVisible();
      await expect(page).toHaveURL(/\/telefonok\/.*\?variant=.*$/);
      await expect(page.getByTestId('product-stock')).toHaveText(
        'Ez a konfiguráció elfogyott a demó készletből.',
      );
    });

    await test.step('Read the purchase controls of that variant', async () => {
      if (desktopViewport) {
        await expect(page.getByText('Ez a változat jelenleg nem elérhető.')).toBeVisible();
      }
      await expect(addToCartCta).toBeDisabled();
      await expect(page.getByTestId('cart-badge')).toHaveText('0');
    });

    await test.step('Select another colour whose variant is also out of stock, then come back to the out-of-stock one', async () => {
      // Scoped to the buttons: the group's own testid is `variant-color-group`,
      // which the `^=` prefix matches too (a `<fieldset>`, not a button, and it
      // carries no `aria-pressed`).
      const colourButtons = page
        .getByTestId('variant-color-group')
        .locator('button[data-testid^="variant-color-"]');
      const colourCount = await colourButtons.count();

      let selectedIndex = -1;
      for (let i = 0; i < colourCount; i++) {
        if ((await colourButtons.nth(i).getAttribute('aria-pressed')) === 'true') {
          selectedIndex = i;
          break;
        }
      }

      expect(selectedIndex).not.toBe(-1);

      for (let i = 0; i < colourCount; i++) {
        if (i === selectedIndex) continue;

        await colourButtons.nth(i).click();
        // The storefront renders the new variant asynchronously; the pressed
        // state and the stock line change in the same render, so waiting for
        // this button to read pressed is what makes the read below current.
        await expect(colourButtons.nth(i)).toHaveAttribute('aria-pressed', 'true');

        const stockText = await page.getByTestId('product-stock').textContent();

        if (stockText === 'Ez a konfiguráció elfogyott a demó készletből.') {
          await expect(page.getByTestId('product-stock')).toHaveText(
            'Ez a konfiguráció elfogyott a demó készletből.',
          );
          await expect(addToCartCta).toBeDisabled();
          if (desktopViewport) {
            await expect(page.getByText('Ez a változat jelenleg nem elérhető.')).toBeVisible();
          }
        } else {
          await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
          await expect(addToCartCta).toBeEnabled();
          await expect(page.getByText('Ez a változat jelenleg nem elérhető.')).not.toBeVisible();
        }
      }

      await colourButtons.nth(selectedIndex).click();
      await expect(colourButtons.nth(selectedIndex)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('product-stock')).toHaveText(
        'Ez a konfiguráció elfogyott a demó készletből.',
      );
      await expect(addToCartCta).toBeDisabled();
      if (desktopViewport) {
        await expect(page.getByText('Ez a változat jelenleg nem elérhető.')).toBeVisible();
      }
    });
  });
});
