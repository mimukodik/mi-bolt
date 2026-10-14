// spec: specs/checkout-fault-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The add control is laid out differently at the two integration viewports:
// below 1024px the desktop CTA block is `display: none` (the `.cta-desktop`
// rule in the product page stylesheet) and the sticky `purchase-rail` carries
// the same "Kosárba teszem" press through its `purchase-cta`. Both mounts stay
// in the DOM at either width, so the viewport decides which one the test drives.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: service faults', () => {
  // CI skips this spec (@ci-skip, BOLT-7): a 503 on the order submission keeps the whole draft on screen; it runs locally.
  test(
    'the order submission is refused with a 503 and the whole draft stays on screen',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      // The add confirmation is mounted twice — by the page's own status
      // message on the wide layout and by the rail's copy on the narrow one —
      // and the hidden mount carries the same text, so the assertion targets
      // whichever one the viewport shows.
      const addConfirmation = page.getByTestId('status-message').filter({ visible: true });
      const cartBadge = page.getByTestId('cart-badge');

      // The product is never named: the scenario picks its card by what the
      // screen shows, and the confirmation is checked against what it reads.
      let productName = '';
      let variantLabel = '';

      // 1. Open `/telefonok?mi-scenario=fail-order` and wait for the grid.
      await test.step('Open `/telefonok?mi-scenario=fail-order` and wait for the grid.', async () => {
        await page.goto('/telefonok?mi-scenario=fail-order');
        await expect(page.getByTestId('result-count')).toHaveText(
          '55 találat a szűrt feltételek szerint',
        );
        await expect(page.getByTestId('product-card').first()).toBeVisible();
        // The mock keys its snapshot by the scenario name and this scenario's
        // cart was never filled, so a fresh context holds none.
        await expect(cartBadge).toHaveText('0');
      });

      // 2. Open the first `product-card` that has no `product-card-stock`
      // marker through its `product-card-cta`, then press the inner button of
      // `add-to-cart-button` ("Kosárba teszem").
      await test.step('Open the first `product-card` that has no `product-card-stock` marker through its `product-card-cta`, then press the inner button of `add-to-cart-button` ("Kosárba teszem").', async () => {
        const inStockCard = page
          .getByTestId('product-card')
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');

        // The name, colour and storage are read off the opened page so the
        // confirmation can be checked without naming a product or a slug.
        productName = ((await page.getByTestId('product-name').textContent()) ?? '').trim();
        const colourGroup = page.getByTestId('variant-color-group');
        const storageGroup = page.getByTestId('variant-storage-group');
        const colourText = (await colourGroup.locator('legend strong').textContent()) ?? '';
        const storageText = (await storageGroup.locator('legend strong').textContent()) ?? '';
        variantLabel = `${colourText.trim()}, ${storageText.trim()}`;

        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();
        // The scenario breaks only the order submission, so the addition still
        // succeeds and still confirms.
        await expect(addConfirmation).toContainText(
          `${productName}, ${variantLabel} – 1 darab a kosárban.`,
        );
        await expect(cartBadge).toHaveText('1');
      });

      // 3. Open the cart with the header's `cart-link`, then press
      // `cart-continue` ("Tovább az adatokhoz").
      await test.step('Open the cart with the header\'s `cart-link`, then press `cart-continue` ("Tovább az adatokhoz").', async () => {
        await page.getByTestId('cart-link').click();

        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);

        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        const contactHeading = page.getByTestId('contact-page').getByRole('heading', { level: 1 });
        await expect(contactHeading).toHaveText('Kapcsolattartási adatok');
      });

      // 4. Fill the contact step with "Teszt Elek", "teszt@example.test" and
      // "+36 30 123 4567" and press the inner button of `contact-submit`
      // ("Tovább a szállításhoz").
      await test.step('Fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press the inner button of `contact-submit` ("Tovább a szállításhoz").', async () => {
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await expect(page.getByTestId('contact-submit').getByRole('button')).toBeEnabled();
        await page.getByTestId('contact-submit').getByRole('button').click();

        // The section write is not the endpoint this scenario breaks, so the
        // wizard advances.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();
        const deliveryHeading = page
          .getByTestId('delivery-step')
          .getByRole('heading', { level: 1 });
        await expect(deliveryHeading).toHaveText('Átvétel és fizetés');
      });

      // 5. On the delivery step choose "Házhoz szállítás" by its
      // `delivery-radio`, fill "1052" / "Budapest" / "Fő utca 1.", keep the
      // billing "same as delivery" tick, choose "Utánvét" by its
      // `payment-radio`, and press `delivery-confirm` ("Tovább az
      // ellenőrzéshez").
      await test.step('On the delivery step choose "Házhoz szállítás" by its `delivery-radio`, fill "1052" / "Budapest" / "Fő utca 1.", keep the billing "same as delivery" tick, choose "Utánvét" by its `payment-radio`, and press `delivery-confirm` ("Tovább az ellenőrzéshez").', async () => {
        const homeDeliveryRadio = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' })
          .getByTestId('delivery-radio');
        await homeDeliveryRadio.click();
        await expect(homeDeliveryRadio).toBeChecked();

        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Fő utca 1.');
        await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();

        const cashOnDeliveryRadio = page
          .getByTestId('payment-option')
          .filter({ hasText: 'Utánvét' })
          .getByTestId('payment-radio');
        await cashOnDeliveryRadio.click();
        await expect(cashOnDeliveryRadio).toBeChecked();

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        const reviewHeading = page.getByTestId('review-page').getByRole('heading', { level: 1 });
        await expect(reviewHeading).toHaveText('Minden rendben?');

        await expect(page.getByTestId('review-payment')).toHaveText('Utánvét');
        await expect(page.getByTestId('review-delivery')).toContainText('Házhoz szállítás');
        await expect(page.getByTestId('review-items').getByTestId('review-line')).toHaveCount(1);
        await expect(page.getByTestId('review-summary')).toBeVisible();

        // The terms tick gates the submit: with it set, the press is enabled
        // and the card-payment explanation is gone.
        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeEnabled();
        await expect(page.getByTestId('review-cta-explanation')).toHaveCount(0);
      });

      // 6. Tick `review-consent-terms-input` ("Elfogadom a demó rendelési
      // feltételeit.") and press the inner button of `review-submit`
      // ("Demórendelés véglegesítése").
      await test.step('Tick `review-consent-terms-input` ("Elfogadom a demó rendelési feltételeit.") and press the inner button of `review-submit`.', async () => {
        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        const submitButton = page.getByTestId('review-submit').getByRole('button');
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

        // The submission is refused, so the browser stays on the review step
        // and no receipt is invented.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('order-receipt')).toHaveCount(0);

        const failure = page.getByTestId('review-submit-failure');
        await expect(failure).toBeVisible();
        await expect(failure).toHaveAttribute('data-error-code', 'SERVICE_UNAVAILABLE');
        await expect(failure).toContainText(
          'A kosarad és az adataid megmaradtak. Próbáld újra, vagy módosítsd a fizetési módot.',
        );
        const changePayment = failure.getByTestId('review-change-payment');
        await expect(changePayment).toHaveText('Fizetési mód módosítása');
        await expect(page.getByTestId('review-state-banner')).toHaveText(
          'A rendelés leadása nem sikerült.',
        );

        // Nothing was lost: the whole draft stays on screen.
        const reviewContact = page.getByTestId('review-contact');
        await expect(reviewContact).toContainText('Teszt Elek');
        await expect(reviewContact).toContainText('teszt@example.test');
        // The schema normalises the Hungarian national prefix, so the groups
        // are matched with an optional separator.
        await expect(reviewContact).toContainText(/\+36\s?30\s?123\s?4567/);
        const reviewDelivery = page.getByTestId('review-delivery');
        await expect(reviewDelivery).toContainText('Házhoz szállítás');
        await expect(reviewDelivery).toContainText('Utánvét');
        await expect(page.getByTestId('review-items').getByTestId('review-line')).toHaveCount(1);
        await expect(page.getByTestId('review-summary')).toBeVisible();
        await expect(page.getByTestId('review-consent-terms-input')).toBeChecked();
      });

      // 7. Press the inner button of `review-submit` again.
      await test.step('Press the inner button of `review-submit` again.', async () => {
        await page.getByTestId('review-submit').getByRole('button').click();

        // The fault answers every attempt alike and the repeated attempt costs
        // nothing: the same failure returns and the browser stays put.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeEnabled();
        const failure = page.getByTestId('review-submit-failure');
        await expect(failure).toBeVisible();
        await expect(failure).toHaveAttribute('data-error-code', 'SERVICE_UNAVAILABLE');
        await expect(failure).toContainText(
          'A kosarad és az adataid megmaradtak. Próbáld újra, vagy módosítsd a fizetési módot.',
        );
        const changePayment = failure.getByTestId('review-change-payment');
        await expect(changePayment).toHaveText('Fizetési mód módosítása');
        await expect(page.getByTestId('order-receipt')).toHaveCount(0);
        await expect(page.getByTestId('review-items').getByTestId('review-line')).toHaveCount(1);
        await expect(page.getByTestId('review-summary')).toBeVisible();
      });

      // 8. Press `review-change-payment` ("Fizetési mód módosítása").
      await test.step('Press `review-change-payment` ("Fizetési mód módosítása").', async () => {
        const failure = page.getByTestId('review-submit-failure');
        await failure.getByTestId('review-change-payment').getByRole('button').click();

        // The failure's way out leads back to the delivery step.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();
        await expect(page.getByTestId('review-page')).toHaveCount(0);
      });
    },
  );
});
