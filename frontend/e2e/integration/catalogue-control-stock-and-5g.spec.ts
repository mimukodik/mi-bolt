// spec: specs/catalogue-filter-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px: at that width and wider the
// toolbar's `filter-trigger` is `display: none` (`.trigger` in the catalogue
// toolbar stylesheet) and the two switches are the shown `filter-inStock` /
// `filter-is5g` facets in the sidebar panel (`FilterPanel`), which applies
// every edit immediately; below it the sidebar is `display: none` and the same
// switches follow the `drawer-` naming (`drawer-inStock` / `drawer-is5g`)
// inside the `filter-drawer` (`FilterDrawer`) that `filter-trigger` opens,
// where an edit stays a transient draft until `drawer-apply` commits it and
// closes the drawer. A drawer control is in the DOM only while the drawer is
// open, so a switch set there is one open, one press and one apply.
const SIDEBAR_MIN_WIDTH = 1024;

// The catalogue's own default page size: it lists one card per
// (product, storage) entry, 12 of them per page (the catalogue query module's
// `DEFAULT_PAGE_SIZE`).
const DEFAULT_PAGE_SIZE = 12;

test.describe('Catalogue: filter controls', () => {
  test(
    'the in-stock and 5G switches filter the list',
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
      // The switch pair this viewport shows: the sidebar's own at 1024px and
      // wider, the drawer's copies below it.
      const inStock = page.getByTestId(sidebarViewport ? 'filter-inStock' : 'drawer-inStock');
      const is5g = page.getByTestId(sidebarViewport ? 'filter-is5g' : 'drawer-is5g');
      // Controls built on the `app-button` primitive are host elements carrying
      // the test id, so the press targets the native `button` inside them
      // (`app-button`).
      const drawerApply = page.getByTestId('drawer-apply').getByRole('button');

      // The counters the scenario walks through: the unfiltered catalogue, and
      // the same set with "Csak raktáron" alone on — every fixture entry is in
      // stock, so that switch on its own narrows nothing.
      const unfilteredCount = '55 találat a szűrt feltételek szerint';
      const fiveGCount = '54 találat a szűrt feltételek szerint';

      const switchControl = (which: 'inStock' | 'is5g') => (which === 'inStock' ? inStock : is5g);

      // Below 1024px the switches exist only while the drawer is open, so
      // opening it is part of reading or editing them; at the sidebar width
      // they are always in the DOM and this is a no-op.
      const openDrawer = async (): Promise<void> => {
        if (sidebarViewport) return;
        if (await filterDrawer.isVisible()) return;
        await filterTrigger.click();
        await expect(filterDrawer).toBeVisible();
      };

      // Presses one switch at whichever mount the viewport shows. In the drawer
      // the press is a draft until Apply commits it, and the apply closes the
      // drawer, so the next switch opens it again.
      const toggleSwitch = async (which: 'inStock' | 'is5g'): Promise<void> => {
        await openDrawer();
        await switchControl(which).click();
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

        // Both switches are reachable at this width, each carrying its own
        // starting count; the drawer's copies need the drawer open.
        await openDrawer();
        await expect(inStock).toHaveText('Csak raktáron (55)');
        await expect(is5g).toHaveText('Csak 5G (54)');
      });

      // 2. Switch "Csak raktáron" on: press `filter-inStock` in the sidebar, or `drawer-inStock` then `drawer-apply` in the drawer.
      await test.step('2. Switch "Csak raktáron" on: press `filter-inStock` in the sidebar, or `drawer-inStock` then `drawer-apply` in the drawer.', async () => {
        await toggleSwitch('inStock');

        // The applied state carries the flag in the address bar and in one chip
        // whose remove button is `applied-chip-remove-inStock` (`buildChips`
        // labels it "Csak raktáron").
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(1);
        await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBe('true');
        await expect(appliedChips.first()).toContainText('Csak raktáron');
        await expect(page.getByTestId('applied-chip-remove-inStock')).toBeVisible();

        // Every entry of the fixture is in stock, so this switch on its own
        // narrows nothing: the counter and the full page of cards stay as they
        // were.
        await expect(resultCount).toHaveText(unfilteredCount);
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);

        // The toolbar counts the applied filter.
        await expect(filterTrigger).toHaveText('Szűrők (1)');

        // The switch reports its own applied state with the pressed attribute
        // and its check mark.
        await openDrawer();
        await expect(inStock).toHaveAttribute('aria-pressed', 'true');
        await expect(inStock).toContainText('✓');
      });

      // 3. Switch "Csak 5G" on as well (`filter-is5g`, or `drawer-is5g` then `drawer-apply`).
      await test.step('3. Switch "Csak 5G" on as well (`filter-is5g`, or `drawer-is5g` then `drawer-apply`).', async () => {
        await toggleSwitch('is5g');

        // The 5G subset lands: 54 hits over a full page of cards, with both
        // flags riding the address bar.
        await expect(resultCount).toHaveText(fiveGCount);
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);
        await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBe('true');
        await expect.poll(() => new URL(page.url()).searchParams.get('is5g')).toBe('true');

        // Two chips, one per switch, and the toolbar counts both.
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(2);
        await expect(appliedChips.nth(0)).toContainText('Csak raktáron');
        await expect(appliedChips.nth(1)).toContainText('Csak 5G');
        await expect(filterTrigger).toHaveText('Szűrők (2)');

        // Both switches report pressed and their own labels follow the applied
        // state: with 5G on, the in-stock facet is down to the 54 5G entries.
        await openDrawer();
        await expect(inStock).toHaveAttribute('aria-pressed', 'true');
        await expect(is5g).toHaveAttribute('aria-pressed', 'true');
        await expect(inStock).toContainText('Csak raktáron (54)');
        await expect(is5g).toContainText('Csak 5G (54)');
      });

      // 4. Switch "Csak 5G" off again (`filter-is5g`, or `drawer-is5g` then `drawer-apply`).
      await test.step('4. Switch "Csak 5G" off again (`filter-is5g`, or `drawer-is5g` then `drawer-apply`).', async () => {
        await toggleSwitch('is5g');

        // The 5G switch is released: the catalogue is back to the in-stock set
        // alone, 55 hits, and the flag is gone from the address bar while
        // `inStock` stays.
        await expect(resultCount).toHaveText(unfilteredCount);
        await expect.poll(() => new URL(page.url()).searchParams.get('is5g')).toBeNull();
        await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBe('true');

        // The "Csak 5G" chip is gone and "Csak raktáron" stays, so one chip and
        // one counted filter are left.
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(1);
        await expect(appliedChips.first()).toContainText('Csak raktáron');
        await expect(page.getByTestId('applied-chip-remove-is5g')).toHaveCount(0);
        await expect(filterTrigger).toHaveText('Szűrők (1)');

        // The released switch lost its check mark, while the in-stock one stays
        // pressed.
        await openDrawer();
        await expect(is5g).toHaveAttribute('aria-pressed', 'false');
        await expect(is5g).toHaveText('Csak 5G (54)');
        await expect(inStock).toHaveAttribute('aria-pressed', 'true');
      });

      // 5. Switch "Csak raktáron" off too (`filter-inStock`, or `drawer-inStock` then `drawer-apply`).
      await test.step('5. Switch "Csak raktáron" off too (`filter-inStock`, or `drawer-inStock` then `drawer-apply`).', async () => {
        await toggleSwitch('inStock');

        // Nothing is applied any more: the bare `/telefonok` again, the chip
        // row no longer rendered and the trigger back to its bare label.
        await expect(resultCount).toHaveText(unfilteredCount);
        await expect(page).toHaveURL(/\/telefonok$/);
        await expect(page).not.toHaveURL(/[?&]inStock=/);
        await expect(appliedFilters).toHaveCount(0);
        await expect(filterTrigger).toHaveText('Szűrők');

        // Both switches read released.
        await openDrawer();
        await expect(inStock).toHaveAttribute('aria-pressed', 'false');
        await expect(is5g).toHaveAttribute('aria-pressed', 'false');
      });
    },
  );
});
