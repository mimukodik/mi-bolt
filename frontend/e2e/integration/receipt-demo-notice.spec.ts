// spec: specs/receipt-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// Below 1024px the desktop CTA column (`.cta-desktop`) is `display: none`
// (product-page.scss) and the sticky `purchase-rail` carries the same press
// through its `purchase-cta`, with the confirmation inside the rail's own
// `app-status-message`; at 1024px and above the `add-to-cart-button` inside
// `.cta-desktop` is the shown mount and the confirmation sits beside it. Both
// mounts stay in the DOM at either width, so the viewport decides which one the
// test drives.
const DESKTOP_MIN_WIDTH = 1024;

// The mock namespaces one sessionStorage entry per scenario name. This scenario
// runs on the default one, so the entry is `mi-bolt.snapshot.default`.
const SNAPSHOT_KEY = 'mi-bolt.snapshot.default';

// The values the contact step is typed with. None of them may appear in the
// page text or in the persisted snapshot: the phone is listed both as typed and
// as the review step normalises it.
const TYPED_STRINGS = [
  'Teszt Elek',
  'teszt.elek@example.test',
  '+36 30 123 4567',
  '+36301234567',
  'Váci utca 12.',
];

interface StoredAddress {
  postalCode: string;
  city: string;
  line1: string;
}

interface StoredReceiptFacts {
  contactEmail: string;
  billingName: string;
  billingAddress: StoredAddress;
  deliveryAddress: StoredAddress;
}

test.describe('The receipt: a demo order, read back without personal data', () => {
  test(
    '[E101] the success page shows a DEMO order number and says no real order, payment or e-mail happened',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;

      // The add control and its confirmation live in the mount the viewport
      // shows: the desktop `add-to-cart-button` block at 1024px and wider, the
      // sticky rail's `purchase-cta` below it.
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      const confirmationMessage = narrowViewport
        ? page.getByTestId('purchase-rail').locator('app-status-message')
        : page.locator('.cta-desktop').locator('app-status-message');
      // The catalogue's cards, kept for both the scan and the press that opens
      // the chosen one.
      const cards = page.getByTestId('product-card');

      // Every order write the page makes, recorded from before the order is
      // placed: the receipt proves the order was created by exactly one
      // `POST /api/v1/orders` that answered 201 Created. No order request is
      // made by the earlier steps, so arming here is the same as arming at the
      // submit.
      const orderRequests: { method: string; url: string }[] = [];
      const orderResponseStatuses: number[] = [];
      page.on('request', (request) => {
        if (!request.url().includes('/api/v1/orders')) return;
        orderRequests.push({ method: request.method(), url: request.url() });
      });
      page.on('response', (response) => {
        if (!response.url().includes('/api/v1/orders')) return;
        orderResponseStatuses.push(response.status());
      });

      // Read off the screens, never pinned: the confirmation and the receipt
      // both have to name this product's own variant.
      let pickedIndex = -1;
      let cardProductName = '';
      let colourName = '';
      let storageLabel = '';
      let devicePriceText = '';

      // 1. Start from a fresh page in a fresh browser context and open the
      // catalogue: `await page.goto('/telefonok')`.
      await test.step("1. Start from a fresh page in a fresh browser context (the MSW projects start signed in, on the default scenario, with an empty cart) and open the catalogue: `await page.goto('/telefonok')`.", async () => {
        await page.goto('/telefonok');
        await expect(page).toHaveTitle('MiBolt — Mobiltelefonok');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();
        await expect(page.getByTestId('cart-link')).toBeVisible();
        // The header badge carries the cart's total, so a fresh context starts
        // at zero.
        await expect(page.getByTestId('cart-badge')).toHaveText('0');
      });

      // 2. Scan the cards in `catalog-grid` for the first card that carries no
      // `product-card-stock` element and whose `price-amount` is below
      // 300 000 Ft.
      await test.step('2. Scan the cards in `catalog-grid` for the first card that carries no `product-card-stock` element and whose `price-amount` is below 300 000 Ft.', async () => {
        // The grid renders a "Katalógus betöltése" status while it is empty;
        // waiting for the first card means the loop below reads real prices.
        await expect(cards.first()).toBeVisible();
        const cardCount = await cards.count();
        // Cash on delivery is refused above this cart value
        // (CASH_ON_DELIVERY_MAX_CART_HUF in the mock), so the chosen card has to
        // stay under it.
        const cashOnDeliveryCeiling = 300_000;
        for (let i = 0; i < cardCount; i++) {
          const card = cards.nth(i);
          // An in-stock card carries no `product-card-stock` marker; a sold-out
          // one shows "Elfogyott" there and is skipped.
          if ((await card.getByTestId('product-card-stock').count()) > 0) continue;
          const priceText = (await card.getByTestId('price-amount').textContent()) ?? '';
          // The price block groups whole HUF with a non-breaking separator, so
          // stripping every non-digit yields the integer value.
          const priceNumber = Number(priceText.replace(/\D/g, ''));
          if (
            Number.isFinite(priceNumber) &&
            priceNumber > 0 &&
            priceNumber < cashOnDeliveryCeiling
          ) {
            pickedIndex = i;
            break;
          }
        }
        expect(pickedIndex).toBeGreaterThanOrEqual(0);

        const pickedCard = cards.nth(pickedIndex);
        await expect(pickedCard.getByTestId('product-card-stock')).toHaveCount(0);
        // The default scenario's first in-stock card, which the receipt's totals
        // below are read against.
        await expect(pickedCard.getByTestId('price-amount')).toHaveText('89 990');
        await expect(pickedCard.getByTestId('product-card-cta')).toHaveText('Megnézem');
        cardProductName = (
          (await pickedCard.getByRole('heading', { level: 3 }).textContent()) ?? ''
        ).trim();
        expect(cardProductName).not.toBe('');
      });

      // 3. Press the chosen card's `product-card-cta`.
      await test.step("3. Press the chosen card's `product-card-cta`.", async () => {
        await cards.nth(pickedIndex).getByTestId('product-card-cta').click();

        await expect(page).toHaveURL(/\/telefonok\/[^/?]+\?variant=/);
        await expect(page).toHaveTitle('MiBolt — Termék');
        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-name')).toHaveText(cardProductName);
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
      });

      // 4. Add the phone at the width's own mount: at 1920x1080 press the inner
      // button of `add-to-cart-button`; at 390x844 press the inner button of the
      // sticky rail's `purchase-cta`.
      await test.step("4. Add the phone at the width's own mount: at 1920x1080 press the inner button of `add-to-cart-button`; at 390x844 the `add-to-cart-button` mount is present but not visible, so press the inner button of the sticky rail's `purchase-cta` instead.", async () => {
        if (narrowViewport) {
          // The rail shows the device price beside its own CTA.
          await expect(page.getByTestId('purchase-rail')).toContainText('Készülékár');
        }

        // The selected variant's colour and storage are read off the screen so
        // the confirmation and the receipt are checked against what it shows.
        const selectedColour = page
          .getByTestId('variant-color-group')
          .locator('button[data-testid^="variant-color-"][aria-pressed="true"]');
        await expect(selectedColour).toBeVisible();
        colourName = ((await selectedColour.getAttribute('aria-label')) ?? '').replace(
          /, kiválasztva$/,
          '',
        );
        const selectedStorage = page
          .getByTestId('variant-storage-group')
          .locator('button[data-testid^="variant-storage-"][aria-pressed="true"]');
        await expect(selectedStorage).toBeVisible();
        storageLabel = ((await selectedStorage.getAttribute('aria-label')) ?? '').replace(
          /, kiválasztva$/,
          '',
        );
        expect(colourName).not.toBe('');
        expect(storageLabel).not.toBe('');

        // The "Árak" region carries the device's own price block.
        const devicePriceAmount = page
          .getByRole('region', { name: 'Árak', exact: true })
          .getByTestId('price-amount');
        await expect(devicePriceAmount).toBeVisible();
        devicePriceText = ((await devicePriceAmount.textContent()) ?? '').trim();

        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();

        await expect(confirmationMessage).toContainText(
          `${cardProductName}, ${colourName}, ${storageLabel} – 1 darab a kosárban.`,
        );
        await expect(confirmationMessage.getByRole('button', { name: 'Bezárás' })).toBeVisible();
        await expect(page.getByTestId('cart-badge')).toHaveText('1');
      });

      // 5. Press the header's `cart-link`.
      await test.step("5. Press the header's `cart-link`.", async () => {
        await page.getByTestId('cart-link').click();

        await expect(page).toHaveURL(/\/penztar\/kosar$/);
        await expect(page).toHaveTitle('MiBolt — Kosár');
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-count')).toHaveText('Kosárban található termékek (1)');
        await expect(page.getByTestId('cart-line')).toHaveCount(1);
        await expect(page.getByTestId('cart-line-quantity')).toHaveText('1 db');

        const cartSubtotal = page.getByTestId('order-summary-subtotal');
        await expect(cartSubtotal).toContainText('Részösszeg');
        await expect(cartSubtotal.getByTestId('price-amount')).toHaveText(devicePriceText);
        await expect(page.getByTestId('order-summary-shipping')).toContainText(
          'A következő lépésben választod ki.',
        );
        await expect(page.getByTestId('order-summary-total')).toContainText(
          'Nincs megjeleníthető ár.',
        );
      });

      // 6. Press the inner button of `cart-continue` (its text is "Tovább az
      // adatokhoz").
      await test.step('6. Press the inner button of `cart-continue` (its text is `Tovább az adatokhoz`).', async () => {
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(page).toHaveTitle('MiBolt — Kapcsolattartási adatok');
        await expect(
          page.getByRole('heading', { level: 1, name: 'Kapcsolattartási adatok' }),
        ).toBeVisible();

        // The step list marks the passed steps "Kész" and the current step with
        // `aria-current="step"`.
        const steps = page.getByTestId('checkout-steps').locator('li');
        await expect(steps.nth(0)).toContainText('Kész');
        await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step');

        await expect(page.getByTestId('contact-demo-notice')).toHaveText(
          'Demó pénztár. Kérlek, ne használj valós személyes adatokat — ez egy működési bemutató, nem küldünk valódi rendelést vagy e-mailt.',
        );
      });

      // 7. Fill the contact step: `contact-fullname-input` with "Teszt Elek",
      // `contact-email-input` with "teszt.elek@example.test",
      // `contact-phone-input` with "+36 30 123 4567", then press the inner
      // button of `contact-submit` (its text is "Tovább a szállításhoz").
      await test.step('7. Fill the contact step: `contact-fullname-input` with `Teszt Elek`, `contact-email-input` with `teszt.elek@example.test`, `contact-phone-input` with `+36 30 123 4567`, then press the inner button of `contact-submit` (its text is `Tovább a szállításhoz`).', async () => {
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt.elek@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await expect(page.getByTestId('contact-submit').getByRole('button')).toHaveText(
          'Tovább a szállításhoz',
        );
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page).toHaveTitle('MiBolt — Átvétel és fizetés');
        await expect(
          page.getByRole('heading', { level: 1, name: 'Átvétel és fizetés' }),
        ).toBeVisible();
      });

      // 8. Choose home delivery: select the delivery radio (`delivery-radio`
      // inside the first `delivery-option`).
      await test.step('8. Choose home delivery: select the delivery radio (`delivery-radio` inside the first `delivery-option`), whose accessible name is `Házhoz szállítás 0 Futárral, 1–2 munkanapon belül.`', async () => {
        const homeDeliveryRadio = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' })
          .getByTestId('delivery-radio');
        await homeDeliveryRadio.click();
        await expect(homeDeliveryRadio).toBeChecked();

        await expect(page.getByTestId('address-form')).toBeVisible();
        await expect(page.getByTestId('address-input-postalCode')).toBeVisible();
        await expect(page.getByTestId('address-input-city')).toBeVisible();
        await expect(page.getByTestId('address-input-line1')).toBeVisible();
        await expect(page.getByTestId('summary-row-delivery')).toContainText('Házhoz szállítás');
      });

      // 9. Fill the address: `address-input-postalCode` with "1052",
      // `address-input-city` with "Budapest", `address-input-line1` with
      // "Váci utca 12.".
      await test.step('9. Fill the address: `address-input-postalCode` with `1052`, `address-input-city` with `Budapest`, `address-input-line1` with `Váci utca 12.`.', async () => {
        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Váci utca 12.');

        await expect(page.getByTestId('address-input-postalCode')).toHaveValue('1052');
        await expect(page.getByTestId('address-input-city')).toHaveValue('Budapest');
        // The house number is accepted by the free-text line, not rejected as a
        // postal-code pattern.
        await expect(page.getByTestId('address-input-line1')).toHaveValue('Váci utca 12.');
      });

      // 10. Choose cash on delivery: select the second `payment-option`.
      await test.step('10. Choose cash on delivery: select the second `payment-option`, whose text is `Utánvét | 490 | Ft | Készpénzzel vagy kártyával a futárnál.`', async () => {
        const cashOnDeliveryOption = page
          .getByTestId('payment-option')
          .filter({ hasText: 'Utánvét' });
        await expect(cashOnDeliveryOption).toContainText('490');
        const cashOnDeliveryRadio = cashOnDeliveryOption.getByTestId('payment-radio');
        await cashOnDeliveryRadio.click();
        await expect(cashOnDeliveryRadio).toBeChecked();

        await expect(page.getByTestId('summary-row-payment')).toContainText('Utánvét');
        // The plan expects `summary-row-fee` to read 490 Ft after the choice, but
        // this screen's `summary-row-fee` is the shipping-fee row ("Szállítási
        // díj", 0 Ft); the 490 Ft payment fee surfaces on the review step and on
        // the receipt instead.
        const summaryFee = page.getByTestId('summary-row-fee');
        await expect(summaryFee).toContainText('Szállítási díj');
        await expect(summaryFee.getByTestId('price-amount')).toHaveText('0');
      });

      // 11. Press the inner button of `delivery-confirm` (its text is "Tovább az
      // ellenőrzéshez").
      await test.step('11. Press the inner button of `delivery-confirm` (its text is `Tovább az ellenőrzéshez`).', async () => {
        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page).toHaveTitle('MiBolt — Rendelés ellenőrzése');
        await expect(
          page.getByRole('heading', { level: 1, name: 'Minden rendben?' }),
        ).toBeVisible();

        await expect(page.getByTestId('review-demo-notice')).toHaveText(
          'Demó pénztár. A rendelés leadása nem küld valódi megrendelést, nem indít valódi fizetést, és nem küld e-mailt. Az adatok a böngésző memóriájában maradnak.',
        );

        // The review step is the only screen that shows the typed contact data,
        // with the phone normalised to +36 30 123 4567.
        const reviewContact = page.getByTestId('review-contact');
        await expect(reviewContact).toContainText('Teszt Elek');
        await expect(reviewContact).toContainText('teszt.elek@example.test');
        await expect(reviewContact).toContainText('+36301234567');

        const reviewItems = page.getByTestId('review-items');
        await expect(reviewItems).toContainText('1 tétel');
        const reviewLine = reviewItems.getByTestId('review-line');
        await expect(reviewLine).toHaveCount(1);
        await expect(reviewLine.getByTestId('review-line-quantity')).toHaveText(
          `1 × ${devicePriceText} Ft`,
        );
        await expect(reviewLine).toContainText('Sor végösszeg');
        await expect(reviewLine.getByTestId('price-amount')).toHaveText(devicePriceText);

        const reviewSummary = page.getByTestId('review-summary');
        const reviewSubtotal = reviewSummary.getByTestId('order-summary-subtotal');
        await expect(reviewSubtotal).toContainText('Részösszeg');
        await expect(reviewSubtotal.getByTestId('price-amount')).toHaveText(devicePriceText);
        await expect(
          reviewSummary.getByTestId('order-summary-shipping').getByTestId('price-amount'),
        ).toHaveText('0');
        await expect(
          reviewSummary.getByTestId('order-summary-payment-fee').getByTestId('price-amount'),
        ).toHaveText('490');
        await expect(
          reviewSummary.getByTestId('order-summary-total').getByTestId('price-amount'),
        ).toHaveText('90 480');
        await expect(page.getByTestId('review-payment')).toHaveText('Utánvét');
        await expect(page.getByTestId('review-delivery')).toContainText('Házhoz szállítás');
      });

      // 12. Accept the demo terms by checking `review-consent-terms-input`, then
      // press `review-submit` (its text is "Demórendelés véglegesítése").
      await test.step('12. Accept the demo terms by checking `review-consent-terms-input` (its label reads `Elfogadom a demó rendelési feltételeit .`; the note beside the submit reads `A demó feltételek elfogadása szükséges a leadáshoz.`), then press `review-submit` (its text is `Demórendelés véglegesítése`).', async () => {
        await expect(page.locator('label[for="review-consent-terms-input"]')).toContainText(
          'Elfogadom a demó rendelési feltételeit',
        );
        await expect(page.getByTestId('review-cta-explanation')).toHaveText(
          'A demó feltételek elfogadása szükséges a leadáshoz.',
        );

        const termsConsent = page.getByTestId('review-consent-terms-input');
        await expect(termsConsent).not.toBeChecked();
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        const submitButton = page.getByTestId('review-submit').getByRole('button');
        await expect(submitButton).toHaveText('Demórendelés véglegesítése');
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

        // The route carries the created order's UUID.
        await expect(page).toHaveURL(
          /\/penztar\/siker\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        await expect(page).toHaveTitle('MiBolt — Demórendelés elkészült');
        await expect(page.getByTestId('receipt-order-number')).toBeVisible();

        // Exactly one order write, answered 201; no later write follows on this
        // page load.
        expect(orderRequests).toHaveLength(1);
        expect(orderRequests[0].method).toBe('POST');
        expect(orderRequests[0].url).toContain('/api/v1/orders');
        expect(orderResponseStatuses).toEqual([201]);

        // Every checkout step is complete on the success screen.
        const steps = page.getByTestId('checkout-steps').locator('li');
        await expect(steps).toHaveCount(4);
        await expect(steps.filter({ hasText: 'Kész' })).toHaveCount(4);
      });

      // 13. Read the receipt values on the success page.
      await test.step('13. Read the receipt values on the success page.', async () => {
        const successHeading = page.getByTestId('success-heading');
        await expect(successHeading).toHaveText('Elkészült a demórendelésed.');

        const receiptOrderNumber = page.getByTestId('receipt-order-number');
        await expect(receiptOrderNumber).toHaveText('DEMO-000001');
        await expect(page.getByTestId('order-receipt')).toContainText('Rendelésszám');
        await expect(page.getByTestId('receipt-demo-badge')).toHaveText('DEMO');

        await expect(page.getByTestId('success-demo-notice')).toHaveText(
          'Demó pénztár. A sikeroldal csupán a működést mutatja be — nem történt valódi fizetés, szállítás vagy e-mail-küldés.',
        );
        await expect(page.getByTestId('receipt-simulation-notice')).toHaveText(
          'Demó figyelmeztetés. A demórendelés elkészült. Nem történt valódi fizetés, rendelésküldés vagy e-mail-küldés.',
        );

        const receiptLines = page.getByTestId('receipt-lines');
        await expect(receiptLines).toContainText('Termékek');
        const receiptLine = receiptLines.getByTestId('receipt-line');
        await expect(receiptLine).toHaveCount(1);
        await expect(receiptLine).toContainText(cardProductName);
        await expect(receiptLine).toContainText(`${colourName} • ${storageLabel}`);
        await expect(receiptLine).toContainText('Mennyiség');
        await expect(receiptLine).toContainText('1 db');
        await expect(receiptLine).toContainText('Sor végösszeg');
        await expect(receiptLine.getByTestId('price-amount')).toHaveText(devicePriceText);

        const receiptTotals = page.getByTestId('receipt-totals');
        await expect(receiptTotals).toContainText('Összegzés');
        const receiptSubtotal = receiptTotals.getByTestId('receipt-row-subtotal');
        await expect(receiptSubtotal).toContainText('Részösszeg');
        await expect(receiptSubtotal.getByTestId('price-amount')).toHaveText(devicePriceText);
        await expect(
          receiptTotals.getByTestId('receipt-row-shipping').getByTestId('price-amount'),
        ).toHaveText('0');
        await expect(
          receiptTotals.getByTestId('receipt-row-payment-fee').getByTestId('price-amount'),
        ).toHaveText('490');
        await expect(
          receiptTotals.getByTestId('receipt-row-total').getByTestId('price-amount'),
        ).toHaveText('90 480');

        await expect(page.getByTestId('receipt-row-payment')).toContainText('Fizetési mód');
        await expect(page.getByTestId('receipt-row-payment')).toContainText('Utánvét');
        await expect(page.getByTestId('receipt-row-delivery')).toContainText('Szállítási mód');
        await expect(page.getByTestId('receipt-row-delivery')).toContainText('Házhoz szállítás');
        await expect(page.getByTestId('receipt-row-status')).toContainText('Státusz');
        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );

        // The receipt has no contact or address block at all.
        const receipt = page.getByTestId('order-receipt');
        await expect(receipt.locator('[data-testid*="contact"]')).toHaveCount(0);
        await expect(receipt.locator('[data-testid*="address"]')).toHaveCount(0);

        const demoNotice = page.getByTestId('demo-notice');
        await expect(demoNotice).toContainText('DEMÓ');
        await expect(demoNotice).toContainText(
          'Fiktív termékek és árak. A vásárlás szimulált; nem történik valódi fizetés.',
        );
      });

      // 14. Check the page text and the snapshot for the typed strings.
      await test.step('14. Check the page text and the snapshot for the typed strings.', async () => {
        const pageText = await page.evaluate(() => document.body.innerText);
        const snapshotRaw = await page.evaluate(
          (snapshotKey) => sessionStorage.getItem(snapshotKey),
          SNAPSHOT_KEY,
        );
        expect(snapshotRaw).not.toBeNull();
        const snapshotText = snapshotRaw ?? '';
        for (const typedString of TYPED_STRINGS) {
          expect(pageText).not.toContain(typedString);
          expect(snapshotText).not.toContain(typedString);
        }

        // The stored receipt holds the order, not the customer: placeholders
        // where the typed contact and address data would be.
        const storedReceipt = await page.evaluate((snapshotKey): StoredReceiptFacts => {
          const emptyAddress: StoredAddress = { postalCode: '', city: '', line1: '' };
          const missing: StoredReceiptFacts = {
            contactEmail: '',
            billingName: '',
            billingAddress: emptyAddress,
            deliveryAddress: emptyAddress,
          };

          const readAddress = (value: unknown): StoredAddress => {
            const address: StoredAddress = { postalCode: '', city: '', line1: '' };
            if (typeof value !== 'object' || value === null) return address;
            if ('postalCode' in value && typeof value['postalCode'] === 'string') {
              address.postalCode = value['postalCode'];
            }
            if ('city' in value && typeof value['city'] === 'string') {
              address.city = value['city'];
            }
            if ('line1' in value && typeof value['line1'] === 'string') {
              address.line1 = value['line1'];
            }
            return address;
          };

          const raw = sessionStorage.getItem(snapshotKey);
          if (raw === null) return missing;
          const parsed: unknown = JSON.parse(raw);
          if (typeof parsed !== 'object' || parsed === null) return missing;
          if (!('receipts' in parsed)) return missing;
          const receipts: unknown = parsed['receipts'];
          if (!Array.isArray(receipts) || receipts.length === 0) return missing;
          const list: unknown[] = receipts;
          const receipt: unknown = list[0];
          if (typeof receipt !== 'object' || receipt === null) return missing;

          const facts: StoredReceiptFacts = { ...missing };
          if ('contactEmail' in receipt && typeof receipt['contactEmail'] === 'string') {
            facts.contactEmail = receipt['contactEmail'];
          }
          if ('billing' in receipt) {
            const billing: unknown = receipt['billing'];
            if (typeof billing === 'object' && billing !== null) {
              if ('name' in billing && typeof billing['name'] === 'string') {
                facts.billingName = billing['name'];
              }
              if ('address' in billing) {
                facts.billingAddress = readAddress(billing['address']);
              }
            }
          }
          if ('delivery' in receipt) {
            const delivery: unknown = receipt['delivery'];
            if (typeof delivery === 'object' && delivery !== null && 'address' in delivery) {
              facts.deliveryAddress = readAddress(delivery['address']);
            }
          }
          return facts;
        }, SNAPSHOT_KEY);

        expect(storedReceipt.contactEmail).toBe('redacted@example.invalid');
        expect(storedReceipt.billingName).toBe('redacted');
        expect(storedReceipt.billingAddress).toMatchObject({
          postalCode: '0000',
          city: 'redacted',
          line1: 'redacted',
        });
        expect(storedReceipt.deliveryAddress).toMatchObject({
          postalCode: '0000',
          city: 'redacted',
          line1: 'redacted',
        });
      });
    },
  );
});
