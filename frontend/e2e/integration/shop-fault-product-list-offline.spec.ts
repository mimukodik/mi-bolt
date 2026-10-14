// spec: specs/shop-fault-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The three facet groups sit in the sidebar at 1024px and wider, and in the
// drawer `filter-trigger` opens below that (`filter-panel` in the catalogue
// page template; `.sidebar` is `display: none` under the breakpoint). The
// drawer's own controls exist only while `AccessibleDialog` holds it open.
const SIDEBAR_MIN_WIDTH = 1024;

test.describe('Shop: service faults', () => {
  // CI skips this spec (@ci-skip, BOLT-7): an unreachable phone list shows the same error states as the 503; it runs locally.
  test(
    "the phone list is unreachable, so the home page's featured row and the catalogue show the same error states as the 503",
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const featuredSection = page.getByTestId('featured-section');
      const featuredError = featuredSection.getByRole('status');
      const featuredRetry = featuredSection.getByTestId('retry-button');
      const pageTitle = page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' });
      const resultCount = page.getByTestId('result-count');
      const catalogError = page.getByTestId('catalog-error');
      const catalogErrorState = catalogError.getByRole('alert');
      const catalogRetry = catalogError.getByRole('button', { name: 'Újrapróbálom' });
      const cards = page.getByTestId('product-card');

      // 1. Open the home page with the phone-list network fault on the URL's
      // first load, then wait for the hero to render.
      await test.step('1. Open the home page with the phone-list network fault on the URL\'s first load: `/` with `?mi-scenario=offline-products`, then wait for the hero to render. hero-heading is rendered, so the home page itself is intact and only the featured row is broken; featured-section shows error-state with role status, titled "A kiemelt termékek nem tölthetők be", whose message reads exactly "Ismeretlen hiba a termék betöltése közben." and whose retry-button reads "Újrapróbálom"; no featured-grid and no featured-card-* element is rendered.', async () => {
        await page.goto('/?mi-scenario=offline-products');

        // The hero heading proves the home page bootstrapped with MSW active
        // (`src/main.ts` bootstraps only after `startMocks()` resolves); its
        // test id keeps it apart from the fatal-state `<h1>` in `src/index.html`.
        await expect(page.getByTestId('hero-heading')).toBeVisible();

        // `featured-products` renders its own error state (role status, not the
        // shared ErrorState's alert) from the home page's own copy, so neither
        // the 503 Problem nor the dropped connection's own text reaches the
        // page: a broken request and a refused one look the same to the shopper.
        await expect(featuredError).toBeVisible();
        await expect(
          featuredError.getByText('A kiemelt termékek nem tölthetők be', { exact: true }),
        ).toBeVisible();
        await expect(
          featuredError.getByText('Ismeretlen hiba a termék betöltése közben.', { exact: true }),
        ).toBeVisible();
        await expect(featuredRetry).toHaveText('Újrapróbálom');

        // The error branch replaces the whole grid: no wrapper, no card and no
        // card skeleton is rendered.
        await expect(page.getByTestId('featured-grid')).toHaveCount(0);
        await expect(page.getByTestId(/^featured-card-/)).toHaveCount(0);
      });

      // 2. Press the featured row's retry button.
      await test.step('2. Press retry-button ("Újrapróbálom") in the featured row: the row re-requests the list, so the four card skeletons featured-card-skeleton-0 … featured-card-skeleton-3 may show while the request runs, and the same error-state comes back with the same three lines — "A kiemelt termékek nem tölthetők be", "Ismeretlen hiba a termék betöltése közben." and "Újrapróbálom" — because the fault fails every call, so the row never reaches a success state.', async () => {
        await featuredRetry.getByRole('button').click();

        // The in-flight skeleton is a frame-long transient, so what is pinned
        // here is the state the re-issued request settles back into: the same
        // error state with the same three lines.
        await expect(featuredError).toBeVisible();
        await expect(
          featuredError.getByText('A kiemelt termékek nem tölthetők be', { exact: true }),
        ).toBeVisible();
        await expect(
          featuredError.getByText('Ismeretlen hiba a termék betöltése közben.', { exact: true }),
        ).toBeVisible();
        await expect(featuredRetry).toHaveText('Újrapróbálom');
        await expect(page.getByTestId(/^featured-card-/)).toHaveCount(0);
      });

      // 3. Click the featured row's "Összes telefon" link to reach the catalogue.
      await test.step('3. Click featured-all-link ("Összes telefon") to reach the catalogue in-app; the fault survives the click and the address bar becomes /telefonok: the h1 reads "Mobiltelefonok"; result-count reads exactly "A katalógus betöltése nem sikerült."; catalog-error holds error-state with role alert, titled "Nem sikerült betölteni a katalógust.", with the message "Ismeretlen hiba a katalógus betöltése közben." and a button reading "Újrapróbálom"; no product-card is rendered and the brand and colour facet groups are empty; catalog-loading and catalog-pagination are not rendered.', async () => {
        await featuredSection.getByTestId('featured-all-link').click();
        await expect(page).toHaveURL(/\/telefonok$/);

        await expect(pageTitle).toHaveText('Mobiltelefonok');
        await expect(resultCount).toHaveText('A katalógus betöltése nem sikerült.');

        // The catalogue's own error branch wraps the shared `ErrorState`, whose
        // role is alert and whose copy is the catalogue's own.
        await expect(catalogErrorState).toBeVisible();
        await expect(catalogErrorState.getByRole('heading', { level: 2 })).toHaveText(
          'Nem sikerült betölteni a katalógust.',
        );
        await expect(
          catalogErrorState.getByText('Ismeretlen hiba a katalógus betöltése közben.', {
            exact: true,
          }),
        ).toBeVisible();
        await expect(catalogRetry).toBeVisible();

        await expect(cards).toHaveCount(0);

        // The brand and the colour chips are built from the response's own
        // facets, so no chip is rendered when the response never arrives. They
        // live in the sidebar on a wide viewport and in the drawer below the
        // breakpoint, so the check follows the mount the viewport shows.
        const desktopViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
        if (desktopViewport) {
          await expect(page.getByTestId('filter-sidebar')).toBeVisible();
          await expect(page.locator('button[data-testid^="filter-brand-"]')).toHaveCount(0);
          await expect(page.locator('button[data-testid^="filter-color-"]')).toHaveCount(0);
        } else {
          await expect(page.getByTestId('filter-sidebar')).toBeHidden();
          await page.getByTestId('filter-trigger').click();
          await expect(page.getByTestId('filter-drawer')).toBeVisible();
          await expect(page.locator('button[data-testid^="drawer-brand-"]')).toHaveCount(0);
          await expect(page.locator('button[data-testid^="drawer-color-"]')).toHaveCount(0);
          // Close the drawer again, so the retry below reaches the catalogue's
          // error state rather than the open dialog.
          await page.getByTestId('drawer-cancel').getByRole('button').click();
          await expect(page.getByTestId('filter-drawer')).toBeHidden();
        }

        await expect(page.getByTestId('catalog-loading')).toHaveCount(0);
        await expect(page.getByTestId('catalog-pagination')).toHaveCount(0);
      });

      // 4. Press the catalogue's retry button.
      await test.step('4. Press the catalogue\'s "Újrapróbálom" (catalog-error\'s button): the list is requested again and the same error-state returns with the same three lines, the checker stays on /telefonok and no product-card is rendered, so the retry cannot succeed while the fault is active.', async () => {
        await catalogRetry.click();

        await expect(catalogErrorState).toBeVisible();
        await expect(catalogErrorState.getByRole('heading', { level: 2 })).toHaveText(
          'Nem sikerült betölteni a katalógust.',
        );
        await expect(
          catalogErrorState.getByText('Ismeretlen hiba a katalógus betöltése közben.', {
            exact: true,
          }),
        ).toBeVisible();
        await expect(catalogRetry).toBeVisible();

        await expect(page).toHaveURL(/\/telefonok$/);
        await expect(cards).toHaveCount(0);
      });
    },
  );
});
