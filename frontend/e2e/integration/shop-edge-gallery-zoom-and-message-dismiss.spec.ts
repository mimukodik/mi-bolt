// spec: specs/shop-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The add control and the add confirmation are laid out differently at the two
// integration viewports. Below 1024px the desktop CTA block is `display: none`
// and the sticky `purchase-rail` carries the same "Kosárba teszem" press as its
// `purchase-cta`; at 1024px and wider the desktop block is the shown one and
// the rail is `display: none`. Both mounts stay in the DOM at either width, so
// the viewport decides which one the test drives and which one carries the
// confirmation — the buy column beside `add-to-cart-button` at 1024px and
// wider, inside `purchase-rail` below.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Shop: edge paths', () => {
  test(
    "the gallery's image and zoom dialog, and the purchase messages' dismiss control",
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addControl = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      // The confirmation is mounted twice — by the buy column on the wide
      // layout and by the rail on the narrow one — and the hidden mount carries
      // the same text, so the assertion targets whichever one the viewport
      // shows.
      const addConfirmation = page.getByTestId('status-message').filter({ visible: true });
      const gallery = page.getByTestId('product-gallery');
      const mainImage = page.getByTestId('gallery-main').locator('img');
      const cartBadge = page.getByTestId('cart-badge');

      // The product is never named: the scenario picks its card by what the
      // screen shows, and the expected copy is read off the opened page.
      let productName = '';
      let variantLabel = '';
      let mainImageSrc = '';

      // 1. Open `/telefonok`, wait for the grid and open the first
      // `product-card` that has no `product-card-stock` marker through its
      // `product-card-cta`.
      await test.step('Open `/telefonok`, wait for the grid and open the first `product-card` that has no `product-card-stock` marker through its `product-card-cta`.', async () => {
        await page.goto('/telefonok');
        await expect(page.getByTestId('product-card').first()).toBeVisible();

        const inStockCard = page
          .getByTestId('product-card')
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
        // A fresh context holds no cart, so the badge starts at zero.
        await expect(cartBadge).toHaveText('0');

        // The name, colour and storage are read off the opened page so the
        // confirmation can be checked without naming a product or a slug.
        await expect(page.getByTestId('product-name')).toBeVisible();
        productName = ((await page.getByTestId('product-name').textContent()) ?? '').trim();
        await expect(page.getByTestId('variant-color-group')).toBeVisible();
        await expect(page.getByTestId('variant-storage-group')).toBeVisible();
        const colourText =
          (await page.getByTestId('variant-color-group').locator('legend strong').textContent()) ??
          '';
        const storageText =
          (await page
            .getByTestId('variant-storage-group')
            .locator('legend strong')
            .textContent()) ?? '';
        variantLabel = `${colourText.trim()}, ${storageText.trim()}`;
      });

      // 2. Read the gallery.
      await test.step('Read the gallery.', async () => {
        await expect(gallery).toBeVisible();
        await expect(page.getByTestId('gallery-main')).toBeVisible();
        await expect(page.getByTestId('gallery-thumb-0')).toHaveCount(1);
        await expect(page.getByTestId('gallery-thumb-0')).toBeVisible();
        await expect(page.getByTestId('gallery-zoom-open')).toHaveAccessibleName('Kép nagyítása');

        // Every variant of the fixture carries exactly one image, so the
        // gallery's "several images" state is never reached: the previous/next
        // pair and the counter do not exist on screen.
        await expect(page.getByTestId('gallery-prev')).toHaveCount(0);
        await expect(page.getByTestId('gallery-next')).toHaveCount(0);
        await expect(page.getByTestId('gallery-count')).toHaveCount(0);

        mainImageSrc = (await mainImage.getAttribute('src')) ?? '';
      });

      // 3. Press `gallery-thumb-0`.
      await test.step('Press `gallery-thumb-0`.', async () => {
        await page.getByTestId('gallery-thumb-0').click();

        // The click re-selects the variant's only image: the main image stays
        // the one on screen and the thumbnail keeps `aria-current="true"`.
        await expect(page.getByTestId('gallery-thumb-0')).toHaveAttribute('aria-current', 'true');
        await expect(mainImage).toHaveAttribute('src', mainImageSrc);
      });

      // 4. Press `gallery-zoom-open`.
      await test.step('Press `gallery-zoom-open`.', async () => {
        await page.getByTestId('gallery-zoom-open').click();

        // The zoom opens a modal dialog labelled with the product name, headed
        // by the same sentence and holding the image.
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        await expect(dialog).toHaveAccessibleName(`Nagyított kép: ${productName}`);
        await expect(
          dialog.getByRole('heading', { name: `Nagyított kép: ${productName}` }),
        ).toBeVisible();
        await expect(dialog.locator('img')).toBeVisible();
        await expect(dialog.getByTestId('dialog-close')).toHaveAccessibleName('Bezárás');
      });

      // 5. Press `dialog-close`.
      await test.step('Press `dialog-close`.', async () => {
        await page.getByTestId('dialog-close').click();

        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(gallery).toBeVisible();
      });

      // 6. Add the shown variant with the add control the viewport shows: the
      // inner button of `add-to-cart-button` at 1024 px and wider, of
      // `purchase-cta` below.
      await test.step('Add the shown variant with the add control the viewport shows: the inner button of `add-to-cart-button` at 1024 px and wider, of `purchase-cta` below.', async () => {
        await addControl.click();

        await expect(addConfirmation).toContainText(
          `${productName}, ${variantLabel} – 1 darab a kosárban.`,
        );
        await expect(addConfirmation.getByRole('button', { name: 'Bezárás' })).toBeVisible();
        await expect(cartBadge).toHaveText('1');
      });

      // 7. Press the confirmation's "Bezárás" control.
      await test.step('Press the confirmation\'s "Bezárás" control.', async () => {
        await addConfirmation.getByRole('button', { name: 'Bezárás' }).click();

        // The message disappears from its mount and the add control stays
        // enabled, so the shopper can add again.
        await expect(addConfirmation).toHaveCount(0);
        await expect(addControl).toBeEnabled();

        await addControl.click();
        await expect(addConfirmation).toContainText(
          `${productName}, ${variantLabel} – 2 darab a kosárban.`,
        );
      });
    },
  );
});
