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
  test('the card payment cannot be started', { tag: '@integration' }, async ({ page }) => {
    const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
    const addToCartButton = narrowViewport
      ? page.getByTestId('purchase-cta').getByRole('button')
      : page.getByTestId('add-to-cart-button').getByRole('button');

    // 1. Reach the review page with a card draft under the fault: open
    // `/telefonok?mi-scenario=fail-payment-intent`, open the first
    // `product-card` with no `product-card-stock` marker through its
    // `product-card-cta`, add it with the inner button of `add-to-cart-button`,
    // open the cart with `cart-link`, press `cart-continue`, fill the contact
    // step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and
    // press `contact-submit`, then on the delivery step choose "Házhoz
    // szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose "Bankkártya"
    // by its `payment-radio` and press `delivery-confirm`.
    await test.step('Reach the review page with a card draft under the fault: open `/telefonok?mi-scenario=fail-payment-intent`, open the first `product-card` with no `product-card-stock` marker through its `product-card-cta`, add it with the inner button of `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`, then on the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose "Bankkártya" by its `payment-radio` and press `delivery-confirm`.', async () => {
      // The fault must be on the first page load: the mock reads the scenario
      // then, and an in-app navigation keeps it.
      await page.goto('/telefonok?mi-scenario=fail-payment-intent');
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
      await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
      await expect(addToCartButton).toBeEnabled();
      await addToCartButton.click();
      // The scenario breaks only the payment-intent create, so the addition
      // still succeeds and the header badge counts the line.
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
      await page.getByTestId('contact-submit').getByRole('button').click();

      // The section write (`checkout-update`) is not the endpoint this
      // scenario breaks, so the contact step is saved and the wizard advances.
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

      const cardPaymentRadio = page
        .getByTestId('payment-option')
        .filter({ hasText: 'Bankkártya' })
        .getByTestId('payment-radio');
      await cardPaymentRadio.click();
      await expect(cardPaymentRadio).toBeChecked();

      await page.getByTestId('delivery-confirm').getByRole('button').click();

      await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
      await expect(page.getByTestId('review-page')).toBeVisible();
      // The wire's own label for the chosen option, never a hard-coded name.
      await expect(page.getByTestId('review-payment')).toHaveText('Bankkártya');
      // No payment has been started yet in this session, so the branch words
      // itself as the start of a payment.
      await expect(page.getByTestId('review-payment-status')).toHaveText(
        'A kártyás fizetéshez indítsd el a fizetést.',
      );
      await expect(page.getByTestId('review-payment-new').getByRole('button')).toHaveText(
        'Fizetés indítása',
      );
      await expect(page.getByTestId('review-submit-failure')).toHaveCount(0);

      // A card order is never placed without a payment: the CTA is natively
      // disabled while the draft pays by card and no intent has succeeded.
      await expect(page.getByTestId('review-submit').getByRole('button')).toBeDisabled();
      await expect(page.getByTestId('review-cta-explanation')).toHaveText(
        'A kártyás fizetés jóváhagyása szükséges a rendelés leadásához.',
      );
    });

    // 2. Press the inner button of `review-payment-new` ("Fizetés indítása").
    await test.step('Press the inner button of `review-payment-new` ("Fizetés indítása").', async () => {
      await page.getByTestId('review-payment-new').getByRole('button').click();

      // The create (`payment-intent`) is the endpoint this scenario breaks, so
      // the browser never leaves the shop for the demo payment page.
      await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
      await expect(page.getByTestId('review-page')).toBeVisible();

      const failure = page.getByTestId('review-submit-failure');
      await expect(failure).toBeVisible();
      await expect(failure).toHaveAttribute('data-error-code', 'SERVICE_UNAVAILABLE');
      await expect(failure).toContainText(
        'A kosarad és az adataid megmaradtak. Próbáld újra, vagy módosítsd a fizetési módot.',
      );
      await expect(failure.getByTestId('review-change-payment')).toHaveText(
        'Fizetési mód módosítása',
      );

      await expect(page.getByTestId('review-state-banner')).toHaveText(
        'A rendelés leadása nem sikerült.',
      );

      // No intent exists yet, so the payment branch still invites the shopper
      // to start one rather than reporting a payment outcome.
      await expect(page.getByTestId('review-payment-status')).toHaveText(
        'A kártyás fizetéshez indítsd el a fizetést.',
      );
      await expect(page.getByTestId('review-payment-new').getByRole('button')).toHaveText(
        'Fizetés indítása',
      );

      // The CTA is still disabled for the unpaid card draft. This error state
      // renders its own banner in place of the CTA explanation, so
      // `review-cta-explanation` is not on screen here.
      await expect(page.getByTestId('review-submit').getByRole('button')).toBeDisabled();
      await expect(page.getByTestId('review-cta-explanation')).toHaveCount(0);

      // Nothing was lost: the whole draft stays on screen.
      await expect(page.getByTestId('review-contact')).toBeVisible();
      await expect(page.getByTestId('review-delivery')).toBeVisible();
      await expect(page.getByTestId('review-items').getByTestId('review-line')).toHaveCount(1);
      await expect(page.getByTestId('review-summary')).toBeVisible();
    });

    // 3. Press the inner button of `review-payment-new` once more.
    await test.step('Press the inner button of `review-payment-new` once more.', async () => {
      await page.getByTestId('review-payment-new').getByRole('button').click();

      // The fault answers every attempt alike and the repeat costs nothing:
      // the same failure returns and the browser stays put.
      await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
      const failure = page.getByTestId('review-submit-failure');
      await expect(failure).toBeVisible();
      await expect(failure).toHaveAttribute('data-error-code', 'SERVICE_UNAVAILABLE');
      await expect(failure).toContainText(
        'A kosarad és az adataid megmaradtak. Próbáld újra, vagy módosítsd a fizetési módot.',
      );
      await expect(failure.getByTestId('review-change-payment')).toHaveText(
        'Fizetési mód módosítása',
      );
    });

    // 4. Press `review-change-payment` ("Fizetési mód módosítása").
    await test.step('Press `review-change-payment` ("Fizetési mód módosítása").', async () => {
      await page
        .getByTestId('review-submit-failure')
        .getByTestId('review-change-payment')
        .getByRole('button')
        .click();

      // The failure's way out leads back to the delivery step, which still
      // holds the saved draft.
      await expect(page).toHaveURL(/\/penztar\/szallitas$/);
      await expect(page.getByTestId('delivery-step')).toBeVisible();
      const cardPaymentRadio = page
        .getByTestId('payment-option')
        .filter({ hasText: 'Bankkártya' })
        .getByTestId('payment-radio');
      await expect(cardPaymentRadio).toBeChecked();
    });

    // 5. Choose "Utánvét" by its `payment-radio`, press `delivery-confirm`,
    // tick `review-consent-terms-input` if it is not already ticked, and press
    // the inner button of `review-submit`.
    await test.step('Choose "Utánvét" by its `payment-radio`, press `delivery-confirm`, tick `review-consent-terms-input` if it is not already ticked, and press the inner button of `review-submit`.', async () => {
      const cashOnDeliveryRadio = page
        .getByTestId('payment-option')
        .filter({ hasText: 'Utánvét' })
        .getByTestId('payment-radio');
      await cashOnDeliveryRadio.click();
      await expect(cashOnDeliveryRadio).toBeChecked();

      await page.getByTestId('delivery-confirm').getByRole('button').click();

      await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
      await expect(page.getByTestId('review-page')).toBeVisible();
      await expect(page.getByTestId('review-payment')).toHaveText('Utánvét');

      const termsConsent = page.getByTestId('review-consent-terms-input');
      // `check()` ticks the box and is a no-op when the tick is already there.
      await termsConsent.check();
      await expect(termsConsent).toBeChecked();

      // Cash on delivery needs no intent, so the CTA is live once the terms
      // are accepted.
      const submitButton = page.getByTestId('review-submit').getByRole('button');
      await expect(submitButton).toBeEnabled();
      await submitButton.click();

      await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
      await expect(page.getByTestId('order-receipt')).toBeVisible();
      await expect(page.getByTestId('success-heading')).toHaveText('Elkészült a demórendelésed.');
      await expect(page.getByTestId('receipt-row-payment')).toContainText('Utánvét');
    });
  });
});
