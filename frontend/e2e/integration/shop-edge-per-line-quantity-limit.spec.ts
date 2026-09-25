// spec: specs/shop-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The add control and the refusal are laid out differently at the two
// integration viewports. Below 1024px the desktop CTA block is `display: none`
// (the `.cta-desktop` rule in the product page stylesheet) and the sticky
// `purchase-rail` carries the same "Kosárba teszem" press as its `purchase-cta`;
// at 1024px and wider the desktop block is the shown one and the rail is
// `display: none`. Both mounts stay in the DOM at either width, so the viewport
// decides which one the test drives and which one carries the refusal — the
// `add-to-cart` control's own banner at 1024px and wider, the rail's status row
// below.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Shop: edge paths', () => {
  test(
    'adding the same variant past its per-line limit is refused',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addControl = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      // The add confirmation is mounted twice — by the page's own status
      // message on the wide layout and by the rail's copy on the narrow one —
      // and the hidden mount carries the same text, so the assertion targets
      // whichever one the viewport shows.
      const addConfirmation = page.getByTestId('status-message').filter({ visible: true });
      // The refusal is mounted by the control the viewport shows: the
      // `add-to-cart` control's own banner at 1024px and wider, the rail's
      // status row below.
      const refusal = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('status-message')
        : page.getByTestId('add-to-cart').getByTestId('status-message');
      const cartBadge = page.getByTestId('cart-badge');
      const cartLine = page.getByTestId('cart-line');

      // The product is never named: the scenario picks its card by what the
      // screen shows, and the expected values are read off the page.
      let productName = '';
      let variantLabel = '';

      // 1. Open `/telefonok` and wait for the grid.
      await test.step('Open `/telefonok` and wait for the grid.', async () => {
        await page.goto('/telefonok');
        await expect(page.getByTestId('result-count')).toHaveText(
          '55 találat a szűrt feltételek szerint',
        );
        await expect(page.getByTestId('product-card').first()).toBeVisible();
        // A fresh context holds no cart, so the badge starts at zero.
        await expect(cartBadge).toHaveText('0');
      });

      // 2. Open the first `product-card` that has no `product-card-stock`
      // marker through its `product-card-cta`, and read the purchase controls.
      await test.step('Open the first `product-card` that has no `product-card-stock` marker through its `product-card-cta`, and read the purchase controls.', async () => {
        const inStockCard = page
          .getByTestId('product-card')
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
        // The add control the viewport shows is the enabled one.
        await expect(addControl).toBeEnabled();

        // The name, colour and storage are read off the opened page so each
        // confirmation can be checked without naming a product or a slug.
        productName = ((await page.getByTestId('product-name').textContent()) ?? '').trim();
        const colourGroup = page.getByTestId('variant-color-group');
        const storageGroup = page.getByTestId('variant-storage-group');
        const colourText = (await colourGroup.locator('legend strong').textContent()) ?? '';
        const storageText = (await storageGroup.locator('legend strong').textContent()) ?? '';
        variantLabel = `${colourText.trim()}, ${storageText.trim()}`;

        // The variant's line maximum is 5: the fixture's first in-stock entry
        // carries `maxQuantity` 5, and the cart store refuses a merged quantity
        // above it with a 409 `QUANTITY_LIMIT`. Steps 4 and 5 read that
        // refusal back; the cap is not spent by one refusal.
      });

      // 3. Press the add control the viewport shows five times, reading the
      // message after every press.
      await test.step('Press the add control the viewport shows five times, reading the message after every press.', async () => {
        for (let quantity = 1; quantity <= 5; quantity++) {
          await addControl.click();
          // Each message names the cart line's own quantity, not the amount
          // just dispatched.
          await expect(addConfirmation).toContainText(
            `${productName}, ${variantLabel} – ${quantity} darab a kosárban.`,
          );
        }
        await expect(cartBadge).toHaveText('5');
      });

      // 4. Press the same control once more.
      await test.step('Press the same control once more.', async () => {
        await addControl.click();

        // The page names the server's `max` parameter of the 409, rather than
        // a generic sentence.
        await expect(refusal).toContainText('Ebből a termékből legfeljebb 5 db lehet a kosárban.');
        // The refusal replaced the previous confirmation, and the refused add
        // left the cart unchanged.
        await expect(addConfirmation).not.toContainText('darab a kosárban.');
        await expect(cartBadge).toHaveText('5');
        // A refusal is a dismissible notice, not the page's persistent error,
        // so it carries a "Bezárás" control in the mount the viewport shows.
        await expect(refusal.getByRole('button', { name: 'Bezárás' })).toBeVisible();
      });

      // 5. Press that "Bezárás" control, then press the add control once more.
      await test.step('Press that "Bezárás" control, then press the add control once more.', async () => {
        await refusal.getByRole('button', { name: 'Bezárás' }).click();
        await expect(refusal).toHaveCount(0);
        await expect(addControl).toBeEnabled();

        await addControl.click();
        // The cap belongs to the cart line, so one refusal does not spend it.
        await expect(refusal).toContainText('Ebből a termékből legfeljebb 5 db lehet a kosárban.');
      });

      // 6. Open the cart with `cart-link`.
      await test.step('Open the cart with `cart-link`.', async () => {
        // The checkout layout carries no `cart-badge` of its own, so the badge
        // is read on the product page, before the cart opens: no refused add
        // ever reached the cart.
        await expect(cartBadge).toHaveText('5');

        await page.getByTestId('cart-link').click();

        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(cartLine).toHaveCount(1);
        await expect(cartLine.getByTestId('cart-line-quantity')).toHaveText('5 db');
        await expect(page.getByTestId('cart-count')).toHaveText('Kosárban található termékek (1)');
      });
    },
  );
});
