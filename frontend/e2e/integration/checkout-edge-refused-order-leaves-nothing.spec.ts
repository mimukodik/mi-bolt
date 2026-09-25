// spec: specs/stock-order-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The stock-lost fault this scenario opens with. The mock reads `?mi-scenario=`
// when the document loads and holds it for the browsing context through in-app
// navigation: the first order request of that page load takes the whole stock of
// the cart's last line (another buyer got there first) and refuses the order
// with a 409 `OUT_OF_STOCK`, and every later catalogue, product and cart read
// sees that variant as sold out. A `page.goto` without the query would load the
// default scenario with a cart of its own (rule 12 of `e2e/seed.spec.ts`), so
// this scenario opens its first page with the query and every later move is a
// click.
const SCENARIO_QUERY = 'mi-scenario=stock-lost-once-order';

// The product page splits its buy chrome at this breakpoint: below 1024px
// `.cta-desktop` is `display: none` (the product page stylesheet) and the fixed
// `purchase-rail` carries the press through its `purchase-cta`; at 1024px and
// wider the in-flow block is the shown one and the rail is `display: none`.
// Both mounts stay in the DOM at either width and both read the page's single
// add state, so the viewport decides which one the test drives.
const BUY_BREAKPOINT_PX = 1024;

// The catalogue page size: one card per (product, storage) entry, 12 of them.
const DEFAULT_PAGE_SIZE = 12;

// The availability sentence the product page renders for a variant in stock.
const IN_STOCK_TEXT = 'Raktáron a demó készletben';

// The refusal copy `ReviewStep` renders for the order call's 409 `OUT_OF_STOCK`.
// It names neither the status nor the Problem code, and it promises that the
// contact data survives the trip back to the cart.
const STOCK_REFUSAL =
  'Egy vagy több termék közben elfogyott, ezért a rendelés nem jött létre. A kosárban javíthatod; a megadott adataid megmaradnak.';

test.describe('An order refused because stock ran out meanwhile', () => {
  test(
    '[E099] a refused order leaves no receipt, no used order number and no half-ordered cart',
    { tag: '@integration' },
    async ({ page }) => {
      const wideLayout = (page.viewportSize()?.width ?? 0) >= BUY_BREAKPOINT_PX;

      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const sort = page.getByTestId('catalog-sort');
      const cartBadge = page.getByTestId('cart-badge');
      const cartLines = page.getByTestId('cart-line');
      const cartCount = page.getByTestId('cart-count');
      const cartNotice = page.getByTestId('cart-notice');

      // The add control of the mount this viewport shows; `app-button` puts the
      // test id on its host element, so the press targets the native `button`
      // inside it.
      const addControl = wideLayout
        ? page.getByTestId('add-to-cart-button').getByRole('button')
        : page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button');

      // Every HUF amount renders through `PriceBlock.formatHuf`, whose thousands
      // separator is a non-breaking space, so the visible card prices are
      // compared by their digits rather than by a copied string.
      const readCardPriceAmounts = async (): Promise<number[]> => {
        const texts = await cards.getByTestId('price-amount').allTextContents();
        return texts.map((text) => Number.parseInt(text.replace(/\s/g, ''), 10));
      };

      // The order-call recorder: every `POST /api/v1/orders` the path makes, with
      // the status it answered. The path makes one at the refused submit in step
      // 8 and one at the corrected submit in step 11.
      const orderStatuses: number[] = [];
      page.on('response', (response) => {
        if (response.request().method() !== 'POST') return;
        if (!response.url().endsWith('/api/v1/orders')) return;
        orderStatuses.push(response.status());
      });

      // Both phone names, read off the cart's own lines in step 5 and never named
      // by slug or product name: the first line stays in the cart, the last one is
      // the line the refused order's stock reconcile drops.
      let keptPhoneName = '';
      let droppedPhoneName = '';

      // 1. Start from a fresh browser context (no stored cart or checkout
      // snapshot) and open the path
      // `/telefonok?sort=price_asc&mi-scenario=stock-lost-once-order` relative
      // to the Playwright baseURL. This is the first and only page load; every
      // later step moves by clicking and the page is never reloaded. Run the
      // story twice, at 1920x1080 and at 390x844.
      await test.step('1. Start from a fresh browser context (no stored cart or checkout snapshot) and open the path `/telefonok?sort=price_asc&mi-scenario=stock-lost-once-order` relative to the Playwright baseURL. This is the first and only page load; every later step moves by clicking and the page is never reloaded. Run the story twice, at 1920x1080 and at 390x844.', async () => {
        await page.goto(`/telefonok?sort=price_asc&${SCENARIO_QUERY}`);

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');

        // A select reads its selected option: the value plus the label that value
        // carries (`CatalogToolbar.sortLabel()`).
        await expect(sort).toHaveValue('price_asc');
        await expect(sort.locator('option[value="price_asc"]')).toHaveText('Ár szerint növekvő');
        await expect(cartBadge).toHaveText('0');

        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);
      });

      // 2. Click the `product-card-cta` of the first card without a
      // `product-card-stock` marker (the 69 990 Ft card) and add it with the add
      // control for the width (inner button of `add-to-cart-button` at 1024 px
      // and wider, inner button of `purchase-cta` below).
      await test.step('2. Click the `product-card-cta` of the first card without a `product-card-stock` marker (the 69 990 Ft card) and add it with the add control for the width (inner button of `add-to-cart-button` at 1024 px and wider, inner button of `purchase-cta` below).', async () => {
        // Picking by what the screen shows: an out-of-stock card carries the
        // "Elfogyott" `product-card-stock` marker, so the first card without one
        // is the phone the catalogue offers as buyable.
        const firstInStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(firstInStockCard).toBeVisible();
        await firstInStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText(IN_STOCK_TEXT);

        await addControl.click();
        await expect(cartBadge).toHaveText('1');
      });

      // 3. Return to the catalogue by clicking: at 1024 px and wider the header
      // link `Mobiltelefonok` inside `nav[aria-label="Fő navigáció"]`; below
      // 1024 px `menu-trigger` and then the `Mobiltelefonok` link inside the
      // `Menü` dialog's `Mobil navigáció` navigation.
      await test.step('3. Return to the catalogue by clicking: at 1024 px and wider the header link `Mobiltelefonok` inside `nav[aria-label="Fő navigáció"]`; below 1024 px `menu-trigger` and then the `Mobiltelefonok` link inside the `Menü` dialog\'s `Mobil navigáció` navigation.', async () => {
        if (wideLayout) {
          await page
            .getByRole('navigation', { name: 'Fő navigáció' })
            .getByRole('link', { name: 'Mobiltelefonok' })
            .click();
        } else {
          // The drawer is deferred until it opens (`@defer (when drawerOpen())`),
          // so the dialog is reached only after the trigger's press.
          await page.getByTestId('menu-trigger').click();
          const catalogueLink = page
            .getByRole('dialog', { name: 'Menü' })
            .getByRole('navigation', { name: 'Mobil navigáció' })
            .getByRole('link', { name: 'Mobiltelefonok' });
          await expect(catalogueLink).toBeVisible();
          await catalogueLink.click();
        }

        // The header link carries no query, and the scenario is already armed for
        // this page load: the address bar is the bare catalogue path.
        await expect(page).toHaveURL(/\/telefonok$/);
        await expect(cartBadge).toHaveText('1');
      });

      // 4. Set `catalog-sort` to `Ár szerint növekvő`, click the
      // `product-card-cta` of the second card without a `product-card-stock`
      // marker (the 89 990 Ft card) and add it with the add control for the
      // width.
      await test.step('4. Set `catalog-sort` to `Ár szerint növekvő`, click the `product-card-cta` of the second card without a `product-card-stock` marker (the 89 990 Ft card) and add it with the add control for the width.', async () => {
        await sort.selectOption('price_asc');
        await expect(sort).toHaveValue('price_asc');

        // While the sorted response is in flight the grid keeps the previous
        // page's cards on screen (the refreshing branch of `async-content.html`),
        // so the pick below reads the sorted list only once it settles: `toPass`
        // is the tool the seed names for a block that has to be retried
        // (e2e/seed.spec.ts, rule 4).
        await expect(async () => {
          const prices = await readCardPriceAmounts();
          expect(prices).toHaveLength(DEFAULT_PAGE_SIZE);
          expect(prices).toEqual([...prices].sort((a, b) => a - b));
        }).toPass();

        const secondInStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .nth(1);
        await expect(secondInStockCard).toBeVisible();
        await secondInStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText(IN_STOCK_TEXT);

        await addControl.click();
        await expect(cartBadge).toHaveText('2');
      });

      // 5. Click `cart-link`.
      await test.step('5. Click `cart-link`.', async () => {
        await page.getByTestId('cart-link').click();

        await expect(page).toHaveURL(/\/penztar\/kosar$/);
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(cartCount).toHaveText('Kosárban található termékek (2)');

        // Two lines in the order they were added: the 69 990 Ft phone first, the
        // 89 990 Ft phone last, one of each.
        await expect(cartLines).toHaveCount(2);
        await expect(cartLines.getByTestId('cart-line-quantity')).toHaveText(['1 db', '1 db']);
        await expect(cartLines.nth(0).getByTestId('price-amount')).toHaveText('69 990');
        await expect(cartLines.nth(1).getByTestId('price-amount')).toHaveText('89 990');

        // The two device prices together, which stays under the 300 000 Ft
        // cash-on-delivery limit the payment step checks.
        const subtotal = page.getByTestId('order-summary-subtotal');
        await expect(subtotal).toContainText('Részösszeg');
        await expect(subtotal.getByTestId('price-amount')).toHaveText('159 980');

        const cartContinue = page.getByTestId('cart-continue');
        await expect(cartContinue).toHaveCount(1);
        await expect(cartContinue.getByRole('button')).toBeEnabled();

        // Both names are read off the screen for the later steps' notice and card
        // lookup; neither phone is named by slug or product name.
        const firstName = cartLines.getByTestId('cart-line-name').nth(0);
        const secondName = cartLines.getByTestId('cart-line-name').nth(1);
        await expect(firstName).not.toBeEmpty();
        await expect(secondName).not.toBeEmpty();
        keptPhoneName = ((await firstName.textContent()) ?? '').trim();
        droppedPhoneName = ((await secondName.textContent()) ?? '').trim();
        expect(keptPhoneName).not.toBe('');
        expect(droppedPhoneName).not.toBe('');
      });

      // 6. Click `cart-continue`, fill `contact-fullname-input` with
      // `Teszt Elek`, `contact-email-input` with `teszt@example.test`,
      // `contact-phone-input` with `+36 30 123 4567`, then click
      // `contact-submit`.
      await test.step('6. Click `cart-continue`, fill `contact-fullname-input` with `Teszt Elek`, `contact-email-input` with `teszt@example.test`, `contact-phone-input` with `+36 30 123 4567`, then click `contact-submit`.', async () => {
        await page.getByTestId('cart-continue').getByRole('button').click();
        await expect(page).toHaveURL(/\/penztar\/adatok$/);

        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
      });

      // 7. Click the first `delivery-radio` (`Házhoz szállítás`), fill
      // `address-input-postalCode` with `1052`, `address-input-city` with
      // `Budapest`, `address-input-line1` with `Fő utca 1.`, click the second
      // `payment-radio` (`Utánvét`, 490 Ft), then click `delivery-confirm`.
      await test.step('7. Click the first `delivery-radio` (`Házhoz szállítás`), fill `address-input-postalCode` with `1052`, `address-input-city` with `Budapest`, `address-input-line1` with `Fő utca 1.`, click the second `payment-radio` (`Utánvét`, 490 Ft), then click `delivery-confirm`.', async () => {
        await page.getByTestId('delivery-radio').first().click();
        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Fő utca 1.');
        await page.getByTestId('payment-radio').nth(1).click();
        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-line')).toHaveCount(2);

        // Both phones plus the 490 Ft cash-on-delivery fee.
        const total = page.getByTestId('order-summary-total');
        await expect(total).toContainText('Végösszeg');
        await expect(total.getByTestId('price-amount')).toHaveText('160 470');
      });

      // 8. Tick `review-consent-terms-input` and click the inner button of
      // `review-submit`.
      await test.step('8. Tick `review-consent-terms-input` and click the inner button of `review-submit`.', async () => {
        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        await page.getByTestId('review-submit').getByRole('button').click();

        // The order is refused, so the browser stays on the review step and no
        // receipt is invented.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page).not.toHaveURL(/\/penztar\/siker/);
        await expect(page.getByTestId('order-receipt')).toHaveCount(0);

        // The refusal is the stock-error state: the banner carries the message
        // and the only way out is back to the cart.
        const stateBanner = page.getByTestId('review-state-banner');
        await expect(stateBanner).toContainText(STOCK_REFUSAL);
        const backToCart = stateBanner.getByTestId('review-stock-back-to-cart');
        await expect(backToCart.getByRole('button')).toHaveText('Vissza a kosárhoz');

        // The checkout chrome replaces the shop header on the checkout route:
        // no cart badge is on screen at all.
        await expect(cartBadge).toHaveCount(0);

        // The refused attempt is the path's only order call, and it answered 409.
        expect(orderStatuses).toEqual([409]);
      });

      // 9. Click the inner button of `review-stock-back-to-cart`.
      await test.step('9. Click the inner button of `review-stock-back-to-cart`.', async () => {
        await page.getByTestId('review-stock-back-to-cart').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/kosar$/);
        await expect(page.getByTestId('cart-page')).toBeVisible();

        // The cart's own stock reconcile dropped the line the refused order took
        // the stock of and named it: the cart's correction, not a half-order.
        await expect(cartCount).toHaveText('Kosárban található termékek (1)');
        await expect(cartNotice).toHaveText(
          `${droppedPhoneName} kikerült a kosárból, mert már nem kapható.`,
        );

        // Only the kept phone is left as a line, one of it, at its own price; the
        // dropped phone is not a line the page could offer to remove any more.
        await expect(cartLines).toHaveCount(1);
        await expect(cartLines.filter({ hasText: droppedPhoneName })).toHaveCount(0);
        await expect(cartLines.getByTestId('cart-line-name')).toHaveText(keptPhoneName);
        await expect(cartLines.getByTestId('cart-line-quantity')).toHaveText('1 db');
        await expect(cartLines.getByTestId('price-amount')).toHaveText('69 990');

        // No receipt and no order number came out of the refused attempt.
        await expect(page.getByTestId('order-receipt')).toHaveCount(0);
        await expect(page.getByText(/DEMO-\d+/)).toHaveCount(0);

        const cartContinue = page.getByTestId('cart-continue');
        await expect(cartContinue).toHaveCount(1);
        await expect(cartContinue.getByRole('button')).toBeEnabled();
        await expect(cartBadge).toHaveCount(0);
      });

      // 10. Click `cart-continue` and walk the steps again: `contact-submit`,
      // then `delivery-confirm`.
      await test.step('10. Click `cart-continue` and walk the steps again: `contact-submit`, then `delivery-confirm`.', async () => {
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        // The contact data the shopper typed before the refusal is still there;
        // the phone is shown in the schema's normalised form.
        await expect(page.getByTestId('contact-fullname-input')).toHaveValue('Teszt Elek');
        await expect(page.getByTestId('contact-email-input')).toHaveValue('teszt@example.test');
        await expect(page.getByTestId('contact-phone-input')).toHaveValue('+36301234567');

        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        // The address and both selections survived the trip back to the cart too.
        await expect(page.getByTestId('address-input-postalCode')).toHaveValue('1052');
        await expect(page.getByTestId('address-input-city')).toHaveValue('Budapest');
        await expect(page.getByTestId('address-input-line1')).toHaveValue('Fő utca 1.');
        await expect(page.getByTestId('delivery-radio').first()).toBeChecked();
        await expect(page.getByTestId('payment-radio').nth(1)).toBeChecked();

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-line')).toHaveCount(1);

        // The kept phone plus the 490 Ft cash-on-delivery fee.
        const total = page.getByTestId('order-summary-total');
        await expect(total).toContainText('Végösszeg');
        await expect(total.getByTestId('price-amount')).toHaveText('70 480');
      });

      // 11. Tick `review-consent-terms-input` and click the inner button of
      // `review-submit`.
      await test.step('11. Tick `review-consent-terms-input` and click the inner button of `review-submit`.', async () => {
        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        await page.getByTestId('review-submit').getByRole('button').click();

        // The corrected order went through: the receipt's own route, with the
        // order's UUID in the address bar.
        await expect(page).toHaveURL(
          /\/penztar\/siker\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        const receipt = page.getByTestId('order-receipt');
        await expect(receipt).toHaveCount(1);

        // The refused attempt used up no order number: the first number the shop
        // issues is the corrected order's own.
        await expect(page.getByTestId('receipt-order-number')).toHaveText('DEMO-000001');

        const receiptLines = page.getByTestId('receipt-line');
        await expect(receiptLines).toHaveCount(1);
        await expect(receiptLines).toContainText('Mennyiség');
        await expect(receiptLines).toContainText('1 db');
        await expect(receiptLines).toContainText('Sor végösszeg');
        await expect(receiptLines.getByTestId('price-amount')).toHaveText('69 990');

        // The receipt's own summary of the corrected order.
        const subtotalRow = receipt.getByTestId('receipt-row-subtotal');
        await expect(subtotalRow).toContainText('Részösszeg');
        await expect(subtotalRow.getByTestId('price-amount')).toHaveText('69 990');
        const shippingRow = receipt.getByTestId('receipt-row-shipping');
        await expect(shippingRow.getByTestId('price-amount')).toHaveText('0');
        const paymentFeeRow = receipt.getByTestId('receipt-row-payment-fee');
        await expect(paymentFeeRow.getByTestId('price-amount')).toHaveText('490');
        const totalRow = receipt.getByTestId('receipt-row-total');
        await expect(totalRow.getByTestId('price-amount')).toHaveText('70 480');
        const paymentRow = receipt.getByTestId('receipt-row-payment');
        await expect(paymentRow).toContainText('Utánvét');
        const deliveryRow = receipt.getByTestId('receipt-row-delivery');
        await expect(deliveryRow).toContainText('Házhoz szállítás');

        await expect(cartBadge).toHaveCount(0);
      });

      // 12. Open the dropped phone's page from the catalogue by clicking: click
      // `back-to-shop` (`Vissza a shopba`), set `catalog-sort` to
      // `Ár szerint növekvő`, then click the `product-card-cta` of the card
      // whose `product-card-stock` marker reads `Elfogyott` (the 89 990 Ft card).
      await test.step("12. Open the dropped phone's page from the catalogue by clicking: click `back-to-shop` (`Vissza a shopba`), set `catalog-sort` to `Ár szerint növekvő`, then click the `product-card-cta` of the card whose `product-card-stock` marker reads `Elfogyott` (the 89 990 Ft card).", async () => {
        await page.getByTestId('back-to-shop').click();

        await expect(page).toHaveURL(/\/telefonok$/);
        await expect(cards.first()).toBeVisible();

        await sort.selectOption('price_asc');
        await expect(sort).toHaveValue('price_asc');

        // The other buyer's order took the dropped phone's stock: the catalogue
        // card of the phone the cart let go of now carries the "Elfogyott"
        // marker. Asserted on the catalogue card, before the click that leaves
        // the catalogue.
        const droppedPhoneCard = cards.filter({ hasText: droppedPhoneName });
        await expect(droppedPhoneCard).toHaveCount(1);
        const droppedPhoneStock = droppedPhoneCard.getByTestId('product-card-stock');
        await expect(droppedPhoneStock).toHaveText('Elfogyott');

        await droppedPhoneCard.getByTestId('product-card-cta').click();
      });
    },
  );
});
