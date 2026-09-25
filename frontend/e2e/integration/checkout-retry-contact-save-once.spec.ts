// spec: specs/checkout-retry-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page mounts its add control differently at the two integration
// widths: at 1024 px and wider the desktop CTA block carries
// `add-to-cart-button`, and below that width the block is `display: none` (the
// `.cta-desktop` rule in the product page stylesheet) while the fixed
// `purchase-rail` carries the same "Kosárba teszem" press through its
// `purchase-cta`. The success confirmation splits the same way: the wide one
// is the product page's own `status-message`, a sibling of `app-add-to-cart`
// inside the `cta-desktop` column, while the narrow one is the rail's. The
// test drives the press through the mount the viewport shows and reads
// whichever confirmation is visible.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: retry after one failure', () => {
  test(
    '[E068] the contact step saves on the second try and keeps what was typed',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      // The success banner is not inside `add-to-cart` on the wide layout:
      // that component shows only the pending copy ("A termék hozzáadása a
      // kosárhoz…") or a cart error, and the page renders the success message
      // itself. Both mounts stay in the DOM at either width, and only the one
      // the viewport shows is visible, so the assertion reads the visible
      // `status-message` rather than the pending one.
      const addConfirmation = page.getByTestId('status-message').filter({ visible: true });

      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const cartBadge = page.getByTestId('cart-badge');
      const contactPage = page.getByTestId('contact-page');
      const fullNameInput = page.getByTestId('contact-fullname-input');
      const emailInput = page.getByTestId('contact-email-input');
      const phoneInput = page.getByTestId('contact-phone-input');
      const contactSubmit = page.getByTestId('contact-submit').getByRole('button');
      const saveError = page.getByTestId('contact-save-error');
      const deliveryStep = page.getByTestId('delivery-step');
      const deliveryAddressForm = page.getByTestId('address-form');
      // Each option row is addressed by the copy it carries rather than by
      // position: the delivery step renders one `delivery-option` per shipping
      // mode and one `payment-option` per payment method.
      const homeDeliveryOption = page
        .getByTestId('delivery-option')
        .filter({ hasText: 'Házhoz szállítás' });
      const cashOnDeliveryOption = page
        .getByTestId('payment-option')
        .filter({ hasText: 'Utánvét' });
      const reviewContact = page.getByTestId('review-contact');
      const reviewDelivery = page.getByTestId('review-delivery');
      const reviewPayment = page.getByTestId('review-payment');

      // 1. Open `/telefonok?mi-scenario=fail-once-checkout-update` and wait for
      // `catalog-grid`.
      await test.step('1. Open `/telefonok?mi-scenario=fail-once-checkout-update` and wait for `catalog-grid`.', async () => {
        // The mock reads the scenario when this document loads and holds it for
        // the browsing context, so the fault rides the first load alone.
        await page.goto('/telefonok?mi-scenario=fail-once-checkout-update');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();

        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);
        // A fresh browsing context starts on the mock's empty cart under this
        // scenario too, so the header badge is the facade's zero baseline.
        await expect(cartBadge).toHaveText('0');
      });

      // 2. Open the first `product-card` that carries no `product-card-stock`
      // marker through its `product-card-cta`, then add the shown variant: at
      // 1024 px and wider press the inner button of `add-to-cart-button`
      // ("Kosárba teszem"); below 1024 px the side panel is hidden and the
      // sticky rail's `purchase-cta` is the mount with a size, so press the
      // inner button of `purchase-cta` ("Kosárba teszem") there.
      await test.step('2. Open the first `product-card` that carries no `product-card-stock` marker through its `product-card-cta`, then add the shown variant: at 1024 px and wider press the inner button of `add-to-cart-button` ("Kosárba teszem"); below 1024 px the side panel is hidden and the sticky rail\'s `purchase-cta` is the mount with a size, so press the inner button of `purchase-cta` ("Kosárba teszem") there.', async () => {
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

        // The scenario breaks the checkout section write, not the cart add, so
        // the addition itself still succeeds.
        await expect(addConfirmation).toContainText('1 darab a kosárban.');
        await expect(cartBadge).toHaveText('1');
      });

      // 3. Open the cart with the header's `cart-link` and press the inner
      // button of `cart-continue` ("Tovább az adatokhoz").
      await test.step('3. Open the cart with the header\'s `cart-link` and press the inner button of `cart-continue` ("Tovább az adatokhoz").', async () => {
        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactPage).toBeVisible();
        await expect(
          contactPage.getByRole('heading', { level: 1, name: 'Kapcsolattartási adatok' }),
        ).toBeVisible();
      });

      // 4. Type "Teszt Elek" into `contact-fullname-input`,
      // "teszt@example.test" into `contact-email-input` and
      // "+36 30 123 4567" into `contact-phone-input`, then press the inner
      // button of `contact-submit` ("Tovább a szállításhoz").
      await test.step('4. Type "Teszt Elek" into `contact-fullname-input`, "teszt@example.test" into `contact-email-input` and "+36 30 123 4567" into `contact-phone-input`, then press the inner button of `contact-submit` ("Tovább a szállításhoz").', async () => {
        await fullNameInput.fill('Teszt Elek');
        await emailInput.fill('teszt@example.test');
        await phoneInput.fill('+36 30 123 4567');
        await expect(contactSubmit).toBeEnabled();
        await contactSubmit.click();

        // The section write (`checkout-update`) is the endpoint this scenario
        // breaks, so the save is refused, the wizard stays on the contact step
        // and `delivery-step` is never rendered.
        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(saveError).toBeVisible();
        await expect(saveError).toContainText('A mentés sikertelen. Próbáld újra.');
        await expect(page.getByTestId('delivery-step')).toHaveCount(0);

        // The refusal notice offers no control of its own: the retry this step
        // offers is the same `contact-submit` button pressed again.
        await expect(saveError.getByRole('button', { name: 'Bezárás' })).toHaveCount(0);
        await expect(saveError.getByRole('button', { name: 'Újrapróbálom' })).toHaveCount(0);

        // Nothing was lost: the values the shopper typed stay on screen.
        await expect(fullNameInput).toHaveValue('Teszt Elek');
        await expect(emailInput).toHaveValue('teszt@example.test');
        await expect(phoneInput).toHaveValue('+36 30 123 4567');

        // Each field's wrapper (the `<label class="field">` the input sits in)
        // carries the server-error state, and the submit is usable again.
        await expect(fullNameInput.locator('..')).toHaveAttribute('data-state', 'server-error');
        await expect(emailInput.locator('..')).toHaveAttribute('data-state', 'server-error');
        await expect(phoneInput.locator('..')).toHaveAttribute('data-state', 'server-error');
        await expect(contactSubmit).toHaveText('Tovább a szállításhoz');
        await expect(contactSubmit).toBeEnabled();
      });

      // 5. Press the inner button of `contact-submit` a second time, changing
      // nothing.
      await test.step('5. Press the inner button of `contact-submit` a second time, changing nothing.', async () => {
        await contactSubmit.click();

        // The "once" fault fired on the first attempt of this document, so the
        // retry goes through and the wizard advances.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(deliveryStep).toBeVisible();
        await expect(deliveryStep.getByRole('heading', { level: 1 })).toHaveText(
          'Átvétel és fizetés',
        );

        await expect(saveError).toHaveCount(0);
        await expect(page.getByTestId('delivery-options')).toBeVisible();
        await expect(page.getByTestId('payment-selector')).toBeVisible();
        await expect(page.getByTestId('delivery-summary')).toBeVisible();

        // The step preselects nothing: neither shipping nor payment is chosen.
        await expect(page.locator('[data-testid="delivery-radio"]:checked')).toHaveCount(0);
        await expect(page.locator('[data-testid="payment-radio"]:checked')).toHaveCount(0);
      });

      // 6. Read what carries the typed values, since the delivery step shows no
      // contact summary of its own: it renders no contact input and no contact
      // summary element, so complete the step to reach the page that does.
      // Choose "Házhoz szállítás" by its `delivery-radio`, fill "1052" into
      // `address-input-postalCode`, "Budapest" into `address-input-city` and
      // "Fő utca 1." into `address-input-line1` inside `address-form`, keep the
      // "A számlázási cím megegyezik a szállítási címmel" tick, choose "Utánvét"
      // by its `payment-radio` and press the inner button of `delivery-confirm`
      // ("Tovább az ellenőrzéshez").
      await test.step('6. Read what carries the typed values, since the delivery step shows no contact summary of its own: it renders no contact input and no contact summary element, so complete the step to reach the page that does. Choose "Házhoz szállítás" by its `delivery-radio`, fill "1052" into `address-input-postalCode`, "Budapest" into `address-input-city` and "Fő utca 1." into `address-input-line1` inside `address-form`, keep the "A számlázási cím megegyezik a szállítási címmel" tick, choose "Utánvét" by its `payment-radio` and press the inner button of `delivery-confirm` ("Tovább az ellenőrzéshez").', async () => {
        const homeDeliveryRadio = homeDeliveryOption.getByTestId('delivery-radio');
        await homeDeliveryRadio.click();
        await expect(homeDeliveryRadio).toBeChecked();

        // The delivery address form appears with the home-delivery choice and,
        // while the billing "same as delivery" tick is on, it is the only
        // `address-form` on the step.
        await expect(deliveryAddressForm).toHaveCount(1);
        await deliveryAddressForm.getByTestId('address-input-postalCode').fill('1052');
        await deliveryAddressForm.getByTestId('address-input-city').fill('Budapest');
        await deliveryAddressForm.getByTestId('address-input-line1').fill('Fő utca 1.');
        await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();

        const cashOnDeliveryRadio = cashOnDeliveryOption.getByTestId('payment-radio');
        await cashOnDeliveryRadio.click();
        await expect(cashOnDeliveryRadio).toBeChecked();

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();

        // The contact summary is the review page's "Kapcsolattartási adatok"
        // card, whose rows read the draft the second attempt saved. Each row is
        // a `<dt>`/`<dd>` pair, and the label and the value sit adjacent in the
        // element's text with no separator between them, so the values are
        // asserted on their own rather than with their labels in front.
        await expect(reviewContact).toContainText('Teszt Elek');
        await expect(reviewContact).toContainText('teszt@example.test');
        // The step normalises the typed "+36 30 123 4567" to this value.
        await expect(reviewContact).toContainText('+36301234567');

        await expect(reviewDelivery).toContainText('Házhoz szállítás');
        await expect(reviewPayment).toHaveText('Utánvét');
      });
    },
  );
});
