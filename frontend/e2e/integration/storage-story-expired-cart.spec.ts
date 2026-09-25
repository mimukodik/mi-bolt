// spec: specs/storage-story-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The mock keeps its state in the browsing context's `sessionStorage` under
// `mi-bolt.snapshot.default` (`Persistence` / `SNAPSHOT_SCHEMA_VERSION` in
// projects/shop-mocks/src/persistence.ts), and the tab-scoped demo session id
// under `mi-bolt.demo-session` (`demoSessionInterceptor` in
// projects/core-api/src/demo-session.interceptor.ts). `Persistence.hydrate`
// accepts the document this scenario installs (version 4, saved just now, its
// top-level `expiresAt` in the future), and the SEEDED CART's own `expiresAt`
// is what expires: `CartStore.ensureFreshCart` answers 410 `CART_EXPIRED` on
// the first read, forgets that cart, and the read after it creates a fresh
// empty one (projects/shop-mocks/src/cart/cart-store.ts).
const SNAPSHOT_KEY = 'mi-bolt.snapshot.default';
const SESSION_KEY = 'mi-bolt.demo-session';

// The expired entry is built from what the shop itself saved: the cart's
// `createdAt` moves two days back and its `expiresAt` one day back, so the cart
// is expired while its own `expiresAt` still lies after its `createdAt`
// (`isValidCart` in projects/shop-mocks/src/persistence.ts requires that), and
// the snapshot's top-level `savedAt`/`expiresAt` are left where they are so
// `hydrate`'s age check never rejects the entry.
const DAY_MS = 24 * 60 * 60 * 1000;

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

// The version the mock writes today (`SNAPSHOT_SCHEMA_VERSION`).
const CURRENT_SCHEMA_VERSION = 4;

// The expired read is produced inside the service worker, so it is observed
// through the page's own console record. The evidence in that record is the
// line the mock writes for the read it answers (`HttpHandler.log`), which is
// the same entry in every engine: Chromium and WebKit keep msw's `%c` colour
// directives around the status, Firefox consumes them and leaves a space, so
// the pattern tolerates whatever sits between the bracket and the status. The
// browser's own "Failed to load resource ... 410 (Gone)" line cannot be the
// evidence: Chromium and WebKit log it, Firefox never does.
const EXPIRED_CART_READ = /\[MSW\] \d{2}:\d{2}:\d{2} GET \/api\/v1\/cart \(.*410 Gone/;

interface ExpiredSeed {
  readonly snapshotKey: string;
  readonly sessionKey: string;
  readonly entry: string;
  readonly sessionId: string;
}

interface CartLineShape {
  readonly variantId: string | null;
  readonly quantity: number | null;
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
  readonly simulatedSessionId: string | null;
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
  if (!isRecord(item)) return { variantId: null, quantity: null };
  const quantity = item['quantity'];
  return {
    variantId: stringField(item, 'variantId'),
    quantity: typeof quantity === 'number' ? quantity : null,
  };
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
    simulatedSessionId: null,
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
    simulatedSessionId: stringField(parsed, 'simulatedSessionId'),
    savedAt: stringField(parsed, 'savedAt'),
    expiresAt: stringField(parsed, 'expiresAt'),
    cart: isRecord(cart) ? parseCart(cart) : null,
  };
}

/**
 * The stored document with the cart's `createdAt` moved `2 * DAY_MS` before
 * `nowMs` and its `expiresAt` `DAY_MS` before `nowMs`. Every other field, the
 * snapshot's top-level `savedAt`/`expiresAt` included, is carried over
 * unchanged, so only the cart is expired and the snapshot itself is not stale.
 */
function toExpiredEntry(raw: string, nowMs: number): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!isRecord(parsed)) return raw;

  const cart = parsed['cart'];
  if (!isRecord(cart)) return raw;

  const expired: Record<string, unknown> = {
    ...parsed,
    cart: {
      ...cart,
      createdAt: new Date(nowMs - 2 * DAY_MS).toISOString(),
      expiresAt: new Date(nowMs - DAY_MS).toISOString(),
    },
  };
  return JSON.stringify(expired);
}

test.describe('Shop: storage, startup and expired-cart stories', () => {
  test(
    '[E059] an expired cart becomes a fresh empty one and cannot be ordered from',
    { tag: '@integration' },
    async ({ page }) => {
      const desktopViewport = (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN_WIDTH;
      const cards = page.getByTestId('product-card');
      const cartBadge = page.getByTestId('cart-badge');
      const productName = page.getByTestId('product-name');
      const emptyState = page.getByTestId('empty-state');
      const reasonBanner = page.getByTestId('navigation-reason');
      const addControl = desktopViewport
        ? page.getByTestId('add-to-cart-button').getByRole('button')
        : page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button');

      const consoleMessages: string[] = [];

      // Read off the opened screens, never pinned: the expired entry is built
      // from what the shop itself saved, and the session id is the one the mock
      // namespaces that cart by.
      let snapshotRaw: string | null = null;
      let sessionId = '';

      // 1. Open `/telefonok` (explicit timeout), wait for `catalog-grid`, open
      // the first in-stock card, read `product-name`, add it, then read both
      // `sessionStorage` entries with a page script.
      await test.step("1. Open `/telefonok` (explicit timeout), wait for `catalog-grid`, open the first in-stock card, read `product-name`, add it (inner button of `add-to-cart-button` at 1024 px and wider, `purchase-cta` below 1024 px), then read `sessionStorage.getItem('mi-bolt.snapshot.default')` and `sessionStorage.getItem('mi-bolt.demo-session')` with a page script.", async () => {
        await page.goto('/telefonok', { timeout: 10000 });
        await expect(page.getByTestId('catalog-grid')).toBeVisible();
        // The full page has rendered: the enumeration below reads a settled
        // grid, not a partially rendered one.
        await expect(cards).toHaveCount(PAGE_SIZE);

        // An in-stock card carries no `product-card-stock` marker; the first one
        // is the phone this scenario adds.
        const total = await cards.count();
        let pickedIndex = -1;
        for (let i = 0; i < total; i++) {
          if ((await cards.nth(i).getByTestId('product-card-stock').count()) === 0) {
            pickedIndex = i;
            break;
          }
        }
        expect(pickedIndex).toBeGreaterThanOrEqual(0);
        await cards.nth(pickedIndex).getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        // The card was picked for carrying no "Elfogyott" marker.
        await expect(page.getByTestId('product-stock')).toHaveText(IN_STOCK_TEXT);
        await expect(productName).not.toBeEmpty();

        // The variant the card opened, read out of the address bar: the stored
        // line has to carry this one.
        const addedVariantId = new URL(page.url()).searchParams.get('variant') ?? '';
        expect(addedVariantId).not.toBe('');

        // The press lands in the mount the viewport shows: the inner button of
        // `add-to-cart-button` at 1024px and wider, the rail's `purchase-cta`
        // below it.
        await expect(addControl).toBeEnabled();
        await addControl.click();
        await expect(cartBadge).toHaveText('1');

        // Playwright exposes no locator for storage, so both entries are read
        // with a page script. The reads come after the badge proved the add
        // landed.
        const stored = await page.evaluate(
          (keys: { snapshotKey: string; sessionKey: string }) => ({
            snapshot: window.sessionStorage.getItem(keys.snapshotKey),
            sessionId: window.sessionStorage.getItem(keys.sessionKey),
          }),
          { snapshotKey: SNAPSHOT_KEY, sessionKey: SESSION_KEY },
        );
        snapshotRaw = stored.snapshot;
        sessionId = stored.sessionId ?? '';
        expect(sessionId).not.toBe('');

        const snapshot = parseSnapshot(snapshotRaw);
        expect(snapshot.parses).toBe(true);
        expect(snapshot.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(snapshot.providerId).toBe('mi-bolt');
        expect(snapshot.simulatedSessionId).toBe(sessionId);
        expect(snapshot.savedAt).not.toBeNull();
        expect(snapshot.expiresAt).not.toBeNull();
        expect(snapshot.cart).not.toBeNull();
        expect(snapshot.cart?.id).not.toBeNull();
        expect(snapshot.cart?.version).not.toBeNull();
        expect(snapshot.cart?.createdAt).not.toBeNull();
        expect(snapshot.cart?.expiresAt).not.toBeNull();
        expect(snapshot.cart?.items).toHaveLength(1);
        expect(snapshot.cart?.items?.[0]?.variantId).toBe(addedVariantId);
        expect(snapshot.cart?.items?.[0]?.quantity).toBe(1);
      });

      // 2. Build the expired entry from it and install it with `page.addInitScript`
      // before the next `page.goto`, writing both keys, then record every
      // `console` message.
      await test.step("2. Build the expired entry from it — the cart's `createdAt` two days back and its `expiresAt` one day back, `savedAt` and the top-level `expiresAt` unchanged — install it with `page.addInitScript` before the next `page.goto`, writing both `mi-bolt.snapshot.default` and `mi-bolt.demo-session`, and record every `console` message.", async () => {
        const seed: ExpiredSeed = {
          snapshotKey: SNAPSHOT_KEY,
          sessionKey: SESSION_KEY,
          entry: toExpiredEntry(snapshotRaw ?? '', Date.now()),
          sessionId,
        };
        // Runs before any page script, so the next load hydrates the expired
        // cart the shop itself wrote and finds it by the same session id.
        await page.addInitScript((values: ExpiredSeed) => {
          window.sessionStorage.setItem(values.snapshotKey, values.entry);
          window.sessionStorage.setItem(values.sessionKey, values.sessionId);
        }, seed);

        // The mock's responses come from inside the service worker, so the
        // expired read is observed through this record: the mock's own line for
        // the read, which every engine writes. The read's 410 also reaches page
        // response events in all three engines, so this record is chosen for its
        // identical content across engines, not because response events miss it.
        page.on('console', (message) => {
          consoleMessages.push(message.text());
        });

        // The installed cart's `expiresAt` lies before now, which is the state
        // the row's "Restore expired cart" means; its own `expiresAt` still
        // lies after its `createdAt`, so the entry passes the shape allowlist.
        const expired = parseSnapshot(seed.entry);
        expect(expired.parses).toBe(true);
        expect(expired.savedAt).not.toBeNull();
        expect(expired.expiresAt).not.toBeNull();
        expect(expired.cart?.createdAt).not.toBeNull();
        expect(expired.cart?.expiresAt).not.toBeNull();
        const createdAtMs = Date.parse(expired.cart?.createdAt ?? '');
        const expiresAtMs = Date.parse(expired.cart?.expiresAt ?? '');
        expect(expiresAtMs).toBeLessThan(Date.now());
        expect(createdAtMs).toBeLessThan(Date.now());
        expect(expiresAtMs).toBeGreaterThan(createdAtMs);
      });

      // 3. Open `/penztar/kosar` with an explicit timeout and wait until
      // `cart-page` has left its loading state, then read the page.
      await test.step('3. Open `/penztar/kosar` with an explicit timeout and wait until `cart-page` has left its loading state, then read the page.', async () => {
        await page.goto('/penztar/kosar', { timeout: 10000 });

        // The page settles on the empty state rather than on an error: the
        // first read answered 410 and the read after it got a fresh empty cart.
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(emptyState).toBeVisible();
        await expect(
          emptyState.getByRole('heading', { name: 'A kosarad még üres.' }),
        ).toBeVisible();
        await expect(
          emptyState.getByText('Nézd meg a demókészülékeket, és válaszd ki a kedvenced.'),
        ).toBeVisible();
        await expect(emptyState.getByRole('button', { name: 'Telefonokat nézek' })).toBeVisible();

        // The first read of the cart answered 410 Gone. The mock produces it
        // inside the service worker and writes its own line for it, which the
        // poll waits to reach the test; the 410 also reaches page response
        // events in all three engines.
        await expect.poll(() => consoleMessages.join('\n')).toMatch(EXPIRED_CART_READ);

        // Nothing of the expired cart and nothing of an error is rendered.
        await expect(page.getByTestId('cart-line')).toHaveCount(0);
        await expect(page.getByTestId('error-state')).toHaveCount(0);
        await expect(page.getByTestId('cart-count')).toHaveCount(0);
        await expect(page.getByTestId('cart-continue')).toHaveCount(0);
        await expect(page.getByTestId('order-summary')).toHaveCount(0);

        // The screen says nothing at all about the expiry.
        await expect(page.locator('app-status-message')).toHaveCount(0);
        await expect(page.getByTestId('cart-notice')).toHaveCount(0);
      });

      // 4. Deep-link the last step of the wizard and wait until the address
      // changes or `review-page` appears.
      await test.step("4. Deep-link the last step of the wizard: `page.goto('/penztar/ellenorzes', { timeout: 10000 })` and wait until the address changes or `review-page` appears.", async () => {
        await page.goto('/penztar/ellenorzes', { timeout: 10000 });

        // The expired cart cannot reach the order step, so the deep link is sent
        // back to the cart with its reason in the address bar.
        await expect(page).toHaveURL(/\/penztar\/kosar\?navigationReason=empty-cart$/);
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('review-page')).toHaveCount(0);

        await expect(reasonBanner).toBeVisible();
        await expect(reasonBanner).toContainText('A kosarad üres, ezért ide irányítottunk.');
        await expect(reasonBanner.getByRole('button', { name: 'Bezárás' })).toBeVisible();

        await expect(page.getByTestId('review-submit')).toHaveCount(0);
      });

      // 5. Press the empty state's "Telefonokat nézek" action.
      await test.step('5. Press the empty state\'s "Telefonokat nézek" action.', async () => {
        await emptyState.getByRole('button', { name: 'Telefonokat nézek' }).click();

        // The catalogue is shown, and the badge reads 0: the shopper continues
        // on the fresh empty cart the expired one was replaced by.
        await expect(page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' })).toBeVisible();
        await expect(cards.first()).toBeVisible();
        await expect(cartBadge).toHaveText('0');
      });
    },
  );

  test.fixme('[E059] explicit expiry', { tag: '@integration' }, async () => {
    // Missing expectation: "Explicit expiry" — the expired cart is replaced
    // without a word: the cart page and the review step's banner say only that
    // the cart is empty, and nothing tells the shopper their cart expired
    // rather than that it was emptied (issue MIM-449). The screen shows the
    // empty state "A kosarad még üres." and, after the review deep link, the
    // "A kosarad üres, ezért ide irányítottunk." banner, exactly as the first
    // test asserts.
  });
});
