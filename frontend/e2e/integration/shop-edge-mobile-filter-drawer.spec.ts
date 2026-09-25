// spec: specs/shop-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px, and this scenario runs at
// every width, driving the controls the mount in use offers. Below that width
// the toolbar's `filter-trigger` opens the `filter-drawer` (`FilterDrawer`),
// whose edits stay a transient draft until `drawer-apply` commits them
// (`FilterDrawer.applyDraft()`) and which `drawer-cancel` discards. At that
// width and wider the trigger is `display: none` (`.trigger` in the toolbar
// stylesheet) and the facets live in the shown `filter-sidebar` panel
// (`FilterPanel`), which has no draft, no cancel and no apply control: every
// valid edit is committed at once, the price fields on each input while the
// range is valid and nothing while it is refused.
const SIDEBAR_MIN_WIDTH = 1024;

test.describe('Shop: edge paths', () => {
  test(
    'the filter drawer holds its edits until they are applied, and the wide sidebar applies each edit at once',
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
      // The sidebar's own controls, driven at 1024px and wider, where the
      // drawer is not mounted.
      const sidebarStorageFacet = page.getByTestId('filter-storage-256');
      const sidebarInStockFacet = page.getByTestId('filter-inStock');
      const sidebarMinPrice = page.getByTestId('filter-min-price');
      const sidebarMaxPrice = page.getByTestId('filter-max-price');
      const sidebarPriceError = page.getByTestId('filter-price-error');
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

      // 2. Read the filter controls: press `filter-trigger` below 1024px, or read the shown `filter-sidebar` at 1024px and wider.
      await test.step('2. Read the filter controls: press `filter-trigger` below 1024px, or read the shown `filter-sidebar` at 1024px and wider.', async () => {
        if (drawerViewport) {
          await filterTrigger.click();

          // The dialog opens labelled "Szűrők" and holds the drawer form with
          // its intro paragraph.
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
        } else {
          // The shown sidebar carries the same groups, each list collapsed to
          // five entries behind its own "more" control. The "more" control of a
          // group shares the `filter-brand-` / `filter-color-` prefix, so the
          // five facets are counted without it.
          const brandGroup = filterSidebar.getByTestId('filter-group-brand');
          const brandFacets = brandGroup.locator(
            'button[data-testid^="filter-brand-"]:not([data-testid="filter-brand-more"])',
          );
          await expect(brandFacets).toHaveCount(5);
          await expect(brandGroup.getByTestId('filter-brand-more')).toHaveText('Még több gyártó');
          const colorGroup = filterSidebar.getByTestId('filter-group-color');
          const colorFacets = colorGroup.locator(
            'button[data-testid^="filter-color-"]:not([data-testid="filter-color-more"])',
          );
          await expect(colorFacets).toHaveCount(5);
          await expect(colorGroup.getByTestId('filter-color-more')).toHaveText('Még több szín');

          // The "Tárhely" group lists the whole storage enum, and the price
          // inputs start empty with the same result set's range as their
          // placeholders.
          const storageGroup = filterSidebar.getByTestId('filter-group-storage');
          const storageFacets = storageGroup.locator('button[data-testid^="filter-storage-"]');
          await expect(storageFacets).toHaveCount(3);
          await expect(page.getByTestId('filter-storage-128')).toBeVisible();
          await expect(sidebarStorageFacet).toBeVisible();
          await expect(page.getByTestId('filter-storage-512')).toBeVisible();
          await expect(sidebarInStockFacet).toBeVisible();
          await expect(sidebarMinPrice).toHaveValue('');
          await expect(sidebarMinPrice).toHaveAttribute('placeholder', '69990');
          await expect(sidebarMaxPrice).toHaveValue('');
          await expect(sidebarMaxPrice).toHaveAttribute('placeholder', '1095990');
        }
      });

      // 3. Edit: press `drawer-storage-256` and `drawer-inStock` below 1024px, or press `filter-storage-256` and `filter-inStock` at 1024px and wider.
      await test.step('3. Edit: press `drawer-storage-256` and `drawer-inStock` below 1024px, or press `filter-storage-256` and `filter-inStock` at 1024px and wider.', async () => {
        if (drawerViewport) {
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
        } else {
          // Each sidebar facet commits on the press: the address bar, the chip
          // row and the counter follow the applied query with no apply step.
          await sidebarStorageFacet.click();
          await expect(sidebarStorageFacet).toHaveAttribute('aria-pressed', 'true');
          await expect(page).toHaveURL((url: URL) => url.searchParams.get('storageGb') === '256');
          await expect(resultCount).toHaveText('27 találat a szűrt feltételek szerint');
          await expect(appliedChips).toHaveCount(1);
          await expect(appliedChips.nth(0)).toContainText('256 GB');

          await sidebarInStockFacet.click();
          await expect(sidebarInStockFacet).toHaveAttribute('aria-pressed', 'true');
          await expect(page).toHaveURL(
            (url: URL) =>
              url.searchParams.get('storageGb') === '256' &&
              url.searchParams.get('inStock') === 'true',
          );
          await expect(resultCount).toHaveText('27 találat a szűrt feltételek szerint');
          await expect(appliedChips).toHaveCount(2);
          await expect(appliedChips.nth(0)).toContainText('256 GB');
          await expect(appliedChips.nth(1)).toContainText('Csak raktáron');
        }
      });

      // 4. Discard the edit: press `drawer-cancel` below 1024px, or press `filter-storage-256` and `filter-inStock` again at 1024px and wider.
      await test.step('4. Discard the edit: press `drawer-cancel` below 1024px, or press `filter-storage-256` and `filter-inStock` again at 1024px and wider.', async () => {
        if (drawerViewport) {
          await page.getByTestId('drawer-cancel').getByRole('button', { name: 'Mégse' }).click();

          // The drawer is gone and the trigger reset.
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await expect(filterTrigger).toHaveText('Szűrők');
          await expect(filterTrigger).toHaveAttribute('aria-expanded', 'false');

          // The draft went with it: the applied state is still the bare catalogue.
          await expect(page).toHaveURL(onPlainCatalogue);
          await expect(resultCount).toHaveText(unfilteredCount);
          await expect(appliedFilters).toHaveCount(0);
        } else {
          // The sidebar has no cancel: the wide counterpart is toggling the two
          // facets off, which drops both filters from the applied query.
          await sidebarStorageFacet.click();
          await expect(sidebarStorageFacet).toHaveAttribute('aria-pressed', 'false');
          await expect(page).toHaveURL((url: URL) => url.searchParams.get('storageGb') === null);
          await sidebarInStockFacet.click();
          await expect(sidebarInStockFacet).toHaveAttribute('aria-pressed', 'false');

          // The applied state is the bare catalogue again.
          await expect(page).toHaveURL(onPlainCatalogue);
          await expect(resultCount).toHaveText(unfilteredCount);
          await expect(appliedFilters).toHaveCount(0);
        }
      });

      // 5. Type a refused range: into `drawer-min-price` / `drawer-max-price` below 1024px, or `filter-min-price` / `filter-max-price` at 1024px and wider.
      await test.step('5. Type a refused range: into `drawer-min-price` / `drawer-max-price` below 1024px, or `filter-min-price` / `filter-max-price` at 1024px and wider.', async () => {
        if (drawerViewport) {
          await filterTrigger.click();
          await expect(filterDrawer).toBeVisible();

          await minPrice.fill('900000');
          await maxPrice.fill('100');

          // The drawer's own validation (`FilterDrawer.priceValidation`) names the
          // fault on the offending input.
          await expect(priceError).toHaveText('A minimum nem lehet nagyobb a maximum árnál.');
          await expect(minPrice).toHaveAttribute('aria-invalid', 'true');
        } else {
          // The sidebar's price fields commit on each input while the range is
          // valid, so a minimum typed alone applies at once.
          await sidebarMinPrice.fill('900000');
          await expect(page).toHaveURL((url: URL) => url.searchParams.get('minPrice') === '900000');
          await expect(resultCount).toHaveText('2 találat a szűrt feltételek szerint');
          await expect(sidebarPriceError).toHaveCount(0);

          // The second field makes the range invalid, so it applies nothing and
          // `FilterPanel`'s own validation (`filter-panel.ts`) names the fault on
          // the offending input.
          await sidebarMaxPrice.fill('100');
          await expect(sidebarPriceError).toHaveText(
            'A minimum nem lehet nagyobb a maximum árnál.',
          );
          await expect(sidebarMinPrice).toHaveAttribute('aria-invalid', 'true');
          await expect(page).toHaveURL(
            (url: URL) =>
              url.searchParams.get('minPrice') === '900000' &&
              url.searchParams.get('maxPrice') === null,
          );
          await expect(resultCount).toHaveText('2 találat a szűrt feltételek szerint');
        }
      });

      // 6. Commit the range: press `drawer-apply` below 1024px, or assert the sidebar refused it at 1024px and wider.
      await test.step('6. Commit the range: press `drawer-apply` below 1024px, or assert the sidebar refused it at 1024px and wider.', async () => {
        if (drawerViewport) {
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

          // The drawer answers a refused apply by focusing the offending input:
          // `FilterDrawer.applyDraft()` calls `FilterDrawer.focusPrice('min')`,
          // which schedules the focus through `afterNextRender`, so it lands one
          // render after the press. Waiting for it here is what keeps it out of
          // step 7: until it has landed the callback is still pending, and it can
          // fire between a fill's select-all and the Delete key that fill ends
          // with, so the Delete clears `drawer-min-price` instead of
          // `drawer-max-price` and the range the step clears comes back.
          await expect(minPrice).toBeFocused();
        } else {
          // The sidebar has no apply control: it already held the refused range
          // out of the applied query, so nothing beyond step 5's measurement is
          // applied — the address bar carries no `maxPrice` — and the fault is
          // still named.
          await expect(page).toHaveURL((url: URL) => url.searchParams.get('maxPrice') === null);
          await expect(sidebarPriceError).toHaveText(
            'A minimum nem lehet nagyobb a maximum árnál.',
          );
        }
      });

      // 7. Clear the range and re-apply the two facets: press `drawer-apply` below 1024px, or let the sidebar commit at 1024px and wider.
      await test.step('7. Clear the range and re-apply the two facets: press `drawer-apply` below 1024px, or let the sidebar commit at 1024px and wider.', async () => {
        if (drawerViewport) {
          await minPrice.fill('');
          // Each fill must have emptied the input it was aimed at, read straight
          // after the fill so a lost edit is a failure here rather than a stray
          // chip two steps later.
          await expect(minPrice).toHaveValue('');
          await maxPrice.fill('');
          await expect(maxPrice).toHaveValue('');
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
        } else {
          // Clearing the minimum drops the applied range; the refused maximum
          // never entered the applied query. Clearing the maximum is confirmed
          // by the value, and the plain catalogue proves both are gone.
          await sidebarMinPrice.fill('');
          await expect(sidebarMinPrice).toHaveValue('');
          await expect(page).toHaveURL((url: URL) => url.searchParams.get('minPrice') === null);
          await sidebarMaxPrice.fill('');
          await expect(sidebarMaxPrice).toHaveValue('');
          await expect(page).toHaveURL(onPlainCatalogue);
          await expect(resultCount).toHaveText(unfilteredCount);

          // Pressing the two facets again commits them at once.
          await sidebarStorageFacet.click();
          await expect(sidebarStorageFacet).toHaveAttribute('aria-pressed', 'true');
          await sidebarInStockFacet.click();
          await expect(sidebarInStockFacet).toHaveAttribute('aria-pressed', 'true');
          await expect(sidebarPriceError).toHaveCount(0);
        }

        // The applied query is the same at every width, so the assertions the
        // narrow path makes after its apply are made here too, where the app
        // shows them: the sidebar's own two facets committed them at once.
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
