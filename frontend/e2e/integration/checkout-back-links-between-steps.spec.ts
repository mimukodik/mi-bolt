// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: from the cart to the receipt', () => {
  test(
    "the review page's edit links go back to the step they belong to",
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

      const reviewPage = page.getByTestId('review-page');
      const reviewContact = page.getByTestId('review-contact');
      const reviewBilling = page.getByTestId('review-billing');
      const reviewDelivery = page.getByTestId('review-delivery');
      const reviewItems = page.getByTestId('review-items');
      const reviewSummary = page.getByTestId('review-summary');
      const reviewActions = page.getByTestId('review-actions');
      // Each card's header carries its own `Módosítás` control, and the
      // `data-testid` sits on the button itself rather than on a wrapper (the
      // `review-edit-contact`, `review-edit-billing` and `review-edit-delivery`
      // buttons in review-step.html).
      const editContact = page.getByTestId('review-edit-contact');
      const editBilling = page.getByTestId('review-edit-billing');
      const editDelivery = page.getByTestId('review-edit-delivery');
      const contactPage = page.getByTestId('contact-page');
      const contactFullName = page.getByTestId('contact-fullname-input');
      const contactEmail = page.getByTestId('contact-email-input');
      const deliveryStep = page.getByTestId('delivery-step');
      const confirmButton = page.getByTestId('delivery-confirm').getByRole('button');
      const addressPostalInput = page.getByTestId('address-input-postalCode');
      const addressCityInput = page.getByTestId('address-input-city');
      const addressLine1Input = page.getByTestId('address-input-line1');
      const billingNameInput = page.getByTestId('billing-name-input');
      const billingSameAsDelivery = page.getByTestId('billing-same-as-delivery');
      // Each option is a `li` with a test id (`delivery-option`,
      // `payment-option`) whose label wraps the radio, so the option is
      // addressed by the row the screen shows (the `delivery-option` rows in
      // delivery-step.html and the `payment-option` rows in
      // payment-method-selector.html).
      const homeDeliveryOption = page
        .getByTestId('delivery-option')
        .filter({ hasText: 'Házhoz szállítás' });
      const cashOnDeliveryOption = page
        .getByTestId('payment-option')
        .filter({ hasText: 'Utánvét' });
      // The banner host leaves the flow and its `navigation-reason` element is
      // rendered only while a reason sentence exists (the `navigation-reason`
      // template and the host display binding in navigation-reason-banner.ts),
      // so no reason means no element.
      const navigationReason = page.getByTestId('navigation-reason');

      // 1. Reach the review page: add the first in-stock product, press
      // `cart-continue`, complete the contact step, and on the delivery step
      // choose "Házhoz szállítás", fill the address and choose "Utánvét", then
      // press `delivery-confirm`.
      await test.step('Reach the review page: add the first in-stock product, press `cart-continue`, complete the contact step, and on the delivery step choose "Házhoz szállítás", fill the address and choose "Utánvét", then press `delivery-confirm`.', async () => {
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
        // The add is a request of its own; the header badge reaching 1 is what
        // says it has landed before the cart is opened.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

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
        await homeDeliveryOption.click();
        await addressPostalInput.fill('1052');
        await addressCityInput.fill('Budapest');
        await addressLine1Input.fill('Fő utca 1.');
        await cashOnDeliveryOption.click();
        await confirmButton.click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(reviewPage).toBeVisible();
        await expect(reviewContact).toBeVisible();
        await expect(reviewBilling).toBeVisible();
        await expect(reviewDelivery).toBeVisible();
        await expect(reviewItems).toBeVisible();
        await expect(reviewSummary).toBeVisible();
        await expect(reviewActions).toBeVisible();
        await expect(editContact).toBeVisible();
        await expect(editContact).toHaveText('Módosítás');
        await expect(editBilling).toBeVisible();
        await expect(editBilling).toHaveText('Módosítás');
        await expect(editDelivery).toBeVisible();
        await expect(editDelivery).toHaveText('Módosítás');
      });

      // 2. Press `review-edit-contact` ("Módosítás" in the Kapcsolattartási
      // adatok card).
      await test.step('Press `review-edit-contact` ("Módosítás" in the Kapcsolattartási adatok card).', async () => {
        await editContact.click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactPage).toBeVisible();
        // The form is prefilled from the saved draft, not from a blank model.
        await expect(contactFullName).toHaveValue('Teszt Elek');
        await expect(contactEmail).toHaveValue('teszt@example.test');
      });

      // 3. Press `contact-submit` to go forward again.
      await test.step('Press `contact-submit` to go forward again.', async () => {
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(deliveryStep).toBeVisible();
        await expect(homeDeliveryOption.getByTestId('delivery-selected-badge')).toHaveText(
          'Kiválasztva',
        );
        await expect(addressPostalInput).toHaveValue('1052');
        await expect(cashOnDeliveryOption.getByTestId('payment-radio')).toBeChecked();
        await expect(cashOnDeliveryOption.getByTestId('payment-selected-badge')).toHaveText(
          'Kiválasztva',
        );
        // The step was reached through the wizard, not by a deep link, so the
        // route carries no `navigationReason` and the banner renders nothing.
        await expect(navigationReason).toHaveCount(0);
      });

      // 4. Press `delivery-confirm` to return to the review page, then press
      // `review-edit-billing` ("Módosítás" in the Számlázási adatok card).
      await test.step('Press `delivery-confirm` to return to the review page, then press `review-edit-billing` ("Módosítás" in the Számlázási adatok card).', async () => {
        await confirmButton.click();
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(reviewPage).toBeVisible();

        await editBilling.click();

        // Billing is entered on the delivery step, so its edit control asks for
        // that step rather than one of its own (ReviewStep.onEditBilling()).
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(deliveryStep).toBeVisible();
        await expect(billingNameInput).toHaveValue('Teszt Elek');
        // The saved billing address equals the delivery address field by field,
        // so the "same as delivery" tick is restored from it
        // (DeliveryPage.buildInitialModel()) and the invoice's address is the
        // one the shared address inputs hold.
        await expect(billingSameAsDelivery).toBeChecked();
        await expect(addressPostalInput).toHaveValue('1052');
        await expect(addressCityInput).toHaveValue('Budapest');
        await expect(addressLine1Input).toHaveValue('Fő utca 1.');
      });

      // 5. Go forward again with `delivery-confirm` and then press
      // `review-edit-delivery` ("Módosítás" in the Szállítási és fizetési mód
      // card).
      await test.step('Go forward again with `delivery-confirm` and then press `review-edit-delivery` ("Módosítás" in the Szállítási és fizetési mód card).', async () => {
        await confirmButton.click();
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(reviewPage).toBeVisible();

        await editDelivery.click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(deliveryStep).toBeVisible();
        await expect(homeDeliveryOption.getByTestId('delivery-selected-badge')).toHaveText(
          'Kiválasztva',
        );
        await expect(addressPostalInput).toHaveValue('1052');
        await expect(cashOnDeliveryOption.getByTestId('payment-radio')).toBeChecked();
        await expect(cashOnDeliveryOption.getByTestId('payment-selected-badge')).toHaveText(
          'Kiválasztva',
        );
      });

      // 6. Press the checkout header's `back-to-shop` link ("Vissza a shopba").
      await test.step('Press the checkout header\'s `back-to-shop` link ("Vissza a shopba").', async () => {
        await page.getByTestId('back-to-shop').click();

        await expect(page).toHaveURL(/\/telefonok$/);
        await expect(page.getByTestId('product-card').first()).toBeVisible();
        // The shop layout replaces the checkout layout, so the step indicator
        // the checkout chrome renders is gone from the page.
        await expect(page.getByTestId('checkout-steps')).toHaveCount(0);
      });
    },
  );
});
