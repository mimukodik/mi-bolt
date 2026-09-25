// spec: specs/catalogue-filter-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The catalogue swaps its filter mount at 1024px: at that width and wider the
// toolbar's `filter-trigger` is `display: none` (`.trigger` in the catalogue
// toolbar stylesheet) and the facets live in the shown `filter-sidebar` panel
// (`FilterPanel`), which applies every edit immediately; below it the sidebar
// is `display: none` and the trigger opens the `filter-drawer`
// (`FilterDrawer`), whose edits stay a transient draft until `drawer-apply`
// commits them and closes the drawer. The manufacturer and colour "more"
// controls keep the same test ids in both mounts — `filter-brand-more` and
// `filter-color-more` — so the drawer's copies are read inside their own group
// rather than page-wide, the hidden sidebar carrying a pair of its own; the
// facets themselves carry the mount's prefix (`filter-brand-*` /
// `filter-color-*` in the sidebar, `drawer-brand-*` / `drawer-color-*` in the
// drawer). A manufacturer or colour the shopper picked keeps its list open:
// the expansion state lives on the mount, so it survives the drawer closing
// on `drawer-apply`.
const SIDEBAR_MIN_WIDTH = 1024;

// The catalogue's own default page size: it lists one card per
// (product, storage) entry, 12 of them per page (the catalogue query module's
// `DEFAULT_PAGE_SIZE`).
const DEFAULT_PAGE_SIZE = 12;

test.describe('Catalogue: filter controls', () => {
  test(
    'the manufacturer and colour lists open behind their more controls',
    { tag: '@integration' },
    async ({ page }) => {
      const sidebarViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
      const catalogHost = page.locator('app-catalog-page');
      const resultCount = page.getByTestId('result-count');
      const cards = page.getByTestId('product-card');
      const appliedFilters = page.getByTestId('applied-filters');
      const appliedChips = page.getByTestId('applied-chip');
      const filterTrigger = page.getByTestId('filter-trigger');
      const filterDrawer = page.getByTestId('filter-drawer');
      // The group pair and the facet prefix this viewport shows: the sidebar's
      // own at 1024px and wider, the drawer's below it.
      const brandGroup = page.getByTestId(
        sidebarViewport ? 'filter-group-brand' : 'drawer-group-brand',
      );
      const colorGroup = page.getByTestId(
        sidebarViewport ? 'filter-group-color' : 'drawer-group-color',
      );
      const brandPrefix = sidebarViewport ? 'filter-brand-' : 'drawer-brand-';
      const colorPrefix = sidebarViewport ? 'filter-color-' : 'drawer-color-';
      // The facet buttons sit one per `<li>` in both mounts, and the group's
      // own "more" control is a direct child of the fieldset whose id shares
      // the facet prefix in the sidebar, so counting through the list rows is
      // what keeps the control out of the count.
      const brandFacets = brandGroup.locator('li button');
      const colorFacets = colorGroup.locator('li button');
      // The "more" pair, whose test ids are the same in both mounts, so the
      // drawer's copies are read inside their own group.
      const brandMore = brandGroup.getByTestId('filter-brand-more');
      const colorMore = colorGroup.getByTestId('filter-color-more');
      const brand = (value: string) => page.getByTestId(`${brandPrefix}${value}`);
      const color = (value: string) => page.getByTestId(`${colorPrefix}${value}`);
      // Controls built on the `app-button` primitive are host elements carrying
      // the test id, so the press targets the native `button` inside them
      // (`app-button`).
      const drawerApply = page.getByTestId('drawer-apply').getByRole('button');

      // The unfiltered counter, and the state opening a list has to leave
      // untouched: the bare `/telefonok` with no query at all.
      const unfilteredCount = '55 találat a szűrt feltételek szerint';
      const onPlainCatalogue = (url: URL): boolean =>
        url.pathname === '/telefonok' && url.search === '';

      // Below 1024px a drawer facet exists only while the drawer is open, so
      // opening it is part of reading or editing one; at the sidebar width the
      // facets are always in the DOM and this is a no-op.
      const openDrawer = async (): Promise<void> => {
        if (sidebarViewport) return;
        if (await filterDrawer.isVisible()) return;
        await filterTrigger.click();
        await expect(filterDrawer).toBeVisible();
      };

      // 1. Open `/telefonok` and wait for the grid, then read the "Gyártó" and "Szín" groups.
      await test.step('1. Open `/telefonok` and wait for the grid, then read the "Gyártó" and "Szín" groups: `filter-group-brand` and `filter-group-color` in the sidebar at 1024 px and wider, `drawer-group-brand` and `drawer-group-color` in the drawer opened with `filter-trigger` below 1024 px.', async () => {
        await page.goto('/telefonok');

        // The grid wrapper holds the `catalog-loading` skeleton while the first
        // response is in flight, so the skeleton going away together with a
        // card appearing and the counter naming its landed text is what proves
        // the grid is there; the counter reads its own placeholder until then.
        await expect(catalogHost).toHaveAttribute(
          'data-layout-mode',
          sidebarViewport ? 'sidebar' : 'drawer',
        );
        await expect(page.getByTestId('catalog-loading')).toBeHidden();
        await expect(cards.first()).toBeVisible();
        await expect(resultCount).toHaveText(unfilteredCount);
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);

        // The drawer's groups exist only while the drawer is open.
        await openDrawer();

        // Both lists are collapsed behind their own "more" control: five rows
        // each, the manufacturer's control reporting the closed list through
        // `aria-expanded`.
        await expect(brandFacets).toHaveCount(5);
        await expect(brandMore).toHaveText('Még több gyártó');
        await expect(brandMore).toHaveAttribute('aria-expanded', 'false');
        await expect(colorFacets).toHaveCount(5);
        await expect(colorMore).toHaveText('Még több szín');

        // The five manufacturers, in the order the facets render them.
        await expect(brand('apple')).toHaveText('Apple (17)');
        await expect(brand('google pixel')).toHaveText('Google Pixel (4)');
        await expect(brand('honor')).toHaveText('HONOR (8)');
        await expect(brand('motorola')).toHaveText('Motorola (1)');
        await expect(brand('samsung')).toHaveText('Samsung (13)');

        // The five colours, likewise.
        await expect(color('zold')).toHaveText('Zöld (3)');
        await expect(color('fekete')).toHaveText('Fekete (35)');
        await expect(color('burgundi')).toHaveText('Burgundi (3)');
        await expect(color('ezust')).toHaveText('Ezüst (4)');
        await expect(color('gleccserszin')).toHaveText('Gleccserszín (3)');

        // Nothing is applied yet: the bare catalogue and the bare trigger.
        await expect(page).toHaveURL(onPlainCatalogue);
        await expect(filterTrigger).toHaveText('Szűrők');
      });

      // 2. Press the manufacturer "more" control (`filter-brand-more`; in the drawer the control with that same test id inside `filter-drawer`).
      await test.step('2. Press the manufacturer "more" control (`filter-brand-more`; in the drawer the control with that same test id inside `filter-drawer`).', async () => {
        await openDrawer();
        await brandMore.click();

        // The list grows to the full seven manufacturers, the two the collapsed
        // list hid among them.
        await expect(brandFacets).toHaveCount(7);
        await expect(brand('vivo')).toHaveText('Vivo (3)');
        await expect(brand('xiaomi')).toHaveText('Xiaomi (9)');

        // The control reports the open list through its own label and
        // `aria-expanded`.
        await expect(brandMore).toHaveText('Kevesebb gyártó');
        await expect(brandMore).toHaveAttribute('aria-expanded', 'true');

        // Opening a list is not a filter: the catalogue is untouched.
        await expect(page).toHaveURL(onPlainCatalogue);
        await expect(resultCount).toHaveText(unfilteredCount);
      });

      // 3. Press the colour "more" control (`filter-color-more`; in the drawer the control with that same test id inside `filter-drawer`).
      await test.step('3. Press the colour "more" control (`filter-color-more`; in the drawer the control with that same test id inside `filter-drawer`).', async () => {
        await openDrawer();
        await colorMore.click();

        // The colour list grows to the fixture's whole palette, so a chip the
        // collapsed list did not show is one of the new rows.
        await expect(colorFacets).toHaveCount(32);
        await expect(color('grafit')).toHaveText('Grafit (4)');

        // The control reports the open list through its own label.
        await expect(colorMore).toHaveText('Kevesebb szín');

        // Opening this list is not a filter either.
        await expect(page).toHaveURL(onPlainCatalogue);
        await expect(resultCount).toHaveText(unfilteredCount);
      });

      // 4. Activate a manufacturer that only the opened list carries: press `filter-brand-vivo` (below 1024 px press `drawer-brand-vivo`, then `drawer-apply`).
      await test.step('4. Activate a manufacturer that only the opened list carries: press `filter-brand-vivo` (below 1024 px press `drawer-brand-vivo`, then `drawer-apply`).', async () => {
        await openDrawer();
        await brand('vivo').click();

        // In the drawer the press is a draft, and `drawer-apply` is what
        // commits it and closes the drawer.
        if (!sidebarViewport) {
          await drawerApply.click();
          await expect(filterDrawer).toHaveCount(0);
        }

        // The applied set lands: three hits over three cards.
        await expect(resultCount).toHaveText('3 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(3);

        // One chip carries the picked manufacturer, its remove button being
        // `applied-chip-remove-brand` (`buildChips` labels it "vivo").
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(1);
        await expect(appliedChips.first()).toContainText('vivo');
        await expect(page.getByTestId('applied-chip-remove-brand')).toBeVisible();

        // The address bar mirrors the applied filter; the read comes after the
        // assertions above proved the narrowed state rendered.
        await expect.poll(() => new URL(page.url()).searchParams.get('brand')).toBe('vivo');

        // The manufacturer the shopper picked keeps the list open, so it stays
        // on screen; in the drawer that state is read on the reopened drawer.
        await openDrawer();
        await expect(brandFacets).toHaveCount(7);
        await expect(brandMore).toHaveText('Kevesebb gyártó');
        await expect(brandMore).toHaveAttribute('aria-expanded', 'true');
        await expect(brand('vivo')).toHaveAttribute('aria-pressed', 'true');
      });

      // 5. Press the manufacturer "more" control again, asking for the list to collapse.
      await test.step('5. Press the manufacturer "more" control again, asking for the list to collapse.', async () => {
        await openDrawer();
        await brandMore.click();

        // The selected manufacturer holds the list open, so the collapse the
        // press asked for does not happen: the control still names all seven
        // visible and the pressed facet stays reachable.
        await expect(brandFacets).toHaveCount(7);
        await expect(brandMore).toHaveText('Kevesebb gyártó');
        await expect(brandMore).toHaveAttribute('aria-expanded', 'true');

        // The catalogue is unchanged by it.
        await expect.poll(() => new URL(page.url()).searchParams.get('brand')).toBe('vivo');
        await expect(resultCount).toHaveText('3 találat a szűrt feltételek szerint');
      });

      // 6. Deactivate `filter-brand-vivo` (below 1024 px `drawer-brand-vivo`, then `drawer-apply`).
      await test.step('6. Deactivate `filter-brand-vivo` (below 1024 px `drawer-brand-vivo`, then `drawer-apply`).', async () => {
        await openDrawer();
        await brand('vivo').click();

        if (!sidebarViewport) {
          await drawerApply.click();
          await expect(filterDrawer).toHaveCount(0);
        }

        // The catalogue is bare again: the unfiltered counter, the plain
        // address bar and no chip left behind.
        await expect(resultCount).toHaveText(unfilteredCount);
        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);
        await expect(page).toHaveURL(onPlainCatalogue);
        await expect(appliedFilters).toHaveCount(0);

        // With the deeper manufacturer gone nothing holds the list open: it
        // collapses back to its five rows.
        await openDrawer();
        await expect(brandFacets).toHaveCount(5);
        await expect(brand('vivo')).toHaveCount(0);
        await expect(brandMore).toHaveText('Még több gyártó');
        await expect(brandMore).toHaveAttribute('aria-expanded', 'false');
      });
    },
  );
});
