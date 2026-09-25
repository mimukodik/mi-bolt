// spec: specs/checkout-retry-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page mounts its add control differently at the two integration
// layouts: at 1024 px and wider the desktop CTA block carries
// `add-to-cart-button`, and below that width the block is `display: none` (the
// `.cta-desktop` rule in the product page stylesheet) while the fixed
// `purchase-rail` carries the same "Kosárba teszem" press through its
// `purchase-cta`, the only mount with a size there. The viewport decides which
// mount the test drives.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: retry after one failure', () => {
  test(
    '[E103] the receipt is read back on the retry and no new transaction is made',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const cartBadge = page.getByTestId('cart-badge');
      const cartPage = page.getByTestId('cart-page');
      const contactPage = page.getByTestId('contact-page');
      const contactSubmit = page.getByTestId('contact-submit').getByRole('button');
      const deliveryAddressForm = page.getByTestId('address-form');
      // Each option row is addressed by the copy it carries rather than by
      // position: the delivery step renders one `delivery-option` per shipping
      // mode and one `payment-option` per payment method.
      const homeDeliveryOption = page
        .getByTestId('delivery-option')
        .filter({ hasText: 'Házhoz szállítás' });
      const cashOnDeliveryOption = page
        .getByTestId('payment-option')
        .filter({ hasText: 'Utánvét' });
      const termsConsent = page.getByTestId('review-consent-terms-input');
      const submitButton = page.getByTestId('review-submit').getByRole('button');
      const successHeading = page.getByTestId('success-heading');
      const successError = page.getByTestId('success-error');
      const successActions = page.getByTestId('success-actions');
      const orderReceipt = page.getByTestId('order-receipt');
      const receiptOrderNumber = page.getByTestId('receipt-order-number');
      const receiptLines = page.getByTestId('receipt-lines');
      const receiptLine = receiptLines.getByTestId('receipt-line');
      const receiptTotals = page.getByTestId('receipt-totals');
      const receiptDeliveryAddress = page.getByTestId('receipt-row-delivery-address');
      // The reload recovery's single control lives inside the failed read's
      // `success-error`, which wraps the `error-state` primitive.
      const retryButton = successError.getByRole('button', { name: 'Visszatöltés újra' });

      // Every order request of the reopen: the recorder is armed in step 3, so
      // it holds the failed read and the retry's read and no placement `POST`.
      const orderRequests: { method: string; url: string }[] = [];

      // The colour and storage the ordered variant shows, read off the product
      // page so the receipt's line is checked against what the shop actually
      // showed rather than pinned to a product.
      let colourName = '';
      let storageLabel = '';
      // The order id from the address bar and the receipt's own values, held so
      // the reload and its retry can be checked against the very first read.
      let orderId = '';
      let orderNumber = '';
      let lineText = '';

      // 1. Open `/telefonok?mi-scenario=fail-once-order-read` and wait for
      // `catalog-grid`, then place a cash-on-delivery order.
      await test.step('1. Open `/telefonok?mi-scenario=fail-once-order-read` and wait for `catalog-grid`, then place a cash-on-delivery order.', async () => {
        // The mock reads the scenario when this document loads and holds it for
        // the browsing context. `order-read` is the operation this scenario
        // breaks, and it is the `GET` the success page issues on a reload, not
        // the order submission, so this document places its order unfaulted.
        await page.goto('/telefonok?mi-scenario=fail-once-order-read');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();

        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);
        // A fresh browsing context starts on the mock's empty cart under this
        // scenario too, so the header badge is the facade's zero baseline.
        await expect(cartBadge).toHaveText('0');

        // Picking by what the screen shows: a card renders its "Elfogyott"
        // marker only when out of stock, so the first card without one is
        // buyable. The product is never named.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');

        // The selected variant's colour and storage, read from the screen so
        // the receipt's line is checked against them.
        const colourGroup = page.getByTestId('variant-color-group');
        if (await colourGroup.isVisible().catch(() => false)) {
          colourName = (
            (await colourGroup.locator('button[aria-pressed="true"]').first().textContent()) ?? ''
          ).trim();
        }
        const storageGroup = page.getByTestId('variant-storage-group');
        if (await storageGroup.isVisible().catch(() => false)) {
          storageLabel = (
            (await storageGroup.locator('button[aria-pressed="true"]').first().textContent()) ?? ''
          ).trim();
        }

        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();
        // The add is a request of its own; the header badge reaching 1 is what
        // says it has landed before the cart is opened.
        await expect(cartBadge).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(cartPage).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);

        await page.getByTestId('cart-continue').getByRole('button').click();
        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactPage).toBeVisible();

        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await expect(contactSubmit).toBeEnabled();
        await contactSubmit.click();

        // The submission is not the endpoint this scenario breaks, so the
        // contact section is written and the wizard advances on its own.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);

        const homeDeliveryRadio = homeDeliveryOption.getByTestId('delivery-radio');
        await homeDeliveryRadio.click();
        await expect(homeDeliveryRadio).toBeChecked();

        // Choosing home delivery reveals the delivery address form and, while
        // the billing "same as delivery" tick is on, it is the only
        // `address-form` on the step.
        await expect(deliveryAddressForm).toHaveCount(1);
        await deliveryAddressForm.getByTestId('address-input-postalCode').fill('1052');
        await deliveryAddressForm.getByTestId('address-input-city').fill('Budapest');
        await deliveryAddressForm.getByTestId('address-input-line1').fill('Fő utca 1.');
        await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();

        const cashOnDeliveryRadio = cashOnDeliveryOption.getByTestId('payment-radio');
        await cashOnDeliveryRadio.click();
        await expect(cashOnDeliveryRadio).toBeChecked();

        await page.getByTestId('delivery-confirm').getByRole('button').click();
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();

        await expect(termsConsent).not.toBeChecked();
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

        // The submission reads nothing back: the page renders the receipt from
        // the submission's own response, so the fault on the order read does not
        // touch it and the browser lands on the order's receipt URL.
        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        await expect(orderReceipt).toBeVisible();
        await expect(successHeading).toHaveText('Elkészült a demórendelésed.');
        await expect(page.getByTestId('receipt-row-payment')).toContainText('Utánvét');
        await expect(page.getByTestId('receipt-demo-badge')).toHaveText('DEMO');
      });

      // 2. Record the receipt's values and the address bar: `receipt-order-number`,
      // `receipt-lines`, `receipt-totals`, `receipt-row-delivery-address` and the
      // order id in `/penztar/siker/<orderId>`.
      await test.step("2. Record the receipt's values and the address bar: `receipt-order-number`, `receipt-lines`, `receipt-totals`, `receipt-row-delivery-address` and the order id in `/penztar/siker/<orderId>`.", async () => {
        // The reads below all sit after the step above proved the receipt
        // rendered, so they read the placed order's values rather than a
        // loading state.
        orderId = new URL(page.url()).pathname.split('/').pop() ?? '';
        expect(orderId).not.toBe('');

        await expect(receiptLine).toHaveCount(1);
        if (colourName !== '') await expect(receiptLine).toContainText(colourName);
        if (storageLabel !== '') await expect(receiptLine).toContainText(storageLabel);
        await expect(receiptLine).toContainText('1 db');
        // The line renders its own total through the `price-block` primitive.
        await expect(receiptLine.getByTestId('price-amount')).toHaveText('89 990');
        lineText = ((await receiptLine.textContent()) ?? '').replace(/\s+/g, ' ').trim();

        // The mock's totals for this cart: the 89 990 Ft device, no delivery fee
        // (at or above the free-shipping threshold), the 490 Ft cash-on-delivery
        // fee and their 90 480 Ft total.
        await expect(
          receiptTotals.getByTestId('receipt-row-subtotal').getByTestId('price-amount'),
        ).toHaveText('89 990');
        await expect(
          receiptTotals.getByTestId('receipt-row-shipping').getByTestId('price-amount'),
        ).toHaveText('0');
        await expect(
          receiptTotals.getByTestId('receipt-row-payment-fee').getByTestId('price-amount'),
        ).toHaveText('490');
        await expect(
          receiptTotals.getByTestId('receipt-row-total').getByTestId('price-amount'),
        ).toHaveText('90 480');

        await expect(receiptDeliveryAddress).toContainText('Fő utca 1.');
        await expect(receiptDeliveryAddress).toContainText('1052 Budapest');

        await expect(receiptOrderNumber).not.toBeEmpty();
        orderNumber = ((await receiptOrderNumber.textContent()) ?? '').trim();
      });

      // 3. Start recording the browser's request events: every request whose URL
      // contains `/api/v1/orders`. Then open the receipt again as a fresh page
      // load inside the fault, keeping the scenario: navigate to
      // `/penztar/siker/<the recorded orderId>?mi-scenario=fail-once-order-read`.
      await test.step("3. Start recording the browser's request events: every request whose URL contains `/api/v1/orders`. Then open the receipt again as a fresh page load inside the fault, keeping the scenario: navigate to `/penztar/siker/<the recorded orderId>?mi-scenario=fail-once-order-read`.", async () => {
        // The recorder starts now, after the placement, so every entry below
        // belongs to the receipt's own reload and its retry.
        page.on('request', (request) => {
          if (!request.url().includes('/api/v1/orders')) return;
          orderRequests.push({ method: request.method(), url: request.url() });
        });

        // The scenario is kept on the goto: the mock re-reads it per page load,
        // so `fail-once-order-read` arms again and this document's first order
        // read is the one that fails.
        await page.goto(`/penztar/siker/${orderId}?mi-scenario=fail-once-order-read`);

        await expect(successHeading).toHaveText('A betöltés nem sikerült');
        await expect(successError).toBeVisible();
        await expect(successError.getByRole('heading', { level: 2 })).toHaveText(
          'A visszatöltés nem sikerült',
        );
        await expect(successError).toContainText('A rendelés visszatöltése sikertelen.');
        await expect(successError.getByRole('button')).toHaveCount(1);
        await expect(retryButton).toHaveText('Visszatöltés újra');

        // The page never invents a receipt it could not read: nothing of the
        // receipt block or its recovery actions is on screen.
        await expect(orderReceipt).toHaveCount(0);
        await expect(receiptOrderNumber).toHaveCount(0);
        await expect(successActions).toHaveCount(0);

        await expect(page).toHaveURL(`/penztar/siker/${orderId}?mi-scenario=fail-once-order-read`);
      });

      // 4. Press "Visszatöltés újra".
      await test.step('4. Press "Visszatöltés újra".', async () => {
        await retryButton.click();

        // The once-only fault fired on this document's first read, so the retry
        // goes through and the page renders the order it read back.
        await expect(successError).toHaveCount(0);
        await expect(successHeading).toHaveText('Elkészült a demórendelésed.');
        await expect(orderReceipt).toBeVisible();
        await expect(successActions).toBeVisible();
        await expect(receiptLine).toHaveCount(1);

        // The same transaction, read back from the server rather than a new
        // one: every value matches the first receipt's.
        await expect(receiptOrderNumber).toHaveText(orderNumber);
        await expect(receiptLine).toHaveText(lineText);
        await expect(
          receiptTotals.getByTestId('receipt-row-subtotal').getByTestId('price-amount'),
        ).toHaveText('89 990');
        await expect(
          receiptTotals.getByTestId('receipt-row-shipping').getByTestId('price-amount'),
        ).toHaveText('0');
        await expect(
          receiptTotals.getByTestId('receipt-row-payment-fee').getByTestId('price-amount'),
        ).toHaveText('490');
        await expect(
          receiptTotals.getByTestId('receipt-row-total').getByTestId('price-amount'),
        ).toHaveText('90 480');
        await expect(receiptDeliveryAddress).toContainText('Fő utca 1.');
        await expect(receiptDeliveryAddress).toContainText('1052 Budapest');

        await expect(page).toHaveURL(`/penztar/siker/${orderId}?mi-scenario=fail-once-order-read`);
      });

      // 5. Check that no new transaction came of the retry, from the requests
      // recorded since the receipt's own page load.
      await test.step("5. Check that no new transaction came of the retry, from the requests recorded since the receipt's own page load.", async () => {
        // The retry re-reads the stored receipt: its pair of reads is the failed
        // one and the recovered one, and no `POST` to the create endpoint sits
        // among them.
        await expect.poll(() => orderRequests.length).toBe(2);
        for (const request of orderRequests) {
          expect(request.method).toBe('GET');
          expect(request.url).toContain(`/api/v1/orders/${orderId}`);
        }
        expect(orderRequests.some((request) => request.method === 'POST')).toBe(false);

        // The retry restored the existing receipt and created nothing: one
        // receipt, one line and one order number are on the page.
        await expect(orderReceipt).toHaveCount(1);
        await expect(receiptLine).toHaveCount(1);
        await expect(receiptOrderNumber).toHaveCount(1);
      });
    },
  );
});
