// spec: specs/shop-retry-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page swaps its add control at 1024px: at that width and wider
// the buy panel shows the desktop CTA (`add-to-cart-button`, the test id on
// its `app-button` host) and the fixed rail is `display: none`; below it the
// desktop CTA block is `display: none` and the rail (`purchase-rail` with
// `purchase-cta`) is the visible control.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Shop: retry after one failure', () => {
  test(
    '[E043] the product page comes back on the same variant after one failed load',
    { tag: '@integration' },
    async ({ page }) => {
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN_WIDTH;
      const productPage = page.getByTestId('product-page');
      const resultCount = page.getByTestId('result-count');
      const cards = page.getByTestId('product-card');
      // The phone is picked by what the screen shows: the first card with no
      // `product-card-stock` ("Elfogyott") marker.
      const firstAvailableCard = cards
        .filter({ hasNot: page.getByTestId('product-card-stock') })
        .first();
      const productError = productPage.getByTestId('error-state');
      const productRetry = productError.getByRole('button', { name: 'Újrapróbálom' });
      const productName = page.getByTestId('product-name');
      const productStock = page.getByTestId('product-stock');
      // The "Készülékár" price block sits in the buy panel's own "Árak" region;
      // the mobile rail carries a second one, so scoping keeps the read on the
      // panel's own block.
      const devicePrice = page.getByRole('region', { name: 'Árak' }).getByTestId('price-amount');
      const colorGroup = page.getByTestId('variant-color-group');
      const storageGroup = page.getByTestId('variant-storage-group');

      const cardPrice =
        await test.step('1. Open the catalogue with the once-only single-product fault on the first load: `/telefonok` with `?mi-scenario=fail-once-product`, and wait for the grid. - expect: The catalogue loads normally, because only the single-product endpoint is broken: `result-count` reads "<n> találat a szűrt feltételek szerint" with n greater than 0. - expect: 12 `product-card` elements are rendered.', async () => {
          await page.goto('/telefonok?mi-scenario=fail-once-product');

          // Only the single-product endpoint is broken, so the catalogue itself
          // loads: a positive result count (a zero total renders as "Nincs
          // találat.", never as "0 találat …") and a full first page of 12 cards.
          // The `\s*` around the copy is load-bearing: the count div's text is its
          // template's own whitespace plus the label (" 55 találat a szűrt
          // feltételek szerint "), and a regex expectation is matched against
          // that raw text, never the whitespace-normalised text a string
          // expectation is matched against, so a bare `^`/`$` could never match
          // here. `[1-9]` still rules out a zero count.
          await expect(resultCount).toHaveText(
            /^\s*[1-9]\d* találat a szűrt feltételek szerint\s*$/,
          );
          await expect(cards).toHaveCount(12);

          // The price the first available card shows for the variant its CTA
          // carries, read here so step 3 can check the recovered page prices the
          // same variant rather than pinning the amount the plan names.
          const cardPriceAmount = firstAvailableCard.getByTestId('price-amount');
          // The same whitespace rule as the count above: the amount span's text is
          // the template's own whitespace plus the digits, and the regex sees it
          // raw, so the anchors tolerate it.
          await expect(cardPriceAmount).toHaveText(/^\s*\d[\d\s]*$/);
          const price = (await cardPriceAmount.innerText()).replace(/\s+/g, ' ').trim();
          expect(Number(price.replace(/\D/g, ''))).toBeGreaterThan(0);
          return price;
        });

      const { productPath, variantValue, colorCode, storageGb } =
        await test.step('2. Click the `product-card-cta` of the first `product-card` that carries no `product-card-stock` marker, and wait for the product page to settle. - expect: The address bar moves to that card\'s product page and carries its slug and its variant: `/telefonok/<slug>?variant=<slug>--<colour>-<storage>`. The in-app navigation drops `mi-scenario` from the address bar, but the mock keeps the fault for this browsing context. - expect: `product-loading` gives way to `error-state` with role `alert`, titled exactly "A termék nem tölthető be". - expect: The message reads "Ismeretlen hiba a termék betöltése közben." and the hint "A korábban megadott értékeket megőrizzük." (`error-hint`) is shown under it, and the state\'s button reads "Újrapróbálom". - expect: `product-name`, the gallery, the "Készülékár" price block, `add-to-cart-button` and `purchase-rail` are not rendered, and `related-products` is not rendered either, so no price is fabricated while the product is missing. - expect: Note the exact address (the `<slug>` and the `?variant=` value) for the next step; it is read from the address bar rather than pinned in the test.', async () => {
          await firstAvailableCard.getByTestId('product-card-cta').click();

          // The single-product 503 lands on the product page's own error branch,
          // which replaces the whole detail view with the shared `ErrorState`
          // (role alert) carrying the page's own Hungarian copy, never the 503
          // Problem's text.
          await expect(productError).toBeVisible();
          await expect(productError).toHaveAttribute('role', 'alert');
          await expect(productError.getByRole('heading', { level: 2 })).toHaveText(
            'A termék nem tölthető be',
          );
          await expect(
            productError.getByText('Ismeretlen hiba a termék betöltése közben.', { exact: true }),
          ).toBeVisible();
          await expect(productError.getByTestId('error-hint')).toHaveText(
            'A korábban megadott értékeket megőrizzük.',
          );
          await expect(productRetry).toHaveText('Újrapróbálom');

          // The loading skeleton gives way to the error branch.
          await expect(page.getByTestId('product-loading')).toHaveCount(0);

          // Nothing is fabricated from the missing product: no name, gallery,
          // price block, add control or related strip is on screen.
          await expect(productName).toHaveCount(0);
          await expect(page.getByTestId('product-gallery')).toHaveCount(0);
          await expect(page.getByTestId('price-amount')).toHaveCount(0);
          await expect(page.getByTestId('add-to-cart-button')).toHaveCount(0);
          await expect(page.getByTestId('purchase-rail')).toHaveCount(0);
          await expect(page.getByTestId('related-products')).toHaveCount(0);

          // The in-app navigation dropped `mi-scenario` from the address bar
          // while the browsing context kept the fault armed, and it carried the
          // card's own slug and variant:
          // `/telefonok/<slug>?variant=<slug>--<colour>--<storage>`.
          await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/telefonok\/[^/]+$/);
          await expect.poll(() => new URL(page.url()).searchParams.get('mi-scenario')).toBeNull();
          await expect
            .poll(() => new URL(page.url()).searchParams.get('variant'))
            .toMatch(/--.+--\d+$/);

          // The exact address is read from the address bar for the next step,
          // never pinned in the test.
          const address = new URL(page.url());
          const variant = address.searchParams.get('variant') ?? '';
          const parts = variant.split('--');
          return {
            productPath: address.pathname,
            variantValue: variant,
            colorCode: parts[parts.length - 2] ?? '',
            storageGb: parts[parts.length - 1] ?? '',
          };
        });

      await test.step('3. Press "Újrapróbálom" inside the product page\'s `error-state`. - expect: The product is requested again and recovers: `error-state` is gone and `product-page` shows the product. - expect: The address bar is unchanged: the same `<slug>` and the same `?variant=<slug>--<colour>-<storage>`, so the shopper stays on the product they asked for. - expect: `product-name` is non-empty and reads that product\'s name, `product-stock` reads "Raktáron a demó készletben", and the "Készülékár" `price-amount` is a readable non-zero amount (for the first card this is "89 990"). - expect: The variant the address named is the one selected: the `variant-color-group` legend reads "Szín: <colour>" and that colour\'s button carries `aria-pressed="true"`, and the `variant-storage-group` legend reads "Tárhely: <n> GB" and that size\'s button carries `aria-pressed="true"` - the colour name and the storage size the address\'s `variant` carries (for the first card, "Szín: Zöld" and "Tárhely: 256 GB"). - expect: `related-products` and the visible add control (`add-to-cart-button` at 1024 px and wider, `purchase-cta` inside `purchase-rail` below 1024 px) are rendered again.', async () => {
        await productRetry.click();

        // The once-only fault fired once for this page load and a retry inside
        // the page builds no new handler list, so the re-issued request
        // succeeds and the error state goes with it.
        await expect(productPage.getByTestId('error-state')).toHaveCount(0);
        await expect(productName).toBeVisible();

        // The shopper stays on the product and the variant they asked for.
        await expect.poll(() => new URL(page.url()).pathname).toBe(productPath);
        await expect.poll(() => new URL(page.url()).searchParams.get('variant')).toBe(variantValue);

        await expect(productName).not.toBeEmpty();
        await expect(productStock).toHaveText('Raktáron a demó készletben');
        await expect(devicePrice).toHaveText(cardPrice);

        // The variant the address named is the one selected: each legend names
        // the selection and the matching option carries `aria-pressed`.
        const selectedColor = colorGroup.getByTestId(`variant-color-${colorCode}`);
        await expect(selectedColor).toHaveAttribute('aria-pressed', 'true');
        const selectedStorage = storageGroup.getByTestId(`variant-storage-${storageGb}`);
        await expect(selectedStorage).toHaveAttribute('aria-pressed', 'true');

        // The colour legend names the swatch the address's variant selected;
        // the storage legend names the size it carries.
        const colorName = (await selectedColor.locator('.label').innerText()).trim();
        await expect(colorGroup.locator('legend')).toHaveText(`Szín: ${colorName}`);
        await expect(storageGroup.locator('legend')).toHaveText(`Tárhely: ${storageGb} GB`);

        // The related strip and the add control the viewport shows are back.
        await expect(page.getByTestId('related-products')).toBeVisible();
        if (desktopViewport) {
          await expect(page.getByTestId('add-to-cart-button')).toBeVisible();
        } else {
          await expect(page.getByTestId('purchase-rail').getByTestId('purchase-cta')).toBeVisible();
        }
      });
    },
  );
});
