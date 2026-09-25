// spec: specs/catalogue-filter-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px: at that width and wider the
// toolbar's `filter-trigger` is `display: none` (`.trigger` in the catalogue
// toolbar stylesheet) and the facets live in the shown `filter-sidebar` panel
// (`FilterPanel`), which applies every edit immediately and carries the
// panel's reset `filter-reset` ("Szűrők törlése"). Below it the sidebar is
// `display: none` and the trigger opens the `filter-drawer` (`FilterDrawer`),
// whose edits stay a transient draft until `drawer-apply` commits them; the
// drawer's own reset `drawer-reset` ("Szűrők törlése") sits inside the drawer
// and clears the draft's filters, applying nothing until `drawer-apply`. The
// drawer carries no search field: below 1024px the search lives in the header
// row `mobile-search-input`, which commits a term on Enter by navigating to
// `/telefonok?q=<term>`. Every step here drives the mount its viewport shows,
// so the same scenario runs at every width.
const SIDEBAR_MIN_WIDTH = 1024;

// The catalogue's own default page size: it lists one card per
// (product, storage) entry, 12 of them per page (the catalogue query module's
// `DEFAULT_PAGE_SIZE`).
const DEFAULT_PAGE_SIZE = 12;

// The counters the scenario passes through: the bare catalogue it opens on,
// the term's own 8-hit set, and the term + in-stock + 256 GB slice the
// applied filters narrow it to.
const UNFILTERED_COUNT = '55 találat a szűrt feltételek szerint';
const TERM_COUNT = '8 találat a szűrt feltételek szerint';
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
      const filterTrigger = page.getByTestId('filter-trigger');
      // Controls built on the `app-button` primitive are host elements carrying
      // the test id, so the press and the disabled state target the native
      // `button` inside them (`app-button`).
      const panelResetButton = page.getByTestId('filter-reset').getByRole('button');
      const drawerResetButton = page.getByTestId('drawer-reset').getByRole('button');
      const drawerApplyButton = page.getByTestId('drawer-apply').getByRole('button', {
        name: 'Szűrők alkalmazása',
      });

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

        // Each mount's reset is disabled while it holds no filter to clear.
        if (sidebarViewport) {
          await expect(filterSidebar).toBeVisible();
          await expect(panelResetButton).toBeDisabled();
        } else {
          // The drawer's reset lives inside the drawer the trigger opens; it
          // starts disabled because the draft is empty.
          await expect(filterTrigger).toBeVisible();
          await filterTrigger.click();
          await expect(page.getByTestId('filter-drawer')).toBeVisible();
          await expect(drawerResetButton).toBeDisabled();
          // Close the drawer so the rest of the scenario drives a clean
          // catalogue. "Mégse" discards the draft and leaves the URL untouched.
          await page.getByTestId('drawer-cancel').getByRole('button', { name: 'Mégse' }).click();
          await expect(page.getByRole('dialog')).toHaveCount(0);
        }
      });

      // 2. Apply three filters from the panel: type "honor" into `filter-search-input`, press `filter-inStock`, then press `filter-storage-256`.
      await test.step('2. Apply three filters from the panel: type "honor" into `filter-search-input`, press `filter-inStock`, then press `filter-storage-256`.', async () => {
        if (sidebarViewport) {
          const searchInput = page.getByTestId('filter-search-input');
          const inStockFacet = page.getByTestId('filter-inStock');
          const storageFacet = page.getByTestId('filter-storage-256');

          await searchInput.fill('honor');

          // The search is debounced (300 ms), so waiting for the term's own
          // 8-hit set before the facets narrow it keeps the typed term from
          // racing the two presses below.
          await expect(resultCount).toHaveText(TERM_COUNT);

          await inStockFacet.click();
          await storageFacet.click();

          // The narrow slice lands: three hits over three cards.
          await expect(resultCount).toHaveText(FILTERED_COUNT);
          await expect(cards).toHaveCount(3);

          // The address bar mirrors the three applied filters.
          await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('honor');
          await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBe('true');
          await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBe('256');

          // Three chips, one per applied filter, in the order `buildChips`
          // emits them: the term, the storage bucket, then the switch.
          const appliedFilters = page.getByTestId('applied-filters');
          const appliedChips = page.getByTestId('applied-chip');
          await expect(appliedFilters).toBeVisible();
          await expect(appliedChips).toHaveCount(3);
          await expect(appliedChips.nth(0)).toContainText('Keresés: „honor”');
          await expect(appliedChips.nth(1)).toContainText('256 GB');
          await expect(appliedChips.nth(2)).toContainText('Csak raktáron');

          // The toolbar counts the three filters and the reset has something to
          // clear, so its button is live again.
          await expect(filterTrigger).toHaveText('Szűrők (3)');
          await expect(panelResetButton).toBeEnabled();
        } else {
          // The drawer carries no search field, so the term is committed by
          // the header's `mobile-search-input` (placeholder "Keresés a
          // telefonok között…"), whose Enter navigates to
          // `/telefonok?q=<term>`. The drawer's two facets are then edited
          // and committed through `drawer-apply`.
          const mobileSearchInput = page.getByTestId('mobile-search-input');
          await mobileSearchInput.fill('honor');
          await mobileSearchInput.press('Enter');

          await expect(page).toHaveURL(/\/telefonok\?q=honor$/);

          // The search applies immediately: one chip and the term's 8-hit set.
          const appliedFilters = page.getByTestId('applied-filters');
          const appliedChips = page.getByTestId('applied-chip');
          await expect(appliedFilters).toBeVisible();
          await expect(appliedChips).toHaveCount(1);
          await expect(appliedChips.first()).toContainText('Keresés: „honor”');
          await expect(resultCount).toHaveText(TERM_COUNT);
          await expect(cards).toHaveCount(8);

          // Now drive the drawer: open it, pick the two facets, then apply.
          await filterTrigger.click();
          await expect(page.getByTestId('filter-drawer')).toBeVisible();
          const inStockFacet = page.getByTestId('drawer-inStock');
          const storageFacet = page.getByTestId('drawer-storage-256');
          await inStockFacet.click();
          await storageFacet.click();

          await drawerApplyButton.click();
          await expect(page.getByRole('dialog')).toHaveCount(0);

          // The narrow slice lands: three hits over three cards.
          await expect(resultCount).toHaveText(FILTERED_COUNT);
          await expect(cards).toHaveCount(3);

          // The address bar mirrors the three applied filters.
          await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('honor');
          await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBe('true');
          await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBe('256');

          // Three chips, in the order `buildChips` emits them: the term, the
          // storage bucket, then the switch.
          await expect(appliedFilters).toBeVisible();
          await expect(appliedChips).toHaveCount(3);
          await expect(appliedChips.nth(0)).toContainText('Keresés: „honor”');
          await expect(appliedChips.nth(1)).toContainText('256 GB');
          await expect(appliedChips.nth(2)).toContainText('Csak raktáron');

          // The toolbar counts the three filters.
          await expect(filterTrigger).toHaveText('Szűrők (3)');
        }
      });

      // 3. Type "-5" into `filter-min-price`, a range the panel refuses.
      await test.step('3. Type "-5" into `filter-min-price`, a range the panel refuses.', async () => {
        if (sidebarViewport) {
          const minPrice = page.getByTestId('filter-min-price');
          const priceError = page.getByTestId('filter-price-error');
          const appliedChips = page.getByTestId('applied-chip');

          await minPrice.fill('-5');

          // The panel's own validation (`FilterPanel.priceValidation`) names
          // the fault below the fields.
          await expect(priceError).toHaveText('A minimum ár nem lehet negatív.');

          // The refused draft applies nothing: the address bar, the three
          // chips and the counter are the applied state's.
          await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('honor');
          await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBe('true');
          await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBe('256');
          await expect(appliedChips).toHaveCount(3);
          await expect(resultCount).toHaveText(FILTERED_COUNT);
        } else {
          // The drawer's facet draft is a transient state until `drawer-apply`;
          // opening the drawer reseeds it from the URL's truth (the three
          // applied filters).
          const minPrice = page.getByTestId('drawer-min-price');
          const priceError = page.getByTestId('drawer-price-error');
          const appliedChips = page.getByTestId('applied-chip');

          await filterTrigger.click();
          await expect(page.getByTestId('filter-drawer')).toBeVisible();
          await minPrice.fill('-5');

          // The drawer's own validation (`FilterDrawer.priceValidation`) names
          // the fault on the offending input.
          await expect(priceError).toHaveText('A minimum ár nem lehet negatív.');

          // The refused draft applies nothing: the address bar, the three
          // chips and the counter are the applied state's.
          await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('honor');
          await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBe('true');
          await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBe('256');
          await expect(appliedChips).toHaveCount(3);
          await expect(resultCount).toHaveText(FILTERED_COUNT);
        }
      });

      // 4. Press the inner button of `filter-reset` ("Szűrők törlése").
      await test.step('4. Press the inner button of `filter-reset` ("Szűrők törlése").', async () => {
        if (sidebarViewport) {
          await panelResetButton.click();

          // Every filter is cleared at once: the chip row is gone and the
          // counter is back to the unfiltered set over a full page of cards.
          await expect(page.getByTestId('applied-filters')).toHaveCount(0);
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
          await expect(page.getByTestId('filter-search-input')).toHaveValue('');
          await expect(page.getByTestId('filter-inStock')).toHaveAttribute('aria-pressed', 'false');
          await expect(page.getByTestId('filter-storage-256')).toHaveAttribute(
            'aria-pressed',
            'false',
          );
          await expect(panelResetButton).toBeDisabled();

          // The refused draft goes with the filters: the field is empty and
          // the message is gone, so no stale text is left behind the cleared
          // catalogue.
          await expect(page.getByTestId('filter-min-price')).toHaveValue('');
          await expect(page.getByTestId('filter-price-error')).toHaveCount(0);
        } else {
          // The drawer's reset lives inside the still-open drawer (the refused
          // price opened it, the reset clears the draft): the drawer is open,
          // every draft control is back to its default, and nothing has been
          // committed yet.
          await drawerResetButton.click();

          await expect(page.getByTestId('filter-drawer')).toBeVisible();

          // The drawer's facets are back to their default: both unpressed,
          // the price field empty, the refusal gone.
          await expect(page.getByTestId('drawer-inStock')).toHaveAttribute('aria-pressed', 'false');
          await expect(page.getByTestId('drawer-storage-256')).toHaveAttribute(
            'aria-pressed',
            'false',
          );
          await expect(page.getByTestId('drawer-min-price')).toHaveValue('');
          await expect(page.getByTestId('drawer-price-error')).toHaveCount(0);
          // The reset is now disabled because the draft holds no filter.
          await expect(drawerResetButton).toBeDisabled();

          // Nothing has been committed yet: the address bar, the three chips
          // and the counter are the applied state's.
          await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('honor');
          await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBe('true');
          await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBe('256');
          await expect(page.getByTestId('applied-chip')).toHaveCount(3);
          await expect(resultCount).toHaveText(FILTERED_COUNT);

          // Pressing Apply commits the cleared draft with the search term
          // carried over: the drawer closes, inStock and storageGb drop out,
          // q stays, and the catalogue returns to the term's 8-hit set with
          // one chip.
          await drawerApplyButton.click();
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('honor');
          await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBeNull();
          await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBeNull();

          const appliedFilters = page.getByTestId('applied-filters');
          const appliedChips = page.getByTestId('applied-chip');
          await expect(appliedFilters).toBeVisible();
          await expect(appliedChips).toHaveCount(1);
          await expect(appliedChips.first()).toContainText('Keresés: „honor”');
          await expect(resultCount).toHaveText(TERM_COUNT);
          await expect(filterTrigger).toHaveText('Szűrők (1)');

          // Removing the term's button takes the catalogue back to the bare
          // set the wide path ends on.
          await page.getByTestId('applied-chip-remove-q').click();
          await expect(page).toHaveURL(/\/telefonok$/);
          await expect(appliedFilters).toHaveCount(0);
          await expect(resultCount).toHaveText(UNFILTERED_COUNT);
          await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);
          await expect(filterTrigger).toHaveText('Szűrők');
        }
      });
    },
  );
});
