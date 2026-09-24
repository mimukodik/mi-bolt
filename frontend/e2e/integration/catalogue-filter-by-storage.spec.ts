// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The sidebar filter mount takes over at 1024px (catalog-page.scss:86-102).
// Below that the catalogue hides the sidebar (catalog-page.scss:98-102) and
// serves the same facet groups in the drawer the toolbar's `filter-trigger`
// opens, committing its draft with `drawer-apply` (filter-drawer.ts:322-343).
const SIDEBAR_MIN_WIDTH = 1024;

// The loaded counter reads "<n> találat a szűrt feltételek szerint"; while the
// first response is in flight it reads "Keresés a katalógusban…", and the lead
// digit of 1-9 is what puts "n greater than 0" into the assertion.
const RESULT_COUNT_PATTERN = /^\s*[1-9]\d* találat a szűrt feltételek szerint\s*$/;

// A storage facet button reads "<gb> GB (<count>)": the label stands in
// `.option__label` and the count in the `.option__count` span nested inside it,
// which the template opens with `&nbsp;` (filter-panel.html:159-170,
// filter-drawer.html:142-153). The button's raw text is therefore the label,
// the template's collapsed whitespace and then that non-breaking space, so the
// two parts are asserted separately: a string `toContainText` normalises the
// whitespace between them, while a RegExp `toHaveText` matches the count span's
// raw text, which starts with the U+00A0 the `&nbsp;` writes.
const STORAGE_FACET_COUNT_PATTERN = /^\s*\(\d+\)$/;

test.describe('Catalogue: browse, filter, sort and page', () => {
  test('filtering by storage narrows the catalogue', { tag: '@integration' }, async ({ page }) => {
    // The two mounts the plan's overview names: the sidebar carries the
    // `filter-*` controls at the full HD viewport, and the drawer the
    // `drawer-*` ones, opened by `filter-trigger` and committed by
    // `drawer-apply`.
    const desktopViewport = (page.viewportSize()?.width ?? 0) >= SIDEBAR_MIN_WIDTH;
    const storageGroupTestId = desktopViewport ? 'filter-group-storage' : 'drawer-group-storage';
    const storageFacetPrefix = desktopViewport ? 'filter-storage-' : 'drawer-storage-';
    // The storage group renders one button per documented bucket and never
    // disables a bucket for a zero count — only `disabled()` does
    // (filter-panel.html:154, filter-drawer.html:136) — so the first button
    // is the facet this scenario picks.
    const storageGroup = page.getByTestId(storageGroupTestId);
    const storageFacets = storageGroup.locator(`button[data-testid^="${storageFacetPrefix}"]`);
    const firstStorage = storageFacets.first();
    const cards = page.getByTestId('product-card');
    const resultCount = page.getByTestId('result-count');

    // Read in one step, checked in a later one.
    let unfilteredTotal = 0;
    let listedStorageGilobytes: number[] = [];
    let storageGb = 0;
    let storageLabel = '';

    // 1. Open /telefonok and wait for the grid. Note the number in result-count.
    await test.step('1. Open /telefonok and wait for the grid. Note the number in result-count: the loading state catalog-loading gives way to the grid, the grid holds at least one product-card, and result-count reads "<n> találat a szűrt feltételek szerint" with n greater than 0.', async () => {
      await page.goto('/telefonok');
      // The grid wrapper is in the template from the first render; while the
      // first response is in flight it holds the catalog-loading skeleton
      // instead of any card, so the loader's disappearance together with a
      // card appearing is what proves the response landed.
      await expect(page.getByTestId('catalog-loading')).toBeHidden();
      await expect(cards.first()).toBeVisible();
      await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
      unfilteredTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);
    });

    // 2. Read the first storage facet button of the "Tárhely" group and activate it.
    await test.step('2. Read the first storage facet button of the "Tárhely" group — filter-storage-<gb> in the sidebar, or drawer-storage-<gb> after opening the drawer with filter-trigger at the mobile viewport — and activate it: its label reads "<gb> GB (<count>)" and it becomes selected with aria-pressed="true".', async () => {
      if (!desktopViewport) {
        // Below 1024px the facets exist only inside the drawer.
        await page.getByTestId('filter-trigger').click();
        await expect(page.getByTestId('filter-drawer')).toBeVisible();
      }

      await expect(firstStorage).toBeVisible();

      // Every bucket the catalogue holds, read before the filter so the group
      // can be checked against the same list afterwards.
      const listedFacets = await storageFacets.count();
      listedStorageGilobytes = [];
      for (let index = 0; index < listedFacets; index += 1) {
        const facetTestId = (await storageFacets.nth(index).getAttribute('data-testid')) ?? '';
        listedStorageGilobytes.push(
          Number.parseInt(facetTestId.slice(storageFacetPrefix.length), 10),
        );
      }
      expect(listedStorageGilobytes.length).toBeGreaterThan(0);

      const storageTestId = (await firstStorage.getAttribute('data-testid')) ?? '';
      storageGb = Number.parseInt(storageTestId.slice(storageFacetPrefix.length), 10);
      storageLabel = `${String(storageGb)} GB`;

      // The label names the bucket and its count, the count behind the
      // non-breaking space the template writes (filter-panel.html:159-170), so
      // the text is normalised and the bucket is matched against the test id.
      const labelText = (await firstStorage.innerText()).replace(/\s+/g, ' ').trim();
      const labelMatch = /^(\d+) GB \((\d+)\)$/.exec(labelText);
      expect(labelMatch).not.toBeNull();
      expect(Number.parseInt(labelMatch?.[1] ?? '0', 10)).toBe(storageGb);
      const storageCount = Number.parseInt(labelMatch?.[2] ?? '0', 10);
      await expect(firstStorage).toContainText(`${storageLabel} (${storageCount})`);

      await firstStorage.click();

      // The facet reports its own selection state (filter-panel.html:147-158):
      // aria-pressed flips and the check mark renders inside the button. At
      // the mobile mount the drawer is still open here, because it is
      // `drawer-apply` that commits the draft (filter-drawer.ts:322-343).
      await expect(firstStorage).toHaveAttribute('aria-pressed', 'true');
      await expect(firstStorage).toContainText('✓');
    });

    // 3. Check the URL and the chips.
    await test.step('3. Check the URL and the chips: the URL query string carries storageGb=<gb>, the applied chip reads "<gb> GB" with applied-chip-remove-storage beside it, and the result count reads "<m> találat a szűrt feltételek szerint" with m smaller than the unfiltered n.', async () => {
      if (!desktopViewport) {
        await page.getByTestId('drawer-apply').getByRole('button').click();
        await expect(page.getByTestId('filter-drawer')).toBeHidden();
      }

      // `storageGb` is the canonical query key the catalogue serialises
      // (catalog-query.ts:288-297); the value is read from the page's own
      // query, so it is compared decoded.
      await expect(page).toHaveURL(/\/telefonok(\?|$)/);
      await expect
        .poll(() => new URL(page.url()).searchParams.get('storageGb'))
        .toBe(String(storageGb));

      const appliedChip = page.getByTestId('applied-chip');
      await expect(page.getByTestId('applied-filters')).toBeVisible();
      await expect(appliedChip).toHaveCount(1);
      // The chip's label is the bucket itself, "<gb> GB"
      // (catalog-query.ts:349-356).
      await expect(appliedChip.getByText(storageLabel, { exact: true })).toBeVisible();
      await expect(page.getByTestId('applied-chip-remove-storage')).toBeVisible();

      // The counter keeps the unfiltered total until the filtered response
      // lands, so waiting for that text to change is what proves it arrived.
      await expect(resultCount).not.toHaveText(
        `${String(unfilteredTotal)} találat a szűrt feltételek szerint`,
      );
      await expect(resultCount).toHaveText(RESULT_COUNT_PATTERN);
      const filteredTotal = Number.parseInt((await resultCount.innerText()).trim(), 10);
      expect(filteredTotal).toBeLessThan(unfilteredTotal);
    });

    // 4. Check the grid.
    await test.step('4. Check the grid: every visible card\'s variant line ends with "<gb> GB", and the storage facet lists every size the catalogue holds, each with its recalculated count.', async () => {
      // Each card shows one variant, and its storage is the item's own bucket
      // (product-card.html:43-47, product-card.ts:43-46); the catalogue filters
      // its items by `storageGb`, so the first card settling on the chosen
      // bucket is what proves the filtered response has landed — and the
      // counter read below then belongs to the filtered page.
      const variantStorages = cards.locator('.variant__storage');
      await expect(variantStorages.first()).toHaveText(storageLabel);

      const variantStorageCount = await variantStorages.count();
      for (let index = 0; index < variantStorageCount; index += 1) {
        await expect(variantStorages.nth(index)).toHaveText(storageLabel);
      }

      if (!desktopViewport) {
        // The facets live in the drawer at this viewport, so the group is
        // reopened to be read; `drawer-cancel` leaves the applied query alone.
        await page.getByTestId('filter-trigger').click();
        await expect(page.getByTestId('filter-drawer')).toBeVisible();
      }

      // The group still lists every bucket the catalogue holds, the chosen one
      // keeping its selection, each button carrying its own count: the storage
      // facet excludes its own filter, so the buttons do not collapse to the
      // bucket the click selected.
      await expect(firstStorage).toHaveAttribute('aria-pressed', 'true');
      await expect(storageFacets).toHaveCount(listedStorageGilobytes.length);

      const facetGilobytes: number[] = [];
      const facetCount = await storageFacets.count();
      for (let index = 0; index < facetCount; index += 1) {
        const facet = storageFacets.nth(index);
        const facetTestId = (await facet.getAttribute('data-testid')) ?? '';
        const facetGb = Number.parseInt(facetTestId.slice(storageFacetPrefix.length), 10);
        facetGilobytes.push(facetGb);

        // The label names the bucket and its count sits in the nested span,
        // so the two are read as the parts they are.
        const facetLabel = facet.locator('.option__label');
        await expect(facetLabel).toContainText(`${String(facetGb)} GB`);
        const facetCountSpan = facetLabel.locator('.option__count');
        await expect(facetCountSpan).toHaveText(STORAGE_FACET_COUNT_PATTERN);
      }
      expect(facetGilobytes).toEqual(listedStorageGilobytes);

      if (!desktopViewport) {
        await page.getByTestId('drawer-cancel').getByRole('button').click();
        await expect(page.getByTestId('filter-drawer')).toBeHidden();
      }
    });
  });
});
