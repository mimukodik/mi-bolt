// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: from the cart to the receipt', () => {
  // CI skips this spec (@ci-skip, BOLT-7): a cash-on-delivery purchase reaches the receipt; it runs locally.
  test(
    'cash on delivery purchase reaches the receipt',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      // The purchase control and its confirmation are laid out differently at
      // the two integration viewports: below 1024px the desktop CTA column is
      // `display: none` (product-page.scss) and the sticky `purchase-rail`
      // carries the same press through its `purchase-cta`, with the
      // confirmation shown in the rail's own status. At 1024px and above the
      // desktop `add-to-cart-button` and the status inside its `cta-desktop`
      // column are the visible mounts. Both mounts stay in the DOM at either
      // width, so the viewport decides which one the test drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      const confirmationMessage = narrowViewport
        ? page.getByTestId('purchase-rail').locator('app-status-message')
        : page.locator('.cta-desktop').locator('app-status-message');

      // Read off the screens, never pinned: the confirmation, the review line
      // and the receipt all have to name this product's own variant.
      let productName = '';
      let colourName = '';
      let storageLabel = '';
      let devicePriceText = '';

      // 1. Open `/telefonok`, wait for the grid, and pick the first card that
      // has no `product-card-stock` marker and whose `price-amount` is at most
      // 300 000 Ft (the mock's cash-on-delivery ceiling). Click its
      // `product-card-cta`.
      await test.step("Open `/telefonok`, wait for the grid, and pick the first card that has no `product-card-stock` marker and whose `price-amount` is at most 300 000 Ft (the mock's cash-on-delivery ceiling). Click its `product-card-cta`.", async () => {
        await page.goto('/telefonok');
        await expect(page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' })).toBeVisible();

        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();
        // The grid renders a "Katalógus betöltése" status while it is empty;
        // waiting for the first card means the loop below reads real prices.
        const cardCount = await cards.count();
        // The mock rejects cash on delivery once the cart exceeds this ceiling
        // (CASH_ON_DELIVERY_MAX_CART_HUF), so the card price has to stay under it.
        const cashOnDeliveryCeiling = 300_000;
        let pickedIndex = -1;
        for (let i = 0; i < cardCount; i++) {
          const card = cards.nth(i);
          // An in-stock card carries no `product-card-stock` marker; an
          // out-of-stock one shows the "Elfogyott" label there.
          if ((await card.getByTestId('product-card-stock').count()) > 0) continue;
          const priceText = (await card.getByTestId('price-amount').textContent()) ?? '';
          // The price-block groups whole HUF with a U+00A0 separator, so
          // stripping every non-digit yields the integer value.
          const priceNumber = Number(priceText.replace(/\D/g, ''));
          if (Number.isFinite(priceNumber) && priceNumber <= cashOnDeliveryCeiling) {
            pickedIndex = i;
            break;
          }
        }
        expect(pickedIndex).toBeGreaterThanOrEqual(0);

        await cards.nth(pickedIndex).getByTestId('product-card-cta').click();
        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');

        // The "Készülékár" block is the one price block inside the product's
        // own `Árak` region; the related cards outside it carry the different
        // "Egyszeri készülékár" label.
        const devicePriceAmount = page
          .getByRole('region', { name: 'Árak', exact: true })
          .getByTestId('price-amount');
        await expect(devicePriceAmount).toBeVisible();
        devicePriceText = ((await devicePriceAmount.textContent()) ?? '').trim();
        expect(Number(devicePriceText.replace(/\D/g, ''))).toBeLessThanOrEqual(
          cashOnDeliveryCeiling,
        );
      });

      // 2. Add the variant with `add-to-cart-button` and open the cart with
      // `cart-link`.
      await test.step('Add the variant with `add-to-cart-button` and open the cart with `cart-link`.', async () => {
        productName = ((await page.getByTestId('product-name').textContent()) ?? '').trim();
        expect(productName).not.toBe('');
        // The selected variant's colour and storage are read from the screen so
        // the confirmation is checked against what it actually shows.
        const colourGroup = page.getByTestId('variant-color-group');
        if (await colourGroup.isVisible().catch(() => false)) {
          colourName = (
            (await colourGroup.locator('button[aria-pressed="true"]').first().textContent()) ?? ''
          ).trim();
        }
        const storageGroup = page.getByTestId('variant-storage-group');
        if (await storageGroup.isVisible().catch(() => false)) {
          storageLabel = (
            (await storageGroup.locator('button[aria-pressed="true"]').first().textContent()) ?? ''
          ).trim();
        }

        await addToCartButton.click();
        await expect(confirmationMessage).toContainText('1 darab a kosárban.');
        await expect(confirmationMessage).toContainText(productName);
        if (colourName !== '') await expect(confirmationMessage).toContainText(colourName);
        if (storageLabel !== '') await expect(confirmationMessage).toContainText(storageLabel);

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);
        await expect(page.getByTestId('cart-continue').getByRole('button')).toBeEnabled();
      });

      // 3. Press `cart-continue` ("Tovább az adatokhoz"), then fill the contact
      // step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and
      // press `contact-submit`.
      await test.step('Press `cart-continue` ("Tovább az adatokhoz"), then fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`.', async () => {
        await page.getByTestId('cart-continue').getByRole('button').click();
        await expect(page.getByTestId('contact-page')).toBeVisible();

        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await expect(page.getByTestId('contact-submit').getByRole('button')).toBeEnabled();
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();
      });

      // 4. On the delivery step choose "Házhoz szállítás", fill "1052" /
      // "Budapest" / "Fő utca 1.", keep the billing "same as delivery" tick,
      // and choose the "Utánvét" payment option.
      await test.step('On the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", keep the billing "same as delivery" tick, and choose the "Utánvét" payment option.', async () => {
        const homeDeliveryOption = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' });
        await homeDeliveryOption.click();
        await expect(homeDeliveryOption.getByTestId('delivery-selected-badge')).toHaveText(
          'Kiválasztva',
        );

        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Fő utca 1.');
        await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();

        const cashOnDeliveryOption = page
          .getByTestId('payment-option')
          .filter({ hasText: 'Utánvét' });
        // Under the 300 000 Ft ceiling the mock keeps cash on delivery
        // available, so the radio is enabled and carries no refusal reason.
        await expect(cashOnDeliveryOption.getByTestId('payment-radio')).toBeEnabled();
        await cashOnDeliveryOption.click();
        await expect(cashOnDeliveryOption.getByTestId('payment-selected-badge')).toHaveText(
          'Kiválasztva',
        );
        await expect(page.getByTestId('payment-unavailable-reason')).toHaveCount(0);

        await expect(page.getByTestId('summary-row-delivery')).toContainText('Házhoz szállítás');
        await expect(page.getByTestId('summary-row-fee')).toContainText('Szállítási díj');
        await expect(page.getByTestId('summary-row-fee')).toContainText('Ft');
        await expect(page.getByTestId('summary-row-payment')).toContainText('Utánvét');
      });

      // 5. Press `delivery-confirm` and read the review page.
      await test.step('Press `delivery-confirm` and read the review page.', async () => {
        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();

        const reviewContact = page.getByTestId('review-contact');
        await expect(reviewContact).toContainText('Teszt Elek');
        await expect(reviewContact).toContainText('teszt@example.test');
        // The schema normalises the Hungarian national prefix to +36 before
        // saving, so the groups are matched with an optional separator.
        await expect(reviewContact).toContainText(/\+36\s?30\s?123\s?4567/);

        const reviewBilling = page.getByTestId('review-billing');
        await expect(reviewBilling).toContainText('Teszt Elek');
        const reviewBillingAddress = reviewBilling.getByTestId('review-billing-address');
        await expect(reviewBillingAddress).toContainText('Fő utca 1.');
        await expect(reviewBillingAddress).toContainText('1052 Budapest');

        const reviewDelivery = page.getByTestId('review-delivery');
        await expect(reviewDelivery).toContainText('Házhoz szállítás');
        await expect(reviewDelivery).toContainText('Fő utca 1.');
        await expect(reviewDelivery).toContainText('1052 Budapest');
        await expect(page.getByTestId('review-payment')).toHaveText('Utánvét');

        await expect(page.getByTestId('review-line')).toHaveCount(1);
        await expect(page.getByTestId('review-line-quantity')).toContainText(
          `1 × ${devicePriceText} Ft`,
        );

        await expect(page.getByTestId('order-summary-subtotal')).toContainText('Részösszeg');
        await expect(page.getByTestId('order-summary-shipping')).toContainText('Szállítási díj');
        await expect(page.getByTestId('order-summary-payment-fee')).toContainText('Fizetési díj');
        await expect(page.getByTestId('order-summary-total')).toContainText('Végösszeg');
        await expect(page.getByTestId('review-demo-badge')).toHaveText('Demó');
      });

      // 6. Tick `review-consent-terms-input` ("Elfogadom a demó rendelési
      // feltételeit.") and press the inner button of `review-submit`
      // ("Demórendelés véglegesítése").
      await test.step('Tick `review-consent-terms-input` ("Elfogadom a demó rendelési feltételeit.") and press the inner button of `review-submit` ("Demórendelés véglegesítése").', async () => {
        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        const submitButton = page.getByTestId('review-submit').getByRole('button');
        await expect(submitButton).toBeEnabled();

        // A full-document form submit would fire the page's load event; the
        // route change must go through the router instead, so the listener
        // stays silent across the submit.
        let documentReloaded = false;
        page.on('load', () => {
          documentReloaded = true;
        });
        await submitButton.click();

        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        expect(documentReloaded).toBe(false);
      });

      // 7. Read the receipt.
      await test.step('Read the receipt.', async () => {
        await expect(page.getByTestId('success-page')).toBeVisible();
        await expect(page.getByTestId('order-receipt')).toBeVisible();
        await expect(page.getByTestId('success-heading')).toHaveText('Elkészült a demórendelésed.');
        await expect(page.getByTestId('success-check')).toBeVisible();

        await expect(page.getByTestId('receipt-order-number')).not.toBeEmpty();
        await expect(page.getByTestId('receipt-demo-badge')).toHaveText('DEMO');
        await expect(page.getByTestId('receipt-row-payment')).toContainText('Utánvét');
        await expect(page.getByTestId('receipt-row-delivery')).toContainText('Házhoz szállítás');

        const receiptLines = page.getByTestId('receipt-lines');
        await expect(receiptLines.getByTestId('receipt-line')).toHaveCount(1);
        await expect(receiptLines).toContainText(productName);
        if (colourName !== '') await expect(receiptLines).toContainText(colourName);
        if (storageLabel !== '') await expect(receiptLines).toContainText(storageLabel);
        await expect(receiptLines).toContainText('1 db');

        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );
        await expect(page.getByTestId('success-actions')).toContainText('Vissza a telefonokhoz');
      });
    },
  );
});
