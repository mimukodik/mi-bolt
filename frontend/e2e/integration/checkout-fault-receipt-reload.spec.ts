// spec: specs/checkout-fault-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The add control is laid out differently at the two integration viewports:
// below 1024px the product page's desktop CTA block is `display: none` (the
// `.cta-desktop` rule in the product page stylesheet) and the sticky
// `purchase-rail` carries the same "Kosárba teszem" press through its
// `purchase-cta`. Both mounts stay in the DOM at either width, so the viewport
// decides which one this test drives.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: service faults', () => {
  // CI skips this spec (@ci-skip, BOLT-7): checkout-retry-receipt-read-once.spec.ts covers the receipt read error.
  test(
    'the receipt cannot be read back from the server',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      const successHeading = page.getByTestId('success-heading');
      const successError = page.getByTestId('success-error');
      const errorState = successError.getByTestId('error-state');
      const errorTitle = errorState.getByRole('heading', { level: 2 });
      const retryButton = errorState.getByRole('button');

      // The order id the address bar carries after the order is placed: the
      // second step reopens exactly that URL as a fresh page load.
      let orderId = '';

      // 1. Place a cash-on-delivery order under the fault and read the receipt:
      // open `/telefonok?mi-scenario=fail-order-read`, open the first
      // `product-card` with no `product-card-stock` marker through its
      // `product-card-cta`, add it with the inner button of
      // `add-to-cart-button`, open the cart with `cart-link`, press
      // `cart-continue`, fill the contact step with "Teszt Elek",
      // "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`,
      // then on the delivery step choose "Házhoz szállítás", fill "1052" /
      // "Budapest" / "Fő utca 1.", choose "Utánvét" by its `payment-radio`,
      // press `delivery-confirm`, tick `review-consent-terms-input` and press
      // the inner button of `review-submit`.
      await test.step('Place a cash-on-delivery order under the fault and read the receipt: open `/telefonok?mi-scenario=fail-order-read`, open the first `product-card` with no `product-card-stock` marker through its `product-card-cta`, add it with the inner button of `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`, then on the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose "Utánvét" by its `payment-radio`, press `delivery-confirm`, tick `review-consent-terms-input` and press the inner button of `review-submit`.', async () => {
        // The mock reads the scenario when the document loads and keeps it
        // through in-app navigation, so the first goto carries the fault and
        // every later navigation stays inside it.
        await page.goto('/telefonok?mi-scenario=fail-order-read');
        await expect(page.getByTestId('result-count')).toHaveText(
          '55 találat a szűrt feltételek szerint',
        );

        // The product is never named: the scenario picks its card by what the
        // screen shows, the first one without an "Elfogyott" marker.
        const inStockCard = page
          .getByTestId('product-card')
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();
        // The scenario breaks only the receipt read, so the addition still
        // succeeds and the header badge counts the line.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(page.getByTestId('contact-page')).toBeVisible();

        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        const contactSubmit = page.getByTestId('contact-submit').getByRole('button');
        await expect(contactSubmit).toBeEnabled();
        await contactSubmit.click();

        // The section write (`checkout-update`) is not the endpoint this
        // scenario breaks, so the contact section is saved and the wizard
        // advances to the delivery step.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();

        const homeDeliveryRadio = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' })
          .getByTestId('delivery-radio');
        await homeDeliveryRadio.click();
        await expect(homeDeliveryRadio).toBeChecked();

        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Fő utca 1.');

        const cashOnDeliveryRadio = page
          .getByTestId('payment-option')
          .filter({ hasText: 'Utánvét' })
          .getByTestId('payment-radio');
        await cashOnDeliveryRadio.click();
        await expect(cashOnDeliveryRadio).toBeChecked();

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();

        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();
        const submitButton = page.getByTestId('review-submit').getByRole('button');
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

        // The order submission (`order`) is not the endpoint this scenario
        // breaks, so the order is placed and the browser lands on the receipt
        // with the order id in the path.
        await expect(page).toHaveURL(/\/penztar\/siker\/[^/?]+/);
        await expect(page.getByTestId('success-page')).toBeVisible();
        await expect(page.getByTestId('order-receipt')).toBeVisible();
        await expect(successHeading).toHaveText('Elkészült a demórendelésed.');
        await expect(page.getByTestId('receipt-order-number')).not.toBeEmpty();
        await expect(page.getByTestId('receipt-row-payment')).toContainText('Utánvét');
        // The success page renders its actions beside a real receipt.
        await expect(page.getByTestId('success-actions')).toBeVisible();

        // Read the order id off the address bar so the next step reopens
        // exactly that URL; the query is empty here, an in-app navigation
        // drops the scenario from the URL.
        orderId = page.url().split('/').pop() ?? '';
        expect(orderId.length).toBeGreaterThan(0);
      });

      // 2. Open the receipt again as a fresh page load inside the fault:
      // navigate to `/penztar/siker/<orderId>?mi-scenario=fail-order-read`
      // with the order id read from the address bar.
      await test.step('Open the receipt again as a fresh page load inside the fault: navigate to `/penztar/siker/<orderId>?mi-scenario=fail-order-read` with the order id read from the address bar.', async () => {
        await page.goto(`/penztar/siker/${orderId}?mi-scenario=fail-order-read`);

        // The read (`order-read`) is the endpoint this scenario breaks, so the
        // page cannot hydrate the receipt it was asked for.
        await expect(successHeading).toHaveText('A betöltés nem sikerült');
        await expect(successError).toBeVisible();
        await expect(errorTitle).toHaveText('A visszatöltés nem sikerült');
        // The box shows fixed Hungarian copy, never the server's own detail.
        await expect(errorState).toContainText('A rendelés visszatöltése sikertelen.');
        await expect(errorState).not.toContainText('Simulated failure');
        await expect(retryButton).toHaveCount(1);
        await expect(retryButton).toHaveText('Visszatöltés újra');

        // The page never invents a receipt it could not read.
        await expect(page.getByTestId('order-receipt')).toHaveCount(0);
        await expect(page.getByTestId('receipt-order-number')).toHaveCount(0);
        await expect(page.getByTestId('success-actions')).toHaveCount(0);
      });

      // 3. Press "Visszatöltés újra".
      await test.step('Press "Visszatöltés újra".', async () => {
        await retryButton.click();

        // The retry re-reads rather than re-posts, and the fault answers every
        // attempt alike, so the same error state returns with the same title,
        // message and single control.
        // The route is compared through the parsed URL rather than through a
        // `RegExp` built from the run's own order id.
        await expect(page).toHaveURL((url) => url.pathname === `/penztar/siker/${orderId}`);
        await expect(successHeading).toHaveText('A betöltés nem sikerült');
        await expect(successError).toBeVisible();
        await expect(errorTitle).toHaveText('A visszatöltés nem sikerült');
        await expect(errorState).toContainText('A rendelés visszatöltése sikertelen.');
        await expect(errorState).not.toContainText('Simulated failure');
        await expect(retryButton).toHaveCount(1);
        await expect(retryButton).toHaveText('Visszatöltés újra');
        await expect(page.getByTestId('order-receipt')).toHaveCount(0);
      });
    },
  );
});
