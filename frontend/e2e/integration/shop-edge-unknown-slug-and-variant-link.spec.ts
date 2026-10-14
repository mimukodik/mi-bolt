// spec: specs/shop-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The purchase controls are laid out differently at the two integration
// viewports. Below 1024px the desktop CTA block is `display: none` (the
// `.cta-desktop` rule in the product page stylesheet) and the sticky
// `purchase-rail` carries the same "Kosárba teszem" press as its `purchase-cta`
// and the refusal as `purchase-rail-reason`; at 1024px and wider the desktop
// block is the shown one and the rail is hidden. Both mounts stay in the DOM at
// either width, so the viewport decides which one the test drives.
const DESKTOP_MIN_WIDTH = 1024;
const UNKNOWN_SLUG = '/telefonok/nem-letezo-telefon';
const UNKNOWN_VARIANT_ID = 'nem-letezo-valtozat';

test.describe('Shop: edge paths', () => {
  // CI skips this spec (@ci-skip, BOLT-7): an unknown product slug and an unknown variant link are reported; it runs locally.
  test(
    'an unknown product slug and an unknown variant link are both reported',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      // The add control the viewport shows: the desktop CTA's inner button at
      // 1024px and wider, the sticky rail's `purchase-cta` below.
      const addControl = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      // The refusal's shown mount: `add-to-cart-reason` beside the desktop CTA,
      // `purchase-rail-reason` inside the rail below 1024px. Both mounts render
      // only while a reason exists.
      const refusal = narrowViewport
        ? page.getByTestId('purchase-rail-reason')
        : page.getByTestId('add-to-cart-reason');
      // The unknown-variant notice is the product page's own `role="status"`
      // paragraph. The page carries three more status paragraphs — the stock
      // line and both refusal mounts — and the refusal's copy is punctuated
      // differently ("nem található; válassz"), so the colon picks out the
      // notice alone.
      const variantNotice = page
        .getByRole('status')
        .filter({ hasText: 'A linkben megadott változat nem található:' });
      const colourGroup = page.getByTestId('variant-color-group');
      const storageGroup = page.getByTestId('variant-storage-group');
      const pressedColour = colourGroup.locator(
        'button[data-testid^="variant-color-"][aria-pressed="true"]',
      );

      // 1. Open the unknown slug `/telefonok/nem-letezo-telefon`.
      await test.step('Open the unknown slug `/telefonok/nem-letezo-telefon`.', async () => {
        await page.goto(UNKNOWN_SLUG);

        await expect(page.getByTestId('product-page')).toBeVisible();
        const errorState = page.getByTestId('error-state');
        await expect(errorState).toBeVisible();
        // An unknown slug is answered with the not-found branch rather than the
        // transient-error branch: this title and copy, not a generic failure.
        await expect(errorState.getByRole('heading', { level: 2 })).toHaveText(
          'A termék nem található',
        );
        await expect(
          errorState.getByText(
            'A(z) „nem-letezo-telefon” azonosítójú termék nem található. Nézd meg a telefonok listáját.',
          ),
        ).toBeVisible();
        await expect(page.getByTestId('error-hint')).toHaveText(
          'A korábban megadott értékeket megőrizzük.',
        );
        // No product chrome is rendered for the not-found state.
        await expect(page.getByTestId('product-name')).toHaveCount(0);
        await expect(page.getByTestId('product-gallery')).toHaveCount(0);
        await expect(colourGroup).toHaveCount(0);
        await expect(storageGroup).toHaveCount(0);
        await expect(page.getByTestId('add-to-cart')).toHaveCount(0);
        await expect(page.getByTestId('cart-badge')).toHaveText('0');
      });

      // 2. Read the state's single action and press it.
      await test.step("Read the state's single action and press it.", async () => {
        const action = page.getByTestId('error-state').getByRole('button');
        // An unknown slug is answered with the not-found branch, and its retry
        // carries this copy; the transient-error branch's label is another one.
        await expect(action).toHaveText('Vissza a telefonokhoz');
        await action.click();

        await expect(page).toHaveURL(/\/telefonok$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' })).toBeVisible();
        await expect(page.getByTestId('product-card').first()).toBeVisible();
        await expect(page.getByTestId('result-count')).toHaveText(
          '55 találat a szűrt feltételek szerint',
        );
      });

      // 3. Open a real product with a variant id it does not carry.
      await test.step('Open a real product with a variant id it does not carry: take the URL of the first `product-card` without a `product-card-stock` marker (the href of its `product-card-cta` link) and replace the `variant` query value with `nem-letezo-valtozat`.', async () => {
        const inStockCards = page
          .getByTestId('product-card')
          .filter({ hasNot: page.getByTestId('product-card-stock') });
        // The plan's first in-stock card carries a single storage bucket, so the
        // storage switch its step 4 asks for would have nothing to switch to.
        // The grid lists one card per (product, storage) pair
        // (docs/api/fixtures/catalog.json), so a product carrying a second
        // storage bucket is a product the grid lists twice: the scenario opens
        // the first in-stock card of such a product, and every step 3 and step 4
        // expectation still holds — the fallback is that card's own variant.
        const inStockCount = await inStockCards.count();
        const ctaPaths: string[] = [];
        for (let i = 0; i < inStockCount; i += 1) {
          const cta = inStockCards.nth(i).getByTestId('product-card-cta');
          const href = await cta.getAttribute('href');
          ctaPaths.push((href ?? '').split('?')[0]);
        }
        const cardIndex = ctaPaths.findIndex(
          (ctaPath) => ctaPaths.filter((other) => other === ctaPath).length > 1,
        );
        expect(cardIndex).not.toBe(-1);

        const card = inStockCards.nth(cardIndex);
        const ctaHref = (await card.getByTestId('product-card-cta').getAttribute('href')) ?? '';
        // The colour and storage the card showed, so the legends can be checked
        // without naming a product or a slug.
        const cardColour = ((await card.locator('.variant__color').textContent()) ?? '').trim();
        const cardStorage = ((await card.locator('.variant__storage').textContent()) ?? '').trim();
        // The card's shown variant travels to the product page; only its id is
        // swapped for one the product does not carry.
        const unknownVariantUrl = new URL(ctaHref, page.url());
        unknownVariantUrl.searchParams.set('variant', UNKNOWN_VARIANT_ID);

        await page.goto(`${unknownVariantUrl.pathname}${unknownVariantUrl.search}`);

        await expect(page.getByTestId('product-page')).toBeVisible();
        // An unknown variant id falls back to the product's first variant, the
        // one the card showed.
        await expect(colourGroup.locator('legend strong')).toHaveText(cardColour);
        await expect(storageGroup.locator('legend strong')).toHaveText(cardStorage);
        await expect(variantNotice).toHaveText(
          `A linkben megadott változat nem található: ${UNKNOWN_VARIANT_ID}. Válassz a fenti listából.`,
        );
        await expect(refusal).toHaveText(
          'A linkben megadott változat nem található; válassz a listából.',
        );
        await expect(addControl).toBeDisabled();
      });

      // 4. Choose a storage option from the selector.
      await test.step('Choose a storage option from the selector: press the first `variant-storage-*` button whose `aria-pressed` is not "true".', async () => {
        const unchosenStorage = storageGroup
          .locator('button[data-testid^="variant-storage-"][aria-pressed="false"]')
          .first();
        await expect(unchosenStorage).toBeVisible();
        // The size the button names, read off the button itself so the legend
        // and the address bar can be checked without naming a product: a
        // variant id is `<product slug>--<colour code>--<storage GB>`
        // (docs/api/fixtures/catalog.json), and the selector's own test ids
        // carry the colour code and the storage bucket.
        const chosenLabel = ((await unchosenStorage.textContent()) ?? '').trim();
        // The pressed state is read off the clicked button by its own stable
        // test id, taken before the press: the `aria-pressed="false"` filter
        // above is live, so once the press lands the clicked button stops
        // matching it and the locator re-resolves to the other storage button.
        const chosenStorageTestId = (await unchosenStorage.getAttribute('data-testid')) ?? '';
        expect(chosenStorageTestId).not.toBe('');
        await expect(pressedColour).toHaveCount(1);
        const colourTestId = (await pressedColour.getAttribute('data-testid')) ?? '';
        const colourCode = colourTestId.replace('variant-color-', '');
        const storageGb = chosenLabel.replace(' GB', '');
        const productSlug = new URL(page.url()).pathname.split('/').pop() ?? '';

        await unchosenStorage.click();

        const chosenStorage = storageGroup.getByTestId(chosenStorageTestId);
        await expect(chosenStorage).toHaveAttribute('aria-pressed', 'true');
        await expect(storageGroup.locator('legend strong')).toHaveText(chosenLabel);
        // The colour selection is preserved.
        await expect(pressedColour).toHaveCount(1);
        await expect(pressedColour).toHaveAttribute('data-testid', colourTestId);
        // The unknown-variant notice and the refusal went with the fallback
        // state, and the address bar carries the chosen variant's id.
        await expect(variantNotice).toHaveCount(0);
        await expect(refusal).toHaveCount(0);
        // The chosen variant's id is compared through the parsed URL rather
        // than through a `RegExp` built from the run's own values.
        const chosenVariantId = `${productSlug}--${colourCode}--${storageGb}`;
        await expect(page).toHaveURL((url) => url.searchParams.get('variant') === chosenVariantId);
        // The stock line and the add control follow the chosen variant: the
        // combination is either in stock, or the stock line names it gone and
        // the control is refused with its own reason.
        const stockLine = page.getByTestId('product-stock');
        await expect(stockLine).toHaveText(
          /Raktáron a demó készletben|Ez a konfiguráció elfogyott a demó készletből\./,
        );
        if (((await stockLine.textContent()) ?? '').trim() === 'Raktáron a demó készletben') {
          await expect(addControl).toBeEnabled();
        } else {
          await expect(addControl).toBeDisabled();
          await expect(refusal).toHaveText('Ez a változat jelenleg nem elérhető.');
        }
      });
    },
  );
});
