// spec: specs/catalogue-filter-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px: at that width and wider the
// toolbar's `filter-trigger` is `display: none` (`.trigger` in the catalogue
// toolbar stylesheet) and the facets live in the shown `filter-sidebar` panel
// (`FilterPanel`), which applies every edit immediately; below it the sidebar
// is `display: none` and the trigger opens the `filter-drawer`
// (`FilterDrawer`). The panel's reset `filter-reset` ("Szűrők törlése") exists
// only in the sidebar — the drawer carries no reset control — so this scenario
// is taken where the sidebar is shown.
const SIDEBAR_MIN_WIDTH = 1024;

// The catalogue's own default page size: it lists one card per
// (product, storage) entry, 12 of them per page (the catalogue query module's
// `DEFAULT_PAGE_SIZE`).
const DEFAULT_PAGE_SIZE = 12;

// The counters the scenario passes through: the bare catalogue it opens on and
// the term + in-stock + 256 GB slice the three panel filters narrow it to.
const UNFILTERED_COUNT = '55 találat a szűrt feltételek szerint';
const FILTERED_COUNT = '3 találat a szűrt feltételek szerint';

test.describe('Catalogue: filter controls', () => {
  test(
    "the panel's reset clears every filter at once",
    { tag: '@integration' },
    async ({ page }) => {
      const sidebarViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
      const catalogHost = page.locator('app-catalog-page');
      const resultCount = page.getByTestId('result-count');
      const cards = page.getByTestId('product-card');
      const filterSidebar = page.getByTestId('filter-sidebar');
      const searchInput = page.getByTestId('filter-search-input');
      const inStockFacet = page.getByTestId('filter-inStock');
      const storageFacet = page.getByTestId('filter-storage-256');
      const minPrice = page.getByTestId('filter-min-price');
      const priceError = page.getByTestId('filter-price-error');
      const appliedFilters = page.getByTestId('applied-filters');
      const appliedChips = page.getByTestId('applied-chip');
      const filterTrigger = page.getByTestId('filter-trigger');
      // Controls built on the `app-button` primitive are host elements carrying
      // the test id, so the press and the disabled state target the native
      // `button` inside them (`app-button`).
      const filterResetButton = page.getByTestId('filter-reset').getByRole('button');

      // 1. Open `/telefonok` and wait for the grid.
      await test.step('1. Open `/telefonok` and wait for the grid.', async () => {
        await page.goto('/telefonok');

        // The grid wrapper is in the template from the first render; while the
        // first response is in flight it holds the `catalog-loading` skeleton
        // instead of any card, so the loader's disappearance together with a
        // card appearing and the counter naming its landed text is what proves
        // the response landed.
        await expect(catalogHost).toHaveAttribute(
          'data-layout-mode',
          sidebarViewport ? 'sidebar' : 'drawer',
        );
        await expect(page.getByTestId('catalog-loading')).toBeHidden();
        await expect(cards.first()).toBeVisible();
        await expect(resultCount).toHaveText(UNFILTERED_COUNT);
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);

        // The reset lives in the sidebar the wide layout shows; with nothing
        // applied it has nothing to clear and its own button is disabled.
        if (sidebarViewport) {
          await expect(filterSidebar).toBeVisible();
          await expect(filterResetButton).toBeDisabled();
        }
      });

      // Below the 1024px breakpoint the sidebar holding `filter-reset` is not
      // mounted: the drawer the trigger opens carries no reset control, so the
      // scenario's remaining steps belong to the wide layout alone.
      test.skip(
        !sidebarViewport,
        'the reset `filter-reset` is mounted only in the 1024px-and-wider sidebar',
      );

      // 2. Apply three filters from the panel: type "honor" into `filter-search-input`, press `filter-inStock`, then press `filter-storage-256`.
      await test.step('2. Apply three filters from the panel: type "honor" into `filter-search-input`, press `filter-inStock`, then press `filter-storage-256`.', async () => {
        await searchInput.fill('honor');

        // The search is debounced (300 ms), so waiting for the term's own
        // 8-hit set before the facets narrow it keeps the typed term from
        // racing the two presses below.
        await expect(resultCount).toHaveText('8 találat a szűrt feltételek szerint');

        await inStockFacet.click();
        await storageFacet.click();

        // The narrow slice lands: three hits over three cards.
        await expect(resultCount).toHaveText(FILTERED_COUNT);
        await expect(cards).toHaveCount(3);

        // The address bar mirrors the three applied filters.
        await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('honor');
        await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBe('true');
        await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBe('256');

        // Three chips, one per applied filter, in the order `buildChips` emits
        // them: the term, the storage bucket, then the switch.
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(3);
        await expect(appliedChips.nth(0)).toContainText('Keresés: „honor”');
        await expect(appliedChips.nth(1)).toContainText('256 GB');
        await expect(appliedChips.nth(2)).toContainText('Csak raktáron');

        // The toolbar counts the three filters and the reset has something to
        // clear, so its button is live again.
        await expect(filterTrigger).toHaveText('Szűrők (3)');
        await expect(filterResetButton).toBeEnabled();
      });

      // 3. Type "-5" into `filter-min-price`, a range the panel refuses.
      await test.step('3. Type "-5" into `filter-min-price`, a range the panel refuses.', async () => {
        await minPrice.fill('-5');

        // The panel's own validation (`FilterPanel.priceValidation`) names the
        // fault below the fields.
        await expect(priceError).toHaveText('A minimum ár nem lehet negatív.');

        // The refused draft applies nothing: the address bar, the three chips
        // and the counter are the applied state's.
        await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('honor');
        await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBe('true');
        await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBe('256');
        await expect(appliedChips).toHaveCount(3);
        await expect(resultCount).toHaveText(FILTERED_COUNT);
      });

      // 4. Press the inner button of `filter-reset` ("Szűrők törlése").
      await test.step('4. Press the inner button of `filter-reset` ("Szűrők törlése").', async () => {
        await filterResetButton.click();

        // Every filter is cleared at once: the chip row is gone and the counter
        // is back to the unfiltered set over a full page of cards.
        await expect(appliedFilters).toHaveCount(0);
        await expect(resultCount).toHaveText(UNFILTERED_COUNT);
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);

        // The address bar is the bare catalogue again, carrying none of the
        // three params.
        await expect(page).toHaveURL(/\/telefonok$/);
        await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBeNull();
        await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBeNull();
        await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBeNull();

        // The toolbar is back to its bare label.
        await expect(filterTrigger).toHaveText('Szűrők');

        // The panel's own controls are back to their defaults.
        await expect(searchInput).toHaveValue('');
        await expect(inStockFacet).toHaveAttribute('aria-pressed', 'false');
        await expect(storageFacet).toHaveAttribute('aria-pressed', 'false');
        await expect(filterResetButton).toBeDisabled();

        // The refused draft goes with the filters: the field is empty and the
        // message is gone, so no stale text is left behind the cleared
        // catalogue.
        await expect(minPrice).toHaveValue('');
        await expect(priceError).toHaveCount(0);
      });
    },
  );
});
