// spec: specs/stock-add-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The stock-lost fault this scenario opens with. The mock reads `?mi-scenario=`
// when the document loads and holds it for the browsing context through in-app
// navigation: the first add-to-cart request of that page load takes the
// requested variant's whole demo stock and refuses the add with a 409
// `OUT_OF_STOCK`, and every later catalogue, product and cart read sees that
// variant as sold out. A `page.goto` without the query would load the default
// scenario with a cart of its own (rule 12 of `e2e/seed.spec.ts`), so this
// scenario opens its first page with the query and moves on by clicking.
const SCENARIO_QUERY = 'mi-scenario=stock-lost-once-cart-add';

// The product page splits its buy chrome at this breakpoint: below 1024px
// `.cta-desktop` is `display: none` (the product page stylesheet) and the fixed
// `purchase-rail` carries the press through its `purchase-cta`; at 1024px and
// wider the in-flow block is the shown one and the rail is `display: none`.
// Both mounts stay in the DOM at either width and both read the page's single
// add state, so the viewport decides which one the test drives and which one
// carries the refusal and the reason hint.
const BUY_BREAKPOINT_PX = 1024;

// The refusal copy the product page's `describeAddFailure` composes for a
// cart-add refused with the 409 `OUT_OF_STOCK`. It names neither the status nor
// the Problem code: the shopper only learns the chosen variant has just sold
// out.
const ADD_REFUSAL = 'Ez a változat közben elfogyott, ezért nem került a kosárba.';

// The two availability sentences the product page's `stockMessage` renders and
// the sentence `computeAddToCartState` gives as the out-of-stock reason.
const IN_STOCK_TEXT = 'Raktáron a demó készletben';
const OUT_OF_STOCK_TEXT = 'Ez a konfiguráció elfogyott a demó készletből.';
const UNAVAILABLE_REASON = 'Ez a változat jelenleg nem elérhető.';

test.describe('Adding a phone that sells out meanwhile', () => {
  test(
    '[E060] a variant that sells out while it is being added is refused, stays selected and is shown as sold out',
    { tag: '@integration' },
    async ({ page }) => {
      const wideLayout = (page.viewportSize()?.width ?? 0) >= BUY_BREAKPOINT_PX;

      const cards = page.getByTestId('product-card');
      const resultCount = page.getByTestId('result-count');
      const cartBadge = page.getByTestId('cart-badge');
      const productPage = page.getByTestId('product-page');
      const productName = page.getByTestId('product-name');
      const productStock = page.getByTestId('product-stock');
      const errorState = page.getByTestId('error-state');
      // The "Készülékár" block's amount. The mobile purchase rail and every
      // related-product card render a `price-amount` too, so the block is
      // scoped by its own section (product-page.html `aria-label="Árak"`).
      const devicePrice = page.locator('section[aria-label="Árak"]').getByTestId('price-amount');

      const colourGroup = page.getByTestId('variant-color-group');
      const storageGroup = page.getByTestId('variant-storage-group');
      // "Exactly one option pressed per axis", and nothing more: a locator
      // filtered on `aria-pressed="true"` re-resolves on every use, so it keeps
      // matching the variant the page loaded with until a press lands. Reading
      // a chosen label off one of these races the press — the sibling
      // edge-path spec carries the same rule — so the picked buttons are
      // reached by their own test ids below instead.
      const pressedColour = colourGroup.locator(
        'button[data-testid^="variant-color-"][aria-pressed="true"]',
      );
      const pressedStorage = storageGroup.locator(
        'button[data-testid^="variant-storage-"][aria-pressed="true"]',
      );

      // The mount this viewport shows and the banner it renders the refusal
      // into; `app-button` puts the test id on its host element, so the press
      // targets the native `button` inside it.
      const addControl = wideLayout
        ? page.getByTestId('add-to-cart-button').getByRole('button')
        : page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button');
      const banner = wideLayout
        ? page.getByTestId('add-to-cart').getByTestId('status-message')
        : page.getByTestId('purchase-rail').getByTestId('status-message');
      const otherBanner = wideLayout
        ? page.getByTestId('purchase-rail').getByTestId('status-message')
        : page.getByTestId('add-to-cart').getByTestId('status-message');
      // The reason hint the layout shows: the desktop CTA block's own paragraph
      // at 1024px and wider, the sticky rail's below it.
      const reasonHint = wideLayout
        ? page.getByTestId('add-to-cart-reason')
        : page.getByTestId('purchase-rail-reason');

      // Read off the screen in the steps below and held for the later ones; the
      // product is never named by slug or product name.
      let cardHref: string | null = null;
      let productNameText = '';
      let colourName = '';
      let storageLabel = '';
      // The test ids of the two buttons the shopper presses, each read off the
      // screen before its own press and used afterwards to reach exactly that
      // button (steps 3 and 5).
      let chosenColourTestId = '';
      let chosenStorageTestId = '';
      // The chosen variant's id, built from what the screen shows once both
      // picks landed: the product's own slug from the address bar plus the
      // chosen colour code and storage bucket, the two halves the pressed
      // buttons' test ids carry, since a variant id is
      // `<product slug>--<colour code>--<storage GB>`
      // (docs/api/fixtures/catalog.json).
      let chosenVariantId = '';

      // 1. Open the catalogue with the stock-lost scenario on the URL's first
      // load: `/telefonok` with `?mi-scenario=stock-lost-once-cart-add`, and
      // wait for the grid.
      await test.step("1. Open the catalogue with the stock-lost scenario on the URL's first load: `/telefonok` with `?mi-scenario=stock-lost-once-cart-add`, and wait for the grid.", async () => {
        await page.goto(`/telefonok?${SCENARIO_QUERY}`);

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(resultCount).toHaveText(/\d+ találat a szűrt feltételek szerint/);
        const matches = Number(((await resultCount.textContent()) ?? '').replace(/\D/g, ''));
        expect(matches).toBeGreaterThan(0);

        await expect(cards.first()).toBeVisible();
        await expect(cartBadge).toHaveText('0');

        // The scenario arms the first add-to-cart request only and breaks no
        // read, so the grid renders with no error and no notice on screen.
        await expect(errorState).toHaveCount(0);
        await expect(page.getByTestId('status-message')).toHaveCount(0);
      });

      // 2. Click the `product-card-cta` of the first `product-card` that
      // carries no `product-card-stock` marker and shows a colour swatch row.
      await test.step('2. Click the `product-card-cta` of the first `product-card` that carries no `product-card-stock` marker and shows a colour swatch row (`product-card-swatches` with two or more `product-card-swatch` buttons).', async () => {
        // Picking by what the screen shows: an out-of-stock card carries the
        // "Elfogyott" `product-card-stock` marker, and a card renders its
        // swatch row only when the product has more than one colour.
        const inStockCardWithSwatches = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .filter({ has: page.getByTestId('product-card-swatches') })
          .first();
        await expect(inStockCardWithSwatches).toBeVisible();
        const cardSwatches = inStockCardWithSwatches.getByTestId('product-card-swatch');
        await expect(cardSwatches.nth(1)).toBeVisible();

        // The card's own link is the expected address bar, read before the
        // click; the router link carries the variant query.
        cardHref = await inStockCardWithSwatches
          .getByTestId('product-card-cta')
          .getAttribute('href');
        await inStockCardWithSwatches.getByTestId('product-card-cta').click();

        await expect(productPage).toBeVisible();
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === cardHref);
        // The in-app navigation drops `mi-scenario`: the mock holds the
        // scenario for the browsing context, not the URL.
        await expect(page).not.toHaveURL(/mi-scenario/);

        await expect(productName).not.toBeEmpty();
        productNameText = ((await productName.textContent()) ?? '').trim();

        await expect(productStock).toHaveText(IN_STOCK_TEXT);
        await expect(devicePrice).toHaveText(/\d/);

        // The product offers a colour and a storage to choose.
        await expect(colourGroup).toBeVisible();
        await expect(storageGroup).toBeVisible();

        await expect(cartBadge).toHaveText('0');
      });

      // 3. Choose a colour and a storage.
      await test.step('3. Choose a colour and a storage: click the first enabled `variant-color-*` button whose `aria-pressed` is `false`, then the first enabled `variant-storage-*` button whose `aria-pressed` is `false`.', async () => {
        // The amount the opened variant shows, to prove the block follows the
        // choice below.
        const priceBefore = ((await devicePrice.textContent()) ?? '').replace(/\s+/g, ' ').trim();

        // The button to press is resolved once and identified by its own test
        // id, read before the press: the `aria-pressed="false"` filter on the
        // locator below is live, so once the press lands the pressed button
        // stops matching it and such a locator re-resolves to a colour the
        // shopper did not pick.
        const colourToChoose = colourGroup
          .locator('button[data-testid^="variant-color-"][aria-pressed="false"]:not([disabled])')
          .first();
        await expect(colourToChoose).toBeVisible();
        chosenColourTestId = (await colourToChoose.getAttribute('data-testid')) ?? '';
        expect(chosenColourTestId).not.toBe('');
        await colourToChoose.click();

        const chosenColour = colourGroup.getByTestId(chosenColourTestId);
        await expect(chosenColour).toHaveAttribute('aria-pressed', 'true');
        await expect(pressedColour).toHaveCount(1);
        await expect(chosenColour).toHaveAttribute('aria-label', /, kiválasztva$/);
        // The name is read off the pressed button once the press landed.
        colourName = ((await chosenColour.getAttribute('aria-label')) ?? '').replace(
          /, kiválasztva$/,
          '',
        );
        await expect(colourGroup.locator('legend')).toContainText(`Szín: ${colourName}`);

        // Every other colour button reads "<colour>, elérhető".
        const otherColours = colourGroup.locator(
          'button[data-testid^="variant-color-"][aria-pressed="false"]',
        );
        const otherColourCount = await otherColours.count();
        for (let i = 0; i < otherColourCount; i += 1) {
          await expect(otherColours.nth(i)).toHaveAttribute('aria-label', /, elérhető$/);
        }

        const storageToChoose = storageGroup
          .locator('button[data-testid^="variant-storage-"][aria-pressed="false"]:not([disabled])')
          .first();
        await expect(storageToChoose).toBeVisible();
        // Same rule as the colour above: the storage button is identified by its
        // own test id before the press.
        chosenStorageTestId = (await storageToChoose.getAttribute('data-testid')) ?? '';
        expect(chosenStorageTestId).not.toBe('');
        await storageToChoose.click();

        const chosenStorage = storageGroup.getByTestId(chosenStorageTestId);
        await expect(chosenStorage).toHaveAttribute('aria-pressed', 'true');
        await expect(pressedStorage).toHaveCount(1);
        await expect(chosenStorage).toHaveAttribute('aria-label', /, kiválasztva$/);
        storageLabel = ((await chosenStorage.getAttribute('aria-label')) ?? '').replace(
          /, kiválasztva$/,
          '',
        );
        await expect(storageGroup.locator('legend')).toContainText(`Tárhely: ${storageLabel}`);

        // The address bar follows the shopper's own pick from here on: the page
        // mirrors the live selection into `?variant=` (`ProductPage`'s
        // `syncVariantQuery`), so the variant the catalogue card sent the
        // shopper to is replaced as soon as a swatch is pressed. The chosen id
        // is built from what the screen shows — the product's own slug from the
        // address bar, and the chosen buttons' colour code and storage bucket
        // (`<product slug>--<colour code>--<storage GB>`,
        // docs/api/fixtures/catalog.json).
        const colourCode = chosenColourTestId.replace('variant-color-', '');
        const storageGb = chosenStorageTestId.replace('variant-storage-', '');
        const productSlug = new URL(page.url()).pathname.split('/').pop() ?? '';
        chosenVariantId = `${productSlug}--${colourCode}--${storageGb}`;
        await expect(page).toHaveURL((url) => url.searchParams.get('variant') === chosenVariantId);

        // Every other storage button reads "<storage>, elérhető".
        const otherStorages = storageGroup.locator(
          'button[data-testid^="variant-storage-"][aria-pressed="false"]',
        );
        const otherStorageCount = await otherStorages.count();
        for (let i = 0; i < otherStorageCount; i += 1) {
          await expect(otherStorages.nth(i)).toHaveAttribute('aria-label', /, elérhető$/);
        }

        // The chosen variant is in stock, so the add control the viewport shows
        // is enabled and neither reason hint is rendered.
        await expect(productStock).toHaveText(IN_STOCK_TEXT);
        await expect(addControl).toBeEnabled();
        await expect(addControl).toHaveText('Kosárba teszem');
        await expect(page.getByTestId('add-to-cart-reason')).toHaveCount(0);
        await expect(page.getByTestId('purchase-rail-reason')).toHaveCount(0);

        // The "Készülékár" block shows the chosen variant's amount.
        await expect(devicePrice).toHaveText(/\d/);
        await expect(devicePrice).not.toHaveText(priceBefore);
        await expect(cartBadge).toHaveText('0');
      });

      // 4. Press the visible add control.
      await test.step('4. Press the visible add control: the inner button of `add-to-cart-button` at 1024 px and wider, the `purchase-cta` button inside `purchase-rail` below 1024 px.', async () => {
        await addControl.click();

        // This is the page load's first add-to-cart request, so the mock took
        // the variant's whole demo stock and refused the add. The mount on
        // screen answers with the shared `StatusMessage` at severity `error` —
        // the role `alert` live region — carrying the page's own refusal copy.
        await expect(banner).toHaveRole('alert');
        await expect(banner).toHaveClass(/is-error/);
        await expect(banner.getByText(ADD_REFUSAL, { exact: true })).toBeVisible();
        await expect(banner.getByRole('button', { name: 'Bezárás' })).toBeVisible();

        // The refusal is shown once, where the shopper is looking: the other
        // mount holds the same copy in the DOM and keeps it painted out.
        await expect(otherBanner).toHaveCount(1);
        await expect(otherBanner).toBeHidden();

        // The message names neither the 409 nor the Problem code nor the server.
        await expect(banner).not.toContainText('409');
        await expect(banner).not.toContainText('OUT_OF_STOCK');
        await expect(banner).not.toContainText('urn:mi-bolt:problem');

        // No success message appears anywhere: the confirmation the add would
        // otherwise show ("… darab a kosárban.") is never rendered, and the app
        // has no cart drawer or mini-cart, so the press reveals the refusal
        // banner and nothing else.
        await expect(page.getByText('darab a kosárban.')).toHaveCount(0);
        await expect(page.getByTestId('cart-page')).toHaveCount(0);
        await expect(page.getByTestId('cart-line')).toHaveCount(0);
      });

      // 5. Read the chosen variant and the availability the page now shows,
      // without leaving the product page.
      await test.step('5. Read the chosen variant and the availability the page now shows, without leaving the product page.', async () => {
        // The refusal moved the shopper nowhere and reset no choice: the page
        // is still the product the card opened (its pathname is the card
        // link's own) and its `?variant=` still names the variant the shopper
        // picked, not the one the page loaded with.
        await expect(page).toHaveURL(
          (url) =>
            url.pathname === (cardHref ?? '').split('?')[0] &&
            url.searchParams.get('variant') === chosenVariantId,
        );
        // The two buttons the shopper pressed, reached by their own test ids as
        // in step 3: a live `aria-pressed="true"` locator could hand back the
        // other option while a press settles.
        const chosenColour = colourGroup.getByTestId(chosenColourTestId);
        const chosenStorage = storageGroup.getByTestId(chosenStorageTestId);
        await expect(chosenColour).toHaveAttribute('aria-pressed', 'true');
        await expect(chosenColour).toHaveAttribute('aria-label', `${colourName}, kiválasztva`);
        await expect(chosenStorage).toHaveAttribute('aria-pressed', 'true');
        await expect(chosenStorage).toHaveAttribute('aria-label', `${storageLabel}, kiválasztva`);
        await expect(pressedColour).toHaveCount(1);
        await expect(pressedStorage).toHaveCount(1);
        await expect(colourGroup.locator('legend')).toContainText(`Szín: ${colourName}`);
        await expect(storageGroup.locator('legend')).toContainText(`Tárhely: ${storageLabel}`);

        // The page re-read the product after the refusal (`refreshProduct`), so
        // the availability line follows the changed stock.
        await expect(productStock).toHaveText(OUT_OF_STOCK_TEXT);
        await expect(addControl).toBeDisabled();
        await expect(addControl).toHaveText('Kosárba teszem');
        await expect(reasonHint).toHaveText(UNAVAILABLE_REASON);

        // The refused add changed nothing: the cart is untouched and the
        // product page keeps its success state.
        await expect(cartBadge).toHaveText('0');
        await expect(errorState).toHaveCount(0);
      });

      // 6. Click the header's `cart-link` to open the cart.
      await test.step("6. Click the header's `cart-link` to open the cart.", async () => {
        await page.getByTestId('cart-link').click();

        await expect(page).toHaveURL(/\/penztar\/kosar$/);
        const cartPage = page.getByTestId('cart-page');
        await expect(cartPage).toBeVisible();

        // The refused add left the cart exactly as it was: no line at all, and
        // the cart shows its empty state.
        await expect(page.getByTestId('cart-line')).toHaveCount(0);
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

        // The chosen product's name is nowhere here, and the refusal banner
        // does not follow the shopper onto the cart page.
        await expect(cartPage.getByText(productNameText)).toHaveCount(0);
        await expect(cartPage.getByTestId('status-message')).toHaveCount(0);
        await expect(page.getByText(ADD_REFUSAL)).toHaveCount(0);
      });
    },
  );
});
