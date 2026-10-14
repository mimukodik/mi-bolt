// spec: specs/product-detail-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The specification boxes narrow with the viewport — three columns at 1024px
// and wider, two from 640px, one below (specification-accordion.scss). The
// width changes the layout only: the `specification-accordion` component
// renders always-open boxes at every width, so nothing here branches on which
// control a width shows, unlike the purchase rail.
function expectedColumnCount(viewportWidth: number): string {
  if (viewportWidth >= 1024) return '3';
  if (viewportWidth >= 640) return '2';
  return '1';
}

test.describe('Product page: variants and details', () => {
  // CI skips this spec (@ci-skip, BOLT-7): every specification group is always open; it runs locally.
  test(
    'the specification section: every group is always open and there is no control to close it',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const cards = page.getByTestId('product-card');
      const productPage = page.getByTestId('product-page');
      const specAccordion = page.getByTestId('spec-accordion');
      // Each specification group is a bordered box carrying a `spec-group-<id>`
      // test id; its rows are label/value pairs inside the box's description
      // list.
      const groups = specAccordion.locator('[data-testid^="spec-group-"]');
      const rows = specAccordion.locator('dl > .row');

      // 1. Open `/telefonok`, wait for the grid, and open the first card without a `product-card-stock` marker through its `product-card-cta`.
      await test.step('1. Open `/telefonok`, wait for the grid, and open the first card without a `product-card-stock` marker through its `product-card-cta`.', async () => {
        await page.goto('/telefonok');

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(page.getByTestId('result-count')).toHaveText(
          '55 találat a szűrt feltételek szerint',
        );
        await expect(cards).toHaveCount(12);

        // The first card the mock serves in stock: no `product-card-stock`
        // marker ("Elfogyott") on it. The product is never named — the card is
        // picked by what the screen shows.
        await cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first()
          .getByTestId('product-card-cta')
          .click();

        // The specification section sits under the page's header and detail
        // blocks, both of which the same route renders.
        await expect(productPage).toBeVisible();
        await expect(specAccordion).toBeVisible();
      });

      // 2. Read the specification section.
      await test.step('2. Read the specification section.', async () => {
        // The h2 "Műszaki adatok" stands above the accordion inside the page's
        // own section, and the accordion host carries the same accessible name,
        // so both are named regions and the role matches two elements. The
        // outer of the two is the one holding the h2 and the boxes.
        const specSection = page.locator('section[aria-label="Műszaki adatok"]').first();
        await expect(
          specSection.getByRole('heading', { level: 2, name: 'Műszaki adatok' }),
        ).toBeVisible();
        await expect(page.getByRole('region', { name: 'Műszaki adatok' })).toHaveCount(2);
        await expect(specSection.getByTestId('spec-accordion')).toBeVisible();

        // Eleven boxes, in the plan's order.
        await expect(groups).toHaveCount(11);
        await expect(specAccordion.getByRole('heading', { level: 3 })).toHaveText([
          'Fizikai jellemzők',
          'Rendszer',
          'Memória',
          'Energiahatékonyság',
          'Kijelző',
          'Kamera',
          'Csomag tartalma',
          'Töltési adatok',
          'Hálózat',
          'Vezetékes és vezetéknélküli kapcsolat',
          'Biztonsági funkciók',
        ]);

        // Every box is a bordered panel whose h3 title sits directly above its
        // description list, and every box carries at least one label/value row.
        await expect(groups.locator('h3 + dl')).toHaveCount(11);
        await expect(groups.filter({ has: page.locator('dl > .row > dt') })).toHaveCount(11);

        // The first group's rows, on the default fixture's first in-stock card.
        const physical = page.getByTestId('spec-group-fizikai-jellemzok');
        await expect(physical).toHaveCSS('border-top-width', '2px');
        await expect(physical).toHaveCSS('border-top-style', 'solid');
        await expect(
          physical.getByRole('heading', { level: 3, name: 'Fizikai jellemzők' }),
        ).toBeVisible();
        await expect(physical.locator('dl > .row')).toHaveCount(3);
        await expect(physical.locator('dt')).toHaveText(['Súly', 'Méret', 'Kialakítás']);
        await expect(physical.locator('dd')).toHaveText([
          '175 g',
          '161,9 x 73,06 x 7,79 mm',
          'Érintőképernyős',
        ]);
      });

      // 3. Look for a control that would open or close a group, and try to close one.
      await test.step('3. Look for a control that would open or close a group, and try to close one.', async () => {
        // Nothing on the screen opens or closes a box: the
        // `specification-accordion` component renders always-open panels, so
        // there is no disclosure control to press and no group to collapse.
        await expect(specAccordion.locator('details')).toHaveCount(0);
        await expect(specAccordion.locator('summary')).toHaveCount(0);
        await expect(specAccordion.locator('button')).toHaveCount(0);

        // Every box and every label/value row renders visible on load, without
        // any interaction, at both viewport widths.
        await expect(groups.filter({ visible: false })).toHaveCount(0);
        await expect(rows.filter({ visible: false })).toHaveCount(0);

        // The boxes flow in columns that narrow with the viewport: the layout
        // changes with the width, what is open never does.
        const viewportWidth = page.viewportSize()?.width ?? 0;
        await expect(specAccordion.locator('.boxes')).toHaveCSS(
          'column-count',
          expectedColumnCount(viewportWidth),
        );
      });
    },
  );
});
