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

// The in-stock line `product-stock` reads (`stockMessage` in product-page.ts);
// anything else means the selected configuration is out of stock.
const IN_STOCK_TEXT = 'Raktáron a demó készletben';

test.describe('Shop: cart, context and receipt stories', () => {
  test(
    '[E054] two variants of one phone become two cart lines',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;

      const cards = page.getByTestId('product-card');
      const productName = page.getByTestId('product-name');
      const productStock = page.getByTestId('product-stock');
      const colourGroup = page.getByTestId('variant-color-group');
      const storageGroup = page.getByTestId('variant-storage-group');
      const colourOptions = colourGroup.locator('button[data-testid^="variant-color-"]');
      const storageOptions = storageGroup.locator('button[data-testid^="variant-storage-"]');
      // The "Készülékár" block inside the product's own `Árak` region: the
      // related cards and the purchase rail carry other price blocks.
      const devicePrice = page
        .getByRole('region', { name: 'Árak', exact: true })
        .getByTestId('price-amount');
      const cartLines = page.getByTestId('cart-line');

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

      /** The digits of a `price-amount` as an integer. */
      const priceOf = async (target: Locator): Promise<number> =>
        Number((await textOf(target)).replace(/\D/g, ''));

      /** The text of the option pressed in a variant group. The pressed button
       *  is resolved once, by its own test id: a locator filtered on
       *  `aria-pressed="true"` re-resolves on every use, so a one-shot read off
       *  it can hand back the option that was pressed before the last click
       *  (the sibling edge-path spec carries the same rule). */
      const selectedOption = async (group: Locator): Promise<string> => {
        const pressed = group.locator('button[aria-pressed="true"]').first();
        const testId = (await pressed.getAttribute('data-testid')) ?? '';
        expect(testId).not.toBe('');
        return textOf(group.getByTestId(testId));
      };

      /** A cart line's variant label, "<colour> · <storage> GB", rebuilt from
       *  the two spans the template splits it into (cart-line.html). */
      const variantLabelOf = async (line: Locator): Promise<string> =>
        `${await textOf(line.locator('.variant-color'))} · ${await textOf(line.locator('.variant-storage'))}`;

      let phoneName = '';
      let firstColour = '';
      let firstStorage = '';
      let price1 = 0;
      let secondColour = '';
      let secondStorage = '';
      let price2 = 0;

      // 1. Open `/telefonok` and wait for the grid (at least one `product-card`). Open the first `product-card` with no `product-card-stock` marker whose `product-card-swatches` group holds two or more `product-card-swatch` buttons, through its `product-card-cta`.
      await test.step('1. Open `/telefonok` and wait for the grid (at least one `product-card`). Open the first `product-card` with no `product-card-stock` marker whose `product-card-swatches` group holds two or more `product-card-swatch` buttons, through its `product-card-cta`.', async () => {
        await page.goto('/telefonok');
        await expect(cards.first()).toBeVisible();

        // An in-stock card carries no `product-card-stock` marker; the swatch
        // group appears only when the item offers more than one colour
        // (`product-card.html`), so a card with two or more swatch buttons is
        // the one whose variants the scenario needs.
        const cardCount = await cards.count();
        let pickedIndex = -1;
        for (let i = 0; i < cardCount; i++) {
          const card = cards.nth(i);
          if ((await card.getByTestId('product-card-stock').count()) > 0) continue;
          if ((await card.getByTestId('product-card-swatch').count()) < 2) continue;
          pickedIndex = i;
          break;
        }
        expect(pickedIndex).toBeGreaterThanOrEqual(0);

        // The card's CTA carries the exact variant as `?variant=`, which the
        // product page then shows.
        const cta = cards.nth(pickedIndex).getByTestId('product-card-cta');
        const ctaHref = await cta.getAttribute('href');
        const cardVariant = new URL(ctaHref ?? '', page.url()).searchParams.get('variant');
        expect(cardVariant).not.toBeNull();

        await cta.click();
        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(productName).not.toBeEmpty();
        await expect.poll(() => new URL(page.url()).searchParams.get('variant')).toBe(cardVariant);
        phoneName = await textOf(productName);

        // Whichever axis offers more than one option is the one the two
        // variants are taken from: the colour group here, the storage group for
        // a single-colour phone.
        const colourOptionCount = await colourOptions.count();
        const storageOptionCount = await storageOptions.count();
        expect(colourOptionCount > 1 || storageOptionCount > 1).toBe(true);
      });

      // 2. Read the product page's first variant and add it.
      await test.step('2. Read the product page\'s first variant and add it: note the "Készülékár" `price-amount` (call it P1) and the selected colour and storage, then press the add control of the mount the viewport shows (the inner button of `add-to-cart-button` at 1024 px and wider, `purchase-cta` below 1024 px).', async () => {
        await expect(productStock).toHaveText(IN_STOCK_TEXT);
        await expect(devicePrice).toBeVisible();
        await expect(addControl()).toBeEnabled();

        // The reads come after the assertions above proved the first variant's
        // own state rendered.
        price1 = await priceOf(devicePrice);
        firstColour = await selectedOption(colourGroup);
        firstStorage = await selectedOption(storageGroup);
        expect(price1).toBeGreaterThan(0);

        await addControl().click();
        await expect(confirmation()).toContainText(
          `${phoneName}, ${firstColour}, ${firstStorage} – 1 darab a kosárban.`,
        );
        await expect(page.getByTestId('cart-badge')).toHaveText('1');
      });

      // 3. Choose a second variant of the same phone.
      await test.step('3. Choose a second variant of the same phone: press a different-colour `variant-color-*` button whose `aria-pressed` is "false", or a different-storage `variant-storage-*` button whose `aria-pressed` is "false" — one that is not disabled. If `product-stock` then reads "Ez a konfiguráció elfogyott a demó készletből.", choose another such option until an in-stock one is selected.', async () => {
        // The colour axis is tried first (the picked card brought a swatch
        // group), the storage axis after it, so a colour the scenario turns out
        // to be unable to keep in stock still leaves the storage axis to take
        // the second variant from.
        //
        // Each axis carries the label of the option it is on: the one the
        // selection sits on before the presses below, read off that button by
        // its own test id, and then the label of the button a press lands on.
        // A locator filtered on `aria-pressed="true"` re-resolves on every use,
        // so a read off it after a press can hand back the option that was
        // pressed before the press.
        const colourAxis = {
          group: colourGroup,
          options: colourOptions,
          selected: await selectedOption(colourGroup),
        };
        const storageAxis = {
          group: storageGroup,
          options: storageOptions,
          selected: await selectedOption(storageGroup),
        };
        const axes = [colourAxis, storageAxis];

        let chosen = false;
        for (const axis of axes) {
          const optionCount = await axis.options.count();
          for (let i = 0; i < optionCount; i++) {
            const option = axis.options.nth(i);
            if ((await option.getAttribute('aria-pressed')) === 'true') continue;
            if (await option.isDisabled()) continue;

            await option.click();
            await expect(option).toHaveAttribute('aria-pressed', 'true');

            // The press landed, so this button carries the group's selection
            // from here on, in stock or not, and the label is read off it — the
            // button that was clicked, never off the re-resolving
            // `aria-pressed="true"` locator.
            const optionText = await textOf(option);
            axis.selected = optionText;

            // An out-of-stock configuration leaves the price unreadable, so the
            // next candidate is tried until one is in stock.
            if ((await textOf(productStock)) !== IN_STOCK_TEXT) continue;

            // The chosen option's own group names the new choice: "Szín:
            // <name>" or "Tárhely: <n> GB" (variant-selector.html).
            await expect(axis.group.locator('legend')).toContainText(optionText);
            chosen = true;
            break;
          }
          if (chosen) break;
        }
        expect(chosen).toBe(true);

        await expect(productStock).toHaveText(IN_STOCK_TEXT);
        await expect(devicePrice).not.toBeEmpty();

        // Each label is the one its axis already holds — the button the press
        // landed on, or the button the selection was on when the step began.
        secondColour = colourAxis.selected;
        secondStorage = storageAxis.selected;
        price2 = await priceOf(devicePrice);
        expect(price2).toBeGreaterThan(0);
      });

      // 4. Press the add control of the mount the viewport shows for this second variant, without touching the selection afterwards.
      await test.step('4. Press the add control of the mount the viewport shows for this second variant, without touching the selection afterwards.', async () => {
        await expect(addControl()).toBeEnabled();
        await addControl().click();

        await expect(confirmation()).toContainText(
          `${phoneName}, ${secondColour}, ${secondStorage} – 1 darab a kosárban.`,
        );
        await expect(page.getByTestId('cart-badge')).toHaveText('2');
      });

      // 5. Open the cart with the header's `cart-link`.
      await test.step("5. Open the cart with the header's `cart-link`.", async () => {
        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();

        await expect(cartLines).toHaveCount(2);
        await expect(cartLines.nth(0).getByTestId('cart-line-name')).toHaveText(phoneName);
        await expect(cartLines.nth(1).getByTestId('cart-line-name')).toHaveText(phoneName);

        // The two variants are two separate lines, not one merged line: the
        // cart keeps the order they were added in, and each line's variant
        // label is its own colour and storage.
        const firstLabel = await variantLabelOf(cartLines.nth(0));
        const secondLabel = await variantLabelOf(cartLines.nth(1));
        expect(firstLabel).toBe(`${firstColour} · ${firstStorage}`);
        expect(secondLabel).toBe(`${secondColour} · ${secondStorage}`);
        expect(firstLabel).not.toBe(secondLabel);

        await expect(cartLines.nth(0).getByTestId('cart-line-quantity')).toHaveText('1 db');
        await expect(cartLines.nth(1).getByTestId('cart-line-quantity')).toHaveText('1 db');

        expect(await priceOf(cartLines.nth(0).getByTestId('price-amount'))).toBe(price1);
        expect(await priceOf(cartLines.nth(1).getByTestId('price-amount'))).toBe(price2);

        await expect(page.getByTestId('cart-count')).toHaveText('Kosárban található termékek (2)');
        await expect(page.getByTestId('cart-continue').getByRole('button')).toBeEnabled();
      });

      // 6. Read the cart's totals.
      await test.step("6. Read the cart's totals.", async () => {
        const subtotal = page.getByTestId('order-summary-subtotal').getByTestId('price-amount');
        await expect(subtotal).toBeVisible();

        // The subtotal is exactly the two unit prices read from the lines.
        expect(await priceOf(subtotal)).toBe(price1 + price2);

        // The shipping fee is chosen on the delivery step, so the total still
        // shows the "Végösszeg" placeholder rather than an amount.
        const total = page.getByTestId('order-summary-total');
        await expect(total).toContainText('Végösszeg');
        await expect(total.getByTestId('price-empty')).toHaveText('—');
        await expect(total).toContainText('Nincs megjeleníthető ár.');
        await expect(total.getByTestId('price-amount')).toHaveCount(0);

        // No line is duplicated, merged or re-priced: still the two variants
        // with the two unit prices read above.
        await expect(cartLines).toHaveCount(2);
        expect(await priceOf(cartLines.nth(0).getByTestId('price-amount'))).toBe(price1);
        expect(await priceOf(cartLines.nth(1).getByTestId('price-amount'))).toBe(price2);
      });
    },
  );
});
