// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: from the cart to the receipt', () => {
  test(
    'the delivery form reports its validation errors',
    { tag: '@integration' },
    async ({ page }) => {
      // The purchase control is laid out differently at the two integration
      // viewports: below 1024px the desktop CTA column is `display: none` (the
      // `.cta-desktop` rule in the product page stylesheet) and the sticky
      // `purchase-rail` carries the same "Kosárba teszem" press as its
      // `purchase-cta` (mobile-buy-rail.scss). Both mounts stay in the DOM at
      // either width, so the viewport decides which one the test drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      const cartBadge = page.getByTestId('cart-badge');
      const deliveryStep = page.getByTestId('delivery-step');
      const confirmButton = page.getByTestId('delivery-confirm').getByRole('button');
      const addressForm = page.getByTestId('address-form');
      const addressPostalInput = page.getByTestId('address-input-postalCode');
      const addressCityInput = page.getByTestId('address-input-city');
      const addressLine1Input = page.getByTestId('address-input-line1');
      const addressLine2Input = page.getByTestId('address-input-line2');
      const billingNameInput = page.getByTestId('billing-name-input');
      const billingSameAsDelivery = page.getByTestId('billing-same-as-delivery');
      // The two option-level and the per-field messages are addressed by the
      // id each `app-form-field-message` writes (form-field-message.ts): one
      // message element per field, `hidden` and empty until it has an error.
      const deliveryOptionMessage = page.locator('#delivery-option-message');
      const paymentMethodMessage = page.locator('#payment-method-message');
      const postalMessage = page.locator('#delivery-address-postalCode-message');
      const cityMessage = page.locator('#delivery-address-city-message');
      const line1Message = page.locator('#delivery-address-line1-message');
      const billingNameMessage = page.locator('#billing-name-message');
      // Each option is a `li` with a test id (`delivery-option`,
      // `payment-option`) whose label wraps the radio, so the option is chosen
      // by the row the screen shows.
      const homeDeliveryOption = page
        .getByTestId('delivery-option')
        .filter({ hasText: 'Házhoz szállítás' });
      const cashOnDeliveryOption = page
        .getByTestId('payment-option')
        .filter({ hasText: 'Utánvét' });

      // 1. Reach `/penztar/szallitas` with a cart line and a saved contact
      // section: add the first in-stock product from the catalogue, go to the
      // cart with `cart-link`, press `cart-continue`, and fill and submit the
      // contact step with "Teszt Elek", "teszt@example.test" and
      // "+36 30 123 4567".
      await test.step('Reach `/penztar/szallitas` with a cart line and a saved contact section: add the first in-stock product from the catalogue, go to the cart with `cart-link`, press `cart-continue`, and fill and submit the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567".', async () => {
        await page.goto('/telefonok');
        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();
        // The product is never named: the first card without the "Elfogyott"
        // marker is the one the screen offers as buyable.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await addToCartButton.click();
        await expect(cartBadge).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(deliveryStep).toBeVisible();
        await expect(
          deliveryStep.getByRole('heading', { level: 1, name: 'Átvétel és fizetés' }),
        ).toBeVisible();

        // No option carries a default: nothing is checked before the user
        // picks, so no paid addon is preselected.
        await expect(page.locator('[data-testid="delivery-radio"]:checked')).toHaveCount(0);
        await expect(page.locator('[data-testid="payment-radio"]:checked')).toHaveCount(0);
      });

      // 2. Press the inner button of `delivery-confirm` ("Tovább az
      // ellenőrzéshez") without choosing anything.
      await test.step('Press the inner button of `delivery-confirm` ("Tovább az ellenőrzéshez") without choosing anything.', async () => {
        await expect(confirmButton).toBeEnabled();
        await confirmButton.click();

        await expect(deliveryOptionMessage).toBeVisible();
        await expect(deliveryOptionMessage).toHaveText('Válassz szállítási módot.');
        await expect(paymentMethodMessage).toBeVisible();
        await expect(paymentMethodMessage).toHaveText('Válassz fizetési módot.');
        // The button is never disabled for an incomplete form; it reports the
        // errors on press and the step stays put.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
      });

      // 3. Choose the "Házhoz szállítás" option by its `delivery-radio`.
      await test.step('Choose the "Házhoz szállítás" option by its `delivery-radio`.', async () => {
        await homeDeliveryOption.click();

        await expect(homeDeliveryOption.getByTestId('delivery-selected-badge')).toBeVisible();
        await expect(homeDeliveryOption.getByTestId('delivery-selected-badge')).toHaveText(
          'Kiválasztva',
        );
        // The delivery choice clears its own message.
        await expect(deliveryOptionMessage).toBeHidden();

        await expect(addressForm).toBeVisible();
        await expect(addressPostalInput).toBeVisible();
        await expect(addressCityInput).toBeVisible();
        await expect(addressLine1Input).toBeVisible();
        await expect(addressLine2Input).toBeVisible();
        await expect(page.getByTestId('address-field-country')).toContainText('Magyarország');

        await expect(page.getByTestId('summary-row-fee')).toContainText('Szállítási díj');
      });

      // 4. Press `delivery-confirm` again with the address still empty.
      await test.step('Press `delivery-confirm` again with the address still empty.', async () => {
        await confirmButton.click();

        await expect(postalMessage).toBeVisible();
        await expect(postalMessage).toHaveText('Az irányítószám megadása kötelező.');
        await expect(cityMessage).toBeVisible();
        await expect(cityMessage).toHaveText('A város megadása kötelező.');
        await expect(line1Message).toBeVisible();
        await expect(line1Message).toHaveText('A cím megadása kötelező.');
        // The billing name is prefilled from the contact step's full name, so
        // its "A számlázási név megadása kötelező." message stays hidden.
        await expect(billingNameMessage).toBeHidden();
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
      });

      // 5. Type "0123" into `address-input-postalCode` and "B" into
      // `address-input-city`.
      await test.step('Type "0123" into `address-input-postalCode` and "B" into `address-input-city`.', async () => {
        await addressPostalInput.fill('0123');
        await addressCityInput.fill('B');

        await expect(postalMessage).toHaveText(
          'Az irányítószám formátuma 4 számjegy, 1-es vagy 9-es kezdettel.',
        );
        await expect(cityMessage).toHaveText('A város 2–80 karakter hosszú lehet.');
      });

      // 6. Complete the step: postal code "1052", city "Budapest", address line
      // "Fő utca 1." (the second line stays empty), keep the "A számlázási cím
      // megegyezik a szállítási címmel" tick, choose "Utánvét" by its
      // `payment-radio`, then press `delivery-confirm`.
      await test.step('Complete the step: postal code "1052", city "Budapest", address line "Fő utca 1." (the second line stays empty), keep the "A számlázási cím megegyezik a szállítási címmel" tick, choose "Utánvét" by its `payment-radio`, then press `delivery-confirm`.', async () => {
        await addressPostalInput.fill('1052');
        await addressCityInput.fill('Budapest');
        await addressLine1Input.fill('Fő utca 1.');
        await expect(addressLine2Input).toHaveValue('');
        await expect(billingSameAsDelivery).toBeChecked();
        // The billing name is prefilled from the contact full name.
        await expect(billingNameInput).toHaveValue('Teszt Elek');

        await cashOnDeliveryOption.click();
        await expect(cashOnDeliveryOption.getByTestId('payment-selected-badge')).toBeVisible();
        await expect(cashOnDeliveryOption.getByTestId('payment-selected-badge')).toHaveText(
          'Kiválasztva',
        );
        await expect(page.getByTestId('summary-row-payment')).toContainText('Utánvét');

        await expect(billingNameMessage).toBeHidden();
        await confirmButton.click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
      });
    },
  );
});
