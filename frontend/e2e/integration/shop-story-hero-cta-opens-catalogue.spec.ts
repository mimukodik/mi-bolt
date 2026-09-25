// spec: specs/shop-story-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px, the same breakpoint
// `shop-edge-mobile-filter-drawer.spec.ts` documents: at that width and wider
// the facets live in the shown `filter-sidebar` (`FilterPanel`) and the
// toolbar's `filter-trigger` is `display: none` (`.trigger` in the toolbar
// stylesheet); below it the sidebar is `display: none` (`.sidebar` in the
// page's stylesheet) and the trigger reads "Szűrők".
const SIDEBAR_MIN_WIDTH = 1024;

test.describe('Shop: home, navigation and catalogue stories', () => {
  test(
    "[E018] the hero's call to action opens the catalogue",
    { tag: '@integration' },
    async ({ page }) => {
      const heroCta = page.getByTestId('hero-cta');
      const resultCount = page.getByTestId('result-count');
      const cards = page.getByTestId('product-card');
      const sort = page.getByTestId('catalog-sort');
      const pageSize = page.getByTestId('catalog-page-size');
      const filterSidebar = page.getByTestId('filter-sidebar');
      const filterTrigger = page.getByTestId('filter-trigger');

      // The landing the hero link must produce: the whole address, not only the
      // path. `hero-cta` carries no `queryParams`, and the catalogue's
      // canonical form keeps the default sort and page size out of the query
      // string too, so an empty `search` is the exact expectation.
      const onPlainCatalogue = (url: URL): boolean =>
        url.pathname === '/telefonok' && url.search === '';

      // 1. Open `/` and wait for the `hero` region through its `hero-heading` test id.
      await test.step('1. Open `/` and wait for the `hero` region through its `hero-heading` test id. - expect: `hero-heading` reads "A következő mobilod. Egyszerűen.". - expect: `hero-cta` reads "Megnézem a telefonokat" and `hero-cta-secondary` reads "Hogyan működik?". - expect: The document title is "MiBolt — Kezdőlap".', async () => {
        await page.goto('/');

        // The heading rendering proves both that the app bootstrapped and that
        // MSW started, the same pin the seed uses; the getByTestId pin matters
        // here because the fatal-state template in src/index.html also holds an
        // `<h1>`.
        const heroHeading = page.getByTestId('hero-heading');
        await expect(heroHeading).toBeVisible();
        await expect(heroHeading).toHaveText('A következő mobilod. Egyszerűen.');

        await expect(heroCta).toHaveText('Megnézem a telefonokat');
        await expect(page.getByTestId('hero-cta-secondary')).toHaveText('Hogyan működik?');

        await expect(page).toHaveTitle('MiBolt — Kezdőlap');
      });

      // 2. Click `hero-cta`, the main call to action.
      await test.step('2. Click `hero-cta`, the main call to action. - expect: The address bar is the catalogue path with no query string. - expect: The catalogue\'s level-1 heading reads "Mobiltelefonok" (this row asserts the heading, not keyboard focus: the project does not test focus). - expect: The document title becomes "MiBolt — Mobiltelefonok". - expect: The wait marker is `result-count`, which only the catalogue renders: a wait on `product-card` alone is already satisfied by the home page\'s `featured` grid.', async () => {
        await heroCta.click();

        // The heading is pinned by level and name, so the home page's own `<h1>`
        // ("A következő mobilod. Egyszerűen.") cannot satisfy it mid-transition.
        await expect(page).toHaveURL(onPlainCatalogue);
        await expect(page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' })).toHaveText(
          'Mobiltelefonok',
        );
        await expect(page).toHaveTitle('MiBolt — Mobiltelefonok');

        // `result-count` is the catalogue-only marker: the home page already
        // renders `product-card` elements in its `featured` grid, so a wait on a
        // card alone would be satisfied before the catalogue arrived.
        await expect(resultCount).toBeVisible();
      });

      // 3. Read the catalogue's own markers.
      await test.step('3. Read the catalogue\'s own markers. - expect: `result-count` reads "55 találat a szűrt feltételek szerint". - expect: Exactly 12 `product-card` elements are rendered, the default "12 / oldal". - expect: `catalog-sort` reads "Ajánlott sorrend" and `catalog-page-size` reads "12 / oldal". - expect: The width difference is visible here: at full HD `filter-sidebar` is shown with its `filter-*` facets, below 1024 px it is `display: none` and `filter-trigger` reads "Szűrők".', async () => {
        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);

        // A select reads its selected option: the value plus the label that
        // value carries (the `catalog-sort` and `catalog-page-size` selects in
        // `catalog-toolbar.html`).
        await expect(sort).toHaveValue('recommended');
        await expect(sort.locator('option[value="recommended"]')).toHaveText('Ajánlott sorrend');
        await expect(pageSize).toHaveValue('12');
        await expect(pageSize.locator('option[value="12"]')).toHaveText('12 / oldal');

        // The width difference: at full HD the facets are shown in the
        // `filter-sidebar`; below 1024px that sidebar is `display: none` and the
        // drawer behind the `filter-trigger` is the only mount there.
        const sidebarViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
        if (sidebarViewport) {
          await expect(filterSidebar).toBeVisible();
          await expect(filterSidebar.getByTestId('filter-inStock')).toBeVisible();
          await expect(filterTrigger).toBeHidden();
        } else {
          await expect(filterSidebar).toBeHidden();
          await expect(filterTrigger).toBeVisible();
          await expect(filterTrigger).toHaveText('Szűrők');
        }
      });
    },
  );
});
