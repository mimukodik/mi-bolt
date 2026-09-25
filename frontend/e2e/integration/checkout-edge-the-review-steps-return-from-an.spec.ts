// spec: specs/checkout-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: edge paths', () => {
  test(
    "the review step's return from an unfinished and from a pending payment",
    { tag: '@integration' },
    async ({ page }) => {
      // The purchase control is laid out differently at the two integration
      // viewports: below 1024px the product page's desktop CTA column is
      // `display: none` and the sticky `purchase-rail` carries the same
      // "Kosárba teszem" press through its `purchase-cta`. Both mounts stay in
      // the DOM at either width, so the viewport decides which one the test
      // drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      // The demo payment application sends the shopper back with a full page
      // load (`window.location.assign`), so the return URL is a main-frame
      // navigation the shop's router then moves on from. Recording every
      // main-frame navigation is what catches the transient
      // `/penztar?paymentIntentId=...` hop.
      const navigations: string[] = [];
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations.push(frame.url());
      });

      // Every intent read is a GET the mock answers; recording them lets the
      // pending check press be pinned to exactly one read of its own.
      const intentReads: string[] = [];
      page.on('request', (request) => {
        if (request.method() !== 'GET') return;
        const url = request.url();
        if (url.includes('/api/v1/payment-intents/')) intentReads.push(url);
      });

      // Both are read off the screens, never pinned: the demo payment page's
      // amount is checked against the review page's own total, and the intent
      // id is the path segment the payment application opens on.
      let orderTotalDigits = '';
      let paymentIntentId = '';

      // 1. Reach the review page with a card draft: open `/telefonok`, open the
      // first card without a `product-card-stock` marker, add it with the inner
      // button of `add-to-cart-button`, open the cart with `cart-link`, press
      // `cart-continue`, fill the contact step with "Teszt Elek",
      // "teszt@example.test" and "+36 30 123 4567" and submit it, then on the
      // delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" /
      // "Fő utca 1.", choose "Bankkártya" and press the inner button of
      // `delivery-confirm`.
      await test.step('Reach the review page with a card draft: open `/telefonok`, open the first card without a `product-card-stock` marker, add it with the inner button of `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and submit it, then on the delivery step choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", choose "Bankkártya" and press the inner button of `delivery-confirm`.', async () => {
        await page.goto('/telefonok');
        const cards = page.getByTestId('product-card');
        // The grid renders a loading status while it is empty, so waiting for
        // the first card means the pick below reads real cards.
        await expect(cards.first()).toBeVisible();
        // The product is never named: the first card that carries no
        // "Elfogyott" marker is the one the screen offers as buyable.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await addToCartButton.click();
        // The add is a request of its own; the header badge reaching 1 is what
        // says it has landed before the cart is opened.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

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

        const homeDelivery = page
          .getByTestId('delivery-option')
          .filter({ hasText: 'Házhoz szállítás' });
        await homeDelivery.click();
        await expect(homeDelivery.getByTestId('delivery-selected-badge')).toHaveText('Kiválasztva');
        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Fő utca 1.');

        const cardPayment = page.getByTestId('payment-option').filter({ hasText: 'Bankkártya' });
        await cardPayment.click();
        await expect(cardPayment.getByTestId('payment-selected-badge')).toHaveText('Kiválasztva');

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

        // The intent the payment application opens on carries this order's
        // total, so the total is read here for `pay-amount` to be checked
        // against.
        const reviewTotal = page.getByTestId('order-summary-total').getByTestId('price-amount');
        await expect(reviewTotal).toBeVisible();
        orderTotalDigits = ((await reviewTotal.textContent()) ?? '').replace(/\D/g, '');
        expect(orderTotalDigits).not.toBe('');
      });

      // 2. Press the inner button of `review-payment-new` and read the demo
      // payment page. Note the payment intent id: it is the path segment of the
      // address bar after `/demo-fizetes/`.
      await test.step('Press the inner button of `review-payment-new` and read the demo payment page. Note the payment intent id: it is the path segment of the address bar after `/demo-fizetes/`.', async () => {
        await page.getByTestId('review-payment-new').getByRole('button').click();

        // The shop is left for the demo payment application, a separate
        // document under `/demo-fizetes/<paymentIntentId>`; the shop's own
        // review markup is gone with it.
        await expect(page).toHaveURL(/\/demo-fizetes\/[^/]+$/);
        await expect(page.getByTestId('review-page')).toHaveCount(0);
        await expect(
          page.getByRole('heading', { level: 1, name: 'Fizetés jóváhagyása' }),
        ).toBeVisible();

        paymentIntentId = new URL(page.url()).pathname.split('/').pop() ?? '';
        expect(paymentIntentId).not.toBe('');

        // `pay-ref` names the transaction, so it is the same intent the address
        // bar carries.
        await expect(page.getByTestId('pay-ref')).toHaveText(paymentIntentId);

        const payAmount = page.getByTestId('pay-amount');
        await expect(payAmount).toBeVisible();
        // `pay-amount` renders the intent's amount through the currency pipe,
        // so its digits are the order total read on the review page.
        expect(((await payAmount.textContent()) ?? '').replace(/\D/g, '')).toBe(orderTotalDigits);

        await expect(page.getByTestId('pay-succeeded')).toHaveText('Sikeres fizetés');
        await expect(page.getByTestId('pay-declined')).toHaveText('Elutasított fizetés');
        await expect(page.getByTestId('pay-pending')).toHaveText('Függőben marad');
      });

      // 3. Return to the shop while the payment is still unfinished, through
      // the return URL the payment application carries: open
      // `/penztar?paymentIntentId=<id>`.
      await test.step('Return to the shop while the payment is still unfinished, through the return URL the payment application carries: open `/penztar?paymentIntentId=<id>`.', async () => {
        // The cold-start page reads the intent (still `requires_action`) and
        // lands on the review step, so the URL assertion is what waits for it.
        await page.goto(`/penztar?paymentIntentId=${paymentIntentId}`);

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'A fizetés nem fejeződött be.',
        );
        await expect(page.getByTestId('review-payment-back').getByRole('button')).toHaveText(
          'Vissza a fizetéshez',
        );
        await expect(page.getByTestId('review-payment-check')).toHaveCount(0);
      });

      // 4. Press the inner button of `review-payment-back`.
      await test.step('Press the inner button of `review-payment-back`.', async () => {
        await page.getByTestId('review-payment-back').getByRole('button').click();

        // The control sends the shopper back to the intent's own redirect URL,
        // so the address is the same intent, never a newly minted one.
        await expect(page).toHaveURL(`/demo-fizetes/${paymentIntentId}`);
        await expect(page.getByTestId('pay-pending')).toBeVisible();
        await expect(page.getByTestId('pay-pending')).toHaveText('Függőben marad');
      });

      // 5. Press `pay-pending`.
      await test.step('Press `pay-pending`.', async () => {
        const navigationsBefore = navigations.length;

        await page.getByTestId('pay-pending').click();

        // The return to the shop is a full page load to the intent's own
        // `returnUrl`, so the transient hop is a recorded main-frame
        // navigation; the shop's cold-start page then moves on to the review
        // step.
        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        expect(
          navigations
            .slice(navigationsBefore)
            .some((url) => url.includes(`/penztar?paymentIntentId=${paymentIntentId}`)),
        ).toBe(true);

        // The return page read the intent once on its way here, and that read
        // is already recorded; the poll this page starts has not read yet (its
        // first read is a second away). Counting from here is what isolates the
        // poll's own reads from that return-page read.
        const readsBeforePoll = intentReads.length;

        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'Az eredmény még nem ismert, ezért nem tekintjük elutasítottnak.',
        );

        // The payment is still pending, so the page polls the intent on its own
        // and says so; no manual check control is offered while a read is still
        // coming.
        await expect(page.getByTestId('review-payment-polling')).toHaveText(
          'Az állapotot másodpercenként automatikusan ellenőrizzük.',
        );
        await expect(page.getByTestId('review-payment-check')).toHaveCount(0);

        // The tenth read still pending is what ends the poll. It arrives about
        // ten seconds after the return, so this one expectation waits longer
        // than the default.
        await expect(page.getByTestId('review-payment-poll-exhausted')).toHaveText(
          'Tíz ellenőrzés után sem ismert a fizetés eredménye. Új fizetést nem indítunk; az „Állapot ellenőrzése” gombbal később újra megnézheted.',
          { timeout: 20000 },
        );

        // Exactly the poll's ten reads, one a second, and nothing more on top.
        expect(intentReads.length).toBe(readsBeforePoll + 10);
        await expect(page.getByTestId('review-payment-polling')).toHaveCount(0);
        await expect(page.getByTestId('review-payment-check').getByRole('button')).toHaveText(
          'Állapot ellenőrzése',
        );

        await expect(page.getByTestId('review-payment-back')).toHaveCount(0);
        await expect(page.getByTestId('review-cta-explanation')).toHaveText(
          'A kártyás fizetés jóváhagyása szükséges a rendelés leadásához.',
        );
        await expect(page.getByTestId('review-submit').getByRole('button')).toBeDisabled();
      });

      // 6. Press the inner button of `review-payment-check` and read the status
      // again.
      await test.step('Press the inner button of `review-payment-check` and read the status again.', async () => {
        const readsBefore = intentReads.length;

        const intentRead = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' &&
            response.url().includes(`/api/v1/payment-intents/${paymentIntentId}`),
        );
        await page.getByTestId('review-payment-check').getByRole('button').click();
        await intentRead;

        await expect(page.getByTestId('review-payment-status')).toHaveText(
          'Az eredmény még nem ismert, ezért nem tekintjük elutasítottnak.',
        );
        await expect(page.getByTestId('review-payment-check').getByRole('button')).toHaveText(
          'Állapot ellenőrzése',
        );
        await expect(page.getByTestId('review-payment-retry')).toHaveCount(0);
        await expect(page.getByTestId('review-payment-new')).toHaveCount(0);

        // Exactly one further read: the press issues a single GET of the intent
        // and schedules no repetition of its own (review-page.ts
        // `onPaymentCheck`).
        expect(intentReads.length).toBe(readsBefore + 1);
      });
    },
  );
});
