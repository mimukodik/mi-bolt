// spec: specs/catalogue-filter-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px: at that width and wider the
// toolbar's `filter-trigger` is `display: none` (`.trigger` in the catalogue
// toolbar stylesheet) and the facets live in the shown `filter-sidebar` panel
// (`FilterPanel`), which applies every edit immediately; below it the sidebar
// is `display: none` and the trigger opens the `filter-drawer`
// (`FilterDrawer`). The panel's search field `filter-search-input` exists only
// in the sidebar — the drawer carries no search field — so this scenario is
// taken where the sidebar is shown.
const SIDEBAR_MIN_WIDTH = 1024;

// The catalogue's own default page size: it lists one card per
// (product, storage) entry, 12 of them per page (the catalogue query module's
// `DEFAULT_PAGE_SIZE`).
const DEFAULT_PAGE_SIZE = 12;

test.describe('Catalogue: filter controls', () => {
  test(
    'typing a search term narrows the list and clearing it restores the catalogue',
    { tag: '@integration' },
    async ({ page }) => {
      const sidebarViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
      const catalogHost = page.locator('app-catalog-page');
      const resultCount = page.getByTestId('result-count');
      const cards = page.getByTestId('product-card');
      const searchInput = page.getByTestId('filter-search-input');
      const appliedFilters = page.getByTestId('applied-filters');
      const appliedChips = page.getByTestId('applied-chip');
      const filterTrigger = page.getByTestId('filter-trigger');
      // Controls built on the `app-button` primitive are host elements carrying
      // the test id, so the disabled state lives on the native button inside
      // them (`app-button`).
      const filterResetButton = page.getByTestId('filter-reset').getByRole('button');

      // The unfiltered counter, and the state the cleared search returns to.
      const unfilteredCount = '55 találat a szűrt feltételek szerint';

      // 1. Open `/telefonok` and wait for the grid: `result-count` names a number and at least one `product-card` is rendered.
      await test.step('1. Open `/telefonok` and wait for the grid: `result-count` names a number and at least one `product-card` is rendered.', async () => {
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
      });

      // Below the 1024px breakpoint the search field is not mounted at all: the
      // sidebar panel holding `filter-search-input` is the wide layout's mount,
      // and the drawer the trigger opens carries no search field, so the
      // scenario's remaining steps belong to the wide layout alone.
      test.skip(
        !sidebarViewport,
        'the search field `filter-search-input` is mounted only in the 1024px-and-wider sidebar',
      );

      // 2. Type "honor" into `filter-search-input`.
      await test.step('2. Type "honor" into `filter-search-input`.', async () => {
        await searchInput.fill('honor');

        // The search is debounced (300 ms), so the term reaches the catalogue on
        // the pause rather than on the keystroke: the narrowed counter and the
        // eight cards are what prove the query fired.
        await expect(resultCount).toHaveText('8 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(8);

        // The applied state now carries the term in the address bar, in one
        // chip whose remove button is `applied-chip-remove-q` (`buildChips`
        // labels it "Keresés: „<term>”"), while the field keeps the typed text.
        await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('honor');
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(1);
        await expect(appliedChips.first()).toContainText('Keresés: „honor”');
        await expect(page.getByTestId('applied-chip-remove-q')).toBeVisible();
        await expect(searchInput).toHaveValue('honor');

        // The toolbar counts the applied filter and the panel's reset is live
        // again. The trigger is `display: none` at this width but stays in the
        // DOM, so its own label is what is read.
        await expect(filterTrigger).toHaveText('Szűrők (1)');
        await expect(filterResetButton).toBeEnabled();
      });

      // 3. Replace the term with "motorola" (type it over the current value, or clear the field and type it).
      await test.step('3. Replace the term with "motorola" (type it over the current value, or clear the field and type it).', async () => {
        await searchInput.fill('motorola');

        // The list narrows to the single matching card, and the term is
        // replaced rather than added to: the chip and the address bar carry
        // "motorola" alone.
        await expect(resultCount).toHaveText('1 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(1);
        await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('motorola');
        await expect(appliedChips).toHaveCount(1);
        await expect(appliedChips.first()).toContainText('Keresés: „motorola”');
        await expect(searchInput).toHaveValue('motorola');
      });

      // 4. Clear `filter-search-input`.
      await test.step('4. Clear `filter-search-input`.', async () => {
        await searchInput.fill('');

        // The full catalogue is back and the address bar dropped the term
        // altogether.
        await expect(resultCount).toHaveText(unfilteredCount);
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);
        await expect(page).toHaveURL(/\/telefonok$/);
        await expect(page).not.toHaveURL(/[?&]q=/);

        // With no filter left the chip row is removed from the DOM (the `@if`
        // chip guard in the applied-filters template), the trigger is back to
        // its bare label and the panel's reset is disabled again.
        await expect(appliedFilters).toHaveCount(0);
        await expect(filterTrigger).toHaveText('Szűrők');
        await expect(filterResetButton).toBeDisabled();
      });
    },
  );
});
