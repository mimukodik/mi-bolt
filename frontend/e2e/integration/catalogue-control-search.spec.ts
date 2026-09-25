// spec: specs/catalogue-filter-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px: at that width and wider the
// toolbar's `filter-trigger` is `display: none` (`.trigger` in the catalogue
// toolbar stylesheet) and the facets live in the shown `filter-sidebar` panel
// (`FilterPanel`), which applies every edit immediately; below it the sidebar
// is `display: none` and the trigger opens the `filter-drawer` (`FilterDrawer`).
//
// The search control follows the same split. At 1024px and wider it is the
// panel's `filter-search-input`, whose edit is debounced and reaches the
// catalogue on the pause. Below 1024px the sidebar, and with it
// `filter-search-input`, is `display: none`, and the drawer carries no search
// field: the field the narrow mount shows is the header's `mobile-search-input`
// (`HeaderNav`, placeholder "Keresés a telefonok között…"), which commits the
// typed term on Enter as a navigation to `/telefonok?q=<term>` and ignores an
// empty term. Both mounts carry the applied term in the shared
// `applied-chip-remove-q` remove button, and the narrow mount clears the search
// through it. The panel's own reset `filter-reset` sits in the hidden sidebar
// below 1024px, so its native button is matched by tag there and by role where
// the panel is shown.
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
      // The search field the viewport shows: the panel's own at 1024px and
      // wider, the header's mobile bar below it.
      const searchInput = sidebarViewport
        ? page.getByTestId('filter-search-input')
        : page.getByTestId('mobile-search-input');
      const appliedFilters = page.getByTestId('applied-filters');
      const appliedChips = page.getByTestId('applied-chip');
      const filterTrigger = page.getByTestId('filter-trigger');
      // Controls built on the `app-button` primitive are host elements carrying
      // the test id, so the disabled state lives on the native button inside
      // them (`app-button`). At 1024px and wider that button is matched by its
      // role; below it the hidden sidebar takes it out of the accessibility
      // tree, so the narrow path matches the same button by tag and reads the
      // same state.
      const filterResetButton = sidebarViewport
        ? page.getByTestId('filter-reset').getByRole('button')
        : page.getByTestId('filter-reset').locator('button');

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

      // 2. Type "honor" into the search field the viewport shows: `filter-search-input` at 1024 px and wider, `mobile-search-input` committed with Enter below 1024 px.
      await test.step('2. Type "honor" into the search field the viewport shows: `filter-search-input` at 1024 px and wider, `mobile-search-input` committed with Enter below 1024 px.', async () => {
        if (sidebarViewport) {
          await searchInput.fill('honor');
        } else {
          // The narrow field is the header's own bar and carries no debounce:
          // it commits the term on Enter as a navigation, so the list follows
          // that commit rather than a keystroke pause.
          await expect(searchInput).toHaveAttribute('placeholder', 'Keresés a telefonok között…');
          await searchInput.fill('honor');
          await searchInput.press('Enter');
        }

        // The wide search is debounced (300 ms), so the term reaches the
        // catalogue on the pause rather than on the keystroke; the narrow
        // field reaches it on its Enter commit. The narrowed counter and the
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
        // again. The trigger is `display: none` at 1024px and wider but stays
        // in the DOM, so its own label is what is read there; below 1024px it
        // is the shown control.
        await expect(filterTrigger).toHaveText('Szűrők (1)');
        await expect(filterResetButton).toBeEnabled();
      });

      // 3. Replace the term with "motorola" the same way (type it over the current value, or clear the field and type it).
      await test.step('3. Replace the term with "motorola" the same way (type it over the current value, or clear the field and type it).', async () => {
        if (sidebarViewport) {
          await searchInput.fill('motorola');
        } else {
          await searchInput.fill('motorola');
          await searchInput.press('Enter');
        }

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

      // 4. Clear the search through the control the viewport shows: `filter-search-input` at 1024 px and wider, the `applied-chip-remove-q` button of the narrow mount below it.
      await test.step('4. Clear the search through the control the viewport shows: `filter-search-input` at 1024 px and wider, the `applied-chip-remove-q` button of the narrow mount below it.', async () => {
        if (sidebarViewport) {
          await searchInput.fill('');
        } else {
          // The narrow mount has no search field of its own to empty and the
          // drawer it opens with `filter-trigger` carries no search either, so
          // the term leaves through the chip row's own remove button.
          await page.getByTestId('applied-chip-remove-q').click();
        }

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
