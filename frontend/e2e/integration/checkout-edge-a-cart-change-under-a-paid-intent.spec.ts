// spec: specs/checkout-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: edge paths', () => {
  test(
    'a cart change under a paid intent shows the price change banner',
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

      // Every HUF amount renders through `PriceBlock.formatHuf`, whose
      // thousands separator is a non-breaking space, so amounts are compared
      // by their digits rather than by a copied string.
      const digitsOf = (text: string | null): string => (text ?? '').replace(/\D/g, '');
      // `review-line-quantity` reads "<quantity> × <unit price> Ft", so the
      // unit price is the number that precedes the "Ft" glyph.
      const unitPriceDigitsOf = (text: string | null): string =>
        digitsOf(/(\d[\d\s]*)\s*Ft/.exec(text ?? '')?.[1] ?? null);

      // The paid intent's one-unit total (the summary's "Végösszeg"), the
      // line's unit price, and the doubled total the price-change banner
      // announces once the cart has outgrown the intent.
      let unitPriceDigits = '';
      let paidTotalDigits = '';
      let newTotalDigits = '';

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

        // The payment leaves the SPA for the demo payment application, a
        // separate document under `/demo-fizetes/<paymentIntentId>`.
        await page.getByTestId('review-payment-new').getByRole('button').click();
        await expect(page).toHaveURL(/\/demo-fizetes\/[^/]+$/);
        await page.getByTestId('pay-succeeded').click();

        // The approval sends the shopper back with a full page load, so the
        // return URL and the review step rendering are what say the round trip
        // has finished.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-payment-status')).toHaveText('A fizetés jóváhagyva.');

        // The summary's "Végösszeg" and the line's own "1 × <unit price> Ft"
        // agree, and the amount is noted for the price-change check later.
        const summaryTotal = page.getByTestId('order-summary-total').getByTestId('price-amount');
        await expect(summaryTotal).toBeVisible();
        const lineQuantity = page.getByTestId('review-line-quantity');
        // `review-line-quantity` is a template interpolation, so the line's
        // own whitespace survives into `textContent` (" 1 × <unit price> Ft ")
        // and `toHaveText` matches this pattern against that raw text without
        // normalizing it: the anchors tolerate the padding on both ends.
        await expect(lineQuantity).toHaveText(/^\s*1 × .* Ft\s*$/);

        paidTotalDigits = digitsOf(await summaryTotal.textContent());
        unitPriceDigits = unitPriceDigitsOf(await lineQuantity.textContent());
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
        await inStockCard.getByTestId('product-card-cta').click();
        await expect(page.getByTestId('product-page')).toBeVisible();

        await addToCartButton.click();

        // The success banner sits on the desktop CTA column and on the sticky
        // rail at the same time; only the visible mount carries the message at
        // a given width. Its dismiss control is part of the status element, so
        // the message paragraph is the one asserted.
        const addConfirmation = page
          .getByRole('status')
          .filter({ hasText: 'darab a kosárban.' })
          .filter({ visible: true });
        await expect(addConfirmation.getByText(/2 darab a kosárban\.$/)).toBeVisible();
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

        // The history return re-renders the lines from the cart, so the
        // quantity is 2, while the checkout session's own summary keeps the
        // one-unit total it was given before the cart changed.
        const lineQuantity = page.getByTestId('review-line-quantity');
        // Same padded `textContent` as the one-unit line above; the quantity is
        // the cart's two units now.
        await expect(lineQuantity).toHaveText(/^\s*2 × .* Ft\s*$/);
        expect(unitPriceDigitsOf(await lineQuantity.textContent())).toBe(unitPriceDigits);

        await expect(page.getByTestId('review-payment-status')).toHaveText('A fizetés jóváhagyva.');

        const summaryTotal = page.getByTestId('order-summary-total').getByTestId('price-amount');
        await expect(summaryTotal).toBeVisible();
        expect(digitsOf(await summaryTotal.textContent())).toBe(paidTotalDigits);
      });

      // 4. Tick `review-consent-terms-input` and press the inner button of
      // `review-submit` ("Demórendelés véglegesítése").
      await test.step('Tick `review-consent-terms-input` and press the inner button of `review-submit` ("Demórendelés véglegesítése").', async () => {
        await page.getByTestId('review-consent-terms-input').check();
        await page.getByTestId('review-submit').getByRole('button').click();

        // The submit does not advance: the server refuses the order because the
        // total moved while the intent was already paid, and the review step
        // adopts its price-changed state instead.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toHaveAttribute(
          'data-status',
          'price-changed',
        );

        const priceChange = page.getByTestId('review-price-change');
        await expect(priceChange).toBeVisible();
        await expect(priceChange).toContainText('A végösszeg időközben megváltozott.');

        const oldAmount = page.getByTestId('review-price-change-old').getByTestId('price-amount');
        await expect(page.getByTestId('review-price-change-old')).toContainText('Korábban');
        expect(digitsOf(await oldAmount.textContent())).toBe(paidTotalDigits);

        const newAmount = page.getByTestId('review-price-change-new').getByTestId('price-amount');
        await expect(page.getByTestId('review-price-change-new')).toContainText('Most');
        newTotalDigits = digitsOf(await newAmount.textContent());
        // The cart now holds the same product twice, so the new total is the
        // one the paid intent covered, doubled.
        expect(newTotalDigits).toBe(String(Number(paidTotalDigits) * 2));

        // The confirm control names the new amount in its own label, so the
        // press is the shopper's explicit acceptance of that figure.
        const confirmButton = page.getByTestId('review-price-change-confirm').getByRole('button');
        await expect(confirmButton).toContainText('Elfogadom az új végösszeget:');
        expect(digitsOf(await confirmButton.textContent())).toBe(newTotalDigits);

        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'A korábbi kártyás fizetés már nem érvényes, mert közben megváltozott a rendelés. Indíts új fizetést.',
        );
        await expect(page.getByTestId('review-payment-new').getByRole('button')).toHaveText(
          'Új fizetés indítása',
        );

        await expect(page.getByTestId('review-cta-explanation')).toHaveText(
          'Erősítsd meg az új végösszeget a rendelés leadásához.',
        );
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeDisabled();
      });

      // 5. Press the inner button of `review-price-change-confirm`.
      await test.step('Press the inner button of `review-price-change-confirm`.', async () => {
        await page.getByTestId('review-price-change-confirm').getByRole('button').click();

        await expect(page.getByTestId('review-page')).toHaveAttribute('data-status', 'ready');
        await expect(page.getByTestId('review-price-change')).toHaveCount(0);

        // The summary now carries the amount the control named.
        const summaryTotal = page.getByTestId('order-summary-total').getByTestId('price-amount');
        await expect(summaryTotal).toBeVisible();
        expect(digitsOf(await summaryTotal.textContent())).toBe(newTotalDigits);

        // The paid intent predates the change and no longer matches the order,
        // so the CTA stays disabled until a new payment succeeds.
        await expect(page.getByTestId('review-cta-explanation')).toHaveText(
          'A kártyás fizetés jóváhagyása szükséges a rendelés leadásához.',
        );
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeDisabled();
      });
    },
  );
});
