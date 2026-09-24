// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';
import type { Locator } from '@playwright/test';

// The default page size: the catalogue lists one card per (product, storage)
// entry, 12 of them per page (`DEFAULT_PAGE_SIZE`), and `catalog-page-size`
// reads "12 / oldal". The wider option the select offers is "24 / oldal".
const DEFAULT_PAGE_SIZE = 12;
const WIDE_PAGE_SIZE = 24;

// The loaded counter reads "<n> találat a szűrt feltételek szerint"; while the
// first response is in flight it reads "Keresés a katalógusban…".
const RESULT_COUNT_PATTERN = /^\s*[1-9]\d* találat a szűrt feltételek szerint\s*$/;

/** The first card's product name, read from its own level-3 heading
 *  (the `h3.name` heading in `product-card.html`). */
async function readFirstName(cards: Locator): Promise<string> {
  return (await cards.first().getByRole('heading', { level: 3 }).innerText()).trim();
}

test.describe('Catalogue: browse, filter, sort and page', () => {
  test(
    'the page size and the pager move through the catalogue',
    { tag: '@integration' },
    async ({ page }) => {
      const cards = page.getByTestId('product-card');
      const pagination = page.getByTestId('catalog-pagination');
      const current = page.getByTestId('pagination-current');
      const prev = page.getByTestId('pagination-prev');
      const next = page.getByTestId('pagination-next');
      const pageSize = page.getByTestId('catalog-page-size');
      const resultCount = page.getByTestId('result-count');

      // Read in step 1, checked in steps 2 to 4. No step below touches a facet,
      // and the toolbar carrying both selects renders in the results column at
      // both viewports (the `app-catalog-toolbar` element in `catalog-page.html`
      // and the 1024px `.toolbar` rules in `catalog-toolbar.scss`), so no step
      // branches on the sidebar/drawer mount.
      let firstNameOnPageOne = '';
      let unfilteredTotal = 0;

      // 1. Open /telefonok and wait for the grid.
      await test.step('1. Open /telefonok and wait for the grid: the loading state catalog-loading gives way to the grid, catalog-page-size reads "12 / oldal" and exactly 12 product-card elements are rendered. catalog-pagination is visible, pagination-current reads "1", pagination-prev is disabled and pagination-next is enabled.', async () => {
        await page.goto('/telefonok');
        // The grid wrapper is in the template from the first render; while the
        // first response is in flight it holds the catalog-loading skeleton
        // instead of any card, so the loader's disappearance together with a
        // card appearing is what proves the response landed.
        await expect(page.getByTestId('catalog-loading')).toBeHidden();
        await expect(cards.first()).toBeVisible();
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);

        // A select reads its selected option, so "12 / oldal" is the value plus
        // the label that value carries (the `catalog-page-size` select in
        // `catalog-toolbar.html`).
        await expect(pageSize).toHaveValue('12');
        await expect(pageSize.locator('option[value="12"]')).toHaveText('12 / oldal');

        await expect(pagination).toBeVisible();
        await expect(current).toHaveText('1');
        await expect(prev).toBeDisabled();
        await expect(next).toBeEnabled();

        // Read here, checked in steps 2 and 3: page 1's and page 2's listings
        // are told apart by the first card alone.
        firstNameOnPageOne = await readFirstName(cards);
        expect(firstNameOnPageOne.length).toBeGreaterThan(0);

        // The total bounds step 4's card count: a 24-entry page holds 24 cards
        // only while the result set reaches that far.
        await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
        unfilteredTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);
        expect(unfilteredTotal).toBeGreaterThan(DEFAULT_PAGE_SIZE);
      });

      // 2. Click pagination-next (its accessible name is "Következő oldal").
      await test.step('2. Click pagination-next (its accessible name is "Következő oldal"): the URL query string carries page=2, pagination-current reads "2", pagination-prev is now enabled and the first card\'s name differs from the first card on page 1.', async () => {
        await expect(next).toHaveAccessibleName('Következő oldal');
        await next.click();

        // A page click writes the page into the URL through
        // `CatalogFacade.setPage()` (the `page` key in `serializeCatalogQuery()`);
        // the canonical form keeps the default page size out of the query string.
        await expect(page).toHaveURL(/[?&]page=2(&|$)/);
        await expect(current).toHaveText('2');
        await expect(prev).toBeEnabled();

        // While the page-2 response is in flight the grid keeps page 1's cards
        // on screen (the refreshing branch of `async-content.html`), so the
        // difference is retried rather than read once: `toPass` is the tool the
        // seed names for a block that has to be retried (e2e/seed.spec.ts, rule 4).
        await expect(async () => {
          const firstName = await readFirstName(cards);
          expect(firstName.length).toBeGreaterThan(0);
          expect(firstName).not.toBe(firstNameOnPageOne);
        }).toPass();
      });

      // 3. Click pagination-prev (accessible name "Előző oldal").
      await test.step('3. Click pagination-prev (accessible name "Előző oldal"): pagination-current reads "1" and the first card is page 1\'s first card again.', async () => {
        await expect(prev).toHaveAccessibleName('Előző oldal');
        await prev.click();

        await expect(current).toHaveText('1');
        // The page-2 cards stay on screen until the page-1 response lands, so
        // the name is retried until it is page 1's own again.
        await expect(async () => {
          expect(await readFirstName(cards)).toBe(firstNameOnPageOne);
        }).toPass();
      });

      // 4. Select "24 / oldal" in catalog-page-size.
      await test.step('4. Select "24 / oldal" in catalog-page-size: the URL query string carries pageSize=24, 24 product-card elements are rendered (or every entry when the result set holds fewer than 24), and the list is back on its first page with pagination-current reading "1".', async () => {
        // Selecting an option fires `CatalogToolbar.onPageSizeChange()`, which
        // writes the page size into the URL and resets the page to 1 through
        // `CatalogFacade.setPageSize()`.
        await pageSize.selectOption('24');
        await expect(pageSize).toHaveValue('24');
        await expect(page).toHaveURL(/[?&]pageSize=24(&|$)/);

        // toHaveCount retries, so the 12 cards still on screen while the wider
        // response is in flight do not settle the assertion.
        await expect(cards).toHaveCount(Math.min(WIDE_PAGE_SIZE, unfilteredTotal));

        await expect(current).toHaveText('1');
      });
    },
  );
});
