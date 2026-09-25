// spec: specs/checkout-fault-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The add control is laid out differently at the two integration viewports:
// below 1024px the product page's desktop CTA block is `display: none` (the
// `.cta-desktop` rule in the product page stylesheet) and the sticky
// `purchase-rail` carries the same "Kosárba teszem" press through its
// `purchase-cta`. Both mounts stay in the DOM at either width, so the viewport
// decides which one this test drives.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: service faults', () => {
  test(
    'the delivery step cannot load its delivery and payment options',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      const errorState = page.getByTestId('error-state');
      const errorTitle = errorState.getByRole('heading', { level: 2 });
      const retryButton = errorState.getByRole('button');

      // 1. Open `/telefonok?mi-scenario=fail-checkout-options`, open the first
      // `product-card` with no `product-card-stock` marker through its
      // `product-card-cta`, add it with the inner button of
      // `add-to-cart-button`, open the cart with `cart-link`, press
      // `cart-continue`, fill the contact step with "Teszt Elek",
      // "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`.
      await test.step('Open `/telefonok?mi-scenario=fail-checkout-options`, open the first `product-card` with no `product-card-stock` marker through its `product-card-cta`, add it with the inner button of `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`.', async () => {
        await page.goto('/telefonok?mi-scenario=fail-checkout-options');
        await expect(page.getByTestId('result-count')).toHaveText(
          '55 találat a szűrt feltételek szerint',
        );

        // The product is never named: the scenario picks its card by what the
        // screen shows, the first one without an "Elfogyott" marker.
        const inStockCard = page
          .getByTestId('product-card')
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();
        // The scenario breaks only the checkout options read, so the addition
        // still succeeds and the header badge counts the line.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(page.getByTestId('contact-page')).toBeVisible();

        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

        // The section write (`checkout-update`) is not the endpoint this
        // scenario breaks, so the contact section is saved and the wizard
        // advances to the delivery step on its own.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);

        // The options read (`checkout-options`) finished and failed: the step
        // is neither loading the options nor showing them.
        await expect(page.getByTestId('delivery-step')).toHaveCount(0);
        await expect(page.getByTestId('delivery-loading')).toHaveCount(0);

        await expect(errorState).toBeVisible();
        await expect(errorTitle).toHaveText('Az opciók nem érhetők el');
        await expect(errorState).toContainText(
          'A szállítási és fizetési opciók betöltése sikertelen.',
        );
        await expect(retryButton).toHaveCount(1);
        await expect(retryButton).toHaveText('Újrapróbálom');

        // The step shows only what the server told it, and the server told it
        // nothing: no address form and no radio group is invented.
        await expect(page.getByTestId('address-form')).toHaveCount(0);
        await expect(page.getByTestId('delivery-radio')).toHaveCount(0);
        await expect(page.getByTestId('payment-radio')).toHaveCount(0);
      });

      // 2. Press "Újrapróbálom" (the `error-state` control).
      await test.step('Press "Újrapróbálom" (the `error-state` control).', async () => {
        await retryButton.click();

        // The fault answers every attempt alike, so the same error state
        // returns with the same title, message and single control.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(errorState).toBeVisible();
        await expect(errorTitle).toHaveText('Az opciók nem érhetők el');
        await expect(errorState).toContainText(
          'A szállítási és fizetési opciók betöltése sikertelen.',
        );
        await expect(retryButton).toHaveCount(1);
        await expect(retryButton).toHaveText('Újrapróbálom');

        // No step past the delivery page is reachable in this document.
        await expect(page.getByTestId('delivery-step')).toHaveCount(0);
        await expect(page.getByTestId('review-page')).toHaveCount(0);
      });
    },
  );
});
