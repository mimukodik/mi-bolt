// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';
import type { Locator } from '@playwright/test';

// The default page size: the catalogue lists one card per (product, storage)
// entry, 12 of them per page (`DEFAULT_PAGE_SIZE`), and `catalog-page-size`
// reads "12 / oldal". The sort select sits in the toolbar, which both
// viewports render — no step below touches a facet, so none of them branches
// on the sidebar/drawer mount.
const DEFAULT_PAGE_SIZE = 12;

// The loaded counter reads "<n> találat a szűrt feltételek szerint"; while the
// first response is in flight it reads "Keresés a katalógusban…".
const RESULT_COUNT_PATTERN = /^\s*[1-9]\d* találat a szűrt feltételek szerint\s*$/;

/** The visible cards' price amounts as integers, in card order. */
async function readPriceAmounts(cards: Locator): Promise<number[]> {
  // The digits sit in their own `price-amount` element and carry non-breaking
  // space (U+00A0) group separators, which `\s` matches (the `price-amount`
  // element in `price-block.html` and `PriceBlock.formatHuf()`).
  const texts = await cards.getByTestId('price-amount').allTextContents();
  return texts.map((text) => Number.parseInt(text.replace(/\s/g, ''), 10));
}

/** The visible cards' product names, in card order. */
async function readCardNames(cards: Locator): Promise<string[]> {
  // Each card carries exactly one level-3 heading, its product name
  // (the `h3.name` heading in `product-card.html`), so the flattened list is
  // one name per card.
  const texts = await cards.getByRole('heading', { level: 3 }).allTextContents();
  return texts.map((text) => text.trim());
}

test.describe('Catalogue: browse, filter, sort and page', () => {
  // CI skips this spec (@ci-skip, BOLT-7): each sort mode reorders the grid; it runs locally.
  test('sorting reorders the grid', { tag: ['@integration', '@ci-skip'] }, async ({ page }) => {
    const cards = page.getByTestId('product-card');
    const sort = page.getByTestId('catalog-sort');
    const resultCount = page.getByTestId('result-count');

    // Read in step 1, checked in a later one.
    let firstCardName = '';
    let unfilteredTotal = 0;

    // 1. Open /telefonok and wait for the grid. Read every card's name and the digits of its price-amount.
    await test.step('1. Open /telefonok and wait for the grid. Read every card\'s name and the digits of its price-amount: the loading state catalog-loading gives way to the grid, exactly 12 product-card elements are rendered with every price-amount reading a positive number, and catalog-sort currently reads "Ajánlott sorrend".', async () => {
      await page.goto('/telefonok');
      // The grid wrapper is in the template from the first render; while the
      // first response is in flight it holds the catalog-loading skeleton
      // instead of any card, so the loader's disappearance together with a
      // card appearing is what proves the response landed.
      await expect(page.getByTestId('catalog-loading')).toBeHidden();
      await expect(cards.first()).toBeVisible();
      await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);

      // A price the screen does not show as digits parses to NaN, so the
      // positive-integer check is what "a readable number" means here.
      const prices = await readPriceAmounts(cards);
      expect(prices).toHaveLength(DEFAULT_PAGE_SIZE);
      for (const price of prices) {
        expect(Number.isInteger(price)).toBe(true);
        expect(price).toBeGreaterThan(0);
      }

      const names = await readCardNames(cards);
      expect(names).toHaveLength(DEFAULT_PAGE_SIZE);
      // The recommended order's first card is the card step 5 recognises the
      // sort's return by.
      firstCardName = names[0] ?? '';
      expect(firstCardName.length).toBeGreaterThan(0);

      // A select reads its selected option, so "Ajánlott sorrend" is the
      // value plus the label that value carries (`CatalogToolbar.sortLabel()`).
      await expect(sort).toHaveValue('recommended');
      await expect(sort.locator('option[value="recommended"]')).toHaveText('Ajánlott sorrend');

      await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
      unfilteredTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);
    });

    // 2. Select "Ár szerint növekvő" in catalog-sort.
    await test.step('2. Select "Ár szerint növekvő" in catalog-sort: the URL query string carries sort=price_asc, the visible price amounts are in non-decreasing order with the first card holding the smallest of them, and the result count is unchanged, because sorting does not filter.', async () => {
      // Selecting an option fires `CatalogToolbar.onSortChange()`, which writes
      // the sort into the URL through `CatalogFacade.setSort()`. `sort` is the
      // canonical query key `serializeCatalogQuery()` writes.
      await sort.selectOption('price_asc');
      await expect(sort).toHaveValue('price_asc');
      await expect(page).toHaveURL(/[?&]sort=price_asc(&|$)/);

      // While the sorted response is in flight the grid keeps the previous
      // page's cards on screen (the refreshing branch of `async-content.html`),
      // so the order is retried rather than read once: `toPass` is the tool the
      // seed names for a block that has to be retried (e2e/seed.spec.ts, rule 4).
      await expect(async () => {
        const sortedPrices = await readPriceAmounts(cards);
        expect(sortedPrices).toHaveLength(DEFAULT_PAGE_SIZE);
        expect(sortedPrices).toEqual([...sortedPrices].sort((a, b) => a - b));
        expect(sortedPrices[0]).toBe(Math.min(...sortedPrices));
      }).toPass();

      // Sorting does not filter, so the counter keeps the unfiltered total.
      await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
      const sortedTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);
      expect(sortedTotal).toBe(unfilteredTotal);
    });

    // 3. Select "Ár szerint csökkenő" in catalog-sort.
    await test.step('3. Select "Ár szerint csökkenő" in catalog-sort: the URL query string carries sort=price_desc and the visible price amounts are in non-increasing order.', async () => {
      await sort.selectOption('price_desc');
      await expect(sort).toHaveValue('price_desc');
      await expect(page).toHaveURL(/[?&]sort=price_desc(&|$)/);

      await expect(async () => {
        const sortedPrices = await readPriceAmounts(cards);
        expect(sortedPrices).toHaveLength(DEFAULT_PAGE_SIZE);
        expect(sortedPrices).toEqual([...sortedPrices].sort((a, b) => b - a));
      }).toPass();
    });

    // 4. Select "Név szerint (A–Z)" in catalog-sort.
    await test.step('4. Select "Név szerint (A–Z)" in catalog-sort: the URL query string carries sort=name_asc and the visible card names, compared case-insensitively, are in non-decreasing alphabetical order.', async () => {
      await sort.selectOption('name_asc');
      await expect(sort).toHaveValue('name_asc');
      await expect(page).toHaveURL(/[?&]sort=name_asc(&|$)/);

      await expect(async () => {
        const sortedNames = (await readCardNames(cards)).map((name) => name.toLowerCase());
        expect(sortedNames).toHaveLength(DEFAULT_PAGE_SIZE);
        // The mock compares the name sort keys case-insensitively in
        // code-unit order (`compareCaseInsensitive()` in `catalog-filter.ts`),
        // which is what JavaScript's own default `sort()` compares.
        expect(sortedNames).toEqual([...sortedNames].sort());
      }).toPass();
    });

    // 5. Select "Ajánlott sorrend" again.
    await test.step('5. Select "Ajánlott sorrend" again: the grid returns to the recommended order, its first card being the card read first in step 1.', async () => {
      await sort.selectOption('recommended');
      await expect(sort).toHaveValue('recommended');

      await expect(async () => {
        const names = await readCardNames(cards);
        expect(names[0]).toBe(firstCardName);
      }).toPass();
    });
  });
});
