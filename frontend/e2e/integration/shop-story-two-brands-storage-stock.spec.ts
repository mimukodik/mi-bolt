// spec: specs/shop-story-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';
import type { Locator } from '@playwright/test';

// The catalogue swaps its filter mount at 1024px, the breakpoint
// `shop-edge-mobile-filter-drawer.spec.ts` documents: at that width and wider
// the facets live in the shown `filter-sidebar` (`FilterPanel`) and the
// toolbar's `filter-trigger` is `display: none` (`.trigger` in the toolbar
// stylesheet); below it the sidebar is `display: none` (`.sidebar` in the page
// stylesheet) and the same facets are the `filter-drawer` behind the trigger,
// carrying their own `drawer-*` test ids. The drawer's edits stay a transient
// draft until `drawer-apply` commits them (`FilterDrawer.applyDraft()`), so a
// drawer read only ever inspects the applied query.
const SIDEBAR_MIN_WIDTH = 1024;

// The counters the scenario walks through: the bare catalogue, then the two
// brands OR-ed (Apple's own 17 plus HONOR's 8 = 25), then the 256 GB bucket
// intersected with them for 10. Turning the stock switch on keeps that 10,
// because it moves the sold-out product onto its other in-stock 256 GB variant
// rather than dropping the product.
const UNFILTERED_COUNT = '55 találat a szűrt feltételek szerint';
const APPLE_COUNT = '17 találat a szűrt feltételek szerint';
const BOTH_BRANDS_COUNT = '25 találat a szűrt feltételek szerint';
const BRANDS_STORAGE_COUNT = '10 találat a szűrt feltételek szerint';

// A catalog card's variant line as the screen shows it: the
// "<colour> · <gb> GB" paragraph (`p.variant` in `product-card.html`). The
// filtered grid holds one variant per card, and every one is the 256 GB bucket.
const VARIANT_LINE_256 = /^\s*.+?\s*·\s*256\s*GB\s*$/;

// The catalogue serialises each selected brand as its own `brand` parameter
// (`serializeCatalogQuery()`), so the two brands sit side by side in the query.
// `searchParams.get('brand')` would return only the first, so the whole list is
// compared.
const onCatalogueWithBrands = (url: URL, brands: readonly string[]): boolean =>
  url.pathname === '/telefonok' && url.searchParams.getAll('brand').join(',') === brands.join(',');

test.describe('Shop: home, navigation and catalogue stories', () => {
  // CI skips this spec (@ci-skip, BOLT-7): two brands, 256 GB and the stock filter combine on variants; it runs locally.
  test(
    '[E025] two brands with 256 GB and the stock filter combine on variants',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const drawerViewport = (page.viewportSize()?.width ?? 0) < SIDEBAR_MIN_WIDTH;

      const catalogHost = page.locator('app-catalog-page');
      const filterSidebar = page.getByTestId('filter-sidebar');
      const filterTrigger = page.getByTestId('filter-trigger');
      const filterDrawer = page.getByTestId('filter-drawer');
      const resultCount = page.getByTestId('result-count');
      const appliedFilters = page.getByTestId('applied-filters');
      const appliedChips = page.getByTestId('applied-chip');
      const cards = page.getByTestId('product-card');
      const soldOutMarkers = page.getByTestId('product-card-stock');

      // The facets at the viewport's own mount: the sidebar's `filter-*`
      // controls at 1024px and wider, the drawer's `drawer-*` copies below it.
      const facetPrefix = drawerViewport ? 'drawer-' : 'filter-';
      const brandApple = page.getByTestId(`${facetPrefix}brand-apple`);
      const brandHonor = page.getByTestId(`${facetPrefix}brand-honor`);
      const storage256 = page.getByTestId(`${facetPrefix}storage-256`);
      const inStock = page.getByTestId(`${facetPrefix}inStock`);

      // The visible mount's "Gyártó" rows, the "Még több gyártó" toggle excluded
      // by name: it carries `filter-brand-more` in both templates.
      const brandGroup = page.getByTestId(
        drawerViewport ? 'drawer-group-brand' : 'filter-group-brand',
      );
      const brandFacets = brandGroup.locator(
        `button[data-testid^="${facetPrefix}brand-"]:not([data-testid="filter-brand-more"])`,
      );

      // The two brand labels the final card read compares its headings against,
      // read from the facet the same step asserted.
      let appleLabel = '';
      let honorLabel = '';

      // The one card the storage filter shows as sold out, and its colour, read
      // before the stock switch and reused by the card read after it.
      let soldOutName = '';
      let soldOutColour = '';

      // Below 1024px the facets exist only inside the drawer, so opening it is
      // part of reading or editing them; at the sidebar width they are always in
      // the DOM and this is a no-op.
      const openDrawer = async (): Promise<void> => {
        if (!drawerViewport || (await filterDrawer.isVisible())) return;
        await filterTrigger.click();
        await expect(filterDrawer).toBeVisible();
      };

      // Commits the drawer's draft to the applied query (`drawer-apply`) and
      // closes the drawer; a no-op at the sidebar width, which applies each edit
      // on the spot.
      const applyDrawer = async (): Promise<void> => {
        if (!drawerViewport) return;
        await page.getByTestId('drawer-apply').getByRole('button').click();
        await expect(filterDrawer).toBeHidden();
      };

      // Discards the drawer's draft without committing it (`drawer-cancel`), so
      // a read that only inspected the facets leaves the applied query alone.
      const closeDrawer = async (): Promise<void> => {
        if (!drawerViewport) return;
        await page.getByTestId('drawer-cancel').getByRole('button').click();
        await expect(filterDrawer).toBeHidden();
      };

      // A facet button's label without its count: "Apple (17)" → "Apple",
      // "HONOR (8)" → "HONOR". The count sits in a nested span behind the
      // template's non-breaking space, so the text is normalised before it is
      // split (the brand facet button in `filter-panel.html`).
      const readFacetLabel = async (facet: Locator): Promise<string> => {
        const text = (await facet.innerText()).replace(/\s+/g, ' ').trim();
        return (/^(.+?)\s*\(\d+\)$/.exec(text)?.[1] ?? text).trim();
      };

      // 1. Open `/telefonok` and wait for `result-count`. Read the facets at the
      // viewport's own mount: the sidebar's `filter-*` facets at full HD, the
      // drawer's `drawer-*` copies below 1024px, where a change takes effect
      // only on `drawer-apply`.
      await test.step('1. Open `/telefonok` and wait for `result-count`. Read the facets at the viewport\'s own mount: at full HD the `filter-sidebar` with `filter-brand-*`, `filter-storage-*` and `filter-inStock`; below 1024 px open `filter-trigger` and read the same facets as `drawer-brand-*`, `drawer-storage-*` and `drawer-inStock`, where a change takes effect only on `drawer-apply`. - expect: `result-count` reads "55 találat a szűrt feltételek szerint". - expect: The brand facets show "Apple (17)" and "HONOR (8)" among the first five, both enabled. - expect: The storage facet reads "256 GB (27)" and the stock switch reads "Csak raktáron (55)".', async () => {
        await page.goto('/telefonok');

        // The counter reads "Keresés a katalógusban…" while the first response is
        // in flight, so this text is only reached once it landed.
        await expect(resultCount).toHaveText(UNFILTERED_COUNT);

        // Which mount this viewport shows: the sidebar panel at full HD, the
        // drawer behind the trigger below 1024px.
        if (drawerViewport) {
          await expect(catalogHost).toHaveAttribute('data-layout-mode', 'drawer');
          await expect(filterTrigger).toBeVisible();
          await expect(filterSidebar).toBeHidden();
        } else {
          await expect(catalogHost).toHaveAttribute('data-layout-mode', 'sidebar');
          await expect(filterTrigger).toBeHidden();
          await expect(filterSidebar).toBeVisible();
        }

        await openDrawer();

        // The collapsed "Gyártó" list is five rows, and both selected brands sit
        // among them, enabled, each with its own count.
        await expect(brandFacets).toHaveCount(5);
        await expect(brandApple).toBeEnabled();
        await expect(brandApple).toContainText('Apple (17)');
        await expect(brandHonor).toBeEnabled();
        await expect(brandHonor).toContainText('HONOR (8)');

        // The storage facet and the stock switch carry the unfiltered counts.
        await expect(storage256).toContainText('256 GB (27)');
        await expect(inStock).toContainText('Csak raktáron (55)');

        appleLabel = await readFacetLabel(brandApple);
        honorLabel = await readFacetLabel(brandHonor);

        // The read is discarded so the applied state stays the bare catalogue.
        await closeDrawer();
      });

      // 2. Select the Apple brand at the viewport's own mount; in the drawer the
      // edit stays a draft until `drawer-apply` commits it.
      await test.step('2. Select the Apple brand: `filter-brand-apple` at full HD, `drawer-brand-apple` in the drawer. - expect: `result-count` reads "17 találat a szűrt feltételek szerint", the same 17 the Apple facet itself carries. - expect: The address bar carries `brand=apple`. - expect: `applied-filters` shows one `applied-chip` reading "apple", and the brand facet reports `aria-pressed="true"`. - expect: In the drawer the count and the chips change only after `drawer-apply` is pressed.', async () => {
        await openDrawer();
        await brandApple.click();
        await expect(brandApple).toHaveAttribute('aria-pressed', 'true');

        if (drawerViewport) {
          // The drawer's edit is only a draft: the counter, the chip row and the
          // address bar stay the unfiltered state until `drawer-apply` commits.
          await expect(page).toHaveURL((url) => url.pathname === '/telefonok' && url.search === '');
          await expect(resultCount).toHaveText(UNFILTERED_COUNT);
          await expect(appliedFilters).toHaveCount(0);
          await applyDrawer();
        }

        // The committed Apple filter: the count drops to the facet's own 17, the
        // query names the brand and one chip labels it.
        await expect(resultCount).toHaveText(APPLE_COUNT);
        await expect(page).toHaveURL((url) => onCatalogueWithBrands(url, ['apple']));
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(1);
        await expect(appliedChips.first().getByText('apple', { exact: true })).toBeVisible();
      });

      // 3. Select the second brand; the two brands OR together.
      await test.step('3. Select the second brand: `filter-brand-honor` at full HD, `drawer-brand-honor` in the drawer (then `drawer-apply`). - expect: The two brands are OR-ed: `result-count` reads "25 találat a szűrt feltételek szerint", which is the Apple facet\'s 17 plus the HONOR facet\'s 8. - expect: The address bar carries both `brand=apple` and `brand=honor`. - expect: `applied-filters` shows two chips, "apple" and "honor", and both brand facets report `aria-pressed="true"`.', async () => {
        await openDrawer();

        // The applied Apple filter is already on, so both facets read pressed
        // once the second brand joins it.
        await expect(brandApple).toHaveAttribute('aria-pressed', 'true');
        await brandHonor.click();
        await expect(brandHonor).toHaveAttribute('aria-pressed', 'true');
        await applyDrawer();

        // The two brands OR-ed: 17 + 8 = 25, both keys in the query and both
        // chips in the row.
        await expect(resultCount).toHaveText(BOTH_BRANDS_COUNT);
        await expect(page).toHaveURL((url) => onCatalogueWithBrands(url, ['apple', 'honor']));
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(2);
        await expect(appliedChips.nth(0).getByText('apple', { exact: true })).toBeVisible();
        await expect(appliedChips.nth(1).getByText('honor', { exact: true })).toBeVisible();
      });

      // 4. Select the 256 GB storage, which AND-s with the two brands.
      await test.step('4. Select the 256 GB storage: `filter-storage-256` at full HD, `drawer-storage-256` plus `drawer-apply` in the drawer. - expect: The storage facet AND-s with the brands: `result-count` reads "10 találat a szűrt feltételek szerint", the same 10 the "256 GB" facet now carries beside the two selected brands. - expect: The address bar carries `storageGb=256` beside the two `brand` parameters. - expect: `applied-filters` shows the chips "apple", "honor" and "256 GB".', async () => {
        await openDrawer();
        await storage256.click();
        await expect(storage256).toHaveAttribute('aria-pressed', 'true');
        await applyDrawer();

        // The storage bucket intersects with the brands: 10 results, the same 10
        // the 256 GB facet excludes its own filter to carry.
        await expect(resultCount).toHaveText(BRANDS_STORAGE_COUNT);
        await expect(page).toHaveURL(
          (url) =>
            onCatalogueWithBrands(url, ['apple', 'honor']) &&
            url.searchParams.get('storageGb') === '256',
        );
        await expect(appliedChips).toHaveCount(3);
        await expect(appliedChips.nth(0).getByText('apple', { exact: true })).toBeVisible();
        await expect(appliedChips.nth(1).getByText('honor', { exact: true })).toBeVisible();
        await expect(appliedChips.nth(2).getByText('256 GB', { exact: true })).toBeVisible();

        // The facet's own count, read at whichever mount this viewport shows: the
        // drawer reopened for the read, its draft discarded afterwards.
        await openDrawer();
        await expect(storage256).toContainText('256 GB (10)');
        await closeDrawer();
      });

      // 5. Select the stock switch, which keeps the ten matches.
      await test.step('5. Select the stock switch: `filter-inStock` at full HD, `drawer-inStock` plus `drawer-apply` in the drawer. - expect: The count stays at 10: "10 találat a szűrt feltételek szerint", so the filter selects another variant of the same product rather than dropping the product. - expect: The address bar carries `inStock=true` beside the other three parameters. - expect: `applied-filters` shows the fourth chip "Csak raktáron", and below 1024 px `filter-trigger` reads "Szűrők (4)".', async () => {
        // The one card the storage filter shows as sold out, read before the
        // switch: the stock filter is expected to move that product onto its
        // other 256 GB variant rather than drop it.
        const soldOutCard = cards.filter({ has: soldOutMarkers });
        await expect(soldOutCard).toHaveCount(1);
        soldOutName = (await soldOutCard.getByRole('heading', { level: 3 }).innerText()).trim();
        soldOutColour = (await soldOutCard.locator('.variant__color').innerText()).trim();

        await openDrawer();
        await inStock.click();
        await expect(inStock).toHaveAttribute('aria-pressed', 'true');
        await applyDrawer();

        // The count stays at 10, the fourth parameter joins the query and the
        // fourth chip joins the row.
        await expect(resultCount).toHaveText(BRANDS_STORAGE_COUNT);
        await expect(page).toHaveURL(
          (url) =>
            onCatalogueWithBrands(url, ['apple', 'honor']) &&
            url.searchParams.get('storageGb') === '256' &&
            url.searchParams.get('inStock') === 'true',
        );
        await expect(appliedFilters).toBeVisible();
        await expect(appliedChips).toHaveCount(4);
        await expect(appliedChips.nth(3).getByText('Csak raktáron', { exact: true })).toBeVisible();

        if (drawerViewport) {
          await expect(filterTrigger).toHaveText('Szűrők (4)');
        }
      });

      // 6. Read the ten cards of the filtered grid.
      await test.step('6. Read the ten cards of the filtered grid. - expect: Each card carries exactly one variant line, "<colour> · <gb> GB", and every one of them ends in "256 GB", so each match is one variant. - expect: No card carries `product-card-stock`: the one card that read "Elfogyott" before this switch now shows the product\'s other 256 GB variant, and the list is still ten cards. - expect: Every heading starts with one of the two selected brands\' facet labels compared case-insensitively (the facet reads "HONOR" while the headings read "Honor"), so no third brand is present.', async () => {
        // The switch dropped no product: ten cards, none of them sold out.
        await expect(soldOutMarkers).toHaveCount(0);
        await expect(cards).toHaveCount(10);

        const cardCount = await cards.count();
        for (let index = 0; index < cardCount; index += 1) {
          const card = cards.nth(index);

          // Exactly one variant line per card, and it is the 256 GB bucket, so
          // each match is one variant.
          await expect(card.locator('p.variant')).toHaveCount(1);
          await expect(card.locator('p.variant')).toHaveText(VARIANT_LINE_256);
          await expect(card.locator('.variant__storage')).toHaveText('256 GB');

          // Every heading opens with one of the two selected brands' labels,
          // compared case-insensitively: the facet reads "HONOR", the heading
          // "Honor". A third brand would fail here.
          const name = (await card.getByRole('heading', { level: 3 }).innerText()).trim();
          const lower = name.toLowerCase();
          const isSelectedBrand =
            lower.startsWith(appleLabel.toLowerCase()) ||
            lower.startsWith(honorLabel.toLowerCase());
          if (!isSelectedBrand) {
            throw new Error(`card "${name}" does not start with ${appleLabel} or ${honorLabel}`);
          }
        }

        // The one card that read "Elfogyott" before the switch is still among
        // the ten, now on the product's other 256 GB variant.
        const revivedCard = cards.filter({ hasText: soldOutName });
        await expect(revivedCard).toHaveCount(1);
        await expect(revivedCard.locator('.variant__storage')).toHaveText('256 GB');
        await expect(revivedCard.getByTestId('product-card-stock')).toHaveCount(0);
        const revivedColour = (await revivedCard.locator('.variant__color').innerText()).trim();
        expect(revivedColour).not.toBe(soldOutColour);
      });
    },
  );
});
