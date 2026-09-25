// spec: specs/cart-story-paths.md
// seed: e2e/seed.spec.ts

import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures/coverage';

// The product page mounts its purchase call to action twice; below 1024px the
// desktop CTA column is `display: none` (the product page stylesheet) and the
// sticky `purchase-rail` carries the press through its `purchase-cta`, while
// at 1024px and wider the `add-to-cart-button` is the shown mount. Both mounts
// stay in the DOM at either width, so the viewport decides which one a test
// drives. Every step is written for both widths.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Shop: cart, context and receipt stories', () => {
  test(
    '[E069] new shopping after a completed receipt',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;

      const cards = page.getByTestId('product-card');
      const cartLines = page.getByTestId('cart-line');
      const cartBadge = page.getByTestId('cart-badge');
      const cartCount = page.getByTestId('cart-count');

      /** The add control in the mount the viewport shows. */
      const addControl = (): Locator =>
        narrowViewport
          ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
          : page.getByTestId('add-to-cart-button').getByRole('button');

      /** The trimmed text of a locator, '' when it renders nothing. */
      const textOf = async (target: Locator): Promise<string> =>
        ((await target.textContent()) ?? '').replace(/\s+/g, ' ').trim();

      /** The digits of a `price-amount` as an integer. The amount renders its
       *  thousands with a non-breaking space (price-block), so the comparison
       *  is made on the parsed number rather than on the text. */
      const priceOf = async (target: Locator): Promise<number> =>
        Number((await textOf(target)).replace(/\D/g, ''));

      /** The index of the first in-stock card (no `product-card-stock` marker)
       *  whose leading `price-amount` is at most `maxPrice`; -1 when none
       *  matches. */
      const findInStockCardIndex = async (maxPrice: number): Promise<number> => {
        const cardCount = await cards.count();
        for (let i = 0; i < cardCount; i++) {
          const card = cards.nth(i);
          if ((await card.getByTestId('product-card-stock').count()) > 0) continue;
          const price = await priceOf(card.getByTestId('price-amount').first());
          if (Number.isFinite(price) && price > 0 && price <= maxPrice) return i;
        }
        return -1;
      };

      /** The order id in the receipt URL; the Back step returns to that URL. */
      let orderId = '';

      // 1. Reach a receipt with the cash-on-delivery walk of `specs/storefront-integration.md` scenario 3.7: open `/telefonok?sort=price_asc`, pick the first `product-card` with no `product-card-stock` marker whose `price-amount` is at most 300 000 Ft, open it through its `product-card-cta`, add it with the add control of the mount the viewport shows, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`, then on the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose "Utánvét", press `delivery-confirm`, tick `review-consent-terms-input` and press the inner button of `review-submit`.
      await test.step('1. Reach a receipt with the cash-on-delivery walk of `specs/storefront-integration.md` scenario 3.7: open `/telefonok?sort=price_asc`, pick the first `product-card` with no `product-card-stock` marker whose `price-amount` is at most 300 000 Ft, open it through its `product-card-cta`, add it with the add control of the mount the viewport shows, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`, then on the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose "Utánvét", press `delivery-confirm`, tick `review-consent-terms-input` and press the inner button of `review-submit`.', async () => {
        await page.goto('/telefonok?sort=price_asc');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();
        await expect(cards.first()).toBeVisible();

        // The mock rejects cash on delivery once the cart exceeds this ceiling
        // (CASH_ON_DELIVERY_MAX_CART_HUF), so the card is picked below it.
        const cashOnDeliveryCeiling = 300_000;
        const orderedIndex = await findInStockCardIndex(cashOnDeliveryCeiling);
        expect(orderedIndex).toBeGreaterThanOrEqual(0);

        await cards.nth(orderedIndex).getByTestId('product-card-cta').click();
        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');

        // The "Készülékár" block is the price inside the product's own `Árak`
        // region; the related cards outside it carry a different label.
        const devicePrice = page
          .getByRole('region', { name: 'Árak', exact: true })
          .getByTestId('price-amount');
        await expect(devicePrice).toBeVisible();
        expect(await priceOf(devicePrice)).toBeLessThanOrEqual(cashOnDeliveryCeiling);

        await expect(addControl()).toBeEnabled();
        await addControl().click();
        await expect(cartBadge).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(cartLines).toHaveCount(1);
        await expect(page.getByTestId('cart-continue').getByRole('button')).toBeEnabled();

        await page.getByTestId('cart-continue').getByRole('button').click();
        await expect(page.getByTestId('contact-page')).toBeVisible();

        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();

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

        const cashOnDeliveryOption = page
          .getByTestId('payment-option')
          .filter({ hasText: 'Utánvét' });
        // Under the ceiling the mock keeps cash on delivery enabled, so the
        // option can be chosen and its badge confirms the selection.
        await expect(cashOnDeliveryOption.getByTestId('payment-radio')).toBeEnabled();
        await cashOnDeliveryOption.click();
        await expect(cashOnDeliveryOption.getByTestId('payment-selected-badge')).toHaveText(
          'Kiválasztva',
        );

        await page.getByTestId('delivery-confirm').getByRole('button').click();
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();

        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        const submitButton = page.getByTestId('review-submit').getByRole('button');
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

        // The submit navigates in-app: the browser lands on the order's URL.
        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        await expect(page.getByTestId('order-receipt')).toBeVisible();
        await expect(page.getByTestId('success-heading')).toHaveText('Elkészült a demórendelésed.');

        const receiptLines = page.getByTestId('receipt-lines');
        await expect(receiptLines.getByTestId('receipt-line')).toHaveCount(1);
        await expect(receiptLines).toContainText('1 db');
        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );

        const successActions = page.getByTestId('success-actions');
        await expect(successActions.getByTestId('success-new-shopping')).toContainText(
          'Vissza a telefonokhoz',
        );
        await expect(successActions).toContainText(
          'Az új vásárlás friss kosarat hoz létre; a korábbi rendelés adatai továbbra is elérhetők ezen az URL-en.',
        );

        // The order id the address bar carries; the Back step comes back to it.
        const receiptUrl = page.url();
        orderId = receiptUrl.slice(receiptUrl.lastIndexOf('/') + 1);
        expect(orderId).not.toBe('');
      });

      // 2. Press the inner button of `success-new-shopping` ("Vissza a telefonokhoz"), then press the browser's Back once and its Forward once.
      await test.step('2. Press the inner button of `success-new-shopping` ("Vissza a telefonokhoz"), then press the browser\'s Back once and its Forward once.', async () => {
        const newShopping = page.getByTestId('success-new-shopping');
        await expect(newShopping.getByRole('button')).toHaveText('Vissza a telefonokhoz');
        await newShopping.getByRole('button').click();

        // The new shopping action lands on the catalogue with a fresh, empty
        // cart, not the completed order's one.
        await expect(page).toHaveURL(/\/telefonok$/);
        await expect(page.getByTestId('catalog-grid')).toBeVisible();
        await expect(cartBadge).toHaveText('0');
        await expect(page.getByTestId('cart-link')).toHaveAccessibleName(
          'Kosár megnyitása, jelenleg üres',
        );

        // Back returns to the receipt at its own URL, still readable, and
        // never reopens the wizard or restores the ordered line.
        await page.goBack();
        // The route is compared through the parsed URL rather than through a
        // `RegExp` built from the run's own order id.
        await expect(page).toHaveURL(
          (url) => `${url.pathname}${url.search}` === `/penztar/siker/${orderId}`,
        );
        await expect(page.getByTestId('order-receipt')).toBeVisible();
        await expect(page.getByTestId('receipt-lines').getByTestId('receipt-line')).toHaveCount(1);
        await expect(page.getByTestId('success-new-shopping')).toContainText(
          'Vissza a telefonokhoz',
        );
        await expect(page.getByTestId('review-page')).toHaveCount(0);

        // Forward returns to the catalogue with the new cart still empty.
        await page.goForward();
        await expect(page).toHaveURL(/\/telefonok$/);
        await expect(cartBadge).toHaveText('0');
      });

      // 3. Open the cart with the header's `cart-link`.
      await test.step("3. Open the cart with the header's `cart-link`.", async () => {
        await page.getByTestId('cart-link').click();

        // The cart renders in its empty state: no line and no summary, so no
        // line of the completed order is offered for a second purchase.
        const cartPage = page.getByTestId('cart-page');
        await expect(cartPage).toBeVisible();
        await expect(cartPage).toContainText('A kosarad még üres.');
        await expect(cartPage).toContainText(
          'Nézd meg a demókészülékeket, és válaszd ki a kedvenced.',
        );
        await expect(cartPage).toContainText('Telefonokat nézek');
        await expect(cartLines).toHaveCount(0);
        await expect(page.getByTestId('order-summary')).toHaveCount(0);
      });

      // 4. Deep-link the review step with the cart still empty: navigate to `/penztar/ellenorzes`.
      await test.step('4. Deep-link the review step with the cart still empty: navigate to `/penztar/ellenorzes`.', async () => {
        await page.goto('/penztar/ellenorzes');

        // The review guard sends an empty cart back to the cart page with its
        // reason, and the review page never renders.
        await expect(page).toHaveURL(/\/penztar\/kosar\?navigationReason=empty-cart$/);
        await expect(page.getByTestId('cart-page')).toBeVisible();
        const reason = page.getByTestId('navigation-reason');
        await expect(reason).toContainText('A kosarad üres, ezért ide irányítottunk.');
        await expect(reason).toContainText('Bezárás');
        await expect(page.getByTestId('review-page')).toHaveCount(0);
      });

      // 5. Start the new purchase: navigate to `/telefonok`, open the first `product-card` with no `product-card-stock` marker through its `product-card-cta`, press the add control of the mount the viewport shows, and open the cart with `cart-link`.
      await test.step('5. Start the new purchase: navigate to `/telefonok`, open the first `product-card` with no `product-card-stock` marker through its `product-card-cta`, press the add control of the mount the viewport shows, and open the cart with `cart-link`.', async () => {
        await page.goto('/telefonok');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();
        await expect(cards.first()).toBeVisible();

        const newPurchaseIndex = await findInStockCardIndex(Number.POSITIVE_INFINITY);
        expect(newPurchaseIndex).toBeGreaterThanOrEqual(0);

        await cards.nth(newPurchaseIndex).getByTestId('product-card-cta').click();
        await expect(page.getByTestId('product-page')).toBeVisible();
        // The name is read off the screen so the cart line is checked against
        // what the shop actually shows.
        const newProductName = await textOf(page.getByTestId('product-name'));
        expect(newProductName).not.toBe('');

        await expect(addControl()).toBeEnabled();
        await addControl().click();
        await expect(cartBadge).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();

        // The new cart holds one line only: the phone added after the new
        // shopping started, not a line of the completed order.
        await expect(cartLines).toHaveCount(1);
        await expect(cartLines.nth(0).getByTestId('cart-line-name')).toHaveText(newProductName);
        await expect(cartLines.nth(0).getByTestId('cart-line-quantity')).toHaveText('1 db');
        await expect(cartCount).toHaveText('Kosárban található termékek (1)');
      });

      // 6. Deep-link the review step again, now with a cart holding a line: navigate to `/penztar/ellenorzes`.
      await test.step('6. Deep-link the review step again, now with a cart holding a line: navigate to `/penztar/ellenorzes`.', async () => {
        await page.goto('/penztar/ellenorzes');

        // The completed order's draft is unreadable to the guard, so it sends
        // the shopper to the earliest missing step, the contact step.
        await expect(page).toHaveURL(/\/penztar\/adatok\?navigationReason=incomplete$/);
        await expect(page.getByTestId('contact-page')).toBeVisible();
        await expect(page.getByTestId('navigation-reason')).toContainText(
          'Előbb ezt a lépést kell kitöltened, utána léphetsz tovább.',
        );
        await expect(page.getByTestId('review-page')).toHaveCount(0);
      });
    },
  );
});
