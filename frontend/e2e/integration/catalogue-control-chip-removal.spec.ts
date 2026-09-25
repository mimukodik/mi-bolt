// spec: specs/catalogue-filter-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px: at that width and wider the
// toolbar's `filter-trigger` is `display: none` (`.trigger` in the catalogue
// toolbar stylesheet) and the facets live in the shown `filter-sidebar`
// (`FilterPanel`), which applies every edit immediately; below it the sidebar
// is `display: none` and the same filters follow the `drawer-` naming
// (`drawer-brand-apple`, `drawer-storage-256`, `drawer-is5g`) inside the
// `filter-drawer` (`FilterDrawer`) that `filter-trigger` opens, where an edit
// stays a transient draft until `drawer-apply` commits it and closes the
// drawer. The chip row `applied-filters` and its `applied-chip` remove buttons
// are shared by both widths, so the removal is taken at whichever mount the
// viewport shows.
const SIDEBAR_MIN_WIDTH = 1024;

// The catalogue's own default page size: it lists one card per
// (product, storage) entry, 12 of them per page (the catalogue query module's
// `DEFAULT_PAGE_SIZE`).
const DEFAULT_PAGE_SIZE = 12;

test.describe('Catalogue: filter controls', () => {
  test(
    'removing one applied chip keeps the other filters',
    { tag: '@integration' },
    async ({ page }) => {
      const sidebarViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
      const catalogHost = page.locator('app-catalog-page');
      const resultCount = page.getByTestId('result-count');
      const cards = page.getByTestId('product-card');
      const appliedFilters = page.getByTestId('applied-filters');
      const appliedChips = page.getByTestId('applied-chip');
      const filterTrigger = page.getByTestId('filter-trigger');
      const filterDrawer = page.getByTestId('filter-drawer');
      // The three facets this viewport shows: the sidebar's own test ids at
      // 1024px and wider, the drawer's `drawer-` copies below it.
      const brandApple = page.getByTestId(
        sidebarViewport ? 'filter-brand-apple' : 'drawer-brand-apple',
      );
      const storage256 = page.getByTestId(
        sidebarViewport ? 'filter-storage-256' : 'drawer-storage-256',
      );
      const is5g = page.getByTestId(sidebarViewport ? 'filter-is5g' : 'drawer-is5g');
      const brandRemove = page.getByTestId('applied-chip-remove-brand');
      // Controls built on the `app-button` primitive are host elements carrying
      // the test id, so the press targets the native `button` inside them
      // (`app-button`).
      const drawerApply = page.getByTestId('drawer-apply').getByRole('button');

      // The counters the scenario walks through: the unfiltered catalogue, the
      // apple + 256 GB + 5G slice, and what is left once the manufacturer is
      // removed.
      const unfilteredCount = '55 találat a szűrt feltételek szerint';
      const tripleCount = '7 találat a szűrt feltételek szerint';
      const storageAnd5gCount = '27 találat a szűrt feltételek szerint';

      const facetControl = (which: 'brand' | 'storage' | 'is5g') =>
        which === 'brand' ? brandApple : which === 'storage' ? storage256 : is5g;

      // Below 1024px the facets exist only while the drawer is open, so opening
      // it is part of reading or editing them; at the sidebar width they are
      // always in the DOM and this is a no-op.
      const openDrawer = async (): Promise<void> => {
        if (sidebarViewport) return;
        if (await filterDrawer.isVisible()) return;
        await filterTrigger.click();
        await expect(filterDrawer).toBeVisible();
      };

      // Selects one facet at whichever mount the viewport shows. In the drawer
      // the press is a draft until `drawer-apply` commits it, and the apply
      // closes the drawer, so the next facet opens it again.
      const selectFacet = async (which: 'brand' | 'storage' | 'is5g'): Promise<void> => {
        await openDrawer();
        await facetControl(which).click();
        if (sidebarViewport) return;
        await drawerApply.click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
      };

      // 1. Open `/telefonok` and wait for the grid.
      await test.step('1. Open `/telefonok` and wait for the grid.', async () => {
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

        // Nothing is filtered yet: the chip row is not rendered at all and the
        // toolbar's trigger carries its bare label.
        await expect(appliedFilters).toHaveCount(0);
        await expect(filterTrigger).toHaveText('Szűrők');
      });

      // 2. Apply three filters: the manufacturer `filter-brand-apple` (below 1024 px `drawer-brand-apple`, then `drawer-apply`), the storage `filter-storage-256` (below 1024 px `drawer-storage-256`, then `drawer-apply`) and the switch `filter-is5g` (below 1024 px `drawer-is5g`, then `drawer-apply`).
      await test.step('2. Apply three filters: the manufacturer `filter-brand-apple` (below 1024 px `drawer-brand-apple`, then `drawer-apply`), the storage `filter-storage-256` (below 1024 px `drawer-storage-256`, then `drawer-apply`) and the switch `filter-is5g` (below 1024 px `drawer-is5g`, then `drawer-apply`).', async () => {
        await selectFacet('brand');
        await selectFacet('storage');
        await selectFacet('is5g');

        // The address bar carries the three applied filters.
        await expect.poll(() => new URL(page.url()).searchParams.get('brand')).toBe('apple');
        await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBe('256');
        await expect.poll(() => new URL(page.url()).searchParams.get('is5g')).toBe('true');

        // Three chips in application order, one per filter, each with its own
        // remove button (`buildChips` labels them "apple", "256 GB" and
        // "Csak 5G").
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(3);
        await expect(appliedChips.nth(0)).toContainText('apple');
        await expect(appliedChips.nth(1)).toContainText('256 GB');
        await expect(appliedChips.nth(2)).toContainText('Csak 5G');
        await expect(brandRemove).toBeVisible();
        await expect(page.getByTestId('applied-chip-remove-storage')).toBeVisible();
        await expect(page.getByTestId('applied-chip-remove-is5g')).toBeVisible();

        // The narrow slice lands: seven hits over seven cards, and the toolbar
        // counts the three filters.
        await expect(resultCount).toHaveText(tripleCount);
        await expect(cards).toHaveCount(7);
        await expect(filterTrigger).toHaveText('Szűrők (3)');
      });

      // 3. Remove the manufacturer chip with `applied-chip-remove-brand`.
      await test.step('3. Remove the manufacturer chip with `applied-chip-remove-brand`.', async () => {
        await brandRemove.click();

        // Only the manufacturer chip went: the storage and 5G chips stay in
        // order, and the row no longer carries a manufacturer remove button.
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(2);
        await expect(appliedChips.nth(0)).toContainText('256 GB');
        await expect(appliedChips.nth(1)).toContainText('Csak 5G');
        await expect(page.getByTestId('applied-chip-remove-storage')).toBeVisible();
        await expect(page.getByTestId('applied-chip-remove-is5g')).toBeVisible();
        await expect(brandRemove).toHaveCount(0);

        // The manufacturer is gone from the address bar while the other two
        // ride it.
        await expect.poll(() => new URL(page.url()).searchParams.get('brand')).toBeNull();
        await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBe('256');
        await expect.poll(() => new URL(page.url()).searchParams.get('is5g')).toBe('true');

        // The list widens back to the storage-and-5G set: 27 hits over a full
        // page of cards, with the trigger down to two counted filters.
        await expect(resultCount).toHaveText(storageAnd5gCount);
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);
        await expect(filterTrigger).toHaveText('Szűrők (2)');

        // The manufacturer control the viewport shows is released, while the
        // storage and switch controls stay pressed. The drawer's copies need
        // the drawer open, which is where the reopened drawer shows them.
        await openDrawer();
        await expect(brandApple).toHaveAttribute('aria-pressed', 'false');
        await expect(storage256).toHaveAttribute('aria-pressed', 'true');
        await expect(is5g).toHaveAttribute('aria-pressed', 'true');
      });
    },
  );
});
