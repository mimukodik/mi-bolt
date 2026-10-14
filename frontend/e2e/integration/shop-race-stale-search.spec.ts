// spec: specs/shop-race-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The word the held page load searches for, and the word that replaces it
// inside the held window.
const HELD_WORD = 'motorola';
const NEW_WORD = 'honor';

// The catalogue swaps its filter mount at 1024px: at that width and wider the
// facets live in the shown `filter-sidebar` (`filter-panel`), which is busy and
// disabled for the whole held window; below it that sidebar is hidden and the
// search on screen is the header's `mobile-search-input`.
const SIDEBAR_MIN_WIDTH = 1024;

test.describe('Shop: a newer request wins the race', () => {
  test(
    '[E037] a second search keeps its results when the first one answers late',
    { tag: '@integration' },
    async ({ page }) => {
      await page.clock.install();

      const wideLayout = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;

      const resultCount = page.getByTestId('result-count');
      const catalogLoading = page.getByTestId('catalog-loading');
      const cards = page.getByTestId('product-card');
      const appliedChip = page.getByTestId('applied-chip');
      const filterPanel = page.getByTestId('filter-panel');
      const filterSidebar = page.getByTestId('filter-sidebar');
      const filterSearchInput = page.getByTestId('filter-search-input');
      // The field the screen keeps usable while the held request is in flight:
      // the header's own at 1024px and wider, the mobile search bar below it.
      const searchField = page.getByTestId(
        wideLayout ? 'header-search-input' : 'mobile-search-input',
      );

      // Captured before the navigation, so the page's own `products` traffic is
      // recorded from its first request: the held word's settlement and its
      // responses, and every request the newer word issues.
      const heldWordFailures: string[] = [];
      const heldWordResponses: number[] = [];
      const newWordRequests: string[] = [];
      const productsQuery = (rawUrl: string): string | null => {
        const url = new URL(rawUrl);
        return url.pathname === '/api/v1/products' ? url.searchParams.get('q') : null;
      };
      page.on('requestfailed', (request) => {
        if (productsQuery(request.url()) === HELD_WORD) {
          heldWordFailures.push(request.failure()?.errorText ?? 'no failure reason');
        }
      });
      page.on('response', (response) => {
        if (productsQuery(response.url()) === HELD_WORD) heldWordResponses.push(response.status());
      });
      page.on('request', (request) => {
        if (productsQuery(request.url()) === NEW_WORD) newWordRequests.push(request.url());
      });

      // 1. Read the held window: open `/telefonok?q=motorola&mi-scenario=slow-once-products`
      // (the first `products` request of this page load is the one the mock holds
      // for 2000 ms) and read the catalogue.
      await test.step('1. Read the held window: open `/telefonok?q=motorola&mi-scenario=slow-once-products` (the first `products` request of this page load is the one the mock holds for 2000 ms) and read the catalogue.', async () => {
        // The scenario query arms the fault on this page load, so this load's
        // first products request is answered 2000 ms late.
        await page.goto(`/telefonok?q=${HELD_WORD}&mi-scenario=slow-once-products`);

        // The counter says it is still searching, and the skeleton grid stands in
        // for the list that has not arrived: no card is rendered.
        await expect(resultCount).toHaveText('Keresés a katalógusban…');
        await expect(catalogLoading).toBeVisible();
        await expect(cards).toHaveCount(0);

        if (wideLayout) {
          // The shown sidebar's panel is busy and its own search input disabled
          // for the whole held window, which is why the change in step 2 goes to
          // the header's field instead.
          await expect(filterPanel).toHaveAttribute('aria-busy', 'true');
          await expect(filterSearchInput).toBeDisabled();
        } else {
          // Below 1024px that panel is hidden and the search on screen is the
          // header's mobile bar.
          await expect(filterSidebar).toBeHidden();
          await expect(searchField).toBeVisible();
        }

        // The address carries the held query and the scenario that armed it.
        await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(HELD_WORD);
        await expect
          .poll(() => new URL(page.url()).searchParams.get('mi-scenario'))
          .toBe('slow-once-products');
      });

      // 2. Change the query inside the held window: fill the header's search field
      // with `honor`, then commit it with Enter.
      await test.step("2. Change the query inside the held window: fill the header's search field — `header-search-input` at 1024 px and wider, `mobile-search-input` below 1024 px — with `honor`, then commit it with Enter.", async () => {
        // Typed and committed while the held request is still in flight; Enter
        // commits it as an in-app navigation, which keeps the armed scenario.
        await searchField.fill(NEW_WORD);
        await searchField.press('Enter');

        // The change issues its own request and the address follows it: the held
        // word is no longer the query.
        await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(NEW_WORD);

        // The newer response lands and the whole catalogue reads it: eight
        // results, no card carrying the held word, one chip for the new query.
        await expect(resultCount).toHaveText('8 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(8);
        await expect(cards.filter({ hasText: HELD_WORD })).toHaveCount(0);
        await expect(appliedChip).toHaveText('Keresés: „honor” ✕');
      });

      // 3. Hold the check across the moment the first search's answer would have
      // landed (2000 ms after its own request): settle the superseded request,
      // then keep reading the grid.
      await test.step("3. Hold the check across the moment the first search's answer would have landed (2000 ms after its own request): settle the superseded request, then keep reading the grid.", async () => {
        // The superseded request is settled as failed: the app cancels it, so the
        // held answer is never painted over the newer one. A cancelled request is
        // recorded as a failure and never as a response, and the error text an
        // aborted request carries is engine-specific, so the settlement itself is
        // asserted here and one engine's abort code is not: the empty response set
        // below is what proves the held word was never answered.
        await expect.poll(() => heldWordFailures.length).toBeGreaterThan(0);

        // The page clock (page.clock, BOLT-7) runs past the mock's 2000 ms hold;
        // the newer result survives it: the same counter and the same eight
        // cards, none of them carrying the held word.
        await page.clock.fastForward(2000);
        await expect(resultCount).toHaveText('8 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(8);
        await expect(cards.filter({ hasText: HELD_WORD })).toHaveCount(0);

        // Across the whole window the change issued one request and no second
        // subscription, and no response ever carried the held word.
        expect(newWordRequests).toHaveLength(1);
        expect(heldWordResponses).toEqual([]);

        // The address still carries the newer query.
        await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(NEW_WORD);
      });
    },
  );
});
