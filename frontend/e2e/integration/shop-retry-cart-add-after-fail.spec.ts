// spec: specs/shop-retry-paths.md
// seed: e2e/seed.spec.ts

import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures/coverage';

// The product page swaps its buy chrome at 1024px: at that width and wider the
// buy panel shows the desktop CTA block (`.cta-desktop`, carrying
// `add-to-cart-button` and its own status message) and the fixed rail is
// `display: none`; below it the desktop block is `display: none` and the rail
// (`purchase-rail` with `purchase-cta` and its own status message) is the
// visible mount. Both mounts stay in the DOM at either width and both read the
// page's single `addError` / `addSuccessMessage`, so the viewport decides which
// one a step drives and reads.
const DESKTOP_MIN_WIDTH = 1024;

// The refusal copy `describeAddFailure` composes for a cart-add failure that is
// not a per-product quantity limit. It names neither the 503 nor the server:
// the shopper only learns that the add failed and the cart is unchanged.
const ADD_REFUSAL = 'A termék hozzáadása nem sikerült; a kosár változatlan.';

test.describe('Shop: retry after one failure', () => {
  // CI skips this spec (@ci-skip, BOLT-7): a retried add after a failure joins the same cart line; it runs locally.
  test(
    '[E058] the cart keeps its line and the retried add joins the same line',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN_WIDTH;
      const catalogGrid = page.getByTestId('catalog-grid');
      const cards = page.getByTestId('product-card');
      const productPage = page.getByTestId('product-page');
      const productName = page.getByTestId('product-name');
      // The "Készülékár" block inside the product's own "Árak" region: the
      // mobile rail and the related cards carry other price blocks.
      const devicePrice = page
        .getByRole('region', { name: 'Árak', exact: true })
        .getByTestId('price-amount');
      const cartBadge = page.getByTestId('cart-badge');
      const cartPage = page.getByTestId('cart-page');
      const cartLines = page.getByTestId('cart-line');
      const cartCount = page.getByTestId('cart-count');
      const subtotal = page.getByTestId('order-summary-subtotal');
      const total = page.getByTestId('order-summary-total');
      // The selected option of each variant group: the legend names the current
      // colour and storage, and the confirmation repeats both.
      const colorLegend = page.getByTestId('variant-color-group').locator('legend strong');
      const storageLegend = page.getByTestId('variant-storage-group').locator('legend strong');

      /** The add control in the mount the viewport shows. */
      const addControl = desktopViewport
        ? page.getByTestId('add-to-cart-button').getByRole('button')
        : page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button');

      // The page's one status message in the mount the viewport shows. The
      // refusal (role `alert`) and the confirmation (role `status`) are the
      // same element and only one is rendered at a time; the other mount's copy
      // stays in the DOM painted out.
      const statusMessage = desktopViewport
        ? page.locator('.cta-desktop').getByTestId('status-message')
        : page.getByTestId('purchase-rail').getByTestId('status-message');

      /** The trimmed text of a locator, '' when it renders nothing. */
      const textOf = async (target: Locator): Promise<string> =>
        ((await target.textContent()) ?? '').replace(/\s+/g, ' ').trim();

      /** The digits of a `price-amount` as an integer. The amount renders its
       *  thousands with a non-breaking space (price-block), so the comparison
       *  is made on the parsed number rather than on the text. */
      const priceOf = async (target: Locator): Promise<number> =>
        Number((await textOf(target)).replace(/\D/g, ''));

      // The phone is never pinned: the scenario picks its card by what the
      // screen shows and reads every expected value off the page.
      let phoneName = '';
      let variantLabel = '';
      let price = 0;

      await test.step('1. Open the catalogue with the once-only add fault on the first load: `/telefonok` with `?mi-scenario=fail-once-cart-add`, and wait for the grid. Open the first `product-card` that carries no `product-card-stock` marker through its `product-card-cta`, read `product-name` (call it the phone) and the digits of its "Készülékár" `price-amount` (call it P), then press the add control of the mount the viewport shows once: the inner button of `add-to-cart-button` at 1024 px and wider, `purchase-cta` inside `purchase-rail` below 1024 px. - expect: A visible `status-message` with role `alert` appears reading exactly "A termék hozzáadása nem sikerült; a kosár változatlan." with a "Bezárás" button: the first add of the page load was refused by the once-only fault. - expect: The banner carries no retry control of its own, so pressing the add control again IS the retry. - expect: The cart is untouched and the product page shows no `error-state`: `cart-badge` in the shop header reads "0".', async () => {
        // The fault is read from the query on this first load and held by the
        // mock for the rest of the browsing context, so the first `POST
        // /cart/items` of this page load answers 503.
        await page.goto('/telefonok?mi-scenario=fail-once-cart-add');

        // Only the `cart-add` endpoint is broken, so the list endpoint answers
        // as usual and the grid renders.
        await expect(catalogGrid).toBeVisible();
        await expect(cards.first()).toBeVisible();

        // Picking by what the screen shows: the "Elfogyott" marker in the card
        // is `product-card-stock`, so the first card without one is in stock.
        const firstAvailableCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(firstAvailableCard).toBeVisible();
        await firstAvailableCard.getByTestId('product-card-cta').click();

        // The single-product endpoint is unaffected, so the page shows the
        // product itself.
        await expect(productPage).toBeVisible();
        await expect(productName).not.toBeEmpty();
        await expect(devicePrice).toBeVisible();
        await expect(devicePrice).toHaveText(/\d/);

        // The reads come after the assertions above proved the product page's
        // own state rendered.
        phoneName = await textOf(productName);
        expect(phoneName).not.toBe('');
        const colour = await textOf(colorLegend);
        const storage = await textOf(storageLegend);
        expect(colour).not.toBe('');
        expect(storage).not.toBe('');
        variantLabel = `${colour}, ${storage}`;
        price = await priceOf(devicePrice);
        expect(price).toBeGreaterThan(0);

        // A fresh browsing context starts on the mock's empty cart.
        await expect(cartBadge).toHaveText('0');
        await expect(addControl).toBeEnabled();
        await addControl.click();

        // The first add of the page load was refused by the once-only fault:
        // the mount on screen shows the shared `StatusMessage` at severity
        // `error` — the role `alert` live region — carrying the page's own
        // refusal copy. While the request is in flight the same element shows
        // the `info` notice, so these assertions retry until the refusal lands.
        await expect(statusMessage).toHaveRole('alert');
        await expect(statusMessage.getByText(ADD_REFUSAL, { exact: true })).toBeVisible();

        // The banner carries no retry control of its own: its only button is
        // "Bezárás", so pressing the add control again IS the retry.
        await expect(statusMessage.getByRole('button')).toHaveCount(1);
        await expect(statusMessage.getByRole('button', { name: 'Bezárás' })).toBeVisible();

        // The refused add leaves the cart untouched and the page keeps its own
        // state rather than an error state of its own.
        await expect(cartBadge).toHaveText('0');
        await expect(productPage.getByTestId('error-state')).toHaveCount(0);
      });

      await test.step('2. Press the same add control again to retry. - expect: The confirmation `status-message` reads "<phone name>, <colour>, <n> GB – 1 darab a kosárban." with a "Bezárás" button. - expect: `cart-badge` reads "1": the retry added the phone exactly once, so the cart now holds one line at quantity 1.', async () => {
        await addControl.click();

        // The once-only fault already fired for this page load and a retry
        // inside the page builds no new handler list, so the re-issued request
        // succeeds: the same mount now carries the success message, role
        // `status`, naming the phone, its colour, its storage and the quantity.
        await expect(statusMessage).toHaveRole('status');
        await expect(statusMessage).toContainText(
          `${phoneName}, ${variantLabel} – 1 darab a kosárban.`,
        );
        await expect(statusMessage.getByRole('button', { name: 'Bezárás' })).toBeVisible();

        // Exactly one add landed, so the header badge counts one line.
        await expect(cartBadge).toHaveText('1');
      });

      await test.step('3. Arm the fault again while the cart stays: `page.goto(\'/telefonok?mi-scenario=fail-once-cart-add\')`, then open the same phone\'s product page again through the `product-card-cta` of the card whose `product-name` is the phone read in step 1, and press the add control of the mount the viewport shows once more. - expect: `cart-badge` still reads "1" before the press, because the same scenario name keeps the same cart across the page load. - expect: The add is refused again: the same `status-message` with role `alert` reads "A termék hozzáadása nem sikerült; a kosár változatlan." and `cart-badge` still reads "1", so the refused mutation changed nothing.', async () => {
        // Each page load builds a new handler list, so a `goto` that keeps the
        // query arms the once-only fault again; the same scenario name also
        // namespaces the stored cart, so the cart survives the load.
        await page.goto('/telefonok?mi-scenario=fail-once-cart-add');
        await expect(catalogGrid).toBeVisible();
        await expect(cards.first()).toBeVisible();
        await expect(cartBadge).toHaveText('1');

        // The same phone, picked by the name the screen shows.
        const samePhoneCard = cards.filter({ hasText: phoneName }).first();
        await expect(samePhoneCard).toBeVisible();
        await samePhoneCard.getByTestId('product-card-cta').click();

        await expect(productPage).toBeVisible();
        await expect(productName).toHaveText(phoneName);
        await expect(addControl).toBeEnabled();
        await addControl.click();

        // The re-armed fault refuses this add too, and the refused mutation
        // changes nothing in the cart.
        await expect(statusMessage).toHaveRole('alert');
        await expect(statusMessage.getByText(ADD_REFUSAL, { exact: true })).toBeVisible();
        await expect(cartBadge).toHaveText('1');
      });

      await test.step('4. Check the prior cart is retained: click the header\'s `cart-link`. - expect: `cart-page` is visible with exactly one `cart-line`, its `cart-line-name` the phone\'s name and its `cart-line-quantity` "1 db". - expect: That line\'s "Részösszeg" `price-amount` reads P, `order-summary-subtotal`\'s `price-amount` reads P, and `order-summary-total` still shows the "Végösszeg" placeholder ("—" with "Nincs megjeleníthető ár."): the previous line, quantity and total are all unchanged. - expect: `cart-count` reads "Kosárban található termékek (1)" and no second `cart-line` exists. - expect: `cart-badge` is not rendered on this screen, because the cart renders under the checkout header; the badge is read on a shop screen.', async () => {
        await page.getByTestId('cart-link').click();

        // The cart was never written by either refusal, so it still holds the
        // one line the successful retry added.
        await expect(cartPage).toBeVisible();
        await expect(cartLines).toHaveCount(1);
        await expect(cartLines.first().getByTestId('cart-line-name')).toHaveText(phoneName);
        await expect(cartLines.first().getByTestId('cart-line-quantity')).toHaveText('1 db');

        // The line's own "Részösszeg" block is its unit price, read from the
        // line rather than page-wide (the summary carries another one).
        const lineAmount = cartLines.first().getByTestId('price-amount');
        await expect(lineAmount).toBeVisible();
        expect(await priceOf(lineAmount)).toBe(price);

        const subtotalAmount = subtotal.getByTestId('price-amount');
        await expect(subtotalAmount).toBeVisible();
        expect(await priceOf(subtotalAmount)).toBe(price);

        // The shipping fee is chosen on the delivery step, so the total still
        // shows the "Végösszeg" placeholder rather than an amount.
        await expect(total).toContainText('Végösszeg');
        await expect(total.getByTestId('price-empty')).toHaveText('—');
        await expect(total).toContainText('Nincs megjeleníthető ár.');
        await expect(total.getByTestId('price-amount')).toHaveCount(0);

        await expect(cartCount).toHaveText('Kosárban található termékek (1)');

        // The cart renders under the checkout header, which carries no
        // `cart-badge`: the badge is read on a shop screen.
        await expect(cartBadge).toHaveCount(0);
      });

      await test.step('5. Retry the refused add: press the browser\'s Back to return to the phone\'s product page (in-app, no page load), then press the add control of the mount the viewport shows once more. - expect: The confirmation reads "<phone name>, <colour>, <n> GB – 2 darab a kosárban.". - expect: `cart-badge` reads "2", and it is read here on the shop screen because the cart screen carries none.', async () => {
        // Back is an in-app navigation, so no page load happens and no new
        // handler list is built: the fault that already fired for this load
        // does not fire again, and the refusal banner goes with the page it
        // belonged to.
        await page.goBack();
        await expect(productPage).toBeVisible();
        await expect(productName).toHaveText(phoneName);
        await expect(statusMessage).toHaveCount(0);
        await expect(cartBadge).toHaveText('1');

        await expect(addControl).toBeEnabled();
        await addControl.click();

        // The retry recovers: the confirmation repeats the phone's own colour
        // and storage and names the line's new quantity.
        await expect(statusMessage).toHaveRole('status');
        await expect(statusMessage).toContainText(
          `${phoneName}, ${variantLabel} – 2 darab a kosárban.`,
        );

        // The badge is read here, on the shop screen: the cart screen carries
        // none.
        await expect(cartBadge).toHaveText('2');
      });

      await test.step('6. Open the cart with the header\'s `cart-link`. - expect: The cart holds exactly one `cart-line` - the phone - with `cart-line-quantity` "2 db" and its "Részösszeg" `price-amount` reading 2×P: the same variant is not listed twice, so the recovery did not duplicate the item. - expect: `cart-count` reads "Kosárban található termékek (1)" and `order-summary-subtotal`\'s `price-amount` reads 2×P. - expect: The header badge read in the previous step ("2") matches the line\'s "2 db".', async () => {
        await page.getByTestId('cart-link').click();

        // The recovered add joined the same line rather than a second one: one
        // line, the phone, at the quantity the badge counts.
        await expect(cartPage).toBeVisible();
        await expect(cartLines).toHaveCount(1);
        await expect(cartLines.first().getByTestId('cart-line-name')).toHaveText(phoneName);
        await expect(cartLines.first().getByTestId('cart-line-quantity')).toHaveText('2 db');

        // The line's "Részösszeg" is twice the unit price the product page
        // showed, so no duplicate line hides behind the count.
        const lineAmount = cartLines.first().getByTestId('price-amount');
        await expect(lineAmount).toBeVisible();
        expect(await priceOf(lineAmount)).toBe(price * 2);

        await expect(cartCount).toHaveText('Kosárban található termékek (1)');
        const subtotalAmount = subtotal.getByTestId('price-amount');
        await expect(subtotalAmount).toBeVisible();
        expect(await priceOf(subtotalAmount)).toBe(price * 2);
      });
    },
  );
});
