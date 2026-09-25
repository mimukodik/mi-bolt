// spec: specs/catalogue-filter-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px: at that width and wider the
// price fields `filter-min-price` / `filter-max-price` live in the shown
// `filter-sidebar` (`FilterPanel`), which applies every edit immediately;
// below it the sidebar is `display: none` and the same fields follow
// the `drawer-*` naming inside the `filter-drawer` (`FilterDrawer`) that
// `filter-trigger` opens, whose edits stay a transient draft until
// `drawer-apply` commits them and closes the drawer. A drawer field is only in
// the DOM while the drawer is open, so reading one after an apply means
// opening the drawer again.
const SIDEBAR_MIN_WIDTH = 1024;

// The catalogue's own default page size: it lists one card per
// (product, storage) entry, 12 of them per page (the catalogue query module's
// `DEFAULT_PAGE_SIZE`).
const DEFAULT_PAGE_SIZE = 12;

// The applied range this scenario narrows to, and the card prices it must
// then bound.
const MIN_BOUND = 300_000;
const MAX_BOUND = 600_000;

test.describe('Catalogue: filter controls', () => {
  test('a price range narrows the list', { tag: '@integration' }, async ({ page }) => {
    const sidebarViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
    const catalogHost = page.locator('app-catalog-page');
    const resultCount = page.getByTestId('result-count');
    const cards = page.getByTestId('product-card');
    const appliedFilters = page.getByTestId('applied-filters');
    const appliedChips = page.getByTestId('applied-chip');
    const filterTrigger = page.getByTestId('filter-trigger');
    const priceAmounts = page.getByTestId('price-amount');
    const filterDrawer = page.getByTestId('filter-drawer');
    // The price field pair the viewport shows: the sidebar's own at 1024px
    // and wider, the drawer's below it.
    const minPrice = page.getByTestId(sidebarViewport ? 'filter-min-price' : 'drawer-min-price');
    const maxPrice = page.getByTestId(sidebarViewport ? 'filter-max-price' : 'drawer-max-price');
    // Controls built on the `app-button` primitive are host elements carrying
    // the test id, so the press targets the native `button` inside them
    // (`app-button`).
    const drawerApply = page.getByTestId('drawer-apply').getByRole('button');

    // The unfiltered counter the scenario opens on and returns to after the
    // upper bound is cleared.
    const unfilteredCount = '55 találat a szűrt feltételek szerint';

    // Below 1024px the price fields exist only while the drawer is open, so
    // opening it is part of reading or editing them; at the sidebar width
    // they are always in the DOM and this is a no-op.
    const openDrawer = async (): Promise<void> => {
      if (sidebarViewport) return;
      if (await filterDrawer.isVisible()) return;
      await filterTrigger.click();
      await expect(filterDrawer).toBeVisible();
    };

    // 1. Open `/telefonok` and wait for the grid, then read the price fields.
    await test.step('1. Open `/telefonok` and wait for the grid, then read the price fields.', async () => {
      await page.goto('/telefonok');

      // The grid wrapper is in the template from the first render; while the
      // first response is in flight it holds the `catalog-loading` skeleton
      // instead of any card, so the loader's disappearance together with a
      // card appearing is what proves the response landed. The counter reads
      // "Keresés a katalógusban…" until then, so this text is only reached
      // once it landed.
      await expect(catalogHost).toHaveAttribute(
        'data-layout-mode',
        sidebarViewport ? 'sidebar' : 'drawer',
      );
      await expect(page.getByTestId('catalog-loading')).toBeHidden();
      await expect(cards.first()).toBeVisible();
      await expect(resultCount).toHaveText(unfilteredCount);
      await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);

      // The price inputs start empty with the unfiltered result set's own
      // bounds as their placeholders (`priceMinHint` / `priceMaxHint`).
      await openDrawer();
      await expect(minPrice).toHaveValue('');
      await expect(minPrice).toHaveAttribute('placeholder', '69990');
      await expect(maxPrice).toHaveValue('');
      await expect(maxPrice).toHaveAttribute('placeholder', '1095990');
    });

    // 2. Type "300000" into the minimum price field (`filter-min-price`; below 1024 px type it into `drawer-min-price`, then press `drawer-apply`).
    await test.step('2. Type "300000" into the minimum price field (`filter-min-price`; below 1024 px type it into `drawer-min-price`, then press `drawer-apply`).', async () => {
      await minPrice.fill('300000');

      // At the drawer width the edit is a draft until Apply commits it, and
      // the apply closes the drawer.
      if (!sidebarViewport) {
        await drawerApply.click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }

      // The narrower set landed: the counter names 35 hits.
      await expect(resultCount).toHaveText('35 találat a szűrt feltételek szerint');

      // The applied state carries the lower bound in the address bar and in
      // one chip whose remove button is `applied-chip-remove-minPrice`
      // (`buildChips` labels it "Min. ár: <value> Ft").
      await expect.poll(() => new URL(page.url()).searchParams.get('minPrice')).toBe('300000');
      await expect(appliedFilters).toBeVisible();
      await expect(appliedChips).toHaveCount(1);
      await expect(appliedChips.first()).toContainText('Min. ár: 300 000 Ft');
      await expect(page.getByTestId('applied-chip-remove-minPrice')).toBeVisible();

      // The minimum field's placeholder follows the narrower set while the
      // maximum stays empty at the unfiltered ceiling.
      await openDrawer();
      await expect(minPrice).toHaveAttribute('placeholder', '319990');
      await expect(maxPrice).toHaveValue('');
      await expect(maxPrice).toHaveAttribute('placeholder', '1095990');
    });

    // 3. Type "600000" into the maximum price field (`filter-max-price`; below 1024 px `drawer-max-price`, then press `drawer-apply`).
    await test.step('3. Type "600000" into the maximum price field (`filter-max-price`; below 1024 px `drawer-max-price`, then press `drawer-apply`).', async () => {
      await maxPrice.fill('600000');

      if (!sidebarViewport) {
        await drawerApply.click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }

      // The full range landed: 25 hits over a full page of cards.
      await expect(resultCount).toHaveText('25 találat a szűrt feltételek szerint');
      await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);

      // The address bar carries both bounds, and the chip row holds one chip
      // per bound with its own remove button.
      await expect.poll(() => new URL(page.url()).searchParams.get('minPrice')).toBe('300000');
      await expect.poll(() => new URL(page.url()).searchParams.get('maxPrice')).toBe('600000');
      await expect(appliedFilters).toBeVisible();
      await expect(appliedChips).toHaveCount(2);
      await expect(appliedChips.nth(0)).toContainText('Min. ár: 300 000 Ft');
      await expect(appliedChips.nth(1)).toContainText('Max. ár: 600 000 Ft');
      await expect(page.getByTestId('applied-chip-remove-minPrice')).toBeVisible();
      await expect(page.getByTestId('applied-chip-remove-maxPrice')).toBeVisible();

      // The toolbar counts both applied filters.
      await expect(filterTrigger).toHaveText('Szűrők (2)');

      // Every price the visible cards show, read as a number (the Hungarian
      // format's non-breaking space thousands separator is stripped), falls
      // inside the applied range. The read comes after the web-first
      // assertions above proved the narrowed set rendered.
      const shownPrices = await priceAmounts.allTextContents();
      expect(shownPrices.length).toBeGreaterThan(0);
      for (const text of shownPrices) {
        const value = Number(text.replace(/[^\d]/g, ''));
        expect(value).toBeGreaterThanOrEqual(MIN_BOUND);
        expect(value).toBeLessThanOrEqual(MAX_BOUND);
      }

      // Both placeholders follow the narrowed set.
      await openDrawer();
      await expect(minPrice).toHaveAttribute('placeholder', '319990');
      await expect(maxPrice).toHaveAttribute('placeholder', '599990');
    });

    // 4. Clear the maximum price field (`filter-max-price`; below 1024 px empty `drawer-max-price`, then press `drawer-apply`).
    await test.step('4. Clear the maximum price field (`filter-max-price`; below 1024 px empty `drawer-max-price`, then press `drawer-apply`).', async () => {
      await maxPrice.fill('');

      if (!sidebarViewport) {
        await drawerApply.click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }

      // The upper bound is gone: the lower-bound-only set is back.
      await expect(resultCount).toHaveText('35 találat a szűrt feltételek szerint');
      await expect.poll(() => new URL(page.url()).searchParams.get('minPrice')).toBe('300000');
      await expect.poll(() => new URL(page.url()).searchParams.get('maxPrice')).toBeNull();

      // One chip is left and the toolbar counts it.
      await expect(appliedFilters).toBeVisible();
      await expect(appliedChips).toHaveCount(1);
      await expect(appliedChips.first()).toContainText('Min. ár: 300 000 Ft');
      await expect(page.getByTestId('applied-chip-remove-maxPrice')).toHaveCount(0);
      await expect(filterTrigger).toHaveText('Szűrők (1)');

      // The maximum field's placeholder returns to the full ceiling.
      await openDrawer();
      await expect(maxPrice).toHaveValue('');
      await expect(maxPrice).toHaveAttribute('placeholder', '1095990');
    });
  });
});
