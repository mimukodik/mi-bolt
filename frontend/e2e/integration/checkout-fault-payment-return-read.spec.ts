// spec: specs/checkout-fault-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The add control is laid out differently at the two integration viewports:
// below 1024px the product page's desktop CTA block is not the one on screen
// and the sticky `purchase-rail` carries the same "Kosárba teszem" press
// through its `purchase-cta`. Both mounts stay in the DOM at either width, so
// the viewport decides which one this test drives.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: service faults', () => {
  test(
    'the return from the payment page cannot read the intent',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      // The intent id the shop created on the first press, read back in step 4 to
      // prove the way out starts a fresh payment rather than replaying it.
      let firstIntentId = '';

      // 1. Reach the review page with a card draft under the fault: open
      // `/telefonok?mi-scenario=fail-payment-intent-read`, open the first
      // `product-card` with no `product-card-stock` marker through its
      // `product-card-cta`, add it with the inner button of `add-to-cart-button`,
      // open the cart with `cart-link`, press `cart-continue`, fill the contact
      // step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and
      // press `contact-submit`, then on the delivery step choose "Házhoz
      // szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose "Bankkártya"
      // by its `payment-radio` and press `delivery-confirm`.
      await test.step('Reach the review page with a card draft under the fault: open `/telefonok?mi-scenario=fail-payment-intent-read`, open the first `product-card` with no `product-card-stock` marker through its `product-card-cta`, add it with the inner button of `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`, then on the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose "Bankkártya" by its `payment-radio` and press `delivery-confirm`.', async () => {
        // The fault must be on the first page load: the mock reads the scenario
        // then and keeps it through in-app navigation. This scenario breaks the
        // intent read (`payment-intent-read`), so the product, cart and checkout
        // calls all still work.
        await page.goto('/telefonok?mi-scenario=fail-payment-intent-read');
        await expect(page.getByTestId('product-card').first()).toBeVisible();

        // The product is never named: the scenario picks its card by what the
        // screen shows, the first one without an "Elfogyott" marker.
        const inStockCard = page
          .getByTestId('product-card')
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await addToCartButton.click();
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(page.getByTestId('contact-page')).toBeVisible();
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

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
        // No payment has been started yet in this session, so this branch invites
        // the shopper to start one.
        await expect(page.getByTestId('review-payment-new').getByRole('button')).toHaveText(
          'Fizetés indítása',
        );
      });

      // 2. Press the inner button of `review-payment-new` and read the address bar.
      await test.step('Press the inner button of `review-payment-new` and read the address bar.', async () => {
        await page.getByTestId('review-payment-new').getByRole('button').click();

        // The create (`payment-intent`) is not the endpoint this scenario breaks,
        // so the intent is created and the browser leaves the shop for the demo
        // payment application, whose last path segment is the intent id. Nothing
        // is read into that page's own copy: it is a separate document the
        // scenario query does not reach.
        await expect(page).toHaveURL(/\/demo-fizetes\/[^/]+$/);
        firstIntentId = page.url().split('/').pop() ?? '';
        expect(firstIntentId).not.toBe('');
      });

      // 3. Open the shop's return leg as a fresh page load inside the fault:
      // navigate to `/penztar?mi-scenario=fail-payment-intent-read` (the page
      // reads the intent id the shop stored when the intent was created).
      await test.step("Open the shop's return leg as a fresh page load inside the fault: navigate to `/penztar?mi-scenario=fail-payment-intent-read` (the page reads the intent id the shop stored when the intent was created).", async () => {
        // The return leg is a fresh document, so the query has to be repeated for
        // the mock to load the same fault.
        await page.goto('/penztar?mi-scenario=fail-payment-intent-read');

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        // The read failed, so the shop cannot tell the shopper what became of the
        // payment and offers a fresh start instead.
        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'A fizetési szándék nem található.',
        );
        await expect(page.getByTestId('review-payment-new').getByRole('button')).toHaveText(
          'Új fizetés indítása',
        );
        // The failure arrives as the payment branch's own sentence, never as an
        // order failure: neither the order banner nor the failure card is shown.
        await expect(page.getByTestId('review-submit-failure')).toHaveCount(0);
        await expect(page.getByTestId('review-state-banner')).toHaveCount(0);

        // A card order is never placed without an approved payment.
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeDisabled();
        await expect(page.getByTestId('review-cta-explanation')).toHaveText(
          'A kártyás fizetés jóváhagyása szükséges a rendelés leadásához.',
        );
      });

      // 4. Press the inner button of `review-payment-new` ("Új fizetés indítása").
      await test.step('Press the inner button of `review-payment-new` ("Új fizetés indítása").', async () => {
        await page.getByTestId('review-payment-new').getByRole('button').click();

        // A new intent is created and the browser leaves the shop again. The way
        // out is a fresh payment rather than a replay, so the shopper is never
        // sent back to the intent the shop could not read.
        await expect(page).toHaveURL(/\/demo-fizetes\/[^/]+$/);
        const secondIntentId = page.url().split('/').pop() ?? '';
        expect(secondIntentId).not.toBe(firstIntentId);
      });
    },
  );
});
