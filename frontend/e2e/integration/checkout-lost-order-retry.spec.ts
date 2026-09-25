// spec: specs/checkout-lost-paths.md
// seed: e2e/seed.spec.ts

import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures/coverage';

// The product page mounts its purchase call to action twice; below 1024px the
// desktop CTA column (`.cta-desktop`) is `display: none` (the product page
// stylesheet) and the sticky `purchase-rail` carries the press through its
// `purchase-cta`, with the confirmation in the rail's own status; at 1024px
// and wider the `add-to-cart-button` and the status inside `.cta-desktop` are
// the shown mounts. Both stay in the DOM at either width, so the viewport
// decides which one a test drives.
const DESKTOP_MIN_WIDTH = 1024;

// The mock refuses cash on delivery above this cart total
// (CASH_ON_DELIVERY_MAX_CART_HUF), so the ordered card is picked below it.
const CASH_ON_DELIVERY_CEILING = 300_000;

// The fault query every `page.goto` of this scenario keeps: the mock reads
// `?mi-scenario=` when the document loads, so a goto without it would load the
// default scenario and a cart of its own (rule 12 of `e2e/seed.spec.ts`).
const SCENARIO_QUERY = 'mi-scenario=lost-once-order';

test.describe('Checkout: an answer lost after the commit', () => {
  test(
    '[E064] a retried order after a lost answer gives the same DEMO number',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;

      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const catalogGrid = page.getByTestId('catalog-grid');
      const productPage = page.getByTestId('product-page');
      const stockLabel = page.getByTestId('product-stock');
      const cartPage = page.getByTestId('cart-page');
      const cartLines = page.getByTestId('cart-line');
      const emptyState = page.getByTestId('empty-state');
      const reasonBanner = page.getByTestId('navigation-reason');

      // The first card is the one every step below uses.
      const card = cards.first();

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

      /** The text of the option pressed in a variant group. */
      const selectedOptionText = async (groupId: string): Promise<string> => {
        const group = page.getByTestId(groupId);
        return textOf(group.locator('button[aria-pressed="true"]').first());
      };

      // The ordered variant, read off the screens and never pinned: the
      // confirmation, the review line and the receipt all have to name this
      // phone's own variant, and step 10 reopens the product page the card's
      // own link points at.
      let orderedVariantPath = '';
      let orderedName = '';
      let orderedColour = '';
      let orderedStorage = '';
      // The Végösszeg the review summary showed, which step 8 checks the
      // receipt against.
      let reviewTotalText = '';

      // 1. Open `/telefonok?mi-scenario=lost-once-order` and wait for the grid
      // (`catalog-grid` with a `product-card`).
      await test.step('1. Open `/telefonok?mi-scenario=lost-once-order` and wait for the grid (`catalog-grid` with a `product-card`).', async () => {
        await page.goto(`/telefonok?${SCENARIO_QUERY}`);

        await expect(catalogGrid).toBeVisible();
        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);

        // The picked card: the first card, in stock (no `product-card-stock`
        // marker) and at or below the cash-on-delivery ceiling, so the delivery
        // step can offer "Utánvét".
        await expect(card).toBeVisible();
        await expect(card.getByTestId('product-card-stock')).toHaveCount(0);
        await expect(card.getByRole('heading', { level: 3 })).not.toBeEmpty();
        // The card's variant line reads "<colour> · <n> GB".
        await expect(card.locator('p.variant .variant__color')).not.toBeEmpty();
        await expect(card.locator('p.variant .variant__storage')).toHaveText(/^\d+ GB$/);

        // The "Egyszeri készülékár" block: the digits sit in `price-amount` and
        // the "Ft" glyph is the separate span beside them.
        const cardPrice = card.getByTestId('price-amount');
        await expect(cardPrice).toHaveText('89 990');
        await expect(card.locator('app-price-block')).toContainText('Egyszeri készülékár');
        await expect(card.locator('app-price-block')).toContainText('Ft');
        expect(await priceOf(cardPrice)).toBeLessThanOrEqual(CASH_ON_DELIVERY_CEILING);

        // The card's own link carries the variant ordered below, so step 10
        // reopens that product page without naming the phone.
        orderedVariantPath =
          (await card.getByTestId('product-card-cta').getAttribute('href')) ?? '';
        expect(orderedVariantPath).not.toBe('');
      });

      // 2. Open it through that card's `product-card-cta` ("Megnézem").
      await test.step('2. Open it through that card\'s `product-card-cta` ("Megnézem").', async () => {
        await card.getByTestId('product-card-cta').click();

        await expect(productPage).toBeVisible();
        await expect(stockLabel).toHaveText('Raktáron a demó készletben');

        // The "Készülékár" block is the price inside the product's own `Árak`
        // region; the related cards outside it carry a different label.
        const pricesRegion = page.getByRole('region', { name: 'Árak', exact: true });
        await expect(pricesRegion.getByTestId('price-amount')).toHaveText('89 990');

        // The name and the selected variant are read off the screen, so the
        // confirmation and the receipt are checked against what it shows.
        orderedName = await textOf(page.getByTestId('product-name'));
        expect(orderedName).not.toBe('');
        orderedColour = await selectedOptionText('variant-color-group');
        orderedStorage = await selectedOptionText('variant-storage-group');
      });

      // 3. Add the variant with the control the width shows.
      await test.step('3. Add the variant with the control the width shows: at 1024 px and wider the inner button of `add-to-cart-button` ("Kosárba teszem"); below 1024 px the inner button of the `purchase-rail` element `purchase-cta` (also "Kosárba teszem").', async () => {
        await expect(addControl()).toBeEnabled();
        await addControl().click();

        // The confirmation names the phone with its own colour and storage.
        await expect(confirmation()).toContainText(
          `${orderedName}, ${orderedColour}, ${orderedStorage} – 1 darab a kosárban.`,
        );

        // The mount this width does not show stays in the DOM but is hidden, so
        // only one set of purchase controls is on screen.
        if (narrowViewport) {
          await expect(page.getByTestId('add-to-cart-button')).toBeHidden();
        } else {
          await expect(page.getByTestId('purchase-rail')).toBeHidden();
        }
      });

      // 4. Open the cart with the header's `cart-link` and read the page.
      await test.step("4. Open the cart with the header's `cart-link` and read the page.", async () => {
        await page.getByTestId('cart-link').click();

        await expect(cartPage).toBeVisible();
        await expect(cartLines).toHaveCount(1);
        await expect(page.getByTestId('cart-line-quantity')).toHaveText('1 db');
        await expect(page.getByTestId('cart-count')).toHaveText('Kosárban található termékek (1)');

        // The checkout layout carries no header badge, only the step indicator.
        await expect(page.getByTestId('cart-badge')).toHaveCount(0);
        await expect(page.getByTestId('checkout-steps')).toBeVisible();
      });

      // 5. Press `cart-continue` ("Tovább az adatokhoz"), fill the contact step
      // and press the inner button of `contact-submit` ("Tovább a
      // szállításhoz").
      await test.step('5. Press `cart-continue` ("Tovább az adatokhoz"), fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567", and press the inner button of `contact-submit` ("Tovább a szállításhoz").', async () => {
        await page.getByTestId('cart-continue').getByRole('button').click();

        const contactPage = page.getByTestId('contact-page');
        await expect(contactPage).toBeVisible();
        const contactHeading = contactPage.getByRole('heading', { level: 1 });
        await expect(contactHeading).toHaveText('Kapcsolattartási adatok');

        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await expect(page.getByTestId('contact-submit').getByRole('button')).toBeEnabled();
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        const deliveryStep = page.getByTestId('delivery-step');
        await expect(deliveryStep).toBeVisible();
        const deliveryHeading = deliveryStep.getByRole('heading', { level: 1 });
        await expect(deliveryHeading).toHaveText('Átvétel és fizetés');
      });

      // 6. Fill the delivery step and press the inner button of
      // `delivery-confirm` ("Tovább az ellenőrzéshez").
      await test.step('6. On the delivery step choose "Házhoz szállítás" by its `delivery-radio`, fill "1052", "Budapest" and "Fő utca 1." into `address-input-postalCode`, `address-input-city` and `address-input-line1`, keep the "A számlázási cím megegyezik a szállítási címmel" tick (`billing-same-as-delivery`), choose "Utánvét" by its `payment-radio` and press the inner button of `delivery-confirm` ("Tovább az ellenőrzéshez").', async () => {
        const homeDeliveryRadio = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' })
          .getByTestId('delivery-radio');
        await homeDeliveryRadio.click();
        await expect(homeDeliveryRadio).toBeChecked();

        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Fő utca 1.');
        await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();

        const cashOnDeliveryRadio = page
          .getByTestId('payment-option')
          .filter({ hasText: 'Utánvét' })
          .getByTestId('payment-radio');
        // The card was picked at or below the mock's cash-on-delivery ceiling,
        // so this option is offered and can be chosen.
        await expect(cashOnDeliveryRadio).toBeEnabled();
        await cashOnDeliveryRadio.click();
        await expect(cashOnDeliveryRadio).toBeChecked();

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        const reviewPage = page.getByTestId('review-page');
        await expect(reviewPage).toBeVisible();
        const reviewHeading = reviewPage.getByRole('heading', { level: 1 });
        await expect(reviewHeading).toHaveText('Minden rendben?');

        await expect(page.getByTestId('review-payment')).toHaveText('Utánvét');
        await expect(page.getByTestId('review-delivery')).toContainText('Házhoz szállítás');
        await expect(page.getByTestId('review-items').getByTestId('review-line')).toHaveCount(1);
        await expect(page.getByTestId('review-line-quantity')).toHaveText('1 × 89 990 Ft');

        // The summary's rows, read inside `review-summary` so the cart's own
        // summary elsewhere on the screen cannot answer for them.
        const summary = page.getByTestId('review-summary');
        const subtotalRow = summary.getByTestId('order-summary-subtotal');
        const shippingRow = summary.getByTestId('order-summary-shipping');
        const paymentFeeRow = summary.getByTestId('order-summary-payment-fee');
        const totalRow = summary.getByTestId('order-summary-total');

        await expect(subtotalRow).toContainText('Részösszeg');
        await expect(subtotalRow.getByTestId('price-amount')).toHaveText('89 990');
        await expect(shippingRow).toContainText('Szállítási díj');
        await expect(shippingRow.getByTestId('price-amount')).toHaveText('0');
        await expect(paymentFeeRow).toContainText('Fizetési díj');
        await expect(paymentFeeRow.getByTestId('price-amount')).toHaveText('490');
        await expect(totalRow).toContainText('Végösszeg');
        await expect(totalRow.getByTestId('price-amount')).toHaveText('90 480');

        // The Végösszeg noted here is the total the lost order committed with.
        reviewTotalText = await textOf(totalRow.getByTestId('price-amount'));
      });

      // 7. Tick `review-consent-terms-input` and press the inner button of
      // `review-submit` once: the order commits and its answer is lost.
      await test.step('7. Tick `review-consent-terms-input` ("Elfogadom a demó rendelési feltételeit.") and press the inner button of `review-submit` ("Demórendelés véglegesítése") once: this is the row\'s "Commit silently", where the order commits and its answer is lost on the way back.', async () => {
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
        const changePayment = failure.getByTestId('review-change-payment');
        await expect(changePayment).toHaveText('Fizetési mód módosítása');
        await expect(page.getByTestId('review-state-banner')).toHaveText(
          'A rendelés leadása nem sikerült.',
        );

        // Nothing is lost on screen: the whole draft stays, including the tick.
        await expect(page.getByTestId('review-items').getByTestId('review-line')).toHaveCount(1);
        await expect(page.getByTestId('review-summary')).toBeVisible();
        const reviewContact = page.getByTestId('review-contact');
        await expect(reviewContact).toContainText('Teszt Elek');
        await expect(reviewContact).toContainText('teszt@example.test');
        await expect(reviewContact).toContainText('+36301234567');
        await expect(termsConsent).toBeChecked();
      });

      // 8. Press the inner button of `review-submit` again ("Retry same
      // request").
      await test.step('8. Press the inner button of `review-submit` again ("Retry same request").', async () => {
        await page.getByTestId('review-submit').getByRole('button').click();

        // The retry took the replayed receipt of the order the first press
        // committed.
        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        await expect(page.getByTestId('order-receipt')).toBeVisible();
        await expect(page.getByTestId('success-heading')).toHaveText('Elkészült a demórendelésed.');
        await expect(page.getByTestId('success-check')).toBeVisible();
        await expect(page.getByTestId('receipt-demo-badge')).toHaveText('DEMO');

        // The session's own order counter reads its first value, which is the
        // screen's statement that exactly one order was created (a second
        // committed order would read "DEMO-000002").
        await expect(page.getByTestId('receipt-order-number')).toHaveText('DEMO-000001');

        // The receipt's total is the Végösszeg the review page showed.
        const receiptTotal = page.getByTestId('receipt-row-total').getByTestId('price-amount');
        await expect(receiptTotal).toHaveText(reviewTotalText);
        await expect(page.getByTestId('receipt-row-payment')).toContainText('Utánvét');

        const receiptLines = page.getByTestId('receipt-lines');
        await expect(receiptLines.getByTestId('receipt-line')).toHaveCount(1);
        await expect(receiptLines).toContainText(orderedName);
        await expect(receiptLines).toContainText(orderedColour);
        await expect(receiptLines).toContainText(orderedStorage);
        await expect(receiptLines).toContainText('1 db');
        await expect(receiptLines.getByTestId('price-amount')).toHaveText('89 990');
        await expect(receiptLines).toContainText('Ft');

        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );
        await expect(page.getByTestId('receipt-simulation-notice')).toHaveText(
          'Demó figyelmeztetés. A demórendelés elkészült. Nem történt valódi fizetés, rendelésküldés vagy e-mail-küldés.',
        );
      });

      // 9. The single order closed the cart and no second one can be placed.
      await test.step('9. Check that the single order closed the cart and that no second one can be placed: open `/penztar/kosar?mi-scenario=lost-once-order` as a fresh page load (every `page.goto` keeps the query, per rule 12 of `e2e/seed.spec.ts`), then open the review step the same way at `/penztar/ellenorzes?mi-scenario=lost-once-order`.', async () => {
        await page.goto(`/penztar/kosar?${SCENARIO_QUERY}`);

        // The committed order emptied the cart.
        await expect(cartPage).toBeVisible();
        await expect(cartLines).toHaveCount(0);
        await expect(
          emptyState.getByRole('heading', { name: 'A kosarad még üres.' }),
        ).toBeVisible();
        await expect(
          emptyState.getByText('Nézd meg a demókészülékeket, és válaszd ki a kedvenced.'),
        ).toBeVisible();
        await expect(emptyState.getByRole('button', { name: 'Telefonokat nézek' })).toBeVisible();

        await page.goto(`/penztar/ellenorzes?${SCENARIO_QUERY}`);

        // The wizard refuses the review step from an empty cart, so the one
        // committed order cannot be placed a second time.
        await expect(page).toHaveURL(/\/penztar\/kosar\?navigationReason=empty-cart$/);
        await expect(reasonBanner).toBeVisible();
        await expect(reasonBanner).toContainText('A kosarad üres, ezért ide irányítottunk.');
        await expect(cartPage).toBeVisible();
        await expect(page.getByTestId('review-page')).toHaveCount(0);
      });

      // 10. The ordered variant is still shown in stock, read by the only stock
      // vocabulary the screen carries.
      await test.step("10. Check the phone's stock by what the screen can show: reopen the ordered variant's product page and the catalogue with the query kept (`/telefonok/<slug>?variant=<id>&mi-scenario=lost-once-order` and `/telefonok?mi-scenario=lost-once-order`) and read the stock statements the screen carries.", async () => {
        await page.goto(`${orderedVariantPath}&${SCENARIO_QUERY}`);

        await expect(productPage).toBeVisible();
        await expect(stockLabel).toHaveText('Raktáron a demó készletben');

        await page.goto(`/telefonok?${SCENARIO_QUERY}`);

        await expect(catalogGrid).toBeVisible();
        await expect(cards).toHaveCount(12);

        // The same card step 1 picked and step 3 ordered, still without the
        // "Elfogyott" marker: the one committed order did not take it off the
        // screen's stock.
        await expect(card.getByTestId('product-card-cta')).toHaveAttribute(
          'href',
          orderedVariantPath,
        );
        await expect(card.getByTestId('product-card-stock')).toHaveCount(0);

        // The screen carries no stock number anywhere: `product-stock` and
        // `product-card-stock` are its whole stock vocabulary, so the row's
        // "stock decremented once" has no screen surface, and the check this
        // scenario makes is the availability one asserted above.
      });
    },
  );
});
