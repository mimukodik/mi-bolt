// spec: specs/cart-story-paths.md
// seed: e2e/seed.spec.ts

import type { BrowserContext, Locator, Page } from '@playwright/test';
import { test, expect } from '../fixtures/coverage';

// The product page mounts its purchase call to action twice: below 1024px the
// desktop CTA column (`.cta-desktop`) is `display: none` (the product page
// stylesheet) and the sticky `purchase-rail` carries the same press through its
// `purchase-cta`, with the confirmation in the rail's own status; at 1024px and
// wider the `add-to-cart-button` and the status inside `.cta-desktop` are the
// shown mounts. Both stay in the DOM at either width, so the viewport decides
// which one a test drives.
const DESKTOP_MIN_WIDTH = 1024;

// The mock's cash-on-delivery ceiling (`CASH_ON_DELIVERY_MAX_CART_HUF` in
// projects/shop-mocks/src/checkout/checkout-store.ts), and the lower ceiling the
// second phone is picked under so that two of it stay below the first.
const CASH_ON_DELIVERY_CEILING = 300_000;
const SECOND_PHONE_CEILING = 150_000;

test.describe('Shop: cart, context and receipt stories', () => {
  // CI skips this spec (@ci-skip, BOLT-7): two browser contexts keep their own carts and receipts; it runs locally.
  test(
    '[E011] two browser contexts keep their own carts',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page, browser }, testInfo) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;

      // The add control and the confirmation in the mount the viewport shows,
      // for whichever page a step drives.
      const addControlOn = (target: Page): Locator =>
        narrowViewport
          ? target.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
          : target.getByTestId('add-to-cart-button').getByRole('button');
      const confirmationOn = (target: Page): Locator =>
        narrowViewport
          ? target.getByTestId('purchase-rail').locator('app-status-message')
          : target.locator('.cta-desktop').locator('app-status-message');

      /** The trimmed text of a locator, '' when it renders nothing. */
      const textOf = async (target: Locator): Promise<string> => {
        const text = await target.textContent();
        return (text ?? '').trim();
      };

      /** The digits of a card's `price-amount` as an integer. */
      const cardPrice = async (card: Locator): Promise<number> =>
        Number((await textOf(card.getByTestId('price-amount'))).replace(/\D/g, ''));

      /** The text of the button pressed in a variant group, '' when the group is absent. */
      const selectedVariantText = async (target: Page, groupId: string): Promise<string> => {
        const group = target.getByTestId(groupId);
        if (!(await group.isVisible().catch(() => false))) return '';
        return textOf(group.locator('button[aria-pressed="true"]').first());
      };

      // The cash-on-delivery walk of `specs/storefront-integration.md` scenario
      // 3.7, from the cart page to the receipt. Every step is an in-app
      // navigation, so the page keeps the `mi-scenario` it loaded with; the
      // order id the receipt URL carries is returned.
      const walkToReceipt = async (target: Page): Promise<string> => {
        await target.getByTestId('cart-continue').getByRole('button').click();
        await expect(target).toHaveURL(/\/penztar\/adatok$/);
        await expect(target.getByTestId('contact-page')).toBeVisible();

        await target.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await target.getByTestId('contact-email-input').fill('teszt@example.test');
        await target.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        const contactSubmit = target.getByTestId('contact-submit').getByRole('button');

        // The advance out of the contact step is the walk's most exposed
        // transition: pressing `contact-submit` saves the section through the
        // page's mock service worker and the delivery step it opens is a
        // lazily loaded route, so on a loaded machine either half can be held
        // past the five second expectation budget, and a save the mock refuses
        // once leaves the step on screen with its own "A mentés sikertelen.
        // Próbáld újra." banner. The press and the state it produces are
        // therefore retried as one block — the tool `e2e/seed.spec.ts` names
        // for a block that has to be retried — which only this transition
        // tolerates: the section write is idempotent, unlike the order submit
        // further along the walk. A step that never advances still fails.
        await expect(async () => {
          await expect(contactSubmit).toBeEnabled();
          await contactSubmit.click();
          await expect(target).toHaveURL(/\/penztar\/szallitas$/);
          await expect(target.getByTestId('delivery-step')).toBeVisible();
        }).toPass({ timeout: 20_000 });

        const homeDelivery = target
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' });
        const homeBadge = homeDelivery.getByTestId('delivery-selected-badge');
        await homeDelivery.click();
        await expect(homeBadge).toHaveText('Kiválasztva');

        await target.getByTestId('address-input-postalCode').fill('1052');
        await target.getByTestId('address-input-city').fill('Budapest');
        await target.getByTestId('address-input-line1').fill('Fő utca 1.');
        await expect(target.getByTestId('billing-same-as-delivery')).toBeChecked();

        const cashOnDelivery = target.getByTestId('payment-option').filter({ hasText: 'Utánvét' });
        const paymentBadge = cashOnDelivery.getByTestId('payment-selected-badge');
        // Both carts stay under the ceiling, so the option is offered without a
        // refusal reason.
        await expect(cashOnDelivery.getByTestId('payment-radio')).toBeEnabled();
        await cashOnDelivery.click();
        await expect(paymentBadge).toHaveText('Kiválasztva');
        await expect(target.getByTestId('payment-unavailable-reason')).toHaveCount(0);

        await target.getByTestId('delivery-confirm').getByRole('button').click();
        await expect(target).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(target.getByTestId('review-page')).toBeVisible();

        const termsConsent = target.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();
        const submitOrder = target.getByTestId('review-submit').getByRole('button');
        await expect(submitOrder).toBeEnabled();
        await submitOrder.click();

        await expect(target).toHaveURL(/\/penztar\/siker\/[^/?]+/);
        await expect(target.getByTestId('order-receipt')).toBeVisible();
        return new URL(target.url()).pathname.split('/').pop() ?? '';
      };

      let secondContext: BrowserContext;
      let secondPage: Page;
      let phoneAName = '';
      let phoneBName = '';
      let firstReceiptOrderNumber = '';
      let secondOrderId = '';

      // 1. Open `/telefonok?sort=price_asc` in the test's own page and wait for
      // the grid. Open the first `product-card` with no `product-card-stock`
      // marker through its `product-card-cta`, note its `product-name` and its
      // "Készülékár" `price-amount` as phone A, and press the add control of the
      // mount the viewport shows.
      await test.step('In the test\'s own page open `/telefonok?sort=price_asc` and wait for the grid (at least one `product-card`). Open the first `product-card` that has no `product-card-stock` marker through its `product-card-cta`, note the name in `product-name` and the digits of its "Készülékár" `price-amount` (call this phone A), and press the add control of the mount the viewport shows: the inner button of `add-to-cart-button` at 1024 px and wider, `purchase-cta` below 1024 px.', async () => {
        await page.goto('/telefonok?sort=price_asc');
        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();

        // An in-stock card carries no `product-card-stock` marker; the pick
        // keeps the card's price under the cash-on-delivery ceiling, so the
        // later "Utánvét" step stays available.
        const cardCount = await cards.count();
        let pickedIndex = -1;
        for (let i = 0; i < cardCount; i++) {
          const card = cards.nth(i);
          if ((await card.getByTestId('product-card-stock').count()) > 0) continue;
          const price = await cardPrice(card);
          if (price > 0 && price <= CASH_ON_DELIVERY_CEILING) {
            pickedIndex = i;
            break;
          }
        }
        expect(pickedIndex).toBeGreaterThanOrEqual(0);

        await cards.nth(pickedIndex).getByTestId('product-card-cta').click();
        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');

        phoneAName = await textOf(page.getByTestId('product-name'));
        expect(phoneAName).not.toBe('');

        // The "Készülékár" block is the one price block inside the product's own
        // `Árak` region; the related cards outside it carry another label.
        const devicePrice = page
          .getByRole('region', { name: 'Árak', exact: true })
          .getByTestId('price-amount');
        await expect(devicePrice).toBeVisible();
        const devicePriceDigits = (await textOf(devicePrice)).replace(/\D/g, '');
        expect(Number(devicePriceDigits)).toBeLessThanOrEqual(CASH_ON_DELIVERY_CEILING);

        const colourName = await selectedVariantText(page, 'variant-color-group');
        const storageLabel = await selectedVariantText(page, 'variant-storage-group');

        await addControlOn(page).click();
        const confirmation = confirmationOn(page);
        await expect(confirmation).toContainText('1 darab a kosárban.');
        await expect(confirmation).toContainText(phoneAName);
        if (colourName !== '') await expect(confirmation).toContainText(colourName);
        if (storageLabel !== '') await expect(confirmation).toContainText(storageLabel);
        await expect(page.getByTestId('cart-badge')).toHaveText('1');
      });

      // 2. Open the cart with the header's `cart-link` and read it: one
      // `cart-line` for phone A, the `cart-count`, the enabled `cart-continue`
      // and the checkout header, which carries no `cart-badge`.
      await test.step("Open the cart with the header's `cart-link`.", async () => {
        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();

        const cartLine = page.getByTestId('cart-line');
        await expect(cartLine).toHaveCount(1);
        await expect(cartLine.getByTestId('cart-line-name')).toHaveText(phoneAName);
        await expect(cartLine.getByTestId('cart-line-quantity')).toHaveText('1 db');
        const cartCount = page.getByTestId('cart-count');
        await expect(cartCount).toHaveText('Kosárban található termékek (1)');
        await expect(page.getByTestId('cart-continue').getByRole('button')).toBeEnabled();

        // The cart renders under the checkout header, which has no `cart-badge`
        // at all, so the badge is read on a shop screen.
        await expect(page.getByTestId('checkout-header')).toBeVisible();
        await expect(page.getByTestId('cart-badge')).toHaveCount(0);
      });

      // 3. Open a second browser context with the config's base URL and viewport
      // and open the fault catalogue in it: the grid, the ascending prices and
      // the second context's own empty cart with the demo gate signed in.
      await test.step('Open a second browser context with `browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: testInfo.project.use.viewport })`, open a page in it, and open `/telefonok?sort=price_asc&mi-scenario=fail-order-read` in that page.', async () => {
        secondContext = await browser.newContext({
          baseURL: testInfo.project.use.baseURL,
          viewport: testInfo.project.use.viewport,
        });
        secondPage = await secondContext.newPage();
        await secondPage.goto('/telefonok?sort=price_asc&mi-scenario=fail-order-read');

        // The raw `newContext()` takes only what it is handed, so passing the
        // base URL and the viewport explicitly is what carries the fault query
        // and the price-ascending catalogue into the second page.
        await expect(secondPage.getByTestId('catalog-grid')).toBeVisible();
        const secondCards = secondPage.getByTestId('product-card');
        await expect(secondCards.first()).toBeVisible();
        await expect(secondCards.nth(0).getByTestId('price-amount')).toHaveText('69 990');

        const cheapest = await cardPrice(secondCards.nth(0));
        const nextCheapest = await cardPrice(secondCards.nth(1));
        expect(cheapest).toBeLessThan(nextCheapest);

        // The second context starts signed in, without a sign-in step, with a
        // cart of its own.
        await expect(secondPage.getByTestId('cart-badge')).toHaveText('0');
      });

      // 4. In the second page open the first `product-card` with no stock
      // marker, a name other than A and a price at most 150 000 Ft, and press
      // its add control twice; then read both headers' badges.
      await test.step('In the second page open the first `product-card` that has no `product-card-stock` marker, whose name differs from A, and whose `price-amount` is at most 150 000 Ft (so that two of them stay under the 300 000 Ft cash-on-delivery ceiling); note its name (call it B), and press the add control of the mount the viewport shows twice, without changing the selected colour or storage.', async () => {
        const secondCards = secondPage.getByTestId('product-card');
        const cardCount = await secondCards.count();
        let pickedIndex = -1;
        for (let i = 0; i < cardCount; i++) {
          const card = secondCards.nth(i);
          if ((await card.getByTestId('product-card-stock').count()) > 0) continue;
          const cardName = await textOf(card.getByRole('heading', { level: 3 }));
          if (cardName === '' || cardName === phoneAName) continue;
          const price = await cardPrice(card);
          if (price > 0 && price <= SECOND_PHONE_CEILING) {
            pickedIndex = i;
            break;
          }
        }
        expect(pickedIndex).toBeGreaterThanOrEqual(0);

        await secondCards.nth(pickedIndex).getByTestId('product-card-cta').click();
        await expect(secondPage.getByTestId('product-page')).toBeVisible();
        phoneBName = await textOf(secondPage.getByTestId('product-name'));
        expect(phoneBName).not.toBe('');
        expect(phoneBName).not.toBe(phoneAName);

        const addControl = addControlOn(secondPage);
        const confirmation = confirmationOn(secondPage);
        await expect(addControl).toBeEnabled();
        await addControl.click();
        await expect(confirmation).toContainText('1 darab a kosárban.');
        await addControl.click();
        await expect(confirmation).toContainText('2 darab a kosárban.');
        await expect(confirmation).toContainText(phoneBName);
        await expect(secondPage.getByTestId('cart-badge')).toHaveText('2');

        // Neither header counts the other context's cart: the first page is
        // brought back to a shop screen, the only mount its badge renders in.
        await page.goto('/telefonok');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();
        await expect(page.getByTestId('cart-badge')).toHaveText('1');
      });

      // 5. Open the cart in each page with its own header's `cart-link` and
      // compare the two carts: one line each, its own phone, its own quantity
      // and its own subtotal.
      await test.step("Open the cart in each page with its own header's `cart-link` and compare the two carts.", async () => {
        const secondCartLine = secondPage.getByTestId('cart-line');
        const secondCartCount = secondPage.getByTestId('cart-count');
        const secondSubtotal = secondPage.getByTestId('order-summary-subtotal');

        await secondPage.getByTestId('cart-link').click();
        await expect(secondPage.getByTestId('cart-page')).toBeVisible();
        await expect(secondCartLine).toHaveCount(1);
        await expect(secondCartLine.getByTestId('cart-line-name')).toHaveText(phoneBName);
        await expect(secondCartLine.getByTestId('cart-line-quantity')).toHaveText('2 db');
        await expect(secondCartCount).toHaveText('Kosárban található termékek (1)');
        await expect(secondSubtotal).toContainText('Részösszeg');
        const secondLinePrice = await textOf(secondCartLine.getByTestId('price-amount'));
        await expect(secondSubtotal.getByTestId('price-amount')).toHaveText(secondLinePrice);

        const firstCartLine = page.getByTestId('cart-line');
        const firstCartCount = page.getByTestId('cart-count');
        const firstSubtotal = page.getByTestId('order-summary-subtotal');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(firstCartLine).toHaveCount(1);
        await expect(firstCartLine.getByTestId('cart-line-name')).toHaveText(phoneAName);
        await expect(firstCartLine.getByTestId('cart-line-quantity')).toHaveText('1 db');
        await expect(firstCartCount).toHaveText('Kosárban található termékek (1)');
        await expect(firstSubtotal).toContainText('Részösszeg');
        const firstLinePrice = await textOf(firstCartLine.getByTestId('price-amount'));
        await expect(firstSubtotal.getByTestId('price-amount')).toHaveText(firstLinePrice);

        // Neither cart lists the other context's phone, so no line of the other
        // cart reached either summary.
        await expect(firstCartLine.getByTestId('cart-line-name')).not.toHaveText(phoneBName);
        await expect(secondCartLine.getByTestId('cart-line-name')).not.toHaveText(phoneAName);
      });

      // 6. Read each page's `sessionStorage` keys with a page script: the mock
      // namespaces its snapshot by scenario, so each context holds its own key
      // and neither holds the other's.
      await test.step("Read each page's `sessionStorage` keys with a page script.", async () => {
        // The plan asks for the keys through a page script; Playwright exposes
        // no locator for storage, so `evaluate` is the only reader here.
        const firstKeys = await page.evaluate(() => Object.keys(sessionStorage));
        expect(firstKeys).toContain('mi-bolt.snapshot.default');
        expect(firstKeys).not.toContain('mi-bolt.snapshot.fail-order-read');

        const secondKeys = await secondPage.evaluate(() => Object.keys(sessionStorage));
        expect(secondKeys).toContain('mi-bolt.snapshot.fail-order-read');
        expect(secondKeys).not.toContain('mi-bolt.snapshot.default');
      });

      // 7. Walk both carts to a receipt with the cash-on-delivery walk, first in
      // the first page and then in the second page, and read both receipts.
      await test.step('Walk both carts to a receipt with the cash-on-delivery walk of `specs/storefront-integration.md` scenario 3.7 (contact "Teszt Elek" / "teszt@example.test" / "+36 30 123 4567", delivery "Házhoz szállítás" with "1052" / "Budapest" / "Fő utca 1.", payment "Utánvét", terms tick, `review-submit`), first in the first page, then in the second page — every step of each walk is in-app navigation, which keeps the second page\'s fault scenario, so no `page.goto` is needed until the receipt is reopened.', async () => {
        const firstOrderId = await walkToReceipt(page);
        expect(firstOrderId).not.toBe('');
        await expect(page.getByTestId('success-heading')).toHaveText('Elkészült a demórendelésed.');
        const firstReceiptLines = page.getByTestId('receipt-lines');
        await expect(firstReceiptLines.getByTestId('receipt-line')).toHaveCount(1);
        await expect(firstReceiptLines).toContainText(phoneAName);
        await expect(page.getByTestId('receipt-row-payment')).toContainText('Utánvét');
        await expect(page.getByTestId('receipt-order-number')).not.toBeEmpty();
        firstReceiptOrderNumber = await textOf(page.getByTestId('receipt-order-number'));

        // The second walk is in-app navigation too, so the fault scenario stays
        // on the second page and it reaches a receipt of its own.
        secondOrderId = await walkToReceipt(secondPage);
        expect(secondOrderId).not.toBe('');
        await expect(secondPage.getByTestId('order-receipt')).toBeVisible();
        await expect(secondPage.getByTestId('receipt-order-number')).not.toBeEmpty();
        await expect(secondPage.getByTestId('receipt-row-payment')).toContainText('Utánvét');
      });

      // 8. Reopen the second page's receipt as a fresh page load inside the
      // fault, and check the first page's receipt is untouched by it.
      await test.step("Reopen the second page's receipt as a fresh page load inside the fault: navigate that page to `/penztar/siker/<orderId>?mi-scenario=fail-order-read`, with the order id read from its address bar.", async () => {
        await secondPage.goto(`/penztar/siker/${secondOrderId}?mi-scenario=fail-order-read`);

        await expect(secondPage.getByTestId('success-heading')).toHaveText(
          'A betöltés nem sikerült',
        );
        const successError = secondPage.getByTestId('success-error');
        await expect(successError).toBeVisible();
        const errorState = successError.getByTestId('error-state');
        await expect(errorState.getByRole('heading', { level: 2 })).toHaveText(
          'A visszatöltés nem sikerült',
        );
        // The box shows fixed Hungarian copy, never the server's own detail.
        await expect(errorState).toContainText('A rendelés visszatöltése sikertelen.');
        await expect(errorState).not.toContainText('Simulated failure');
        const retry = errorState.getByRole('button');
        await expect(retry).toHaveCount(1);
        await expect(retry).toHaveText('Visszatöltés újra');

        // The fault context cannot read its receipt back.
        await expect(secondPage.getByTestId('order-receipt')).toHaveCount(0);
        await expect(secondPage.getByTestId('receipt-order-number')).toHaveCount(0);
        await expect(secondPage.getByTestId('success-actions')).toHaveCount(0);

        // The fault in one context never reaches the other: the first page's
        // receipt is still there with the number read off it above.
        await expect(page.getByTestId('order-receipt')).toBeVisible();
        await expect(page.getByTestId('receipt-order-number')).toHaveText(firstReceiptOrderNumber);
      });

      // 9. Close the second context: the second page is gone and the test's own
      // page still renders its receipt.
      await test.step('Close the second context with `context.close()`.', async () => {
        await secondContext.close();

        expect(secondPage.isClosed()).toBe(true);
        await expect(page.getByTestId('order-receipt')).toBeVisible();
        await expect(page.getByTestId('receipt-order-number')).toHaveText(firstReceiptOrderNumber);
      });
    },
  );
});
