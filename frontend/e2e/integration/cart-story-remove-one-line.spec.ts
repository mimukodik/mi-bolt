// spec: specs/cart-story-paths.md
// seed: e2e/seed.spec.ts

import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures/coverage';

// The product page mounts its purchase call to action twice; both stay in the
// DOM at either width, so the viewport decides which one a test drives. Below
// 1024px the desktop CTA column (`.cta-desktop`) is `display: none` (the
// product page stylesheet) and the sticky `purchase-rail` carries the press
// through its `purchase-cta`, with the confirmation in the rail's own status;
// at 1024px and wider the `add-to-cart-button` and the status inside
// `.cta-desktop` are the shown mounts.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Shop: cart, context and receipt stories', () => {
  test('[E056] removing one line keeps the other', { tag: '@integration' }, async ({ page }) => {
    const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;

    const cards = page.getByTestId('product-card');
    const cartLines = page.getByTestId('cart-line');
    const cartCount = page.getByTestId('cart-count');
    const subtotal = page.getByTestId('order-summary-subtotal');
    const total = page.getByTestId('order-summary-total');
    const productName = page.getByTestId('product-name');
    // The "Készülékár" block inside the product's own `Árak` region: the
    // mobile rail and the related cards carry other price blocks.
    const devicePrice = page
      .getByRole('region', { name: 'Árak', exact: true })
      .getByTestId('price-amount');

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

    /** The product name a card shows in its heading. */
    const cardNameOf = async (card: Locator): Promise<string> =>
      textOf(card.getByRole('heading', { level: 3 }));

    /** The text of the option pressed in a variant group, '' when the group
     *  is absent. */
    const selectedOptionText = async (groupId: string): Promise<string> =>
      textOf(page.getByTestId(groupId).locator('button[aria-pressed="true"]').first());

    /** The index of the first in-stock card (no `product-card-stock`
     *  marker) whose name is not one of `excludedNames`; -1 when none
     *  matches. */
    const findInStockCardIndex = async (excludedNames: string[]): Promise<number> => {
      const cardCount = await cards.count();
      for (let i = 0; i < cardCount; i++) {
        const card = cards.nth(i);
        if ((await card.getByTestId('product-card-stock').count()) > 0) continue;
        const name = await cardNameOf(card);
        if (name === '' || excludedNames.includes(name)) continue;
        return i;
      }
      return -1;
    };

    let nameA = '';
    let priceA = 0;
    let nameB = '';
    let priceB = 0;

    // 1. Open `/telefonok?sort=price_asc` and wait for the grid. Open the first `product-card` with no `product-card-stock` marker through its `product-card-cta`, press the add control of the mount the viewport shows (the inner button of `add-to-cart-button` at 1024 px and wider, `purchase-cta` below 1024 px), note its name (call it A) and its "Készülékár" `price-amount` (PA), then go back to `/telefonok?sort=price_asc`, open the first `product-card` with no `product-card-stock` marker whose name differs from A, add it the same way, and note its name (call it B) and its price (PB).
    await test.step('1. Open `/telefonok?sort=price_asc` and wait for the grid. Open the first `product-card` with no `product-card-stock` marker through its `product-card-cta`, press the add control of the mount the viewport shows (the inner button of `add-to-cart-button` at 1024 px and wider, `purchase-cta` below 1024 px), note its name (call it A) and its "Készülékár" `price-amount` (PA), then go back to `/telefonok?sort=price_asc`, open the first `product-card` with no `product-card-stock` marker whose name differs from A, add it the same way, and note its name (call it B) and its price (PB).', async () => {
      await page.goto('/telefonok?sort=price_asc');
      await expect(page.getByTestId('catalog-grid')).toBeVisible();
      await expect(cards.first()).toBeVisible();

      // An in-stock card carries no `product-card-stock` marker, so the
      // first such card is phone A.
      const indexA = await findInStockCardIndex([]);
      expect(indexA).toBeGreaterThanOrEqual(0);

      await cards.nth(indexA).getByTestId('product-card-cta').click();
      await expect(page.getByTestId('product-page')).toBeVisible();
      await expect(productName).not.toBeEmpty();
      await expect(devicePrice).toBeVisible();
      await expect(addControl()).toBeEnabled();

      // The reads come after the assertions above proved the product page's
      // own state rendered.
      nameA = await textOf(productName);
      priceA = await priceOf(devicePrice);
      expect(priceA).toBeGreaterThan(0);
      const colourA = await selectedOptionText('variant-color-group');
      const storageA = await selectedOptionText('variant-storage-group');

      await addControl().click();
      // The confirmation names A's own colour and storage.
      await expect(confirmation()).toContainText(
        `${nameA}, ${colourA}, ${storageA} – 1 darab a kosárban.`,
      );
      await expect(page.getByTestId('cart-badge')).toHaveText('1');

      // Back to the catalogue for the second phone: the first in-stock card
      // whose name differs from A.
      await page.goto('/telefonok?sort=price_asc');
      await expect(page.getByTestId('catalog-grid')).toBeVisible();
      await expect(cards.first()).toBeVisible();

      const indexB = await findInStockCardIndex([nameA]);
      expect(indexB).toBeGreaterThanOrEqual(0);

      await cards.nth(indexB).getByTestId('product-card-cta').click();
      await expect(page.getByTestId('product-page')).toBeVisible();
      await expect(productName).not.toBeEmpty();
      await expect(devicePrice).toBeVisible();
      await expect(addControl()).toBeEnabled();

      nameB = await textOf(productName);
      expect(nameB).not.toBe(nameA);
      expect(nameB).not.toBe('');
      priceB = await priceOf(devicePrice);
      expect(priceB).toBeGreaterThan(0);
      const colourB = await selectedOptionText('variant-color-group');
      const storageB = await selectedOptionText('variant-storage-group');

      await addControl().click();
      await expect(confirmation()).toContainText(
        `${nameB}, ${colourB}, ${storageB} – 1 darab a kosárban.`,
      );
      await expect(page.getByTestId('cart-badge')).toHaveText('2');
    });

    // 2. Open the cart with the header's `cart-link`.
    await test.step("2. Open the cart with the header's `cart-link`.", async () => {
      await page.getByTestId('cart-link').click();
      await expect(page.getByTestId('cart-page')).toBeVisible();

      // The two additions are two lines, kept in the order they were added.
      await expect(cartLines).toHaveCount(2);
      await expect(cartLines.nth(0).getByTestId('cart-line-name')).toHaveText(nameA);
      await expect(cartLines.nth(1).getByTestId('cart-line-name')).toHaveText(nameB);
      await expect(cartLines.nth(0).getByTestId('cart-line-quantity')).toHaveText('1 db');
      await expect(cartLines.nth(1).getByTestId('cart-line-quantity')).toHaveText('1 db');

      // Each line's "Részösszeg" block is its own unit price, read from the
      // line rather than page-wide (the summary carries another one).
      expect(await priceOf(cartLines.nth(0).getByTestId('price-amount'))).toBe(priceA);
      expect(await priceOf(cartLines.nth(1).getByTestId('price-amount'))).toBe(priceB);

      await expect(cartCount).toHaveText('Kosárban található termékek (2)');
      const subtotalAmount = subtotal.getByTestId('price-amount');
      await expect(subtotalAmount).toBeVisible();
      expect(await priceOf(subtotalAmount)).toBe(priceA + priceB);

      // One remove control per line, each labelled with its own product.
      await expect(page.getByTestId('cart-line-remove')).toHaveCount(2);
      const removeA = cartLines.nth(0).getByTestId('cart-line-remove');
      const removeB = cartLines.nth(1).getByTestId('cart-line-remove');
      await expect(removeA).toHaveText('Törlöm');
      await expect(removeB).toHaveText('Törlöm');
      await expect(removeA).toHaveAccessibleName(`Törlöm: ${nameA}`);
      await expect(removeB).toHaveAccessibleName(`Törlöm: ${nameB}`);
    });

    // 3. Press the `cart-line-remove` of the line whose `cart-line-name` is B.
    await test.step('3. Press the `cart-line-remove` of the line whose `cart-line-name` is B.', async () => {
      // The lines keep the order they were added in, so B is the second one.
      await cartLines.nth(1).getByTestId('cart-line-remove').click();

      // Only the selected line went: one line remains and it is A.
      await expect(cartLines).toHaveCount(1);
      await expect(cartLines.nth(0).getByTestId('cart-line-name')).toHaveText(nameA);
      await expect(cartLines.nth(0).getByTestId('cart-line-quantity')).toHaveText('1 db');

      // The remaining line keeps its own selection untouched.
      expect(await priceOf(cartLines.nth(0).getByTestId('price-amount'))).toBe(priceA);

      // The totals follow the removal.
      await expect(cartCount).toHaveText('Kosárban található termékek (1)');
      const subtotalAmount = subtotal.getByTestId('price-amount');
      await expect(subtotalAmount).toBeVisible();
      expect(await priceOf(subtotalAmount)).toBe(priceA);

      // B's selection is not offered again anywhere on the page.
      await expect(cartLines.filter({ hasText: nameB })).toHaveCount(0);

      // The shipping fee is chosen on the delivery step, so the total still
      // shows the "Végösszeg" placeholder rather than an amount.
      await expect(total).toContainText('Végösszeg');
      await expect(total.getByTestId('price-empty')).toHaveText('—');
      await expect(total).toContainText('Nincs megjeleníthető ár.');
      await expect(total.getByTestId('price-amount')).toHaveCount(0);
    });

    // 4. Read the header badge, which the cart screen itself does not carry: press the checkout header's `back-to-shop` ("Vissza a shopba").
    await test.step('4. Read the header badge, which the cart screen itself does not carry: press the checkout header\'s `back-to-shop` ("Vissza a shopba").', async () => {
      await page.getByTestId('back-to-shop').click();

      // The shop header returns on the catalogue, and both its badge and the
      // cart link's label follow the single remaining line.
      await expect(page).toHaveURL(/\/telefonok$/);
      await expect(page.getByTestId('catalog-grid')).toBeVisible();
      await expect(page.getByTestId('cart-badge')).toHaveText('1');
      await expect(page.getByTestId('cart-link')).toHaveAccessibleName(
        'Kosár megnyitása, 1 termék',
      );
    });
  });
});
