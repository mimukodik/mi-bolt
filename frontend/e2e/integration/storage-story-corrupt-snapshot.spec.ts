// spec: specs/storage-story-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The mock keeps its state in the browsing context's `sessionStorage` under
// `mi-bolt.snapshot.default` (`Persistence` / `SNAPSHOT_SCHEMA_VERSION` in
// projects/shop-mocks/src/persistence.ts). On boot `Persistence.hydrate` reads
// that entry and, when it is not JSON, removes it and returns nothing, so the
// shop starts from an empty cart; the demo strip then says so
// (`demo-notice--reset` with `demo-notice-reset-text`). The corrupt entry below
// is planted by the first page load only: the init script guards itself with its
// own `mi-bolt.story-seeded` marker, which it sets in the same run, so every
// later load boots from what the app itself saved.
const SNAPSHOT_KEY = 'mi-bolt.snapshot.default';
const SEEDED_MARKER_KEY = 'mi-bolt.story-seeded';
const CORRUPT_ENTRY = '{"schemaVersion":4,"providerId":"mi-bolt",';

// The product page mounts its purchase call to action twice, both present in the
// DOM: the inner button of `add-to-cart-button` is the press at 1024px and
// wider, and below 1024px the side panel's control is `display: none` and the
// sticky `purchase-rail`'s `purchase-cta` is the shown one.
const DESKTOP_MIN_WIDTH = 1024;

// The in-stock line `product-stock` reads (`stockMessage` in product-page.ts);
// the card was picked for carrying no `product-card-stock` marker.
const IN_STOCK_TEXT = 'Raktáron a demó készletben';

interface SeedValues {
  readonly snapshotKey: string;
  readonly markerKey: string;
  readonly corruptEntry: string;
}

test.describe('Shop: storage, startup and expired-cart stories', () => {
  test(
    '[E013] a corrupt saved state is dropped, the shop says so and still works',
    { tag: '@integration' },
    async ({ page }) => {
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN_WIDTH;
      const cards = page.getByTestId('product-card');
      const cartBadge = page.getByTestId('cart-badge');
      const productName = page.getByTestId('product-name');
      const cartLines = page.getByTestId('cart-line');
      const addControl = desktopViewport
        ? page.getByTestId('add-to-cart-button').getByRole('button')
        : page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button');

      const pageErrors: string[] = [];
      const consoleIssues: string[] = [];

      // Read off the opened product page, never pinned: the cart line has to
      // carry this product's own name.
      let phoneName = '';

      // 1. Before the first navigation, install the corrupt entry and start the
      // listeners, then open `/` with an explicit timeout and wait for
      // `hero-heading`.
      await test.step('1. Install the corrupt entry and start the listeners, then open `/` with an explicit timeout and wait for `hero-heading`.', async () => {
        const seedValues: SeedValues = {
          snapshotKey: SNAPSHOT_KEY,
          markerKey: SEEDED_MARKER_KEY,
          corruptEntry: CORRUPT_ENTRY,
        };
        // Runs before any page script on every load; the marker makes it a
        // first-load-only write, so the corrupt entry is never re-planted over
        // the fresh snapshot the app saves later in the scenario.
        await page.addInitScript((values: SeedValues) => {
          if (window.sessionStorage.getItem(values.markerKey) !== null) return;
          window.sessionStorage.setItem(values.snapshotKey, values.corruptEntry);
          window.sessionStorage.setItem(values.markerKey, '1');
        }, seedValues);

        page.on('pageerror', (error) => {
          pageErrors.push(error.message);
        });
        page.on('console', (message) => {
          const type = message.type();
          if (type === 'error' || type === 'warning') {
            consoleIssues.push(`${type}: ${message.text()}`);
          }
        });

        await page.goto('/', { timeout: 10000 });

        // The home page renders instead of falling over. The getByTestId pin
        // matters: the fatal-state template in src/index.html also holds an
        // `<h1>`, so a role-based locator would match that one when the mock
        // fails.
        const heroHeading = page.getByTestId('hero-heading');
        await expect(heroHeading).toBeVisible();
        await expect(heroHeading).toHaveText('A következő mobilod. Egyszerűen.');

        // The shop started with an empty cart.
        await expect(cartBadge).toHaveText('0');

        // The strip names the dropped saved state: the badge, the reset class,
        // `demo-notice-reset-text` with the corrupt sentence, while the ordinary
        // sentence and the memory variant are not rendered.
        await expect(page.getByTestId('demo-notice')).toContainText('DEMÓ');
        await expect(page.getByTestId('demo-notice')).toHaveClass(/demo-notice--reset/);
        await expect(page.getByTestId('demo-notice-reset-text')).toHaveText(
          'A mentett kosarad nem volt visszaállítható, ezért a bolt üres kosárral indult.',
        );
        await expect(page.getByTestId('demo-notice')).not.toContainText(
          'Fiktív termékek és árak. A vásárlás szimulált; nem történik valódi fizetés.',
        );
        await expect(page.getByTestId('demo-notice-memory-text')).toHaveCount(0);

        // The strip is the only surface that explains the reset: no separate
        // status message and no cart notice is rendered.
        await expect(page.locator('app-status-message')).toHaveCount(0);
        await expect(page.getByTestId('cart-notice')).toHaveCount(0);

        // The corrupt entry was removed at boot, leaving an empty cart the strip
        // then accounts for.
        const stored = await page.evaluate(
          (key: string) => window.sessionStorage.getItem(key),
          SNAPSHOT_KEY,
        );
        expect(stored).toBeNull();

        // No `pageerror` fired and the console holds no error and no warning.
        expect(pageErrors).toEqual([]);
        expect(consoleIssues).toEqual([]);
      });

      // 2. Open the catalogue with an explicit timeout, wait for `catalog-grid`,
      // and count the `product-card` elements and read `cart-badge`.
      await test.step('2. Open the catalogue with an explicit timeout, wait for `catalog-grid`, and count the `product-card` elements and read `cart-badge`.', async () => {
        await page.goto('/telefonok', { timeout: 10000 });
        await expect(page.getByTestId('catalog-grid')).toBeVisible();

        // Browsing works on the dropped state: 12 cards, the default "12 / oldal".
        await expect(cards).toHaveCount(12);
        await expect(cartBadge).toHaveText('0');

        // This full load boots from what the shop saved itself, so the reset
        // strip is gone and the ordinary sentence is back.
        await expect(page.getByTestId('demo-notice')).not.toHaveClass(/demo-notice--reset/);
        await expect(page.getByTestId('demo-notice-reset-text')).toHaveCount(0);
        await expect(page.getByTestId('demo-notice')).toContainText(
          'Fiktív termékek és árak. A vásárlás szimulált; nem történik valódi fizetés.',
        );
      });

      // 3. Open the first `product-card` that carries no `product-card-stock`
      // marker, through its `product-card-cta`, read `product-name`, and add it.
      await test.step('3. Open the first `product-card` that carries no `product-card-stock` marker, through its `product-card-cta`, read `product-name`, and add it.', async () => {
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

        // The reads come after the assertions above proved the product page
        // rendered.
        phoneName = ((await productName.textContent()) ?? '').trim();
        expect(phoneName).not.toBe('');

        // The press lands in the mount the viewport shows: the inner button of
        // `add-to-cart-button` at 1024px and wider, the rail's `purchase-cta`
        // below it.
        await expect(addControl).toBeEnabled();
        await addControl.click();
        await expect(cartBadge).toHaveText('1');
      });

      // 4. Open the cart with the header's `cart-link`, read it, and then read
      // `sessionStorage.getItem('mi-bolt.snapshot.default')` with a page script.
      await test.step("4. Open the cart with the header's `cart-link`, read it, and then read `sessionStorage.getItem('mi-bolt.snapshot.default')` with a page script.", async () => {
        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();

        await expect(cartLines).toHaveCount(1);
        await expect(cartLines.nth(0).getByTestId('cart-line-name')).toHaveText(phoneName);
        await expect(cartLines.nth(0).getByTestId('cart-line-quantity')).toHaveText('1 db');

        // The stored entry is valid JSON again, carries `schemaVersion` 4 and
        // holds exactly that one line in `cart.items`: the shop saved a fresh
        // snapshot in place of the corrupt one. The read comes after the
        // assertions above proved the cart page rendered.
        const snapshotShape = await page.evaluate((key: string) => {
          const isRecord = (value: unknown): value is Record<string, unknown> =>
            typeof value === 'object' && value !== null;
          const shape: {
            parses: boolean;
            schemaVersion: number | null;
            itemCount: number | null;
          } = { parses: false, schemaVersion: null, itemCount: null };

          const raw = window.sessionStorage.getItem(key);
          if (raw === null) return shape;

          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            return shape;
          }
          shape.parses = true;
          if (!isRecord(parsed)) return shape;

          const version = parsed['schemaVersion'];
          if (typeof version === 'number') shape.schemaVersion = version;

          const cart = parsed['cart'];
          if (isRecord(cart)) {
            const items = cart['items'];
            if (Array.isArray(items)) shape.itemCount = items.length;
          }
          return shape;
        }, SNAPSHOT_KEY);

        expect(snapshotShape.parses).toBe(true);
        expect(snapshotShape.schemaVersion).toBe(4);
        expect(snapshotShape.itemCount).toBe(1);

        // No `pageerror` fired during the whole scenario.
        expect(pageErrors).toEqual([]);
      });
    },
  );
});
