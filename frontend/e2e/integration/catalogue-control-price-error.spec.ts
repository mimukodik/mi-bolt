// spec: specs/catalogue-filter-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px. At that width and wider the
// price fields `filter-min-price` / `filter-max-price` and the refusal message
// `filter-price-error` live in the shown `filter-sidebar` (`FilterPanel`),
// which applies every edit the moment it is typed. Below that width the
// sidebar is `display: none` and the trigger `filter-trigger` opens the
// `filter-drawer` (`FilterDrawer`), whose equivalent controls carry the
// `drawer-*` naming (`drawer-min-price`, `drawer-max-price`,
// `drawer-price-error`), whose edits stay a transient draft until
// `drawer-apply` ("Szűrők alkalmazása") commits them, and which stays open
// when that apply is refused. Both mounts run the same validation and refuse
// with the same text, so this scenario runs at every width and takes each step
// in whichever mount the viewport shows.
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
      const filterTrigger = page.getByTestId('filter-trigger');
      const filterDrawer = page.getByTestId('filter-drawer');
      // The price field pair and the refusal message the viewport shows: the
      // sidebar's own at 1024px and wider, the drawer's below it.
      const minPrice = page.getByTestId(sidebarViewport ? 'filter-min-price' : 'drawer-min-price');
      const maxPrice = page.getByTestId(sidebarViewport ? 'filter-max-price' : 'drawer-max-price');
      const priceError = page.getByTestId(
        sidebarViewport ? 'filter-price-error' : 'drawer-price-error',
      );
      const appliedFilters = page.getByTestId('applied-filters');
      const appliedChips = page.getByTestId('applied-chip');
      // Controls built on the `app-button` primitive are host elements carrying
      // the test id, so the press targets the native `button` inside them
      // (`app-button`).
      const drawerApply = page.getByTestId('drawer-apply').getByRole('button');

      // Below 1024px the price fields exist only while the drawer is open, so
      // opening it is part of reading or editing them; at the sidebar width
      // they are always in the DOM and this is a no-op.
      const openDrawer = async (): Promise<void> => {
        if (sidebarViewport) return;
        if (await filterDrawer.isVisible()) return;
        await filterTrigger.click();
        await expect(filterDrawer).toBeVisible();
      };

      // At the sidebar width each edit is applied as it is typed. In the drawer
      // the edit is a draft until Apply commits it, and the committed apply
      // closes the drawer; an apply the validation refuses stays open instead,
      // which `refusedApply` is there to prove.
      const applyRange = async (): Promise<void> => {
        if (sidebarViewport) return;
        await drawerApply.click();
        await expect(filterDrawer).toBeHidden();
      };
      const refusedApply = async (): Promise<void> => {
        if (sidebarViewport) return;
        await drawerApply.click();
        await expect(filterDrawer).toBeVisible();
      };

      // 1. Open `/telefonok`, wait for the grid, and type the valid range "300000" into the minimum price field and "600000" into the maximum.
      await test.step('1. Open `/telefonok`, wait for the grid, and type the valid range "300000" into the minimum price field and "600000" into the maximum.', async () => {
        await page.goto('/telefonok');

        // The grid wrapper holds the `catalog-loading` skeleton while the first
        // response is in flight, so the skeleton going away together with a
        // card appearing and the counter naming its landed text is what proves
        // the grid is there; the counter reads its own placeholder until then.
        await expect(page.getByTestId('catalog-loading')).toBeHidden();
        await expect(cards.first()).toBeVisible();
        await expect(resultCount).toHaveText(UNFILTERED_COUNT);
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);

        // The mount in use is the one the viewport shows: the sidebar at
        // 1024px and wider, the drawer the trigger opens below it. The price
        // fields read below are that mount's own, and it is the mount every
        // step of this scenario drives.
        if (sidebarViewport) {
          await expect(filterSidebar).toBeVisible();
        }
        await openDrawer();
        await expect(minPrice).toBeVisible();
        await expect(maxPrice).toBeVisible();

        // The sidebar applies each side of the range as it is typed; in the
        // drawer the two edits are a draft until Apply commits them.
        await minPrice.fill('300000');
        await maxPrice.fill('600000');
        await applyRange();

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

      // 2. Type "900000" into the minimum price field, a minimum above the maximum.
      await test.step('2. Type "900000" into the minimum price field, a minimum above the maximum.', async () => {
        await openDrawer();
        await minPrice.fill('900000');

        // The mount's own validation names the fault below the fieldset and
        // marks the offending input; the maximum carries no such mark.
        await expect(priceError).toHaveText('A minimum nem lehet nagyobb a maximum árnál.');
        await expect(minPrice).toHaveAttribute('aria-invalid', 'true');
        await expect(maxPrice).not.toHaveAttribute('aria-invalid', 'true');

        // The typed text is what the field shows: `onMinInput` keeps the
        // sidebar from applying the rejected range, and the drawer's Apply is
        // refused the same way, applying nothing.
        await expect(minPrice).toHaveValue('900000');
        await refusedApply();

        // The applied range stays exactly what the previous step put in the
        // counter, the chips and the address bar.
        await expect(resultCount).toHaveText(TYPED_RANGE_COUNT);
        await expect(appliedChips).toHaveCount(2);
        await expect(appliedChips.nth(0)).toContainText('Min. ár: 300 000 Ft');
        await expect(appliedChips.nth(1)).toContainText('Max. ár: 600 000 Ft');
        await expect.poll(() => new URL(page.url()).searchParams.get('minPrice')).toBe('300000');
        await expect.poll(() => new URL(page.url()).searchParams.get('maxPrice')).toBe('600000');
      });

      // 3. Correct the range by typing "400000" into the minimum price field.
      await test.step('3. Correct the range by typing "400000" into the minimum price field.', async () => {
        await openDrawer();
        await minPrice.fill('400000');

        // The corrected draft clears both the message and the mark.
        await expect(priceError).toHaveCount(0);
        await expect(minPrice).not.toHaveAttribute('aria-invalid', 'true');

        // The sidebar applies the corrected range as it is typed; the drawer
        // commits it on Apply.
        await applyRange();

        // The corrected range applies: the counter and both chips follow it.
        await expect(resultCount).toHaveText(CORRECTED_RANGE_COUNT);
        await expect(appliedChips).toHaveCount(2);
        await expect(appliedChips.nth(0)).toContainText('Min. ár: 400 000 Ft');
        await expect(appliedChips.nth(1)).toContainText('Max. ár: 600 000 Ft');
        await expect.poll(() => new URL(page.url()).searchParams.get('minPrice')).toBe('400000');
        await expect.poll(() => new URL(page.url()).searchParams.get('maxPrice')).toBe('600000');

        // The minimum field's placeholder follows the narrower result set's own
        // floor (`priceMinHint`); in the drawer the committed apply closed it,
        // so it is reopened to be read.
        await openDrawer();
        await expect(minPrice).toHaveAttribute('placeholder', '419990');
      });

      // 4. Type "-5" into the minimum price field, a negative minimum.
      await test.step('4. Type "-5" into the minimum price field, a negative minimum.', async () => {
        await openDrawer();
        await minPrice.fill('-5');

        // The negative bound is refused by the other arm of the same
        // validation, marking the minimum again.
        await expect(priceError).toHaveText('A minimum ár nem lehet negatív.');
        await expect(minPrice).toHaveAttribute('aria-invalid', 'true');

        // The refused draft leaves the applied range untouched in the counter,
        // the chips and the address bar; the drawer's Apply is refused and
        // leaves the drawer open, the sidebar having suppressed the intent as
        // it was typed.
        await refusedApply();
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
