// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: from the cart to the receipt', () => {
  test(
    'a declined card payment returns to the review page and can be retried',
    { tag: '@integration' },
    async ({ page }) => {
      // The purchase control is laid out differently at the two integration
      // viewports: below 1024px the product page's desktop `cta-desktop`
      // column is `display: none` (product-page.scss) and the sticky
      // `purchase-rail` carries the same press through its `purchase-cta`. Both
      // mounts stay in the DOM at either width, so the viewport decides which
      // one the test drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      // The demo payment application sends the shopper back with a full page
      // load (`window.location.assign`), and the intent it opened on is the
      // last path segment of `/demo-fizetes/<paymentIntentId>`.
      const paymentIntentIdFromUrl = (): string =>
        new URL(page.url()).pathname.split('/').pop() ?? '';

      // Both are read off the screens, never pinned: the demo payment page's
      // amount is checked against the review page's own total, and the retry's
      // intent id against the one the first attempt opened on.
      let orderTotalDigits = '';
      let declinedPaymentIntentId = '';

      // 1. Reach the review page with a card draft: open `/telefonok`, open the
      // first in-stock card, add it with `add-to-cart-button`, open the cart
      // with `cart-link`, press `cart-continue`, complete the contact step, and
      // on the delivery step choose "Házhoz szállítás", fill "1052" /
      // "Budapest" / "Fő utca 1.", choose "Bankkártya" and press
      // `delivery-confirm`.
      await test.step('Reach the review page with a card draft: open `/telefonok`, open the first in-stock card, add it with `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, complete the contact step, and on the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose "Bankkártya" and press `delivery-confirm`.', async () => {
        await page.goto('/telefonok');
        await expect(page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' })).toBeVisible();

        const cards = page.getByTestId('product-card');
        // The grid renders a "Katalógus betöltése" status while it is empty, so
        // waiting for the first card means the pick below reads real cards.
        await expect(cards.first()).toBeVisible();
        // An in-stock card carries no `product-card-stock` marker; an
        // out-of-stock one shows its "Elfogyott" label there.
        const inStockCard = cards
          .filter({
            hasNot: page.locator('[data-testid="product-card-stock"]', { hasText: 'Elfogyott' }),
          })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');

        await addToCartButton.click();
        // The header badge carries the cart's total and it moves only once the
        // add has landed, so this is the press's own confirmation.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);

        await page.getByTestId('cart-continue').getByRole('button').click();
        await expect(page.getByTestId('contact-page')).toBeVisible();

        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();

        const homeDeliveryOption = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' });
        await homeDeliveryOption.click();
        await expect(homeDeliveryOption.getByTestId('delivery-selected-badge')).toHaveText(
          'Kiválasztva',
        );
        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Fő utca 1.');

        const cardPaymentOption = page
          .getByTestId('payment-option')
          .filter({ hasText: 'Bankkártya' });
        await cardPaymentOption.click();
        await expect(cardPaymentOption.getByTestId('payment-selected-badge')).toHaveText(
          'Kiválasztva',
        );

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-payment')).toHaveText('Bankkártya');
        await expect(page.getByTestId('review-payment-new').getByRole('button')).toHaveText(
          'Fizetés indítása',
        );

        // The intent the demo payment application opens on carries this order's
        // total, so the total is read here for `pay-amount` to be checked
        // against.
        const reviewTotal = page.getByTestId('order-summary-total').getByTestId('price-amount');
        await expect(reviewTotal).toBeVisible();
        orderTotalDigits = ((await reviewTotal.textContent()) ?? '').replace(/\D/g, '');
        expect(orderTotalDigits).not.toBe('');
      });

      // 2. Press `review-payment-new` and, on the demo payment page, press
      // `pay-declined` ("Elutasított fizetés").
      await test.step('Press `review-payment-new` and, on the demo payment page, press `pay-declined` ("Elutasított fizetés").', async () => {
        await page.getByTestId('review-payment-new').getByRole('button').click();

        // The shop is left for the demo payment application, with the intent id
        // as a path segment.
        await expect(page).toHaveURL(/\/demo-fizetes\/[^/]+$/);
        declinedPaymentIntentId = paymentIntentIdFromUrl();
        expect(declinedPaymentIntentId).not.toBe('');

        const payAmount = page.getByTestId('pay-amount');
        await expect(payAmount).toBeVisible();
        // `pay-amount` renders the intent's amount through the currency pipe,
        // so its digits are the order total read on the review page.
        expect(((await payAmount.textContent()) ?? '').replace(/\D/g, '')).toBe(orderTotalDigits);

        await expect(page.getByTestId('pay-declined')).toHaveText('Elutasított fizetés');
        await page.getByTestId('pay-declined').click();

        // The return to the shop is a full page load and the cold-start page
        // navigates on to the review step.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
      });

      // 3. Read the declined branch.
      await test.step('Read the declined branch.', async () => {
        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'A szimulált fizetés elutasítva.',
        );
        await expect(page.getByTestId('review-payment-retry').getByRole('button')).toHaveText(
          'Újrapróbálom',
        );
        await expect(page.getByTestId('review-payment-change').getByRole('button')).toHaveText(
          'Fizetési mód módosítása',
        );

        const termsConsent = page.getByTestId('review-consent-terms-input');
        // `check()` ticks the box and is a no-op when a tick the round trip
        // preserved is already there.
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();
        await expect(page.getByTestId('review-cta-explanation')).toHaveText(
          'A kártyás fizetés jóváhagyása szükséges a rendelés leadásához.',
        );

        // A declined card never places an order: the CTA is natively disabled
        // while the intent is not succeeded, so the press is forced past that
        // actionability check and the screen is still the review step after it.
        const submitButton = page.getByTestId('review-submit').getByRole('button');
        await expect(submitButton).toBeDisabled();
        await submitButton.click({ force: true });
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
      });

      // 4. Press the inner button of `review-payment-retry`.
      await test.step('Press the inner button of `review-payment-retry`.', async () => {
        await page.getByTestId('review-payment-retry').getByRole('button').click();

        // A new payment starts, so the browser is back on the demo payment
        // application under a fresh intent id.
        await expect(page).toHaveURL(/\/demo-fizetes\/[^/]+$/);
        expect(paymentIntentIdFromUrl()).not.toBe('');
        expect(paymentIntentIdFromUrl()).not.toBe(declinedPaymentIntentId);

        await expect(page.getByTestId('pay-succeeded')).toHaveText('Sikeres fizetés');
      });

      // 5. Press `pay-succeeded`.
      await test.step('Press `pay-succeeded`.', async () => {
        await page.getByTestId('pay-succeeded').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-payment-status')).toHaveText('A fizetés jóváhagyva.');
      });

      // 6. Tick `review-consent-terms-input` if it is not already ticked and
      // press the inner button of `review-submit`.
      await test.step('Tick `review-consent-terms-input` if it is not already ticked and press the inner button of `review-submit`.', async () => {
        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        await page.getByTestId('review-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        await expect(page.getByTestId('order-receipt')).toBeVisible();
        await expect(page.getByTestId('receipt-order-number')).not.toBeEmpty();
        await expect(page.getByTestId('receipt-row-payment')).toContainText('Bankkártya');
        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );
      });
    },
  );
});
