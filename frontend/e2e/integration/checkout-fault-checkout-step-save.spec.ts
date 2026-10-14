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
    'a refused checkout step save keeps the shopper on the contact step',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      const saveError = page.getByTestId('contact-save-error');
      const contactSubmit = page.getByTestId('contact-submit').getByRole('button');
      const fullNameInput = page.getByTestId('contact-fullname-input');
      const emailInput = page.getByTestId('contact-email-input');
      const phoneInput = page.getByTestId('contact-phone-input');

      // 1. Open `/telefonok?mi-scenario=fail-checkout-update`, open the first
      // `product-card` with no `product-card-stock` marker through its
      // `product-card-cta`, add it with the inner button of
      // `add-to-cart-button`, open the cart with `cart-link`, press
      // `cart-continue`, then fill the contact step with "Teszt Elek",
      // "teszt@example.test" and "+36 30 123 4567" and press the inner button
      // of `contact-submit`.
      await test.step('Open `/telefonok?mi-scenario=fail-checkout-update`, open the first `product-card` with no `product-card-stock` marker through its `product-card-cta`, add it with the inner button of `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, then fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press the inner button of `contact-submit`.', async () => {
        await page.goto('/telefonok?mi-scenario=fail-checkout-update');
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
        // The scenario breaks only the checkout section write, so the addition
        // still succeeds and the header badge counts the line.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(page.getByTestId('contact-page')).toBeVisible();

        await fullNameInput.fill('Teszt Elek');
        await emailInput.fill('teszt@example.test');
        await phoneInput.fill('+36 30 123 4567');
        await expect(contactSubmit).toBeEnabled();
        await contactSubmit.click();

        // The section write (`checkout-update`) is the endpoint this scenario
        // breaks, so the save is refused, the browser stays on the contact
        // step and the wizard never advances.
        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(saveError).toBeVisible();
        await expect(saveError).toContainText('A mentés sikertelen. Próbáld újra.');
        // A refused step save is a persistent error, not a dismissible notice.
        await expect(saveError.getByRole('button', { name: 'Bezárás' })).toHaveCount(0);
        await expect(page.getByTestId('delivery-step')).toHaveCount(0);

        // Nothing was lost: the values the shopper typed stay on screen.
        await expect(fullNameInput).toHaveValue('Teszt Elek');
        await expect(emailInput).toHaveValue('teszt@example.test');
        await expect(phoneInput).toHaveValue('+36 30 123 4567');

        // Each field's wrapper (the `<label class="field">` the input sits in)
        // carries the server-error state, and the submit is usable again.
        await expect(fullNameInput.locator('..')).toHaveAttribute('data-state', 'server-error');
        await expect(emailInput.locator('..')).toHaveAttribute('data-state', 'server-error');
        await expect(phoneInput.locator('..')).toHaveAttribute('data-state', 'server-error');
        await expect(contactSubmit).toBeEnabled();

        // The server answered 503 without per-field errors, so no field is
        // named in the form summary and the summary is not rendered.
        await expect(page.getByTestId('contact-summary')).toHaveCount(0);
      });

      // 2. Press the inner button of `contact-submit` again.
      await test.step('Press the inner button of `contact-submit` again.', async () => {
        await contactSubmit.click();

        // The fault is permanent for this document: the same sentence returns,
        // the browser still does not advance and the step stays usable.
        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(saveError).toBeVisible();
        await expect(saveError).toContainText('A mentés sikertelen. Próbáld újra.');
        await expect(page.getByTestId('delivery-step')).toHaveCount(0);
        await expect(contactSubmit).toBeEnabled();

        // The field values are unchanged by the repeated attempt.
        await expect(fullNameInput).toHaveValue('Teszt Elek');
        await expect(emailInput).toHaveValue('teszt@example.test');
        await expect(phoneInput).toHaveValue('+36 30 123 4567');

        // No field is marked invalid: the server named none.
        await expect(page.locator('input[aria-invalid="true"]')).toHaveCount(0);
      });
    },
  );
});
