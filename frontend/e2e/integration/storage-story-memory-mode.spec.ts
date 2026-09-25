// spec: specs/storage-story-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// A browser that blocks site data throws a `SecurityError` from the
// `sessionStorage` getter. The mock's persistence probe reads that getter
// inside a guard (`probeSessionStorage` in projects/shop-mocks/src/persistence.ts),
// so a throwing getter is read as a denial rather than as a missing store: the
// adapter starts in its in-memory mode and `bootstrap-demo.ts` supplies
// `PERSISTENCE_MODE` `'memory'`, which `AppShell` hands to `DemoNotice`.
const MEMORY_TEXT =
  'A böngésződ nem engedi a mentést, ezért az oldal frissítésekor a kosarad tartalma elveszik.';
const ORDINARY_TEXT = 'Fiktív termékek és árak. A vásárlás szimulált; nem történik valódi fizetés.';

// The one warning the denied adapter announces (single-warn flag,
// `SessionStorageAdapter.announceDenied` in projects/shop-mocks/src/persistence.ts).
// It is emitted by the first write, and the only writes are the persist calls
// the cart, checkout, order and payment handlers make after a successful
// mutation (`options.persist` in projects/shop-mocks/src/cart/cart.handlers.ts);
// a read or a page load never writes, which is why the add-to-cart step is
// where the console first carries it.
const DENIED_WARNING =
  '[mi-bolt] persistence: sessionStorage denied, using in-memory cache; reload will not restore snapshot.';

// The product page mounts its purchase call to action twice, both present in
// the DOM: the inner button of `add-to-cart-button` is the press at 1024px and
// wider, and below 1024px the side panel's control is `display: none` and the
// sticky `purchase-rail`'s `purchase-cta` is the shown one.
const DESKTOP_MIN_WIDTH = 1024;

// The in-stock line `product-stock` reads (`stockMessage` in product-page.ts);
// the card was picked for carrying no `product-card-stock` marker.
const IN_STOCK_TEXT = 'Raktáron a demó készletben';

// The mock's `getMedia` handler reads the image bytes behind the contract URL
// with a passthrough fetch of its own (`defaultMediaLoader` in
// projects/shop-mocks/src/catalog/catalog.handlers.ts). When that same-origin
// fetch is refused, WebKit reports it through `pageerror` as
// "... due to access control checks." even though `defaultMediaLoader` catches
// the failure and the handler then answers 404, so no uncaught JavaScript
// exception reached the page. The report is filtered out of the `pageerror`
// assertion at the end of the scenario; every other report still fails it.
const MEDIA_PASSTHROUGH_PAGE_ERROR = /\/media\/\S+ due to access control checks\.$/;

test.describe('Shop: storage, startup and expired-cart stories', () => {
  test(
    '[E015] blocked storage keeps shopping in memory and announces the reload limitation',
    { tag: '@integration' },
    async ({ page }) => {
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN_WIDTH;
      const demoNotice = page.getByTestId('demo-notice');
      const memoryText = page.getByTestId('demo-notice-memory-text');
      const cartBadge = page.getByTestId('cart-badge');
      const cards = page.getByTestId('product-card');
      const productName = page.getByTestId('product-name');
      const cartLines = page.getByTestId('cart-line');
      const emptyState = page.getByTestId('empty-state');
      const addControl = desktopViewport
        ? page.getByTestId('add-to-cart-button').getByRole('button')
        : page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button');

      const pageErrors: string[] = [];
      const consoleMessages: string[] = [];

      // Read off the opened product page, never pinned: the cart line has to
      // carry this product's own name.
      let phoneName = '';

      // 1. Install the storage denial before the first navigation, record every
      // console message, then open `/` with an explicit timeout and wait for
      // `hero-heading`.
      await test.step('1. Install the storage denial, record the console, then open `/` with an explicit timeout and wait for `hero-heading`.', async () => {
        // Runs before any page script on every load of the scenario, so the
        // denial holds through the reload in the last step as well. No marker
        // key is used here: the denial is the scenario's environment, not an
        // entry planted once.
        await page.addInitScript(() => {
          Object.defineProperty(window, 'sessionStorage', {
            configurable: true,
            get() {
              throw new DOMException('The operation is insecure.', 'SecurityError');
            },
          });
        });

        page.on('pageerror', (error) => {
          pageErrors.push(error.message);
        });
        page.on('console', (message) => {
          consoleMessages.push(`${message.type()}: ${message.text()}`);
        });

        await page.goto('/', { timeout: 10000 });

        // The home page renders instead of falling over. The getByTestId pin
        // matters: the fatal-state template in src/index.html also holds an
        // `<h1>`, so a role-based locator would match that one when the mock
        // fails.
        await expect(page.getByTestId('hero-heading')).toBeVisible();

        // The strip announces the memory mode: the badge, then the sentence the
        // blocked storage earned, and the `demo-notice--memory` modifier class
        // the ordinary strip does not carry.
        await expect(demoNotice).toContainText('DEMÓ');
        await expect(memoryText).toHaveText(MEMORY_TEXT);
        await expect(demoNotice).toContainClass('demo-notice--memory');
        await expect(demoNotice).not.toContainText(ORDINARY_TEXT);

        // The shop started with an empty cart.
        await expect(cartBadge).toHaveText('0');
      });

      // 2. Open `/telefonok` with an explicit timeout, wait for `catalog-grid`
      // (12 cards), open the first in-stock card through its `product-card-cta`,
      // read `product-name`, and add it with the mount this viewport shows.
      await test.step('2. Open `/telefonok`, wait for `catalog-grid` (12 cards), open the first in-stock card through its `product-card-cta`, read `product-name`, and add it.', async () => {
        await page.goto('/telefonok', { timeout: 10000 });
        await expect(page.getByTestId('catalog-grid')).toBeVisible();
        await expect(cards).toHaveCount(12);

        // An in-stock card carries no `product-card-stock` marker; the first one
        // is the phone this scenario adds.
        const cardCount = await cards.count();
        let pickedIndex = -1;
        for (let i = 0; i < cardCount; i++) {
          const card = cards.nth(i);
          if ((await card.getByTestId('product-card-stock').count()) > 0) continue;
          pickedIndex = i;
          break;
        }
        expect(pickedIndex).toBeGreaterThanOrEqual(0);
        await cards.nth(pickedIndex).getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        // The card was picked for carrying no "Elfogyott" marker.
        await expect(page.getByTestId('product-stock')).toHaveText(IN_STOCK_TEXT);
        await expect(productName).not.toBeEmpty();

        // The read comes after the assertions above proved the product page
        // rendered.
        phoneName = ((await productName.textContent()) ?? '').trim();
        expect(phoneName).not.toBe('');

        // The press lands in the mount the viewport shows, and the shop's own
        // in-memory cart takes the line although nothing can be written to
        // storage.
        await expect(addControl).toBeEnabled();
        await addControl.click();
        await expect(cartBadge).toHaveText('1');

        // The add is the first successful mutation, and its persist call is the
        // first write the denied adapter refuses: the single warning follows it.
        // The console record is read here rather than at the first page load,
        // where no write has happened yet.
        await expect.poll(() => consoleMessages.join('\n')).toContain(DENIED_WARNING);
      });

      // 3. Open the cart with the header's `cart-link` and read it.
      await test.step("3. Open the cart with the header's `cart-link` and read it.", async () => {
        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();

        await expect(cartLines).toHaveCount(1);
        await expect(cartLines.nth(0).getByTestId('cart-line-name')).toHaveText(phoneName);
        await expect(cartLines.nth(0).getByTestId('cart-line-quantity')).toHaveText('1 db');

        // The memory-mode strip still sits above the line: the shell's
        // `demo-notice` is outside `<main>` on every route.
        await expect(memoryText).toBeVisible();
        await expect(memoryText).toHaveText(MEMORY_TEXT);
      });

      // 4. Reload with `page.goto(page.url(), { timeout: 10000 })` and read the
      // cart page again.
      await test.step('4. Reload with `page.goto(page.url(), { timeout: 10000 })` and read the cart page again.', async () => {
        await page.goto(page.url(), { timeout: 10000 });
        await expect(page.getByTestId('cart-page')).toBeVisible();

        // The limitation the page announced is what the reload then did: the
        // in-memory cart is gone, and the page settles on the empty state. The
        // state is waited for first, so the absences below are read against the
        // settled page rather than against its loading state.
        await expect(emptyState).toBeVisible();
        await expect(
          emptyState.getByRole('heading', { name: 'A kosarad még üres.' }),
        ).toBeVisible();
        await expect(emptyState).toContainText(
          'Nézd meg a demókészülékeket, és válaszd ki a kedvenced.',
        );
        await expect(emptyState.getByRole('button', { name: 'Telefonokat nézek' })).toBeVisible();

        // No line, and nothing the line carried.
        await expect(cartLines).toHaveCount(0);
        await expect(page.getByTestId('cart-count')).toHaveCount(0);
        await expect(page.getByTestId('order-summary')).toHaveCount(0);
        await expect(page.getByTestId('cart-continue')).toHaveCount(0);

        // The denial survived the reload, so the strip announces it again.
        await expect(memoryText).toHaveText(MEMORY_TEXT);

        // No uncaught JavaScript exception fired during the whole scenario. A
        // WebKit report of the mock's refused media passthrough is not one:
        // `MEDIA_PASSTHROUGH_PAGE_ERROR` names the shape and says why the app
        // never saw an exception, so the report is filtered out here and every
        // other `pageerror` still fails the assertion.
        const applicationPageErrors = pageErrors.filter(
          (message) => !MEDIA_PASSTHROUGH_PAGE_ERROR.test(message),
        );
        expect(applicationPageErrors).toEqual([]);
      });
    },
  );
});
