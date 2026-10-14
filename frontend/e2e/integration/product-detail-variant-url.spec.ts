// spec: specs/product-detail-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page lays the add control out differently at the two integration
// widths: at 1024px and wider the desktop CTA block inside `.cta-desktop` is
// shown and carries `add-to-cart-button`, while below 1024px that block is
// `display: none` and the sticky `purchase-rail` carries `purchase-cta` instead
// (product-page.scss and mobile-buy-rail.scss). The variant selector, the
// address bar and the history behaviour are the same at both widths, so only
// the add control read branches on the viewport.
const RAIL_MIN_WIDTH = 1024;

test.describe('Product page: variants and details', () => {
  // CI skips this spec (@ci-skip, BOLT-7): the address carries the chosen variant and restores it; it runs locally.
  test(
    'the address bar carries the chosen variant, and opening that address in a fresh page restores it',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const cards = page.getByTestId('product-card');
      // A card renders its swatch row only when the product offers more than
      // one colour at that storage (product-card.html `colors.length > 1`), so
      // such a row always carries two or more `product-card-swatch` buttons.
      const inStockCardsWithSwatches = cards
        .filter({ has: page.getByTestId('product-card-swatches') })
        .filter({ hasNot: page.getByTestId('product-card-stock') });
      const productPage = page.getByTestId('product-page');
      const colourGroup = page.getByTestId('variant-color-group');
      const storageGroup = page.getByTestId('variant-storage-group');
      const feketeColour = page.getByTestId('variant-color-fekete');
      const storage256 = page.getByTestId('variant-storage-256');
      const storage512 = page.getByTestId('variant-storage-512');
      // The page's own "Készülékár" block. The mobile purchase rail and every
      // related-product card render a `price-amount` too, so the block is
      // scoped by its own section (product-page.html `aria-label="Árak"`).
      const devicePrice = page.locator('section[aria-label="Árak"]').getByTestId('price-amount');
      const stockLabel = page.getByTestId('product-stock');
      // The refusal paragraph of each group: a `<p class="reason">` rendered
      // inside the fieldset whose refused option it describes.
      const colourReasons = colourGroup.locator('.reason');
      // The invalid-variant notice is a `role="status"` paragraph beginning with
      // this sentence; `product-stock` is a `role="status"` too, so the notice is
      // matched by its text rather than by the role alone.
      const invalidVariantNotice = page
        .getByRole('status')
        .filter({ hasText: 'A linkben megadott változat nem található' });

      // The opened product's path and the slug its variant id is built from,
      // read off the address bar rather than named.
      let productPath = '';
      let slugName = '';

      // 1. Open `/telefonok` and wait for the grid.
      await test.step('1. Open `/telefonok` and wait for the grid.', async () => {
        await page.goto('/telefonok');

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(page.getByTestId('result-count')).toHaveText(
          '55 találat a szűrt feltételek szerint',
        );
        await expect(cards).toHaveCount(12);

        // At least one in-stock card carries a swatch row of two or more swatch
        // buttons.
        await expect(inStockCardsWithSwatches.first()).toBeVisible();
        await expect(
          inStockCardsWithSwatches.first().getByTestId('product-card-swatch').nth(1),
        ).toBeVisible();
      });

      // 2. Open the first in-stock card whose `product-card-swatches` row holds
      // two or more swatches, through its `product-card-cta`.
      await test.step('2. Open the first in-stock card whose `product-card-swatches` row holds two or more swatches, through its `product-card-cta`.', async () => {
        const card = inStockCardsWithSwatches.first();
        const cardHref = await card.getByTestId('product-card-cta').getAttribute('href');
        await card.getByTestId('product-card-cta').click();

        await expect(productPage).toBeVisible();
        // The card's shown variant travels in the query.
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === cardHref);

        // The slug the variant id is built from, read after the assertion above
        // proved the new address rendered.
        productPath = new URL(page.url()).pathname;
        slugName = productPath.split('/').pop() ?? '';

        // The legends name the pressed variant and the pressed buttons carry
        // its colour code and size.
        await expect(colourGroup.locator('legend')).toHaveText('Szín: Burgundi');
        await expect(storageGroup.locator('legend')).toHaveText('Tárhely: 256 GB');
        await expect(page.getByTestId('variant-color-burgundi')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect(storage256).toHaveAttribute('aria-pressed', 'true');

        await expect(devicePrice).toHaveText('599 990');
      });

      // 3. Press `variant-color-fekete`.
      await test.step('3. Press `variant-color-fekete`.', async () => {
        await feketeColour.click();

        // The colour choice rebuilds the variant id from the slug, the pressed
        // colour button's code and the pressed size.
        await expect(colourGroup.locator('legend')).toHaveText('Szín: Fekete');
        await expect(devicePrice).toHaveText('617 990');
        const fekete256Url = `${productPath}?variant=${slugName}--fekete--256`;
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === fekete256Url);
      });

      // 4. Press `variant-storage-512`.
      await test.step('4. Press `variant-storage-512`.', async () => {
        await storage512.click();

        await expect(storageGroup.locator('legend')).toHaveText('Tárhely: 512 GB');
        await expect(devicePrice).toHaveText('717 990');
        await expect(stockLabel).toHaveText('Raktáron a demó készletben');
        const fekete512Url = `${productPath}?variant=${slugName}--fekete--512`;
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === fekete512Url);

        // The one refusal that belongs to this size is rendered: the colour
        // this size does not come in is disabled under its own reason.
        await expect(page.getByTestId('variant-color-gleccserszin')).toBeDisabled();
        await expect(colourReasons).toHaveCount(1);
        await expect(colourReasons).toHaveText(
          'Ez a szín (Gleccserszín) nem elérhető 512 GB kapacitással.',
        );
      });

      // 5. Open the address the bar carries now in a fresh page: `page.goto` to
      // that exact path and query.
      await test.step('5. Open the address the bar carries now in a fresh page: `page.goto` to that exact path and query.', async () => {
        // `page.url()` is the `?variant=<slug>--fekete--512` address the bar
        // carries; a reload of the page is banned, so the fresh load goes
        // through `page.goto`.
        await page.goto(page.url());

        // The page restores the variant the link names.
        await expect(productPage).toBeVisible();
        await expect(colourGroup.locator('legend')).toHaveText('Szín: Fekete');
        await expect(storageGroup.locator('legend')).toHaveText('Tárhely: 512 GB');
        await expect(feketeColour).toHaveAttribute('aria-pressed', 'true');
        await expect(storage512).toHaveAttribute('aria-pressed', 'true');

        await expect(devicePrice).toHaveText('717 990');
        await expect(stockLabel).toHaveText('Raktáron a demó készletben');

        // The add control the viewport shows is enabled: `add-to-cart-button` at
        // 1024px and wider, `purchase-cta` below it.
        const addControl =
          (page.viewportSize()?.width ?? 0) >= RAIL_MIN_WIDTH
            ? page.getByTestId('add-to-cart-button').getByRole('button')
            : page.getByTestId('purchase-cta').getByRole('button');
        await expect(addControl).toBeVisible();
        await expect(addControl).toBeEnabled();

        // No invalid-variant notice is rendered, and the same single reason
        // paragraph stands in the colour group.
        await expect(invalidVariantNotice).toHaveCount(0);
        await expect(colourReasons).toHaveCount(1);
        await expect(colourReasons).toHaveText(
          'Ez a szín (Gleccserszín) nem elérhető 512 GB kapacitással.',
        );
      });

      // 6. Press the browser Back.
      await test.step('6. Press the browser Back.', async () => {
        await page.goBack();

        // The bar returns to the previous history entry's variant: each variant
        // change is a new entry rather than a replacement.
        const fekete256Url = `${productPath}?variant=${slugName}--fekete--256`;
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === fekete256Url);

        // The legends follow the restored address, and no colour is refused at
        // that size.
        await expect(colourGroup.locator('legend')).toHaveText('Szín: Fekete');
        await expect(storageGroup.locator('legend')).toHaveText('Tárhely: 256 GB');
        await expect(colourReasons).toHaveCount(0);
      });
    },
  );
});
