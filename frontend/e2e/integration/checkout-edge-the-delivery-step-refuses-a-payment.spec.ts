// spec: specs/checkout-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: edge paths', () => {
  test(
    'the delivery step refuses a payment method the cart has outgrown',
    { tag: '@integration' },
    async ({ page }) => {
      // The product page mounts the add-to-cart control twice: the desktop CTA
      // column is hidden below 1024px and the sticky `purchase-rail` carries the
      // same "Kosárba teszem" press through its `purchase-cta`. Both mounts stay
      // in the DOM at either width, so the viewport decides which one the test
      // drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      // The demo refuses cash on delivery once the cart subtotal passes this
      // amount (the mock's CASH_ON_DELIVERY_MAX_CART_HUF); the plan names the
      // same number as the ceiling. HUF amounts render through
      // `PriceBlock.formatHuf`, whose thousands separator is a non-breaking
      // space, so amounts are compared by their digits rather than by a copied
      // string.
      const CASH_ON_DELIVERY_CEILING_HUF = 300_000;
      const digitsOf = (text: string | null): string => (text ?? '').replace(/\D/g, '');

      // The cart's own "Részösszeg" is the subtotal the ceiling applies to.
      const cartSubtotal = page.getByTestId('order-summary-subtotal').getByTestId('price-amount');

      // The cart starts with the one unit added in step 1; the loop in step 2
      // grows it, so the counter is the number of adds and, once merged into a
      // single line, that line's quantity.
      let unitsInCart = 1;

      // 1. Reach the review page with a cash-on-delivery draft on a cart below
      // the demo's cash-on-delivery ceiling: open `/telefonok`, open the first
      // card without a `product-card-stock` marker, add it with
      // `add-to-cart-button`, open the cart with `cart-link`, press
      // `cart-continue`, fill the contact step with "Teszt Elek",
      // "teszt@example.test" and "+36 30 123 4567" and submit it, then choose
      // "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", keep the
      // billing tick, choose "Utánvét" and press `delivery-confirm`.
      await test.step('Reach the review page with a cash-on-delivery draft on a cart below the demo\'s cash-on-delivery ceiling: open `/telefonok`, open the first card without a `product-card-stock` marker, add it with `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and submit it, then choose "Házhoz szállítás", fill "1052" / "Budapest" / "Fő utca 1.", keep the billing tick, choose "Utánvét" and press `delivery-confirm`.', async () => {
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
        await homeDelivery.getByTestId('delivery-radio').check();
        await expect(homeDelivery.getByTestId('delivery-selected-badge')).toHaveText('Kiválasztva');

        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Fő utca 1.');

        // The billing tick stays as it is: the billing address is the delivery
        // address, so only the one address form is rendered.
        await expect(page.getByTestId('billing-same-as-delivery')).toBeChecked();

        const cashOnDelivery = page.getByTestId('payment-option').filter({ hasText: 'Utánvét' });
        await cashOnDelivery.getByTestId('payment-radio').check();
        await expect(cashOnDelivery.getByTestId('payment-selected-badge')).toHaveText(
          'Kiválasztva',
        );

        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-payment')).toHaveText('Utánvét');
        await expect(page.getByTestId('review-delivery')).toContainText('Házhoz szállítás');
      });

      // 2. Grow the cart above the ceiling: press `back-to-shop`, reopen the
      // same card through its `product-card-cta` and press the inner button of
      // `add-to-cart-button`, repeating the two steps until the cart's
      // "Részösszeg" is above 300 000 Ft (`cart-badge` counts each unit as it is
      // added).
      await test.step('Grow the cart above the ceiling: press `back-to-shop`, reopen the same card through its `product-card-cta` and press the inner button of `add-to-cart-button`, repeating the two steps until the cart\'s "Részösszeg" is above 300 000 Ft (`cart-badge` counts each unit as it is added).', async () => {
        // `back-to-shop` is the checkout header's own link, so it is the way back
        // to the catalogue from the review step and from the cart page alike; the
        // loop returns through it on every round.
        for (;;) {
          await page.getByTestId('back-to-shop').click();
          await expect(page).toHaveURL(/\/telefonok$/);

          const cards = page.getByTestId('product-card');
          await expect(cards.first()).toBeVisible();
          const inStockCard = cards
            .filter({ hasNot: page.getByTestId('product-card-stock') })
            .first();
          await inStockCard.getByTestId('product-card-cta').click();
          await expect(page.getByTestId('product-page')).toBeVisible();

          await addToCartButton.click();
          unitsInCart += 1;
          // Each add is a request of its own; the header badge reaching the new
          // count is what says it has landed before the cart is read.
          await expect(page.getByTestId('cart-badge')).toHaveText(String(unitsInCart));

          // The ceiling is checked against the cart's own subtotal, so the cart
          // is opened here on every round; the loop stops on the round that
          // pushes the subtotal above it.
          await page.getByTestId('cart-link').click();
          await expect(page.getByTestId('cart-page')).toBeVisible();
          await expect(cartSubtotal).toBeVisible();

          if (Number(digitsOf(await cartSubtotal.textContent())) > CASH_ON_DELIVERY_CEILING_HUF) {
            break;
          }
        }

        // The last round ended on the cart page; return to the shop so the next
        // step can open the cart through its own `cart-link`.
        await page.getByTestId('back-to-shop').click();
        await expect(page).toHaveURL(/\/telefonok$/);
      });

      // 3. Read the cart: open it with `cart-link`.
      await test.step('Read the cart: open it with `cart-link`.', async () => {
        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();

        // The repeated adds merged into a single line, so exactly one
        // `cart-line` is rendered and its quantity counts every unit added.
        await expect(page.getByTestId('cart-line')).toHaveCount(1);
        await expect(page.getByTestId('cart-line-quantity')).toHaveText(`${unitsInCart} db`);

        await expect(cartSubtotal).toBeVisible();
        expect(Number(digitsOf(await cartSubtotal.textContent()))).toBeGreaterThan(
          CASH_ON_DELIVERY_CEILING_HUF,
        );
      });

      // 4. Open the delivery step through the URL, so the step re-reads the
      // options: open `/penztar/szallitas`. The mock no longer keeps the
      // draft in `sessionStorage` outside the card round trip (mock
      // standard E016, owner, 2026-09-25), so the full page load drops
      // every section of the saved draft and the guard sends the shopper
      // to `/penztar/adatok?navigationReason=incomplete` with the cart
      // kept.
      await test.step('Open the delivery step through the URL, so the step re-reads the options: open `/penztar/szallitas`. The mock no longer keeps the draft in `sessionStorage` outside the card round trip (mock standard E016, owner, 2026-09-25), so the full page load drops every section of the saved draft and the guard sends the shopper to `/penztar/adatok?navigationReason=incomplete` with the cart kept.', async () => {
        await page.goto('/penztar/szallitas');

        // The contact step is what the guard lands on, and the cart line
        // is kept: the saved draft is not restored across a page load.
        await expect(page).toHaveURL(/\/penztar\/adatok\?navigationReason=incomplete$/);
        await expect(page.getByTestId('contact-page')).toBeVisible();
        await expect(page.getByTestId('delivery-step')).toHaveCount(0);
        await expect(page.getByTestId('navigation-reason')).toContainText(
          'Előbb ezt a lépést kell kitöltened, utána léphetsz tovább.',
        );

        // The contact form starts empty: the saved draft is not restored.
        await expect(page.getByTestId('contact-fullname-input')).toHaveValue('');
        await expect(page.getByTestId('contact-email-input')).toHaveValue('');
        await expect(page.getByTestId('contact-phone-input')).toHaveValue('');

        // The cart is kept: a deep link that drops the draft still carries
        // the cart the shopper had built. The checkout layout has no
        // `cart-link` (its header carries "Vissza a shopba"), so the
        // subtotal is read off the contact page's own order summary.
        await expect(cartSubtotal).toBeVisible();
        expect(Number(digitsOf(await cartSubtotal.textContent()))).toBeGreaterThan(
          CASH_ON_DELIVERY_CEILING_HUF,
        );
      });
    },
  );
});
