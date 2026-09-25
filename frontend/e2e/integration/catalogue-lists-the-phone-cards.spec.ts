// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The facet groups the sidebar offers at the full HD viewport. Below 1024px
// the sidebar is `display: none` (`.sidebar` in the catalogue page stylesheet)
// and the filters live in the drawer the `filter-trigger` opens.
const SIDEBAR_FACET_GROUPS: readonly string[] = [
  'Keresés',
  'Gyártó',
  'Szín',
  'Tárhely',
  'Ár (Ft, egész szám)',
  'Egyéb',
];
// The drawer carries no "Keresés" group (the drawer's facet groups in
// `filter-drawer.html`): at the mobile viewport the search facet is the
// header's own `mobile-search-input` (in `header-nav.html`), which is what this
// mount offers for it.
const DRAWER_FACET_GROUPS: readonly string[] = [
  'Gyártó',
  'Szín',
  'Tárhely',
  'Ár (Ft, egész szám)',
  'Egyéb',
];

// The sidebar filter mount takes over at 1024px (the `.layout` breakpoint in
// the catalogue page stylesheet).
const SIDEBAR_MIN_WIDTH = 1024;

test.describe('Catalogue: browse, filter, sort and page', () => {
  test(
    'the catalogue lists the phone cards with their price and their stock marker',
    { tag: '@integration' },
    async ({ page }) => {
      // 1. Open /telefonok and wait for the grid.
      await test.step('1. Open /telefonok and wait for the grid: the loading state catalog-loading gives way to catalog-grid. The h1 reads "Mobiltelefonok", the grid holds at least one product-card and result-count reports a positive number of hits.', async () => {
        await page.goto('/telefonok');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();
        // The grid wrapper is in the template from the first render; while the
        // first response is in flight it holds the catalog-loading skeleton
        // instead of any card, so the loader's disappearance together with a
        // card appearing is what proves the response landed.
        await expect(page.getByTestId('catalog-loading')).toBeHidden();
        await expect(page.getByTestId('product-card').first()).toBeVisible();

        const pageTitle = page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' });
        await expect(pageTitle).toBeVisible();
        await expect(pageTitle).toHaveText('Mobiltelefonok');

        // A lead digit of 1-9 is what puts "n greater than 0" into the
        // assertion. While the first response is in flight the counter reads
        // "Keresés a katalógusban…", so this retries until the total arrives.
        await expect(page.getByTestId('result-count')).toHaveText(
          /^\s*[1-9]\d* találat a szűrt feltételek szerint\s*$/,
        );
      });

      // 2. Read the parts of the first product-card.
      await test.step('2. Read the parts of the first product-card: the product name stands in its heading, the variant line names the colour and the storage size, the "Egyszeri készülékár" price block shows digits in price-amount with a separate "Ft" glyph beside them, and product-card-cta reads "Megnézem" with the accessible name "<product name> részleteinek megnyitása".', async () => {
        const card = page.getByTestId('product-card').first();

        const nameHeading = card.getByRole('heading', { level: 3 });
        await expect(nameHeading).not.toBeEmpty();
        const productName = (await nameHeading.innerText()).trim();

        // The variant line reads "<colour name> · <n> GB" (the `.variant` line
        // in `product-card.html`).
        await expect(card.locator('p.variant')).toHaveText(/^\s*\S+\s*·\s*\d+\s*GB\s*$/);

        // The price block is labelled for the one-time device price and keeps
        // the "Ft" glyph in its own span beside the digits (the `price-amount`
        // element and its `.currency` span in `price-block.html`); the digits
        // carry U+00A0 group separators (`PriceBlock.formatHuf()`).
        const priceBlock = card.locator('app-price-block');
        await expect(priceBlock).toContainText('Egyszeri készülékár');
        await expect(priceBlock.getByTestId('price-amount')).toHaveText(/^\s*\d[\d\s]*$/);
        await expect(priceBlock.getByText('Ft', { exact: true })).toBeVisible();

        const cta = card.getByTestId('product-card-cta');
        await expect(cta).toHaveText('Megnézem');
        await expect(cta).toHaveAccessibleName(`${productName} részleteinek megnyitása`);
      });

      // 3. Read the stock markers across the visible cards.
      await test.step('3. Read the stock markers across the visible cards: a card whose shown variant is out of stock carries product-card-stock, an in-stock one carries no such element. Every product-card-stock present reads exactly "Elfogyott", and a card without the marker exists on this first page — the buyable card the later scenarios pick.', async () => {
        const cards = page.getByTestId('product-card');
        const stockMarkers = page.getByTestId('product-card-stock');

        const markerCount = await stockMarkers.count();
        for (let index = 0; index < markerCount; index++) {
          await expect(stockMarkers.nth(index)).toHaveText('Elfogyott');
        }

        // An in-stock card renders no marker at all (the `product-card-stock`
        // marker in `product-card.html`), and the later scenarios of this plan
        // select their buyable card by exactly that absence.
        await expect(
          cards.filter({ hasNot: page.getByTestId('product-card-stock') }).first(),
        ).toBeVisible();
      });

      // 4. Read the toolbar.
      await test.step('4. Read the toolbar: catalog-sort offers "Ajánlott sorrend", "Legújabb elöl", "Legrégebbi elöl", "Népszerűség szerint", "Ár szerint növekvő", "Ár szerint csökkenő", "Név szerint (A–Z)" and "Név szerint (Z–A)" and reads "Ajánlott sorrend"; catalog-page-size offers "12 / oldal" and "24 / oldal" and reads "12 / oldal"; and the facet groups "Keresés", "Gyártó", "Szín", "Tárhely", "Ár (Ft, egész szám)" and "Egyéb" are reachable in the sidebar filter-panel at the full HD viewport and behind the "Szűrők" trigger filter-trigger at the mobile viewport.', async () => {
        const sort = page.getByTestId('catalog-sort');
        await expect(sort).toHaveValue('recommended');
        await expect(sort.getByRole('option')).toHaveText([
          'Ajánlott sorrend',
          'Legújabb elöl',
          'Legrégebbi elöl',
          'Népszerűség szerint',
          'Ár szerint növekvő',
          'Ár szerint csökkenő',
          'Név szerint (A–Z)',
          'Név szerint (Z–A)',
        ]);

        const pageSize = page.getByTestId('catalog-page-size');
        await expect(pageSize).toHaveValue('12');
        await expect(pageSize.getByRole('option')).toHaveText(['12 / oldal', '24 / oldal']);

        const viewport = page.viewportSize();
        const desktopViewport = (viewport?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
        if (desktopViewport) {
          const panel = page.getByTestId('filter-panel');
          await expect(panel).toBeVisible();
          for (const group of SIDEBAR_FACET_GROUPS) {
            await expect(panel.getByRole('group', { name: group })).toBeVisible();
          }
        } else {
          const trigger = page.getByTestId('filter-trigger');
          await expect(trigger).toBeVisible();
          await trigger.click();

          const drawer = page.getByTestId('filter-drawer');
          await expect(drawer).toBeVisible();
          for (const group of DRAWER_FACET_GROUPS) {
            await expect(drawer.getByRole('group', { name: group })).toBeVisible();
          }
          await expect(page.getByTestId('mobile-search-input')).toBeVisible();

          // Close the drawer again (a control built on app-button, so the
          // native button inside the host is what gets pressed) so the pager
          // read below sees the catalogue rather than an open dialog.
          await page.getByTestId('drawer-cancel').getByRole('button').click();
          await expect(drawer).toBeHidden();
        }
      });

      // 5. Read the pager.
      await test.step('5. Read the pager: catalog-pagination is visible, because the catalogue holds more entries than one page of 12; pagination-current reads "1", pagination-prev is disabled and pagination-next is enabled.', async () => {
        await expect(page.getByTestId('catalog-pagination')).toBeVisible();
        await expect(page.getByTestId('pagination-current')).toHaveText('1');
        await expect(page.getByTestId('pagination-prev')).toBeDisabled();
        await expect(page.getByTestId('pagination-next')).toBeEnabled();
      });
    },
  );
});
