// spec: specs/product-detail-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page mounts its add control differently at the two integration
// widths: at 1024px and wider the desktop CTA block inside `.cta-desktop` is
// shown and carries `add-to-cart`, while below 1024px that block is
// `display: none` and the fixed `purchase-rail` carries `purchase-cta`
// (product-page.scss, mobile-buy-rail.scss). The rail is one block pinned to
// the viewport's bottom edge, its height the `--rail-height` minimum of 5.5rem
// (88px, tokens.css) and its price block the same `price-amount` element the
// page's own block renders, so only the mount read and the rail's own steps
// branch on the viewport.
const RAIL_MIN_WIDTH = 1024;
const RAIL_HEIGHT = 88;

test.describe('Product page: variants and details', () => {
  test(
    'the mobile purchase rail below 1024 px: its price, its call to action, and the mount it replaces',
    { tag: '@integration' },
    async ({ page }) => {
      const railViewport = (page.viewportSize()?.width ?? 0) < RAIL_MIN_WIDTH;
      const cards = page.getByTestId('product-card');
      // The first card with no "Elfogyott" marker is the first in-stock card.
      const inStockCards = cards.filter({ hasNot: page.getByTestId('product-card-stock') });
      // A card renders its swatch row only when the product offers more than
      // one colour at that storage (product-card.html `colors.length > 1`), so
      // such a row always carries two or more `product-card-swatch` buttons.
      const inStockCardsWithSwatches = inStockCards.filter({
        has: page.getByTestId('product-card-swatches'),
      });
      const resultCount = page.getByTestId('result-count');
      const productPage = page.getByTestId('product-page');
      const stockLabel = page.getByTestId('product-stock');
      // The narrow viewport's sticky rail and the desktop mount it replaces.
      const rail = page.getByTestId('purchase-rail');
      const railPrice = rail.getByTestId('price-amount');
      const railCta = rail.getByTestId('purchase-cta').getByRole('button');
      const desktopAdd = page.locator('.cta-desktop').getByTestId('add-to-cart');
      // The page's own "Készülékár" block. The rail and every catalogue card
      // render a `price-amount` too, so the block is scoped by its own section
      // (product-page.html `aria-label="Árak"`).
      const devicePrice = page.locator('section[aria-label="Árak"]').getByTestId('price-amount');

      // 1. Open `/telefonok`, wait for the grid, and open the first card
      // without a `product-card-stock` marker through its `product-card-cta`.
      // This scenario's control exists only below 1024 px: at 1024 px and wider
      // the rail is `display: none` and the desktop CTA block is the shown one,
      // which step 2 asserts at that width instead.
      await test.step("1. Open `/telefonok`, wait for the grid, and open the first card without a `product-card-stock` marker through its `product-card-cta`. This scenario's control exists only below 1024 px: at 1024 px and wider the rail is `display: none` and the desktop CTA block is the shown one, which step 2 asserts at that width instead.", async () => {
        await page.goto('/telefonok');

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);

        const card = inStockCards.first();
        await expect(card).toBeVisible();
        await card.getByTestId('product-card-cta').click();

        await expect(productPage).toBeVisible();
        await expect(stockLabel).toHaveText('Raktáron a demó készletben');
        await expect(devicePrice).toHaveText('89 990');
      });

      // 2. Read the purchase mount the viewport shows, at the bottom of the screen.
      await test.step('2. Read the purchase mount the viewport shows, at the bottom of the screen.', async () => {
        if (railViewport) {
          // Below 1024px the rail is one fixed block on the viewport's bottom
          // edge: `--rail-height` (88px) is its height and `bottom: 0` pins it,
          // so on the 844px-tall mobile viewport its top edge sits 88px above
          // the bottom.
          const viewportHeight = page.viewportSize()?.height ?? 0;
          await expect(rail).toBeVisible();
          await expect(rail).toHaveCSS('position', 'fixed');
          await expect(rail).toHaveCSS('bottom', '0px');
          await expect(rail).toHaveCSS('height', `${RAIL_HEIGHT}px`);
          await expect
            .poll(async () => {
              const box = await rail.boundingBox();
              return box === null ? null : Math.round(box.y);
            })
            .toBe(viewportHeight - RAIL_HEIGHT);

          // The rail carries the page's own price block: the "Készülékár"
          // label and the same digits the page's block reads.
          await expect(rail.getByText('Készülékár', { exact: true })).toBeVisible();
          await expect(railPrice).toHaveText('89 990');
          await expect(devicePrice).toHaveText('89 990');
          await expect(railCta).toHaveText('Kosárba teszem');
          await expect(railCta).toBeEnabled();

          // The desktop block is `display: none` at this width, so the rail is
          // the only add control a shopper can press.
          await expect(desktopAdd).toBeHidden();
        } else {
          // At 1024px and wider the rail is off the screen and the desktop CTA
          // block is the mount in use.
          await expect(rail).toBeHidden();
          await expect(desktopAdd).toBeVisible();
          const desktopCta = page.getByTestId('add-to-cart-button').getByRole('button');
          await expect(desktopCta).toHaveText('Kosárba teszem');
          await expect(desktopCta).toBeEnabled();
        }
      });

      // The rail is mounted only below the 1024px breakpoint: at the wider
      // viewport step 2 proved the desktop CTA block is the mount in use, and
      // the scenario's rail steps belong to the narrow layout alone.
      test.skip(!railViewport, 'the purchase rail is mounted only below the 1024px breakpoint');

      // 3. Below 1024 px, open the first in-stock card whose
      // `product-card-swatches` row holds two or more swatches, read the rail's
      // amount, then press `variant-color-fekete`.
      await test.step("3. Below 1024 px, open the first in-stock card whose `product-card-swatches` row holds two or more swatches, read the rail's amount, then press `variant-color-fekete`.", async () => {
        await page.goto('/telefonok');
        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');

        const card = inStockCardsWithSwatches.first();
        await expect(card).toBeVisible();
        await expect(card.getByTestId('product-card-swatch').nth(1)).toBeVisible();
        await card.getByTestId('product-card-cta').click();

        // The rail is up on this page too, over the same price block the page
        // renders, and it reads the variant the card showed.
        await expect(rail).toBeVisible();
        await expect(rail.getByText('Készülékár', { exact: true })).toBeVisible();
        await expect(railPrice).toHaveText('599 990');
        await expect(devicePrice).toHaveText('599 990');
        await expect(railCta).toHaveText('Kosárba teszem');
        await expect(railCta).toBeEnabled();

        await page.getByTestId('variant-color-fekete').click();

        // The rail is fed by the same selection as the page: both amounts move
        // together to the black variant's price and the CTA stays usable.
        await expect(railPrice).toHaveText('617 990');
        await expect(devicePrice).toHaveText('617 990');
        await expect(railCta).toHaveText('Kosárba teszem');
        await expect(railCta).toBeEnabled();

        // `purchase-rail-reason` is the rail's refusal mount, rendered only
        // while the add control is refused; an in-stock selection renders none.
        await expect(page.getByTestId('purchase-rail-reason')).toHaveCount(0);
      });
    },
  );
});
