/**
 * F8 browser verification — `CheckoutFacade.applySession` must not
 * reset `paymentMethod` when a section PUT response omits the field.
 *
 * Drives the production build end to end:
 *
 *   1. /telefonok/demo-one-5g → "Kosárba teszem"
 *   2. /penztar/kosar        → "Tovább"
 *   3. /penztar/adatok       → fill, "Tovább a szállításhoz"
 *   4. /penztar/szallitas    → home_delivery + demo_cod + address
 *   5. "Tovább az ellenőrzéshez"
 *   6. PUT /api/v1/checkout/{cartId} (savePaymentMethod) MUST be 200
 *   7. Navigation MUST land on /penztar/ellenorzes without a script
 *      workaround.
 *
 * No `evaluate_script` mutation, no `route.fulfill`, no DOM bypass.
 */
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';

const BASE_URL = process.env['MI_BOLT_E2E_BASE_URL'] ?? 'http://127.0.0.1:4200';

test.beforeAll(() => {
  fs.mkdirSync('e2e/checkout-f8-screenshots', { recursive: true });
});

test.describe('F8 — DeliveryStep onConfirm persists paymentMethod without 422', () => {
  test('savePaymentMethod returns 200 and navigation reaches /penztar/ellenorzes', async ({
    page,
  }) => {
    const putRequests: Array<{
      url: string;
      status: number;
      method: string;
      postData: string | null;
    }> = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/v1/checkout/')) {
        putRequests.push({
          url,
          status: response.status(),
          method: response.request().method(),
          postData: response.request().postData(),
        });
      }
    });

    // 1. Add to cart from the product page.
    await page.goto(`${BASE_URL}/telefonok/demo-one-5g`);
    await page.getByRole('button', { name: 'Kosárba teszem' }).first().click();
    // After the add, the page shows the banner but does not navigate.
    // The user follows the cart link in the header to land on /penztar/kosar.
    await page.getByRole('link', { name: /Kosár/ }).first().click();
    await expect(page).toHaveURL(/\/penztar\/kosar$/);
    await page.screenshot({
      path: `e2e/checkout-f8-screenshots/${test.info().project.name}-01-cart.png`,
      fullPage: true,
    });

    // 2. Cart page → contact step.
    await page
      .getByTestId('cart-continue')
      .getByRole('button', { name: 'Tovább a pénztárhoz' })
      .click();
    await expect(page).toHaveURL(/\/penztar\/adatok$/);

    // 3. Fill contact, continue to delivery.
    await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
    await page.getByTestId('contact-email-input').fill('teszt@example.test');
    await page.getByTestId('contact-phone-input').fill('+36201234567');
    await page.getByTestId('contact-submit').getByRole('button').click();
    await expect(page).toHaveURL(/\/penztar\/szallitas$/);

    // 4. Pick home_delivery (first radio), fill address, pick demo_cod
    //    (second payment radio).
    await page.getByTestId('delivery-radio').first().check();
    await page.getByTestId('address-input-postalCode').fill('1111');
    await page.getByTestId('address-input-city').fill('Budapest');
    await page.getByTestId('address-input-line1').fill('Példa utca 1.');
    await page.getByTestId('payment-radio').nth(1).check();
    await page.screenshot({
      path: `e2e/checkout-f8-screenshots/${test.info().project.name}-02-delivery.png`,
      fullPage: true,
    });

    // 5. Click confirm — both PUTs must run.
    await page
      .getByTestId('delivery-confirm')
      .getByRole('button')
      .click();

    // 7. Navigation reaches the review step without workaround.
    await expect(page).toHaveURL(/\/penztar\/ellenorzes$/, { timeout: 15_000 });
    await page.screenshot({
      path: `e2e/checkout-f8-screenshots/${test.info().project.name}-03-review.png`,
      fullPage: true,
    });

    // 6. Filter the captured requests to the two PUTs the spec calls out.
    const deliveryPut = putRequests.find(
      (r) =>
        r.method === 'PUT' &&
        /\/api\/v1\/checkout\/[^/]+$/.test(r.url) &&
        r.postData !== null &&
        r.postData.includes('"delivery"'),
    );
    const paymentPut = putRequests.find(
      (r) =>
        r.method === 'PUT' &&
        /\/api\/v1\/checkout\/[^/]+$/.test(r.url) &&
        r.postData !== null &&
        r.postData.includes('"paymentMethod"') &&
        !r.postData.includes('"delivery"'),
    );

    expect(deliveryPut, 'PUT delivery request was observed').toBeDefined();
    expect(deliveryPut!.status).toBe(200);

    expect(paymentPut, 'PUT paymentMethod request was observed').toBeDefined();
    // F8 contract — the bug was 422 here.
    expect(paymentPut!.status).toBe(200);
  });
});
