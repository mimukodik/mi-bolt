// spec: specs/catalogue-filter-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px: at that width and wider the
// price fields `filter-min-price` / `filter-max-price` and the refusal message
// `filter-price-error` live in the shown `filter-sidebar` (`FilterPanel`),
// which applies every edit the moment it is typed; below that width the
// sidebar is `display: none` and the trigger opens the `filter-drawer`
// (`FilterDrawer`), whose equivalent controls carry the `drawer-*` naming and
// a `drawer-price-error` and whose edits stay a transient draft until
// `drawer-apply` commits them. The refusal this scenario drives is the
// panel's own (`FilterPanel.priceValidation`), so it is taken at the sidebar
// width alone and skipped below it.
const SIDEBAR_MIN_WIDTH = 1024;

// The catalogue's own default page size: one card per (product, storage)
// entry, 12 of them per page (the catalogue query module's
// `DEFAULT_PAGE_SIZE`).
const DEFAULT_PAGE_SIZE = 12;

// The counters the scenario passes through: the unfiltered catalogue it opens
// on, the range it types, and the narrower minimum it corrects to.
const UNFILTERED_COUNT = '55 találat a szűrt feltételek szerint';
const TYPED_RANGE_COUNT = '25 találat a szűrt feltételek szerint';
const CORRECTED_RANGE_COUNT = '15 találat a szűrt feltételek szerint';

test.describe('Catalogue: filter controls', () => {
  test(
    'the panel refuses a price range it cannot apply',
    { tag: '@integration' },
    async ({ page }) => {
      const sidebarViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
      const resultCount = page.getByTestId('result-count');
      const cards = page.getByTestId('product-card');
      const filterSidebar = page.getByTestId('filter-sidebar');
      const minPrice = page.getByTestId('filter-min-price');
      const maxPrice = page.getByTestId('filter-max-price');
      const priceError = page.getByTestId('filter-price-error');
      const appliedFilters = page.getByTestId('applied-filters');
      const appliedChips = page.getByTestId('applied-chip');

      // The fields and the message they carry are the sidebar's own, shown at
      // 1024px and wider only; below it the drawer renders its own controls
      // and its own refusal, so this scenario belongs to the sidebar width and
      // has nothing to drive in the narrow layout.
      test.skip(
        !sidebarViewport,
        'the price refusal this scenario drives lives in the filter-sidebar, shown only at 1024px and wider',
      );

      // 1. Open `/telefonok`, wait for the grid, and type the valid range "300000" into `filter-min-price` and "600000" into `filter-max-price`.
      await test.step('1. Open `/telefonok`, wait for the grid, and type the valid range "300000" into `filter-min-price` and "600000" into `filter-max-price`.', async () => {
        await page.goto('/telefonok');

        // The grid wrapper holds the `catalog-loading` skeleton while the first
        // response is in flight, so the skeleton going away together with a
        // card appearing and the counter naming its landed text is what proves
        // the grid is there; the counter reads its own placeholder until then.
        await expect(page.getByTestId('catalog-loading')).toBeHidden();
        await expect(cards.first()).toBeVisible();
        await expect(resultCount).toHaveText(UNFILTERED_COUNT);
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);

        // The mount in use is the sidebar: both price fields are the panel's
        // own and are shown, which is what makes every step below the sidebar's.
        await expect(filterSidebar).toBeVisible();
        await expect(minPrice).toBeVisible();
        await expect(maxPrice).toBeVisible();

        // The panel applies each side of the range as it is typed, so the
        // counter and the chips follow the two edits on the spot.
        await minPrice.fill('300000');
        await maxPrice.fill('600000');

        await expect(resultCount).toHaveText(TYPED_RANGE_COUNT);
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);

        // Each applied bound adds one `applied-chip`; `buildChips` labels the
        // pair "Min. ár: <value> Ft" and "Max. ár: <value> Ft".
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(2);
        await expect(appliedChips.nth(0)).toContainText('Min. ár: 300 000 Ft');
        await expect(appliedChips.nth(1)).toContainText('Max. ár: 600 000 Ft');

        // The address bar mirrors the applied range; these reads come after the
        // assertions above proved the narrowed state rendered.
        await expect.poll(() => new URL(page.url()).searchParams.get('minPrice')).toBe('300000');
        await expect.poll(() => new URL(page.url()).searchParams.get('maxPrice')).toBe('600000');
      });

      // 2. Type "900000" into `filter-min-price`, a minimum above the maximum.
      await test.step('2. Type "900000" into `filter-min-price`, a minimum above the maximum.', async () => {
        await minPrice.fill('900000');

        // `FilterPanel.priceValidation` names the fault below the fieldset and
        // marks the offending input through `priceInvalidField`; the maximum
        // carries no such mark.
        await expect(priceError).toHaveText('A minimum nem lehet nagyobb a maximum árnál.');
        await expect(minPrice).toHaveAttribute('aria-invalid', 'true');
        await expect(maxPrice).not.toHaveAttribute('aria-invalid', 'true');

        // The typed text is what the field shows while the applied range stays
        // exactly what the previous step put in the chips and the address bar:
        // `onMinInput` suppresses the apply intent while the range is invalid.
        await expect(minPrice).toHaveValue('900000');
        await expect(resultCount).toHaveText(TYPED_RANGE_COUNT);
        await expect(appliedChips).toHaveCount(2);
        await expect(appliedChips.nth(0)).toContainText('Min. ár: 300 000 Ft');
        await expect(appliedChips.nth(1)).toContainText('Max. ár: 600 000 Ft');
        await expect.poll(() => new URL(page.url()).searchParams.get('minPrice')).toBe('300000');
        await expect.poll(() => new URL(page.url()).searchParams.get('maxPrice')).toBe('600000');
      });

      // 3. Correct the range by typing "400000" into `filter-min-price`.
      await test.step('3. Correct the range by typing "400000" into `filter-min-price`.', async () => {
        await minPrice.fill('400000');

        // The corrected draft clears both the message and the mark.
        await expect(priceError).toHaveCount(0);
        await expect(minPrice).not.toHaveAttribute('aria-invalid', 'true');

        // The corrected range applies: the counter and both chips follow it.
        await expect(resultCount).toHaveText(CORRECTED_RANGE_COUNT);
        await expect(appliedChips).toHaveCount(2);
        await expect(appliedChips.nth(0)).toContainText('Min. ár: 400 000 Ft');
        await expect(appliedChips.nth(1)).toContainText('Max. ár: 600 000 Ft');
        await expect.poll(() => new URL(page.url()).searchParams.get('minPrice')).toBe('400000');
        await expect.poll(() => new URL(page.url()).searchParams.get('maxPrice')).toBe('600000');

        // The minimum field's placeholder follows the narrower result set's own
        // floor (`FilterPanel.priceMinHint`).
        await expect(minPrice).toHaveAttribute('placeholder', '419990');
      });

      // 4. Type "-5" into `filter-min-price`, a negative minimum.
      await test.step('4. Type "-5" into `filter-min-price`, a negative minimum.', async () => {
        await minPrice.fill('-5');

        // The negative bound is refused by the other arm of the same
        // validation, marking the minimum again.
        await expect(priceError).toHaveText('A minimum ár nem lehet negatív.');
        await expect(minPrice).toHaveAttribute('aria-invalid', 'true');

        // The refused draft leaves the applied range untouched in the counter,
        // the chips and the address bar.
        await expect(resultCount).toHaveText(CORRECTED_RANGE_COUNT);
        await expect(appliedChips).toHaveCount(2);
        await expect(appliedChips.nth(0)).toContainText('Min. ár: 400 000 Ft');
        await expect(appliedChips.nth(1)).toContainText('Max. ár: 600 000 Ft');
        await expect.poll(() => new URL(page.url()).searchParams.get('minPrice')).toBe('400000');
        await expect.poll(() => new URL(page.url()).searchParams.get('maxPrice')).toBe('600000');
      });
    },
  );
});
