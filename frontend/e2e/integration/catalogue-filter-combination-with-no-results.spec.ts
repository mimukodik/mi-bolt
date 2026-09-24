// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The sidebar filter mount takes over at 1024px (catalog-page.scss:86-102).
// Below that the catalogue hides the sidebar (catalog-page.scss:98-102) and
// serves the same facet groups in the drawer the toolbar's `filter-trigger`
// opens, committing its draft with `drawer-apply` (filter-drawer.ts:322-343).
const SIDEBAR_MIN_WIDTH = 1024;

// The loaded counter reads "<n> találat a szűrt feltételek szerint"; while the
// first response is in flight it reads "Keresés a katalógusban…", and the lead
// digit of 1-9 is what puts "n greater than 0" into the assertion.
const RESULT_COUNT_PATTERN = /^\s*[1-9]\d* találat a szűrt feltételek szerint\s*$/;

test.describe('Catalogue: browse, filter, sort and page', () => {
  test(
    'a filter combination with no results shows the empty state',
    { tag: '@integration' },
    async ({ page }) => {
      // The two mounts the plan's overview names: the sidebar carries the
      // `filter-*` controls at the full HD viewport, and the drawer the
      // `drawer-*` ones, opened by `filter-trigger` and committed by
      // `drawer-apply`.
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
      const brandGroupTestId = desktopViewport ? 'filter-group-brand' : 'drawer-group-brand';
      const brandFacetPrefix = desktopViewport ? 'filter-brand-' : 'drawer-brand-';
      const minPriceTestId = desktopViewport ? 'filter-min-price' : 'drawer-min-price';
      const maxPriceTestId = desktopViewport ? 'filter-max-price' : 'drawer-max-price';
      const priceErrorTestId = desktopViewport ? 'filter-price-error' : 'drawer-price-error';
      // The brand rows are the group's own facet buttons; the "Még több gyártó"
      // toggle carries `filter-brand-more` in both mounts (filter-panel.html:72-82,
      // filter-drawer.html:55-65), so it is excluded by name rather than by prefix.
      const brandRowSelector = `button[data-testid^="${brandFacetPrefix}"]:not([data-testid="filter-brand-more"])`;
      const brandGroup = page.getByTestId(brandGroupTestId);
      // The catalogue lists every brand, a zero count included, and disables a
      // zero-count row (filter-panel.html:52): the facet this scenario picks is
      // the first one a click can apply.
      const firstEnabledBrand = brandGroup.locator(`${brandRowSelector}:enabled`).first();
      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const appliedChip = page.getByTestId('applied-chip');

      // Read in one step, checked in later ones.
      let unfilteredTotal = 0;
      let catalogueCeiling = 0;
      let priceFloor = 0;
      let priceCeiling = 0;
      let minPriceValue = 0;

      // 1. Open /telefonok and wait for the grid. Note the number in result-count.
      await test.step('1. Open /telefonok and wait for the grid. Note the number in result-count: the loading state catalog-loading gives way to the grid, at least one product-card is rendered, and result-count reads "<n> találat a szűrt feltételek szerint" with n greater than 0. The price group\'s Max input carries the catalogue\'s own ceiling at this point, because no filter has narrowed the result set yet.', async () => {
        await page.goto('/telefonok');
        // The grid wrapper is in the template from the first render; while the
        // first response is in flight it holds the catalog-loading skeleton
        // instead of any card, so the loader's disappearance together with a
        // card appearing is what proves the response landed.
        await expect(page.getByTestId('catalog-loading')).toBeHidden();
        await expect(cards.first()).toBeVisible();
        await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
        unfilteredTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);

        // The sidebar mount is `display: none` below 1024px
        // (catalog-page.scss:98-102) but stays in the DOM, and the price inputs
        // are unconditional in its template (filter-panel.html:177-224), so its
        // Max placeholder is readable at both viewports and carries the
        // ceiling of the whole catalogue while nothing is filtered.
        const catalogueCeilingInput = page.getByTestId('filter-max-price');
        await expect(catalogueCeilingInput).toHaveAttribute('placeholder', /^\d+$/);
        catalogueCeiling = Number.parseInt(
          (await catalogueCeilingInput.getAttribute('placeholder')) ?? '0',
          10,
        );
        expect(catalogueCeiling).toBeGreaterThan(0);
      });

      // 2. Apply a manufacturer filter: activate the first ENABLED facet button of the "Gyártó" group.
      await test.step('2. Apply a manufacturer filter: activate the first ENABLED facet button of the "Gyártó" group — filter-brand-<value> in the sidebar, or drawer-brand-<value> after opening the drawer with filter-trigger at the mobile viewport: the chip row applied-filters shows one chip and the result count drops.', async () => {
        if (!desktopViewport) {
          // Below 1024px the facets exist only inside the drawer, and it is
          // `drawer-apply` that commits the draft (filter-drawer.ts:322-343).
          await page.getByTestId('filter-trigger').click();
          await expect(page.getByTestId('filter-drawer')).toBeVisible();
        }

        await expect(firstEnabledBrand).toBeVisible();
        await firstEnabledBrand.click();
        // The facet reports its own selection state (filter-panel.html:49-57).
        await expect(firstEnabledBrand).toHaveAttribute('aria-pressed', 'true');

        if (!desktopViewport) {
          await page.getByTestId('drawer-apply').getByRole('button').click();
          await expect(page.getByTestId('filter-drawer')).toBeHidden();
        }

        await expect(page.getByTestId('applied-filters')).toBeVisible();
        await expect(appliedChip).toHaveCount(1);

        // The counter keeps the unfiltered total until the filtered response
        // lands, so waiting for that text to change is what proves it arrived —
        // the read below is then not the unfiltered total.
        await expect(resultCount).not.toHaveText(
          `${String(unfilteredTotal)} találat a szűrt feltételek szerint`,
        );
        await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
        const filteredTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);
        expect(filteredTotal).toBeLessThan(unfilteredTotal);
      });

      // 3. Read the "Ár (Ft, egész szám)" group.
      await test.step('3. Read the "Ár (Ft, egész szám)" group: the "Min." input (filter-min-price, or drawer-min-price in the drawer) carries the current floor of the result set as its placeholder and the "Max." input (filter-max-price / drawer-max-price) the current ceiling: both placeholders hold digits and the ceiling is at least the floor.', async () => {
        if (!desktopViewport) {
          // The facets live in the drawer at this viewport, so it is reopened
          // to be read; the applied query is untouched until `drawer-apply`.
          await page.getByTestId('filter-trigger').click();
          await expect(page.getByTestId('filter-drawer')).toBeVisible();
        }

        const minPriceInput = page.getByTestId(minPriceTestId);
        const maxPriceInput = page.getByTestId(maxPriceTestId);
        await expect(minPriceInput).toHaveAttribute('placeholder', /^\d+$/);
        await expect(maxPriceInput).toHaveAttribute('placeholder', /^\d+$/);

        priceFloor = Number.parseInt((await minPriceInput.getAttribute('placeholder')) ?? '0', 10);
        priceCeiling = Number.parseInt(
          (await maxPriceInput.getAttribute('placeholder')) ?? '0',
          10,
        );
        expect(priceCeiling).toBeGreaterThanOrEqual(priceFloor);
      });

      // 4. Type into "Min." a value above the ceiling read in the previous step.
      await test.step('4. Type into "Min." a value above the ceiling read in the previous step: the price filter applies, the URL query string carries minPrice=<value>, an applied chip reads "Min. ár: <value> Ft", and no error message (filter-price-error) is shown, because a lone minimum is a valid range.', async () => {
        // The value has to clear every variant, not only the ceiling the panel
        // prints: the price filter matches any variant of an entry
        // (shop-mocks catalog-filter.ts:290-299) while the panel's Max
        // placeholder is the ceiling of the entries' shown variants
        // (catalog-facets.ts:148-165) — the manufacturer-filtered ceiling is
        // 699 990 and a 708 990 variant survives ceiling + 1. The catalogue's
        // own ceiling read in step 1 is the fixture's highest price, so one
        // above it matches nothing.
        minPriceValue = catalogueCeiling + 1;
        expect(minPriceValue).toBeGreaterThan(priceCeiling);

        await page.getByTestId(minPriceTestId).fill(String(minPriceValue));
        // A lone minimum is a valid range, so the validation under the group
        // stays silent (filter-panel.ts:300-311).
        await expect(page.getByTestId(priceErrorTestId)).toBeHidden();

        if (!desktopViewport) {
          // The drawer's price inputs edit its draft; `drawer-apply` is what
          // commits them to the URL (filter-drawer.ts:322-343).
          await page.getByTestId('drawer-apply').getByRole('button').click();
          await expect(page.getByTestId('filter-drawer')).toBeHidden();
        }

        await expect(page).toHaveURL(/\/telefonok(\?|$)/);
        await expect
          .poll(() => new URL(page.url()).searchParams.get('minPrice'))
          .toBe(String(minPriceValue));

        // The chip's label separates its thousands with a no-break space
        // (catalog-query.ts:360-367), so the whitespace is dropped before the
        // exact comparison rather than guessed at.
        const minPriceChipLabel = appliedChip
          .filter({ hasText: 'Min. ár:' })
          .locator('.chip__label');
        await expect(minPriceChipLabel).toHaveCount(1);
        await expect(minPriceChipLabel).toBeVisible();
        const chipText = (await minPriceChipLabel.innerText()).replace(/\s+/g, '');
        expect(chipText).toBe(`Min.ár:${String(minPriceValue)}Ft`);
      });

      // 5. Check the empty result state.
      await test.step('5. Check the empty result state: result-count reads "Nincs találat.", catalog-empty is visible with the title "Nincs a szűrőknek megfelelő készülék." and the message "Próbáld meg kevesebb szűrővel, vagy töröld az aktív szűrőket.", the empty state offers an app-button labelled "Szűrők törlése" (data-async-empty-action), and no product-card is rendered.', async () => {
        await expect(resultCount).toHaveText('Nincs találat.');

        const emptyState = page.getByTestId('catalog-empty');
        await expect(emptyState).toBeVisible();
        await expect(
          emptyState.getByText('Nincs a szűrőknek megfelelő készülék.', { exact: true }),
        ).toBeVisible();
        await expect(
          emptyState.getByText('Próbáld meg kevesebb szűrővel, vagy töröld az aktív szűrőket.', {
            exact: true,
          }),
        ).toBeVisible();

        // The action is a projected `app-button` (catalog-page.html:60-65), so
        // its host carries `data-async-empty-action` and the press targets the
        // native button inside it.
        await expect(emptyState.locator('[data-async-empty-action]')).toBeVisible();
        await expect(emptyState.getByRole('button', { name: 'Szűrők törlése' })).toBeVisible();

        await expect(cards).toHaveCount(0);
      });
    },
  );
});
