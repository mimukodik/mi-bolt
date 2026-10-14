// spec: specs/shop-fault-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page splits its buy chrome at this breakpoint: `product-page.scss`
// hides the in-flow `.cta-desktop` block (the desktop add control and the
// desktop banner) below 1024px, and `mobile-buy-rail.scss` shows
// `purchase-rail` there instead. Both mounts stay in the DOM at both widths and
// both read the page's single `addError`, so the refusal banner is rendered
// twice and every assertion below is scoped to the mount the viewport paints.
const BUY_BREAKPOINT_PX = 1024;

// The refusal copy `describeAddFailure` composes for a cart-add failure that is
// not a per-product quantity limit. It names neither the 503 nor the server:
// the shopper only learns that the add failed and the cart is unchanged.
const ADD_REFUSAL = 'A termék hozzáadása nem sikerült; a kosár változatlan.';

test.describe('Shop: service faults', () => {
  test(
    'adding to the cart is refused, so the product page reports it and the cart stays empty',
    { tag: '@integration' },
    async ({ page }) => {
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= BUY_BREAKPOINT_PX;
      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const cartBadge = page.getByTestId('cart-badge');
      const productPage = page.getByTestId('product-page');
      const productName = page.getByTestId('product-name');
      const devicePrices = page.getByRole('region', { name: 'Árak' });
      const errorState = page.getByTestId('error-state');

      // The add control and the refusal banner, in the mount this viewport
      // shows; the other mount's copy is in the DOM but painted out.
      const addControl = desktopViewport
        ? page.getByTestId('add-to-cart-button').getByRole('button')
        : page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button');
      const banner = desktopViewport
        ? page.getByTestId('add-to-cart').getByTestId('status-message')
        : page.getByTestId('purchase-rail').getByTestId('status-message');
      const otherBanner = desktopViewport
        ? page.getByTestId('purchase-rail').getByTestId('status-message')
        : page.getByTestId('add-to-cart').getByTestId('status-message');

      // 1. Open the catalogue with the add-to-cart fault on the URL's first
      // load, then wait for the grid and read `cart-badge`.
      await test.step('1. Open the catalogue with the add-to-cart fault on the URL\'s first load: `/telefonok` with `?mi-scenario=fail-cart-add`, wait for the grid, and read `cart-badge`. The catalogue loads normally (only the add endpoint is broken). `cart-badge` reads "0": a fresh context holds an empty cart.', async () => {
        // The fault is read from the query on this first load and held by the
        // mock for the rest of the browsing context, so every `POST
        // /cart/items` in this context answers 503 from here on.
        await page.goto('/telefonok?mi-scenario=fail-cart-add');

        // Only the `cart-add` endpoint is broken, so the list endpoint answers
        // as usual. The count's copy is matched as a substring: the element's
        // raw text carries the template's surrounding whitespace, which an
        // anchored pattern would not survive.
        await expect(resultCount).toContainText('találat a szűrt feltételek szerint');
        await expect(cards.first()).toBeVisible();
        await expect(errorState).toHaveCount(0);

        // A fresh browsing context starts on the mock's empty cart, so the
        // header badge is the facade's zero baseline.
        await expect(cartBadge).toHaveText('0');
      });

      // 2. Click the CTA of the first card that carries no stock marker.
      await test.step('2. Click the `product-card-cta` of the first `product-card` that carries no `product-card-stock` marker. `product-page` is visible and the product loads normally: `product-name` is not empty, `product-stock` reads "Raktáron a demó készletben" and the "Készülékár" price block shows an amount. The add control is enabled and its button reads "Kosárba teszem".', async () => {
        // Picking by what the screen shows: the "Elfogyott" marker in the card
        // is `product-card-stock`, so the first card without one is in stock.
        const firstAvailableCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await firstAvailableCard.getByTestId('product-card-cta').click();

        // The card's own link carries the variant query, so the in-app
        // navigation lands on the product route with no `mi-scenario`: the mock
        // holds the fault for the browsing context, not the URL.
        await expect(page).toHaveURL(/\/telefonok\/[^/?#]+\?variant=/);
        await expect(page).not.toHaveURL(/mi-scenario/);

        // The product itself is unaffected by the add fault.
        await expect(productPage).toBeVisible();
        await expect(productName).toBeVisible();
        await expect(productName).toHaveText(/\S/);
        await expect(page.getByTestId('product-stock')).toHaveText('Raktáron a demó készletben');

        // The "Készülékár" price block in the buy box is the mount that stays on
        // screen at both widths; `PriceBlock` writes its formatted value into
        // the `price-amount` span once the product has loaded.
        await expect(devicePrices).toBeVisible();
        await expect(devicePrices.getByText('Készülékár', { exact: true })).toBeVisible();
        await expect(devicePrices.getByTestId('price-amount')).toHaveText(/\d/);

        // The add control this viewport shows is enabled and carries the CTA copy.
        await expect(addControl).toBeVisible();
        await expect(addControl).toBeEnabled();
        await expect(addControl).toHaveText('Kosárba teszem');
      });

      // 3. Press the visible add control.
      await test.step('3. Press the visible add control: the inner button of `add-to-cart-button` at 1024 px and wider, `purchase-cta` inside `purchase-rail` below 1024 px. The visible `status-message` with role `alert` appears reading exactly "A termék hozzáadása nem sikerült; a kosár változatlan.", with a "Bezárás" button, in the mount the viewport shows. The message never names the 503 or the server: the shopper is told the add failed and the cart is unchanged. `cart-badge` still reads "0" and no `error-state` appears on the product page. The add button is enabled again and its label is back to "Kosárba teszem".', async () => {
        await addControl.click();

        // The page's single cart mutation answers 503, so the mount on screen
        // shows the shared `StatusMessage` at severity `error` — the role
        // `alert` live region — carrying the page's own refusal copy. While the
        // request is in flight the same element shows the `info` notice, so
        // these assertions retry until the refusal settles.
        await expect(banner).toHaveRole('alert');
        await expect(banner.getByText(ADD_REFUSAL, { exact: true })).toBeVisible();
        await expect(banner.getByRole('button', { name: 'Bezárás' })).toBeVisible();

        // The refusal is shown once, where the shopper is looking: the other
        // mount keeps its copy painted out.
        await expect(otherBanner).toBeHidden();

        // The refused add leaves the cart untouched, and the page keeps its
        // success state rather than an error state of its own.
        await expect(cartBadge).toHaveText('0');
        await expect(errorState).toHaveCount(0);

        // The mutation has settled, so the control is enabled again with its
        // resting label: pressing it again is the only retry on offer.
        await expect(addControl).toBeEnabled();
        await expect(addControl).toHaveText('Kosárba teszem');
      });

      // 4. Press "Bezárás" on the refusal banner.
      await test.step('4. Press "Bezárás" on the refusal banner. The banner is dismissed: the visible `status-message` is gone. The product page itself is unchanged — `product-name`, the price block and the enabled add control are all still there.', async () => {
        await banner.getByRole('button', { name: 'Bezárás' }).click();

        // Dismissing clears the page's one `addError`, so both mounts drop the
        // banner and no status message is left anywhere on the page.
        await expect(page.getByTestId('status-message')).toHaveCount(0);

        // The product page itself is untouched.
        await expect(productPage).toBeVisible();
        await expect(productName).toBeVisible();
        await expect(productName).toHaveText(/\S/);
        await expect(devicePrices.getByTestId('price-amount')).toHaveText(/\d/);
        await expect(addControl).toBeEnabled();
        await expect(addControl).toHaveText('Kosárba teszem');
      });

      // 5. Press the same add control once more.
      await test.step('5. Press the same add control once more. The same refusal banner returns with the same text "A termék hozzáadása nem sikerült; a kosár változatlan.": the banner carries no retry control of its own, so pressing the add control again IS the retry, and it fails the same way. `cart-badge` still reads "0".', async () => {
        await addControl.click();

        // The fault answers every call with 503, and the banner's only control
        // is "Bezárás": the add control is the retry, and it fails the same way.
        await expect(banner).toHaveRole('alert');
        await expect(banner.getByText(ADD_REFUSAL, { exact: true })).toBeVisible();
        await expect(banner.getByRole('button', { name: 'Bezárás' })).toBeVisible();

        await expect(cartBadge).toHaveText('0');
      });

      // 6. Click the header's cart link to open the cart.
      await test.step('6. Click the header\'s `cart-link` to open the cart. `cart-page` shows its empty state: the title "A kosarad még üres.", the message "Nézd meg a demókészülékeket, és válaszd ki a kedvenced." and the action "Telefonokat nézek". Exactly zero `cart-line` is rendered, which proves the refused add left the cart unchanged. No refusal banner follows the shopper onto the cart page.', async () => {
        await page.getByTestId('cart-link').click();
        await expect(page).toHaveURL(/\/penztar\/kosar$/);

        // The cart was never written, so the cart page shows its empty state.
        const cartPage = page.getByTestId('cart-page');
        const emptyState = page.getByTestId('empty-state');
        await expect(cartPage).toBeVisible();
        await expect(emptyState.getByRole('heading', { level: 2 })).toHaveText(
          'A kosarad még üres.',
        );
        await expect(
          emptyState.getByText('Nézd meg a demókészülékeket, és válaszd ki a kedvenced.', {
            exact: true,
          }),
        ).toBeVisible();
        await expect(emptyState.getByRole('button', { name: 'Telefonokat nézek' })).toBeVisible();

        // Not one line was added by the refused add, and the product page's
        // refusal banner does not follow the shopper onto the cart page.
        await expect(page.getByTestId('cart-line')).toHaveCount(0);
        await expect(cartPage.getByTestId('status-message')).toHaveCount(0);
        await expect(page.getByText(ADD_REFUSAL)).toHaveCount(0);
      });
    },
  );
});
