// spec: specs/shop-story-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The header swaps its chrome at 1024px, the breakpoint
// `shop-edge-mobile-filter-drawer.spec.ts` documents: from that width up the
// header's `header__nav` landmark and its `header__search` box are laid out
// (`lg:flex`) and below it both are `display: none` behind the header's
// `menu-trigger`, which opens the deferred `mobile-drawer`. Only the
// "MiBolt kezdőlap" brand link is shown at both widths, so the 404's chrome is
// pinned through that link wherever the other two are hidden.
const HEADER_NAV_MIN_WIDTH = 1024;

test.describe('Shop: home, navigation and catalogue stories', () => {
  test(
    '[E107] an unmatched address shows the utility 404 and both recovery links work',
    { tag: '@integration' },
    async ({ page }) => {
      const notFoundPage = page.getByTestId('not-found-page');
      // The 404's own heading and lede. The heading is read inside
      // `not-found-page` because the fatal-state template in src/index.html
      // also carries an `<h1>` when MSW fails, the trap the seed names.
      const notFoundHeading = notFoundPage.getByRole('heading', { level: 1 });
      const notFoundLede = notFoundPage.locator('p.lede');
      const notFoundHomeLink = page.getByTestId('not-found-home-link');
      const notFoundCatalogLink = page.getByTestId('not-found-catalog-link');
      // The header's chrome. The brand link is the one control shown at both
      // widths; the nav link is read inside the header's own `Fő navigáció`
      // landmark, because the 404 section carries a "Mobiltelefonok" link of
      // its own and a page-wide role locator would match both.
      const brandLink = page.getByRole('link', { name: 'MiBolt kezdőlap' });
      const headerNav = page.getByRole('navigation', { name: 'Fő navigáció' });
      const navLink = headerNav.getByRole('link', { name: 'Mobiltelefonok' });
      // Pinned by test id rather than by its accessible name: "Keresés a
      // telefonok között" labels both the wide `header-search` input and the
      // narrow `mobile-search` input, so a role locator would match two.
      const searchBox = page.getByTestId('header-search-input');
      const heroHeading = page.getByTestId('hero-heading');
      const catalogHeading = page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' });
      const resultCount = page.getByTestId('result-count');
      const cards = page.getByTestId('product-card');

      const headerNavViewport = (page.viewportSize()?.width ?? 0) >= HEADER_NAV_MIN_WIDTH;

      // 1. Open a path that no route matches, `/nincs-ilyen-oldal`, and wait for `not-found-page`.
      await test.step('1. Open a path that no route matches, `/nincs-ilyen-oldal`, and wait for `not-found-page`.', async () => {
        await page.goto('/nincs-ilyen-oldal');

        // The wildcard route mounts the 404 inside `ShopLayout`, so the shop's
        // header stays around it.
        await expect(notFoundPage).toBeVisible();
        await expect(notFoundHeading).toHaveText('Az oldal nem található');
        await expect(notFoundLede).toHaveText('A keresett oldal nem érhető el a MiBolt demóban.');
        await expect(page).toHaveTitle('MiBolt — Az oldal nem található');

        await expect(brandLink).toBeVisible();
        if (headerNavViewport) {
          await expect(navLink).toBeVisible();
          await expect(searchBox).toBeVisible();
        } else {
          // Below 1024px both sit behind the header's `menu-trigger`; the
          // header itself shows only the brand link.
          await expect(navLink).toBeHidden();
          await expect(searchBox).toBeHidden();
        }
      });

      // 2. Click `not-found-home-link`, reading "Vissza a főoldalra".
      await test.step('2. Click `not-found-home-link`, reading "Vissza a főoldalra".', async () => {
        await expect(notFoundHomeLink).toHaveText('Vissza a főoldalra');
        await notFoundHomeLink.click();

        // The landing is read after the URL assertion proved the navigation
        // settled on the recovery target.
        await expect(page).toHaveURL('/');
        await expect(heroHeading).toHaveText('A következő mobilod. Egyszerűen.');
      });

      // 3. Open a second unmatched address, `/ez/sem/letezik`, and wait for `not-found-page`.
      await test.step('3. Open a second unmatched address, `/ez/sem/letezik`, and wait for `not-found-page`.', async () => {
        await page.goto('/ez/sem/letezik');

        await expect(notFoundPage).toBeVisible();
        await expect(notFoundHeading).toHaveText('Az oldal nem található');
        await expect(notFoundCatalogLink).toHaveText('Mobiltelefonok');
      });

      // 4. Click `not-found-catalog-link`.
      await test.step('4. Click `not-found-catalog-link`.', async () => {
        await notFoundCatalogLink.click();

        await expect(page).toHaveURL('/telefonok');
        await expect(catalogHeading).toHaveText('Mobiltelefonok');

        // `result-count` is the catalogue-only marker, read after the heading
        // proved the catalogue — not the home page — rendered.
        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);
      });
    },
  );
});
