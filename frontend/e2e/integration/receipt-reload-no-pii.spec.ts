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
// page text or in the persisted snapshot, before or after the reload: the phone
// is listed both as typed and as the review step normalises it.
const TYPED_STRINGS = [
  'Teszt Elek',
  'teszt.elek@example.test',
  '+36 30 123 4567',
  '+36301234567',
  'Váci utca 12.',
];

interface StoredAddress {
  countryCode: string;
  postalCode: string;
  city: string;
  line1: string;
}

interface StoredReceiptFacts {
  orderNumber: string;
  status: string;
  paymentMethod: string;
  subtotal: number;
  shippingFee: number;
  paymentFee: number;
  total: number;
  itemQuantity: number;
  itemLineTotal: number;
  notice: string;
  contactEmail: string;
  billingName: string;
  billingAddress: StoredAddress;
  deliveryAddress: StoredAddress;
}

test.describe('The receipt: a demo order, read back without personal data', () => {
  test(
    '[E102] a reloaded receipt reads the same order back, sends no new order and shows no personal data',
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

      // The order write the checkout makes, recorded from before the order is
      // placed: the success step proves the order was created by exactly one
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

      // The order reads the reload makes. They stay empty until the listener is
      // registered in step 12, after the order exists and before the reload, so
      // every entry collected was made by the reload.
      const reloadOrderRequests: { method: string; url: string }[] = [];
      const reloadOrderResponseStatuses: number[] = [];

      // Read off the screens, never pinned: the confirmation and the receipt
      // both have to name this product's own variant.
      let pickedIndex = -1;
      let cardProductName = '';
      let colourName = '';
      let storageLabel = '';
      let devicePriceText = '';
      let successUrl = '';
      let orderId = '';

      // The typed contact and address strings as the page and the persisted
      // snapshot show them. The reload must not reintroduce any of them.
      const collectTypedStringHits = async (): Promise<string[]> => {
        const pageText = await page.evaluate(() => document.body.innerText);
        const snapshotRaw = await page.evaluate(
          (snapshotKey) => sessionStorage.getItem(snapshotKey),
          SNAPSHOT_KEY,
        );
        const snapshotText = snapshotRaw ?? '';
        return TYPED_STRINGS.filter(
          (typed) => pageText.includes(typed) || snapshotText.includes(typed),
        );
      };

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
      await test.step("2. Scan the cards in `catalog-grid` for the first card that carries no `product-card-stock` element and whose `price-amount` is below 300 000 Ft. In the default scenario that is the grid's first card: its `price-amount` reads `89 990` and its price line reads `Egyszeri készülékár | 89 990 | Ft`.", async () => {
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
      await test.step("4. Add the phone at the width's own mount: at 1920x1080 press the inner button of `add-to-cart-button`; at 390x844 the `add-to-cart-button` mount is present but not visible, so press the inner button of the sticky rail's `purchase-cta` instead. Both buttons read `Kosárba teszem`; at 390x844 the rail shows `Készülékár | 89 990 | Ft`.", async () => {
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

      // 8. Choose home delivery: select the delivery radio whose accessible name
      // is `Házhoz szállítás 0 Futárral, 1–2 munkanapon belül.`, then fill the
      // address.
      await test.step('8. Choose home delivery: select the delivery radio whose accessible name is `Házhoz szállítás 0 Futárral, 1–2 munkanapon belül.`, then fill `address-input-postalCode` with `1052`, `address-input-city` with `Budapest` and `address-input-line1` with `Váci utca 12.`.', async () => {
        const homeDeliveryRadio = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' })
          .getByTestId('delivery-radio');
        await homeDeliveryRadio.click();
        await expect(homeDeliveryRadio).toBeChecked();

        await expect(page.getByTestId('address-input-postalCode')).toBeVisible();
        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Váci utca 12.');

        await expect(page.getByTestId('address-input-postalCode')).toHaveValue('1052');
        await expect(page.getByTestId('address-input-city')).toHaveValue('Budapest');
        // The house number is accepted by the free-text line, not rejected as a
        // postal-code pattern.
        await expect(page.getByTestId('address-input-line1')).toHaveValue('Váci utca 12.');
        await expect(page.getByTestId('summary-row-delivery')).toContainText('Házhoz szállítás');
      });

      // 9. Choose cash on delivery: select the second `payment-option`, whose
      // text is `Utánvét | 490 | Ft | Készpénzzel vagy kártyával a futárnál.`,
      // then press the inner button of `delivery-confirm` (its text is "Tovább
      // az ellenőrzéshez").
      await test.step('9. Choose cash on delivery: select the second `payment-option`, whose text is `Utánvét | 490 | Ft | Készpénzzel vagy kártyával a futárnál.`, then press the inner button of `delivery-confirm` (its text is `Tovább az ellenőrzéshez`).', async () => {
        const cashOnDeliveryOption = page
          .getByTestId('payment-option')
          .filter({ hasText: 'Utánvét' });
        await expect(cashOnDeliveryOption).toContainText('490');
        const cashOnDeliveryRadio = cashOnDeliveryOption.getByTestId('payment-radio');
        await cashOnDeliveryRadio.click();
        await expect(cashOnDeliveryRadio).toBeChecked();

        await expect(page.getByTestId('summary-row-payment')).toContainText('Utánvét');

        const deliveryConfirm = page.getByTestId('delivery-confirm').getByRole('button');
        await expect(deliveryConfirm).toHaveText('Tovább az ellenőrzéshez');
        await deliveryConfirm.click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page).toHaveTitle('MiBolt — Rendelés ellenőrzése');
        await expect(
          page.getByRole('heading', { level: 1, name: 'Minden rendben?' }),
        ).toBeVisible();

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
      });

      // 10. Accept the demo terms by checking `review-consent-terms-input`, then
      // press `review-submit` (its text is "Demórendelés véglegesítése").
      await test.step('10. Accept the demo terms by checking `review-consent-terms-input`, then press `review-submit` (its text is `Demórendelés véglegesítése`).', async () => {
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
      });

      // 11. Record the receipt and the address bar before the reload.
      await test.step('11. Record the receipt and the address bar before the reload: `page.url()` plus `receipt-order-number`, `receipt-lines`, `receipt-totals`, `receipt-row-payment` and `receipt-row-delivery`.', async () => {
        await expect(page.getByTestId('receipt-order-number')).toHaveText('DEMO-000001');
        await expect(page.getByTestId('receipt-demo-badge')).toHaveText('DEMO');

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
        await expect(
          receiptTotals.getByTestId('receipt-row-subtotal').getByTestId('price-amount'),
        ).toHaveText(devicePriceText);
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

        // The persisted snapshot already holds none of the typed strings, so the
        // reload has nothing to leak back onto the page.
        expect(await collectTypedStringHits()).toEqual([]);

        // The address bar and the id the order was created under, held for the
        // GET the reload must make (steps 13 and 14).
        successUrl = page.url();
        orderId = new URL(successUrl).pathname.split('/').pop() ?? '';
        expect(orderId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      });

      // 12. Arm a request recorder over the page.
      await test.step("12. Arm a request recorder over the page: `page.on('request', ...)` collecting the method and the URL of every request whose URL contains `/api/v1/orders`.", async () => {
        page.on('request', (request) => {
          if (!request.url().includes('/api/v1/orders')) return;
          reloadOrderRequests.push({ method: request.method(), url: request.url() });
        });
        page.on('response', (response) => {
          if (!response.url().includes('/api/v1/orders')) return;
          reloadOrderResponseStatuses.push(response.status());
        });

        // It is armed before the reload, so it holds nothing yet: every request
        // it collects was made by the reload.
        expect(reloadOrderRequests).toHaveLength(0);
      });

      // 13. Reload with `await page.goto(page.url())` (never `page.reload()`),
      // then wait for `receipt-order-number` to be visible.
      await test.step("13. Reload with `await page.goto(page.url())` (never `page.reload()`, which the seed's rule 2 bans because the MSW worker can re-register), then wait for `receipt-order-number` to be visible.", async () => {
        await page.goto(page.url());

        await expect(page).toHaveURL(successUrl);
        await expect(page).toHaveTitle('MiBolt — Demórendelés elkészült');
        await expect(page.getByTestId('receipt-order-number')).toBeVisible();
        await expect(page.getByTestId('receipt-order-number')).toHaveText('DEMO-000001');
      });

      // 14. Read the recorder.
      await test.step('14. Read the recorder.', async () => {
        await expect.poll(() => reloadOrderRequests.length).toBe(1);
        // The one order read is the id the address bar names, read back by id.
        expect(reloadOrderRequests[0].method).toBe('GET');
        expect(reloadOrderRequests[0].url).toBe(
          new URL(`/api/v1/orders/${orderId}`, successUrl).href,
        );
        expect(reloadOrderResponseStatuses).toEqual([200]);
        // The reload sends no new order: its only entry is the single GET above.
        expect(reloadOrderRequests.map((request) => request.method)).toEqual(['GET']);
      });

      // 15. Read the receipt values again, after the reload.
      await test.step('15. Read the receipt values again, after the reload.', async () => {
        await expect(page.getByTestId('success-heading')).toHaveText('Elkészült a demórendelésed.');
        await expect(page.getByTestId('receipt-order-number')).toHaveText('DEMO-000001');
        await expect(page.getByTestId('receipt-demo-badge')).toHaveText('DEMO');

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
        await expect(
          receiptTotals.getByTestId('receipt-row-subtotal').getByTestId('price-amount'),
        ).toHaveText(devicePriceText);
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

        await expect(page.getByTestId('success-demo-notice')).toHaveText(
          'Demó pénztár. A sikeroldal csupán a működést mutatja be — nem történt valódi fizetés, szállítás vagy e-mail-küldés.',
        );
        await expect(page.getByTestId('receipt-simulation-notice')).toHaveText(
          'Demó figyelmeztetés. A demórendelés elkészült. Nem történt valódi fizetés, rendelésküldés vagy e-mail-küldés.',
        );
      });

      // 16. Check the reloaded page text and the `sessionStorage` snapshot for
      // the typed strings.
      await test.step('16. Check the reloaded page text and the `sessionStorage` snapshot for the typed strings.', async () => {
        expect(await collectTypedStringHits()).toEqual([]);

        // The receipt renders its line, totals and meta rows only: no contact
        // and no address block, and no order id shown as customer data.
        const receipt = page.getByTestId('order-receipt');
        await expect(receipt).toBeVisible();
        await expect(page.getByTestId('receipt-meta')).toBeVisible();
        await expect(receipt.locator('[data-testid*="contact"]')).toHaveCount(0);
        await expect(receipt.locator('[data-testid*="address"]')).toHaveCount(0);

        const demoNotice = page.getByTestId('demo-notice');
        await expect(demoNotice).toContainText('DEMÓ');
        await expect(demoNotice).toContainText(
          'Fiktív termékek és árak. A vásárlás szimulált; nem történik valódi fizetés.',
        );
      });

      // 17. Read the stored receipt inside the snapshot (the mock's own
      // persistence).
      await test.step("17. Read the stored receipt inside the snapshot `mi-bolt.snapshot.default` (the mock's own persistence).", async () => {
        const storedReceipt = await page.evaluate((snapshotKey): StoredReceiptFacts => {
          const emptyAddress: StoredAddress = {
            countryCode: '',
            postalCode: '',
            city: '',
            line1: '',
          };
          const missing: StoredReceiptFacts = {
            orderNumber: '',
            status: '',
            paymentMethod: '',
            subtotal: 0,
            shippingFee: 0,
            paymentFee: 0,
            total: 0,
            itemQuantity: 0,
            itemLineTotal: 0,
            notice: '',
            contactEmail: '',
            billingName: '',
            billingAddress: emptyAddress,
            deliveryAddress: emptyAddress,
          };

          const readAddress = (value: unknown): StoredAddress => {
            const address: StoredAddress = {
              countryCode: '',
              postalCode: '',
              city: '',
              line1: '',
            };
            if (typeof value !== 'object' || value === null) return address;
            if ('countryCode' in value && typeof value['countryCode'] === 'string') {
              address.countryCode = value['countryCode'];
            }
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

          const readAmount = (value: unknown): number => {
            if (typeof value !== 'object' || value === null) return 0;
            if ('amount' in value && typeof value['amount'] === 'number') {
              return value['amount'];
            }
            return 0;
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
          if ('orderNumber' in receipt && typeof receipt['orderNumber'] === 'string') {
            facts.orderNumber = receipt['orderNumber'];
          }
          if ('status' in receipt && typeof receipt['status'] === 'string') {
            facts.status = receipt['status'];
          }
          if ('paymentMethod' in receipt && typeof receipt['paymentMethod'] === 'string') {
            facts.paymentMethod = receipt['paymentMethod'];
          }
          if ('notice' in receipt && typeof receipt['notice'] === 'string') {
            facts.notice = receipt['notice'];
          }
          if ('contactEmail' in receipt && typeof receipt['contactEmail'] === 'string') {
            facts.contactEmail = receipt['contactEmail'];
          }
          if ('subtotal' in receipt) facts.subtotal = readAmount(receipt['subtotal']);
          if ('shippingFee' in receipt) facts.shippingFee = readAmount(receipt['shippingFee']);
          if ('paymentFee' in receipt) facts.paymentFee = readAmount(receipt['paymentFee']);
          if ('total' in receipt) facts.total = readAmount(receipt['total']);
          if ('items' in receipt) {
            const items: unknown = receipt['items'];
            if (Array.isArray(items) && items.length > 0) {
              const lines: unknown[] = items;
              const first: unknown = lines[0];
              if (typeof first === 'object' && first !== null) {
                if ('quantity' in first && typeof first['quantity'] === 'number') {
                  facts.itemQuantity = first['quantity'];
                }
                if ('lineTotal' in first) facts.itemLineTotal = readAmount(first['lineTotal']);
              }
            }
          }
          if ('billing' in receipt) {
            const billing: unknown = receipt['billing'];
            if (typeof billing === 'object' && billing !== null) {
              if ('name' in billing && typeof billing['name'] === 'string') {
                facts.billingName = billing['name'];
              }
              if ('address' in billing) facts.billingAddress = readAddress(billing['address']);
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

        // The stored order matches what the screen shows.
        expect(storedReceipt.orderNumber).toBe('DEMO-000001');
        expect(storedReceipt.status).toBe('confirmed');
        expect(storedReceipt.paymentMethod).toBe('cash_on_delivery');
        expect(storedReceipt.subtotal).toBe(89_990);
        expect(storedReceipt.shippingFee).toBe(0);
        expect(storedReceipt.paymentFee).toBe(490);
        expect(storedReceipt.total).toBe(90_480);
        expect(storedReceipt.itemQuantity).toBe(1);
        expect(storedReceipt.itemLineTotal).toBe(89_990);
        expect(storedReceipt.notice).toBe(
          'A demórendelés elkészült. Nem történt valódi fizetés, rendelésküldés vagy e-mail-küldés.',
        );

        // The stored receipt holds the order, not the customer: placeholders
        // where the typed contact and address data would be.
        expect(storedReceipt.contactEmail).toBe('redacted@example.invalid');
        expect(storedReceipt.billingName).toBe('redacted');
        expect(storedReceipt.billingAddress).toEqual({
          countryCode: 'HU',
          postalCode: '0000',
          city: 'redacted',
          line1: 'redacted',
        });
        expect(storedReceipt.deliveryAddress).toEqual({
          countryCode: 'HU',
          postalCode: '0000',
          city: 'redacted',
          line1: 'redacted',
        });
      });
    },
  );
});
