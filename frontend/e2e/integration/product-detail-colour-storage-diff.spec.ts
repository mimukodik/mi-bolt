// spec: specs/product-detail-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The variant selector renders one group per axis: `variant-color-group` holds
// the colour buttons and `variant-storage-group` the size buttons, each a
// `<fieldset>` whose legend names the pressed value. A pair the fixture does
// not offer is refused rather than hidden: the refused option is `disabled` and
// carries an `aria-describedby` pointing at a `.reason` paragraph rendered
// inside the group the refusal belongs to. Every control this scenario drives
// exists at both integration widths, so no step branches on
// `page.viewportSize()`.
test.describe('Product page: variants and details', () => {
  test(
    'a colour whose storage sizes differ leaves the size it does not come in refused, with the reason text',
    { tag: '@integration' },
    async ({ page }) => {
      const cards = page.getByTestId('product-card');
      // A card renders its swatch row only when the product offers more than
      // one colour at that storage (product-card.html `colors.length > 1`), so
      // such a row always carries two or more `product-card-swatch` buttons.
      const inStockCardsWithSwatches = cards
        .filter({ has: page.getByTestId('product-card-swatches') })
        .filter({ hasNot: page.getByTestId('product-card-stock') });
      const colourGroup = page.getByTestId('variant-color-group');
      const colourButtons = colourGroup.locator('button[data-testid^="variant-color-"]');
      const storageGroup = page.getByTestId('variant-storage-group');
      const storageButtons = storageGroup.locator('button[data-testid^="variant-storage-"]');
      const storage256 = page.getByTestId('variant-storage-256');
      const storage512 = page.getByTestId('variant-storage-512');
      // The page's own "Készülékár" block. The mobile purchase rail and every
      // related-product card render a `price-amount` too, so the block is
      // scoped by its own section (product-page.html `aria-label="Árak"`).
      const devicePrice = page.locator('section[aria-label="Árak"]').getByTestId('price-amount');
      // The refusal paragraph of each group: a `<p class="reason">` rendered
      // inside the fieldset whose refused option it describes.
      const colourReasons = colourGroup.locator('.reason');
      const storageReasons = storageGroup.locator('.reason');

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
        await expect(page.getByTestId('catalog-page-size')).toHaveValue('12');

        // At least one in-stock card carries a swatch row of two or more
        // swatch buttons.
        await expect(inStockCardsWithSwatches.first()).toBeVisible();
        await expect(
          inStockCardsWithSwatches.first().getByTestId('product-card-swatch').nth(1),
        ).toBeVisible();
      });

      // 2. Open that first such card: click the `product-card-cta` of the first
      // `product-card` that has no `product-card-stock` marker and whose
      // `product-card-swatches` row holds at least two swatches. Note the slug
      // from the address bar.
      await test.step('2. Open that first such card through its `product-card-cta` and note the slug from the address bar.', async () => {
        const card = inStockCardsWithSwatches.first();
        const cardHref = await card.getByTestId('product-card-cta').getAttribute('href');
        await card.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-name')).not.toBeEmpty();
        // The card's shown variant travels in the query.
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === cardHref);

        // The slug and the page path, read after the assertion above proved the
        // new address rendered.
        productPath = new URL(page.url()).pathname;
        slugName = productPath.split('/').pop() ?? '';

        // Four colours and two sizes, each legend naming the pressed value. The
        // pressed colour's accessible name ends ", kiválasztva" and the three
        // others end ", elérhető".
        await expect(colourButtons).toHaveCount(4);
        await expect(storageButtons).toHaveCount(2);
        await expect(colourGroup).toContainText('Szín: Burgundi');
        await expect(storageGroup).toContainText('Tárhely: 256 GB');
        await expect(
          colourGroup.locator('button[data-testid^="variant-color-"][aria-pressed="true"]'),
        ).toHaveAttribute('aria-label', /, kiválasztva$/);
        const availableColours = colourGroup.locator(
          'button[data-testid^="variant-color-"][aria-pressed="false"]',
        );
        await expect(availableColours).toHaveCount(3);
        for (let i = 0; i < 3; i += 1) {
          await expect(availableColours.nth(i)).toHaveAttribute('aria-label', /, elérhető$/);
        }

        // Both sizes are offered, so neither group renders a refusal.
        await expect(storageButtons.nth(0)).toBeEnabled();
        await expect(storageButtons.nth(1)).toBeEnabled();
        await expect(colourReasons).toHaveCount(0);
        await expect(storageReasons).toHaveCount(0);

        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
        await expect(devicePrice).toHaveText('599 990');
      });

      // 3. Press the colour buttons one after another — `variant-color-ezust`,
      // then `variant-color-fekete` — reading the storage group after each
      // press.
      await test.step('3. Press `variant-color-ezust`, then `variant-color-fekete`, reading the storage group after each press.', async () => {
        await page.getByTestId('variant-color-ezust').click();
        await expect(colourGroup).toContainText('Szín: Ezüst');
        await expect(devicePrice).toHaveText('608 990');
        // The chosen size survives the colour change.
        await expect(storageGroup).toContainText('Tárhely: 256 GB');
        await expect(storageReasons).toHaveCount(0);

        await page.getByTestId('variant-color-fekete').click();
        await expect(colourGroup).toContainText('Szín: Fekete');
        await expect(devicePrice).toHaveText('617 990');
        // Neither of these colours leaves a size out.
        await expect(storageReasons).toHaveCount(0);
      });

      // 4. Press `variant-color-gleccserszin` and read both groups.
      await test.step('4. Press `variant-color-gleccserszin` and read both groups.', async () => {
        await page.getByTestId('variant-color-gleccserszin').click();
        await expect(colourGroup).toContainText('Szín: Gleccserszín');
        await expect(devicePrice).toHaveText('626 990');
        // The chosen size survives the colour change.
        await expect(storageGroup).toContainText('Tárhely: 256 GB');
        // The size this colour does not come in is refused, and the refusal
        // points at its own reason paragraph.
        await expect(storage512).toBeDisabled();
        await expect(storage512).toHaveAttribute(
          'aria-describedby',
          'variant-storage-disabled-512',
        );
        await expect(storage256).toHaveAttribute('aria-pressed', 'true');
        await expect(storage256).toBeEnabled();
        // The refusal belongs to the size, not to the colour.
        await expect(storageReasons).toHaveCount(1);
        await expect(storageReasons).toHaveText(
          'Ez a szín (Gleccserszín) nem elérhető 512 GB kapacitással.',
        );
        await expect(colourReasons).toHaveCount(0);
      });

      // 5. Press the disabled `variant-storage-512` with a forced click (a plain
      // press would wait forever on a disabled control).
      await test.step('5. Press the disabled `variant-storage-512` with a forced click.', async () => {
        // `force` skips the actionability wait a plain press would spend
        // forever on a disabled control; the browser then delivers no
        // activation to the refused option, so nothing changes.
        await storage512.click({ force: true });

        await expect(colourGroup).toContainText('Szín: Gleccserszín');
        await expect(storageGroup).toContainText('Tárhely: 256 GB');
        await expect(devicePrice).toHaveText('626 990');
        const unchangedUrl = `${productPath}?variant=${slugName}--gleccserszin--256`;
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === unchangedUrl);
      });

      // 6. Press `variant-color-burgundi` and read the storage group again.
      await test.step('6. Press `variant-color-burgundi` and read the storage group again.', async () => {
        await page.getByTestId('variant-color-burgundi').click();

        // The size is available again: enabled, with no reason paragraph.
        await expect(storage512).toBeEnabled();
        await expect(storage512).not.toHaveAttribute('aria-describedby');
        await expect(storageReasons).toHaveCount(0);
        await expect(storageGroup).toContainText('Tárhely: 256 GB');
        await expect(devicePrice).toHaveText('599 990');
      });
    },
  );
});
