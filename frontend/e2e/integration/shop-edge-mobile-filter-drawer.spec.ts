// spec: specs/shop-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px: at that width and wider the
// toolbar's `filter-trigger` is `display: none` (`.trigger` in the toolbar
// stylesheet) and the facets live in the shown `filter-sidebar` panel, which
// applies every edit immediately; below it the sidebar is `display: none`
// (`.sidebar` in the page's stylesheet) and the trigger opens the
// `filter-drawer` (`FilterDrawer`), whose edits stay a transient draft until
// `drawer-apply` commits them (`FilterDrawer.applyDraft()`). The drawer exists
// only in the narrow layout, so its steps are taken where `filter-trigger` is
// shown.
const SIDEBAR_MIN_WIDTH = 1024;

test.describe('Shop: edge paths', () => {
  test(
    'the mobile filter drawer keeps its edits until they are applied',
    { tag: '@integration' },
    async ({ page }) => {
      const drawerViewport = (page.viewportSize()?.width ?? 0) < SIDEBAR_MIN_WIDTH;
      const catalogHost = page.locator('app-catalog-page');
      const filterTrigger = page.getByTestId('filter-trigger');
      const filterSidebar = page.getByTestId('filter-sidebar');
      const resultCount = page.getByTestId('result-count');
      const filterDrawer = page.getByTestId('filter-drawer');
      // The dialog primitive's panel carries `role="dialog"` and the drawer's
      // label as its accessible name (`accessible-dialog.html`).
      const drawerDialog = page.getByRole('dialog', { name: 'Szűrők' });
      const storageFacet = page.getByTestId('drawer-storage-256');
      const inStockFacet = page.getByTestId('drawer-inStock');
      const minPrice = page.getByTestId('drawer-min-price');
      const maxPrice = page.getByTestId('drawer-max-price');
      const priceError = page.getByTestId('drawer-price-error');
      const appliedFilters = page.getByTestId('applied-filters');
      const appliedChips = page.getByTestId('applied-chip');
      const cards = page.getByTestId('product-card');

      // The unfiltered counter, and the state every draft change has to leave
      // untouched: the bare `/telefonok` with no query at all.
      const unfilteredCount = '55 találat a szűrt feltételek szerint';
      const onPlainCatalogue = (url: URL): boolean =>
        url.pathname === '/telefonok' && url.search === '';

      // 1. Open `/telefonok` and read the toolbar.
      await test.step('1. Open `/telefonok` and read the toolbar.', async () => {
        await page.goto('/telefonok');

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(resultCount).toHaveText(unfilteredCount);

        if (drawerViewport) {
          // Below 1024px the drawer is the mount in use: the host says so, the
          // trigger is the shown control and the sidebar is hidden.
          await expect(catalogHost).toHaveAttribute('data-layout-mode', 'drawer');
          await expect(filterTrigger).toBeVisible();
          await expect(filterTrigger).toHaveText('Szűrők');
          await expect(filterSidebar).toBeHidden();
        } else {
          // At 1024px and wider the trigger is `display: none` and the same
          // facets live in the shown sidebar, which applies every edit at once.
          await expect(catalogHost).toHaveAttribute('data-layout-mode', 'sidebar');
          await expect(filterTrigger).toBeHidden();
          await expect(filterSidebar).toBeVisible();
        }

        await expect(filterTrigger).toHaveAttribute('aria-expanded', 'false');
      });

      // The wide layout has no drawer to drive and no draft to cancel or apply:
      // its mount is the sidebar, which commits each edit on the spot, so the
      // scenario's remaining steps belong to the narrow layout alone.
      test.skip(
        !drawerViewport,
        'the filter drawer is mounted only below the 1024px sidebar breakpoint',
      );

      // 2. Press `filter-trigger`.
      await test.step('2. Press `filter-trigger`.', async () => {
        await filterTrigger.click();

        // The dialog opens labelled "Szűrők" and holds the drawer form with its
        // intro paragraph.
        await expect(drawerDialog).toBeVisible();
        await expect(filterDrawer).toBeVisible();
        await expect(filterDrawer).toContainText(
          'Állítsd be a szűrőket, majd az „Alkalmazás" gombra kattints.',
        );
        await expect(filterTrigger).toHaveAttribute('aria-expanded', 'true');

        // Both facet lists are collapsed to five entries behind their "more"
        // control: `drawer-brand-*` in the "Gyártó" group and, the same way,
        // `drawer-color-*` in the "Szín" group. The hidden sidebar carries a
        // `filter-brand-more` / `filter-color-more` of its own, so the two are
        // read inside the drawer's groups rather than page-wide.
        const brandGroup = page.getByTestId('drawer-group-brand');
        const brandFacets = brandGroup.locator('button[data-testid^="drawer-brand-"]');
        await expect(brandFacets).toHaveCount(5);
        await expect(brandGroup.getByTestId('filter-brand-more')).toHaveText('Még több gyártó');
        const colorGroup = page.getByTestId('drawer-group-color');
        const colorFacets = colorGroup.locator('button[data-testid^="drawer-color-"]');
        await expect(colorFacets).toHaveCount(5);
        await expect(colorGroup.getByTestId('filter-color-more')).toHaveText('Még több szín');

        // The "Tárhely" group lists the whole storage enum, and the price inputs
        // start empty with the unfiltered result set's range as their
        // placeholders (`priceMinHint` / `priceMaxHint`).
        const storageGroup = page.getByTestId('drawer-group-storage');
        const storageFacets = storageGroup.locator('button[data-testid^="drawer-storage-"]');
        await expect(storageFacets).toHaveCount(3);
        await expect(page.getByTestId('drawer-storage-128')).toBeVisible();
        await expect(storageFacet).toBeVisible();
        await expect(page.getByTestId('drawer-storage-512')).toBeVisible();
        await expect(minPrice).toHaveValue('');
        await expect(minPrice).toHaveAttribute('placeholder', '69990');
        await expect(maxPrice).toHaveValue('');
        await expect(maxPrice).toHaveAttribute('placeholder', '1095990');

        // The footer holds the two controls the drawer commits or discards with.
        await expect(
          page.getByTestId('drawer-cancel').getByRole('button', { name: 'Mégse' }),
        ).toBeVisible();
        await expect(
          page.getByTestId('drawer-apply').getByRole('button', { name: 'Szűrők alkalmazása' }),
        ).toBeVisible();
      });

      // 3. Edit the draft: press `drawer-storage-256` and `drawer-inStock` ("Csak raktáron").
      await test.step('3. Edit the draft: press `drawer-storage-256` and `drawer-inStock` ("Csak raktáron").', async () => {
        await storageFacet.click();
        await inStockFacet.click();

        // Each facet button reports its own draft state: `aria-pressed` flips
        // and the check span renders inside it.
        await expect(storageFacet).toHaveAttribute('aria-pressed', 'true');
        await expect(storageFacet).toContainText('✓');
        await expect(inStockFacet).toHaveAttribute('aria-pressed', 'true');
        await expect(inStockFacet).toContainText('✓');

        // Nothing is committed yet: the address bar, the counter and the chip
        // row are the applied state's, not the draft's — the drawer's edits are
        // transient.
        await expect(page).toHaveURL(onPlainCatalogue);
        await expect(resultCount).toHaveText(unfilteredCount);
        await expect(appliedFilters).toHaveCount(0);
      });

      // 4. Press `drawer-cancel` ("Mégse").
      await test.step('4. Press `drawer-cancel` ("Mégse").', async () => {
        await page.getByTestId('drawer-cancel').getByRole('button', { name: 'Mégse' }).click();

        // The drawer is gone and the trigger reset.
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(filterTrigger).toHaveText('Szűrők');
        await expect(filterTrigger).toHaveAttribute('aria-expanded', 'false');

        // The draft went with it: the applied state is still the bare catalogue.
        await expect(page).toHaveURL(onPlainCatalogue);
        await expect(resultCount).toHaveText(unfilteredCount);
        await expect(appliedFilters).toHaveCount(0);
      });

      // 5. Open the drawer again and type a range it refuses: "900000" into `drawer-min-price` and "100" into `drawer-max-price`.
      await test.step('5. Open the drawer again and type a range it refuses: "900000" into `drawer-min-price` and "100" into `drawer-max-price`.', async () => {
        await filterTrigger.click();
        await expect(filterDrawer).toBeVisible();

        await minPrice.fill('900000');
        await maxPrice.fill('100');

        // The drawer's own validation (`FilterDrawer.priceValidation`) names the
        // fault on the offending input.
        await expect(priceError).toHaveText('A minimum nem lehet nagyobb a maximum árnál.');
        await expect(minPrice).toHaveAttribute('aria-invalid', 'true');
      });

      // 6. Press `drawer-apply` ("Szűrők alkalmazása").
      await test.step('6. Press `drawer-apply` ("Szűrők alkalmazása").', async () => {
        await page
          .getByTestId('drawer-apply')
          .getByRole('button', { name: 'Szűrők alkalmazása' })
          .click();

        // The refused range blocks the commit: the drawer stays open with its
        // error, and the applied state is untouched.
        await expect(drawerDialog).toBeVisible();
        await expect(priceError).toHaveText('A minimum nem lehet nagyobb a maximum árnál.');
        await expect(page).toHaveURL(onPlainCatalogue);
        await expect(resultCount).toHaveText(unfilteredCount);
      });

      // 7. Clear `drawer-min-price` and `drawer-max-price`, select `drawer-storage-256` and `drawer-inStock` again, then press `drawer-apply`.
      await test.step('7. Clear `drawer-min-price` and `drawer-max-price`, select `drawer-storage-256` and `drawer-inStock` again, then press `drawer-apply`.', async () => {
        await minPrice.fill('');
        await maxPrice.fill('');
        await storageFacet.click();
        await inStockFacet.click();
        await expect(storageFacet).toHaveAttribute('aria-pressed', 'true');
        await expect(inStockFacet).toHaveAttribute('aria-pressed', 'true');

        await page
          .getByTestId('drawer-apply')
          .getByRole('button', { name: 'Szűrők alkalmazása' })
          .click();

        // The valid draft commits: the error and the drawer go, and the chips,
        // the trigger's count and the grid follow the applied query.
        await expect(priceError).toHaveCount(0);
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(2);
        await expect(appliedChips.nth(0)).toContainText('256 GB');
        await expect(appliedChips.nth(1)).toContainText('Csak raktáron');
        await expect(filterTrigger).toHaveText('Szűrők (2)');
        await expect(resultCount).toHaveText('27 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);

        // The address bar mirrors the applied query; the reads come after the
        // assertions above proved the new state rendered.
        await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBe('256');
        await expect.poll(() => new URL(page.url()).searchParams.get('inStock')).toBe('true');
      });
    },
  );
});
