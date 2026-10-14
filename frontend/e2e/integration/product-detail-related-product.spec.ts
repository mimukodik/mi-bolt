// spec: specs/product-detail-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page mounts its add control differently at the two integration
// widths: at 1024px and wider the desktop CTA block inside `.cta-desktop` is
// shown and carries `add-to-cart-button`, while below 1024px that block is
// `display: none` and the fixed `purchase-rail` carries `purchase-cta` instead
// (product-page.scss, mobile-buy-rail.scss). The related section renders four
// `product-card` elements at both widths — its grid narrows from four columns
// to one, which is layout only — so only the add control read branches on the
// viewport.
const RAIL_MIN_WIDTH = 1024;

test.describe('Product page: variants and details', () => {
  // CI skips this spec (@ci-skip, BOLT-7): a related product opens its own page and shown variant; it runs locally.
  test(
    "following a related product opens that product's own page with its shown variant",
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const cards = page.getByTestId('product-card');
      // The first card with no "Elfogyott" marker is the first in-stock card.
      const inStockCards = cards.filter({ hasNot: page.getByTestId('product-card-stock') });
      const resultCount = page.getByTestId('result-count');
      const productPage = page.getByTestId('product-page');
      const productName = page.getByTestId('product-name');
      // The related section renders catalogue cards verbatim, so each one
      // carries the same `product-card`, heading, variant line and
      // `product-card-cta` the catalogue's cards do.
      const related = page.getByTestId('related-products');
      const relatedCards = related.getByTestId('product-card');
      const colourGroup = page.getByTestId('variant-color-group');
      const storageGroup = page.getByTestId('variant-storage-group');

      // The slug of the product opened from the catalogue, read off the
      // address bar rather than named.
      let slugName = '';

      // 1. Open `/telefonok`, wait for the grid, and open the first card
      // without a `product-card-stock` marker through its `product-card-cta`.
      // Note the slug from the address bar.
      await test.step('1. Open `/telefonok`, wait for the grid, and open the first card without a `product-card-stock` marker through its `product-card-cta`. Note the slug from the address bar.', async () => {
        await page.goto('/telefonok');

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);

        const card = inStockCards.first();
        await expect(card).toBeVisible();
        const cardHref = await card.getByTestId('product-card-cta').getAttribute('href');
        await card.getByTestId('product-card-cta').click();

        await expect(productPage).toBeVisible();
        await expect(productName).not.toBeEmpty();
        // The card's shown variant travels in the query, so the address bar
        // reads `/telefonok/<slug>?variant=<id>` for the very card opened.
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === cardHref);

        // The slug the variant id is built from, read after the assertion above
        // proved the new address rendered.
        slugName = new URL(page.url()).pathname.split('/').pop() ?? '';
      });

      // 2. Read the related section at the bottom of the page.
      await test.step('2. Read the related section at the bottom of the page.', async () => {
        await expect(related).toBeVisible();
        await expect(related.getByRole('heading', { name: 'Hasonló készülékek' })).toBeVisible();

        // Exactly four related cards, each with its own `product-card-cta`
        // labelled "Megnézem".
        await expect(relatedCards).toHaveCount(4);
        const relatedCtas = related.getByTestId('product-card-cta');
        await expect(relatedCtas).toHaveCount(4);
        await expect(relatedCtas).toHaveText(['Megnézem', 'Megnézem', 'Megnézem', 'Megnézem']);

        // Every related card shows its product's name in a heading and its
        // variant line (colour · storage), as the catalogue's cards do.
        for (let i = 0; i < 4; i += 1) {
          const card = relatedCards.nth(i);
          await expect(card.getByRole('heading', { level: 3 })).toHaveText(/\S/);
          await expect(card.locator('.variant__color')).toHaveText(/\S/);
          await expect(card.locator('.variant__storage')).toHaveText(/\S/);
        }
      });

      // 3. Read the first related card's heading text and its variant line,
      // then click its `product-card-cta`.
      await test.step("3. Read the first related card's heading text and its variant line, then click its `product-card-cta`.", async () => {
        const firstRelated = relatedCards.first();
        await expect(firstRelated).toBeVisible();

        const relatedName = (
          (await firstRelated.getByRole('heading', { level: 3 }).textContent()) ?? ''
        ).trim();
        const relatedColour = (
          (await firstRelated.locator('.variant__color').textContent()) ?? ''
        ).trim();
        const relatedStorage = (
          (await firstRelated.locator('.variant__storage').textContent()) ?? ''
        ).trim();
        const relatedHref = await firstRelated.getByTestId('product-card-cta').getAttribute('href');

        await firstRelated.getByTestId('product-card-cta').click();

        // The browser lands on that product's own page: the heading reads the
        // related card's text and the address bar its shown variant.
        await expect(productPage).toBeVisible();
        await expect(productName).toHaveText(relatedName);
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === relatedHref);

        // The selector's legends match the card's own variant line.
        await expect(colourGroup.locator('legend')).toHaveText(`Szín: ${relatedColour}`);
        await expect(storageGroup.locator('legend')).toHaveText(`Tárhely: ${relatedStorage}`);

        // The shopper moved to another product rather than staying on this one:
        // the slug in the address bar differs from the one noted in step 1.
        const otherSlug = new URL(page.url()).pathname.split('/').pop() ?? '';
        expect(otherSlug).not.toBe(slugName);
      });

      // 4. Read the opened page as a whole.
      await test.step('4. Read the opened page as a whole.', async () => {
        // A full product page rendered again, not a preview or a drawer.
        await expect(page.getByTestId('product-gallery')).toBeVisible();
        await expect(colourGroup).toBeVisible();
        await expect(storageGroup).toBeVisible();
        await expect(related).toBeVisible();
        await expect(relatedCards).toHaveCount(4);

        // The add control the viewport shows: `add-to-cart-button` at 1024px
        // and wider, `purchase-cta` below it.
        const addControl =
          (page.viewportSize()?.width ?? 0) >= RAIL_MIN_WIDTH
            ? page.getByTestId('add-to-cart-button').getByRole('button')
            : page.getByTestId('purchase-cta').getByRole('button');
        await expect(addControl).toBeVisible();
      });
    },
  );
});
