// spec: specs/checkout-fault-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The add control is laid out differently at the two integration viewports:
// below 1024px the desktop CTA block is `display: none` (the `.cta-desktop`
// rule in the product page stylesheet) and the sticky `purchase-rail` carries
// the same "Kosárba teszem" press through its `purchase-cta`. Both mounts stay
// in the DOM at either width, so the viewport decides which one the test drives.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: service faults', () => {
  // CI skips this spec (@ci-skip, BOLT-7): checkout-fault-order-submission-503.spec.ts covers the same failure with a 503.
  test(
    'the network error on the order submission shows the same failure with another error code',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      // 1. Reach the review page with a cash-on-delivery draft under the
      // network fault: open `/telefonok?mi-scenario=offline-order`, open the
      // first `product-card` with no `product-card-stock` marker through its
      // `product-card-cta`, add it with the inner button of
      // `add-to-cart-button`, open the cart with `cart-link`, press
      // `cart-continue`, fill the contact step with "Teszt Elek",
      // "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`,
      // then on the delivery step choose "Házhoz szállítás", fill "1052" /
      // "Budapest" / "Fő utca 1.", choose "Utánvét" by its `payment-radio` and
      // press `delivery-confirm`.
      await test.step('Reach the review page with a cash-on-delivery draft under the network fault.', async () => {
        // The mock reads the scenario when the document loads and keeps it
        // through in-app navigation, so the first goto carries the fault and
        // every later navigation stays inside it.
        await page.goto('/telefonok?mi-scenario=offline-order');

        // The product is never named: the scenario picks its card by what the
        // screen shows, the first card with no "Elfogyott" marker.
        const inStockCard = page
          .getByTestId('product-card')
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);

        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

        // The section write is not the endpoint this scenario breaks, so the
        // wizard advances to the delivery step.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();

        const homeDeliveryRadio = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' })
          .getByTestId('delivery-radio');
        await homeDeliveryRadio.click();
        await expect(homeDeliveryRadio).toBeChecked();

        // Choosing home delivery reveals the address form.
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

        // The review page is reached and the draft reads back as a
        // cash-on-delivery order; the step's own indicator is the wizard's
        // header, and the checkout layout carries no cart badge.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-payment')).toHaveText('Utánvét');
        await expect(page.getByTestId('review-items').getByTestId('review-line')).toHaveCount(1);
        await expect(page.getByTestId('checkout-steps')).toBeVisible();
        await expect(page.getByTestId('cart-badge')).toHaveCount(0);
      });

      // 2. Tick `review-consent-terms-input` and press the inner button of
      // `review-submit`.
      await test.step('Tick `review-consent-terms-input` and press the inner button of `review-submit`.', async () => {
        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        const submitButton = page.getByTestId('review-submit').getByRole('button');
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

        // The submission fails as a network error, so the browser stays on the
        // review step and no receipt is invented.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('order-receipt')).toHaveCount(0);

        // The network fault surfaces the same copy as the 503 flavour and
        // differs from it only in `data-error-code` ("UNKNOWN" here against
        // "SERVICE_UNAVAILABLE" there), so a shopper cannot tell the two faults
        // apart on this screen.
        const failure = page.getByTestId('review-submit-failure');
        await expect(failure).toBeVisible();
        await expect(failure).toHaveAttribute('data-error-code', 'UNKNOWN');
        await expect(failure).toContainText(
          'A kosarad és az adataid megmaradtak. Próbáld újra, vagy módosítsd a fizetési módot.',
        );
        await expect(failure.getByTestId('review-change-payment')).toHaveText(
          'Fizetési mód módosítása',
        );
        await expect(page.getByTestId('review-state-banner')).toHaveText(
          'A rendelés leadása nem sikerült.',
        );
      });

      // 3. Press the inner button of `review-submit` once more and read the page
      // again.
      await test.step('Press the inner button of `review-submit` once more and read the page again.', async () => {
        await page.getByTestId('review-submit').getByRole('button').click();

        // The fault answers every attempt alike: the same failure returns and
        // the browser never leaves the review step.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        const failure = page.getByTestId('review-submit-failure');
        await expect(failure).toBeVisible();
        await expect(failure).toHaveAttribute('data-error-code', 'UNKNOWN');
        await expect(failure).toContainText(
          'A kosarad és az adataid megmaradtak. Próbáld újra, vagy módosítsd a fizetési módot.',
        );
        await expect(page.getByTestId('review-state-banner')).toHaveText(
          'A rendelés leadása nem sikerült.',
        );

        // The draft is intact after both attempts.
        await expect(page.getByTestId('review-contact')).toBeVisible();
        await expect(page.getByTestId('review-delivery')).toBeVisible();
        await expect(page.getByTestId('review-items')).toBeVisible();
        await expect(page.getByTestId('review-summary')).toBeVisible();
      });
    },
  );
});
