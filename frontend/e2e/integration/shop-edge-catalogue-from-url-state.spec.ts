// spec: specs/shop-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';
import type { Locator } from '@playwright/test';

// The catalogue's filter mount changes shape with the viewport: at 1024px and
// wider the facets live in the `filter-sidebar` panel, and below that the panel
// is `display: none` while the toolbar's `filter-trigger` opens the drawer
// (`.sidebar` in the catalogue page stylesheet). Hidden is not absent: the
// sidebar keeps its own panel in the document at the mobile width, bound to the
// same applied query, so the `filter-*` controls this scenario reads
// (`filter-inStock`, `filter-is5g`, `filter-min-price`, `filter-max-price`) hold
// the URL-carried state at both integration widths. No step therefore branches
// on `page.viewportSize()`.

/** The visible cards' price amounts as integers, in card order. */
async function readPriceAmounts(cards: Locator): Promise<number[]> {
  // The digits sit in their own `price-amount` element and carry a non-breaking
  // space (U+00A0) group separator, which `\s` matches (`PriceBlock.formatHuf()`).
  const texts = await cards.getByTestId('price-amount').allTextContents();
  return texts.map((text) => Number.parseInt(text.replace(/\s/g, ''), 10));
}

test.describe('Shop: edge paths', () => {
  test(
    'the catalogue opens from a URL that carries its state',
    { tag: '@integration' },
    async ({ page }) => {
      const cards = page.getByTestId('product-card');
      const chips = page.getByTestId('applied-chip');
      const appliedFilters = page.getByTestId('applied-filters');
      const sort = page.getByTestId('catalog-sort');
      const pageSize = page.getByTestId('catalog-page-size');
      const filterTrigger = page.getByTestId('filter-trigger');
      const resultCount = page.getByTestId('result-count');
      const paginationCurrent = page.getByTestId('pagination-current');

      // Step 4 opens this address and step 5's Back lands on it again, because
      // loading a stored link issues no navigation that rewrites it.
      const malformedUrl =
        '/telefonok?page=abc&pageSize=99&sort=newest&storageGb=999&inStock=maybe&minPrice=-5&featured=yes&color=&q=';

      // 1. Open `/telefonok?inStock=true&is5g=true&sort=price_desc&page=2&pageSize=12` and wait for the grid.
      await test.step('Open `/telefonok?inStock=true&is5g=true&sort=price_desc&page=2&pageSize=12` and wait for the grid.', async () => {
        await page.goto('/telefonok?inStock=true&is5g=true&sort=price_desc&page=2&pageSize=12');

        // The filtered total is the grid's landing signal: while the first
        // response is in flight the toolbar reads "Keresés a katalógusban…"
        // (`CatalogToolbar.resultCountLabel`), so this text is only reached once
        // the response landed.
        await expect(resultCount).toHaveText('54 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);

        // A select reads its selected option, so "Ár szerint csökkenő" is the
        // value plus the label that value carries (`CatalogToolbar.sortLabel()`).
        await expect(sort).toHaveValue('price_desc');
        await expect(sort.locator('option[value="price_desc"]')).toHaveText('Ár szerint csökkenő');
        await expect(pageSize).toHaveValue('12');
        await expect(pageSize.locator('option[value="12"]')).toHaveText('12 / oldal');

        // The chip row is derived from the whole query (`buildChips`), so its
        // order is the codec's: the stock flag, then the 5G flag. Each chip
        // carries its own remove control, hence the substring match.
        await expect(appliedFilters).toBeVisible();
        await expect(chips).toHaveCount(2);
        await expect(chips.nth(0)).toContainText('Csak raktáron');
        await expect(chips.nth(1)).toContainText('Csak 5G');

        // Every facet button reports its own selection state, and the toolbar's
        // trigger counts the applied chips.
        await expect(page.getByTestId('filter-inStock')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('filter-is5g')).toHaveAttribute('aria-pressed', 'true');
        await expect(filterTrigger).toHaveText('Szűrők (2)');

        // The pager sits on the second page the URL asked for.
        await expect(paginationCurrent).toHaveText('2');
        // The sorted response is what settles the order, so the read is retried
        // until it holds rather than taken once (`toPass`, e2e/seed.spec.ts rule 4).
        await expect(async () => {
          const prices = await readPriceAmounts(cards);
          expect(prices).toHaveLength(12);
          expect(prices).toEqual([...prices].sort((a, b) => b - a));
        }).toPass();
      });

      // 2. Open `/telefonok?q=motorola&minPrice=80000&maxPrice=100000`.
      await test.step('Open `/telefonok?q=motorola&minPrice=80000&maxPrice=100000`.', async () => {
        await page.goto('/telefonok?q=motorola&minPrice=80000&maxPrice=100000');

        await expect(resultCount).toHaveText('1 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(1);

        // The chip order is the codec's again: the search term, then the price
        // floor, then the price ceiling. The price labels carry the Hungarian
        // grouped form (`toLocaleString('hu-HU')`), whose group separator is a
        // non-breaking space; Playwright normalises whitespace on both sides.
        await expect(chips).toHaveCount(3);
        await expect(chips.nth(0)).toContainText('Keresés: „motorola”');
        await expect(chips.nth(1)).toContainText('Min. ár: 80 000 Ft');
        await expect(chips.nth(2)).toContainText('Max. ár: 100 000 Ft');
        await expect(filterTrigger).toHaveText('Szűrők (3)');

        // The panel's price drafts are seeded from the applied query
        // (`FilterPanel.minDraft` / `maxDraft`), so the sidebar's own inputs show
        // what the URL carried.
        await expect(page.getByTestId('filter-min-price')).toHaveValue('80000');
        await expect(page.getByTestId('filter-max-price')).toHaveValue('100000');
      });

      // 3. Open `/telefonok?featured=true`.
      await test.step('Open `/telefonok?featured=true`.', async () => {
        await page.goto('/telefonok?featured=true');

        // The featured flag caps the list at four entries.
        await expect(resultCount).toHaveText('4 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(4);

        await expect(chips).toHaveCount(1);
        await expect(chips.first()).toContainText('Kiemelt termékek');
        await expect(filterTrigger).toHaveText('Szűrők (1)');
      });

      // 4. Open a URL that mixes one value the page understands with values it does not: `/telefonok?page=abc&pageSize=99&sort=newest&storageGb=999&inStock=maybe&minPrice=-5&featured=yes&color=&q=`.
      await test.step('Open a URL that mixes one value the page understands with values it does not: `/telefonok?page=abc&pageSize=99&sort=newest&storageGb=999&inStock=maybe&minPrice=-5&featured=yes&color=&q=`.', async () => {
        await page.goto(malformedUrl);

        // The page degrades rather than failing: the one value the codec
        // understands (`sort=newest`) applies while every rejected one falls back
        // to its default, so the response is the unfiltered catalogue.
        await expect(page.getByTestId('error-state')).toHaveCount(0);
        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);

        await expect(sort).toHaveValue('newest');
        await expect(sort.locator('option[value="newest"]')).toHaveText('Legújabb elöl');

        // The dropped values leave no trace: the malformed `page` falls back to
        // the first page, the `pageSize` outside the two allowed sizes to the
        // default page size, and the eight rejected filter values render no chip
        // at all — the `@if` chip guard in the applied-filters template removes
        // the whole row from the DOM.
        await expect(paginationCurrent).toHaveText('1');
        await expect(pageSize).toHaveValue('12');
        await expect(pageSize.locator('option[value="12"]')).toHaveText('12 / oldal');
        await expect(appliedFilters).toHaveCount(0);
        await expect(filterTrigger).toHaveText('Szűrők');

        // Loading a stored link issues no navigation that rewrites it, so the
        // address bar still holds the URL exactly as it was opened.
        await expect(page).toHaveURL(malformedUrl);
      });

      // 5. Open a page past the last one: `/telefonok?page=99`.
      await test.step('Open a page past the last one: `/telefonok?page=99`.', async () => {
        await page.goto('/telefonok?page=99');

        // A page past the last one is clamped to the last page rather than shown
        // empty: the response echoes the out-of-range request with no items and
        // the real total, and `CatalogFacade` answers it by asking for the last
        // page. `CatalogPage` writes that query with `replaceUrl`, so the
        // address bar follows the clamp.
        await expect(page).toHaveURL('/telefonok?page=5');
        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');

        // The last page holds the catalogue's remainder — 55 entries at 12 per
        // page leave 7 — and the empty state is never reached.
        await expect(cards).toHaveCount(7);
        await expect(page.getByTestId('catalog-empty')).toHaveCount(0);

        // The pager follows the clamp: it sits on the fifth page, and with no
        // page after it the next control is disabled.
        await expect(paginationCurrent).toHaveText('5');
        await expect(page.getByTestId('pagination-next')).toBeDisabled();

        // The clamp replaced the out-of-range address instead of pushing it, so
        // Back lands on step 4's URL rather than on `/telefonok?page=99`.
        await page.goBack();
        await expect(page).toHaveURL(malformedUrl);
        await expect(paginationCurrent).toHaveText('1');
      });
    },
  );
});
