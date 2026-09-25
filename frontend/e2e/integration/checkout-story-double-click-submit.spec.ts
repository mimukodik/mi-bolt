// spec: specs/checkout-story-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page mounts its add control differently at the two integration
// widths: at 1024 px and wider the desktop CTA block carries
// `add-to-cart-button`, and below that width the block is `display: none` (the
// `.cta-desktop` rule in the product page stylesheet) while the fixed
// `purchase-rail` carries the same "Kosárba teszem" press through its
// `purchase-cta` (mobile-buy-rail.html), the only mount with a size at that
// width. Both mounts stay in the DOM either way, so the viewport decides which
// one the test drives.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: standard stories', () => {
  test(
    'a double-clicked confirmation places exactly one order',
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
      const cartBadge = page.getByTestId('cart-badge');
      const submitButton = page.getByTestId('review-submit').getByRole('button');

      // The order requests the browser makes from the review step on: every
      // POST to the order endpoint, and the status each answered with. The
      // plan arms this recording at step 6, before the confirmation press.
      const orderRequests: { readonly method: string; readonly url: string }[] = [];
      const orderResponseStatuses: number[] = [];

      // 1. Open `/telefonok`, wait for `catalog-grid`, and open the first
      // `product-card` that carries no `product-card-stock` marker through its
      // `product-card-cta`.
      await test.step('1. Open `/telefonok`, wait for `catalog-grid`, and open the first `product-card` that carries no `product-card-stock` marker through its `product-card-cta`.', async () => {
        await page.goto('/telefonok');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();

        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();
        // A card renders its "Elfogyott" marker in `product-card-stock` only
        // when it is out of stock, so the first card without one is the first
        // buyable one.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
        // The "Készülékár" block is the product's own price region, and the
        // price block groups whole HUF with a separator.
        await expect(
          page.getByRole('region', { name: 'Árak', exact: true }).getByTestId('price-amount'),
        ).toHaveText('89 990');
        // A fresh browsing context holds an empty cart.
        await expect(cartBadge).toHaveText('0');
      });

      // 2. Add the variant to the cart: at 1024 px and wider press the inner
      // button of `add-to-cart-button`; at 390x844 press the inner button of
      // the sticky rail's `purchase-cta`, which is the only mount with a size
      // at that width.
      await test.step("2. Add the variant to the cart: at 1024 px and wider press the inner button of `add-to-cart-button`; at 390x844 press the inner button of the sticky rail's `purchase-cta`, which is the only mount with a size at that width.", async () => {
        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();

        await expect(addConfirmation).toContainText('1 darab a kosárban.');
        await expect(cartBadge).toHaveText('1');
      });

      // 3. Open the cart with the header's `cart-link` and press the inner
      // button of `cart-continue` ("Tovább az adatokhoz").
      await test.step('3. Open the cart with the header\'s `cart-link` and press the inner button of `cart-continue` ("Tovább az adatokhoz").', async () => {
        await page.getByTestId('cart-link').click();

        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);

        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(page.getByTestId('contact-page')).toBeVisible();
        await expect(
          page.getByTestId('contact-page').getByRole('heading', { level: 1 }),
        ).toHaveText('Kapcsolattartási adatok');
      });

      // 4. Type "Teszt Elek" into `contact-fullname-input`,
      // "teszt@example.test" into `contact-email-input` and
      // "+36 30 123 4567" into `contact-phone-input`, then press the inner
      // button of `contact-submit` ("Tovább a szállításhoz").
      await test.step('4. Type "Teszt Elek" into `contact-fullname-input`, "teszt@example.test" into `contact-email-input` and "+36 30 123 4567" into `contact-phone-input`, then press the inner button of `contact-submit` ("Tovább a szállításhoz").', async () => {
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await expect(page.getByTestId('contact-submit').getByRole('button')).toBeEnabled();
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();
        await expect(
          page.getByTestId('delivery-step').getByRole('heading', { level: 1 }),
        ).toHaveText('Átvétel és fizetés');
      });

      // 5. Choose "Házhoz szállítás" by its `delivery-radio`, fill "1052" into
      // `address-input-postalCode`, "Budapest" into `address-input-city` and
      // "Fő utca 1." into `address-input-line1` inside `address-form`, keep the
      // "A számlázási cím megegyezik a szállítási címmel" tick, choose "Utánvét"
      // by its `payment-radio`, then press the inner button of
      // `delivery-confirm` ("Tovább az ellenőrzéshez").
      await test.step('5. Choose "Házhoz szállítás" by its `delivery-radio`, fill "1052" into `address-input-postalCode`, "Budapest" into `address-input-city` and "Fő utca 1." into `address-input-line1` inside `address-form`, keep the "A számlázási cím megegyezik a szállítási címmel" tick, choose "Utánvét" by its `payment-radio`, then press the inner button of `delivery-confirm` ("Tovább az ellenőrzéshez").', async () => {
        const homeDeliveryRadio = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' })
          .getByTestId('delivery-radio');
        await homeDeliveryRadio.click();
        await expect(homeDeliveryRadio).toBeChecked();

        // The delivery address form appears with the home-delivery choice and,
        // while the billing "same as delivery" tick is on, it is the only
        // `address-form` on the step, so each field is read inside it.
        const deliveryAddress = page.getByTestId('address-form');
        await expect(deliveryAddress).toHaveCount(1);
        await deliveryAddress.getByTestId('address-input-postalCode').fill('1052');
        await deliveryAddress.getByTestId('address-input-city').fill('Budapest');
        await deliveryAddress.getByTestId('address-input-line1').fill('Fő utca 1.');
        await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();

        const cashOnDeliveryRadio = page
          .getByTestId('payment-option')
          .filter({ hasText: 'Utánvét' })
          .getByTestId('payment-radio');
        await cashOnDeliveryRadio.click();
        await expect(cashOnDeliveryRadio).toBeChecked();

        // The mock charges 1490 Ft for home delivery below a 30 000 Ft
        // subtotal and nothing from it; this cart's 89 990 Ft is above that, so
        // the fee row's own price block reads 0.
        await expect(page.getByTestId('summary-row-delivery')).toContainText('Házhoz szállítás');
        await expect(page.getByTestId('summary-row-fee').getByTestId('price-amount')).toHaveText(
          '0',
        );

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
      });

      // 6. Tick `review-consent-terms-input` ("Elfogadom a demó rendelési
      // feltételeit.") and start recording the browser's request events: every
      // request whose method is `POST` and whose URL ends in `/api/v1/orders`.
      await test.step('6. Tick `review-consent-terms-input` ("Elfogadom a demó rendelési feltételeit.") and start recording the browser\'s request events: every request whose method is `POST` and whose URL ends in `/api/v1/orders`.', async () => {
        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        // The recording starts here, before the confirmation is pressed.
        page.on('request', (request) => {
          if (request.method() === 'POST' && request.url().endsWith('/api/v1/orders')) {
            orderRequests.push({ method: request.method(), url: request.url() });
          }
        });
        page.on('response', (response) => {
          if (response.request().method() === 'POST' && response.url().endsWith('/api/v1/orders')) {
            orderResponseStatuses.push(response.status());
          }
        });

        await expect(page.getByTestId('review-payment')).toHaveText('Utánvét');

        // The review summary the mock computes for this cart: the 89 990 Ft
        // device, no delivery fee from the subtotal, the 490 Ft
        // cash-on-delivery fee, and their 90 480 Ft total. Each row's price
        // block carries the digits in its own `price-amount`.
        const reviewSummary = page.getByTestId('review-summary');
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

        // The ticked terms leave the confirmation available and drop the
        // card-payment explanation the unticked state carries.
        await expect(submitButton).toBeEnabled();
        await expect(page.getByTestId('review-cta-explanation')).toHaveCount(0);
        // Nothing has been submitted yet.
        expect(orderRequests).toEqual([]);
      });

      // 7. Double-click the inner button of `review-submit`.
      await test.step('7. Double-click the inner button of `review-submit`.', async () => {
        // A real double press, not two awaited clicks: `dblclick` fires two
        // `click` events back to back. Both reach the button while it is still
        // enabled, because the `disabled` binding follows the `submitting`
        // state only on the next render; the single order comes from
        // `OrderSubmission.submitOrder`'s in-flight guard, which hands the
        // second press the first press's promise instead of starting a second
        // order.
        await expect(submitButton).toBeEnabled();

        // A full-document submit would fire the page's load event; the route
        // change must go through the router instead, so the listener stays
        // silent across the submit.
        let documentReloaded = false;
        page.on('load', () => {
          documentReloaded = true;
        });

        await submitButton.dblclick();

        // The submit navigates to the receipt of the order it just placed.
        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        expect(documentReloaded).toBe(false);

        // Exactly one order was placed, and it was accepted: a single POST to
        // the order endpoint, answered 201.
        expect(orderRequests).toHaveLength(1);
        expect(orderRequests[0]?.method).toBe('POST');
        expect(orderRequests[0]?.url).toMatch(/\/api\/v1\/orders$/);
        expect(orderResponseStatuses).toEqual([201]);
      });

      // 8. Read the receipt.
      await test.step('8. Read the receipt.', async () => {
        // One receipt opened, and the double press placed no second order.
        await expect(page.getByTestId('success-page')).toHaveCount(1);
        await expect(page.getByTestId('success-page')).toBeVisible();
        await expect(page.getByTestId('order-receipt')).toHaveCount(1);
        await expect(page.getByTestId('order-receipt')).toBeVisible();

        await expect(page.getByTestId('success-heading')).toHaveText('Elkészült a demórendelésed.');
        await expect(page.getByTestId('success-check')).toBeVisible();

        await expect(page.getByTestId('receipt-order-number')).toHaveCount(1);
        await expect(page.getByTestId('receipt-order-number')).not.toBeEmpty();

        await expect(page.getByTestId('receipt-row-payment')).toContainText('Utánvét');
        await expect(page.getByTestId('receipt-row-delivery')).toContainText('Házhoz szállítás');
        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );
      });
    },
  );
});
