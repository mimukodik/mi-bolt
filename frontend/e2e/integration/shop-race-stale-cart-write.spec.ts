// spec: specs/shop-race-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page swaps its purchase mount at 1024px: at that width and wider
// the buy box's `add-to-cart-button` is the control on screen (the page's
// stylesheet hides the rail's `.rail`), below it `.cta-desktop` is `display:
// none` and the fixed `purchase-rail` shows its own `purchase-cta`. The same
// breakpoint decides where the add confirmation renders: the success banner is
// a child of `.cta-desktop` in the wide layout and a row of `purchase-rail` in
// the narrow one.
const RAIL_MAX_WIDTH = 1024;

// The Hungarian HUF grouping the screen renders through `PriceBlock.formatHuf`:
// the digits grouped by three from the right. `toHaveText` normalizes whitespace
// on both sides, so the plain space joined here matches the non-breaking one on
// screen.
function hufText(amount: number): string {
  const chunks: string[] = [];
  let head = String(amount);
  while (head.length > 3) {
    chunks.unshift(head.slice(-3));
    head = head.slice(0, -3);
  }
  chunks.unshift(head);
  return chunks.join(' ');
}

test.describe('Shop: a newer request wins the race', () => {
  test(
    "[E039] a second add keeps the cart's fresh version when the first add answers late",
    { tag: '@integration' },
    async ({ page }) => {
      const wideLayout = (page.viewportSize()?.width ?? 0) >= RAIL_MAX_WIDTH;

      const cards = page.getByTestId('product-card');
      const productPage = page.getByTestId('product-page');
      const productStock = page.getByTestId('product-stock');
      const productName = page.getByTestId('product-name');
      const cartBadge = page.getByTestId('cart-badge');
      const colorGroup = page.getByTestId('variant-color-group');
      const storageGroup = page.getByTestId('variant-storage-group');
      const colorLegendValue = colorGroup.locator('legend strong');
      const storageLegendValue = storageGroup.locator('legend strong');
      const unitPrice = productPage
        .locator('section[aria-label="Árak"]')
        .getByTestId('price-amount');

      // The mount this viewport shows: the desktop control in the buy box at
      // 1024px and wider, the rail's own below it. `app-button` puts the test id
      // on its host element, so the press targets the native `button` inside it.
      // The mount is also where its own add confirmation is rendered.
      const addControl = wideLayout
        ? page.getByTestId('add-to-cart-button').getByRole('button')
        : page.getByTestId('purchase-cta').getByRole('button');
      const mount = wideLayout
        ? productPage.locator('.cta-desktop')
        : page.getByTestId('purchase-rail');
      const confirmation = mount.getByTestId('status-message');
      const addToCartMount = page.getByTestId('add-to-cart');

      // Read off the screen in step 1 and held for the later steps: the phone's
      // name, the colour and storage the variant selector shows as selected, and
      // the unit price the cart line doubles. `unitAmount` starts at 0 and step 1
      // proves it is positive before it is used.
      let productNameText = '';
      let colorName = '';
      let storageLabel = '';
      let unitAmount = 0;

      const addedMessage = (quantity: number): string =>
        `${productNameText}, ${colorName}, ${storageLabel} – ${quantity} darab a kosárban.`;

      // 1. Open `/telefonok?mi-scenario=slow-once-cart-add`, wait for the grid,
      // and open the first `product-card` with no `product-card-stock` marker
      // through its `product-card-cta`.
      await test.step('1. Open `/telefonok?mi-scenario=slow-once-cart-add`, wait for the grid, and open the first `product-card` with no `product-card-stock` marker through its `product-card-cta`.', async () => {
        // The scenario query arms the fault on this page load: the first
        // `cart-add` request of it is the write the mock holds for 2000 ms.
        await page.goto('/telefonok?mi-scenario=slow-once-cart-add');

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed; the grid
        // caps at twelve cards at every width.
        await expect(page.getByTestId('result-count')).toHaveText(
          '55 találat a szűrt feltételek szerint',
        );
        await expect(cards).toHaveCount(12);

        // The first card on screen that is not out of stock: an out-of-stock
        // card carries the `product-card-stock` marker, an available one none.
        const availableCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        const availableCta = availableCard.getByTestId('product-card-cta');
        await expect(availableCta).toBeVisible();
        await availableCta.click();

        // A fresh context holds an empty cart, and the card's variant is in
        // stock on the product page it opened.
        await expect(productPage).toBeVisible();
        await expect(productStock).toHaveText('Raktáron a demó készletben');
        await expect(cartBadge).toHaveText('0');

        // The "Készülékár" amount, read after the assertions above proved the
        // product rendered; the cart line for two of this variant shows twice it.
        await expect(unitPrice).toHaveText(/\d/);
        unitAmount = Number(((await unitPrice.textContent()) ?? '').replace(/\D/g, ''));
        expect(unitAmount).toBeGreaterThan(0);

        await expect(productName).toHaveText(/\S/);
        productNameText = ((await productName.textContent()) ?? '').trim();

        // The selected colour and storage are the two groups' legends.
        await expect(colorLegendValue).toHaveText(/\S/);
        await expect(storageLegendValue).toHaveText(/\S/);
        colorName = ((await colorLegendValue.textContent()) ?? '').trim();
        storageLabel = ((await storageLegendValue.textContent()) ?? '').trim();

        // The add control this viewport shows is enabled.
        await expect(addControl).toBeEnabled();
      });

      // 2. Press that add control — this is the write the mock holds for 2000 ms
      // — and read the screen while it is in flight.
      await test.step('2. Press that add control — this is the write the mock holds for 2000 ms — and read the screen while it is in flight.', async () => {
        await addControl.click();

        // The mount disables its control for the whole held window, and says so
        // in the form its own layout uses.
        await expect(addControl).toBeDisabled();
        if (wideLayout) {
          // The desktop mount: `add-to-cart` is busy and its own status banner
          // names the running add.
          await expect(addToCartMount).toHaveAttribute('aria-busy', 'true');
          await expect(addToCartMount.getByTestId('status-message')).toContainText(
            'A termék hozzáadása a kosárhoz…',
          );
        } else {
          // The rail's `app-button` swaps to its loading label.
          await expect(addControl).toContainText('Hozzáadás…');
        }

        // The held write has not landed: the badge still reads the empty cart.
        await expect(cartBadge).toHaveText('0');

        // The variant selector stays usable, and the cart has no quantity stepper
        // and no quantity field anywhere, so the next valid cart write the screen
        // offers is this same add control.
        const disabledColor = page.locator('button[data-testid^="variant-color-"]:disabled');
        const disabledStorage = page.locator('button[data-testid^="variant-storage-"]:disabled');
        await expect(disabledColor).toHaveCount(0);
        await expect(disabledStorage).toHaveCount(0);
        await expect(page.locator('app-quantity-control')).toHaveCount(0);
        await expect(productPage.locator('input[type="number"]')).toHaveCount(0);
      });

      // 3. Wait for the held write to land, reading it from the mount's own
      // status.
      await test.step("3. Wait for the held write to land, reading it from the mount's own status.", async () => {
        // The mount's own confirmation, beside its "Bezárás" dismiss control,
        // names the quantity the cart now holds.
        await expect(confirmation).toContainText(addedMessage(1));
        await expect(confirmation.getByRole('button', { name: 'Bezárás' })).toBeVisible();

        await expect(cartBadge).toHaveText('1');

        // The add control is enabled again: the screen accepts the second valid
        // cart write.
        await expect(addControl).toBeEnabled();
      });

      // 4. Press the same add control again, without changing the selected colour
      // or storage.
      await test.step('4. Press the same add control again, without changing the selected colour or storage.', async () => {
        await addControl.click();

        // The second dispatch was accepted on top of the first, so it carried the
        // version the first write returned; a stale `If-Match` would have been
        // refused instead.
        await expect(confirmation).toContainText(addedMessage(2));
        await expect(cartBadge).toHaveText('2');

        // The confirmation was replaced by another confirmation, not by a
        // refusal: one banner, and it is not the error severity.
        await expect(confirmation).not.toHaveClass(/is-error/);
        await expect(mount.getByTestId('status-message')).toHaveCount(1);

        // The newer result survives its own late window: two samples about
        // 2500 ms apart (inside the 5 s expect timeout) both read quantity 2 and
        // no refusal, so a late answer cannot have overwritten it.
        let settledSamples = 0;
        await expect
          .poll(
            async () => {
              const text = ((await confirmation.textContent()) ?? '').trim();
              const badge = ((await cartBadge.textContent()) ?? '').trim();
              const classes = (await confirmation.getAttribute('class')) ?? '';
              const settled =
                text.includes(addedMessage(2)) && badge === '2' && !classes.includes('is-error');
              if (settled) settledSamples += 1;
              return settledSamples;
            },
            { timeout: 5000, intervals: [2500] },
          )
          .toBeGreaterThanOrEqual(2);
      });

      // 5. Open the cart with the header's `cart-link` and read it.
      await test.step("5. Open the cart with the header's `cart-link` and read it.", async () => {
        await page.getByTestId('cart-link').click();

        // The checkout layout's header carries no `cart-badge`, so the badge was
        // read in step 4; this link opens the cart page itself.
        await expect(page.getByTestId('cart-page')).toBeVisible();

        // Both writes merged into one line: the phone read in step 1, quantity 2,
        // and twice its unit price.
        const cartLine = page.getByTestId('cart-line');
        await expect(cartLine).toHaveCount(1);
        await expect(page.getByTestId('cart-line-name')).toHaveText(productNameText);
        await expect(page.getByTestId('cart-line-quantity')).toHaveText('2 db');
        await expect(cartLine.getByTestId('price-amount')).toHaveText(hufText(unitAmount * 2));
        await expect(page.getByTestId('cart-count')).toHaveText('Kosárban található termékek (1)');

        // The totals match the lines: the subtotal is the line's own amount,
        // while the total still shows the delivery-step placeholder and no
        // amount, because the shipping fee is chosen on the delivery step.
        const subtotal = page.getByTestId('order-summary-subtotal');
        await expect(subtotal).toContainText('Részösszeg');
        await expect(subtotal.getByTestId('price-amount')).toHaveText(hufText(unitAmount * 2));

        const total = page.getByTestId('order-summary-total');
        await expect(total).toContainText('Végösszeg');
        await expect(total).toContainText('Nincs megjeleníthető ár.');
        await expect(total.getByTestId('price-amount')).toHaveCount(0);

        // Neither write was refused and no conflict was surfaced.
        await expect(page.getByTestId('cart-notice')).toHaveCount(0);
        await expect(page.locator('[data-testid="status-message"].is-error')).toHaveCount(0);
      });
    },
  );
});
