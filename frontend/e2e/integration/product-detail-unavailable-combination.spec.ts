// spec: specs/product-detail-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The variant selector renders one group per axis: `variant-color-group` is the
// colour fieldset and `variant-storage-group` the size one, each legend naming
// the pressed value. A pair the fixture does not offer is refused rather than
// hidden: the refused option is `disabled`, carries an `aria-describedby`
// pointing at a `.reason` paragraph rendered inside the group the refusal
// belongs to, and keeps its ", elérhető" accessible name because the selector
// refuses the pair rather than reporting stock. Both selector groups and the
// page's own "Készülékár" block render at either integration width, so no step
// branches on `page.viewportSize()`.
test.describe('Product page: variants and details', () => {
  test(
    'a colour that the chosen size does not come in is refused, and its press changes nothing',
    { tag: '@integration' },
    async ({ page }) => {
      const cards = page.getByTestId('product-card');
      // A card renders its swatch row only when the product offers more than one
      // colour at that storage, so such a row always carries two or more
      // `product-card-swatch` buttons.
      const inStockCardsWithSwatches = cards
        .filter({ has: page.getByTestId('product-card-swatches') })
        .filter({ hasNot: page.getByTestId('product-card-stock') });
      const colourGroup = page.getByTestId('variant-color-group');
      const storageGroup = page.getByTestId('variant-storage-group');
      const colourButtons = colourGroup.locator('button[data-testid^="variant-color-"]');
      const storageButtons = storageGroup.locator('button[data-testid^="variant-storage-"]');
      const storage256 = page.getByTestId('variant-storage-256');
      const storage512 = page.getByTestId('variant-storage-512');
      const gleccserColour = page.getByTestId('variant-color-gleccserszin');
      // The page's own "Készülékár" block. The narrow viewport's purchase rail
      // and every related-product card render a `price-amount` too, so the block
      // is scoped by its own section (`aria-label="Árak"`).
      const devicePrice = page.locator('section[aria-label="Árak"]').getByTestId('price-amount');
      const stockLabel = page.getByTestId('product-stock');
      // The refusal paragraph of each group: a `<p class="reason">` rendered
      // inside the fieldset whose refused option it describes.
      const colourReasons = colourGroup.locator('.reason');
      const storageReasons = storageGroup.locator('.reason');
      // What an option's accessible name ends with when it is offered or chosen.
      const offeredOrChosen = /, (elérhető|kiválasztva)$/;

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

      // 2. Open that first such card: click the `product-card-cta` of the first
      // `product-card` that has no `product-card-stock` marker and whose
      // `product-card-swatches` row holds at least two swatches. Note the slug
      // from the address bar.
      await test.step('2. Open that first such card: click the `product-card-cta` of the first `product-card` that has no `product-card-stock` marker and whose `product-card-swatches` row holds at least two swatches. Note the slug from the address bar.', async () => {
        const card = inStockCardsWithSwatches.first();
        const cardHref = await card.getByTestId('product-card-cta').getAttribute('href');
        await card.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        // The card's shown variant travels in the query.
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === cardHref);

        // The path and the slug, read after the assertion above proved the new
        // address rendered.
        productPath = new URL(page.url()).pathname;
        slugName = productPath.split('/').pop() ?? '';

        // The legends name the pressed variant, and both axes are offered in
        // full: four colours and two sizes, every one of them enabled.
        await expect(colourGroup.locator('legend')).toHaveText('Szín: Burgundi');
        await expect(storageGroup.locator('legend')).toHaveText('Tárhely: 256 GB');
        await expect(colourButtons).toHaveCount(4);
        await expect(storageButtons).toHaveCount(2);
        await expect(colourGroup.locator('button:enabled')).toHaveCount(4);
        await expect(storageGroup.locator('button:enabled')).toHaveCount(2);

        // No pair is refused yet, so neither group renders a reason paragraph.
        await expect(colourReasons).toHaveCount(0);
        await expect(storageReasons).toHaveCount(0);

        await expect(devicePrice).toHaveText('599 990');
        await expect(stockLabel).toHaveText('Raktáron a demó készletben');
      });

      // 3. Press `variant-storage-512`.
      await test.step('3. Press `variant-storage-512`.', async () => {
        await storage512.click();

        await expect(storageGroup.locator('legend')).toHaveText('Tárhely: 512 GB');
        // The colour choice survives the size change.
        await expect(colourGroup.locator('legend')).toHaveText('Szín: Burgundi');
        await expect(devicePrice).toHaveText('699 990');
        await expect(stockLabel).toHaveText('Raktáron a demó készletben');
      });

      // 4. Read the colour group at that size.
      await test.step('4. Read the colour group at that size.', async () => {
        // The colour this size does not come in is refused, and the refusal
        // points at its own reason paragraph.
        await expect(gleccserColour).toBeDisabled();
        await expect(gleccserColour).toHaveAttribute(
          'aria-describedby',
          'variant-color-disabled-gleccserszin',
        );
        // The other three colours stay enabled.
        await expect(colourGroup.locator('button:enabled')).toHaveCount(3);

        // The refusal belongs to the colour, and only to it: both sizes exist
        // for the chosen colour, so the storage group renders none.
        await expect(colourReasons).toHaveCount(1);
        await expect(colourReasons).toHaveText(
          'Ez a szín (Gleccserszín) nem elérhető 512 GB kapacitással.',
        );
        await expect(storageReasons).toHaveCount(0);

        // The selector refuses the pair rather than reporting stock, so the
        // disabled option still reads as available.
        await expect(gleccserColour).toHaveAttribute('aria-label', offeredOrChosen);
      });

      // 5. Press the disabled `variant-color-gleccserszin` with a forced click.
      await test.step('5. Press the disabled `variant-color-gleccserszin` with a forced click.', async () => {
        // `force` skips the actionability wait a plain press would spend forever
        // on a disabled control; the browser then delivers no activation to the
        // refused option, so nothing changes.
        await gleccserColour.click({ force: true });

        await expect(colourGroup.locator('legend')).toHaveText('Szín: Burgundi');
        await expect(storageGroup.locator('legend')).toHaveText('Tárhely: 512 GB');
        await expect(devicePrice).toHaveText('699 990');
        // The refusal is still the group's only reason paragraph.
        await expect(colourReasons).toHaveCount(1);
        await expect(colourReasons).toHaveText(
          'Ez a szín (Gleccserszín) nem elérhető 512 GB kapacitással.',
        );

        const unchangedUrl = `${productPath}?variant=${slugName}--burgundi--512`;
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === unchangedUrl);
      });

      // 6. Press `variant-storage-256` and read the colour group again.
      await test.step('6. Press `variant-storage-256` and read the colour group again.', async () => {
        await storage256.click();

        // The refusal followed the size, not the colour.
        await expect(gleccserColour).toBeEnabled();
        await expect(gleccserColour).not.toHaveAttribute('aria-describedby');
        await expect(colourReasons).toHaveCount(0);

        // Every colour's accessible name says it is offered or chosen.
        await expect(colourButtons).toHaveCount(4);
        for (let i = 0; i < 4; i += 1) {
          await expect(colourButtons.nth(i)).toHaveAttribute('aria-label', offeredOrChosen);
        }

        await expect(devicePrice).toHaveText('599 990');
      });
    },
  );
});
