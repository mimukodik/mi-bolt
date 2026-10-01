// spec: specs/smoke-purchase.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';
import { openSmokeCanary, expectSmokeCanaryReceipt } from '../fixtures/smoke-canary';

// The playwright-test MCP server's runs do not apply the config's
// `use.baseURL` (a relative `page.goto` fails there with
// `Cannot navigate to invalid URL`, while the CLI run of the same config
// navigates), so the spec sets it too. The fallback is the smoke
// project's own default in playwright.config.ts.
test.use({ baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4410' });

test.describe('Smoke: purchase on the real stack', () => {
  test('cash on delivery purchase reaches the receipt', { tag: '@smoke' }, async ({ page }) => {
    await test.step('Reset the cart so a previous run cannot leave lines behind. The smoke stack keys the cart by the X-Demo-Session header, and the MCP runner and the dev server share a tab across runs; a non-empty cart at this point disables value-bounded options the rest of the test relies on (Utánvét is rejected when the cart exceeds its ceiling), so the suite empties the cart first and waits for the delete to land before continuing.', async () => {
      await page.goto('/penztar/kosar');
      const clearButton = page.getByTestId('cart-clear').getByRole('button');
      // The clear button is only rendered when the cart has lines;
      // an empty cart lands on the empty-state template instead and
      // has nothing to clear.
      if (await clearButton.isVisible().catch(() => false)) {
        const linesBefore = await page.getByTestId('cart-line').count();
        await clearButton.click();
        // Wait for the actual delete to land: the cart-line elements
        // disappear once the empty-state template takes over. A bare
        // `cart-page toBeVisible` would pass even before the clear
        // request resolves, and the test would then re-add against
        // the still-populated cart.
        if (linesBefore > 0) {
          await expect(page.getByTestId('cart-line')).toHaveCount(0);
        }
      }
      await expect(page.getByTestId('cart-page')).toBeVisible();
    });

    await test.step('Verify the catalogue, then open only the hidden smoke canary by its exact product and variant identity.', async () => {
      await openSmokeCanary(page);
    });

    await test.step('If the product page asks for a variant (e.g. storage capacity, colour), pick the first available variant before adding to cart. Skip this step when the product page shows no variant selector.', async () => {
      // A first variant is selected by default in the variant selector.
      // Pick the first available option in each visible group to keep
      // the test robust against products that ship with one or two
      // dimensions (colour, storage).
      const colorGroup = page.getByTestId('variant-color-group');
      if (await colorGroup.isVisible().catch(() => false)) {
        const firstColor = colorGroup.locator(
          'button[data-testid^="variant-color-"]:not([disabled])',
        );
        await expect(firstColor.first()).toBeVisible();
      }
      const storageGroup = page.getByTestId('variant-storage-group');
      if (await storageGroup.isVisible().catch(() => false)) {
        const firstStorage = storageGroup.locator(
          'button[data-testid^="variant-storage-"]:not([disabled])',
        );
        await expect(firstStorage.first()).toBeVisible();
      }
      await expect(page.getByTestId('add-to-cart-button').getByRole('button')).toBeEnabled();
    });

    await test.step('Click add-to-cart-button. The cart updates; the header shows the new item count.', async () => {
      await page.getByTestId('add-to-cart-button').getByRole('button').click();
      // The header badge reflects the cart total; on this build the badge
      // refresh is not synchronous with the click, so wait for it to move
      // off the empty-state 0 instead of asserting the exact '1'.
      await expect(page.getByTestId('cart-badge')).not.toHaveText('0');
    });

    await test.step('Open the cart page (cart icon / cart-continue link from header or add-to-cart toast). The cart page lists the added line.', async () => {
      await page.getByTestId('cart-link').click();
      await expect(page.getByTestId('cart-page')).toBeVisible();
      await expect(page.getByTestId('cart-line')).toHaveCount(1);
      await expect(page.getByTestId('cart-continue')).toBeVisible();
    });

    await test.step('Click cart-continue to leave the cart and enter the checkout flow. The checkout opens on the contact step.', async () => {
      await page.getByTestId('cart-continue').getByRole('button').click();
      await expect(page.getByTestId('contact-page')).toBeVisible();
      await expect(page.getByTestId('contact-submit')).toBeVisible();
    });

    await test.step('Fill the contact step: a full name, an e-mail address, and a Hungarian mobile phone number (e.g. +36 30 123 4567 or 06301234567). Submit via contact-submit. The delivery step appears.', async () => {
      await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
      await page.getByTestId('contact-email-input').fill('teszt@example.test');
      // The schema normalises the Hungarian national prefix to +36 before
      // validating, so any of the documented forms is accepted.
      await page.getByTestId('contact-phone-input').fill('06301234567');
      await expect(page.getByTestId('contact-submit').getByRole('button')).toBeEnabled();
      await page.getByTestId('contact-submit').getByRole('button').click();
      await expect(page.getByTestId('delivery-step')).toBeVisible();
    });

    await test.step("On the delivery step, choose the home delivery option. Fill a valid Hungarian address: recipient name, country Magyarország, city, street and house number, and a four-digit postal code (e.g. 1052). Before picking Utánvét, verify its payment-radio is enabled (the backend rejects cash on delivery when the cart subtotal exceeds the ceiling, and the cart can hold a higher-priced variant than the card's from-price). Click the Utánvét payment-option. Confirm the delivery section via delivery-confirm.", async () => {
      // The first delivery-option is the home delivery option (home_delivery).
      await page.getByTestId('delivery-option').first().click();
      await page.getByTestId('address-input-postalCode').fill('1052');
      await page.getByTestId('address-input-city').fill('Budapest');
      await page.getByTestId('address-input-line1').fill('Váci utca 1');
      // Country is display-only (Magyarország) — no input to drive.
      // The payment selector lives on the delivery step, not the review
      // step: the spec asks for "Utánvét (demó)" before the review
      // step is reached, and the demo checkout exposes the option here.
      const codOption = page.getByTestId('payment-option').filter({ hasText: 'Utánvét' }).first();
      // The backend's codAvailable = !empty && subtotal <= codMaxCart
      // rule disables the radio when the cart exceeds the ceiling (the
      // `codAvailable` rule in `CheckoutService`); the option row also shows the
      // explanation under payment-unavailable-reason. Asserting the
      // radio is enabled before the click means a regression in the
      // card-to-variant price mapping would fail here, on the page
      // that explains it, rather than silently flipping to a default
      // payment method.
      await expect(codOption.getByTestId('payment-radio')).toBeEnabled();
      await codOption.click();
      // Billing defaults to "same as delivery" (test-id billing-same-as-delivery).
      await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();
      await expect(page.getByTestId('delivery-confirm').getByRole('button')).toBeEnabled();
      await page.getByTestId('delivery-confirm').getByRole('button').click();
      await expect(page.getByTestId('review-page')).toBeVisible();
    });

    await test.step('On the review step, keep billing the same as delivery (no separate billing address is entered). The Utánvét / cash on delivery option was already picked on the delivery step; the payment summary shows Utánvét. Accept the terms via review-consent-terms-input (checkbox / switch). Submit the order via review-submit.', async () => {
      await expect(page.getByTestId('review-billing')).toBeVisible();
      await expect(page.getByTestId('review-payment')).toContainText('Utánvét');
      await page.getByTestId('review-consent-terms-input').check();
      await expect(page.getByTestId('review-consent-terms-input')).toBeChecked();
      // The CTA stays enabled while options load so a user can request an
      // explanation. Wait for actual checkout readiness before submitting.
      await expect(page.getByTestId('review-page')).toHaveAttribute('data-status', 'ready');
      await expect(page.getByTestId('review-submit').getByRole('button')).toBeEnabled();
      await page.getByTestId('review-submit').getByRole('button').click();
    });

    await test.step('The order is created and the browser is redirected to the receipt at /penztar/siker/<orderId>. Read the order number from receipt-order-number and the payment row from receipt-row-payment. The page is the order-receipt surface.', async () => {
      await expect(page.getByTestId('order-receipt')).toBeVisible();
      await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
      const orderNumber = page.getByTestId('receipt-order-number');
      await expect(orderNumber).toBeVisible();
      await expect(orderNumber).not.toBeEmpty();
      await expect(page.getByTestId('receipt-row-payment')).toContainText('Utánvét');
      await expectSmokeCanaryReceipt(page);
    });
  });
});
