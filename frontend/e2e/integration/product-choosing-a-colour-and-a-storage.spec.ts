// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Product: variant choice and add to cart', () => {
  test(
    'choosing a colour and a storage size selects that variant',
    { tag: '@integration' },
    async ({ page }) => {
      // The sentence `product-stock` shows for an in-stock variant
      // (product-page.ts `stockMessage`).
      const inStockText = 'Raktáron a demó készletben';
      const cards = page.getByTestId('product-card');
      // A card renders its swatch row only when the product has more than one
      // colour at that storage (product-card.html `colors.length > 1`), so such
      // a row always carries two or more swatches.
      const inStockCardsWithSwatches = cards
        .filter({ has: page.getByTestId('product-card-swatches') })
        .filter({ hasNot: page.getByTestId('product-card-stock') });
      const colourGroup = page.getByTestId('variant-color-group');
      const colourButtons = colourGroup.locator('button[data-testid^="variant-color-"]');
      const storageGroup = page.getByTestId('variant-storage-group');
      const storageButtons = storageGroup.locator('button[data-testid^="variant-storage-"]');
      // The "Készülékár" block's amount. The mobile purchase rail and every
      // related-product card render a `price-amount` too, so the block is
      // scoped by its own section (product-page.html `aria-label="Árak"`).
      const devicePrice = page.locator('section[aria-label="Árak"]').getByTestId('price-amount');
      // The desktop CTA's inner button. A plain `getByRole` would not reach it:
      // below 1024px `display: none` hides `.cta-desktop` (product-page.scss),
      // and a hidden element is not matched by role.
      const addToCartButton = page.getByTestId('add-to-cart-button').locator('button');
      const unavailableHint = page.getByText('Ez a változat jelenleg nem elérhető.');

      let candidateCount = 0;
      let chosenColourIndex = -1;
      let selectedStorageLabel = '';

      /** The plan's step 2 expectations for the opened product page: the card's
       *  shown variant is the one the query carries. */
      const expectOpenedProductPage = async (cardHref: string | null): Promise<void> => {
        await expect(colourGroup).toBeVisible();
        await expect(page.getByTestId('product-name')).not.toBeEmpty();
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === cardHref);
        await expect(page.getByTestId('product-stock')).toHaveText(inStockText);
      };

      await test.step('Open `/telefonok` and wait for the grid', async () => {
        await page.goto('/telefonok');
        await expect(cards.first()).toBeVisible();
        // At least one in-stock card carries a swatch row with two or more
        // swatch buttons.
        await expect(inStockCardsWithSwatches.first()).toBeVisible();
        await expect(
          inStockCardsWithSwatches.first().getByTestId('product-card-swatch').nth(1),
        ).toBeVisible();
        candidateCount = await inStockCardsWithSwatches.count();
      });

      await test.step('Open the first in-stock card with such a swatch row', async () => {
        const card = inStockCardsWithSwatches.first();
        const cardHref = await card.getByTestId('product-card-cta').getAttribute('href');
        await card.getByTestId('product-card-cta').click();
        await expectOpenedProductPage(cardHref);
      });

      await test.step('Read the variant selector, going back to `/telefonok` and opening the next in-stock card with a swatch row whenever the opened product offers fewer than two storage options', async () => {
        // The plan's fallback: a product offering fewer than two storage
        // options is left behind for the next in-stock card with a swatch row.
        for (let i = 1; i < candidateCount && (await storageButtons.count()) < 2; i += 1) {
          await page.goto('/telefonok');
          await expect(cards.first()).toBeVisible();
          const card = inStockCardsWithSwatches.nth(i);
          const cardHref = await card.getByTestId('product-card-cta').getAttribute('href');
          await card.getByTestId('product-card-cta').click();
          await expectOpenedProductPage(cardHref);
        }

        // More than one colour, and the legend names the selected one.
        await expect(colourGroup).toBeVisible();
        await expect(colourButtons.nth(1)).toBeVisible();
        const selectedColour = colourGroup.locator(
          'button[data-testid^="variant-color-"][aria-pressed="true"]',
        );
        await expect(selectedColour).toHaveCount(1);
        await expect(selectedColour).toHaveAttribute('aria-label', /, kiválasztva$/);
        const selectedColourName = (
          (await selectedColour.getAttribute('aria-label')) ?? ''
        ).replace(/, kiválasztva$/, '');
        await expect(colourGroup).toContainText(`Szín: ${selectedColourName}`);
        // The other colour buttons read "<colour name>, elérhető".
        const otherColour = colourGroup
          .locator('button[data-testid^="variant-color-"][aria-pressed="false"]')
          .first();
        await expect(otherColour).toHaveAttribute('aria-label', /, elérhető$/);

        // More than one storage, and the legend names the selected one.
        await expect(storageGroup).toBeVisible();
        await expect(storageButtons.nth(1)).toBeVisible();
        const selectedStorage = storageGroup.locator(
          'button[data-testid^="variant-storage-"][aria-pressed="true"]',
        );
        await expect(selectedStorage).toHaveCount(1);
        await expect(selectedStorage).toHaveAttribute('aria-label', /^\d+ GB, kiválasztva$/);
        selectedStorageLabel = ((await selectedStorage.getAttribute('aria-label')) ?? '').replace(
          /, kiválasztva$/,
          '',
        );
        await expect(storageGroup).toContainText(`Tárhely: ${selectedStorageLabel}`);
      });

      await test.step('Note the device price in the "Készülékár" price block, the stock line and the selected colour and storage; then click a different `variant-color-*` button (any colour whose `aria-pressed` is "false")', async () => {
        const priceBefore = ((await devicePrice.textContent()) ?? '').replace(/\s+/g, ' ').trim();

        const colourCount = await colourButtons.count();
        for (let i = 0; i < colourCount; i += 1) {
          const button = colourButtons.nth(i);
          if ((await button.getAttribute('aria-pressed')) === 'true') continue;
          if (await button.isDisabled()) continue;
          chosenColourIndex = i;
          break;
        }
        expect(chosenColourIndex).not.toBe(-1);

        const chosenColour = colourButtons.nth(chosenColourIndex);
        const chosenColourName = ((await chosenColour.getAttribute('aria-label')) ?? '').replace(
          /, elérhető$/,
          '',
        );
        await chosenColour.click();

        await expect(chosenColour).toHaveAttribute('aria-pressed', 'true');
        await expect(colourGroup).toContainText(`Szín: ${chosenColourName}`);
        // The storage selection is unchanged.
        await expect(storageGroup).toContainText(`Tárhely: ${selectedStorageLabel}`);
        // The "Készülékár" block follows the newly selected variant, and so
        // does the stock line: one of the two availability sentences.
        await expect(devicePrice).toBeVisible();
        await expect(devicePrice).not.toHaveText(priceBefore);
        await expect(page.getByTestId('product-stock')).toHaveText(
          /Raktáron a demó készletben|Ez a konfiguráció elfogyott a demó készletből\./,
        );
      });

      await test.step('Click a `variant-storage-*` button that is not currently selected', async () => {
        const priceBefore = ((await devicePrice.textContent()) ?? '').replace(/\s+/g, ' ').trim();

        const storageCount = await storageButtons.count();
        let chosenStorageIndex = -1;
        for (let i = 0; i < storageCount; i += 1) {
          const button = storageButtons.nth(i);
          if ((await button.getAttribute('aria-pressed')) === 'true') continue;
          if (await button.isDisabled()) continue;
          chosenStorageIndex = i;
          break;
        }
        expect(chosenStorageIndex).not.toBe(-1);

        const chosenStorage = storageButtons.nth(chosenStorageIndex);
        const chosenStorageLabel = ((await chosenStorage.getAttribute('aria-label')) ?? '').replace(
          /, elérhető$/,
          '',
        );
        await chosenStorage.click();

        await expect(chosenStorage).toHaveAttribute('aria-pressed', 'true');
        await expect(storageGroup).toContainText(`Tárhely: ${chosenStorageLabel}`);
        // The colour selection is preserved.
        await expect(colourButtons.nth(chosenColourIndex)).toHaveAttribute('aria-pressed', 'true');
        // The price block shows the newly selected variant's amount.
        await expect(devicePrice).toBeVisible();
        await expect(devicePrice).not.toHaveText(priceBefore);
      });

      await test.step('Keep choosing colour and storage options until the shown combination is in stock', async () => {
        const showsInStock = async (): Promise<boolean> =>
          (await page.getByTestId('product-stock').textContent()) === inStockText;

        // The plan's step 6: the shown combination has to end up in stock. The
        // remaining storage options are tried first (a storage switch keeps
        // the colour), then the remaining colours.
        const storageCount = await storageButtons.count();
        for (let i = 0; i < storageCount && !(await showsInStock()); i += 1) {
          const button = storageButtons.nth(i);
          if (await button.isDisabled()) continue;
          await button.click();
          // `showsInStock()` reads the stock line with a one-shot
          // `textContent()`, so the loop's next condition must not run until
          // this click has rendered. The pressed state and the stock line
          // change in the same render.
          await expect(button).toHaveAttribute('aria-pressed', 'true');
        }
        const colourCount = await colourButtons.count();
        for (let i = 0; i < colourCount && !(await showsInStock()); i += 1) {
          const button = colourButtons.nth(i);
          if ((await button.getAttribute('aria-pressed')) === 'true') continue;
          if (await button.isDisabled()) continue;
          await button.click();
          await expect(button).toHaveAttribute('aria-pressed', 'true');
        }

        await expect(page.getByTestId('product-stock')).toHaveText(inStockText);
        await expect(addToCartButton).toBeEnabled();
        await expect(unavailableHint).not.toBeVisible();
        // The "Készülékár" block is in its success state: an amount, not the
        // `price-empty` placeholder.
        await expect(devicePrice).toBeVisible();
        await expect(
          page.locator('section[aria-label="Árak"]').getByTestId('price-empty'),
        ).toHaveCount(0);
      });
    },
  );
});
