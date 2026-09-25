// spec: specs/checkout-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: edge paths', () => {
  test(
    'a cart change under a paid intent drops the paid intent on the way back to the review step',
    { tag: '@integration' },
    async ({ page }) => {
      // The purchase control is laid out differently at the two integration
      // viewports: below 1024px the product page's desktop CTA column is
      // `display: none` and the sticky `purchase-rail` carries the same
      // "Kosárba teszem" press through its `purchase-cta`. Both mounts stay in
      // the DOM at either width, so the viewport decides which one the test
      // drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      // The add confirmation is mounted twice — by the page's own status
      // message on the wide layout and by the rail's copy on the narrow one —
      // and the hidden mount carries the same text, so the assertion targets
      // whichever one the viewport shows.
      const addConfirmation = page.getByTestId('status-message').filter({ visible: true });

      // The order-write recorder, armed before the first press of step 1's
      // payment so every order write the whole path makes is collected. The
      // path may create exactly one order, at the final submit.
      const orderWrites: string[] = [];
      page.on('request', (request) => {
        if (request.method() !== 'POST' || !request.url().endsWith('/api/v1/orders')) return;
        orderWrites.push(request.url());
      });

      // The demo payment application sends the shopper back with a full page
      // load (`window.location.assign`), so the return URL is a main-frame
      // navigation the shop's router then moves on from. Recording every
      // main-frame navigation is what catches the transient
      // `/penztar?paymentIntentId=...` hop.
      const navigations: string[] = [];
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations.push(frame.url());
      });

      // Every HUF amount renders through `PriceBlock.formatHuf`, whose
      // thousands separator is a non-breaking space, so amounts are compared
      // by their digits rather than by a copied string.
      const digitsOf = (text: string | null): string => (text ?? '').replace(/\D/g, '');
      // `review-line-quantity` reads "<quantity> × <unit price> Ft", so the
      // unit price is the number that precedes the "Ft" glyph.
      const unitPriceDigitsOf = (text: string | null): string =>
        digitsOf(/(\d[\d\s]*)\s*Ft/.exec(text ?? '')?.[1] ?? null);

      // The one-unit total the paid intent was created for, the line's own unit
      // price, and the two-unit total the later checks expect, all noted on the
      // first arrival at the review step.
      let unitPriceDigits = '';
      let paidTotalDigits = '';
      let doubledTotalDigits = '';
      // The intent id the first payment was created for, so the second one can
      // be shown to be freshly issued.
      let firstIntentId = '';

      // 1. Reach the review page with a card draft and pay it: open
      // `/telefonok`, open the first card without a `product-card-stock`
      // marker, add it with `add-to-cart-button`, open the cart with
      // `cart-link`, press `cart-continue`, fill the contact step with "Teszt
      // Elek", "teszt@example.test" and "+36 30 123 4567" and submit it,
      // choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.",
      // choose "Bankkártya" and press `delivery-confirm`; then press
      // `review-payment-new` and `pay-succeeded` on the demo payment page.
      await test.step('Reach the review page with a card draft and pay it: open `/telefonok`, open the first card without a `product-card-stock` marker, add it with `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and submit it, choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose "Bankkártya" and press `delivery-confirm`; then press `review-payment-new` and `pay-succeeded` on the demo payment page.', async () => {
        await page.goto('/telefonok');
        const cards = page.getByTestId('product-card');
        // The grid renders a loading status while it is empty, so waiting for
        // the first card means the pick below reads real cards.
        await expect(cards.first()).toBeVisible();
        // The product is never named: the first card that carries no
        // "Elfogyott" marker is the one the screen offers as buyable.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await addToCartButton.click();
        // The add is a request of its own; the header badge reaching 1 is what
        // says it has landed before the cart is opened.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page.getByTestId('contact-page')).toBeVisible();
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();

        const homeDelivery = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' });
        await homeDelivery.click();
        await expect(homeDelivery.getByTestId('delivery-selected-badge')).toHaveText('Kiválasztva');
        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Fő utca 1.');

        const cardPayment = page.getByTestId('payment-option').filter({ hasText: 'Bankkártya' });
        await cardPayment.click();
        await expect(cardPayment.getByTestId('payment-selected-badge')).toHaveText('Kiválasztva');

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'A kártyás fizetéshez indítsd el a fizetést.',
        );

        // This is the first press of the path's payment; the recorder armed
        // above already watches for the order write behind it.
        await page.getByTestId('review-payment-new').getByRole('button').click();
        await expect(page).toHaveURL(/\/demo-fizetes\/[^/]+$/);
        firstIntentId = new URL(page.url()).pathname.split('/').pop() ?? '';
        expect(firstIntentId).not.toBe('');

        await page.getByTestId('pay-succeeded').click();

        // The approval sends the shopper back with a full page load, so the
        // return URL and the review step rendering are what say the round trip
        // has finished.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-payment-status')).toHaveText('A fizetés jóváhagyva.');

        // The summary's "Végösszeg" and the line's own "1 × <unit price> Ft"
        // agree, and the amounts are noted for the two-unit checks later.
        const summaryTotal = page.getByTestId('order-summary-total').getByTestId('price-amount');
        await expect(summaryTotal).toBeVisible();
        const lineQuantity = page.getByTestId('review-line-quantity');
        await expect(lineQuantity).toHaveText(/^\s*1 × .* Ft\s*$/);
        paidTotalDigits = digitsOf(await summaryTotal.textContent());
        unitPriceDigits = unitPriceDigitsOf(await lineQuantity.textContent());
        doubledTotalDigits = String(Number(paidTotalDigits) * 2);
        expect(paidTotalDigits).not.toBe('');
        expect(unitPriceDigits).toBe(paidTotalDigits);
      });

      // 2. Change the cart under the paid intent: press `back-to-shop`, open
      // the same first card again through its `product-card-cta`, and press
      // the inner button of `add-to-cart-button`.
      await test.step('Change the cart under the paid intent: press `back-to-shop`, open the same first card again through its `product-card-cta`, and press the inner button of `add-to-cart-button`.', async () => {
        await page.getByTestId('back-to-shop').click();

        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();
        await expect(page.getByTestId('product-page')).toBeVisible();

        await addToCartButton.click();
        await expect(addConfirmation).toContainText('2 darab a kosárban.');
        await expect(page.getByTestId('cart-badge')).toHaveText('2');
      });

      // 3. Return to the review step through the browser history: press the
      // browser's Back button twice (the catalogue, then the review step).
      await test.step("Return to the review step through the browser history: press the browser's Back button twice (the catalogue, then the review step).", async () => {
        await page.goBack();
        await expect(page).toHaveURL(/\/telefonok$/);
        await page.goBack();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();

        // The review step reads the checkout session fresh on every arrival, so
        // the re-read's own dropped-intent message is what says the two-unit
        // session has landed; the amount reads below rest on it.
        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'A korábbi kártyás fizetés már nem érvényes, mert közben megváltozott a rendelés. Indíts új fizetést.',
        );

        const lineQuantity = page.getByTestId('review-line-quantity');
        await expect(lineQuantity).toHaveText(/^\s*2 × .* Ft\s*$/);
        expect(unitPriceDigitsOf(await lineQuantity.textContent())).toBe(unitPriceDigits);

        // The re-read summary is the two-unit total, twice the one-unit total
        // the paid intent was created for.
        const summaryTotal = page.getByTestId('order-summary-total').getByTestId('price-amount');
        await expect(summaryTotal).toBeVisible();
        expect(digitsOf(await summaryTotal.textContent())).toBe(doubledTotalDigits);

        await expect(page.getByTestId('review-payment-new').getByRole('button')).toHaveText(
          'Új fizetés indítása',
        );
        await expect(page.getByTestId('review-price-change')).toHaveCount(0);
        await expect(page.getByTestId('review-page')).toHaveAttribute('data-status', 'ready');
        await expect(page.getByTestId('review-cta-explanation')).toHaveText(
          'A kártyás fizetés jóváhagyása szükséges a rendelés leadásához.',
        );
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeDisabled();
      });

      // 4. Start a new card payment against the two-unit order: press the
      // inner button of `review-payment-new`, then press `pay-succeeded` on
      // the demo payment page.
      await test.step('Start a new card payment against the two-unit order: press the inner button of `review-payment-new`, then press `pay-succeeded` on the demo payment page.', async () => {
        const navigationsBefore = navigations.length;

        await page.getByTestId('review-payment-new').getByRole('button').click();
        await expect(page).toHaveURL(/\/demo-fizetes\/[^/]+$/);
        const secondIntentId = new URL(page.url()).pathname.split('/').pop() ?? '';
        expect(secondIntentId).not.toBe('');
        // A freshly issued intent, not the one the first payment created.
        expect(secondIntentId).not.toBe(firstIntentId);

        const payAmount = page.getByTestId('pay-amount');
        await expect(payAmount).toBeVisible();
        // The intent carries the two-unit order's total.
        expect(digitsOf(await payAmount.textContent())).toBe(doubledTotalDigits);

        await page.getByTestId('pay-succeeded').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        // The return is a full page load through the intent's own `/penztar`
        // URL, so the transient hop is a recorded main-frame navigation.
        expect(
          navigations
            .slice(navigationsBefore)
            .some((url) => url.includes(`/penztar?paymentIntentId=${secondIntentId}`)),
        ).toBe(true);

        await expect(page.getByTestId('review-payment-status')).toHaveText('A fizetés jóváhagyva.');

        // The summary's "Végösszeg" agrees with the line's "2 × <unit price>
        // Ft".
        const lineQuantity = page.getByTestId('review-line-quantity');
        await expect(lineQuantity).toHaveText(/^\s*2 × .* Ft\s*$/);
        expect(unitPriceDigitsOf(await lineQuantity.textContent())).toBe(unitPriceDigits);
        const summaryTotal = page.getByTestId('order-summary-total').getByTestId('price-amount');
        await expect(summaryTotal).toBeVisible();
        expect(digitsOf(await summaryTotal.textContent())).toBe(doubledTotalDigits);

        await expect(page.getByTestId('review-cta-explanation')).toHaveText(
          'A demó feltételek elfogadása szükséges a leadáshoz.',
        );
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeEnabled();
        await expect(page.getByTestId('review-consent-terms-input')).not.toBeChecked();
      });

      // 5. Tick `review-consent-terms-input` and press the inner button of
      // `review-submit` ("Demórendelés véglegesítése").
      await test.step('Tick `review-consent-terms-input` and press the inner button of `review-submit` ("Demórendelés véglegesítése").', async () => {
        await page.getByTestId('review-consent-terms-input').check();
        await page.getByTestId('review-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        await expect(page.getByTestId('order-receipt')).toBeVisible();
        await expect(page.getByTestId('receipt-order-number')).not.toBeEmpty();
        await expect(page.getByTestId('receipt-demo-badge')).toHaveText('DEMO');
        // `receipt-row-status` is a labelled row whose `Státusz` label sits
        // beside the value in the same element, so the value is contained
        // rather than the row's whole text.
        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );

        // The receipt's total is the two-unit amount, twice the one-unit total
        // the paid intent was created for.
        await expect(page.getByTestId('receipt-row-total')).toContainText('Végösszeg');
        const receiptTotal = page.getByTestId('receipt-row-total').getByTestId('price-amount');
        await expect(receiptTotal).toBeVisible();
        expect(digitsOf(await receiptTotal.textContent())).toBe(doubledTotalDigits);

        // `receipt-lines` shows the two units the summary priced.
        const receiptLines = page.getByTestId('receipt-lines');
        await expect(receiptLines).toContainText('Mennyiség');
        await expect(receiptLines).toContainText('2 db');

        // The whole path created exactly one order, at this submit: the
        // recorder armed before the first press of step 1's payment holds one
        // order write and nothing else.
        expect(orderWrites.length).toBe(1);
      });
    },
  );
});
