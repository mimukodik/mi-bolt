// spec: specs/checkout-story-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page mounts its add control differently at the two integration
// widths: at 1024 px and wider the desktop CTA block carries
// `add-to-cart-button`, and below that width the block is `display: none` (the
// `.cta-desktop` rule in the product page stylesheet) while the fixed
// `purchase-rail` carries the same "Kosárba teszem" press through its
// `purchase-cta` (mobile-buy-rail.html), the only mount with a size at that
// width. Both mounts stay in the DOM either way, so the viewport decides which
// one the test drives.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: standard stories', () => {
  test(
    '[E081] changing home delivery to pickup keeps the total and invalidates the started card payment',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      const deliveryStep = page.getByTestId('delivery-step');
      // Each option row is addressed by the copy it carries rather than by
      // position: the delivery step renders one `delivery-option` per shipping
      // mode and one `payment-option` per payment method.
      const homeDeliveryOption = page
        .getByTestId('delivery-option')
        .filter({ hasText: 'Házhoz szállítás' });
      const pickupOption = page.getByTestId('delivery-option').filter({ hasText: 'Átvételi pont' });
      const cardPaymentOption = page
        .getByTestId('payment-option')
        .filter({ hasText: 'Bankkártya' });
      // The delivery step renders the delivery address form in an
      // `address-form` element and the billing one in a `billing-address-form`
      // host whose own root carries `address-form` again, so each field is read
      // inside its own container.
      const deliveryAddressForm = page.getByTestId('address-form');
      const billingAddressForm = page.getByTestId('billing-address-form');
      const reviewPage = page.getByTestId('review-page');
      const reviewDelivery = page.getByTestId('review-delivery');
      const reviewPayment = page.getByTestId('review-payment');
      const reviewPaymentStatus = page.getByTestId('review-payment-status');
      const reviewSubmitButton = page.getByTestId('review-submit').getByRole('button');

      // The order summary's four rows, read on the first review page, after the
      // return from the payment application and once pickup is chosen.
      const reviewSummary = page.getByTestId('review-summary');
      const subtotal = reviewSummary.getByTestId('order-summary-subtotal');
      const shipping = reviewSummary.getByTestId('order-summary-shipping');
      const paymentFee = reviewSummary.getByTestId('order-summary-payment-fee');
      const total = reviewSummary.getByTestId('order-summary-total');

      // The demo payment application sends the shopper back with a full page
      // load, and the intent it opened on is the last path segment of
      // `/demo-fizetes/<paymentIntentId>`; the return URL names it as its
      // `paymentIntentId` query parameter.
      const paymentIntentIdFromUrl = (): string =>
        new URL(page.url()).pathname.split('/').pop() ?? '';
      let paymentIntentId = '';

      // 1. Reach the delivery step with a cart: open `/telefonok`, wait for
      // `catalog-grid`, open the first `product-card` without a
      // `product-card-stock` marker through its `product-card-cta`, add the
      // variant with the inner button of `add-to-cart-button` at 1024 px and
      // wider or of the sticky rail's `purchase-cta` at 390x844, open the cart
      // with `cart-link`, press the inner button of `cart-continue`, fill the
      // contact step with "Teszt Elek", "teszt@example.test" and
      // "+36 30 123 4567", and press the inner button of `contact-submit`.
      await test.step('1. Reach the delivery step with a cart: open `/telefonok`, wait for `catalog-grid`, open the first `product-card` without a `product-card-stock` marker through its `product-card-cta`, add the variant with the inner button of `add-to-cart-button` at 1024 px and wider or of the sticky rail\'s `purchase-cta` at 390x844, open the cart with `cart-link`, press the inner button of `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567", and press the inner button of `contact-submit`.', async () => {
        await page.goto('/telefonok');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();

        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();
        // A card renders its "Elfogyott" marker in `product-card-stock` only
        // when it is out of stock, so the first card without one is the first
        // buyable one; the product is never named.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();
        // The header badge carries the cart's total and moves only once the add
        // has landed, so reaching 1 is the press's own confirmation.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(page.getByTestId('contact-page')).toBeVisible();
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await expect(page.getByTestId('contact-submit').getByRole('button')).toBeEnabled();
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(deliveryStep).toBeVisible();
        await expect(deliveryStep.getByRole('heading', { level: 1 })).toHaveText(
          'Átvétel és fizetés',
        );
      });

      // 2. Choose "Házhoz szállítás" by its `delivery-radio`, fill "1052" into
      // `address-input-postalCode`, "Budapest" into `address-input-city` and
      // "Fő utca 1." into `address-input-line1` inside `address-form`, keep the
      // "A számlázási cím megegyezik a szállítási címmel" tick, choose
      // "Bankkártya" by its `payment-radio`, then press the inner button of
      // `delivery-confirm`.
      await test.step('2. Choose "Házhoz szállítás" by its `delivery-radio`, fill "1052" into `address-input-postalCode`, "Budapest" into `address-input-city` and "Fő utca 1." into `address-input-line1` inside `address-form`, keep the "A számlázási cím megegyezik a szállítási címmel" tick, choose "Bankkártya" by its `payment-radio`, then press the inner button of `delivery-confirm`.', async () => {
        const homeDeliveryRadio = homeDeliveryOption.getByTestId('delivery-radio');
        await homeDeliveryRadio.click();
        await expect(homeDeliveryRadio).toBeChecked();

        // The delivery address form appears with the home-delivery choice and,
        // while the billing "same as delivery" tick is on, it is the only
        // `address-form` on the step, so each field is read inside it.
        await expect(deliveryAddressForm).toHaveCount(1);
        await deliveryAddressForm.getByTestId('address-input-postalCode').fill('1052');
        await deliveryAddressForm.getByTestId('address-input-city').fill('Budapest');
        await deliveryAddressForm.getByTestId('address-input-line1').fill('Fő utca 1.');
        await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();

        const cardPaymentRadio = cardPaymentOption.getByTestId('payment-radio');
        await cardPaymentRadio.click();
        await expect(cardPaymentRadio).toBeChecked();

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(reviewPage).toBeVisible();

        await expect(reviewDelivery).toContainText('Házhoz szállítás');
        const reviewDeliveryAddress = page.getByTestId('review-delivery-address');
        await expect(reviewDeliveryAddress).toContainText('Fő utca 1.');
        await expect(reviewDeliveryAddress).toContainText('1052 Budapest');
        await expect(reviewPayment).toHaveText('Bankkártya');

        // The order summary the mock computes for this cart: the 89 990 Ft
        // device, the free home-delivery shipping above the 30 000 Ft
        // threshold, no card fee, and their unchanged 89 990 Ft total. This is
        // the total noted before the delivery mode changes.
        await expect(subtotal).toContainText('Részösszeg');
        await expect(subtotal.getByTestId('price-amount')).toHaveText('89 990');
        await expect(shipping).toContainText('Szállítási díj');
        await expect(shipping.getByTestId('price-amount')).toHaveText('0');
        await expect(paymentFee).toContainText('Fizetési díj');
        await expect(paymentFee.getByTestId('price-amount')).toHaveText('0');
        await expect(total).toContainText('Végösszeg');
        await expect(total.getByTestId('price-amount')).toHaveText('89 990');

        // A card order is never placed without an approved payment, so the
        // start-payment control is offered and the confirmation stays disabled.
        await expect(reviewPaymentStatus).toHaveText('A kártyás fizetéshez indítsd el a fizetést.');
        await expect(page.getByTestId('review-payment-new').getByRole('button')).toHaveText(
          'Fizetés indítása',
        );
        await expect(reviewSubmitButton).toBeDisabled();
      });

      // 3. Press the inner button of `review-payment-new`.
      await test.step('3. Press the inner button of `review-payment-new`.', async () => {
        await page.getByTestId('review-payment-new').getByRole('button').click();

        // The shop is left for the demo payment application, with the intent id
        // as a path segment; it is read off that URL for the return below.
        await expect(page).toHaveURL(/\/demo-fizetes\/[^/]+$/);
        paymentIntentId = paymentIntentIdFromUrl();
        expect(paymentIntentId).not.toBe('');

        await expect(page.getByTestId('pay-amount')).toContainText('89 990 Ft');
        await expect(page.getByTestId('pay-ref')).toContainText(paymentIntentId);
      });

      // 4. Return to the shop without choosing an outcome, through the return
      // URL the payment application carries: open
      // `/penztar?paymentIntentId=<the intent id>`.
      await test.step('4. Return to the shop without choosing an outcome, through the return URL the payment application carries: open `/penztar?paymentIntentId=<the intent id>`.', async () => {
        await page.goto(`/penztar?paymentIntentId=${paymentIntentId}`);

        // The cold-start page navigates on to the review step.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(reviewPage).toBeVisible();

        await expect(reviewPaymentStatus).toHaveText('A fizetés nem fejeződött be.');
        await expect(page.getByTestId('review-payment-back').getByRole('button')).toHaveText(
          'Vissza a fizetéshez',
        );

        // The started-but-unfinished payment leaves the total where it was.
        await expect(total.getByTestId('price-amount')).toHaveText('89 990');
      });

      // 5. Press `review-edit-delivery`, the "Módosítás" control in the
      // "Szállítási és fizetési mód" card.
      await test.step('5. Press `review-edit-delivery`, the "Módosítás" control in the "Szállítási és fizetési mód" card.', async () => {
        await page.getByTestId('review-edit-delivery').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(deliveryStep).toBeVisible();

        // The saved draft is restored: the home-delivery choice, its address
        // and the card payment method.
        await expect(homeDeliveryOption.getByTestId('delivery-radio')).toBeChecked();
        await expect(deliveryAddressForm.getByTestId('address-input-postalCode')).toHaveValue(
          '1052',
        );
        await expect(deliveryAddressForm.getByTestId('address-input-city')).toHaveValue('Budapest');
        await expect(deliveryAddressForm.getByTestId('address-input-line1')).toHaveValue(
          'Fő utca 1.',
        );
        await expect(cardPaymentOption.getByTestId('payment-radio')).toBeChecked();
      });

      // 6. Choose "Átvételi pont" by its `delivery-radio`.
      await test.step('6. Choose "Átvételi pont" by its `delivery-radio`.', async () => {
        const pickupRadio = pickupOption.getByTestId('delivery-radio');
        await pickupRadio.click();
        await expect(pickupRadio).toBeChecked();

        await expect(page.getByTestId('summary-row-delivery')).toContainText('Átvételi pont');
        await expect(page.getByTestId('summary-row-fee').getByTestId('price-amount')).toHaveText(
          '0',
        );

        // The screen claims no real location.
        await expect(page.getByTestId('pickup-notice')).toContainText(
          'A virtuális átvétel egy demó szállítási opció: nincs valós üzletcím, a rendelés a pénztár demófolyamatán belül készül, valós átvételi pont nélkül.',
        );

        // No delivery address is asked for: the only address form on the step
        // is the billing one, so `address-input-postalCode` appears exactly once
        // and inside `billing-address-form`, carrying the address the
        // home-delivery draft had.
        await expect(page.getByTestId('address-input-postalCode')).toHaveCount(1);
        await expect(billingAddressForm.getByTestId('address-input-postalCode')).toHaveCount(1);

        // Pickup has no delivery address to copy, so the "same as delivery"
        // tick is gone and the billing block stands on its own.
        await expect(page.getByTestId('billing-same-as-delivery')).toHaveCount(0);
        await expect(billingAddressForm).toBeVisible();
        await expect(billingAddressForm.getByTestId('address-input-postalCode')).toHaveValue(
          '1052',
        );
        await expect(billingAddressForm.getByTestId('address-input-city')).toHaveValue('Budapest');
        await expect(billingAddressForm.getByTestId('address-input-line1')).toHaveValue(
          'Fő utca 1.',
        );
        // The billing name field is not part of `billing-address-form`: that
        // host holds only the billing address inputs, while the name is a
        // sibling field in the billing block, so `billing-name-input` is read
        // on its own rather than inside the address form.
        await expect(page.getByTestId('billing-name-input')).toHaveValue('Teszt Elek');
      });

      // 7. Press the inner button of `delivery-confirm` ("Tovább az
      // ellenőrzéshez").
      await test.step('7. Press the inner button of `delivery-confirm` ("Tovább az ellenőrzéshez").', async () => {
        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(reviewPage).toBeVisible();

        // The pickup order shows no shipping address.
        await expect(reviewDelivery).toContainText('Átvételi pont');
        await expect(page.getByTestId('review-delivery-address')).toHaveCount(0);

        // The total is unchanged: at the demo's 30 000 Ft free-shipping
        // threshold both delivery options cost 0 Ft, so the recomputed total is
        // the same Végösszeg noted before the change.
        await expect(subtotal.getByTestId('price-amount')).toHaveText('89 990');
        await expect(shipping.getByTestId('price-amount')).toHaveText('0');
        await expect(paymentFee.getByTestId('price-amount')).toHaveText('0');
        await expect(total.getByTestId('price-amount')).toHaveText('89 990');
      });

      // 8. Read the payment area of the review page.
      await test.step('8. Read the payment area of the review page.', async () => {
        // BOLT-5 binds the intent to the accepted checkout draft: changing
        // delivery invalidates it even when the total is unchanged.
        await expect(reviewPayment).toHaveText('Bankkártya');
        await expect(reviewPaymentStatus).toHaveText(
          'A korábbi kártyás fizetés már nem érvényes, mert közben megváltozott a rendelés. Indíts új fizetést.',
        );
        await expect(page.getByTestId('review-payment-back')).toHaveCount(0);
        await expect(page.getByTestId('review-payment-new').getByRole('button')).toHaveText(
          'Új fizetés indítása',
        );

        // No price change is announced, and a card order is still never placed
        // without an approved payment.
        await expect(page.getByTestId('review-price-change')).toHaveCount(0);
        await expect(reviewPage).toHaveAttribute('data-status', 'ready');
        await expect(reviewSubmitButton).toBeDisabled();
      });
    },
  );
});
