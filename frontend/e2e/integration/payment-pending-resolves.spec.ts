// spec: specs/payment-pending-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Card payment: a pending result is polled', () => {
  test(
    '[E094] a pending card payment is polled until it succeeds and exactly one order is placed',
    { tag: '@integration' },
    async ({ page }) => {
      // The purchase control is laid out differently on either side of the
      // 1024px breakpoint the integration widths straddle: below it the
      // product page's desktop CTA column is `display: none` and the sticky
      // `purchase-rail` carries the same "Kosárba teszem" press through its
      // `purchase-cta`. Both mounts stay in the DOM at either width, so the
      // viewport decides which one the test drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      // The MSW handlers answer the shop's calls through the service worker, so
      // they never pass through this document's `window.fetch`; the request and
      // response surfaces are what count them. The demo payment application
      // sends the shopper back with a full page load
      // (`window.location.assign`), so the transient
      // `/penztar?paymentIntentId=...` hop is a main-frame navigation of its
      // own, recorded beside them.
      const createIntentPath = '/api/v1/payment-intents';
      const ordersPath = '/api/v1/orders';
      const navigations: string[] = [];
      const paymentRequests: { method: string; url: string }[] = [];
      const paymentResponses: { method: string; url: string; status: number; location: string }[] =
        [];
      const isPaymentCall = (url: string): boolean =>
        url.includes(createIntentPath) || url.includes(ordersPath);

      // Both are read off the screens, never pinned: the demo payment page's
      // amount is checked against the review page's own total, and the intent
      // id is the path segment the payment application opens on. `intentPath`
      // is filled in once the create has named the intent.
      let orderTotalDigits = '';
      let paymentIntentId = '';
      let intentPath = '';
      // Where the return leg's own calls start, so its reads of the intent can
      // be counted apart from the ones the demo payment page makes on load.
      let requestsBeforeReturn = 0;

      // 1. Open `/telefonok?mi-scenario=payment-pending-resolves` at the
      // integration project's viewport (below 1024 px wide the mobile layout,
      // from 1024 px the desktop layout). Wait for the first `product-card` to
      // render.
      await test.step("Open `/telefonok?mi-scenario=payment-pending-resolves` at the integration project's viewport (below 1024 px wide the mobile layout, from 1024 px the desktop layout). Wait for the first `product-card` to render.", async () => {
        await page.goto('/telefonok?mi-scenario=payment-pending-resolves');

        await expect(page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' })).toBeVisible();
        // The grid renders a "Katalógus betöltése" status while it is empty, so
        // waiting for the first card means the pick below reads real cards.
        await expect(page.getByTestId('product-card').first()).toBeVisible();
      });

      // 2. Pick the first catalogue card that carries no `product-card-stock`
      // marker (the only on-screen signal of an in-stock variant), and click
      // its inner link through `product-card-cta`.
      await test.step('Pick the first catalogue card that carries no `product-card-stock` marker (the only on-screen signal of an in-stock variant), and click its inner link through `product-card-cta`.', async () => {
        // The product is never named: the first card with no marker is the one
        // the screen offers as buyable, and an out-of-stock card shows its
        // "Elfogyott" label in that marker's place.
        const inStockCard = page
          .getByTestId('product-card')
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');
      });

      // 3. Add the variant to the cart through the add control the viewport
      // exposes: at 1920x1080 press the inner button of `add-to-cart-button`,
      // at 390x844 press the inner button of `purchase-cta` (the sticky
      // `purchase-rail` carries the press below 1024px).
      await test.step('Add the variant to the cart through the add control the viewport exposes: at 1920x1080 press the inner button of `add-to-cart-button`, at 390x844 press the inner button of `purchase-cta` (the sticky `purchase-rail` carries the press below 1024px).', async () => {
        await addToCartButton.click();

        // The add is a request of its own, and the header badge moves only once
        // it has landed, so the badge is the press's own confirmation.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');
      });

      // 4. Open the cart with `cart-link`, press the inner button of
      // `cart-continue`, and on the contact step fill `contact-fullname-input`
      // with "Teszt Elek", `contact-email-input` with "teszt@example.test" and
      // `contact-phone-input` with "+36 30 123 4567". Press the inner button of
      // `contact-submit`.
      await test.step('Open the cart with `cart-link`, press the inner button of `cart-continue`, and on the contact step fill `contact-fullname-input` with "Teszt Elek", `contact-email-input` with "teszt@example.test" and `contact-phone-input` with "+36 30 123 4567". Press the inner button of `contact-submit`.', async () => {
        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();

        await page.getByTestId('cart-continue').getByRole('button').click();
        await expect(page.getByTestId('contact-page')).toBeVisible();

        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();
      });

      // 5. On the delivery step choose the radio of the `delivery-option` whose
      // text reads "Házhoz szállítás" (the inner radio is `delivery-radio`),
      // fill `address-input-postalCode` with "1052", `address-input-city` with
      // "Budapest" and `address-input-line1` with "Fő utca 1.", then click the
      // `payment-option` whose text reads "Bankkártya" (the inner radio is
      // `payment-radio`). Press the inner button of `delivery-confirm`.
      await test.step('On the delivery step choose the radio of the `delivery-option` whose text reads "Házhoz szállítás" (the inner radio is `delivery-radio`), fill `address-input-postalCode` with "1052", `address-input-city` with "Budapest" and `address-input-line1` with "Fő utca 1.", then click the `payment-option` whose text reads "Bankkártya" (the inner radio is `payment-radio`). Press the inner button of `delivery-confirm`.', async () => {
        const homeDelivery = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' });
        await homeDelivery.getByTestId('delivery-radio').check();
        await expect(homeDelivery.getByTestId('delivery-radio')).toBeChecked();

        // The address fields belong to the home-delivery choice, so they exist
        // only once that radio is the checked one.
        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Fő utca 1.');

        const cardPayment = page.getByTestId('payment-option').filter({ hasText: 'Bankkártya' });
        await cardPayment.click();
        await expect(cardPayment.getByTestId('payment-radio')).toBeChecked();

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-payment')).toHaveText('Bankkártya');
        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'A kártyás fizetéshez indítsd el a fizetést.',
        );
        await expect(page.getByTestId('review-payment-new').getByRole('button')).toHaveText(
          'Fizetés indítása',
        );

        // The intent the demo payment application opens on carries this order's
        // total, so the total is read here for `pay-amount` to be checked
        // against.
        const reviewTotal = page.getByTestId('order-summary-total').getByTestId('price-amount');
        await expect(reviewTotal).toBeVisible();
        orderTotalDigits = ((await reviewTotal.textContent()) ?? '').replace(/\D/g, '');
        expect(orderTotalDigits).not.toBe('');
      });

      // 6. Arm the request recorder before the next press: install a listener
      // on `page.on('request', …)` that captures the HTTP method and URL of
      // every call to `/api/v1/payment-intents` and `/api/v1/orders` (the MSW
      // handler answers these through the service worker, so the recorder sits
      // on the CDP `Network.requestWillBeSent` surface, not on
      // `window.fetch`). The recorder must already be installed before the page
      // load that lands on `/penztar/ellenorzes` with the pending payment.
      await test.step("Arm the request recorder before the next press: install a listener on `page.on('request', …)` that captures the HTTP method and URL of every call to `/api/v1/payment-intents` and `/api/v1/orders` (the MSW handler answers these through the service worker, so the recorder sits on the CDP `Network.requestWillBeSent` surface, not on `window.fetch`). The recorder must already be installed before the page load that lands on `/penztar/ellenorzes` with the pending payment.", async () => {
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame()) navigations.push(frame.url());
        });
        page.on('request', (request) => {
          if (isPaymentCall(request.url())) {
            paymentRequests.push({ method: request.method(), url: request.url() });
          }
        });
        page.on('response', (response) => {
          if (isPaymentCall(response.url())) {
            paymentResponses.push({
              method: response.request().method(),
              url: response.url(),
              status: response.status(),
              location: response.headers()['location'] ?? '',
            });
          }
        });

        // The review step is on screen and no payment has been started, so no
        // call either endpoint owns has been made: the recorder starts empty.
        expect(paymentRequests).toHaveLength(0);
      });

      // 7. Press the inner button of `review-payment-new`.
      await test.step('Press the inner button of `review-payment-new`.', async () => {
        const createsBefore = paymentRequests.length;

        await page.getByTestId('review-payment-new').getByRole('button').click();

        // The shop is left for the demo payment application, with the intent id
        // as a path segment.
        await expect(page).toHaveURL(/\/demo-fizetes\/[^/]+$/);
        paymentIntentId = new URL(page.url()).pathname.split('/').pop() ?? '';
        expect(paymentIntentId).not.toBe('');
        intentPath = `/payment-intents/${paymentIntentId}`;

        // Exactly one new entry, and it is the create: a single POST of the
        // payment-intent collection.
        const created = paymentRequests
          .slice(createsBefore)
          .filter((entry) => entry.method === 'POST' && entry.url.endsWith(createIntentPath));
        expect(created).toHaveLength(1);

        // The create answers 201 with the new intent's own address in its
        // Location header.
        const createdResponse = paymentResponses.find(
          (entry) => entry.method === 'POST' && entry.url.endsWith(createIntentPath),
        );
        expect(createdResponse?.status).toBe(201);
        expect(createdResponse?.location).toContain(intentPath);
      });

      // 8. On the demo payment page, observe the card: the `pay-ref` heading
      // names the transaction, `pay-amount` shows the same digits as the review
      // step's `order-summary-total` `price-amount`, and the three outcome
      // buttons `pay-succeeded` ("Sikeres fizetés"), `pay-declined`
      // ("Elutasított fizetés") and `pay-pending` ("Függőben marad") are
      // visible together with the four scenery fields `pay-card-number`,
      // `pay-card-holder`, `pay-card-expiry`, `pay-card-cvc`.
      await test.step('On the demo payment page, observe the card: the `pay-ref` heading names the transaction, `pay-amount` shows the same digits as the review step\'s `order-summary-total` `price-amount`, and the three outcome buttons `pay-succeeded` ("Sikeres fizetés"), `pay-declined` ("Elutasított fizetés") and `pay-pending` ("Függőben marad") are visible together with the four scenery fields `pay-card-number`, `pay-card-holder`, `pay-card-expiry`, `pay-card-cvc`.', async () => {
        // `pay-ref` names the transaction, so it is the intent the address bar
        // carries and the one the create just returned.
        await expect(page.getByTestId('pay-ref')).toHaveText(paymentIntentId);

        const payAmount = page.getByTestId('pay-amount');
        await expect(payAmount).toBeVisible();
        // `pay-amount` renders the intent's amount through the currency pipe, so
        // its digits are the order total read on the review page.
        expect(((await payAmount.textContent()) ?? '').replace(/\D/g, '')).toBe(orderTotalDigits);

        await expect(page.getByTestId('pay-succeeded')).toHaveText('Sikeres fizetés');
        await expect(page.getByTestId('pay-declined')).toHaveText('Elutasított fizetés');
        await expect(page.getByTestId('pay-pending')).toHaveText('Függőben marad');

        // The four card fields are scenery: they decide nothing, so their
        // presence is the whole of what they assert.
        for (const cardField of [
          'pay-card-number',
          'pay-card-holder',
          'pay-card-expiry',
          'pay-card-cvc',
        ]) {
          await expect(page.getByTestId(cardField)).toBeVisible();
        }
      });

      // 9. Press `pay-pending`. The demo payment page POSTs
      // `…/payment-intents/<id>/outcome` with `{ outcome: 'pending' }` and then
      // calls `window.location.assign(intent.returnUrl)`, which is
      // `/penztar?paymentIntentId=<id>&mi-scenario=payment-pending-resolves`:
      // the shop's own scenario travels back on the return URL, so the return
      // leg's page load itself runs under `payment-pending-resolves`.
      await test.step("Press `pay-pending`. The demo payment page POSTs `…/payment-intents/<id>/outcome` with `{ outcome: 'pending' }` and then calls `window.location.assign(intent.returnUrl)`, which is `/penztar?paymentIntentId=<id>&mi-scenario=payment-pending-resolves` — the shop's own scenario now travels back on the return URL, so the return leg's page load itself runs under `payment-pending-resolves`.", async () => {
        const navigationsBefore = navigations.length;
        // The marker is set here, before the press, so the slice below holds
        // exactly the return leg's own calls beside the outcome POST that
        // starts it.
        requestsBeforeReturn = paymentRequests.length;

        await page.getByTestId('pay-pending').click();

        // The return is a full page load to the intent's own `returnUrl`, so
        // the transient hop is a recorded main-frame navigation; the shop's
        // cold-start page then moves on to the review step. The scenario the
        // return URL carries is what makes the leg's own reads answer as
        // pending-then-succeeded.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        const returnUrl = `/penztar?paymentIntentId=${paymentIntentId}&mi-scenario=payment-pending-resolves`;
        const returnHops = navigations.slice(navigationsBefore);
        expect(returnHops.some((url) => url.includes(returnUrl))).toBe(true);

        const returned = paymentRequests.slice(requestsBeforeReturn);
        const outcomePosts = returned.filter(
          (entry) => entry.method === 'POST' && entry.url.endsWith(`${intentPath}/outcome`),
        );
        expect(outcomePosts).toHaveLength(1);

        const outcomeResponse = paymentResponses.find((entry) =>
          entry.url.endsWith(`${intentPath}/outcome`),
        );
        expect(outcomeResponse?.status).toBe(200);

        // The return leg's cold-start read of the pending intent follows the
        // outcome POST that sent the shopper back.
        const intentReads = returned.filter(
          (entry) => entry.method === 'GET' && entry.url.includes(intentPath),
        );
        expect(intentReads.length).toBeGreaterThan(0);
      });

      // 10. Observe the review step on arrival, in the page load the return URL
      // started: `review-payment-status` reads "Az eredmény még nem ismert,
      // ezért nem tekintjük elutasítottnak." (the unknown-pending line),
      // `review-payment-polling` is shown reading "Az állapotot másodpercenként
      // automatikusan ellenőrizzük." and `review-payment-check` carries a
      // button reading "Állapot ellenőrzése" under it. The scenario the return
      // URL carried applies to every GET the storefront issues from this page
      // load, so the mock's `payment-pending-resolves` behaviour (a pending
      // intent answers its reads as pending until the third read in one page
      // load, which answers it as succeeded) needs no second page load.
      await test.step('Observe the review step on arrival, in the page load the return URL started: `review-payment-status` reads "Az eredmény még nem ismert, ezért nem tekintjük elutasítottnak." (the unknown-pending line), `review-payment-polling` is shown reading "Az állapotot másodpercenként automatikusan ellenőrizzük." and `review-payment-check` carries a button reading "Állapot ellenőrzése" under it. The scenario the return URL carried applies to every GET the storefront issues from this page load, so the mock\'s `payment-pending-resolves` behaviour (a pending intent answers its reads as pending until the third read in one page load, which answers it as succeeded) needs no second page load.', async () => {
        // The intent outlived the round trip and the payment is still pending,
        // so the page polls the intent on its own and says so; the manual check
        // control stays on screen under the polling line while the poll runs.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'Az eredmény még nem ismert, ezért nem tekintjük elutasítottnak.',
        );
        await expect(page.getByTestId('review-payment-polling')).toHaveText(
          'Az állapotot másodpercenként automatikusan ellenőrizzük.',
        );
        await expect(page.getByTestId('review-payment-check').getByRole('button')).toHaveText(
          'Állapot ellenőrzése',
        );
        await expect(page.getByTestId('review-payment-poll-exhausted')).toHaveCount(0);
      });

      // 11. Wait for the poll to stop on success: the mock's third read of the
      // still-pending intent within this page load resolves it as `succeeded`
      // and persists, and the storefront clears `review-payment-polling` and
      // `review-payment-check` and renders the success branch.
      await test.step("Wait for the poll to stop on success: the mock's third read of the still-pending intent within this page load resolves it as `succeeded` and persists, and the storefront clears `review-payment-polling` and `review-payment-check` and renders the success branch.", async () => {
        // The third read lands about two seconds after the load (one cold start
        // plus two poll reads a second apart), and the budget the poll's ten
        // reads would need fits inside this wider deadline.
        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'A fizetés jóváhagyva.',
          {
            timeout: 20000,
          },
        );
        await expect(page.getByTestId('review-payment-polling')).toHaveCount(0);
        await expect(page.getByTestId('review-payment-poll-exhausted')).toHaveCount(0);
        await expect(page.getByTestId('review-payment-check')).toHaveCount(0);
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);

        // Exactly this page load's reads: the cold start that answered pending
        // plus the two poll reads, the last of which answered succeeded and
        // scheduled no further one.
        const thisLoad = paymentRequests.slice(requestsBeforeReturn);
        const intentGets = thisLoad.filter(
          (entry) => entry.method === 'GET' && entry.url.includes(intentPath),
        );
        expect(intentGets).toHaveLength(3);

        // Neither a new payment nor an order was started without a press of its
        // own; the outcome POST that began the leg is not either of them.
        const unrequestedWrites = thisLoad.filter(
          (entry) =>
            entry.method === 'POST' &&
            (entry.url.endsWith(createIntentPath) || entry.url.endsWith(ordersPath)),
        );
        expect(unrequestedWrites).toHaveLength(0);
      });

      // 12. Tick `review-consent-terms-input` (a no-op if the round trip
      // preserved a tick), then press the inner button of `review-submit`
      // ("Demórendelés véglegesítése").
      await test.step('Tick `review-consent-terms-input` (a no-op if the round trip preserved a tick), then press the inner button of `review-submit` ("Demórendelés véglegesítése").', async () => {
        const submitsBefore = paymentRequests.length;

        const termsConsent = page.getByTestId('review-consent-terms-input');
        // `check()` ticks the box and is a no-op when a tick the round trip
        // preserved is already there.
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        const submitButton = page.getByTestId('review-submit').getByRole('button');
        await expect(submitButton).toHaveText('Demórendelés véglegesítése');
        await submitButton.click();

        await expect(page).toHaveURL(/\/penztar\/siker\/[^/]+$/);
        await expect(page.getByTestId('order-receipt')).toBeVisible();
        await expect(page.getByTestId('receipt-order-number')).not.toBeEmpty();
        await expect(page.getByTestId('receipt-row-payment')).toContainText('Bankkártya');
        await expect(page.getByTestId('receipt-row-status')).toContainText(
          'Demó rendelés visszaigazolva',
        );

        // The approved payment backs exactly one order, and it was accepted: a
        // single POST to the order endpoint, answered 201.
        const orderPosts = paymentRequests
          .slice(submitsBefore)
          .filter((entry) => entry.method === 'POST' && entry.url.endsWith(ordersPath));
        expect(orderPosts).toHaveLength(1);

        const orderResponse = paymentResponses.find(
          (entry) => entry.method === 'POST' && entry.url.endsWith(ordersPath),
        );
        expect(orderResponse?.status).toBe(201);
      });
    },
  );
});
