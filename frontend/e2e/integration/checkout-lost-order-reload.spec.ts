// spec: specs/checkout-lost-paths.md
// seed: e2e/seed.spec.ts

import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures/coverage';

// The product page mounts its purchase call to action twice; below 1024px the
// desktop CTA column (`.cta-desktop`) is `display: none` (the product page
// stylesheet) and the sticky `purchase-rail` carries the press through its
// `purchase-cta`; at 1024px and wider the `add-to-cart-button` inside
// `.cta-desktop` is the shown mount. Both stay in the DOM at either width, so
// the viewport decides which one a test drives.
const DESKTOP_MIN_WIDTH = 1024;

// The mock refuses cash on delivery above this cart total
// (CASH_ON_DELIVERY_MAX_CART_HUF), so the ordered card is picked below it.
const CASH_ON_DELIVERY_CEILING = 300_000;

// The fault query every `page.goto` of this scenario keeps, so each load names
// its scenario rather than resuming the one the tab remembered (rule 12 of
// `e2e/seed.spec.ts`).
const SCENARIO_QUERY = 'mi-scenario=lost-once-order';

test.describe('Checkout: an answer lost after the commit', () => {
  test(
    '[E065] a reload before the receipt lands on the empty cart, not on a replayed receipt',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;

      const cards = page.getByTestId('product-card');
      const catalogGrid = page.getByTestId('catalog-grid');
      const cartPage = page.getByTestId('cart-page');
      const cartLines = page.getByTestId('cart-line');
      const emptyState = page.getByTestId('empty-state');
      const reasonBanner = page.getByTestId('navigation-reason');

      /** The add control in the mount the viewport shows. */
      const addControl = (): Locator =>
        narrowViewport
          ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
          : page.getByTestId('add-to-cart-button').getByRole('button');

      // 1. Reach the review step with a cash-on-delivery draft under the fault:
      // open `/telefonok?mi-scenario=lost-once-order`, open the first card with
      // no `product-card-stock` marker and a `price-amount` at or below
      // 300 000 Ft through its `product-card-cta`, add it, open the cart with
      // `cart-link`, press `cart-continue`, fill the contact step and press
      // `contact-submit`, then on the delivery step choose "Házhoz szállítás",
      // fill the address, choose "Utánvét" and press `delivery-confirm`.
      await test.step('1. Reach the review step with a cash-on-delivery draft under the fault: open `/telefonok?mi-scenario=lost-once-order`, open the first card with no `product-card-stock` marker and a `price-amount` at or below 300 000 Ft through its `product-card-cta`, add it, open the cart with `cart-link`, press `cart-continue`, fill the contact step and press `contact-submit`, then on the delivery step choose "Házhoz szállítás", fill the address, choose "Utánvét" and press `delivery-confirm`.', async () => {
        await page.goto(`/telefonok?${SCENARIO_QUERY}`);

        await expect(catalogGrid).toBeVisible();
        await expect(cards.first()).toBeVisible();

        // The picked card: the first card with no "Elfogyott" marker, at or
        // below the mock's cash-on-delivery ceiling, so the delivery step can
        // offer "Utánvét".
        const card = cards.filter({ hasNot: page.getByTestId('product-card-stock') }).first();
        await expect(card).toBeVisible();
        const cardPrice = card.getByTestId('price-amount');
        await expect(cardPrice).toBeVisible();
        // The amount renders its thousands with a non-breaking space
        // (price-block), so the comparison is made on the parsed number.
        const priceValue = Number(((await cardPrice.textContent()) ?? '').replace(/\D/g, ''));
        expect(priceValue).toBeLessThanOrEqual(CASH_ON_DELIVERY_CEILING);

        await card.getByTestId('product-card-cta').click();

        const productPage = page.getByTestId('product-page');
        await expect(productPage).toBeVisible();

        // The control the width shows: the desktop mount or the rail's own.
        await expect(addControl()).toBeEnabled();
        await addControl().click();
        // The header badge reads the cart's item count, so the add landing is
        // what makes it read 1 before the cart is opened.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(cartPage).toBeVisible();
        await expect(cartLines).toHaveCount(1);

        await page.getByTestId('cart-continue').getByRole('button').click();
        const contactPage = page.getByTestId('contact-page');
        await expect(contactPage).toBeVisible();
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await expect(page.getByTestId('contact-submit').getByRole('button')).toBeEnabled();
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);

        const homeDeliveryRadio = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' })
          .getByTestId('delivery-radio');
        await homeDeliveryRadio.click();
        await expect(homeDeliveryRadio).toBeChecked();

        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Fő utca 1.');

        const cashOnDeliveryRadio = page
          .getByTestId('payment-option')
          .filter({ hasText: 'Utánvét' })
          .getByTestId('payment-radio');
        await expect(cashOnDeliveryRadio).toBeEnabled();
        await cashOnDeliveryRadio.click();
        await expect(cashOnDeliveryRadio).toBeChecked();

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        const reviewPage = page.getByTestId('review-page');
        await expect(reviewPage).toBeVisible();
        await expect(page.getByTestId('review-items').getByTestId('review-line')).toHaveCount(1);
        await expect(page.getByTestId('review-payment')).toHaveText('Utánvét');

        const totalRow = page.getByTestId('review-summary').getByTestId('order-summary-total');
        await expect(totalRow).toContainText('Végösszeg');
        // The Végösszeg noted here (90 480) is the total the lost order
        // committed with.
        await expect(totalRow.getByTestId('price-amount')).toHaveText('90 480');
      });

      // 2. Tick `review-consent-terms-input` and press the inner button of
      // `review-submit` ("Demórendelés véglegesítése") once.
      await test.step('2. Tick `review-consent-terms-input` and press the inner button of `review-submit` ("Demórendelés véglegesítése") once.', async () => {
        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        const submitButton = page.getByTestId('review-submit').getByRole('button');
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

        // The browser stays put: the committed order's answer never arrived, so
        // no receipt is invented over the write that landed.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('order-receipt')).toHaveCount(0);

        const failure = page.getByTestId('review-submit-failure');
        await expect(failure).toBeVisible();
        await expect(failure).toHaveAttribute('data-error-code', 'UNKNOWN');
        await expect(failure).toContainText(
          'A kosarad és az adataid megmaradtak. Próbáld újra, vagy módosítsd a fizetési módot.',
        );
        await expect(page.getByTestId('review-state-banner')).toHaveText(
          'A rendelés leadása nem sikerült.',
        );
      });

      // 3. Reload the review page instead of retrying, keeping the scenario:
      // `page.url()` carries `/penztar/ellenorzes` without the query, so the
      // reload names the URL with it.
      await test.step('3. Reload the review page instead of retrying, keeping the scenario: `page.url()` carries `/penztar/ellenorzes` without the query, so the reload names the URL with it.', async () => {
        await page.goto(`${page.url()}?${SCENARIO_QUERY}`);

        // The wizard refuses the review from the empty cart the commit left
        // behind, and the fresh page load cannot read the draft back.
        await expect(page).toHaveURL(/\/penztar\/kosar\?navigationReason=empty-cart$/);
        await expect(cartPage).toBeVisible();
        await expect(page.getByTestId('review-page')).toHaveCount(0);

        await expect(reasonBanner).toBeVisible();
        await expect(reasonBanner).toContainText('A kosarad üres, ezért ide irányítottunk.');
        await expect(reasonBanner.getByRole('button', { name: 'Bezárás' })).toBeVisible();

        // The cart is empty: the commit emptied it and cleared the draft.
        await expect(cartLines).toHaveCount(0);
        await expect(
          emptyState.getByRole('heading', { name: 'A kosarad még üres.' }),
        ).toBeVisible();
        await expect(
          emptyState.getByText('Nézd meg a demókészülékeket, és válaszd ki a kedvenced.'),
        ).toBeVisible();
        await expect(emptyState.getByRole('button', { name: 'Telefonokat nézek' })).toBeVisible();

        // The lost answer is nowhere on the reloaded page.
        await expect(page.getByTestId('order-receipt')).toHaveCount(0);
        await expect(page.getByTestId('receipt-order-number')).toHaveCount(0);
      });

      // 4. Read what the reloaded screen offers to recover, and what it does
      // not offer.
      await test.step('4. Read what the reloaded screen offers to recover, and what it does not offer.', async () => {
        // No submit control and no lookup control: the order's id only ever
        // existed in the answer that was lost, so the row's replay/lookup has
        // nothing to press here.
        await expect(page.getByTestId('review-submit')).toHaveCount(0);
        await expect(page.getByTestId('review-payment-new')).toHaveCount(0);
        // No checkout step is rendered on this screen, so nothing names the
        // contact that was typed; its persistence across the reload is
        // deliberately not asserted.
        await expect(page.getByText('Teszt Elek')).toHaveCount(0);

        // What the screen does offer is its way out: the catalogue.
        await emptyState.getByRole('button', { name: 'Telefonokat nézek' }).click();
        await expect(page).toHaveURL(/\/telefonok$/);
        await expect(catalogGrid).toBeVisible();
        await expect(cards.first()).toBeVisible();
      });

      // 5. Check that no second order can come of the reloaded state: open
      // `/penztar/ellenorzes?mi-scenario=lost-once-order` as a fresh page load.
      await test.step('5. Check that no second order can come of the reloaded state: open `/penztar/ellenorzes?mi-scenario=lost-once-order` as a fresh page load.', async () => {
        await page.goto(`/penztar/ellenorzes?${SCENARIO_QUERY}`);

        // The same landing: the cart holds no lines and the wizard refuses
        // every step past it, so the reloaded session can place no order at
        // all.
        await expect(page).toHaveURL(/\/penztar\/kosar\?navigationReason=empty-cart$/);
        await expect(cartPage).toBeVisible();
        await expect(reasonBanner).toBeVisible();
        await expect(reasonBanner).toContainText('A kosarad üres, ezért ide irányítottunk.');
        await expect(page.getByTestId('review-page')).toHaveCount(0);
        await expect(cartLines).toHaveCount(0);
      });
    },
  );
});
