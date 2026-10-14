// spec: specs/shop-story-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px, the breakpoint
// `shop-edge-mobile-filter-drawer.spec.ts` documents: at that width and wider
// the facets live in the shown `filter-sidebar` (`FilterPanel`) and the
// toolbar's `filter-trigger` is `display: none` (`.trigger` in the toolbar
// stylesheet); below it the sidebar is `display: none` (`.sidebar` in the
// page's stylesheet) and the same facets are the `filter-drawer` behind the
// trigger, carrying their own `drawer-*` test ids. The drawer's edits stay a
// transient draft until `drawer-apply` commits them, so a drawer read only
// ever inspects the applied query the home shortcut brought in.
const SIDEBAR_MIN_WIDTH = 1024;

// The hero shortcuts are one column below 720px and `min-[720px]:flex-row` on
// the row's inner wrapper (`hero.html`) splits them into three columns.
const SHORTCUT_ROW_MIN_WIDTH = 720;

// The catalogue's unfiltered result count; the 5G shortcut narrows it by one,
// to the 54 the 5G facet itself then carries, and the stock shortcut keeps it
// whole.
const UNFILTERED_TOTAL = 55;
const UNFILTERED_COUNT = `${UNFILTERED_TOTAL} találat a szűrt feltételek szerint`;
const FIVE_G_COUNT = `${UNFILTERED_TOTAL - 1} találat a szűrt feltételek szerint`;

// The catalogue's page size and the card count a page of `UNFILTERED_TOTAL`
// items settles on: 24, 24 and 7. A page's count is what a page-size change or
// a `pagination-next` click moves, so it is the first read of the settled grid
// rather than a `cards.count()` taken while the previous page is still shown.
const PAGE_SIZE = 24;
const pageCardCount = (pageNumber: number): number =>
  Math.min(PAGE_SIZE, UNFILTERED_TOTAL - (pageNumber - 1) * PAGE_SIZE);

// A catalog grid card as the screen shows it: the "<colour> · <gb> GB"
// variant line (`p.variant` in `product-card.html`). A colour name is one or
// more whitespace-separated words ("király szürke"), not a single token. The
// colour is matched as one non-space, non-separator character followed by a
// run of characters that are not the separator, which keeps every repetition
// linear: nesting one unbounded repetition inside another is the catastrophic
// backtracking `security/detect-unsafe-regex` flags.
const VARIANT_LINE = /^\s*[^\s·][^·]*·\s*\d+\s*GB\s*$/;

test.describe('Shop: home, navigation and catalogue stories', () => {
  // CI skips this spec (@ci-skip, BOLT-7): the 5G and stock home shortcuts open the catalogue on their query; it runs locally.
  test(
    '[E019] the 5G and the stock home shortcut open the catalogue on their query',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const viewportWidth = page.viewportSize()?.width ?? 0;
      const drawerViewport = viewportWidth < SIDEBAR_MIN_WIDTH;

      const shortcuts = page.getByTestId('hero-shortcuts');
      const shortcutsRow = page.locator('.hero-shortcuts__inner');
      const shortcutAll = page.getByTestId('shortcut-all');
      const shortcut5g = page.getByTestId('shortcut-5g');
      const shortcutInStock = page.getByTestId('shortcut-instock');
      const resultCount = page.getByTestId('result-count');
      const appliedFilters = page.getByTestId('applied-filters');
      const appliedChips = page.getByTestId('applied-chip');
      const cards = page.getByTestId('product-card');
      const soldOutMarkers = page.getByTestId('product-card-stock');
      const filterTrigger = page.getByTestId('filter-trigger');
      const filterDrawer = page.getByTestId('filter-drawer');
      const filterIs5g = page.getByTestId('filter-is5g');
      const filterInStock = page.getByTestId('filter-inStock');
      const drawerIs5g = page.getByTestId('drawer-is5g');
      const drawerInStock = page.getByTestId('drawer-inStock');
      const pageSize = page.getByTestId('catalog-page-size');
      const paginationCurrent = page.getByTestId('pagination-current');
      const paginationNext = page.getByTestId('pagination-next');

      // The plan's card read, shared by the 5G grid and every page of the
      // stock walk: the grid has settled on `expectedCount` cards, and each
      // one names a product and its variant rather than standing empty. The
      // count is a web-first assertion rather than a `cards.count()` snapshot
      // because a page-size change and a `pagination-next` click both move it:
      // a snapshot taken while the previous page is still on screen is that
      // page's count, and the loop below then reads indices the settled grid
      // no longer has (page 3 of the stock walk shows 7 where page 2 showed
      // 24, so a stale count sends the read to a card that is gone).
      const expectNamedCards = async (expectedCount: number): Promise<void> => {
        await expect(cards).toHaveCount(expectedCount);
        for (let index = 0; index < expectedCount; index++) {
          const card = cards.nth(index);
          await expect(card.getByRole('heading', { level: 3 })).not.toBeEmpty();
          await expect(card.locator('p.variant')).toHaveText(VARIANT_LINE);
        }
      };

      // Closes the drawer a narrow-viewport facet read opened, so the step
      // after it sees the catalogue rather than an open dialog. The draft the
      // cancel discards is the applied query itself.
      const closeDrawer = async (): Promise<void> => {
        await page.getByTestId('drawer-cancel').getByRole('button').click();
        await expect(filterDrawer).toBeHidden();
      };

      // 1. Open `/` and wait for `hero-shortcuts`, then read its three cards.
      await test.step('1. Open `/` and wait for `hero-shortcuts`, then read its three cards. - expect: `shortcut-all` reads "Összes telefon" with "Válassz a készülékek közül". - expect: `shortcut-5g` reads "5G készülékek" with "Fedezd fel a demó kínálatot". - expect: `shortcut-instock` reads "Raktáron" with "Elérhető a demó készletben". - expect: All three are visible at both widths; below 720 px the row stacks instead of splitting into columns.', async () => {
        await page.goto('/');
        await expect(shortcuts).toBeVisible();

        // Each card is one link holding its title and its subtitle.
        await expect(shortcutAll).toContainText('Összes telefon');
        await expect(shortcutAll).toContainText('Válassz a készülékek közül');
        await expect(shortcut5g).toContainText('5G készülékek');
        await expect(shortcut5g).toContainText('Fedezd fel a demó kínálatot');
        await expect(shortcutInStock).toContainText('Raktáron');
        await expect(shortcutInStock).toContainText('Elérhető a demó készletben');

        for (const shortcut of [shortcutAll, shortcut5g, shortcutInStock]) {
          await expect(shortcut).toBeVisible();
        }

        // Below 720px the inner wrapper is `flex-col`, a stack; from 720px up
        // `min-[720px]:flex-row` splits it into the three columns.
        await expect(shortcutsRow).toHaveCSS('display', 'flex');
        await expect(shortcutsRow).toHaveCSS(
          'flex-direction',
          viewportWidth < SHORTCUT_ROW_MIN_WIDTH ? 'column' : 'row',
        );
      });

      // 2. Click `shortcut-5g` and wait for the catalogue's `result-count`.
      await test.step('2. Click `shortcut-5g` and wait for the catalogue\'s `result-count`. - expect: The address bar carries `is5g=true`. - expect: `result-count` reads "54 találat a szűrt feltételek szerint". - expect: `applied-filters` shows exactly one `applied-chip`, reading "Csak 5G". - expect: The query reaches the 5G facet at the viewport\'s own mount: at full HD `filter-is5g` reports `aria-pressed="true"` and its label reads "Csak 5G" with the count 54; below 1024 px open `filter-trigger` and `drawer-is5g` reports `aria-pressed="true"`.', async () => {
        await shortcut5g.click();

        // `result-count` is the catalogue-only marker: the home page renders
        // `product-card` elements of its own in the featured grid, so a card
        // alone would be satisfied before the catalogue arrived.
        await expect(resultCount).toHaveText(FIVE_G_COUNT);
        await expect(page).toHaveURL(
          (url) => url.pathname === '/telefonok' && url.searchParams.get('is5g') === 'true',
        );

        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(1);
        await expect(appliedChips.first()).toContainText('Csak 5G');

        if (drawerViewport) {
          await filterTrigger.click();
          await expect(filterDrawer).toBeVisible();
          await expect(drawerIs5g).toHaveAttribute('aria-pressed', 'true');
          await expect(drawerIs5g).toContainText('Csak 5G (54)');
          await closeDrawer();
        } else {
          await expect(filterIs5g).toHaveAttribute('aria-pressed', 'true');
          await expect(filterIs5g).toContainText('Csak 5G (54)');
        }
      });

      // 3. Read the grid the 5G shortcut produced.
      await test.step('3. Read the grid the 5G shortcut produced. - expect: 12 `product-card` elements are rendered, each with a non-empty heading and a variant line of "<colour> · <gb> GB". - expect: The 54 matches are one fewer than the catalogue\'s unfiltered 55, so the query narrowed the list.', async () => {
        // 12 cards are the default "12 / oldal".
        await expectNamedCards(12);
      });

      // 4. Open `/` again and click `shortcut-instock`, then wait for `result-count`.
      await test.step('4. Open `/` again and click `shortcut-instock`, then wait for `result-count`. - expect: The address bar carries `inStock=true`. - expect: `result-count` reads "55 találat a szűrt feltételek szerint". - expect: `applied-filters` shows exactly one `applied-chip`, reading "Csak raktáron", and no 5G chip survives from the previous shortcut. - expect: The stock facet carries the query at the viewport\'s own mount: `filter-inStock` at full HD, `drawer-inStock` below 1024 px after `filter-trigger`, reports `aria-pressed="true"` with the count 55.', async () => {
        // A fresh home page, so the shortcut starts from no query at all.
        await page.goto('/');
        await expect(shortcuts).toBeVisible();

        await shortcutInStock.click();

        await expect(resultCount).toHaveText(UNFILTERED_COUNT);
        await expect(page).toHaveURL(
          (url) => url.pathname === '/telefonok' && url.searchParams.get('inStock') === 'true',
        );

        // The 5G chip of step 2 does not survive: the stock query is the only
        // chip on this fresh landing.
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(1);
        await expect(appliedChips.first()).toContainText('Csak raktáron');
        await expect(appliedChips.filter({ hasText: 'Csak 5G' })).toHaveCount(0);

        if (drawerViewport) {
          await filterTrigger.click();
          await expect(filterDrawer).toBeVisible();
          await expect(drawerInStock).toHaveAttribute('aria-pressed', 'true');
          await expect(drawerInStock).toContainText('Csak raktáron (55)');
          await closeDrawer();
        } else {
          await expect(filterInStock).toHaveAttribute('aria-pressed', 'true');
          await expect(filterInStock).toContainText('Csak raktáron (55)');
        }
      });

      // 5. Keep the stock query and check the list matches it.
      await test.step('5. Keep the stock query and check the list matches it: select "24 / oldal" in `catalog-page-size`, then walk all three pages with `pagination-next` until it is disabled. - expect: No page carries a `product-card-stock` element, so no visible card reads "Elfogyott". - expect: Every visible card still shows a product heading and a variant line, so the list is the catalogue rather than an empty state. - expect: For reference, the same walk on `/telefonok` without the query finds three `product-card-stock` elements, one on each page, so zero here is the filter\'s effect and not the first page\'s own count.', async () => {
        await pageSize.selectOption(String(PAGE_SIZE));
        await expect(pageSize).toHaveValue(String(PAGE_SIZE));
        await expect(resultCount).toHaveText(UNFILTERED_COUNT);
        await expect(paginationCurrent).toHaveText('1');

        // The filtered walk: no page shows a sold-out card, and every page is
        // the catalogue rather than an empty state. Each page's card count is
        // asserted from the settled grid, so a `pagination-next` click that
        // takes 24 cards to the 7 of page 3 cannot leave the per-card reads on
        // the previous page's indices.
        const expectStockPage = async (pageNumber: number): Promise<void> => {
          await expect(soldOutMarkers).toHaveCount(0);
          await expect(cards.first()).toBeVisible();
          await expectNamedCards(pageCardCount(pageNumber));
        };

        await expectStockPage(1);

        for (const pageNumber of ['2', '3']) {
          await expect(paginationNext).toBeEnabled();
          await paginationNext.click();
          await expect(paginationCurrent).toHaveText(pageNumber);
          await expectStockPage(Number(pageNumber));
        }

        await expect(paginationNext).toBeDisabled();

        // The reference walk: the same three pages without the query, where
        // each one does carry the sold-out card, so the zero above is the
        // stock filter's effect rather than the first page's own count.
        await page.goto('/telefonok');
        await expect(resultCount).toHaveText(UNFILTERED_COUNT);
        await pageSize.selectOption(String(PAGE_SIZE));
        await expect(pageSize).toHaveValue(String(PAGE_SIZE));
        await expect(paginationCurrent).toHaveText('1');
        await expect(soldOutMarkers).toHaveCount(1);

        for (const pageNumber of ['2', '3']) {
          await expect(paginationNext).toBeEnabled();
          await paginationNext.click();
          await expect(paginationCurrent).toHaveText(pageNumber);
          await expect(soldOutMarkers).toHaveCount(1);
        }

        await expect(paginationNext).toBeDisabled();
      });
    },
  );
});
