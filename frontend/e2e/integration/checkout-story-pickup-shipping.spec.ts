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
  // CI skips this spec (@ci-skip, BOLT-7): pickup ships free, asks for no address and claims no real location; it runs locally.
  test(
    '[E078] the pickup point ships free, asks for no delivery address and claims no real location',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      // The add confirmation is mounted twice — by the page's own status
      // message on the wide layout and by the rail's copy on the narrow one —
      // and the hidden mount carries the same text, so the assertion targets
      // whichever one the viewport shows.
      const addConfirmation = page.getByTestId('status-message').filter({ visible: true });

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
      const cashOnDeliveryOption = page
        .getByTestId('payment-option')
        .filter({ hasText: 'Utánvét' });
      const summaryDelivery = page.getByTestId('summary-row-delivery');
      const summaryFee = page.getByTestId('summary-row-fee');
      const pickupNotice = page.getByTestId('pickup-notice');
      const billingAddressForm = page.getByTestId('billing-address-form');
      const billingNameInput = page.getByTestId('billing-name-input');
      const reviewPage = page.getByTestId('review-page');
      const reviewSummary = page.getByTestId('review-summary');
      const orderReceipt = page.getByTestId('order-receipt');

      // 1. Reach the delivery step: open `/telefonok`, wait for `catalog-grid`,
      // open the first `product-card` without a `product-card-stock` marker
      // through its `product-card-cta`, add the variant with the inner button of
      // `add-to-cart-button` at 1024 px and wider or of the sticky rail's
      // `purchase-cta` at 390x844, open the cart with `cart-link`, press the
      // inner button of `cart-continue`, fill the contact step with
      // "Teszt Elek", "teszt@example.test" and "+36 30 123 4567", and press the
      // inner button of `contact-submit`.
      await test.step('1. Reach the delivery step: open `/telefonok`, wait for `catalog-grid`, open the first `product-card` without a `product-card-stock` marker through its `product-card-cta`, add the variant with the inner button of `add-to-cart-button` at 1024 px and wider or of the sticky rail\'s `purchase-cta` at 390x844, open the cart with `cart-link`, press the inner button of `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567", and press the inner button of `contact-submit`.', async () => {
        await page.goto('/telefonok');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();

        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();
        // A card renders its "Elfogyott" marker in `product-card-stock` only
        // when it is out of stock, so the first card without one is the first
        // buyable one.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();
        // The add is a request of its own; the confirmation reaching the cart is
        // what says it has landed before the cart is opened.
        await expect(addConfirmation).toContainText('1 darab a kosárban.');

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

        // The step deliberately preselects nothing: neither delivery radio nor
        // payment radio is checked, and the fee row shows its empty amount.
        await expect(homeDeliveryOption.getByTestId('delivery-radio')).not.toBeChecked();
        await expect(pickupOption.getByTestId('delivery-radio')).not.toBeChecked();
        await expect(cardPaymentOption.getByTestId('payment-radio')).not.toBeChecked();
        await expect(cashOnDeliveryOption.getByTestId('payment-radio')).not.toBeChecked();
        await expect(summaryFee).toContainText('Az ár nem áll rendelkezésre.');
      });

      // 2. Read the two `delivery-option` rows before choosing anything.
      await test.step('2. Read the two `delivery-option` rows before choosing anything.', async () => {
        await expect(page.getByTestId('delivery-option')).toHaveCount(2);
        await expect(homeDeliveryOption).toContainText('Házhoz szállítás');
        await expect(homeDeliveryOption).toContainText('Futárral, 1–2 munkanapon belül.');
        await expect(pickupOption).toContainText('Átvételi pont');
        await expect(pickupOption).toContainText('Csomagponton, 2–3 munkanapon belül.');

        // The mock charges 1490 Ft for home delivery and 990 Ft for pickup
        // below a 30 000 Ft subtotal, and this cart's 89 990 Ft is above it, so
        // both rows' own price block reads 0.
        await expect(homeDeliveryOption.getByTestId('price-amount')).toHaveText('0');
        await expect(pickupOption.getByTestId('price-amount')).toHaveText('0');
      });

      // 3. Choose "Átvételi pont" by its `delivery-radio`.
      await test.step('3. Choose "Átvételi pont" by its `delivery-radio`.', async () => {
        const pickupRadio = pickupOption.getByTestId('delivery-radio');
        await pickupRadio.click();
        await expect(pickupRadio).toBeChecked();

        await expect(summaryDelivery).toContainText('Átvételi pont');
        await expect(summaryFee.getByTestId('price-amount')).toHaveText('0');
        await expect(pickupOption.getByTestId('delivery-selected-badge')).toHaveText('Kiválasztva');

        // The screen claims no real location: the pickup notice is rendered
        // with its own sentence.
        await expect(pickupNotice).toBeVisible();
        await expect(pickupNotice).toContainText(
          'A virtuális átvétel egy demó szállítási opció: nincs valós üzletcím, a rendelés a pénztár demófolyamatán belül készül, valós átvételi pont nélkül.',
        );

        // No delivery address is asked for: the only address form on the step
        // is the billing one, so `address-input-postalCode` appears exactly once
        // and inside `billing-address-form`.
        await expect(page.getByTestId('address-input-postalCode')).toHaveCount(1);
        await expect(billingAddressForm.getByTestId('address-input-postalCode')).toHaveCount(1);
      });

      // 4. Fill the billing block pickup exposes: `billing-name-input` already
      // holds "Teszt Elek", prefilled from the contact step's full name, and the
      // "A számlázási cím megegyezik a szállítási címmel" tick is gone from the
      // step, because pickup has no delivery address to copy, so fill
      // `billing-address-form`'s own `address-input-postalCode`,
      // `address-input-city` and `address-input-line1` with "4024", "Debrecen"
      // and "Piac utca 10.", leaving its second line empty. Then choose
      // "Utánvét" by its `payment-radio` and press the inner button of
      // `delivery-confirm`.
      await test.step('4. Fill the billing block pickup exposes: `billing-name-input` already holds "Teszt Elek", prefilled from the contact step\'s full name, and the "A számlázási cím megegyezik a szállítási címmel" tick is gone from the step, because pickup has no delivery address to copy, so fill `billing-address-form`\'s own `address-input-postalCode`, `address-input-city` and `address-input-line1` with "4024", "Debrecen" and "Piac utca 10.", leaving its second line empty. Then choose "Utánvét" by its `payment-radio` and press the inner button of `delivery-confirm`.', async () => {
        await expect(billingNameInput).toHaveValue('Teszt Elek');
        await expect(page.getByTestId('billing-same-as-delivery')).toHaveCount(0);

        await billingAddressForm.getByTestId('address-input-postalCode').fill('4024');
        await billingAddressForm.getByTestId('address-input-city').fill('Debrecen');
        await billingAddressForm.getByTestId('address-input-line1').fill('Piac utca 10.');

        const cashOnDeliveryRadio = cashOnDeliveryOption.getByTestId('payment-radio');
        await cashOnDeliveryRadio.click();
        await expect(cashOnDeliveryRadio).toBeChecked();

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(reviewPage).toBeVisible();
      });

      // 5. Read the review page.
      await test.step('5. Read the review page.', async () => {
        await expect(page.getByTestId('review-delivery')).toContainText('Átvételi pont');
        // The pickup order shows no shipping address.
        await expect(page.getByTestId('review-delivery-address')).toHaveCount(0);

        const reviewBilling = page.getByTestId('review-billing');
        await expect(reviewBilling).toContainText('Teszt Elek');
        await expect(reviewBilling).toContainText('Piac utca 10.');
        await expect(reviewBilling).toContainText('4024 Debrecen');

        // The order summary the mock computes for this cart: the 89 990 Ft
        // device, the free pickup shipping, the 490 Ft cash-on-delivery fee and
        // their 90 480 Ft total.
        const subtotal = reviewSummary.getByTestId('order-summary-subtotal');
        await expect(subtotal).toContainText('Részösszeg');
        await expect(subtotal.getByTestId('price-amount')).toHaveText('89 990');
        const shipping = reviewSummary.getByTestId('order-summary-shipping');
        await expect(shipping).toContainText('Szállítási díj');
        await expect(shipping.getByTestId('price-amount')).toHaveText('0');
        const paymentFee = reviewSummary.getByTestId('order-summary-payment-fee');
        await expect(paymentFee).toContainText('Fizetési díj');
        await expect(paymentFee.getByTestId('price-amount')).toHaveText('490');
        const total = reviewSummary.getByTestId('order-summary-total');
        await expect(total).toContainText('Végösszeg');
        await expect(total.getByTestId('price-amount')).toHaveText('90 480');

        await expect(page.getByTestId('review-payment')).toHaveText('Utánvét');
        await expect(page.getByTestId('review-demo-badge')).toHaveText('Demó');
      });

      // 6. Tick `review-consent-terms-input` and press the inner button of
      // `review-submit` ("Demórendelés véglegesítése") once.
      await test.step('6. Tick `review-consent-terms-input` and press the inner button of `review-submit` ("Demórendelés véglegesítése") once.', async () => {
        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        const submitButton = page.getByTestId('review-submit').getByRole('button');
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

        // The submit navigates to the receipt of the order it just placed, with
        // the order id in the path.
        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        await expect(orderReceipt).toBeVisible();
      });

      // 7. Read the receipt: it carries the delivery and payment methods, the
      // order number, the line and the totals, and no billing row — the
      // receipt is privacy-minimized (the standard's row E102), so the name
      // and the billing address this scenario typed appear nowhere in it.
      await test.step('7. Read the receipt: it names the delivery and payment methods, the order number, its line and its totals, and holds none of the name and address this scenario typed.', async () => {
        // The order carries the free pickup shipping.
        await expect(page.getByTestId('receipt-row-delivery')).toContainText('Átvételi pont');
        await expect(
          page.getByTestId('receipt-row-shipping').getByTestId('price-amount'),
        ).toHaveText('0');
        await expect(page.getByTestId('receipt-row-payment')).toContainText('Utánvét');

        // The single line the order holds, and the totals the mock computed for
        // it: the 89 990 Ft device, the free pickup shipping, the 490 Ft
        // cash-on-delivery fee and their 90 480 Ft total.
        const receiptLine = page.getByTestId('receipt-line');
        await expect(receiptLine).toHaveCount(1);
        await expect(receiptLine).toContainText('1 db');
        await expect(receiptLine.getByTestId('price-amount')).toHaveText('89 990');
        await expect(
          page.getByTestId('receipt-row-subtotal').getByTestId('price-amount'),
        ).toHaveText('89 990');
        await expect(
          page.getByTestId('receipt-row-payment-fee').getByTestId('price-amount'),
        ).toHaveText('490');
        await expect(page.getByTestId('receipt-row-total').getByTestId('price-amount')).toHaveText(
          '90 480',
        );

        await expect(page.getByTestId('receipt-order-number')).not.toBeEmpty();
        await expect(page.getByTestId('receipt-demo-badge')).toHaveText('DEMO');
        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );

        // The rendered receipt shows no name, address or e-mail anywhere, so it
        // holds neither the name nor the street this scenario typed.
        await expect(orderReceipt).not.toContainText(/Teszt Elek|Piac utca 10\./);
      });
    },
  );
});
