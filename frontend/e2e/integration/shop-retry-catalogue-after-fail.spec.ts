// spec: specs/shop-retry-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px: at that width and wider the
// facets live in the shown `filter-sidebar` (`filter-*` test ids) and the
// toolbar's `filter-trigger` is `display: none`; below it the sidebar is
// `display: none` and `filter-trigger` opens the `filter-drawer`, whose facets
// carry `drawer-*` test ids and whose edits stay a draft until `drawer-apply`
// commits them (`FilterDrawer.applyDraft()`). The plan's storage-facet checks
// name both mounts, so the scenario reads whichever one the viewport shows.
const SIDEBAR_MIN_WIDTH = 1024;

test.describe('Shop: retry after one failure', () => {
  // CI skips this spec (@ci-skip, BOLT-7): the filtered catalogue comes back after one failed load; it runs locally.
  test(
    '[E030] the filtered catalogue comes back after one failed load',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
      const pageTitle = page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' });
      const resultCount = page.getByTestId('result-count');
      const catalogError = page.getByTestId('catalog-error');
      const catalogErrorState = catalogError.getByRole('alert');
      // The catalogue's error state carries no `retry-button` test id of its
      // own, so its retry is named as that state's own button by its copy.
      const catalogRetry = catalogError.getByRole('button', { name: 'Újrapróbálom' });
      const cards = page.getByTestId('product-card');
      const filterTrigger = page.getByTestId('filter-trigger');
      const filterDrawer = page.getByTestId('filter-drawer');
      const appliedFilters = page.getByTestId('applied-filters');
      const appliedChips = page.getByTestId('applied-chip');
      // The storage facet lives in the sidebar at 1024px and wider and in the
      // drawer the trigger opens below it.
      const storageFacet = page.getByTestId(
        desktopViewport ? 'filter-storage-256' : 'drawer-storage-256',
      );
      // The failed load's counter; the filtered total replaces it once the
      // retried request lands.
      const errorCountText = 'A katalógus betöltése nem sikerült.';
      const recoveredCountText = '27 találat a szűrt feltételek szerint';
      // The 12 prices the filtered first page renders, in grid order, as the
      // "Egyszeri készülékár" `price-amount` prints them; `toHaveText`
      // normalises the non-breaking space the amount uses between the
      // thousands. Every value is non-zero, so no card is priced at zero.
      const firstPagePrices = [
        '89 990',
        '599 990',
        '549 990',
        '372 990',
        '319 990',
        '235 990',
        '471 990',
        '566 990',
        '457 990',
        '103 990',
        '167 989',
        '561 990',
      ];

      await test.step('1. Open the catalogue with one filter already in the address and the once-only product-list fault on the first load: `/telefonok` with `?storageGb=256&mi-scenario=fail-once-products`, and wait for the error state. - expect: The `h1` reads "Mobiltelefonok". - expect: `result-count` reads exactly "A katalógus betöltése nem sikerült.". - expect: `catalog-error` holds `error-state` with role `alert`, titled "Nem sikerült betölteni a katalógust.", with the message "Ismeretlen hiba a katalógus betöltése közben." and a button reading "Újrapróbálom" (the catalogue\'s error state carries no `retry-button` test id of its own). - expect: No `product-card` is rendered. - expect: The filter the address names is preserved: the address still carries `storageGb=256`, `applied-filters` shows one `applied-chip` reading "256 GB" with `applied-chip-remove-storage`, and `filter-trigger` reads "Szűrők (1)". - expect: The storage facet is still selected where the viewport shows it: `filter-storage-256` carries `aria-pressed="true"` at 1024 px and wider, and `drawer-storage-256` does after opening the drawer with `filter-trigger` below 1024 px.', async () => {
        await page.goto('/telefonok?storageGb=256&mi-scenario=fail-once-products');

        await expect(pageTitle).toHaveText('Mobiltelefonok');
        await expect(resultCount).toHaveText(errorCountText);

        // The catalogue's own error branch wraps the shared `ErrorState`, whose
        // role is alert and whose copy is the catalogue's own, so the 503
        // Problem's own text never reaches the page.
        await expect(catalogErrorState).toBeVisible();
        await expect(catalogErrorState.getByRole('heading', { level: 2 })).toHaveText(
          'Nem sikerült betölteni a katalógust.',
        );
        await expect(
          catalogErrorState.getByText('Ismeretlen hiba a katalógus betöltése közben.', {
            exact: true,
          }),
        ).toBeVisible();
        await expect(catalogRetry).toHaveText('Újrapróbálom');

        // The error branch replaces the whole grid, so no card is on screen
        // while the list fails.
        await expect(cards).toHaveCount(0);

        // The filter the address named survives the failed response: the URL
        // keeps both query keys, and the chip row and the trigger count render
        // the applied filter rather than the missing list.
        await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBe('256');
        await expect
          .poll(() => new URL(page.url()).searchParams.get('mi-scenario'))
          .toBe('fail-once-products');
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(1);
        await expect(appliedChips.getByText('256 GB', { exact: true })).toBeVisible();
        await expect(page.getByTestId('applied-chip-remove-storage')).toBeVisible();
        await expect(filterTrigger).toHaveText('Szűrők (1)');

        if (desktopViewport) {
          // At 1024px and wider the sidebar is the mount in use and its facet
          // reports the applied selection itself.
          await expect(page.getByTestId('filter-sidebar')).toBeVisible();
          await expect(storageFacet).toBeVisible();
          await expect(storageFacet).toHaveAttribute('aria-pressed', 'true');
        } else {
          // Below 1024px the facet exists only inside the drawer, so the
          // trigger opens it; `drawer-cancel` leaves the applied query alone.
          await expect(page.getByTestId('filter-sidebar')).toBeHidden();
          await filterTrigger.click();
          await expect(filterDrawer).toBeVisible();
          await expect(storageFacet).toHaveAttribute('aria-pressed', 'true');
          // Close the drawer again, so the retry below reaches the catalogue's
          // error state rather than the open dialog.
          await page.getByTestId('drawer-cancel').getByRole('button').click();
          await expect(filterDrawer).toBeHidden();
        }
      });

      await test.step('2. Press the "Újrapróbálom" button inside `catalog-error`\'s `error-state`. - expect: The list re-requests and recovers: `error-state` is gone from the page and `result-count` reads "27 találat a szűrt feltételek szerint". - expect: 12 `product-card` elements are rendered. - expect: Every visible card matches the filter: each card\'s variant line ends with "256 GB". - expect: Every visible card\'s "Egyszeri készülékár" `price-amount` is a non-zero number; the first page\'s values are "89 990", "599 990", "549 990", "372 990", "319 990", "235 990", "471 990", "566 990", "457 990", "103 990", "167 989", "561 990", so no card is priced at zero. - expect: The filter is unchanged: the address still carries `storageGb=256` and `mi-scenario=fail-once-products`, the `applied-chip` still reads "256 GB", `filter-trigger` still reads "Szűrők (1)", and the storage facet still carries `aria-pressed="true"` where the viewport shows it.', async () => {
        await catalogRetry.click();

        // The once-only fault fires once per handler list and a retry inside
        // the page builds no new list, so the re-issued request succeeds and
        // the error state goes with it. The counter keeps the error text until
        // the retried response lands.
        await expect(page.getByTestId('error-state')).toHaveCount(0);
        await expect(resultCount).toHaveText(recoveredCountText);
        await expect(cards).toHaveCount(12);

        for (let index = 0; index < firstPagePrices.length; index += 1) {
          const card = cards.nth(index);

          // The catalogue filtered its items by `storageGb`, so every card's
          // variant line ends on the chosen bucket (the `p.variant` line in
          // `product-card.html`, whose trailing `.variant__storage` span is the
          // storage size).
          await expect(card.locator('p.variant')).toHaveText(/256 GB$/);

          // Each card prices itself under the "Egyszeri készülékár" label with
          // a non-zero amount; all 12 are asserted, so no card is priced at
          // zero.
          const priceBlock = card.locator('app-price-block');
          await expect(priceBlock).toContainText('Egyszeri készülékár');
          await expect(priceBlock.getByTestId('price-amount')).toHaveText(firstPagePrices[index]);
        }

        // The retry kept the filter: the address, the chip and the trigger
        // count are the applied query's.
        await expect.poll(() => new URL(page.url()).searchParams.get('storageGb')).toBe('256');
        await expect
          .poll(() => new URL(page.url()).searchParams.get('mi-scenario'))
          .toBe('fail-once-products');
        await expect(appliedChips).toHaveCount(1);
        await expect(appliedChips.getByText('256 GB', { exact: true })).toBeVisible();
        await expect(filterTrigger).toHaveText('Szűrők (1)');

        if (desktopViewport) {
          await expect(storageFacet).toHaveAttribute('aria-pressed', 'true');
        } else {
          // The facets live in the drawer at this viewport, so it is reopened
          // to be read; `drawer-cancel` leaves the applied query alone.
          await filterTrigger.click();
          await expect(filterDrawer).toBeVisible();
          await expect(storageFacet).toHaveAttribute('aria-pressed', 'true');
          await page.getByTestId('drawer-cancel').getByRole('button').click();
          await expect(filterDrawer).toBeHidden();
        }
      });
    },
  );
});
