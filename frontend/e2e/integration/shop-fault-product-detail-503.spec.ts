// spec: specs/shop-fault-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Shop: service faults', () => {
  test(
    "one product's request answers 503, so its product page shows the error state and its retry keeps failing",
    { tag: '@integration' },
    async ({ page }) => {
      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const productPage = page.getByTestId('product-page');
      const errorState = page.getByTestId('error-state');
      const retryButton = errorState.getByRole('button', { name: 'Újrapróbálom' });

      // 1. Open the catalogue with the single-product fault on the URL's first
      // load, then wait for the grid.
      await test.step('1. Open the catalogue with the single-product fault on the URL\'s first load: `/telefonok` with `?mi-scenario=fail-product`, and wait for the grid. The catalogue loads normally, because only the single-product endpoint is broken: result-count reads "<n> találat a szűrt feltételek szerint" with n greater than 0 and at least one product-card is rendered.', async () => {
        await page.goto('/telefonok?mi-scenario=fail-product');

        // Only the `product` operation is broken, so the list endpoint answers
        // as usual. The pattern stays unanchored: the `result-count` element's
        // text carries whitespace around the number (" 55 találat a szűrt
        // feltételek szerint "), and a regex expectation is tested against
        // that raw text, never the trimmed text a string expectation is
        // matched against, so `^`/`$` could never match here. `[1-9]` still
        // rules out a zero count.
        await expect(resultCount).toHaveText(/[1-9]\d* találat a szűrt feltételek szerint/);
        await expect(cards.first()).toBeVisible();
      });

      // 2. Click the CTA of the first card that carries no stock marker.
      await test.step('2. Click the `product-card-cta` of the first `product-card` that carries no `product-card-stock` marker, and wait for the product page to settle. The address bar moves to that card\'s product page (`/telefonok/<slug>?variant=<id>`); the in-app navigation drops `mi-scenario` from the URL but the mock keeps the fault for this browsing context. `product-loading` gives way to `error-state` with role `alert`, titled "A termék nem tölthető be". The message reads "Ismeretlen hiba a termék betöltése közben." and the hint "A korábban megadott értékeket megőrizzük." is shown under it. The button reads "Újrapróbálom". `product-name`, the gallery, the "Készülékár" price block, `add-to-cart-button` and `purchase-rail` are not rendered, and `related-products` is not rendered either.', async () => {
        // Picking by what the screen shows: the "Elfogyott" marker in the card
        // is `product-card-stock`, so the first card without one is in stock.
        const firstAvailableCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await firstAvailableCard.getByTestId('product-card-cta').click();

        // The card's own link carries the variant query, so the product route
        // lands on `/telefonok/<slug>?variant=<id>` with no `mi-scenario`: the
        // mock holds the fault for the browsing context, not the URL.
        await expect(page).toHaveURL(/\/telefonok\/[^/?#]+\?variant=/);
        await expect(page).not.toHaveURL(/mi-scenario/);
        await expect(productPage).toBeVisible();

        // The settled state is the shared `ErrorState` (role alert) built from
        // the product page's own copy; the 503 Problem's own detail never
        // reaches the shopper, so the unknown-error line is what shows.
        await expect(page.getByTestId('product-loading')).toHaveCount(0);
        await expect(errorState).toBeVisible();
        await expect(errorState.getByRole('heading', { level: 2 })).toHaveText(
          'A termék nem tölthető be',
        );
        await expect(
          errorState.getByText('Ismeretlen hiba a termék betöltése közben.', { exact: true }),
        ).toBeVisible();
        await expect(errorState.getByTestId('error-hint')).toHaveText(
          'A korábban megadott értékeket megőrizzük.',
        );
        await expect(retryButton).toHaveText('Újrapróbálom');

        // The error branch replaces the whole product chrome: the name, the
        // gallery, the device price block, the add control and the mobile rail
        // are all absent, and the related strip is not rendered either.
        await expect(page.getByTestId('product-name')).toHaveCount(0);
        await expect(page.getByTestId('product-gallery')).toHaveCount(0);
        await expect(page.getByText('Készülékár', { exact: true })).toHaveCount(0);
        await expect(page.getByTestId('add-to-cart-button')).toHaveCount(0);
        await expect(page.getByTestId('purchase-rail')).toHaveCount(0);
        await expect(page.getByTestId('related-products')).toHaveCount(0);
      });

      // 3. Press the retry and confirm the same error state returns in place.
      await test.step('3. Press "Újrapróbálom" in the product page\'s error state. The product is requested again and the same `error-state` returns with the same four lines ("A termék nem tölthető be", "Ismeretlen hiba a termék betöltése közben.", "A korábban megadott értékeket megőrizzük.", "Újrapróbálom"). `product-page` is still on screen and the address bar is unchanged: the shopper stays on the product they asked for.', async () => {
        const productUrl = page.url();

        await retryButton.click();

        // The retry re-issues the very request the fault breaks, so the 503
        // answers again and the same error state settles back word for word.
        await expect(errorState).toBeVisible();
        await expect(errorState.getByRole('heading', { level: 2 })).toHaveText(
          'A termék nem tölthető be',
        );
        await expect(
          errorState.getByText('Ismeretlen hiba a termék betöltése közben.', { exact: true }),
        ).toBeVisible();
        await expect(errorState.getByTestId('error-hint')).toHaveText(
          'A korábban megadott értékeket megőrizzük.',
        );
        await expect(retryButton).toHaveText('Újrapróbálom');

        // The page and the address bar stay put: the retry fails in place.
        await expect(productPage).toBeVisible();
        await expect(page).toHaveURL(productUrl);
      });
    },
  );
});
