// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The sidebar filter mount takes over at 1024px (the `.layout` grid and
// `.sidebar` in the catalogue page stylesheet). Below that the catalogue
// hides the sidebar (`.sidebar` in the catalogue page stylesheet) and serves
// the same facet groups in the drawer the toolbar's `filter-trigger` opens,
// committing its draft with `drawer-apply` (FilterDrawer.applyDraft()).
const SIDEBAR_MIN_WIDTH = 1024;

// The loaded counter reads "<n> találat a szűrt feltételek szerint"; while the
// first response is in flight it reads "Keresés a katalógusban…", and the lead
// digit of 1-9 is what puts "n greater than 0" into the assertion.
const RESULT_COUNT_PATTERN = /^\s*[1-9]\d* találat a szűrt feltételek szerint\s*$/;

test.describe('Catalogue: browse, filter, sort and page', () => {
  // CI skips this spec (@ci-skip, BOLT-7): the colour filter narrows the catalogue; it runs locally.
  test(
    'filtering by colour narrows the catalogue',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      // The two mounts the plan's overview names: the sidebar carries the
      // `filter-*` controls at the full HD viewport, and the drawer the
      // `drawer-*` ones, opened by `filter-trigger` and committed by
      // `drawer-apply`.
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
      const colorGroupTestId = desktopViewport ? 'filter-group-color' : 'drawer-group-color';
      const colorFacetPrefix = desktopViewport ? 'filter-color-' : 'drawer-color-';
      // The colour rows are the group's own chips. The "Még több szín" toggle
      // carries `filter-color-more` in both mounts (the filter panel and drawer
      // templates) and is a plain `.more` button rather than a `.color-chip`, so
      // the chip class is what keeps it out of the facet list.
      const colorChipSelector = `button.color-chip[data-testid^="${colorFacetPrefix}"]`;
      const colorGroup = page.getByTestId(colorGroupTestId);
      const colorChips = colorGroup.locator(colorChipSelector);
      // The group lists every colour the catalogue holds, a zero count
      // included, and disables a zero-count chip while it is unselected
      // (the `filter-color-*` chips in the filter panel template): the chip this
      // scenario picks is the first one a click can apply.
      const firstEnabledColor = colorGroup.locator(`${colorChipSelector}:enabled`).first();
      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');

      // Read in one step, checked in a later one.
      let unfilteredTotal = 0;
      let colorCode = '';
      let colorName = '';

      // 1. Open /telefonok and wait for the grid. Note the number in result-count.
      await test.step('1. Open /telefonok and wait for the grid. Note the number in result-count: the loading state catalog-loading gives way to the grid, the grid holds at least one product-card, and result-count reads "<n> találat a szűrt feltételek szerint" with n greater than 0.', async () => {
        await page.goto('/telefonok');
        // The grid wrapper is in the template from the first render; while the
        // first response is in flight it holds the catalog-loading skeleton
        // instead of any card, so the loader's disappearance together with a
        // card appearing is what proves the response landed.
        await expect(page.getByTestId('catalog-loading')).toBeHidden();
        await expect(cards.first()).toBeVisible();
        await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
        unfilteredTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);
      });

      // 2. Read the first ENABLED colour chip of the "Szín" group.
      await test.step('2. Read the first ENABLED colour chip of the "Szín" group — filter-color-<code> in the sidebar, or drawer-color-<code> after opening the drawer with filter-trigger at the mobile viewport: its label reads "<colour display name> (<count>)" with a count greater than 0 and a colour swatch beside it, and the chip is enabled.', async () => {
        if (!desktopViewport) {
          // Below 1024px the facets exist only inside the drawer.
          await page.getByTestId('filter-trigger').click();
          await expect(page.getByTestId('filter-drawer')).toBeVisible();
        }

        await expect(firstEnabledColor).toBeVisible();
        // A colour whose count is 0 while unselected is disabled and skipped by
        // the `:enabled` filter above; this pins the picked chip as a usable one.
        await expect(firstEnabledColor).toBeEnabled();

        const colorTestId = (await firstEnabledColor.getAttribute('data-testid')) ?? '';
        colorCode = colorTestId.slice(colorFacetPrefix.length);

        // The label reads "<colour display name> (<count>)" with the count in
        // its own span behind a non-breaking space (the `filter-color-*` chip's
        // label in the filter panel template), so the text is normalised before
        // it is split.
        const labelText = (await firstEnabledColor.innerText()).replace(/\s+/g, ' ').trim();
        const labelMatch = /^(.+?) \((\d+)\)$/.exec(labelText);
        expect(labelMatch).not.toBeNull();
        colorName = labelMatch?.[1] ?? '';
        const colorCount = Number.parseInt(labelMatch?.[2] ?? '0', 10);
        expect(colorCount).toBeGreaterThan(0);
        await expect(firstEnabledColor).toContainText(`${colorName} (${colorCount})`);

        // The swatch sits beside the label in its own span and carries the
        // colour's own hex (`color-chip__swatch` in the filter panel template) —
        // the marker the selection state below is read against.
        await expect(firstEnabledColor.locator('.color-chip__swatch')).toBeVisible();

        // Every chip the group renders keeps its own count beside the name.
        const chipCount = await colorChips.count();
        for (let index = 0; index < chipCount; index += 1) {
          await expect(colorChips.nth(index)).toContainText(/\(\d+\)$/);
        }
      });

      // 3. Activate that colour filter.
      await test.step('3. Activate that colour filter: the chip exposes aria-pressed="true" and its swatch carries the selection state, the URL query string carries color=<code>, and the applied chip reads the colour\'s display NAME with applied-chip-remove-color beside it.', async () => {
        await firstEnabledColor.click();

        // The chip reports its own selection state (the `filter-color-*` chip in
        // the filter panel template): aria-pressed flips, the chip takes
        // `is-selected` and the swatch inside it is the colour's own marker. At
        // the mobile mount the drawer is still open here, because it is
        // `drawer-apply` that commits the draft (FilterDrawer.applyDraft()).
        await expect(firstEnabledColor).toHaveAttribute('aria-pressed', 'true');
        await expect(firstEnabledColor).toHaveClass(/(^|\s)is-selected(\s|$)/);
        await expect(firstEnabledColor.locator('.color-chip__swatch')).toBeVisible();

        if (!desktopViewport) {
          await page.getByTestId('drawer-apply').getByRole('button').click();
          await expect(page.getByTestId('filter-drawer')).toBeHidden();
        }

        // `color` is the canonical query key the catalogue serialises
        // (`serializeCatalogQuery()`); the value is read from the page's own
        // query, so it is compared decoded.
        await expect(page).toHaveURL(/\/telefonok(\?|$)/);
        await expect.poll(() => new URL(page.url()).searchParams.get('color')).toBe(colorCode);

        const appliedChip = page.getByTestId('applied-chip');
        await expect(page.getByTestId('applied-filters')).toBeVisible();
        await expect(appliedChip).toHaveCount(1);
        // The page swaps the URL's colour code for the matching facet label
        // (`CatalogPage.appliedChips`), so the chip reads the display name
        // rather than the code the query carries.
        await expect(appliedChip.getByText(colorName, { exact: true })).toBeVisible();
        await expect(page.getByTestId('applied-chip-remove-color')).toBeVisible();
      });

      // 4. Check the grid.
      await test.step('4. Check the grid: every visible product-card variant line shows that colour name, and the result count reads "<m> találat a szűrt feltételek szerint" with m smaller than the unfiltered n.', async () => {
        // Each card carries one variant line naming the shown variant's colour
        // and its storage (the `p.variant` line in the product card template),
        // and the catalogue picks the displayed variant from the active colour
        // filter (the shop mocks' `pickDisplayedVariant()`), so the first card
        // settling on the chosen colour is what proves the filtered response has
        // landed — and the counter below then reads the filtered total, not the
        // one the unfiltered page still showed.
        const variantColors = cards.locator('.variant__color');
        await expect(variantColors.first()).toHaveText(colorName);

        const variantColorCount = await variantColors.count();
        for (let index = 0; index < variantColorCount; index += 1) {
          await expect(variantColors.nth(index)).toHaveText(colorName);
        }

        // The counter keeps the unfiltered total until the filtered response
        // lands, so waiting for that text to change is what proves it arrived.
        await expect(resultCount).not.toHaveText(
          `${String(unfilteredTotal)} találat a szűrt feltételek szerint`,
        );
        await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
        const filteredTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);
        expect(filteredTotal).toBeLessThan(unfilteredTotal);
      });
    },
  );
});
