// spec: specs/smoke-purchase.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The playwright-test MCP server's runs do not apply the config's
// `use.baseURL` (a relative `page.goto` fails there with
// `Cannot navigate to invalid URL`, while the CLI run of the same config
// navigates), so the spec sets it too. The fallback is the smoke
// project's own default in playwright.config.ts.
test.use({ baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4410' });

test.describe('Smoke: purchase on the real stack', () => {
  test('card payment round trip reaches the receipt', { tag: '@smoke' }, async ({ page }) => {
    await test.step('Reset the cart so a previous run cannot leave lines behind. The smoke stack keys the cart by the X-Demo-Session header, and the MCP runner and the dev server share a tab across runs; a non-empty cart at this point disables value-bounded options or reroutes the review step into a leftover payment-intent branch, so the suite empties the cart first and waits for the delete to land before continuing.', async () => {
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

    await test.step('Navigate to /telefonok. The phone listing page renders a header for the telefonok category and a grid of product cards, each marked with the test id product-card.', async () => {
      await page.goto('/telefonok');
      await expect(page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' })).toBeVisible();
      // An in-stock product card carries no out-of-stock label, so picking
      // the first card whose product-card-stock is not "Elfogyott" selects
      // a buyable phone without hard-coding any slug or product name.
      const cards = page.getByTestId('product-card');
      // The catalog renders a "Katalógus betöltése" status while the
      // grid is empty; the cards do not exist in the DOM until the
      // first page resolves. Wait for the first card to be visible
      // before continuing.
      await expect(cards.first()).toBeVisible();
      const inStockCard = cards
        .filter({
          hasNot: page.locator('[data-testid="product-card-stock"]', { hasText: 'Elfogyott' }),
        })
        .first();
      await expect(inStockCard).toBeVisible();
    });

    await test.step('Pick the first product-card whose product-card-stock label is not Elfogyott (out of stock). Open that card by clicking its product-card-cta.', async () => {
      const inStockCard = page
        .getByTestId('product-card')
        .filter({
          hasNot: page.locator('[data-testid="product-card-stock"]', { hasText: 'Elfogyott' }),
        })
        .first();
      await inStockCard.getByTestId('product-card-cta').click();
      await expect(page.getByTestId('product-page')).toBeVisible();
      await expect(page.getByTestId('add-to-cart-button')).toBeVisible();
    });

    await test.step('If the product page asks for a variant, pick the first available variant before adding to cart.', async () => {
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

    await test.step('Open the cart page. The cart page lists the added line. Click cart-continue to enter the checkout on the contact step.', async () => {
      await page.getByTestId('cart-link').click();
      await expect(page.getByTestId('cart-page')).toBeVisible();
      await expect(page.getByTestId('cart-line')).toHaveCount(1);
      await expect(page.getByTestId('cart-continue')).toBeVisible();
      await page.getByTestId('cart-continue').getByRole('button').click();
      await expect(page.getByTestId('contact-page')).toBeVisible();
      await expect(page.getByTestId('contact-submit')).toBeVisible();
    });

    await test.step('Fill the contact step: a full name, an e-mail address, and a Hungarian mobile phone number. Submit via contact-submit. The delivery step appears.', async () => {
      await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
      await page.getByTestId('contact-email-input').fill('teszt@example.test');
      await page.getByTestId('contact-phone-input').fill('06301234567');
      await expect(page.getByTestId('contact-submit').getByRole('button')).toBeEnabled();
      await page.getByTestId('contact-submit').getByRole('button').click();
      await expect(page.getByTestId('delivery-step')).toBeVisible();
    });

    await test.step('On the delivery step, choose the home delivery option. Fill a valid Hungarian address: recipient name, country Magyarország, city, street and house number, and a four-digit postal code. Pick the card payment option (Bankkártya) on the delivery step (the demo checkout exposes the payment selector before the review step). Confirm via delivery-confirm. The review step appears.', async () => {
      await page.getByTestId('delivery-option').first().click();
      await page.getByTestId('address-input-postalCode').fill('1052');
      await page.getByTestId('address-input-city').fill('Budapest');
      await page.getByTestId('address-input-line1').fill('Váci utca 1');
      // Payment is picked on the delivery step, not the review step:
      // without it the review step never renders on this build.
      await page.getByTestId('payment-option').filter({ hasText: 'Bankkártya' }).first().click();
      await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();
      await expect(page.getByTestId('delivery-confirm').getByRole('button')).toBeEnabled();
      await page.getByTestId('delivery-confirm').getByRole('button').click();
      await expect(page.getByTestId('review-page')).toBeVisible();
    });

    await test.step('On the review step, keep billing the same as delivery. The payment summary shows Bankkártya (already chosen on the delivery step). The review-payment-status reads "A kártyás fizetéshez indítsd el a fizetést." and exposes a Fizetés indítása control (review-payment-new, an <app-button> host). Accept the terms via review-consent-terms-input. Click review-payment-new through its inner button. The browser is redirected to the demo payment app under /demo-fizetes/.', async () => {
      await expect(page.getByTestId('review-billing')).toBeVisible();
      await expect(page.getByTestId('review-payment')).toContainText('Bankkártya');
      await expect(page.getByTestId('review-payment-status')).toContainText(
        'A kártyás fizetéshez indítsd el a fizetést.',
      );
      await page.getByTestId('review-consent-terms-input').check();
      await expect(page.getByTestId('review-consent-terms-input')).toBeChecked();
      // review-payment-new is an <app-button> host; every click and
      // toBeEnabled on one of the seven <app-button> test-ids goes
      // through getByRole('button') so the assertion acts on the
      // native control inside the host. toBeVisible on the host
      // itself is fine.
      await expect(page.getByTestId('review-payment-new').getByRole('button')).toBeEnabled();
      await page.getByTestId('review-payment-new').getByRole('button').click();
      await expect(page).toHaveURL(/\/demo-fizetes\//);
    });

    await test.step("On the demo payment app at /demo-fizetes/, click the Sikeres fizetés button (pay-succeeded, a plain <button>) to simulate a successful card payment. The browser is redirected back to the shop's review page.", async () => {
      await expect(page).toHaveURL(/\/demo-fizetes\//);
      await expect(page.getByTestId('pay-succeeded')).toBeVisible();
      await page.getByTestId('pay-succeeded').click();
      await expect(page).toHaveURL(/\/penztar\/ellenorzes/);
      await expect(page.getByTestId('review-page')).toBeVisible();
    });

    await test.step('Back on the review page, the payment-status now reads "A fizetés jóváhagyva." (review-step.ts:246) and the terms are still ticked (MIM-241). Submit the order via review-submit. The browser is redirected to the receipt at /penztar/siker/<orderId>.', async () => {
      await expect(page.getByTestId('review-payment-status')).toContainText(
        'A fizetés jóváhagyva.',
      );
      await expect(page.getByTestId('review-consent-terms-input')).toBeChecked();
      // The CTA stays enabled while options load so a user can request an
      // explanation. Wait for actual checkout readiness before submitting.
      await expect(page.getByTestId('review-page')).toHaveAttribute('data-status', 'ready');
      await expect(page.getByTestId('review-submit').getByRole('button')).toBeEnabled();
      await page.getByTestId('review-submit').getByRole('button').click();
      await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
    });

    await test.step('On the receipt, read the order number from receipt-order-number and the payment row from receipt-row-payment. The page is the order-receipt surface, and the payment row shows Bankkártya.', async () => {
      await expect(page.getByTestId('order-receipt')).toBeVisible();
      const orderNumber = page.getByTestId('receipt-order-number');
      await expect(orderNumber).toBeVisible();
      await expect(orderNumber).not.toBeEmpty();
      await expect(page.getByTestId('receipt-row-payment')).toContainText('Bankkártya');
    });
  });
});
