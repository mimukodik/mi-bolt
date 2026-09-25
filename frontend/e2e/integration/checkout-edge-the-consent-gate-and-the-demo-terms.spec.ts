// spec: specs/checkout-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: edge paths', () => {
  test(
    'the consent gate and the demo terms dialog on the review page',
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

      // 1. Reach the review page with a cash-on-delivery draft: open
      // `/telefonok`, open the first card without a `product-card-stock`
      // marker, add it with `add-to-cart-button`, open the cart with
      // `cart-link`, press `cart-continue`, fill the contact step with "Teszt
      // Elek", "teszt@example.test" and "+36 30 123 4567" and submit it, then
      // choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.",
      // keep the billing "A számlázási cím megegyezik a szállítási címmel"
      // tick, choose "Utánvét" and press `delivery-confirm`.
      await test.step('Reach the review page with a cash-on-delivery draft: open `/telefonok`, open the first card without a `product-card-stock` marker, add it with `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and submit it, then choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", keep the billing "A számlázási cím megegyezik a szállítási címmel" tick, choose "Utánvét" and press `delivery-confirm`.', async () => {
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

        const deliveryAddress = page.getByTestId('address-form');
        await deliveryAddress.getByTestId('address-input-postalCode').fill('1052');
        await deliveryAddress.getByTestId('address-input-city').fill('Budapest');
        await deliveryAddress.getByTestId('address-input-line1').fill('Fő utca 1.');

        // "A számlázási cím megegyezik a szállítási címmel" is on by default and
        // is left as it is, so the billing address follows the delivery one.
        await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();

        const cashOnDelivery = page.getByTestId('payment-option').filter({ hasText: 'Utánvét' });
        await cashOnDelivery.click();
        await expect(cashOnDelivery.getByTestId('payment-selected-badge')).toHaveText(
          'Kiválasztva',
        );

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-payment')).toHaveText('Utánvét');
        // Cash on delivery starts no payment, so the payment status block has
        // nothing to show.
        await expect(page.getByTestId('review-payment-status')).toHaveCount(0);
        // The consent gate explains itself while the CTA stays pressable: the
        // refusal only lands on the press.
        await expect(page.getByTestId('review-cta-explanation')).toHaveText(
          'A demó feltételek elfogadása szükséges a leadáshoz.',
        );
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeEnabled();
      });

      // 2. Press the inner button of `review-submit` without ticking the terms.
      await test.step('Press the inner button of `review-submit` without ticking the terms.', async () => {
        await page.getByTestId('review-submit').getByRole('button').click();

        // The gate refuses the submit: the wizard stays on the review step and
        // no order is placed.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);

        await expect(page.getByTestId('review-consent-terms')).toHaveAttribute(
          'data-state',
          'submitted-invalid',
        );
        await expect(page.getByTestId('review-consent-terms-message')).toHaveText(
          'A demó feltételek elfogadása kötelező.',
        );

        const consentInput = page.getByTestId('review-consent-terms-input');
        await expect(consentInput).toHaveAttribute('aria-invalid', 'true');
        await expect(consentInput).not.toBeChecked();
      });

      // 3. Open the demo terms from the consent card: press
      // `review-consent-terms-button` ("demó rendelési feltételeit").
      await test.step('Open the demo terms from the consent card: press `review-consent-terms-button` ("demó rendelési feltételeit").', async () => {
        await page.getByTestId('review-consent-terms-button').click();

        const termsDialog = page.getByRole('dialog', { name: 'Demó pénztár — feltételek' });
        await expect(termsDialog).toBeVisible();
        await expect(
          termsDialog.getByRole('heading', { name: 'Demó pénztár — feltételek' }),
        ).toBeVisible();

        // The body opens with the demo-flow sentence and closes with the
        // version line; each spans a line break in the template, so the
        // assertions allow any whitespace between its parts.
        const termsBody = page.getByTestId('terms-body');
        await expect(termsBody).toContainText(
          /Ez a pénztár demó folyamat: a leadott rendelés nem valós, nem küldünk sem\s+e-mailt, sem csomagot, és a fizetés sem valós pénzmozgás\./,
        );
        await expect(termsBody).toContainText(/A demó feltételek verziója:\s*demo-1/);

        // Opening the terms is not accepting them.
        await expect(page.getByTestId('review-consent-terms-input')).not.toBeChecked();
      });

      // 4. Close the dialog with its `dialog-close` button ("Bezárás").
      await test.step('Close the dialog with its `dialog-close` button ("Bezárás").', async () => {
        await page.getByTestId('dialog-close').click();

        await expect(page.getByRole('dialog')).toHaveCount(0);
        // Closing the terms neither accepts them nor clears the refusal the
        // earlier submit left on the consent card.
        await expect(page.getByTestId('review-consent-terms-input')).not.toBeChecked();
        await expect(page.getByTestId('review-consent-terms-message')).toHaveText(
          'A demó feltételek elfogadása kötelező.',
        );
      });

      // 5. Tick `review-consent-terms-input` and read the CTA area again.
      await test.step('Tick `review-consent-terms-input` and read the CTA area again.', async () => {
        await page.getByTestId('review-consent-terms-input').check();

        await expect(page.getByTestId('review-consent-terms')).toHaveAttribute(
          'data-state',
          'default',
        );
        await expect(page.getByTestId('review-consent-terms-message')).toHaveCount(0);
        // The acceptance clears the gate's explanation; the CTA stays enabled
        // because a cash-on-delivery draft owes no payment.
        await expect(page.getByTestId('review-cta-explanation')).toHaveCount(0);
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeEnabled();
      });
    },
  );
});
