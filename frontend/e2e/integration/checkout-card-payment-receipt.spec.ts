// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: from the cart to the receipt', () => {
  // CI skips this spec (@ci-skip, BOLT-7): checkout-lost-intent-retry.spec.ts covers a card payment to a receipt.
  test(
    'card payment round trip reaches the receipt',
    { tag: ['@integration', '@ci-skip'] },
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
      // load (`window.location.assign`), so the shop starts cold on
      // `/penztar?paymentIntentId=...` and this page's own router then moves on
      // to the review step. Recording every main-frame navigation from before
      // the press is what catches the transient return URL.
      const navigations: string[] = [];
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations.push(frame.url());
      });

      // Both are read off the screens, never pinned: the demo payment page's
      // amount is checked against the review page's own total, and the return
      // URL against the transaction id the demo page showed.
      let orderTotalDigits = '';
      let paymentIntentId = '';

      // 1. Reach the review page with a card draft: open `/telefonok`, open the
      // first in-stock card, add it with `add-to-cart-button`, open the cart
      // with `cart-link`, press `cart-continue`, complete the contact step, and
      // on the delivery step choose "Házhoz szállítás", fill "1052" /
      // "Budapest" / "Fő utca 1.", choose the "Bankkártya" payment option and
      // press `delivery-confirm`.
      await test.step('Reach the review page with a card draft: open `/telefonok`, open the first in-stock card, add it with `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, complete the contact step, and on the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose the "Bankkártya" payment option and press `delivery-confirm`.', async () => {
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

        await page.getByTestId('delivery-option').filter({ hasText: 'Házhoz szállítás' }).click();
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
        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'A kártyás fizetéshez indítsd el a fizetést.',
        );
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

      // 2. Press the inner button of `review-payment-new`.
      await test.step('Press the inner button of `review-payment-new`.', async () => {
        await page.getByTestId('review-payment-new').getByRole('button').click();

        // The shop is left for the demo payment application, with the intent id
        // as a path segment.
        await expect(page).toHaveURL(/\/demo-fizetes\/[^/]+$/);
      });

      // 3. Read the demo payment page.
      await test.step('Read the demo payment page.', async () => {
        await expect(
          page.getByRole('heading', { level: 1, name: 'Fizetés jóváhagyása' }),
        ).toBeVisible();
        await expect(
          page.getByText(
            'Ez egy szimulált fizetési felület. Válaszd ki, hogyan viselkedjen a fizetés.',
          ),
        ).toBeVisible();

        const payAmount = page.getByTestId('pay-amount');
        await expect(payAmount).toBeVisible();
        // `pay-amount` renders the intent's amount through the currency pipe,
        // so its digits are the order total read on the review page.
        expect(((await payAmount.textContent()) ?? '').replace(/\D/g, '')).toBe(orderTotalDigits);

        const payRef = page.getByTestId('pay-ref');
        await expect(payRef).toBeVisible();
        paymentIntentId = ((await payRef.textContent()) ?? '').trim();
        expect(paymentIntentId).not.toBe('');

        await expect(page.getByTestId('pay-succeeded')).toHaveText('Sikeres fizetés');
        await expect(page.getByTestId('pay-declined')).toHaveText('Elutasított fizetés');
        await expect(page.getByTestId('pay-pending')).toHaveText('Függőben marad');
        // The four card fields are scenery: they decide nothing, so their
        // presence is the whole of what they assert.
        for (const cardField of [
          'pay-card-number',
          'pay-card-holder',
          'pay-card-expiry',
          'pay-card-cvc',
        ]) {
          await expect(page.getByTestId(cardField)).toBeVisible();
        }
      });

      // 4. Press `pay-succeeded` ("Sikeres fizetés").
      await test.step('Press `pay-succeeded` ("Sikeres fizetés").', async () => {
        await page.getByTestId('pay-succeeded').click();

        // The return to the shop is a full page load and the cold-start page
        // navigates on to the review step, so the settled page is asserted
        // first; the return URL read below is then already recorded.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-payment-status')).toHaveText('A fizetés jóváhagyva.');

        const returnUrl = navigations.find((url) => url.includes('?paymentIntentId='));
        expect(returnUrl).toBeDefined();
        expect(returnUrl).toContain(`/penztar?paymentIntentId=${paymentIntentId}`);
      });

      // 5. Tick `review-consent-terms-input` if it is not already ticked, then
      // check the CTA state.
      await test.step('Tick `review-consent-terms-input` if it is not already ticked, then check the CTA state.', async () => {
        const termsConsent = page.getByTestId('review-consent-terms-input');
        // `check()` ticks the box and is a no-op when the tick the round trip
        // preserved is already there.
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        await expect(page.getByTestId('review-submit').getByRole('button')).toBeEnabled();
        await expect(page.getByTestId('review-cta-explanation')).toHaveCount(0);
      });

      // 6. Press the inner button of `review-submit` ("Demórendelés
      // véglegesítése").
      await test.step('Press the inner button of `review-submit` ("Demórendelés véglegesítése").', async () => {
        await page.getByTestId('review-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        await expect(page.getByTestId('order-receipt')).toBeVisible();
        await expect(page.getByTestId('receipt-order-number')).not.toBeEmpty();
        await expect(page.getByTestId('receipt-row-payment')).toContainText('Bankkártya');
        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );
        await expect(page.getByTestId('success-check')).toBeVisible();
      });
    },
  );
});
