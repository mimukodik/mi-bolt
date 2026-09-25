// spec: specs/checkout-retry-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page mounts its add control differently at the two integration
// widths: at 1024 px and wider the desktop CTA block carries
// `add-to-cart-button`, and below that width the block is `display: none` (the
// `.cta-desktop` rule in the product page stylesheet) while the fixed
// `purchase-rail` carries the same "Kosárba teszem" press through its
// `purchase-cta`, the only mount with a size there. Each mount keeps its own
// confirmation `status-message` as well, so the viewport decides which pair
// the test drives and the confirmation is read through whichever mount the
// viewport shows.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: retry after one failure', () => {
  test(
    '[E100] one order comes of a retried uncertain transport failure, with the same request and key',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      // The add confirmation is mounted twice — by the page's own status
      // message on the wide layout and by the rail's copy on the narrow one —
      // and the hidden mount carries the same text, so the assertion targets
      // whichever one the viewport shows.
      const addConfirmation = page.getByTestId('status-message').filter({ visible: true });

      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const cartBadge = page.getByTestId('cart-badge');
      const cartLine = page.getByTestId('cart-line');
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
      const reviewPage = page.getByTestId('review-page');
      const reviewContact = page.getByTestId('review-contact');
      const reviewDelivery = page.getByTestId('review-delivery');
      const reviewItems = page.getByTestId('review-items');
      const reviewSummary = page.getByTestId('review-summary');
      const termsConsent = page.getByTestId('review-consent-terms-input');
      const submitButton = page.getByTestId('review-submit').getByRole('button');
      const submitFailure = page.getByTestId('review-submit-failure');
      const orderReceipt = page.getByTestId('order-receipt');
      const receiptOrderNumber = page.getByTestId('receipt-order-number');
      const receiptLines = page.getByTestId('receipt-lines');
      const receiptTotals = page.getByTestId('receipt-totals');
      const emptyState = page.getByTestId('empty-state');

      // Every `POST` to the order endpoint and the two precondition headers it
      // carries. The recording runs from before the first navigation, so the
      // "no order request has been sent yet" read on the review page is
      // observable through it, and it outlives the in-app route change to the
      // receipt.
      const orderRequests: { url: string; idempotencyKey: string; ifMatch: string }[] = [];
      page.on('request', (request) => {
        if (request.method() !== 'POST' || !request.url().endsWith('/api/v1/orders')) return;
        const headers = request.headers();
        orderRequests.push({
          url: request.url(),
          idempotencyKey: headers['idempotency-key'] ?? '',
          ifMatch: headers['if-match'] ?? '',
        });
      });

      // The colour and storage the ordered variant shows, read off the product
      // page so the receipt's line is checked against what the shop actually
      // showed rather than pinned to a product.
      let colourName = '';
      let storageLabel = '';

      // 1. Open `/telefonok?mi-scenario=offline-once-order` and wait for
      // `catalog-grid`.
      await test.step('1. Open `/telefonok?mi-scenario=offline-once-order` and wait for `catalog-grid`.', async () => {
        // The mock reads the scenario when this document loads and holds it for
        // the browsing context, so the first order submission fails once as an
        // uncertain transport failure and the retry is served.
        await page.goto('/telefonok?mi-scenario=offline-once-order');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();

        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);
        // A fresh browsing context starts on the mock's empty cart under this
        // scenario too, so the header badge is the facade's zero baseline.
        await expect(cartBadge).toHaveText('0');
      });

      // 2. Open the first `product-card` that carries no `product-card-stock`
      // marker through its `product-card-cta`, then add the shown variant: press
      // the inner button of `add-to-cart-button` at 1024 px and wider, and of
      // the sticky rail's `purchase-cta` below 1024 px, where the side panel is
      // hidden.
      await test.step("2. Open the first `product-card` that carries no `product-card-stock` marker through its `product-card-cta`, then add the shown variant: press the inner button of `add-to-cart-button` at 1024 px and wider, and of the sticky rail's `purchase-cta` below 1024 px, where the side panel is hidden.", async () => {
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

        // The scenario breaks the order submission alone, so the cart add
        // itself succeeds on the first press.
        await expect(addConfirmation).toContainText('1 darab a kosárban.');
        await expect(cartBadge).toHaveText('1');
      });

      // 3. Open the cart with `cart-link`, press the inner button of
      // `cart-continue`, fill the contact step with "Teszt Elek",
      // "teszt@example.test" and "+36 30 123 4567" and press the inner button of
      // `contact-submit`; then on the delivery step choose "Házhoz szállítás" by
      // its `delivery-radio`, fill "1052" / "Budapest" / "Fő utca 1.", keep the
      // billing "same as delivery" tick, choose "Utánvét" by its `payment-radio`
      // and press the inner button of `delivery-confirm`.
      await test.step('3. Open the cart with `cart-link`, press the inner button of `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press the inner button of `contact-submit`; then on the delivery step choose "Házhoz szállítás" by its `delivery-radio`, fill "1052" / "Budapest" / "Fő utca 1.", keep the billing "same as delivery" tick, choose "Utánvét" by its `payment-radio` and press the inner button of `delivery-confirm`.', async () => {
        await page.getByTestId('cart-link').click();
        await expect(cartPage).toBeVisible();
        await expect(cartLine).toHaveCount(1);

        await page.getByTestId('cart-continue').getByRole('button').click();
        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactPage).toBeVisible();

        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await expect(contactSubmit).toBeEnabled();
        await contactSubmit.click();

        // The order submission is the endpoint this scenario breaks, not the
        // step save, so the contact section is written and the wizard advances
        // to the delivery step on its own.
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
        await expect(reviewPage).toBeVisible();
        await expect(reviewPage).toHaveAttribute('data-status', 'ready');

        await expect(page.getByTestId('review-payment')).toHaveText('Utánvét');
        await expect(reviewItems.getByTestId('review-line')).toHaveCount(1);

        // The mock's totals for this cart: the 89 990 Ft device, no delivery
        // fee from the subtotal (at or above the free-shipping threshold), the
        // 490 Ft cash-on-delivery fee, and their 90 480 Ft total.
        const subtotal = reviewSummary.getByTestId('order-summary-subtotal');
        await expect(subtotal).toContainText('Részösszeg');
        await expect(subtotal.getByTestId('price-amount')).toHaveText('89 990');
        const shipping = reviewSummary.getByTestId('order-summary-shipping');
        await expect(shipping).toContainText('Szállítási díj');
        await expect(shipping.getByTestId('price-amount')).toHaveText('0');
        const paymentFee = reviewSummary.getByTestId('order-summary-payment-fee');
        await expect(paymentFee).toContainText('Fizetési díj');
        await expect(paymentFee.getByTestId('price-amount')).toHaveText('490');
        const total = reviewSummary.getByTestId('order-summary-total');
        await expect(total).toContainText('Végösszeg');
        await expect(total.getByTestId('price-amount')).toHaveText('90 480');

        // Reaching the review page sent no order: the failure notice is absent
        // and the recorder still holds nothing.
        await expect(submitFailure).toHaveCount(0);
        expect(orderRequests).toEqual([]);
      });

      // 4. Start recording the browser's request events: every request whose
      // method is `POST` and whose URL ends in `/api/v1/orders`, with its
      // headers. Tick `review-consent-terms-input` ("Elfogadom a demó rendelési
      // feltételeit.") and press the inner button of `review-submit`
      // ("Demórendelés véglegesítése").
      await test.step('4. Start recording the browser\'s request events: every request whose method is `POST` and whose URL ends in `/api/v1/orders`, with its headers. Tick `review-consent-terms-input` ("Elfogadom a demó rendelési feltételeit.") and press the inner button of `review-submit` ("Demórendelés véglegesítése").', async () => {
        // The recording has been running since before the first navigation (the
        // handler at the top of the test), so it already witnesses every order
        // POST of the run.
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

        // The submission fails as an uncertain transport failure: the browser
        // stays on the review step and no receipt is invented.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(orderReceipt).toHaveCount(0);

        // The network fault surfaces as `data-error-code="UNKNOWN"` — a
        // transport failure rather than a 503 — with the draft-preserving copy
        // and one control beside it, changing the payment method.
        await expect(submitFailure).toBeVisible();
        await expect(submitFailure).toHaveAttribute('data-error-code', 'UNKNOWN');
        await expect(submitFailure).toContainText(
          'A kosarad és az adataid megmaradtak. Próbáld újra, vagy módosítsd a fizetési módot.',
        );
        await expect(submitFailure.getByTestId('review-change-payment')).toContainText(
          'Fizetési mód módosítása',
        );
        await expect(page.getByTestId('review-state-banner')).toHaveText(
          'A rendelés leadása nem sikerült.',
        );

        // The draft stays as it was saved.
        await expect(reviewContact).toContainText('Teszt Elek');
        await expect(reviewContact).toContainText('teszt@example.test');
        // The step normalises the typed "+36 30 123 4567" to this value.
        await expect(reviewContact).toContainText('+36301234567');
        await expect(reviewDelivery).toContainText('Házhoz szállítás');
        await expect(reviewDelivery).toContainText('Utánvét');
        await expect(reviewItems.getByTestId('review-line')).toHaveCount(1);
        await expect(reviewSummary).toBeVisible();

        // The failure notice holds no retry control of its own: the retry this
        // screen offers is the same call to action, still ticked and enabled.
        await expect(submitFailure.getByRole('button', { name: 'Újrapróbálom' })).toHaveCount(0);
        await expect(termsConsent).toBeChecked();
        await expect(submitButton).toBeEnabled();

        // Exactly one order request went out, and it is the failed attempt.
        await expect.poll(() => orderRequests.length).toBe(1);
        expect(orderRequests[0]?.url).toMatch(/\/api\/v1\/orders$/);
      });

      // 5. Press the inner button of `review-submit` again, changing nothing.
      await test.step('5. Press the inner button of `review-submit` again, changing nothing.', async () => {
        await submitButton.click();

        // The once-only fault fired on the first attempt of this document, so
        // the retry goes through and the browser lands on the receipt.
        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        await expect(orderReceipt).toBeVisible();
        await expect(page.getByTestId('success-heading')).toHaveText('Elkészült a demórendelésed.');
        await expect(receiptOrderNumber).toHaveText('DEMO-000001');

        await expect(page.getByTestId('receipt-row-payment')).toContainText('Utánvét');
        // The meta row is a label/value pair, so its own text is the "Státusz"
        // label immediately followed by the value: the row's value is read with
        // a containment check, the way the payment row above is.
        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );
        await expect(receiptLines.getByTestId('receipt-line')).toHaveCount(1);
        if (colourName !== '') await expect(receiptLines).toContainText(colourName);
        if (storageLabel !== '') await expect(receiptLines).toContainText(storageLabel);
        await expect(receiptLines).toContainText('1 db');

        const receiptSubtotal = receiptTotals.getByTestId('receipt-row-subtotal');
        await expect(receiptSubtotal).toContainText('Részösszeg');
        await expect(receiptSubtotal.getByTestId('price-amount')).toHaveText('89 990');
        const receiptShipping = receiptTotals.getByTestId('receipt-row-shipping');
        await expect(receiptShipping).toContainText('Szállítási díj');
        await expect(receiptShipping.getByTestId('price-amount')).toHaveText('0');
        const receiptPaymentFee = receiptTotals.getByTestId('receipt-row-payment-fee');
        await expect(receiptPaymentFee).toContainText('Fizetési díj');
        await expect(receiptPaymentFee.getByTestId('price-amount')).toHaveText('490');
        const receiptTotal = receiptTotals.getByTestId('receipt-row-total');
        await expect(receiptTotal).toContainText('Végösszeg');
        await expect(receiptTotal.getByTestId('price-amount')).toHaveText('90 480');

        // The retry repeats the exact request rather than composing a new one:
        // both attempts carry one Idempotency-Key and one If-Match.
        await expect.poll(() => orderRequests.length).toBe(2);
        const idempotencyKeys = orderRequests.map((request) => request.idempotencyKey);
        const ifMatchValues = orderRequests.map((request) => request.ifMatch);
        expect(idempotencyKeys[0]).not.toBe('');
        expect(idempotencyKeys[0]).toBe(idempotencyKeys[1]);
        expect(ifMatchValues[0]).not.toBe('');
        expect(ifMatchValues[0]).toBe(ifMatchValues[1]);
      });

      // 6. Check that exactly one order came of the pair, by what the screen can
      // show: read the receipt once more, then open the cart again keeping the
      // scenario with a page load of
      // `/penztar/kosar?mi-scenario=offline-once-order`.
      await test.step('6. Check that exactly one order came of the pair, by what the screen can show: read the receipt once more, then open the cart again keeping the scenario with a page load of `/penztar/kosar?mi-scenario=offline-once-order`.', async () => {
        // One order number and one receipt are on the page, so the session
        // issued a single order and the pair of attempts produced one rather
        // than two.
        await expect(orderReceipt).toHaveCount(1);
        await expect(receiptOrderNumber).toHaveCount(1);
        await expect(receiptOrderNumber).toHaveText('DEMO-000001');
        await expect(receiptLines.getByTestId('receipt-line')).toHaveCount(1);

        // The scenario is kept on every goto; the cart page posts no order of
        // its own, so nothing here re-arms a submission.
        await page.goto('/penztar/kosar?mi-scenario=offline-once-order');
        await expect(cartPage).toBeVisible();

        // The placed order consumed the cart and nothing is left queued.
        await expect(emptyState).toBeVisible();
        await expect(emptyState.getByRole('heading', { level: 2 })).toHaveText(
          'A kosarad még üres.',
        );
        await expect(emptyState).toContainText(
          'Nézd meg a demókészülékeket, és válaszd ki a kedvenced.',
        );
        await expect(emptyState.getByRole('button', { name: 'Telefonokat nézek' })).toBeVisible();
        await expect(cartLine).toHaveCount(0);
      });
    },
  );
});
