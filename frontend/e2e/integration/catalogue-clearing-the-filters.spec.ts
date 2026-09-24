// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';
import type { Locator } from '@playwright/test';

// The sidebar filter mount takes over at 1024px (catalog-page.scss:86-102).
// Below that the catalogue hides the sidebar (catalog-page.scss:98-102) and
// serves the same facet groups in the drawer the toolbar's `filter-trigger`
// opens, committing its draft with `drawer-apply` (filter-drawer.ts:322-343).
const SIDEBAR_MIN_WIDTH = 1024;

// The loaded counter reads "<n> találat a szűrt feltételek szerint"; while the
// first response is in flight it reads "Keresés a katalógusban…", and the lead
// digit of 1-9 is what puts "n greater than 0" into the assertion.
const RESULT_COUNT_PATTERN = /^\s*[1-9]\d* találat a szűrt feltételek szerint\s*$/;

// The catalogue's own default page size: it lists one card per
// (product, storage) entry, 12 of them per page (catalog-query.ts:58-62).
const DEFAULT_PAGE_SIZE = 12;

test.describe('Catalogue: browse, filter, sort and page', () => {
  test(
    'clearing the filters restores the full catalogue',
    { tag: '@integration' },
    async ({ page }) => {
      // The two mounts the plan's overview names: the sidebar carries the
      // `filter-*` controls at the full HD viewport, and the drawer the
      // `drawer-*` ones, opened by `filter-trigger` and committed by
      // `drawer-apply`.
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
      const brandGroup = page.getByTestId(
        desktopViewport ? 'filter-group-brand' : 'drawer-group-brand',
      );
      const colorGroup = page.getByTestId(
        desktopViewport ? 'filter-group-color' : 'drawer-group-color',
      );
      const storageGroup = page.getByTestId(
        desktopViewport ? 'filter-group-storage' : 'drawer-group-storage',
      );
      const brandFacetPrefix = desktopViewport ? 'filter-brand-' : 'drawer-brand-';
      const colorFacetPrefix = desktopViewport ? 'filter-color-' : 'drawer-color-';
      const storageFacetPrefix = desktopViewport ? 'filter-storage-' : 'drawer-storage-';
      // The brand rows are the group's own facet buttons; the "Még több gyártó"
      // toggle carries `filter-brand-more` in both mounts (filter-panel.html:72-82,
      // filter-drawer.html:55-65), so it is excluded by name. The colour group's
      // "Még több szín" toggle is a plain `.more` button rather than a
      // `.color-chip`, so the chip class already keeps it out of the chip list.
      const brandRowSelector = `button[data-testid^="${brandFacetPrefix}"]:not([data-testid="filter-brand-more"])`;
      const colorChipSelector = `button.color-chip[data-testid^="${colorFacetPrefix}"]`;
      const storageFacets = storageGroup.locator(`button[data-testid^="${storageFacetPrefix}"]`);
      // The catalogue lists every brand and every colour, a zero count included,
      // and disables a zero-count row while it is unselected
      // (filter-panel.html:52, filter-panel.html:108): the facets this scenario
      // picks are the first ones a click can still apply.
      const firstEnabledBrand = brandGroup.locator(`${brandRowSelector}:enabled`).first();
      const firstEnabledColor = colorGroup.locator(`${colorChipSelector}:enabled`).first();
      const firstStorage = storageFacets.first();
      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const appliedChip = page.getByTestId('applied-chip');

      // Read in one step, checked in later ones.
      let unfilteredTotal = 0;
      let brandValue = '';
      let colorCode = '';
      let storageGb = 0;
      let filteredTotal = 0;

      /** Below 1024px the facets exist only inside the drawer. */
      const openDrawer = async (): Promise<void> => {
        if (desktopViewport) return;
        await page.getByTestId('filter-trigger').click();
        await expect(page.getByTestId('filter-drawer')).toBeVisible();
      };

      /** Close the drawer without committing its draft (`drawer-cancel`); the
       *  applied query, and therefore the URL, stays as it was. */
      const cancelDrawer = async (): Promise<void> => {
        if (desktopViewport) return;
        await page.getByTestId('drawer-cancel').getByRole('button').click();
        await expect(page.getByTestId('filter-drawer')).toBeHidden();
      };

      /** Commit the drawer's draft to the applied query (`drawer-apply`). */
      const applyDrawer = async (): Promise<void> => {
        if (desktopViewport) return;
        await page.getByTestId('drawer-apply').getByRole('button').click();
        await expect(page.getByTestId('filter-drawer')).toBeHidden();
      };

      /** Apply one facet control and return the value its own test id carries.
       *
       *  The mount decides the order: at full HD the sidebar control is already
       *  on screen, while below 1024px the drawer has to be opened first — its
       *  content is not mounted while the dialog is closed (accessible-dialog.ts:82-91)
       *  — and a facet is read only once it is there. After the click the draft
       *  is committed where the drawer carries it, and the counter is then left
       *  to settle on the filtered response: it keeps the previous total while a
       *  refresh is in flight, "Keresés a katalógusban…" being the first load's
       *  wording (catalog-toolbar.ts:53-58), so a different text is the response
       *  landing. The facet the next step picks is read from the list this
       *  filter recalculated — the same list the sidebar shows at full HD. */
      const applyFacet = async (facet: Locator, facetPrefix: string): Promise<string> => {
        const previousCountText = (await resultCount.innerText()).trim();
        await openDrawer();
        // A zero-count brand or colour is disabled while unselected
        // (filter-panel.html:52, filter-panel.html:108), so this pins the picked
        // facet as one a click can actually apply.
        await expect(facet).toBeEnabled();
        const facetTestId = (await facet.getAttribute('data-testid')) ?? '';
        const facetValue = facetTestId.slice(facetPrefix.length);
        expect(facetValue.length).toBeGreaterThan(0);
        await facet.click();
        // The facet reports its own selection state (filter-panel.html:49-57).
        await expect(facet).toHaveAttribute('aria-pressed', 'true');
        await applyDrawer();
        await expect(resultCount).not.toHaveText(previousCountText);
        return facetValue;
      };

      // 1. Open /telefonok and wait for the grid. Note the unfiltered number in result-count.
      await test.step('1. Open /telefonok and wait for the grid. Note the unfiltered number in result-count: the loading state catalog-loading gives way to the grid, result-count reads "<n> találat a szűrt feltételek szerint", and 12 cards are rendered.', async () => {
        await page.goto('/telefonok');
        // The grid wrapper is in the template from the first render; while the
        // first response is in flight it holds the catalog-loading skeleton
        // instead of any card, so the loader's disappearance together with a
        // card appearing is what proves the response landed.
        await expect(page.getByTestId('catalog-loading')).toBeHidden();
        await expect(cards.first()).toBeVisible();
        await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
        unfilteredTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);
      });

      // 2. Apply three filters in a row: the first enabled "Gyártó" facet, the first enabled "Szín" chip and the first "Tárhely" facet.
      await test.step('2. Apply three filters in a row: the first enabled "Gyártó" facet (filter-brand-* in the sidebar, drawer-brand-* in the drawer), the first enabled "Szín" chip (filter-color-* / drawer-color-*) and the first "Tárhely" facet (filter-storage-* / drawer-storage-*): applied-filters shows three applied-chip elements, the URL query string carries brand, color and storageGb, and the result count has dropped below the unfiltered number.', async () => {
        brandValue = await applyFacet(firstEnabledBrand, brandFacetPrefix);
        expect(Number.parseInt((await resultCount.innerText()).trim(), 10)).toBeLessThan(
          unfilteredTotal,
        );

        // The colour list has been recalculated for the applied brand by this
        // point, so this is the first chip a click can still apply: the chip that
        // is first for the unfiltered list can be a zero-count colour here.
        colorCode = await applyFacet(firstEnabledColor, colorFacetPrefix);

        const storageFacetValue = await applyFacet(firstStorage, storageFacetPrefix);
        storageGb = Number.parseInt(storageFacetValue, 10);
        expect(storageGb).toBeGreaterThan(0);
        filteredTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);

        await expect(page.getByTestId('applied-filters')).toBeVisible();
        await expect(appliedChip).toHaveCount(3);
        // `brand`, `color` and `storageGb` are the canonical query keys the
        // catalogue serialises (catalog-query.ts:288-297); each value is read
        // from the page's own query, so it is compared decoded.
        await expect(page).toHaveURL(/\/telefonok(\?|$)/);
        await expect.poll(() => new URL(page.url()).searchParams.get('brand')).toBe(brandValue);
        await expect.poll(() => new URL(page.url()).searchParams.get('color')).toBe(colorCode);
        await expect
          .poll(() => new URL(page.url()).searchParams.get('storageGb'))
          .toBe(String(storageGb));
        expect(filteredTotal).toBeLessThan(unfilteredTotal);
      });

      // 3. Remove the storage chip with applied-chip-remove-storage.
      await test.step('3. Remove the storage chip with applied-chip-remove-storage: the chip row shows two chips and the removed one is gone, every storage facet button reads aria-pressed="false", the URL query string no longer carries storageGb, the brand and colour filters stay applied, and the result count grows.', async () => {
        const countBeforeRemoval = (await resultCount.innerText()).trim();
        await expect(page.getByTestId('applied-chip-remove-storage')).toBeVisible();
        await page.getByTestId('applied-chip-remove-storage').click();

        await expect(appliedChip).toHaveCount(2);
        await expect(page.getByTestId('applied-chip-remove-storage')).toHaveCount(0);

        // At the mobile mount the storage facets live in the drawer, which is
        // reopened to be read and closed again without committing anything.
        if (!desktopViewport) {
          await openDrawer();
        }
        const storageFacetCount = await storageFacets.count();
        expect(storageFacetCount).toBeGreaterThan(0);
        for (let index = 0; index < storageFacetCount; index += 1) {
          await expect(storageFacets.nth(index)).toHaveAttribute('aria-pressed', 'false');
        }
        if (!desktopViewport) {
          await cancelDrawer();
        }

        // The two remaining filters are untouched by the chip's removal, so
        // their query keys stay where they were.
        await expect(page).toHaveURL(/\/telefonok(\?|$)/);
        await expect.poll(() => new URL(page.url()).searchParams.get('brand')).toBe(brandValue);
        await expect.poll(() => new URL(page.url()).searchParams.get('color')).toBe(colorCode);
        await expect(page).not.toHaveURL(/[?&]storageGb=/);

        // The counter has to move off the value it held before the removal
        // before it is read: on its own the pattern below would also match the
        // three-filter total the page still showed.
        await expect(resultCount).not.toHaveText(countBeforeRemoval);
        await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
        const grownTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);
        expect(grownTotal).toBeGreaterThan(filteredTotal);
      });

      // 4. Press applied-filters-clear ("Összes szűrő törlése").
      await test.step('4. Press applied-filters-clear ("Összes szűrő törlése"): applied-filters is no longer rendered, every facet button in every group reads aria-pressed="false", the URL carries none of q, brand, color, storageGb, minPrice, maxPrice, inStock and is5g, the result count is the unfiltered number read in step 1, and 12 cards are rendered again.', async () => {
        await expect(page.getByTestId('applied-filters-clear')).toBeVisible();
        await page.getByTestId('applied-filters-clear').click();

        // The chip row renders only while a chip is left (applied-filters.html:1),
        // so an empty row is removed from the DOM rather than hidden.
        await expect(page.getByTestId('applied-filters')).toHaveCount(0);

        // Every facet button in every group carries its own aria-pressed (the
        // brand, colour, storage and flag rows alike), so the mount's own
        // buttons are the whole list to read. At the mobile mount the drawer is
        // opened to read it.
        if (!desktopViewport) {
          await openDrawer();
        }
        const filterMount = desktopViewport
          ? page.getByTestId('filter-panel')
          : page.getByTestId('filter-drawer');
        const facetButtons = filterMount.locator('button[aria-pressed]');
        const facetButtonCount = await facetButtons.count();
        expect(facetButtonCount).toBeGreaterThan(0);
        for (let index = 0; index < facetButtonCount; index += 1) {
          await expect(facetButtons.nth(index)).toHaveAttribute('aria-pressed', 'false');
        }
        if (!desktopViewport) {
          await cancelDrawer();
        }

        // The clear writes every canonical key as an explicit removal
        // (catalog-page.ts:388-396), so none of them may survive in the URL.
        await expect(page).not.toHaveURL(
          /[?&](?:q|brand|color|storageGb|minPrice|maxPrice|inStock|is5g)=/,
        );
        await expect(resultCount).toHaveText(
          `${String(unfilteredTotal)} találat a szűrt feltételek szerint`,
        );
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);
      });

      // 5. Check the panel's own reset control with nothing filtered.
      await test.step('5. Check the panel\'s own reset control with nothing filtered: filter-reset ("Szűrők törlése") is disabled, because it clears the same state the chip row\'s "Összes szűrő törlése" clears.', async () => {
        // The control is an `app-button` host carrying the test id, so the
        // disable state lives on the native button inside it. The sidebar is
        // `display: none` below 1024px but stays in the DOM, so the same inner
        // button is read at both viewports.
        await expect(page.getByTestId('filter-reset').locator('button')).toBeDisabled();
      });
    },
  );
});
