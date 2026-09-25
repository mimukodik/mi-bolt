// spec: specs/checkout-lost-paths.md
// seed: e2e/seed.spec.ts

import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures/coverage';

// The product page mounts its purchase call to action twice; below 1024px the
// desktop CTA column (`.cta-desktop`) is `display: none` (the product page
// stylesheet) and the sticky `purchase-rail` carries the press through its
// `purchase-cta`; at 1024px and wider the `add-to-cart-button` inside
// `.cta-desktop` is the shown mount. Both stay in the DOM at either width, so
// the viewport decides which one a test drives.
const DESKTOP_MIN_WIDTH = 1024;

// The fault query this scenario opens with: `lost-once-payment-intent` lets the
// first payment-intent request commit and then loses its answer. The mock reads
// `?mi-scenario=` when the document loads, so a `page.goto` without it would
// load the default scenario and a cart of its own (rule 12 of
// `e2e/seed.spec.ts`). The whole scenario after that first load runs through
// in-app navigation and the demo payment round trip, so no further goto is made
// and the "once" fault is never re-armed.
const SCENARIO_QUERY = 'mi-scenario=lost-once-payment-intent';

test.describe('Checkout: an answer lost after the commit', () => {
  test(
    '[E096] a retried payment start opens the payment page for a newly created intent',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;

      // The demo payment application sends the shopper back with a full page
      // load (`window.location.assign(intent.returnUrl)`), so the shop starts
      // cold on `/penztar?paymentIntentId=...` and this page's own router then
      // moves on to the review step. Recording every main-frame navigation from
      // before the press is what catches the transient return URL.
      const navigations: string[] = [];
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations.push(frame.url());
      });

      /** The add control in the mount the viewport shows. */
      const addControl = (): Locator =>
        narrowViewport
          ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
          : page.getByTestId('add-to-cart-button').getByRole('button');

      // Both are read off the screens, never pinned: the demo payment page's
      // amount is checked against the review page's own total, and the receipt
      // against the amount the demo payment page showed.
      let orderTotalText = '';
      let orderTotalDigits = '';
      let paymentIntentId = '';

      // 1. Reach the review step with a card draft under the fault.
      await test.step('1. Reach the review step with a card draft under the fault: open `/telefonok?mi-scenario=lost-once-payment-intent`, open the first `product-card` that has no `product-card-stock` marker through its `product-card-cta`, add it (the inner button of `add-to-cart-button` at 1024 px and wider, `purchase-cta` below 1024 px), open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`, then on the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose "Bankkártya" by its `payment-radio` (value `card`) and press `delivery-confirm`.', async () => {
        await page.goto(`/telefonok?${SCENARIO_QUERY}`);

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(page.getByTestId('result-count')).toHaveText(
          '55 találat a szűrt feltételek szerint',
        );

        // The product is never named: the scenario picks its card by what the
        // screen shows, the first one without an "Elfogyott" marker.
        const inStockCard = page
          .getByTestId('product-card')
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');

        const addButton = addControl();
        await expect(addButton).toBeEnabled();
        await addButton.click();

        // The header badge carries the cart's total and it moves only once the
        // add has landed, so this is the press's own confirmation. The scenario
        // breaks only the payment-intent create, so the addition still succeeds.
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

        // A card order is never placed without a payment: the CTA is natively
        // disabled while the draft pays by card and no intent has succeeded.
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeDisabled();
        await expect(page.getByTestId('review-cta-explanation')).toHaveText(
          'A kártyás fizetés jóváhagyása szükséges a rendelés leadásához.',
        );

        await expect(page.getByTestId('review-items').getByTestId('review-line')).toHaveCount(1);

        // The summary's rows, read inside `review-summary` so the cart's own
        // summary elsewhere on the screen cannot answer for them.
        const summary = page.getByTestId('review-summary');
        const paymentFeeRow = summary.getByTestId('order-summary-payment-fee');
        await expect(paymentFeeRow).toContainText('Fizetési díj');
        await expect(paymentFeeRow.getByTestId('price-amount')).toHaveText('0');

        const totalRow = summary.getByTestId('order-summary-total');
        await expect(totalRow).toContainText('Végösszeg');
        const reviewTotalAmount = totalRow.getByTestId('price-amount');
        await expect(reviewTotalAmount).toHaveText('89 990');

        // The Végösszeg noted here is the amount step 3 checks the demo payment
        // page against.
        orderTotalText = ((await reviewTotalAmount.textContent()) ?? '').trim();
        orderTotalDigits = orderTotalText.replace(/\D/g, '');
      });

      // 2. Press the inner button of `review-payment-new` once: the intent
      // commits and its answer is lost on the way back.
      await test.step('2. Press the inner button of `review-payment-new` ("Fizetés indítása") once: the intent commits and its answer is lost on the way back.', async () => {
        await page.getByTestId('review-payment-new').getByRole('button').click();

        // The browser stays put: the committed intent's answer never arrived,
        // so no payment page is opened over the write that landed.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        expect(navigations.some((url) => url.includes('/demo-fizetes/'))).toBe(false);

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

        // The payment branch is unchanged, so the screen says no payment exists
        // although one was created.
        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'A kártyás fizetéshez indítsd el a fizetést.',
        );
        await expect(page.getByTestId('review-payment-new').getByRole('button')).toHaveText(
          'Fizetés indítása',
        );

        // Nothing is lost on screen: the CTA stays disabled for the unpaid card
        // draft, and the whole draft stays.
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeDisabled();
        await expect(page.getByTestId('review-items').getByTestId('review-line')).toHaveCount(1);
        await expect(page.getByTestId('review-summary')).toBeVisible();
      });

      // 3. Press the inner button of `review-payment-new` again (the row's
      // "Retry original payment key") and read the demo payment page it opens.
      await test.step('3. Press the inner button of `review-payment-new` again (the row\'s "Retry original payment key") and read the demo payment page it opens.', async () => {
        await page.getByTestId('review-payment-new').getByRole('button').click();

        // The shop is left for the demo payment application, with the intent id
        // as a path segment.
        await expect(page).toHaveURL(/\/demo-fizetes\/[^/]+$/);
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
        // `pay-amount` renders the intent's amount through the currency pipe, so
        // its digits are the Végösszeg read on the review page.
        expect(((await payAmount.textContent()) ?? '').replace(/\D/g, '')).toBe(orderTotalDigits);

        const payRef = page.getByTestId('pay-ref');
        await expect(payRef).toBeVisible();
        paymentIntentId = ((await payRef.textContent()) ?? '').trim();
        expect(paymentIntentId).not.toBe('');
        // The intent id is the URL's last path segment and `pay-ref` at once.
        expect(new URL(page.url()).pathname.split('/').filter(Boolean).pop()).toBe(paymentIntentId);

        await expect(page.getByTestId('pay-succeeded')).toHaveText('Sikeres fizetés');
        await expect(page.getByTestId('pay-declined')).toHaveText('Elutasított fizetés');
        await expect(page.getByTestId('pay-pending')).toHaveText('Függőben marad');

        // The row's "Intent not duplicated" has no screen surface: neither the
        // shop nor the demo payment application shows how many intents exist,
        // and the first press never reached a payment page, so there is no
        // earlier address and no earlier `pay-ref` to compare this id with.
        // Measured in the browser beyond the screen, the second press carries a
        // fresh `Idempotency-Key` and the session then holds two intents — the
        // one the first press created and the one this page names, both still
        // requiring action — so the retry does not replay the original payment
        // key. Only what the screen shows is asserted here.
      });

      // 4. Press `pay-succeeded` ("Sikeres fizetés") and read the return to the
      // shop.
      await test.step('4. Press `pay-succeeded` ("Sikeres fizetés") and read the return to the shop.', async () => {
        await page.getByTestId('pay-succeeded').click();

        // The return to the shop is a full page load and the cold-start page
        // navigates on to the review step, so the settled page is asserted
        // first; the return URL read below is then already recorded.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-payment-status')).toHaveText('A fizetés jóváhagyva.');
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeEnabled();

        // The terms tick is not carried through the payment round trip.
        await expect(page.getByTestId('review-consent-terms-input')).not.toBeChecked();
        await expect(page.getByTestId('review-cta-explanation')).toHaveText(
          'A demó feltételek elfogadása szükséges a leadáshoz.',
        );

        const returnUrl = navigations.find((url) => url.includes('?paymentIntentId='));
        expect(returnUrl).toBeDefined();
        expect(returnUrl).toContain(`/penztar?paymentIntentId=${paymentIntentId}`);
      });

      // 5. Tick `review-consent-terms-input` and press the inner button of
      // `review-submit`.
      await test.step('5. Tick `review-consent-terms-input` ("Elfogadom a demó rendelési feltételeit.") and press the inner button of `review-submit` ("Demórendelés véglegesítése").', async () => {
        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        await page.getByTestId('review-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        await expect(page.getByTestId('order-receipt')).toBeVisible();
        await expect(page.getByTestId('success-heading')).toHaveText('Elkészült a demórendelésed.');

        // The session's own order counter reads its first value, which is the
        // screen's statement that exactly one order was created (a second
        // committed order would read "DEMO-000002").
        await expect(page.getByTestId('receipt-order-number')).toHaveText('DEMO-000001');

        // The receipt's total is the amount the demo payment page showed.
        const receiptTotal = page.getByTestId('receipt-row-total').getByTestId('price-amount');
        await expect(receiptTotal).toHaveText(orderTotalText);
        await expect(page.getByTestId('receipt-lines').getByTestId('receipt-line')).toHaveCount(1);

        await expect(page.getByTestId('receipt-row-payment')).toContainText('Bankkártya');
        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );
      });
    },
  );
});
