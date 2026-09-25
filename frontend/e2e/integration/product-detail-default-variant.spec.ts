// spec: specs/product-detail-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page lays the add control out differently at the two integration
// widths: at 1024px and wider the desktop CTA block inside `.cta-desktop` is
// shown and carries `add-to-cart-button`, while below 1024px that block is
// `display: none` and the sticky `purchase-rail` carries `purchase-cta` instead
// (product-page.scss and mobile-buy-rail.scss). The variant selector, the
// gallery and the detail blocks are the same at both widths, so only the add
// control branches on the viewport.
const RAIL_MIN_WIDTH = 1024;

test.describe('Product page: variants and details', () => {
  test(
    "a product address with no variant query shows the product's default variant and the phone's details",
    { tag: '@integration' },
    async ({ page }) => {
      const cards = page.getByTestId('product-card');
      const productPage = page.getByTestId('product-page');
      const productName = page.getByTestId('product-name');
      const colourGroup = page.getByTestId('variant-color-group');
      const storageGroup = page.getByTestId('variant-storage-group');
      // A refused pair renders its reason as a `<p class="reason">` inside the
      // group the refusal belongs to. The default variant offers every pair, so
      // neither group renders one.
      const colourReasons = colourGroup.locator('.reason');
      const storageReasons = storageGroup.locator('.reason');
      // The page's own "Készülékár" block. The mobile rail and every related
      // card render a `price-amount` too, so the block is scoped by its own
      // section (product-page.html `aria-label="Árak"`).
      const devicePrice = page.locator('section[aria-label="Árak"]').getByTestId('price-amount');
      const gallery = page.getByTestId('product-gallery');
      // The thumbnail is a button carrying the `gallery-thumb-*` test id; the
      // image inside it carries `gallery-thumb-image`, so the count is scoped to
      // the buttons.
      const galleryThumbs = gallery.locator('button[data-testid^="gallery-thumb-"]');
      const highlights = page.locator('ul[aria-label="A termék fő jellemzői"]');
      // The invalid-variant notice is a `role="status"` paragraph beginning with
      // this sentence; `product-stock` is a `role="status"` too, so the notice is
      // matched by its text rather than by the role alone.
      const invalidVariantNotice = page
        .getByRole('status')
        .filter({ hasText: 'A linkben megadott változat nem található' });

      // The card's heading text and the path its CTA points at, read before the
      // navigation and compared after it.
      let cardHeading = '';
      let productPath = '';

      // 1. Open `/telefonok` and wait for the grid.
      await test.step('1. Open `/telefonok` and wait for the grid.', async () => {
        await page.goto('/telefonok');

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(page.getByTestId('result-count')).toHaveText(
          '55 találat a szűrt feltételek szerint',
        );
        await expect(cards).toHaveCount(12);
      });

      // 2. Read the first card's `product-card-cta` href, note its path, and
      // open that path with the query dropped: `page.goto` to
      // `/telefonok/<slug>` with no `?variant=`.
      await test.step("2. Read the first card's `product-card-cta` href, note its path, and open that path with the query dropped: `page.goto` to `/telefonok/<slug>` with no `?variant=`.", async () => {
        const card = cards.first();
        const cardHref = (await card.getByTestId('product-card-cta').getAttribute('href')) ?? '';
        // The path with its query dropped, so the page is opened exactly as the
        // card links to it but without the variant the card carried. The product
        // is never named: the slug comes off the card's own href.
        productPath = cardHref.split('?')[0];
        cardHeading = (await card.getByRole('heading', { level: 3 }).innerText()).trim();

        await page.goto(productPath);

        await expect(productPage).toBeVisible();
        await expect(productName).toHaveText(cardHeading);

        // The address bar carries no `variant` parameter: the page writes a
        // query only when the shopper changes the variant.
        await expect(page).toHaveURL(
          (url) => url.pathname === productPath && !url.searchParams.has('variant'),
        );

        // No invalid-variant notice is rendered and no pair is refused.
        await expect(invalidVariantNotice).toHaveCount(0);
        await expect(colourReasons).toHaveCount(0);
        await expect(storageReasons).toHaveCount(0);
      });

      // 3. Read the variant selector and the buy panel.
      await test.step('3. Read the variant selector and the buy panel.', async () => {
        // The pressed buttons are the first variant the product lists.
        await expect(colourGroup).toContainText('Szín: Zöld');
        await expect(storageGroup).toContainText('Tárhely: 256 GB');
        await expect(page.getByTestId('variant-color-zold')).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await expect(page.getByTestId('variant-storage-256')).toHaveAttribute(
          'aria-pressed',
          'true',
        );

        // The "Készülékár" block and the stock message.
        await expect(devicePrice).toHaveText('89 990');
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');

        // The add control the viewport shows is enabled: `add-to-cart-button` at
        // 1024px and wider, `purchase-cta` below it.
        const addControl =
          (page.viewportSize()?.width ?? 0) >= RAIL_MIN_WIDTH
            ? page.getByTestId('add-to-cart-button').getByRole('button')
            : page.getByTestId('purchase-cta').getByRole('button');
        await expect(addControl).toBeVisible();
        await expect(addControl).toBeEnabled();
      });

      // 4. Read the gallery of that default variant.
      await test.step('4. Read the gallery of that default variant.', async () => {
        // The variant carries a single image, so there is one thumbnail and no
        // stepper to drive.
        await expect(gallery).toBeVisible();
        await expect(galleryThumbs).toHaveCount(1);
        await expect(page.getByTestId('gallery-prev')).toHaveCount(0);
        await expect(page.getByTestId('gallery-next')).toHaveCount(0);
        await expect(page.getByTestId('gallery-count')).toHaveCount(0);

        // The main image's alt is the product name followed by the selected
        // colour.
        await expect(page.getByTestId('gallery-main').locator('img')).toHaveAttribute(
          'alt',
          / Zöld$/,
        );
      });

      // 5. Read the highlights, the description and the simulation note.
      await test.step('5. Read the highlights, the description and the simulation note.', async () => {
        await expect(highlights).toBeVisible();
        await expect(highlights.locator('li')).toHaveText([
          '5000 mAh akkumulátor',
          '6,67" pOLED kijelző',
          '50 + 13 MP kamera',
        ]);

        // The "Termékleírás" heading stands above the description, which runs on
        // about the insurance premium and the excess.
        await expect(page.getByRole('heading', { level: 2, name: 'Termékleírás' })).toBeVisible();
        await expect(page.getByTestId('product-description')).toHaveText(
          /^Az első hónapban 0 Ft! Ha nincs szükséged rá, később bármikor lemondhatod\./,
        );

        await expect(page.getByTestId('product-simulation-note')).toHaveText(
          'A rendelés kipróbálható, de nem jár valódi vásárlással.',
        );

        // The page's own section headings, in order.
        await expect(page.getByRole('heading', { level: 2 })).toHaveText([
          'Termékleírás',
          'Műszaki adatok',
          'Hasonló készülékek',
        ]);
      });
    },
  );
});
