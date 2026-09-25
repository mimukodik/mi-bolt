// spec: specs/shop-story-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';
import type { Locator } from '@playwright/test';

// The catalogue swaps its filter mount at 1024px, the breakpoint
// `shop-edge-mobile-filter-drawer.spec.ts` documents: at that width and wider
// the facets live in the shown `filter-sidebar` (`FilterPanel`) and the
// toolbar's `filter-trigger` is `display: none` (`.trigger` in the toolbar
// stylesheet); below it the sidebar is `display: none` (`.sidebar` in the page
// stylesheet) and the same facets are the `filter-drawer` behind the trigger,
// carrying their own `drawer-*` test ids. The drawer's edits stay a transient
// draft until `drawer-apply` commits them (`FilterDrawer.applyDraft()`), so a
// drawer edit is only applied once that button is pressed.
const SIDEBAR_MIN_WIDTH = 1024;

// The counters the walk moves through: the bare catalogue, then the Fekete
// colour filter, then that colour intersected with the 256 GB storage bucket.
const UNFILTERED_COUNT = '55 találat a szűrt feltételek szerint';
const FEKETE_COUNT = '35 találat a szűrt feltételek szerint';
const FEKETE_256_COUNT = '16 találat a szűrt feltételek szerint';

/** The first visible card's product name, read from its own level-3 heading
 *  (the `h3.name` heading in `product-card.html`). */
async function readListHead(cards: Locator): Promise<string> {
  return (await cards.first().getByRole('heading', { level: 3 }).innerText()).trim();
}

/** The visible cards' price amounts as integers, in card order. The digits sit
 *  in their own `price-amount` element and carry non-breaking space (U+00A0)
 *  group separators, which `\s` matches (`price-block.html`, `PriceBlock.formatHuf()`). */
async function readPriceAmounts(cards: Locator): Promise<number[]> {
  const texts = await cards.getByTestId('price-amount').allTextContents();
  return texts.map((text) => Number.parseInt(text.replace(/\s/g, ''), 10));
}

test.describe('Shop: home, navigation and catalogue stories', () => {
  test(
    "[E035] filters, sort and paging survive the browser's back and forward",
    { tag: '@integration' },
    async ({ page }) => {
      const viewportWidth = page.viewportSize()?.width ?? 0;
      const drawerViewport = viewportWidth < SIDEBAR_MIN_WIDTH;

      const resultCount = page.getByTestId('result-count');
      const cards = page.getByTestId('product-card');
      const appliedFilters = page.getByTestId('applied-filters');
      const appliedChips = page.getByTestId('applied-chip');
      const sort = page.getByTestId('catalog-sort');
      const paginationCurrent = page.getByTestId('pagination-current');
      const paginationNext = page.getByTestId('pagination-next');
      const filterTrigger = page.getByTestId('filter-trigger');
      const filterDrawer = page.getByTestId('filter-drawer');

      // The two facets the walk applies, at the viewport's own mount: the
      // sidebar's `filter-*` controls at 1024px and wider, the drawer's
      // `drawer-*` copies below it.
      const facetPrefix = drawerViewport ? 'drawer-' : 'filter-';
      const colorFekete = page.getByTestId(`${facetPrefix}color-fekete`);
      const storage256 = page.getByTestId(`${facetPrefix}storage-256`);

      // Below 1024px the facets exist only inside the drawer, so opening it is
      // part of editing them; at the sidebar width they are always in the DOM
      // and this is a no-op.
      const openDrawer = async (): Promise<void> => {
        if (!drawerViewport || (await filterDrawer.isVisible())) return;
        await filterTrigger.click();
        await expect(filterDrawer).toBeVisible();
      };

      // Commits the drawer's draft to the applied query (`drawer-apply`) and
      // closes the drawer; a no-op at the sidebar width, which applies each
      // edit on the spot.
      const applyDrawer = async (): Promise<void> => {
        if (!drawerViewport) return;
        await page.getByTestId('drawer-apply').getByRole('button').click();
        await expect(filterDrawer).toBeHidden();
      };

      // The applied chip row, in the order `buildChips` derives it: storage
      // before colour (`catalog-query.ts`), so `256 GB` sits before `Fekete`.
      const expectChips = async (...labels: string[]): Promise<void> => {
        await expect(appliedChips).toHaveCount(labels.length);
        for (const [index, label] of labels.entries()) {
          await expect(appliedChips.nth(index).getByText(label, { exact: true })).toBeVisible();
        }
      };

      // The list head each stop of the walk leaves behind; the history steps
      // recognise a restored list by the head it shows again.
      let colorHead = '';
      let storageHead = '';
      let sortedHead = '';
      let pageTwoHead = '';

      // 1. Open `/telefonok` and wait for `result-count`.
      await test.step('1. Open `/telefonok` and wait for `result-count`. - expect: `result-count` reads "55 találat a szűrt feltételek szerint" with 12 `product-card` elements and no chip in `applied-filters`. - expect: `pagination-current` reads "1" and `catalog-sort` reads "Ajánlott sorrend".', async () => {
        await page.goto('/telefonok');

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(resultCount).toHaveText(UNFILTERED_COUNT);
        await expect(cards).toHaveCount(12);
        // No chip means no `applied-filters` host at all (`applied-filters.html`).
        await expect(appliedFilters).toHaveCount(0);

        await expect(paginationCurrent).toHaveText('1');
        // A select reads its selected option, so "Ajánlott sorrend" is the
        // value plus the label that value carries (`CatalogToolbar.sortLabel()`).
        await expect(sort).toHaveValue('recommended');
        await expect(sort.locator('option[value="recommended"]')).toHaveText('Ajánlott sorrend');
      });

      // 2. Apply the first filter, the Fekete colour.
      await test.step('2. Apply the first filter, the Fekete colour: `filter-color-fekete` in the sidebar at full HD, `drawer-color-fekete` behind `filter-trigger` plus `drawer-apply` below 1024 px. - expect: `result-count` reads "35 találat a szűrt feltételek szerint" and one chip reads "Fekete". - expect: The address bar carries `color=fekete`. - expect: 12 cards are rendered, `pagination-current` still reads "1" and `catalog-sort` still reads "Ajánlott sorrend". - expect: The first card\'s heading is recorded as this stop\'s list head.', async () => {
        await openDrawer();
        await colorFekete.click();
        // The facet reports its own state: applied at the sidebar, the draft
        // below 1024px until `drawer-apply` commits it.
        await expect(colorFekete).toHaveAttribute('aria-pressed', 'true');
        await applyDrawer();

        await expect(resultCount).toHaveText(FEKETE_COUNT);
        await expect(page).toHaveURL(
          (url) =>
            url.pathname === '/telefonok' &&
            url.searchParams.get('color') === 'fekete' &&
            url.searchParams.get('storageGb') === null &&
            url.searchParams.get('sort') === null &&
            url.searchParams.get('page') === null,
        );
        await expectChips('Fekete');

        await expect(cards).toHaveCount(12);
        await expect(paginationCurrent).toHaveText('1');
        await expect(sort).toHaveValue('recommended');

        colorHead = await readListHead(cards);
        expect(colorHead.length).toBeGreaterThan(0);
      });

      // 3. Apply the second filter, the 256 GB storage.
      await test.step('3. Apply the second filter, the 256 GB storage: `filter-storage-256` in the sidebar at full HD, `drawer-storage-256` plus `drawer-apply` below 1024 px. - expect: `result-count` reads "16 találat a szűrt feltételek szerint" and the chips read "256 GB" and "Fekete". - expect: The address bar carries `color=fekete` and `storageGb=256`. - expect: 12 cards are rendered and `pagination-current` reads "1". - expect: The first card\'s heading is recorded as this stop\'s list head and differs from the head of step 2.', async () => {
        await openDrawer();
        await storage256.click();
        await expect(storage256).toHaveAttribute('aria-pressed', 'true');
        await applyDrawer();

        await expect(resultCount).toHaveText(FEKETE_256_COUNT);
        await expect(page).toHaveURL(
          (url) =>
            url.pathname === '/telefonok' &&
            url.searchParams.get('color') === 'fekete' &&
            url.searchParams.get('storageGb') === '256' &&
            url.searchParams.get('sort') === null &&
            url.searchParams.get('page') === null,
        );
        await expectChips('256 GB', 'Fekete');

        await expect(cards).toHaveCount(12);
        await expect(paginationCurrent).toHaveText('1');

        storageHead = await readListHead(cards);
        expect(storageHead).not.toBe(colorHead);
      });

      // 4. Change the sort: select "Ár szerint növekvő" in `catalog-sort`.
      await test.step('4. Change the sort: select "Ár szerint növekvő" in `catalog-sort`. - expect: The address bar carries `sort=price_asc` and `catalog-sort` reads "Ár szerint növekvő". - expect: The result count is still 16, because sorting does not filter. - expect: The visible `price-amount` digits are in non-decreasing order. - expect: The first card\'s heading is recorded as this stop\'s list head and differs from the head of step 3.', async () => {
        // Selecting an option fires `CatalogToolbar.onSortChange()`, which
        // writes the sort into the URL through `CatalogFacade.setSort()`.
        await sort.selectOption('price_asc');
        await expect(sort).toHaveValue('price_asc');
        await expect(sort.locator('option[value="price_asc"]')).toHaveText('Ár szerint növekvő');
        await expect(page).toHaveURL(
          (url) =>
            url.pathname === '/telefonok' &&
            url.searchParams.get('sort') === 'price_asc' &&
            url.searchParams.get('page') === null,
        );

        // Sorting does not filter: the counter keeps the 16 the two filters
        // produced.
        await expect(resultCount).toHaveText(FEKETE_256_COUNT);

        // While the sorted response is in flight the grid keeps the previous
        // order on screen (the refreshing branch of `async-content.html`), so
        // the order is retried rather than read once: `toPass` is the tool the
        // seed names for a block that has to be retried (e2e/seed.spec.ts,
        // rule 4). The head comparison rides inside the same block because the
        // stale order's head is the recommended order's, which is step 3's.
        await expect(async () => {
          const prices = await readPriceAmounts(cards);
          expect(prices).toHaveLength(12);
          expect(prices).toEqual([...prices].sort((a, b) => a - b));
          expect(await readListHead(cards)).not.toBe(storageHead);
        }).toPass();

        sortedHead = await readListHead(cards);
      });

      // 5. Change the page: press `pagination-next`.
      await test.step('5. Change the page: press `pagination-next`. - expect: The address bar carries `page=2`, `pagination-current` reads "2" and `pagination-next` is disabled. - expect: Four `product-card` elements are rendered, the second page of the 16 matches. - expect: The chips still read "256 GB" and "Fekete" and `catalog-sort` still reads "Ár szerint növekvő". - expect: The first card\'s heading is recorded as this page\'s head and differs from the head of step 4.', async () => {
        await expect(paginationNext).toBeEnabled();
        await paginationNext.click();

        // A page click writes the page into the URL through
        // `CatalogFacade.setPage()` (the `page` key in `serializeCatalogQuery()`).
        await expect(page).toHaveURL(
          (url) => url.pathname === '/telefonok' && url.searchParams.get('page') === '2',
        );
        await expect(paginationCurrent).toHaveText('2');
        // 16 matches over "12 / oldal" is two pages, so the second one is last.
        await expect(paginationNext).toBeDisabled();

        // `toHaveCount` retries, so the 12 page-1 cards still on screen while
        // the page-2 response is in flight do not settle the assertion.
        await expect(cards).toHaveCount(4);
        await expectChips('256 GB', 'Fekete');
        await expect(sort).toHaveValue('price_asc');

        pageTwoHead = await readListHead(cards);
        expect(pageTwoHead).not.toBe(sortedHead);
      });

      // 6. Press the browser's Back once.
      await test.step('6. Press the browser\'s Back once. - expect: The address bar no longer carries `page=2` and `pagination-current` reads "1". - expect: The selections survive: the chips read "256 GB" and "Fekete". - expect: The sort survives: `catalog-sort` reads "Ár szerint növekvő". - expect: The list is restored: 12 cards whose head is the one recorded in step 4.', async () => {
        // The URL query string is the facade's single source of truth
        // (`CatalogFacade`), and `CatalogPage` mirrors every route change back
        // through `loadFromParams`, so a history step restores the state it
        // left rather than diverging from it.
        await page.goBack();

        await expect(page).toHaveURL(
          (url) => url.pathname === '/telefonok' && url.searchParams.get('page') === null,
        );
        await expect(paginationCurrent).toHaveText('1');
        await expectChips('256 GB', 'Fekete');
        await expect(sort).toHaveValue('price_asc');

        await expect(cards).toHaveCount(12);
        // The page-2 cards stay on screen until the page-1 response lands, so
        // the head is retried until it is the restored list's own.
        await expect(async () => {
          expect(await readListHead(cards)).toBe(sortedHead);
        }).toPass();
      });

      // 7. Press Back a second time.
      await test.step('7. Press Back a second time. - expect: The address bar no longer carries `sort=price_asc` and `catalog-sort` reads "Ajánlott sorrend" again. - expect: The chips still read "256 GB" and "Fekete" and `pagination-current` reads "1". - expect: The list is restored to the head recorded in step 3.', async () => {
        await page.goBack();

        await expect(page).toHaveURL(
          (url) =>
            url.pathname === '/telefonok' &&
            url.searchParams.get('sort') === null &&
            url.searchParams.get('storageGb') === '256',
        );
        await expect(sort).toHaveValue('recommended');
        await expectChips('256 GB', 'Fekete');
        await expect(paginationCurrent).toHaveText('1');

        await expect(async () => {
          expect(await readListHead(cards)).toBe(storageHead);
        }).toPass();
      });

      // 8. Press Back a third time.
      await test.step('8. Press Back a third time. - expect: The address bar carries `color=fekete` only and `applied-filters` shows the single chip "Fekete". - expect: `result-count` reads "35 találat a szűrt feltételek szerint" and `pagination-current` reads "1". - expect: The list is restored to the head recorded in step 2.', async () => {
        await page.goBack();

        // "carries `color=fekete` only": the storage and sort keys are gone
        // with the entries the Back steps walked out of.
        await expect(page).toHaveURL(
          (url) =>
            url.pathname === '/telefonok' &&
            url.searchParams.get('color') === 'fekete' &&
            url.searchParams.get('storageGb') === null &&
            url.searchParams.get('sort') === null &&
            url.searchParams.get('page') === null,
        );
        await expect(resultCount).toHaveText(FEKETE_COUNT);
        await expect(appliedFilters).toBeVisible();
        await expectChips('Fekete');
        await expect(paginationCurrent).toHaveText('1');

        await expect(async () => {
          expect(await readListHead(cards)).toBe(colorHead);
        }).toPass();
      });

      // 9. Press Forward three times, checking one stop at a time.
      await test.step('9. Press Forward three times, checking one stop at a time. - expect: The first Forward restores the state of step 3: the chips "256 GB" and "Fekete", `catalog-sort` on "Ajánlott sorrend", `pagination-current` "1" and that stop\'s recorded head. - expect: The second Forward restores the state of step 4: the same chips, `catalog-sort` on "Ár szerint növekvő", `pagination-current` "1" and that stop\'s recorded head. - expect: The third Forward restores the state of step 5: `pagination-current` "2", four cards and that page\'s recorded head.', async () => {
        // First Forward: step 3's stop, the two filters under the recommended
        // order.
        await page.goForward();
        await expect(page).toHaveURL(
          (url) =>
            url.pathname === '/telefonok' &&
            url.searchParams.get('storageGb') === '256' &&
            url.searchParams.get('sort') === null &&
            url.searchParams.get('page') === null,
        );
        await expectChips('256 GB', 'Fekete');
        await expect(sort).toHaveValue('recommended');
        await expect(paginationCurrent).toHaveText('1');
        await expect(async () => {
          expect(await readListHead(cards)).toBe(storageHead);
        }).toPass();

        // Second Forward: step 4's stop, the same filters under the price sort.
        await page.goForward();
        await expect(page).toHaveURL(
          (url) =>
            url.pathname === '/telefonok' &&
            url.searchParams.get('sort') === 'price_asc' &&
            url.searchParams.get('page') === null,
        );
        await expect(sort).toHaveValue('price_asc');
        await expectChips('256 GB', 'Fekete');
        await expect(paginationCurrent).toHaveText('1');
        await expect(async () => {
          expect(await readListHead(cards)).toBe(sortedHead);
        }).toPass();

        // Third Forward: step 5's stop, the second page of the 16 matches.
        await page.goForward();
        await expect(page).toHaveURL(
          (url) => url.pathname === '/telefonok' && url.searchParams.get('page') === '2',
        );
        await expect(paginationCurrent).toHaveText('2');
        await expect(cards).toHaveCount(4);
        await expect(async () => {
          expect(await readListHead(cards)).toBe(pageTwoHead);
        }).toPass();
      });
    },
  );
});
