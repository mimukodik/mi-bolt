// spec: specs/cart-story-paths.md
// seed: e2e/seed.spec.ts

import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures/coverage';

// The product page mounts its purchase call to action twice; below 1024px the
// desktop CTA column (`.cta-desktop`) is `display: none` (the product page
// stylesheet) and the sticky `purchase-rail` carries the press through its
// `purchase-cta`, with the confirmation in the rail's own status; at 1024px
// and wider the `add-to-cart-button` and the status inside `.cta-desktop` are
// the shown mounts. Both stay in the DOM at either width, so the viewport
// decides which one a test drives. Every step is written for both widths.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Shop: cart, context and receipt stories', () => {
  test(
    '[E104] the header badge after a completed receipt',
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

      /** The confirmation in the mount the viewport shows. */
      const confirmation = (): Locator =>
        narrowViewport
          ? page.getByTestId('purchase-rail').locator('app-status-message')
          : page.locator('.cta-desktop').locator('app-status-message');

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

      /** The text of the option pressed in a variant group. */
      const selectedOptionText = async (groupId: string): Promise<string> => {
        const group = page.getByTestId(groupId);
        return textOf(group.locator('button[aria-pressed="true"]').first());
      };

      // The phone added after the receipt, read off the product page that
      // mounts it and checked against the cart line it becomes.
      let addedName = '';

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

        const orderedName = await textOf(page.getByTestId('product-name'));
        expect(orderedName).not.toBe('');

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

        // The committed receipt lists the ordered phone alone, and its
        // "Végösszeg" is the order total the header badge must not count.
        const receiptLines = page.getByTestId('receipt-lines');
        await expect(receiptLines.getByTestId('receipt-line')).toHaveCount(1);
        await expect(receiptLines).toContainText(orderedName);
        await expect(receiptLines).toContainText('1 db');
        await expect(page.getByTestId('receipt-row-total')).toContainText('Végösszeg');
      });

      // 2. Inspect the receipt page's header.
      await test.step("2. Inspect the receipt page's header.", async () => {
        // The receipt renders under the checkout header: its brand, its
        // "Demó pénztár" label and the back-to-shop action.
        const checkoutHeader = page.getByTestId('checkout-header');
        await expect(checkoutHeader).toBeVisible();
        await expect(checkoutHeader).toContainText('MiBolt');
        await expect(checkoutHeader).toContainText('Demó pénztár');
        await expect(page.getByTestId('back-to-shop')).toHaveText('Vissza a shopba');

        // The badged shop header is not rendered on this screen, so the badge
        // is absent here rather than showing the ordered items.
        await expect(page.getByTestId('main-header')).toHaveCount(0);
        await expect(cartBadge).toHaveCount(0);
      });

      // 3. Press the inner button of `success-new-shopping` ("Vissza a telefonokhoz").
      await test.step('3. Press the inner button of `success-new-shopping` ("Vissza a telefonokhoz").', async () => {
        const newShopping = page.getByTestId('success-new-shopping');
        await expect(newShopping.getByRole('button')).toHaveText('Vissza a telefonokhoz');
        await newShopping.getByRole('button').click();

        // The shop header returns on the catalogue and its badge follows the
        // new, empty cart rather than the receipt's committed line.
        await expect(page).toHaveURL(/\/telefonok$/);
        await expect(page.getByTestId('catalog-grid')).toBeVisible();
        await expect(page.getByTestId('main-header')).toBeVisible();
        await expect(cartBadge).toHaveText('0');
        await expect(page.getByTestId('cart-link')).toHaveAccessibleName(
          'Kosár megnyitása, jelenleg üres',
        );
      });

      // 4. Add one phone: open the first `product-card` with no `product-card-stock` marker through its `product-card-cta` and press the add control of the mount the viewport shows (the inner button of `add-to-cart-button` at 1024 px and wider, `purchase-cta` below 1024 px).
      await test.step('4. Add one phone: open the first `product-card` with no `product-card-stock` marker through its `product-card-cta` and press the add control of the mount the viewport shows (the inner button of `add-to-cart-button` at 1024 px and wider, `purchase-cta` below 1024 px).', async () => {
        await expect(cards.first()).toBeVisible();

        // An in-stock card carries no `product-card-stock` marker, so the
        // first such card is the phone this step adds.
        const addedIndex = await findInStockCardIndex(Number.POSITIVE_INFINITY);
        expect(addedIndex).toBeGreaterThanOrEqual(0);

        await cards.nth(addedIndex).getByTestId('product-card-cta').click();
        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
        await expect(addControl()).toBeEnabled();

        // The reads come after the assertions above proved the product page's
        // own state rendered.
        addedName = await textOf(page.getByTestId('product-name'));
        expect(addedName).not.toBe('');
        const colour = await selectedOptionText('variant-color-group');
        const storage = await selectedOptionText('variant-storage-group');

        await addControl().click();
        // The confirmation names the phone with its own colour and storage.
        await expect(confirmation()).toContainText(
          `${addedName}, ${colour}, ${storage} – 1 darab a kosárban.`,
        );
        // The badge counts only this phone, not the committed order's item.
        await expect(cartBadge).toHaveText('1');
      });

      // 5. Open the cart with the header's `cart-link`.
      await test.step("5. Open the cart with the header's `cart-link`.", async () => {
        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();

        // The new cart holds one line only: the phone added after the receipt,
        // not the committed order's item.
        await expect(cartLines).toHaveCount(1);
        await expect(cartLines.nth(0).getByTestId('cart-line-name')).toHaveText(addedName);
        await expect(cartLines.nth(0).getByTestId('cart-line-quantity')).toHaveText('1 db');
        await expect(cartCount).toHaveText('Kosárban található termékek (1)');

        // The subtotal is that line's price alone, so no committed item is
        // counted anywhere on the screen.
        const linePrice = await priceOf(cartLines.nth(0).getByTestId('price-amount'));
        expect(linePrice).toBeGreaterThan(0);
        const subtotalAmount = page
          .getByTestId('order-summary-subtotal')
          .getByTestId('price-amount');
        await expect(subtotalAmount).toBeVisible();
        expect(await priceOf(subtotalAmount)).toBe(linePrice);

        // The cart renders under the checkout layout, which carries no badge,
        // so the badge read above stands as the shop header's own count.
        await expect(cartBadge).toHaveCount(0);
      });
    },
  );
});
