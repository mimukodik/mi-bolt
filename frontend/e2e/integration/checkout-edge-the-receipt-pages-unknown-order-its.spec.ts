// spec: specs/checkout-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: edge paths', () => {
  test(
    "the receipt page's unknown order, its reopen and the guard that keeps it",
    { tag: '@integration' },
    async ({ page }) => {
      // The purchase control is laid out differently at the two integration
      // viewports: below 1024px the product page's desktop CTA column is
      // `display: none` and the sticky `purchase-rail` carries the same
      // "Kosárba teszem" press through its `purchase-cta`. Both mounts stay in
      // the DOM at either width, so the viewport decides which one the test
      // drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      const successPage = page.getByTestId('success-page');
      const successMissing = page.getByTestId('success-missing');
      const successHeading = page.getByTestId('success-heading');
      const orderReceipt = page.getByTestId('order-receipt');

      // The success page only issues a read when the URL's order id fits the
      // contract's shape (the success step's own `ORDER_ID_PATTERN`,
      // `^[a-zA-Z0-9_-]{1,80}$`), so recording every order read lets a
      // malformed id be pinned to no read at all.
      const orderReads: string[] = [];
      page.on('request', (request) => {
        if (request.method() !== 'GET') return;
        const url = request.url();
        if (url.includes('/api/v1/orders/')) orderReads.push(url);
      });

      // 1. Open a receipt URL with an order id the mock does not know:
      // `/penztar/siker/nem-letezo-rendeles-1234`.
      await test.step('Open a receipt URL with an order id the mock does not know: `/penztar/siker/nem-letezo-rendeles-1234`.', async () => {
        await page.goto('/penztar/siker/nem-letezo-rendeles-1234');

        // The mock answers 404 and the page renders its missing recovery, never
        // a receipt: `success-check` belongs to the receipt-bearing template.
        await expect(successPage).toBeVisible();
        await expect(successMissing).toBeVisible();
        await expect(page.getByTestId('success-check')).toHaveCount(0);
        await expect(successHeading).toHaveText('A rendelés nem található');

        // The well-formed id is echoed back in the recovery sentence, and its
        // control is the one the page offers to get back to the cart.
        await expect(successMissing).toContainText(
          'A(z) nem-letezo-rendeles-1234 azonosítójú rendelés nem található a rendszerben. Indíts egy új pénztárat, vagy térj vissza a kosaradhoz.',
        );
        await expect(
          successMissing.getByRole('button', { name: 'Vissza a kosárhoz' }),
        ).toBeVisible();

        await expect(page.getByTestId('success-demo-notice')).toHaveText(
          'Demó pénztár. A sikeroldal csupán a működést mutatja be — nem történt valódi fizetés, szállítás vagy e-mail-küldés.',
        );
      });

      // 2. Press the "Vissza a kosárhoz" control.
      await test.step('Press the "Vissza a kosárhoz" control.', async () => {
        await successMissing.getByRole('button', { name: 'Vissza a kosárhoz' }).click();

        await expect(page).toHaveURL(/\/penztar\/kosar$/);
        await expect(page.getByTestId('cart-page')).toBeVisible();
        // The missing order is never invented: the cart carries no receipt.
        await expect(orderReceipt).toHaveCount(0);
        await expect(successPage).toHaveCount(0);
      });

      // 3. Open a receipt URL whose order id does not fit the contract's shape:
      // `/penztar/siker/` followed by 82 "a" characters.
      await test.step('Open a receipt URL whose order id does not fit the contract\'s shape: `/penztar/siker/` followed by 82 "a" characters.', async () => {
        // The contract caps an order id at 80 characters, so 82 "a"s can never
        // name a real order.
        const malformedOrderId = 'a'.repeat(82);
        const readsBeforeMalformed = orderReads.length;

        await page.goto(`/penztar/siker/${malformedOrderId}`);

        await expect(successHeading).toHaveText('A rendelés nem található');
        // The malformed id is not echoed back: the page falls back to its
        // id-less sentence rather than repeating an id it refused.
        await expect(successMissing).toContainText(
          'A keresett rendelés nem található. Indíts egy új pénztárat, vagy térj vissza a kosaradhoz.',
        );
        await expect(successMissing).not.toContainText(malformedOrderId);
        // Nothing that fails the shape check is ever read: the page issues no
        // order GET for it.
        expect(orderReads.length).toBe(readsBeforeMalformed);
      });

      // 4. Place a cash-on-delivery order from a fresh start: open
      // `/telefonok`, open the first card without a `product-card-stock`
      // marker, add it with `add-to-cart-button`, open the cart with
      // `cart-link`, press `cart-continue`, fill the contact step with "Teszt
      // Elek", "teszt@example.test" and "+36 30 123 4567" and submit it, choose
      // "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", keep the
      // billing tick, choose "Utánvét" and press `delivery-confirm`, then tick
      // `review-consent-terms-input` and press the inner button of
      // `review-submit`.
      await test.step('Place a cash-on-delivery order from a fresh start: open `/telefonok`, open the first card without a `product-card-stock` marker, add it with `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and submit it, choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", keep the billing tick, choose "Utánvét" and press `delivery-confirm`, then tick `review-consent-terms-input` and press the inner button of `review-submit`.', async () => {
        await page.goto('/telefonok');
        const cards = page.getByTestId('product-card');
        // The grid renders a loading status while it is empty, so waiting for
        // the first card means the pick below reads real cards.
        await expect(cards.first()).toBeVisible();
        // The product is never named: the first card that carries no
        // "Elfogyott" marker is the one the screen offers as buyable.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await addToCartButton.click();
        // The add is a request of its own; the header badge reaching 1 is what
        // says it has landed before the cart is opened.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page.getByTestId('contact-page')).toBeVisible();
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();

        const homeDelivery = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' });
        await homeDelivery.click();
        await expect(homeDelivery.getByTestId('delivery-selected-badge')).toHaveText('Kiválasztva');

        const deliveryAddress = page.getByTestId('address-form');
        await deliveryAddress.getByTestId('address-input-postalCode').fill('1052');
        await deliveryAddress.getByTestId('address-input-city').fill('Budapest');
        await deliveryAddress.getByTestId('address-input-line1').fill('Fő utca 1.');

        // "A számlázási cím megegyezik a szállítási címmel" is on by default and
        // is left as it is, so the billing address follows the delivery one.
        await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();

        const cashOnDelivery = page.getByTestId('payment-option').filter({ hasText: 'Utánvét' });
        await cashOnDelivery.click();
        await expect(cashOnDelivery.getByTestId('payment-selected-badge')).toHaveText(
          'Kiválasztva',
        );

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();

        await page.getByTestId('review-consent-terms-input').check();
        await page.getByTestId('review-submit').getByRole('button').click();

        // The order lands on its own receipt URL, and the id is the path
        // segment the later reopen and back-navigation are checked against.
        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        const orderId = new URL(page.url()).pathname.split('/').pop() ?? '';
        expect(orderId).not.toBe('');

        await expect(successPage).toBeVisible();
        await expect(orderReceipt).toBeVisible();
        await expect(successHeading).toHaveText('Elkészült a demórendelésed.');
        await expect(page.getByTestId('success-check')).toBeVisible();

        await expect(page.getByTestId('receipt-order-number')).not.toBeEmpty();
        await expect(page.getByTestId('receipt-demo-badge')).toHaveText('DEMO');
        await expect(page.getByTestId('receipt-row-payment')).toContainText('Utánvét');
        // `receipt-row-status` is a labelled row whose `Státusz` label sits
        // beside the value in the same element, so the value is contained
        // rather than the row's whole text.
        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );
      });

      // 5. Press the browser's Back button, which points at the review step the
      // order was submitted from.
      await test.step("Press the browser's Back button, which points at the review step the order was submitted from.", async () => {
        const orderId = new URL(page.url()).pathname.split('/').pop() ?? '';

        await page.goBack();

        // The placed order's guard sends a back-navigation to the shopper's own
        // receipt instead of reopening the wizard, so the wizard's review step
        // never renders.
        await expect(page).toHaveURL(`/penztar/siker/${orderId}`);
        await expect(successPage).toBeVisible();
        await expect(orderReceipt).toBeVisible();
        await expect(page.getByTestId('review-page')).toHaveCount(0);
      });

      // 6. Reopen the receipt with a full page load of its own URL
      // (`page.goto(page.url())`, never a reload).
      await test.step('Reopen the receipt with a full page load of its own URL (`page.goto(page.url())`, never a reload).', async () => {
        const orderId = new URL(page.url()).pathname.split('/').pop() ?? '';
        const orderNumber = (await page.getByTestId('receipt-order-number').textContent())?.trim();

        // The full load has no in-memory receipt, so the page reads the order
        // back through its own GET; waiting for that response is what shows the
        // receipt is rebuilt from the order and not from memory.
        const orderReload = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' &&
            response.url().includes(`/api/v1/orders/${orderId}`),
        );
        await page.goto(page.url());
        await orderReload;

        await expect(orderReceipt).toBeVisible();
        await expect(page.getByTestId('receipt-order-number')).toHaveText(orderNumber ?? '');
        await expect(page.getByTestId('receipt-demo-badge')).toHaveText('DEMO');
        await expect(successHeading).toHaveText('Elkészült a demórendelésed.');
        await expect(successMissing).toHaveCount(0);
        await expect(page.getByTestId('success-error')).toHaveCount(0);
      });
    },
  );
});
