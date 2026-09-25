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
  test(
    'filtering by manufacturer narrows the catalogue',
    { tag: '@integration' },
    async ({ page }) => {
      // The two mounts the plan's overview names: the sidebar carries the
      // `filter-*` controls at the full HD viewport, and the drawer the
      // `drawer-*` ones, opened by `filter-trigger` and committed by
      // `drawer-apply`.
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
      const brandGroupTestId = desktopViewport ? 'filter-group-brand' : 'drawer-group-brand';
      const brandFacetPrefix = desktopViewport ? 'filter-brand-' : 'drawer-brand-';
      // The brand rows are the group's own facet buttons; the "Még több gyártó"
      // toggle carries `filter-brand-more` in both mounts (the filter panel and
      // drawer templates), so it is excluded by name rather than by prefix.
      const brandRowSelector = `[data-testid^="${brandFacetPrefix}"]:not([data-testid="filter-brand-more"])`;
      const brandGroup = page.getByTestId(brandGroupTestId);
      const brandFacets = brandGroup.locator(`button${brandRowSelector}`);
      // The catalogue lists every brand, a zero count included, and disables a
      // zero-count row (the `filter-brand-*` facet rows in the filter panel
      // template): the facet this scenario picks is the first one a click can
      // apply.
      const enabledBrandFacets = brandGroup.locator(`button${brandRowSelector}:enabled`);
      const firstEnabledBrand = enabledBrandFacets.first();
      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');

      // Read in one step, checked in a later one.
      let unfilteredTotal = 0;
      let listedBrandCount = 0;
      let brandValue = '';
      let brandName = '';

      // 1. Open /telefonok and wait for the grid.
      await test.step('1. Open /telefonok and wait for the grid (at least one product-card). Note the number in result-count: the loading state gives way to the grid, result-count reads "<n> találat a szűrt feltételek szerint" with n greater than 0, and the default page size renders exactly 12 product-card elements.', async () => {
        await page.goto('/telefonok');
        // The grid wrapper is in the template from the first render; while the
        // first response is in flight it holds the catalog-loading skeleton
        // instead of any card.
        await expect(page.getByTestId('catalog-loading')).toBeHidden();
        await expect(cards.first()).toBeVisible();
        await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
        unfilteredTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);
        // The default page size: `catalog-page-size` reads "12 / oldal".
        await expect(cards).toHaveCount(12);
      });

      // 2. Read the first ENABLED manufacturer facet button of the "Gyártó" group.
      await test.step('2. Read the first ENABLED manufacturer facet button of the "Gyártó" group — filter-brand-<value> in the sidebar, or drawer-brand-<value> after opening the drawer with filter-trigger at the mobile viewport: its label reads "<brand display name> (<count>)" with a count greater than 0, and a zero-count brand is disabled and is skipped.', async () => {
        if (!desktopViewport) {
          // Below 1024px the facets exist only inside the drawer.
          await page.getByTestId('filter-trigger').click();
          await expect(page.getByTestId('filter-drawer')).toBeVisible();
        }

        await expect(firstEnabledBrand).toBeVisible();
        listedBrandCount = await brandFacets.count();

        const brandTestId = (await firstEnabledBrand.getAttribute('data-testid')) ?? '';
        brandValue = brandTestId.slice(brandFacetPrefix.length);

        // The label reads "<brand display name> (<count>)" with the count in its
        // own span behind a non-breaking space (the `filter-brand-*` facet
        // button's label in the filter panel template), so the text is
        // normalised before it is split.
        const labelText = (await firstEnabledBrand.innerText()).replace(/\s+/g, ' ').trim();
        const labelMatch = /^(.+?) \((\d+)\)$/.exec(labelText);
        expect(labelMatch).not.toBeNull();
        brandName = labelMatch?.[1] ?? '';
        const brandCount = Number.parseInt(labelMatch?.[2] ?? '0', 10);
        expect(brandCount).toBeGreaterThan(0);
        await expect(firstEnabledBrand).toContainText(`${brandName} (${brandCount})`);
      });

      // 3. Activate that manufacturer filter.
      await test.step('3. Activate that manufacturer filter: the button exposes aria-pressed="true" and shows its "✓" mark, the URL query string carries brand=<value>, applied-filters appears with exactly one applied-chip whose text is the lowercased brand key and applied-chip-remove-brand is present, and the mobile trigger reports its selected count as "Szűrők (1)".', async () => {
        await firstEnabledBrand.click();

        // The facet reports its own selection state (the `filter-brand-*` facet
        // button in the filter panel template): aria-pressed flips and the check
        // mark renders inside the button. At the mobile mount the drawer is still
        // open here, because it is `drawer-apply` that commits the draft
        // (FilterDrawer.applyDraft()).
        await expect(firstEnabledBrand).toHaveAttribute('aria-pressed', 'true');
        await expect(firstEnabledBrand.locator('.check')).toHaveText('✓');

        if (!desktopViewport) {
          await page.getByTestId('drawer-apply').getByRole('button').click();
          await expect(page.getByTestId('filter-drawer')).toBeHidden();
        }

        // `brand` is the canonical query key the catalogue serialises
        // (`serializeCatalogQuery()`); the value is read from the page's own
        // query, so it is compared decoded.
        await expect(page).toHaveURL(/\/telefonok(\?|$)/);
        await expect.poll(() => new URL(page.url()).searchParams.get('brand')).toBe(brandValue);

        const appliedChip = page.getByTestId('applied-chip');
        await expect(page.getByTestId('applied-filters')).toBeVisible();
        await expect(appliedChip).toHaveCount(1);
        await expect(appliedChip.getByText(brandValue, { exact: true })).toBeVisible();
        await expect(page.getByTestId('applied-chip-remove-brand')).toBeVisible();

        if (!desktopViewport) {
          // The trigger carries the applied count beside the drawer it opens
          // (`filter-trigger` in the catalogue toolbar template); at 1024px and
          // above it is `display: none` (`.trigger` in the catalogue toolbar
          // stylesheet), so the count is read at its own mount.
          await expect(page.getByTestId('filter-trigger')).toHaveText('Szűrők (1)');
        }
      });

      // 4. Check the effect on the grid.
      await test.step('4. Check the effect on the grid: every visible product-card name starts with that brand’s display name, the result count reads "<m> találat a szűrt feltételek szerint" with m smaller than the unfiltered n, and the manufacturer facet buttons still list every brand, each with its own recalculated count.', async () => {
        // Each card carries exactly one level-3 heading, its product name
        // (the `h3.name` heading in the product card template), so the
        // flattened list is one name per card.
        const cardNames = cards.getByRole('heading', { level: 3 });

        /** Whether the card at `index` opens with the chosen brand's name. */
        const nameStartsWithBrand = async (index: number): Promise<boolean> =>
          (await cardNames.nth(index).innerText()).trim().startsWith(brandName);

        // The first card's name settling on the chosen brand is what proves the
        // filtered response has landed, so the counter below reads the filtered
        // total rather than the number the unfiltered page still showed.
        await expect.poll(() => nameStartsWithBrand(0)).toBe(true);

        const cardNameCount = await cardNames.count();
        for (let index = 0; index < cardNameCount; index += 1) {
          await expect.poll(() => nameStartsWithBrand(index)).toBe(true);
        }

        // The counter keeps the unfiltered total until the filtered response
        // lands, so waiting for that text to change is what proves it arrived.
        await expect(resultCount).not.toHaveText(
          `${String(unfilteredTotal)} találat a szűrt feltételek szerint`,
        );
        await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
        const filteredTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);
        expect(filteredTotal).toBeLessThan(unfilteredTotal);

        if (!desktopViewport) {
          // The facets live in the drawer at this viewport, so the group is
          // reopened to be read; `drawer-cancel` leaves the applied query alone.
          await page.getByTestId('filter-trigger').click();
          await expect(page.getByTestId('filter-drawer')).toBeVisible();
        }

        // The group still lists every brand, each row keeping its own count: the
        // brand facet excludes its own filter (the shop mocks'
        // `buildBrandFacet()`), so the rows do not collapse to the one the click
        // selected.
        await expect(firstEnabledBrand).toHaveAttribute('aria-pressed', 'true');
        await expect(brandFacets).toHaveCount(listedBrandCount);
        const brandFacetCount = await brandFacets.count();
        for (let index = 0; index < brandFacetCount; index += 1) {
          await expect(brandFacets.nth(index)).toContainText(/\(\d+\)/);
        }

        if (!desktopViewport) {
          await page.getByTestId('drawer-cancel').getByRole('button').click();
          await expect(page.getByTestId('filter-drawer')).toBeHidden();
        }
      });
    },
  );
});
