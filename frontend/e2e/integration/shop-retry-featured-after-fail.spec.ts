// spec: specs/shop-retry-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Shop: retry after one failure', () => {
  test(
    '[E021] the featured phones come back after one failed load',
    { tag: '@integration' },
    async ({ page }) => {
      const featuredSection = page.getByTestId('featured-section');
      const featuredError = featuredSection.getByTestId('error-state');
      const featuredRetry = featuredSection.getByTestId('retry-button');
      const featuredGrid = page.getByTestId('featured-grid');
      // The cards carry `featured-card-<slug>` test ids and the loading
      // placeholders `featured-card-skeleton-<n>`, so the pattern covers both
      // sides of the featured row's own `@if (loading())` branch.
      const featuredCards = page.getByTestId(/^featured-card-/);
      const skeletons = page.locator('[data-testid^="featured-card-skeleton-"]');
      // The four featured prices, in grid order, as the price block renders
      // them; `toHaveText` normalises the non-breaking space the amount uses
      // between the thousands.
      const featuredPrices = ['89 990', '69 990', '599 990', '699 990'];

      await test.step('1. Open the home page with the once-only product-list fault on the first load: `/` with `?mi-scenario=fail-once-products`, and wait for the hero to render. - expect: `hero-heading` is visible, so the home page itself is intact and only the featured row is broken. - expect: `featured-section` shows `error-state` with role `status`, whose title reads exactly "A kiemelt termékek nem tölthetők be" and whose message reads exactly "Ismeretlen hiba a termék betöltése közben.". - expect: The state\'s retry control `retry-button` reads "Újrapróbálom". - expect: No `featured-grid` and no `featured-card-*` element is rendered, and no `price-amount` is rendered anywhere on the page, so no price is fabricated while the list fails.', async () => {
        await page.goto('/?mi-scenario=fail-once-products');

        // The hero heading proves the home page bootstrapped with MSW active
        // (`src/main.ts` bootstraps only after `startMocks()` resolves); its
        // test id keeps it apart from the fatal-state `<h1>` in
        // `src/index.html`.
        await expect(page.getByTestId('hero-heading')).toBeVisible();

        // The featured section renders its own error state with `role="status"`
        // (not the shared `ErrorState`'s alert) from the home page's own copy,
        // so the 503 Problem's own text never reaches the page.
        await expect(featuredError).toBeVisible();
        await expect(featuredError).toHaveAttribute('role', 'status');
        await expect(
          featuredError.getByText('A kiemelt termékek nem tölthetők be', { exact: true }),
        ).toBeVisible();
        await expect(
          featuredError.getByText('Ismeretlen hiba a termék betöltése közben.', { exact: true }),
        ).toBeVisible();
        await expect(featuredRetry).toHaveText('Újrapróbálom');

        // The error branch replaces the whole grid, so neither the wrapper, nor
        // a card, nor any price is on screen while the list fails.
        await expect(featuredGrid).toHaveCount(0);
        await expect(featuredCards).toHaveCount(0);
        await expect(page.getByTestId('price-amount')).toHaveCount(0);
      });

      await test.step('2. Press the inner button of `retry-button` ("Újrapróbálom"). - expect: The featured row re-requests the list and recovers: `error-state` and `retry-button` are gone from `featured-section` and `featured-grid` is rendered (the four skeletons `featured-card-skeleton-0` … `featured-card-skeleton-3` may show while the request runs). - expect: `featured-grid` holds exactly four `featured-card-*` cards, each with a non-empty name heading. - expect: Their "Egyszeri készülékár" `price-amount` values read "89 990", "69 990", "599 990" and "699 990", each with its separate "Ft" glyph beside it. - expect: The hero is unchanged: `hero-heading` is still visible and `featured-all-link` ("Összes telefon") is still offered under the row.', async () => {
        await featuredRetry.getByRole('button').click();

        // The retried request succeeds, because the once-only fault fires once
        // per handler list and a retry inside the page builds no new list.
        await expect(featuredError).toHaveCount(0);
        await expect(featuredRetry).toHaveCount(0);
        await expect(featuredGrid).toBeVisible();
        // The four skeleton placeholders may show while the request runs; the
        // real cards are read once none is left.
        await expect(skeletons).toHaveCount(0);
        await expect(featuredCards).toHaveCount(4);

        for (let index = 0; index < featuredPrices.length; index += 1) {
          const card = featuredCards.nth(index);
          // Every card names a product, prices it under the "Egyszeri
          // készülékár" label and carries the `Ft` glyph as a separate span
          // beside the digits.
          await expect(card.getByRole('heading', { level: 3 })).not.toBeEmpty();
          await expect(card.getByText('Egyszeri készülékár', { exact: true })).toBeVisible();
          await expect(card.getByTestId('price-amount')).toHaveText(featuredPrices[index]);
          await expect(card.getByText('Ft', { exact: true })).toBeVisible();
        }

        // The retry is the featured row's alone: the hero and the section's own
        // "Összes telefon" link are unchanged.
        await expect(page.getByTestId('hero-heading')).toBeVisible();
        await expect(featuredSection.getByTestId('featured-all-link')).toHaveText('Összes telefon');
      });
    },
  );
});
