// spec: specs/checkout-retry-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page mounts its add control differently at the two integration
// widths: at 1024 px and wider the desktop CTA block carries
// `add-to-cart-button`, and below that width the block is `display: none` (the
// `.cta-desktop` rule in the product page stylesheet) while the fixed
// `purchase-rail` carries the same "Kosárba teszem" press through its
// `purchase-cta`. The test drives the press through the mount the viewport
// shows.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: retry after one failure', () => {
  test(
    '[E080] the delivery step invents no choice or price while the options fail and recovers on the retry',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      // The success banner is not inside `add-to-cart` on the wide layout:
      // that component shows only the pending copy ("A termék hozzáadása a
      // kosárhoz…") or a cart error, and the product page renders the success
      // message itself as a sibling inside the `cta-desktop` column. Both
      // mounts stay in the DOM at either width, and only the one the viewport
      // shows is visible, so the assertion reads the visible `status-message`
      // rather than the pending one.
      const addConfirmation = page.getByTestId('status-message').filter({ visible: true });

      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const cartBadge = page.getByTestId('cart-badge');
      const cartPage = page.getByTestId('cart-page');
      const contactPage = page.getByTestId('contact-page');
      const contactSubmit = page.getByTestId('contact-submit').getByRole('button');
      const errorState = page.getByTestId('error-state');
      const errorTitle = errorState.getByRole('heading', { level: 2 });
      const retryButton = errorState.getByRole('button');
      const deliveryStep = page.getByTestId('delivery-step');
      const deliveryOptions = page.getByTestId('delivery-option');
      const paymentOptions = page.getByTestId('payment-option');
      const summaryFee = page.getByTestId('summary-row-fee');
      // Each option row is addressed by the copy it carries rather than by
      // position: the delivery step renders one `delivery-option` per shipping
      // mode and one `payment-option` per payment method.
      const homeDeliveryOption = deliveryOptions.filter({ hasText: 'Házhoz szállítás' });
      const pickupOption = deliveryOptions.filter({ hasText: 'Átvételi pont' });
      const cardOption = paymentOptions.filter({ hasText: 'Bankkártya' });
      const cashOnDeliveryOption = paymentOptions.filter({ hasText: 'Utánvét' });

      // 1. Open `/telefonok?mi-scenario=fail-once-checkout-options` and wait for
      // `catalog-grid`.
      await test.step('1. Open `/telefonok?mi-scenario=fail-once-checkout-options` and wait for `catalog-grid`.', async () => {
        // The mock reads the scenario when this document loads and holds it for
        // the browsing context, so the options read fails once and the step's
        // own retry is what recovers.
        await page.goto('/telefonok?mi-scenario=fail-once-checkout-options');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();

        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);
        // A fresh browsing context starts on the mock's empty cart under this
        // scenario too, so the header badge is the facade's zero baseline.
        await expect(cartBadge).toHaveText('0');
      });

      // 2. Open the first `product-card` that carries no `product-card-stock`
      // marker through its `product-card-cta`, then add the shown variant: press
      // the inner button of `add-to-cart-button` at 1024 px and wider, and of
      // the sticky rail's `purchase-cta` below 1024 px, where the side panel is
      // hidden.
      await test.step("2. Open the first `product-card` that carries no `product-card-stock` marker through its `product-card-cta`, then add the shown variant: press the inner button of `add-to-cart-button` at 1024 px and wider, and of the sticky rail's `purchase-cta` below 1024 px, where the side panel is hidden.", async () => {
        // Picking by what the screen shows: a card renders its "Elfogyott"
        // marker only when out of stock, so the first card without one is
        // buyable. The product is never named.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();

        // The scenario breaks the checkout options read, not the cart add, so
        // the addition itself still succeeds.
        await expect(addConfirmation).toContainText('1 darab a kosárban.');
        await expect(cartBadge).toHaveText('1');
      });

      // 3. Open the cart with the header's `cart-link`, press the inner button
      // of `cart-continue` ("Tovább az adatokhoz"), fill the contact step with
      // "Teszt Elek", "teszt@example.test" and "+36 30 123 4567", and press the
      // inner button of `contact-submit` ("Tovább a szállításhoz").
      await test.step('3. Open the cart with the header\'s `cart-link`, press the inner button of `cart-continue` ("Tovább az adatokhoz"), fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567", and press the inner button of `contact-submit` ("Tovább a szállításhoz").', async () => {
        await page.getByTestId('cart-link').click();
        await expect(cartPage).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactPage).toBeVisible();

        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await expect(contactSubmit).toBeEnabled();
        await contactSubmit.click();

        // The endpoint this scenario breaks is the options read, not the step
        // save, so the contact section is written and the wizard advances to
        // the delivery step on its own.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
      });

      // 4. Read what the delivery step shows while the options read fails.
      await test.step('4. Read what the delivery step shows while the options read fails.', async () => {
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);

        // The failed read did not reach the step: no choice is offered at all.
        await expect(deliveryStep).toHaveCount(0);

        await expect(errorState).toBeVisible();
        await expect(errorTitle).toHaveText('Az opciók nem érhetők el');
        await expect(errorState).toContainText(
          'A szállítási és fizetési opciók betöltése sikertelen.',
        );
        await expect(retryButton).toHaveCount(1);
        await expect(retryButton).toHaveText('Újrapróbálom');

        // No choice is fabricated: with no options the step renders no radio
        // group and no address form.
        await expect(page.getByTestId('delivery-option')).toHaveCount(0);
        await expect(page.getByTestId('delivery-radio')).toHaveCount(0);
        await expect(page.getByTestId('payment-option')).toHaveCount(0);
        await expect(page.getByTestId('payment-radio')).toHaveCount(0);
        await expect(page.getByTestId('address-form')).toHaveCount(0);

        // No price is invented, a zero included: the step shows no shipping
        // cost anywhere.
        await expect(page.getByTestId('price-amount')).toHaveCount(0);
        await expect(page.getByTestId('price-empty')).toHaveCount(0);
        await expect(page.getByTestId('summary-row-fee')).toHaveCount(0);
        await expect(page.getByTestId('delivery-summary')).toHaveCount(0);

        // The options read has finished and failed rather than still being in
        // flight: the loading skeleton is not on screen (the current app drops
        // it once its fade-out finishes, so it is either gone or faded out).
        await expect(page.getByTestId('delivery-loading')).toBeHidden();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
      });

      // 5. Press "Újrapróbálom" — the `error-state` control, the only control
      // the step offers while the options fail.
      await test.step('5. Press "Újrapróbálom" — the `error-state` control, the only control the step offers while the options fail.', async () => {
        await retryButton.click();

        // The "once" fault fired on the first attempt of this document, so the
        // retry goes through and the step renders its options.
        await expect(errorState).toHaveCount(0);
        await expect(deliveryStep).toBeVisible();
        await expect(deliveryStep.getByRole('heading', { level: 1 })).toHaveText(
          'Átvétel és fizetés',
        );

        // The list holds exactly the two delivery modes and the two payment
        // methods, each with its own price.
        await expect(deliveryOptions).toHaveCount(2);
        await expect(paymentOptions).toHaveCount(2);

        await expect(homeDeliveryOption.getByTestId('price-amount')).toHaveText('0');
        await expect(homeDeliveryOption).toContainText('Futárral, 1–2 munkanapon belül.');
        await expect(pickupOption.getByTestId('price-amount')).toHaveText('0');
        await expect(pickupOption).toContainText('Csomagponton, 2–3 munkanapon belül.');
        await expect(cardOption.getByTestId('price-amount')).toHaveText('0');
        await expect(cardOption).toContainText('Online kártyás fizetés.');
        await expect(cashOnDeliveryOption.getByTestId('price-amount')).toHaveText('490');
        await expect(cashOnDeliveryOption).toContainText('Készpénzzel vagy kártyával a futárnál.');

        // The recovered amounts are the server's own per-option prices rather
        // than a blanket zero: both delivery options cost 0 Ft because this
        // cart's 89 990 Ft subtotal is at or above the mock's free-shipping
        // threshold (`FREE_SHIPPING_THRESHOLD_HUF`), while the two payment
        // methods differ (`PAYMENT_METHODS`).
        await expect(page.locator('[data-testid="delivery-radio"]:checked')).toHaveCount(0);
        await expect(page.locator('[data-testid="payment-radio"]:checked')).toHaveCount(0);
        await expect(page.getByTestId('summary-row-delivery')).toContainText('Nincs kiválasztva');
        await expect(page.getByTestId('summary-row-payment')).toContainText('Nincs kiválasztva');
        await expect(summaryFee.getByTestId('price-empty')).toHaveText('—');
        await expect(summaryFee).toContainText('Az ár nem áll rendelkezésre.');
      });
    },
  );
});
