// spec: specs/checkout-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: edge paths', () => {
  test(
    "the delivery step's separate billing address and optional second address line",
    { tag: '@integration' },
    async ({ page }) => {
      // The product page mounts the add-to-cart control twice: the desktop CTA
      // column is hidden below 1024px and the sticky `purchase-rail` carries the
      // same press there, so the viewport decides which one the test drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      // The step's own title, read from its level-1 heading.
      const stepHeading = page.getByTestId('delivery-step').getByRole('heading', { level: 1 });

      // The delivery address and the billing address are two `app-address-form`
      // instances carrying the same inner test ids, so each field is read inside
      // its own form. The billing instance is the one wrapped in
      // `billing-address-form`; the delivery instance is the other one.
      const deliveryForm = page
        .locator('app-address-form:not([data-testid="billing-address-form"])')
        .getByTestId('address-form');
      const billingForm = page.getByTestId('billing-address-form');

      // 1. Reach the delivery step: open `/telefonok`, open the first card
      // without a `product-card-stock` marker, add it with `add-to-cart-button`,
      // open the cart with `cart-link`, press `cart-continue`, fill the contact
      // step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and
      // submit it.
      await test.step('Reach the delivery step: open `/telefonok`, open the first card without a `product-card-stock` marker, add it with `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and submit it.', async () => {
        await page.goto('/telefonok');
        const cards = page.getByTestId('product-card');
        // The grid renders a loading status while it is empty, so waiting for
        // the first card means the pick below reads real cards.
        await expect(cards.first()).toBeVisible();
        // The product is never named: the first card that carries no "Elfogyott"
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

        await expect(page.getByTestId('contact-page')).toBeVisible();
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();
        await expect(stepHeading).toHaveText('Átvétel és fizetés');

        // A fresh step starts with no choice: the options render, and neither
        // group carries a checked radio.
        await expect(page.getByTestId('delivery-radio').first()).toBeVisible();
        await expect(page.getByTestId('payment-radio').first()).toBeVisible();
        await expect(
          page.locator(
            '[data-testid="delivery-radio"]:checked, [data-testid="payment-radio"]:checked',
          ),
        ).toHaveCount(0);
      });

      // 2. Choose "Házhoz szállítás" by its `delivery-radio` and fill the
      // delivery address: "1052" into `address-input-postalCode`, "Budapest"
      // into `address-input-city`, "Fő utca 1." into `address-input-line1` and
      // the optional second line "2. emelet 5. ajtó" into `address-input-line2`.
      await test.step('Choose "Házhoz szállítás" by its `delivery-radio` and fill the delivery address: "1052" into `address-input-postalCode`, "Budapest" into `address-input-city`, "Fő utca 1." into `address-input-line1` and the optional second line "2. emelet 5. ajtó" into `address-input-line2`.', async () => {
        const homeDelivery = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' });
        await homeDelivery.getByTestId('delivery-radio').check();

        await expect(homeDelivery.getByTestId('delivery-selected-badge')).toHaveText('Kiválasztva');
        await expect(page.getByTestId('summary-row-delivery')).toContainText('Házhoz szállítás');

        await deliveryForm.getByTestId('address-input-postalCode').fill('1052');
        await deliveryForm.getByTestId('address-input-city').fill('Budapest');
        await deliveryForm.getByTestId('address-input-line1').fill('Fő utca 1.');
        await deliveryForm.getByTestId('address-input-line2').fill('2. emelet 5. ajtó');

        // "A számlázási cím megegyezik a szállítási címmel" is still ticked, so
        // the billing block shows no address form of its own.
        await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();
        await expect(page.getByTestId('address-form')).toHaveCount(1);
      });

      // 3. Untick `billing-same-as-delivery` ("A számlázási cím megegyezik a
      // szállítási címmel").
      await test.step('Untick `billing-same-as-delivery` ("A számlázási cím megegyezik a szállítási címmel").', async () => {
        await page.getByTestId('billing-same-as-delivery').uncheck();

        // The second form is empty; only the name arrives prefilled from the
        // contact step.
        await expect(billingForm).toBeVisible();
        await expect(billingForm.getByTestId('address-input-postalCode')).toHaveValue('');
        await expect(billingForm.getByTestId('address-input-city')).toHaveValue('');
        await expect(billingForm.getByTestId('address-input-line1')).toHaveValue('');
        await expect(billingForm.getByTestId('address-input-line2')).toHaveValue('');
        await expect(page.getByTestId('billing-name-input')).toHaveValue('Teszt Elek');

        // Unchecking the box adds the billing form beside the delivery one; the
        // delivery fields keep every value they already hold.
        await expect(page.getByTestId('address-form')).toHaveCount(2);
        await expect(deliveryForm.getByTestId('address-input-postalCode')).toHaveValue('1052');
        await expect(deliveryForm.getByTestId('address-input-city')).toHaveValue('Budapest');
        await expect(deliveryForm.getByTestId('address-input-line1')).toHaveValue('Fő utca 1.');
        await expect(deliveryForm.getByTestId('address-input-line2')).toHaveValue(
          '2. emelet 5. ajtó',
        );
      });

      // 4. Choose "Utánvét" by its `payment-radio` and press the inner button of
      // `delivery-confirm` ("Tovább az ellenőrzéshez") with the billing address
      // still empty.
      await test.step('Choose "Utánvét" by its `payment-radio` and press the inner button of `delivery-confirm` ("Tovább az ellenőrzéshez") with the billing address still empty.', async () => {
        const cashOnDelivery = page.getByTestId('payment-option').filter({ hasText: 'Utánvét' });
        await cashOnDelivery.getByTestId('payment-radio').check();

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        // The empty billing address holds the step back: the URL stays and the
        // step renders its messages instead of advancing.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();

        // Each message sits under the billing field it belongs to.
        await expect(
          billingForm.getByTestId('address-field-postalCode').getByTestId('form-field-message'),
        ).toHaveText('Az irányítószám megadása kötelező.');
        await expect(
          billingForm.getByTestId('address-field-city').getByTestId('form-field-message'),
        ).toHaveText('A város megadása kötelező.');
        await expect(
          billingForm.getByTestId('address-field-line1').getByTestId('form-field-message'),
        ).toHaveText('A cím megadása kötelező.');

        // The delivery address is filled, so none of its fields reports anything.
        for (const field of ['postalCode', 'city', 'line1', 'line2']) {
          await expect(
            deliveryForm.getByTestId(`address-field-${field}`).getByTestId('form-field-message'),
          ).toBeHidden();
        }
      });

      // 5. Fill the billing address: "4024" into the billing postal code,
      // "Debrecen" into its city and "Piac utca 10." into its first line,
      // leaving its second line empty; choose "Utánvét" if it is not already
      // selected, then press the inner button of `delivery-confirm`.
      await test.step('Fill the billing address: "4024" into the billing postal code, "Debrecen" into its city and "Piac utca 10." into its first line, leaving its second line empty; choose "Utánvét" if it is not already selected, then press the inner button of `delivery-confirm`.', async () => {
        await billingForm.getByTestId('address-input-postalCode').fill('4024');
        await billingForm.getByTestId('address-input-city').fill('Debrecen');
        await billingForm.getByTestId('address-input-line1').fill('Piac utca 10.');

        // The optional second line stays empty on the billing address.
        await expect(billingForm.getByTestId('address-input-line2')).toHaveValue('');

        // "Utánvét" survived the refused attempt; `check()` leaves a radio that
        // is already chosen as it is.
        const cashOnDelivery = page.getByTestId('payment-option').filter({ hasText: 'Utánvét' });
        await cashOnDelivery.getByTestId('payment-radio').check();
        await expect(cashOnDelivery.getByTestId('payment-selected-badge')).toHaveText(
          'Kiválasztva',
        );
        await expect(page.getByTestId('summary-row-payment')).toContainText('Utánvét');

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
      });

      // 6. Read the two address blocks on the review page.
      await test.step('Read the two address blocks on the review page.', async () => {
        // The delivery block prints the first line, the optional second line and
        // the postal code + city line, so the second line travels with it.
        await expect(page.getByTestId('review-delivery-address').locator('dd')).toHaveText(
          'Fő utca 1. 2. emelet 5. ajtó 1052 Budapest',
        );

        // The billing block prints its own two lines and does not inherit the
        // delivery address's second line.
        await expect(page.getByTestId('review-billing-address')).toHaveText(
          'Piac utca 10. 4024 Debrecen',
        );
        await expect(page.getByTestId('review-billing-address')).not.toContainText(
          '2. emelet 5. ajtó',
        );
      });
    },
  );
});
