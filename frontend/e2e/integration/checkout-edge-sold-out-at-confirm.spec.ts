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

// The default page size: the catalogue lists one card per (product, storage)
// entry, 12 of them per page.
const DEFAULT_PAGE_SIZE = 12;

// The refusal copy `ReviewStep` renders for the order call's 409 `OUT_OF_STOCK`.
// It names neither the status nor the Problem code, and it promises that the
// contact data survives the trip back to the cart.
const STOCK_REFUSAL =
  'Egy vagy több termék közben elfogyott, ezért a rendelés nem jött létre. A kosárban javíthatod; a megadott adataid megmaradnak.';

test.describe('An order refused because stock ran out meanwhile', () => {
  test(
    '[E085] an order refused at confirm for lost stock goes back to the cart and keeps the contact data',
    { tag: '@integration' },
    async ({ page }) => {
      const wideLayout = (page.viewportSize()?.width ?? 0) >= BUY_BREAKPOINT_PX;

      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const sort = page.getByTestId('catalog-sort');
      const cartBadge = page.getByTestId('cart-badge');

      // The add control of the mount this viewport shows; `app-button` puts the
      // test id on its host element, so the press targets the native `button`
      // inside it.
      const addControl = wideLayout
        ? page.getByTestId('add-to-cart-button').getByRole('button')
        : page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button');

      // Every HUF amount renders through `PriceBlock.formatHuf`, whose thousands
      // separator is a non-breaking space, so the visible card prices are
      // compared by their digits rather than by a copied string.
      const readPriceAmounts = async (): Promise<number[]> => {
        const texts = await cards.getByTestId('price-amount').allTextContents();
        return texts.map((text) => Number.parseInt(text.replace(/\s/g, ''), 10));
      };

      // The order-call recorder: every `POST /api/v1/orders` the path makes,
      // with the status it answered. The path may make exactly one, at the final
      // submit, and the scenario refuses it.
      const orderStatuses: number[] = [];
      page.on('response', (response) => {
        if (response.request().method() !== 'POST') return;
        if (!response.url().endsWith('/api/v1/orders')) return;
        orderStatuses.push(response.status());
      });

      // The phone the story orders, read off the screen in step 2 and never
      // named by slug or product name.
      let productName = '';

      // 1. Start from a fresh browser context (no stored cart or checkout
      // snapshot) and open the path
      // `/telefonok?sort=price_asc&mi-scenario=stock-lost-once-order` relative
      // to the Playwright baseURL. This is the first and only page load: the
      // mock reads `mi-scenario` here, so every later step moves by clicking and
      // the page is never reloaded (a reload re-arms the mock and restores the
      // stock). Run the story twice, at 1920x1080 and at 390x844.
      await test.step('1. Start from a fresh browser context (no stored cart or checkout snapshot) and open the path `/telefonok?sort=price_asc&mi-scenario=stock-lost-once-order` relative to the Playwright baseURL. This is the first and only page load: the mock reads `mi-scenario` here, so every later step moves by clicking and the page is never reloaded (a reload re-arms the mock and restores the stock). Run the story twice, at 1920x1080 and at 390x844.', async () => {
        await page.goto(`/telefonok?sort=price_asc&${SCENARIO_QUERY}`);

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');

        // A select reads its selected option: the value plus the label that
        // value carries (`CatalogToolbar.sortLabel()`).
        await expect(sort).toHaveValue('price_asc');
        await expect(sort.locator('option[value="price_asc"]')).toHaveText('Ár szerint növekvő');
        await expect(cartBadge).toHaveText('0');

        await expect(cards).toHaveCount(DEFAULT_PAGE_SIZE);

        // While the sorted response is in flight the grid keeps the previous
        // page's cards on screen (the refreshing branch of `async-content.html`),
        // so the order is retried rather than read once: `toPass` is the tool the
        // seed names for a block that has to be retried (e2e/seed.spec.ts, rule 4).
        await expect(async () => {
          const prices = await readPriceAmounts();
          expect(prices).toHaveLength(DEFAULT_PAGE_SIZE);
          expect(prices).toEqual([...prices].sort((a, b) => a - b));
        }).toPass();

        // Only the most expensive card (159 990 Ft) is sold out: it is the last
        // one in the price-ascending order and the only card carrying the
        // "Elfogyott" `product-card-stock` marker.
        await expect(page.getByTestId('product-card-stock')).toHaveCount(1);
        await expect(cards.last().getByTestId('product-card-stock')).toHaveText('Elfogyott');
        await expect(cards.last().getByTestId('price-amount')).toHaveText('159 990');
      });

      // 2. Click the `product-card-cta` of the first card that has no
      // `product-card-stock` marker (the 69 990 Ft card at the top of the list).
      await test.step('2. Click the `product-card-cta` of the first card that has no `product-card-stock` marker (the 69 990 Ft card at the top of the list).', async () => {
        // Picking by what the screen shows: an out-of-stock card carries the
        // "Elfogyott" `product-card-stock` marker, so the first card without one
        // is the phone the catalogue offers as buyable.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');

        // The name is read off the opened page, so the cart notice of step 10
        // can be checked without naming a product or a slug.
        productName = ((await page.getByTestId('product-name').textContent()) ?? '').trim();
        expect(productName).not.toBe('');

        // Only the mount the viewport shows is on screen; the other mount stays
        // in the DOM with the same label and is `display: none`.
        if (wideLayout) {
          await expect(page.getByTestId('add-to-cart-button').getByRole('button')).toBeVisible();
          await expect(page.getByTestId('add-to-cart-button').getByRole('button')).toBeEnabled();
          await expect(page.getByTestId('purchase-cta')).toBeHidden();
        } else {
          await expect(page.getByTestId('add-to-cart-button')).toBeHidden();
          await expect(page.getByTestId('purchase-cta').getByRole('button')).toBeVisible();
          await expect(page.getByTestId('purchase-cta').getByRole('button')).toBeEnabled();
        }
        await expect(addControl).toHaveText('Kosárba teszem');
      });

      // 3. Click the add control for the width: the inner button of
      // `add-to-cart-button` at 1024 px and wider, the inner button of
      // `purchase-cta` below.
      await test.step('3. Click the add control for the width: the inner button of `add-to-cart-button` at 1024 px and wider, the inner button of `purchase-cta` below.', async () => {
        await addControl.click();

        await expect(cartBadge).toHaveText('1');
      });

      // 4. Click `cart-link`.
      await test.step('4. Click `cart-link`.', async () => {
        await page.getByTestId('cart-link').click();

        await expect(page).toHaveURL(/\/penztar\/kosar$/);
        await expect(page.getByTestId('cart-page')).toBeVisible();

        await expect(page.getByTestId('cart-count')).toHaveText('Kosárban található termékek (1)');
        const cartLines = page.getByTestId('cart-line');
        await expect(cartLines).toHaveCount(1);
        await expect(cartLines.getByTestId('cart-line-quantity')).toHaveText('1 db');
        await expect(cartLines.getByTestId('cart-line-name')).toHaveText(productName);
        await expect(cartLines.getByTestId('price-amount')).toHaveText('69 990');

        const cartContinue = page.getByTestId('cart-continue');
        await expect(cartContinue).toBeVisible();
        await expect(cartContinue.getByRole('button')).toBeEnabled();
        await expect(cartContinue.getByRole('button')).toHaveText('Tovább az adatokhoz');

        // The cart gathered nothing to say about a stock change here.
        await expect(page.getByTestId('cart-notice')).toHaveCount(0);
      });

      // 5. Click `cart-continue`.
      await test.step('5. Click `cart-continue`.', async () => {
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(page.getByTestId('contact-fullname-input')).toHaveValue('');
        await expect(page.getByTestId('contact-email-input')).toHaveValue('');
        await expect(page.getByTestId('contact-phone-input')).toHaveValue('');
      });

      // 6. Fill `contact-fullname-input` with `Teszt Elek`, `contact-email-input`
      // with `teszt@example.test`, `contact-phone-input` with `+36 30 123 4567`,
      // then click `contact-submit`.
      await test.step('6. Fill `contact-fullname-input` with `Teszt Elek`, `contact-email-input` with `teszt@example.test`, `contact-phone-input` with `+36 30 123 4567`, then click `contact-submit`.', async () => {
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
      });

      // 7. Click the first `delivery-radio` (the `Házhoz szállítás` option,
      // 0 Ft).
      await test.step('7. Click the first `delivery-radio` (the `Házhoz szállítás` option, 0 Ft).', async () => {
        await page.getByTestId('delivery-radio').first().click();

        // Home delivery is the option that reveals the address group; it opens
        // empty, because the delivery step has not been filled yet.
        await expect(page.getByTestId('address-input-postalCode')).toHaveValue('');
        await expect(page.getByTestId('address-input-city')).toHaveValue('');
        await expect(page.getByTestId('address-input-line1')).toHaveValue('');
        await expect(page.getByTestId('address-input-line2')).toHaveValue('');
        await expect(page.getByTestId('summary-row-delivery')).toContainText('Házhoz szállítás');
      });

      // 8. Fill `address-input-postalCode` with `1052`, `address-input-city`
      // with `Budapest`, `address-input-line1` with `Fő utca 1.`, click the
      // second `payment-radio` (the `Utánvét` option, 490 Ft), then click
      // `delivery-confirm`.
      await test.step('8. Fill `address-input-postalCode` with `1052`, `address-input-city` with `Budapest`, `address-input-line1` with `Fő utca 1.`, click the second `payment-radio` (the `Utánvét` option, 490 Ft), then click `delivery-confirm`.', async () => {
        await page.getByTestId('address-input-postalCode').fill('1052');
        await page.getByTestId('address-input-city').fill('Budapest');
        await page.getByTestId('address-input-line1').fill('Fő utca 1.');
        await page.getByTestId('payment-radio').nth(1).click();
        await page.getByTestId('delivery-confirm').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/ellenorzes$/);
        await expect(page.getByTestId('review-page')).toBeVisible();
        await expect(page.getByTestId('review-line')).toHaveCount(1);

        // The 69 990 Ft device plus the 490 Ft cash-on-delivery fee.
        const total = page.getByTestId('order-summary-total');
        await expect(total).toContainText('Végösszeg');
        await expect(total.getByTestId('price-amount')).toHaveText('70 480');
      });

      // 9. Tick `review-consent-terms-input` and click the inner button of
      // `review-submit` (`Demórendelés véglegesítése`).
      await test.step('9. Tick `review-consent-terms-input` and click the inner button of `review-submit` (`Demórendelés véglegesítése`).', async () => {
        const termsConsent = page.getByTestId('review-consent-terms-input');
        await termsConsent.check();
        await expect(termsConsent).toBeChecked();

        const submitButton = page.getByTestId('review-submit').getByRole('button');
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

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
        await expect(page.getByTestId('checkout-header')).toBeVisible();
        await expect(page.getByTestId('back-to-shop')).toHaveText('Vissza a shopba');
        await expect(page.getByTestId('main-header')).toHaveCount(0);
        await expect(cartBadge).toHaveCount(0);

        // The order call answered 409 exactly once; the recorder holds no other
        // order write.
        expect(orderStatuses).toEqual([409]);
      });

      // 10. Click the inner button of `review-stock-back-to-cart`.
      await test.step('10. Click the inner button of `review-stock-back-to-cart`.', async () => {
        await page.getByTestId('review-stock-back-to-cart').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/kosar$/);
        await expect(page.getByTestId('cart-page')).toBeVisible();

        // The refused line is not a line any more: the cart's own reconcile
        // dropped it, said so once, and fell back to its empty state.
        await expect(page.getByTestId('cart-line')).toHaveCount(0);
        await expect(page.getByTestId('cart-count')).toHaveCount(0);
        await expect(page.getByTestId('cart-notice')).toHaveText(
          `${productName} kikerült a kosárból, mert már nem kapható.`,
        );

        const emptyState = page.getByTestId('empty-state');
        await expect(emptyState.getByRole('heading', { level: 2 })).toHaveText(
          'A kosarad még üres.',
        );
        await expect(
          emptyState.getByText('Nézd meg a demókészülékeket, és válaszd ki a kedvenced.', {
            exact: true,
          }),
        ).toBeVisible();
        await expect(emptyState.getByRole('button', { name: 'Telefonokat nézek' })).toBeVisible();

        // Nothing to remove and nothing to continue with.
        await expect(cartBadge).toHaveCount(0);
        await expect(page.getByTestId('cart-line-remove')).toHaveCount(0);
        await expect(page.getByTestId('cart-continue')).toHaveCount(0);
      });

      // 11. Correct the cart the way the page offers: click the `empty-state`
      // action `Telefonokat nézek`, set `catalog-sort` to `Ár szerint növekvő`,
      // click the `product-card-cta` of the first card without a
      // `product-card-stock` marker, add it with the add control for the width,
      // then click `cart-link`.
      await test.step('11. Correct the cart the way the page offers: click the `empty-state` action `Telefonokat nézek`, set `catalog-sort` to `Ár szerint növekvő`, click the `product-card-cta` of the first card without a `product-card-stock` marker, add it with the add control for the width, then click `cart-link`.', async () => {
        await page
          .getByTestId('empty-state')
          .getByRole('button', { name: 'Telefonokat nézek' })
          .click();

        await expect(page).toHaveURL(/\/telefonok/);
        await expect(cards.first()).toBeVisible();

        await sort.selectOption('price_asc');
        await expect(sort).toHaveValue('price_asc');
        // The order the pick below reads is the sorted one, so the grid is
        // waited for in ascending order as in step 1.
        await expect(async () => {
          const prices = await readPriceAmounts();
          expect(prices).toHaveLength(DEFAULT_PAGE_SIZE);
          expect(prices).toEqual([...prices].sort((a, b) => a - b));
        }).toPass();

        // The phone that cost the story its order is sold out now, so the first
        // card without a marker is a different one.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(addControl).toBeEnabled();
        await addControl.click();
        await expect(cartBadge).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-count')).toHaveText('Kosárban található termékek (1)');
        const cartContinue = page.getByTestId('cart-continue');
        await expect(cartContinue.getByRole('button')).toBeEnabled();
        // The reconcile's notice was a one-shot for the dropped line; the
        // corrected cart carries none.
        await expect(page.getByTestId('cart-notice')).toHaveCount(0);
      });

      // 12. Click `cart-continue`.
      await test.step('12. Click `cart-continue`.', async () => {
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        // The contact data the shopper typed before the refusal is still there;
        // the phone is shown in the schema's normalised form.
        await expect(page.getByTestId('contact-fullname-input')).toHaveValue('Teszt Elek');
        await expect(page.getByTestId('contact-email-input')).toHaveValue('teszt@example.test');
        await expect(page.getByTestId('contact-phone-input')).toHaveValue('+36301234567');
      });
    },
  );
});
