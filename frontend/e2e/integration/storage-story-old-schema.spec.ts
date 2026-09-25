// spec: specs/storage-story-paths.md
// seed: e2e/seed.spec.ts

import type { Locator } from '@playwright/test';
import { test, expect } from '../fixtures/coverage';

// The mock keeps its state in the browsing context's `sessionStorage` under
// `mi-bolt.snapshot.default` (`Persistence` / `SNAPSHOT_SCHEMA_VERSION` in
// projects/shop-mocks/src/persistence.ts). On boot `Persistence.hydrate` reads
// that entry and, when it carries another `schemaVersion`, removes it and
// returns nothing, so the shop starts from an empty cart with no message. The
// older entry below is planted by the first page load of the second phase only:
// the init script guards itself with its own `mi-bolt.story-seeded` marker,
// which it sets in the same run, so every later load boots from what the app
// itself saved.
const SNAPSHOT_KEY = 'mi-bolt.snapshot.default';
const SEEDED_MARKER_KEY = 'mi-bolt.story-seeded';

// The version the mock writes today (`SNAPSHOT_SCHEMA_VERSION`), and the one
// the older entry claims. The version policy is what rejects the entry, so the
// top-level `savedAt`/`expiresAt` are left in the future and the age check never
// comes into it.
const CURRENT_SCHEMA_VERSION = 4;
const OLD_SCHEMA_VERSION = 3;

// The mock's `getMedia` handler serves the image bytes behind the contract URL
// through a passthrough fetch of its own (`defaultMediaLoader` in
// projects/shop-mocks/src/catalog/catalog.handlers.ts). When that same-origin
// fetch is refused, WebKit raises it through `pageerror` as
// "... due to access control checks.", although `defaultMediaLoader` catches
// the refusal and the handler answers 404, so no uncaught JavaScript exception
// reached the page. The report is filtered out of the `pageerror` assertions
// below; every other report still fails them.
const MEDIA_PASSTHROUGH_PAGE_ERROR = /\/media\/\S+ due to access control checks\.$/;

// The product page mounts its purchase call to action twice, both present in
// the DOM: the inner button of `add-to-cart-button` is the press at 1024px and
// wider, and below 1024px the side panel's control is `display: none` and the
// sticky `purchase-rail`'s `purchase-cta` is the shown one.
const DESKTOP_MIN_WIDTH = 1024;

// The catalogue's default page size, at every width.
const PAGE_SIZE = 12;

// The in-stock line `product-stock` reads (`stockMessage` in product-page.ts);
// the card was picked for carrying no `product-card-stock` marker.
const IN_STOCK_TEXT = 'Raktáron a demó készletben';

// The cart page's counter with its single line.
const ONE_LINE_CART_COUNT = 'Kosárban található termékek (1)';

interface OlderSeed {
  readonly snapshotKey: string;
  readonly markerKey: string;
  readonly entry: string;
}

interface CartLineShape {
  readonly variantId: string | null;
}

interface CartShape {
  readonly id: string | null;
  readonly version: number | null;
  readonly createdAt: string | null;
  readonly expiresAt: string | null;
  readonly items: readonly CartLineShape[] | null;
}

interface SnapshotShape {
  readonly parses: boolean;
  readonly schemaVersion: number | null;
  readonly providerId: string | null;
  readonly savedAt: string | null;
  readonly expiresAt: string | null;
  readonly cart: CartShape | null;
}

/** True when `value` is a non-null object, the shape every JSON object has. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The string at `key`, `null` when the field is absent or of another type. */
function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function parseCartLine(item: unknown): CartLineShape {
  return { variantId: isRecord(item) ? stringField(item, 'variantId') : null };
}

function parseCart(cart: Record<string, unknown>): CartShape {
  const version = cart['version'];
  const items = cart['items'];
  return {
    id: stringField(cart, 'id'),
    version: typeof version === 'number' ? version : null,
    createdAt: stringField(cart, 'createdAt'),
    expiresAt: stringField(cart, 'expiresAt'),
    items: Array.isArray(items) ? items.map(parseCartLine) : null,
  };
}

/** The stored snapshot as the scenario's expectations describe it. */
function parseSnapshot(raw: string | null): SnapshotShape {
  const empty: SnapshotShape = {
    parses: false,
    schemaVersion: null,
    providerId: null,
    savedAt: null,
    expiresAt: null,
    cart: null,
  };
  if (raw === null) return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!isRecord(parsed)) return empty;

  const version = parsed['schemaVersion'];
  const cart = parsed['cart'];
  return {
    parses: true,
    schemaVersion: typeof version === 'number' ? version : null,
    providerId: stringField(parsed, 'providerId'),
    savedAt: stringField(parsed, 'savedAt'),
    expiresAt: stringField(parsed, 'expiresAt'),
    cart: isRecord(cart) ? parseCart(cart) : null,
  };
}

/**
 * The stored document with `schemaVersion` 3 and `cart.items` replaced by one
 * line holding `variantId`. Every other field, the top-level `savedAt` and
 * `expiresAt` included, is carried over unchanged.
 */
function toOlderEntry(raw: string, variantId: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!isRecord(parsed)) return raw;

  const older: Record<string, unknown> = { ...parsed, schemaVersion: OLD_SCHEMA_VERSION };
  const cart = older['cart'];
  if (isRecord(cart)) {
    older['cart'] = { ...cart, items: [{ variantId, quantity: 1 }] };
  }
  return JSON.stringify(older);
}

test.describe('Shop: storage, startup and expired-cart stories', () => {
  test(
    '[E014] an older snapshot version is discarded and its line stays hidden',
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

      /** The trimmed text of a locator, '' when it renders nothing. */
      const textOf = async (target: Locator): Promise<string> => {
        const text = await target.textContent();
        return (text ?? '').trim();
      };

      /** The indexes of the first `wanted` cards carrying no `product-card-stock` marker. */
      const inStockCardIndexes = async (wanted: number): Promise<number[]> => {
        const total = await cards.count();
        const found: number[] = [];
        for (let i = 0; i < total && found.length < wanted; i++) {
          if ((await cards.nth(i).getByTestId('product-card-stock').count()) === 0) found.push(i);
        }
        return found;
      };

      // Playwright exposes no locator for storage, so the mock's snapshot entry
      // is read with a page script.
      const readSnapshotRaw = async (): Promise<string | null> =>
        page.evaluate((key: string) => window.sessionStorage.getItem(key), SNAPSHOT_KEY);

      // Read off the opened screens, never pinned: the older entry carries the
      // second in-stock card's variant and the cart has to carry the added
      // phone's own name.
      let snapshotRaw: string | null = null;
      let hiddenVariantId = '';
      let phoneName = '';
      let addedVariantId = '';

      // 1. Open `/telefonok` (explicit timeout), wait for `catalog-grid`, read
      // the `?variant=` value out of the detail link of a second
      // `product-card` that carries no `product-card-stock` marker, open the
      // first in-stock card through its `product-card-cta`, read
      // `product-name`, add it, and read the snapshot with a page script.
      await test.step("1. Open `/telefonok` (explicit timeout), wait for `catalog-grid`, read the `?variant=` value out of the detail link of a second `product-card` that carries no `product-card-stock` marker, open the first in-stock card through its `product-card-cta`, read `product-name`, add it, and read `sessionStorage.getItem('mi-bolt.snapshot.default')` with a page script.", async () => {
        await page.goto('/telefonok', { timeout: 10000 });
        await expect(page.getByTestId('catalog-grid')).toBeVisible();
        // The full page has rendered: the enumeration below reads a settled
        // grid, not a partially rendered one.
        await expect(cards).toHaveCount(PAGE_SIZE);

        // An in-stock card carries no `product-card-stock` marker; the first of
        // the two is the phone this scenario adds, the second is the line the
        // older entry will carry.
        const indexes = await inStockCardIndexes(2);
        expect(indexes).toHaveLength(2);

        // The second card's variant comes out of its `product-card-cta` detail
        // link, read while the catalogue is still the current URL.
        const secondHref = await cards
          .nth(indexes[1])
          .getByTestId('product-card-cta')
          .getAttribute('href');
        hiddenVariantId =
          secondHref === null
            ? ''
            : (new URL(secondHref, page.url()).searchParams.get('variant') ?? '');
        expect(hiddenVariantId).not.toBe('');

        await cards.nth(indexes[0]).getByTestId('product-card-cta').click();
        await expect(page.getByTestId('product-page')).toBeVisible();
        // The card was picked for carrying no "Elfogyott" marker.
        await expect(page.getByTestId('product-stock')).toHaveText(IN_STOCK_TEXT);
        await expect(productName).not.toBeEmpty();

        // The reads come after the assertions above proved the product page
        // rendered.
        phoneName = await textOf(productName);
        expect(phoneName).not.toBe('');

        // The press lands in the mount the viewport shows: the inner button of
        // `add-to-cart-button` at 1024px and wider, the rail's `purchase-cta`
        // below it.
        await expect(addControl).toBeEnabled();
        await addControl.click();
        await expect(cartBadge).toHaveText('1');

        // The stored entry is the shop's own valid snapshot: `schemaVersion` 4,
        // the `mi-bolt` provider, its timestamps and a cart holding exactly the
        // added line. The read comes after the badge proved the add landed.
        snapshotRaw = await readSnapshotRaw();
        const snapshot = parseSnapshot(snapshotRaw);
        expect(snapshot.parses).toBe(true);
        expect(snapshot.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(snapshot.providerId).toBe('mi-bolt');
        expect(snapshot.savedAt).not.toBeNull();
        expect(snapshot.expiresAt).not.toBeNull();
        expect(snapshot.cart).not.toBeNull();
        expect(snapshot.cart?.id).not.toBeNull();
        expect(snapshot.cart?.version).not.toBeNull();
        expect(snapshot.cart?.createdAt).not.toBeNull();
        expect(snapshot.cart?.expiresAt).not.toBeNull();
        expect(snapshot.cart?.items).toHaveLength(1);
        addedVariantId = snapshot.cart?.items?.[0]?.variantId ?? '';
        expect(addedVariantId).not.toBe('');

        // The hidden line is a different line from the one the scenario adds.
        expect(hiddenVariantId).not.toBe(addedVariantId);
      });

      // 2. Build the older entry from what was read and install it with
      // `page.addInitScript` before the next `page.goto`, guarded by the marker
      // key, register `page.on('pageerror', …)`, then open `/` with an explicit
      // timeout and wait for `hero-heading`.
      await test.step("2. Build the older entry from what was read and install it with `page.addInitScript` before the next `page.goto`, guarded by the marker key `mi-bolt.story-seeded` so it is planted once. Register `page.on('pageerror', …)`, then open `/` with an explicit timeout and wait for `hero-heading`.", async () => {
        const seed: OlderSeed = {
          snapshotKey: SNAPSHOT_KEY,
          markerKey: SEEDED_MARKER_KEY,
          entry: toOlderEntry(snapshotRaw ?? '', hiddenVariantId),
        };
        // Runs before any page script on every load; the marker makes it a
        // first-load-only write, so the older entry is never re-planted over
        // the fresh snapshot the app saves later in the scenario.
        await page.addInitScript((values: OlderSeed) => {
          if (window.sessionStorage.getItem(values.markerKey) !== null) return;
          window.sessionStorage.setItem(values.snapshotKey, values.entry);
          window.sessionStorage.setItem(values.markerKey, '1');
        }, seed);

        page.on('pageerror', (error) => {
          pageErrors.push(error.message);
        });

        await page.goto('/', { timeout: 10000 });

        // The shop boots: the home page renders instead of falling over. The
        // getByTestId pin matters: the fatal-state template in src/index.html
        // also holds an `<h1>`, so a role-based locator would match that one
        // when the mock fails.
        await expect(page.getByTestId('hero-heading')).toBeVisible();

        // The line the older entry carries is not restored.
        await expect(cartBadge).toHaveText('0');

        // The incompatible entry was removed at boot.
        expect(await readSnapshotRaw()).toBeNull();

        // Nothing says a saved state of an older version was discarded.
        await expect(page.locator('app-status-message')).toHaveCount(0);

        // No uncaught JavaScript exception fired while the shop booted. A
        // WebKit report of the mock's refused media passthrough is not one:
        // `MEDIA_PASSTHROUGH_PAGE_ERROR` names the shape and says why the app
        // never saw an exception, so the report is filtered out here and every
        // other `pageerror` still fails the assertion.
        const applicationPageErrors = pageErrors.filter(
          (message) => !MEDIA_PASSTHROUGH_PAGE_ERROR.test(message),
        );
        expect(applicationPageErrors).toEqual([]);
      });

      // 3. Open `/telefonok` (explicit timeout), wait for `catalog-grid`, open
      // the first in-stock card, read `product-name`, add it, then open the
      // cart with the header's `cart-link`.
      await test.step("3. Open `/telefonok` (explicit timeout), wait for `catalog-grid` (12 `product-card` elements), open the first in-stock card, read `product-name`, add it as in the previous scenario, then open the cart with the header's `cart-link`.", async () => {
        await page.goto('/telefonok', { timeout: 10000 });
        await expect(page.getByTestId('catalog-grid')).toBeVisible();
        await expect(cards).toHaveCount(PAGE_SIZE);

        const indexes = await inStockCardIndexes(1);
        expect(indexes).toHaveLength(1);
        await cards.nth(indexes[0]).getByTestId('product-card-cta').click();
        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(page.getByTestId('product-stock')).toHaveText(IN_STOCK_TEXT);
        phoneName = await textOf(productName);
        expect(phoneName).not.toBe('');

        await expect(addControl).toBeEnabled();
        await addControl.click();

        // `cart-badge` is read here rather than on the cart page: `/penztar/*`
        // runs under the checkout layout, whose header renders no badge at all,
        // so the badge this add lifts is the shop header's.
        await expect(cartBadge).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();

        // Exactly one line, and it names the phone this scenario added: the
        // hidden line did not come back, although that variant exists in the
        // catalogue and would render as a second line if the version check let
        // it through.
        await expect(cartLines).toHaveCount(1);
        await expect(cartLines.nth(0).getByTestId('cart-line-name')).toHaveText(phoneName);
        await expect(page.getByTestId('cart-count')).toHaveText(ONE_LINE_CART_COUNT);
      });

      // 4. Reload with `page.goto(page.url(), { timeout: 10000 })` and read the
      // cart again.
      await test.step('4. Reload with `page.goto(page.url(), { timeout: 10000 })` and read the cart again.', async () => {
        await page.goto(page.url(), { timeout: 10000 });
        await expect(page.getByTestId('cart-page')).toBeVisible();

        // The older entry was not replayed and no false order line appeared.
        await expect(cartLines).toHaveCount(1);
        await expect(cartLines.nth(0).getByTestId('cart-line-name')).toHaveText(phoneName);

        // The stored entry is the shop's own again, still at `schemaVersion` 4
        // and holding only that one line.
        const stored = parseSnapshot(await readSnapshotRaw());
        expect(stored.parses).toBe(true);
        expect(stored.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(stored.cart?.items).toHaveLength(1);
        expect(stored.cart?.items?.[0]?.variantId).toBe(addedVariantId);

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

  test.fixme(
    '[E014] discard incompatible data under explicit version policy',
    { tag: '@integration' },
    async () => {
      // Missing expectation: "Discard incompatible data under explicit version
      // policy" — the version policy is silent, so no screen states that a saved
      // state of an older version was discarded (issue MIM-448). The shop starts
      // with an empty cart and its ordinary demo strip instead, exactly as the
      // first test asserts.
    },
  );
});
