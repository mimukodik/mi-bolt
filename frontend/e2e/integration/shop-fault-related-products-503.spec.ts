// spec: specs/shop-fault-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page splits its buy chrome at this breakpoint: `product-page.scss`
// hides the in-flow `.cta-desktop` block (the add control and the simulation
// note) below 1024px, and `mobile-buy-rail.scss` shows `purchase-rail` there
// instead, so exactly one of the two mounts is on screen per viewport.
const BUY_BREAKPOINT_PX = 1024;

test.describe('Shop: service faults', () => {
  // CI skips this spec (@ci-skip, BOLT-7): the product page loads without its related strip when that request fails; it runs locally.
  test(
    'the related-products request fails, so the product page loads without its "Hasonló készülékek" strip',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= BUY_BREAKPOINT_PX;
      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const productPage = page.getByTestId('product-page');
      const productName = page.getByTestId('product-name');
      const relatedProducts = page.getByTestId('related-products');
      const relatedHeading = page.getByRole('heading', { name: 'Hasonló készülékek' });
      const relatedSkeletons = page.getByTestId(/^related-card-skeleton-/);
      const errorState = page.getByTestId('error-state');
      const statusMessage = page.getByTestId('status-message');
      const addControl = desktopViewport
        ? page.getByTestId('add-to-cart-button').getByRole('button')
        : page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button');

      // 1. Open the catalogue with the related-products fault on the URL's
      // first load, then wait for the grid.
      await test.step('1. Open the catalogue with the related-products fault on the URL\'s first load: `/telefonok` with `?mi-scenario=fail-related-products`, and wait for the grid. The catalogue loads normally: result-count reads "<n> találat a szűrt feltételek szerint" with n greater than 0.', async () => {
        await page.goto('/telefonok?mi-scenario=fail-related-products');

        // Only the `related-products` endpoint is broken, so the list endpoint
        // answers as usual. The pattern stays unanchored: the `result-count`
        // element's text carries whitespace around the number (" 55 találat a
        // szűrt feltételek szerint "), and a regex expectation is tested
        // against that raw text, never the trimmed text a string expectation
        // is matched against, so `^`/`$` could never match here. `[1-9]` still
        // rules out a zero count.
        await expect(resultCount).toHaveText(/[1-9]\d* találat a szűrt feltételek szerint/);
        // The click below needs at least one in-stock card, so waiting for the
        // first card is what "wait for the grid" means here.
        await expect(cards.first()).toBeVisible();
      });

      // 2. Click the CTA of the first card that carries no stock marker.
      await test.step('2. Click the `product-card-cta` of the first `product-card` that carries no `product-card-stock` marker. The product itself is unaffected: `product-name` is rendered and not empty, `product-stock` reads "Raktáron a demó készletben", and the visible add control ("Kosárba teszem") is enabled. The strip\'s skeletons (`related-card-skeleton-0` … `related-card-skeleton-3`) may flash while the request runs, and then `related-products` is not rendered at all: no "Hasonló készülékek" heading and no `related-card-skeleton-*` is left. No `error-state` and no status message is shown anywhere on the page: the related failure is silent by design, because the strip is never an error state of its own.', async () => {
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

        // The product itself is unaffected by the related fault.
        await expect(productPage).toBeVisible();
        await expect(productName).toBeVisible();
        await expect(productName).toHaveText(/\S/);
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
        await expect(addControl).toBeVisible();
        await expect(addControl).toHaveText('Kosárba teszem');
        await expect(addControl).toBeEnabled();

        // The strip renders its four `related-card-skeleton-*` placeholders
        // while the request runs and then leaves the DOM for good: once the
        // fault has answered, `relatedLoading() || related().length > 0` is
        // false, so `related-products` and its heading are not rendered. The
        // web-first assertions below retry, which is what waits the flash out.
        await expect(relatedProducts).toHaveCount(0);
        await expect(relatedSkeletons).toHaveCount(0);
        await expect(relatedHeading).toHaveCount(0);

        // The related failure is silent by design: the strip is never an error
        // state of its own, so neither the shared `error-state` nor a
        // `status-message` appears anywhere on the page.
        await expect(errorState).toHaveCount(0);
        await expect(statusMessage).toHaveCount(0);
      });

      // 3. Read the rest of the product page.
      await test.step('3. Read the rest of the product page. The gallery, `variant-selector`, the "Készülékár" price block and `product-simulation-note` are all rendered, and the page keeps its normal state. The only thing missing is the recommendation strip, so a shopper on this product loses the related phones and nothing else.', async () => {
        await expect(page.getByTestId('product-gallery')).toBeVisible();
        await expect(page.locator('app-variant-selector')).toBeVisible();

        // The "Készülékár" label and its amount are the device price block in
        // the buy box (`section[aria-label="Árak"]`, role region). It is the
        // desktop mount of the price, which stays on screen in both layouts.
        const devicePrices = page.getByRole('region', { name: 'Árak' });
        await expect(devicePrices).toBeVisible();
        await expect(devicePrices.getByText('Készülékár', { exact: true })).toBeVisible();

        // The note sits in `.cta-desktop`, which is in the DOM at both widths
        // but painted only from 1024px up, where the mobile rail takes the CTA
        // and the price over; its copy is therefore read from the desktop
        // mount, and the mobile check is that it is still rendered.
        const simulationNote = page.getByTestId('product-simulation-note');
        await expect(simulationNote).toBeAttached();
        if (desktopViewport) {
          await expect(simulationNote).toBeVisible();
          await expect(simulationNote).toHaveText(
            'A rendelés kipróbálható, de nem jár valódi vásárlással.',
          );
        }

        // The page keeps its normal state, and the only thing missing from it
        // is the recommendation strip.
        await expect(errorState).toHaveCount(0);
        await expect(statusMessage).toHaveCount(0);
        await expect(relatedProducts).toHaveCount(0);
        await expect(relatedHeading).toHaveCount(0);
      });
    },
  );
});
