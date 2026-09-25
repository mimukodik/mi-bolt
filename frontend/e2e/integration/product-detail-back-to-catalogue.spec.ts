// spec: specs/product-detail-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The header lays the catalogue link out differently at the two integration
// widths: at 1024px and wider the "Mobiltelefonok" link inside
// `nav[aria-label="Fő navigáció"]` is the shown way back and `menu-trigger` is
// `display: none` (the trigger carries `lg:hidden` and the nav `lg:flex` in
// header-nav.html), while below 1024px the nav is hidden and `menu-trigger`
// opens the `app-mobile-drawer`, whose `nav[aria-label="Mobil navigáció"]`
// carries the same one link (`STANDARD_LINKS` in header-nav.ts). Only the way
// back branches on the viewport; the breadcrumb's absence and the catalogue
// the navigation lands on are the same at both widths.
const NAV_MIN_WIDTH = 1024;

test.describe('Product page: variants and details', () => {
  test(
    'the way back to the catalogue from the product page',
    { tag: '@integration' },
    async ({ page }) => {
      const wideViewport = (page.viewportSize()?.width ?? 0) >= NAV_MIN_WIDTH;
      const cards = page.getByTestId('product-card');
      // The first card with no "Elfogyott" marker is the first in-stock card.
      const inStockCards = cards.filter({ hasNot: page.getByTestId('product-card-stock') });
      const productPage = page.getByTestId('product-page');
      const productName = page.getByTestId('product-name');
      const resultCount = page.getByTestId('result-count');
      // The header's wide-layout catalogue link and the trigger the narrow
      // layout swaps it for.
      const headerNav = page.getByRole('navigation', { name: 'Fő navigáció' });
      const menuTrigger = page.getByTestId('menu-trigger');
      const catalogueCount = '55 találat a szűrt feltételek szerint';

      // 1. Open `/telefonok`, wait for the grid, and open the first card
      // without a `product-card-stock` marker through its `product-card-cta`.
      await test.step('1. Open `/telefonok`, wait for the grid, and open the first card without a `product-card-stock` marker through its `product-card-cta`.', async () => {
        await page.goto('/telefonok');

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(resultCount).toHaveText(catalogueCount);
        await expect(cards).toHaveCount(12);

        const card = inStockCards.first();
        await expect(card).toBeVisible();
        await card.getByTestId('product-card-cta').click();

        await expect(productPage).toBeVisible();
        await expect(productName).not.toBeEmpty();
      });

      // 2. Look for the breadcrumb on the product page.
      await test.step('2. Look for the breadcrumb on the product page.', async () => {
        // The breadcrumb is switched off in this build: `BREADCRUMB_VISIBLE` is
        // `false` (breadcrumb-visibility.ts), so the `@if` in product-page.html
        // never renders its nav and no crumb stands above `product-name`.
        await expect(page.getByTestId('product-breadcrumb')).toHaveCount(0);
        await expect(page.locator('nav[aria-label="Navigáció"]')).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Főoldal' })).toHaveCount(0);
        await expect(productPage.getByRole('link', { name: 'Mobiltelefonok' })).toHaveCount(0);
      });

      // 3. Press the catalogue link the header shows: the "Mobiltelefonok" link
      // inside `nav[aria-label="Fő navigáció"]` at 1024 px and wider, or, below
      // 1024 px, `menu-trigger` first and then the "Mobiltelefonok" link inside
      // the opened dialog's "Mobil navigáció".
      await test.step('3. Press the catalogue link the header shows: the "Mobiltelefonok" link inside `nav[aria-label="Fő navigáció"]` at 1024 px and wider, or, below 1024 px, `menu-trigger` first and then the "Mobiltelefonok" link inside the opened dialog\'s "Mobil navigáció".', async () => {
        if (wideViewport) {
          // At 1024px and wider the trigger is `display: none` and the header's
          // own navigation link is the way back.
          await expect(menuTrigger).toBeHidden();
          await expect(headerNav).toBeVisible();
          await expect(headerNav.getByRole('link', { name: 'Mobiltelefonok' })).toBeVisible();
          await headerNav.getByRole('link', { name: 'Mobiltelefonok' }).click();
        } else {
          // Below 1024px the navigation is hidden and the trigger opens the
          // drawer, which is the way back.
          await expect(headerNav).toBeHidden();
          await expect(menuTrigger).toBeVisible();
          await menuTrigger.click();

          const menuDialog = page.getByRole('dialog', { name: 'Menü' });
          const mobileNav = page.getByRole('navigation', { name: 'Mobil navigáció' });
          await expect(menuDialog).toBeVisible();
          await expect(mobileNav.getByRole('link')).toHaveCount(1);
          await expect(mobileNav.getByRole('link', { name: 'Mobiltelefonok' })).toBeVisible();
          await expect(page.getByTestId('dialog-close')).toHaveAttribute('aria-label', 'Bezárás');

          await mobileNav.getByRole('link', { name: 'Mobiltelefonok' }).click();
        }

        // The press lands on the catalogue: the address bar is `/telefonok`,
        // the h1 and the grid are the catalogue's, and the product page is gone.
        await expect(page).toHaveURL((url) => url.pathname === '/telefonok');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mobiltelefonok');
        await expect(cards).toHaveCount(12);
        await expect(resultCount).toHaveText(catalogueCount);
        await expect(productPage).toHaveCount(0);
      });

      // 4. Below 1024 px, read the header again after the navigation.
      await test.step('4. Below 1024 px, read the header again after the navigation.', async () => {
        // The drawer belongs to the narrow layout alone: at the wider viewport
        // no trigger was pressed, so there is no dialog to read back.
        if (!wideViewport) {
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await expect(menuTrigger).toHaveAttribute('aria-expanded', 'false');
        }
      });
    },
  );
});
