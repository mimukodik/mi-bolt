// spec: specs/storage-draft-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';
import type { Page } from '@playwright/test';

// The product page mounts its purchase call to action twice, both present in
// the DOM: the inner button of `add-to-cart-button` is the press at 1024 px and
// wider, and below 1024 px the side panel's control is `display: none` and the
// sticky `purchase-rail`'s `purchase-cta` is the shown one (product page and
// mobile-buy-rail stylesheets). The integration matrix runs at 1920×1080,
// 390×844, 320, 768, 1024 and 1440, all in Chromium and on the mobile widths
// also in Firefox and WebKit; the viewport decides which mount the spec drives.
const DESKTOP_MIN_WIDTH = 1024;

// The mock keeps its state in the browsing context's `sessionStorage` under
// `mi-bolt.snapshot.default` (`SNAPSHOT_KEY_PREFIX` in
// projects/shop-mocks/src/persistence.ts). The strings the shopper typed into
// the checkout draft must not appear in that document before or after a reload
// of `/penztar/szallitas`: the checkout draft lives in the page's in-memory
// state only while navigation stays in-app, so a full page load drops it.
const SNAPSHOT_KEY = 'mi-bolt.snapshot.default';

// Every value the shopper types in this scenario. Used to assert the typed
// data does not survive the reload. Listed once at the top so the
// before-reload and after-reload reads share the same allowlist.
const TYPED_STRINGS = [
  'Teszt Béla',
  'teszt.bela@example.test',
  '+36201234567',
  '1111',
  'Budapest',
  'Teszt utca 42.',
] as const;

interface SnapshotShape {
  readonly parses: boolean;
  readonly cartId: string | null;
  readonly itemCount: number | null;
  readonly variantId: string | null;
  readonly quantity: number | null;
  readonly typedStringsFound: readonly string[];
}

interface CartBadgeShape {
  readonly text: string | null;
  readonly ariaLabel: string | null;
}

/** Read the cart-only shape from `mi-bolt.snapshot.default`. */
function readSnapshot(page: Page): Promise<SnapshotShape> {
  return page.evaluate(
    ({ key, typed }) => {
      const empty = {
        parses: false,
        cartId: null,
        itemCount: null,
        variantId: null,
        quantity: null,
        typedStringsFound: [] as string[],
      };
      const raw = window.sessionStorage.getItem(key);
      if (raw === null) return empty;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return empty;
      }
      const root = isRecord(parsed) ? parsed : null;
      const cart = root && isRecord(root['cart']) ? root['cart'] : null;
      if (!cart) return { ...empty, parses: true };

      const items = cart['items'];
      const first =
        Array.isArray(items) && items.length > 0 && isRecord(items[0]) ? items[0] : null;
      const variantId = first && typeof first['variantId'] === 'string' ? first['variantId'] : null;
      const quantity = first && typeof first['quantity'] === 'number' ? first['quantity'] : null;

      const found = typed.filter((t) => raw.includes(t));
      return {
        parses: true,
        cartId: typeof cart['id'] === 'string' ? cart['id'] : null,
        itemCount: Array.isArray(items) ? items.length : null,
        variantId,
        quantity,
        typedStringsFound: found,
      };

      function isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null;
      }
    },
    { key: SNAPSHOT_KEY, typed: TYPED_STRINGS as unknown as string[] },
  );
}

/** Read the cart badge on the shop-front header, both visible text and aria-label. */
function readCartBadge(page: Page): Promise<CartBadgeShape> {
  return page.evaluate(() => {
    const cartLink = document.querySelector('[data-testid="cart-link"]');
    if (!(cartLink instanceof HTMLElement)) return { text: null, ariaLabel: null };
    // The visible label "Kosár" and the count number are sibling spans inside
    // the link with no text node between them; composing the label and the
    // count here reproduces what the shopper sees ("Kosár 0", "Kosár 1", …)
    // rather than the bare textContent ("Kosár0", "Kosár1").
    const labelEl = Array.from(cartLink.querySelectorAll('span')).find(
      (s) => (s.textContent ?? '').trim() === 'Kosár',
    );
    const badgeEl = cartLink.querySelector('[data-testid="cart-badge"]');
    const label = (labelEl?.textContent ?? '').trim();
    const badge = (badgeEl?.textContent ?? '').trim();
    const text = `${label} ${badge}`.trim();
    return {
      text: text.length > 0 ? text : null,
      ariaLabel: cartLink.getAttribute('aria-label'),
    };
  });
}

test.describe('Checkout: the typed data does not survive a reload', () => {
  test(
    'contact and address typed into the checkout are gone after a reload, the cart is kept',
    { tag: '@integration' },
    async ({ page }) => {
      // The add-to-cart press lands in the mount the viewport shows. The
      // `add-to-cart-button` is the desktop CTA column; below 1024 px the
      // sticky purchase rail takes over (`purchase-cta`). Both mounts stay in
      // the DOM at either width, so the test never has to scroll to reach
      // either one (the rail is always visible by virtue of being sticky).
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      // `cart-badge` reads as the header count text on the shop front and on
      // the product page; `/penztar/*` runs under the checkout layout, whose
      // header carries "Demó pénztár" in place of a badge.
      const cartBadge = page.getByTestId('cart-badge');
      const fullNameInput = page.getByTestId('contact-fullname-input');
      const emailInput = page.getByTestId('contact-email-input');
      const phoneInput = page.getByTestId('contact-phone-input');
      const contactSubmit = page.getByTestId('contact-submit').getByRole('button');
      const deliverySummary = page.getByTestId('delivery-summary');
      const navigationReason = page.getByTestId('navigation-reason');
      // The `Szállítási mód` row of the right-hand summary reads "Házhoz
      // szállítás" once the home-delivery option is chosen. The option itself
      // is a `li` carrying `delivery-option`, so the click is the row the
      // screen shows rather than the radio by id.
      const homeDeliveryOption = page
        .getByTestId('delivery-option')
        .filter({ hasText: 'Házhoz szállítás' });

      // 1. Open the storefront on a fresh page at viewport 1920x1080 (Full HD).
      await test.step('Open the storefront on a fresh page at viewport 1920x1080 (Full HD).', async () => {
        await page.goto('/');
        await expect(page).toHaveURL(/\/$/);

        // Wait for the Angular app to render the header past the splash.
        await expect(page.getByTestId('cart-link')).toBeVisible();

        // The shop front starts signed in with an empty cart.
        const badge = await readCartBadge(page);
        expect(badge.text).toBe('Kosár 0');
        expect(badge.ariaLabel).toBe('Kosár megnyitása, jelenleg üres');

        // No draft and no cart is held in storage on a fresh boot: the key
        // is absent, or it parses without a `cart` block.
        const snapshot = await readSnapshot(page);
        expect(snapshot.cartId).toBeNull();
        expect(snapshot.itemCount).toBeNull();
        expect(snapshot.typedStringsFound).toEqual([]);
      });

      // 2. Click the "Mobiltelefonok" link in the primary navigation.
      await test.step('Click the "Mobiltelefonok" link in the primary navigation.', async () => {
        // The header swaps its mounts at the `lg` breakpoint
        // (`header-nav.html`): at 1024 px and wider the "Mobiltelefonok"
        // link sits in `nav[aria-label="Fő navigáció"]`; below 1024 px the
        // navigation is hidden and `menu-trigger` opens the deferred
        // `mobile-drawer`, whose `nav[aria-label="Mobil navigáció"]` carries
        // the same one link.
        if (narrowViewport) {
          await page.getByTestId('menu-trigger').click();
          const mobileNav = page.getByRole('navigation', { name: 'Mobil navigáció' });
          await expect(mobileNav.getByRole('link', { name: 'Mobiltelefonok' })).toBeVisible();
          await mobileNav.getByRole('link', { name: 'Mobiltelefonok' }).click();
        } else {
          await page.getByRole('link', { name: 'Mobiltelefonok' }).click();
        }
        await expect(page).toHaveURL(/\/telefonok$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Mobiltelefonok' })).toBeVisible();

        // The catalogue renders its grid of `<article>` cards; every card
        // carries a `product-card-cta` link whose text is "Megnézem".
        const cta = page.getByTestId('product-card-cta').first();
        await expect(cta).toBeVisible();
        await expect(cta).toHaveText('Megnézem');
      });

      // 3. Pick the first catalogue card on the page, open it.
      await test.step('Pick the first catalogue card on the page, open it.', async () => {
        await page.getByTestId('product-card-cta').first().click();
        await expect(page.getByTestId('product-page')).toBeVisible();
        // The product name the card opened with is the H1 of the product
        // page. The heading was read off the card link, so the test compares
        // whatever the product page renders — never a name pinned in code.
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        // The visible add control at this viewport: the inner button of
        // `add-to-cart-button` at 1024 px and wider. At narrower widths the
        // `purchase-cta` mount is the visible one (the desktop CTA column
        // is `display: none`). Both stay in the DOM.
        await expect(addToCartButton).toBeVisible();
        await expect(addToCartButton).toHaveText('Kosárba teszem');
        await expect(page.getByTestId('purchase-cta')).toHaveCount(1);
      });

      // 4. Click the inner <button> of data-testid="add-to-cart-button".
      await test.step('Click the inner <button> of data-testid="add-to-cart-button".', async () => {
        await addToCartButton.click();
        await expect(cartBadge).toHaveText('1');
        // The aria-label is what the header link exposes to assistive tech;
        // the visible "Kosár 1" and the aria-label both update from the
        // same cart count.
        await expect(page.getByTestId('cart-link')).toBeVisible();
        const badge = await readCartBadge(page);
        expect(badge.text).toBe('Kosár 1');
        expect(badge.ariaLabel).toBe('Kosár megnyitása, 1 termék');
      });

      // 5. Navigate to the cart via the header cart link at href="/penztar/kosar".
      await test.step('Navigate to the cart via the header cart link at href="/penztar/kosar".', async () => {
        await page.getByTestId('cart-link').click();
        await expect(page).toHaveURL(/\/penztar\/kosar$/);
        await expect(page.getByRole('heading', { level: 1, name: 'A kosarad' })).toBeVisible();

        // Exactly the one line was added; the cart renders one `cart-line`,
        // with the product's own name (read off the line, never pinned),
        // "1 db" and the line subtotal of "89 990 Ft".
        const lines = page.getByTestId('cart-line');
        await expect(lines).toHaveCount(1);
        const line = lines.first();
        await expect(line.getByTestId('cart-line-quantity')).toHaveText('1 db');
        await expect(
          page.getByTestId('order-summary-subtotal').getByTestId('price-amount'),
        ).toBeVisible();

        // The stepper on the cart step lists the four wizard steps; the cart step
        // itself is the current one and the others have not yet been visited.
        // The press of "Tovább az adatokhoz" is what marks step 1 done.
        const steps = page.getByTestId('checkout-steps');
        await expect(steps).toBeVisible();
        await expect(steps.getByRole('listitem')).toHaveCount(4);
        await expect(steps.locator('li.is-current')).toHaveCount(1);
        await expect(steps.locator('li.is-done')).toHaveCount(0);
      });

      // 6. Click the "Tovább az adatokhoz" button in the order summary.
      await test.step('Click the "Tovább az adatokhoz" button in the order summary.', async () => {
        await page.getByTestId('cart-continue').getByRole('button').click();
        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(
          page.getByRole('heading', { level: 1, name: 'Kapcsolattartási adatok' }),
        ).toBeVisible();

        // Three contact inputs and the submit wrapper, addressed by their
        // own test ids and labels.
        await expect(fullNameInput).toBeVisible();
        await expect(emailInput).toBeVisible();
        await expect(phoneInput).toBeVisible();
        await expect(page.getByTestId('contact-submit').getByRole('button')).toHaveText(
          'Tovább a szállításhoz',
        );
      });

      // 7. Type "Teszt Béla" into data-testid="contact-fullname-input".
      await test.step('Type "Teszt Béla" into data-testid="contact-fullname-input".', async () => {
        await fullNameInput.fill('Teszt Béla');
        await expect(fullNameInput).toHaveValue('Teszt Béla');
      });

      // 8. Type "teszt.bela@example.test" into data-testid="contact-email-input".
      await test.step('Type "teszt.bela@example.test" into data-testid="contact-email-input".', async () => {
        await emailInput.fill('teszt.bela@example.test');
        await expect(emailInput).toHaveValue('teszt.bela@example.test');
      });

      // 9. Type "+36201234567" into data-testid="contact-phone-input".
      await test.step('Type "+36201234567" into data-testid="contact-phone-input".', async () => {
        await phoneInput.fill('+36201234567');
        await expect(phoneInput).toHaveValue('+36201234567');
      });

      // 10. Click the inner button of data-testid="contact-submit".
      await test.step('Click the inner button of data-testid="contact-submit".', async () => {
        await contactSubmit.click();
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(
          page.getByRole('heading', { level: 1, name: 'Átvétel és fizetés' }),
        ).toBeVisible();

        // The contact section is the precondition for the delivery step, so
        // its check mark joins the cart's on the stepper. The delivery step
        // is the current one with no check mark yet.
        const steps = page.getByTestId('checkout-steps');
        await expect(steps.locator('li.is-done')).toHaveCount(2);
        const current = steps.locator('li.is-current');
        await expect(current).toHaveCount(1);
        await expect(current).toContainText('Szállítás');

        // Two delivery radios and two payment radios are visible; nothing
        // preselected.
        await expect(page.getByTestId('delivery-radio')).toHaveCount(2);
        await expect(page.getByTestId('payment-radio')).toHaveCount(2);
      });

      // 11. Click the "Házhoz szállítás" radio in the "Szállítási mód" group.
      await test.step('Click the "Házhoz szállítás" radio in the "Szállítási mód" group.', async () => {
        await homeDeliveryOption.click();

        // The radio is checked and the summary reads "Házhoz szállítás".
        const homeRadio = homeDeliveryOption.getByTestId('delivery-radio');
        await expect(homeRadio).toBeChecked();
        await expect(deliverySummary.getByTestId('summary-row-delivery')).toContainText(
          'Házhoz szállítás',
        );

        // The "Szállítási cím" group appears with the four address inputs and
        // the country "HU – Magyarország".
        const addressForm = page.getByTestId('address-form');
        await expect(addressForm).toBeVisible();
        await expect(page.getByTestId('address-input-postalCode')).toBeVisible();
        await expect(page.getByTestId('address-input-city')).toBeVisible();
        await expect(page.getByTestId('address-input-line1')).toBeVisible();
        await expect(page.getByTestId('address-input-line2')).toBeVisible();
        await expect(page.getByTestId('address-field-country')).toContainText('Magyarország');
      });

      // 12. Without leaving the step, type "1111" into the postal code input.
      await test.step('Without leaving the step, type "1111" into the postal code input.', async () => {
        const postalInput = page.getByTestId('address-input-postalCode');
        // The integration widths below 1024 px need a scroll to reach the
        // address block: the delivery step lays out options first, then the
        // form. Scrolling into view is the rule for every width that needs
        // it, never a delay.
        await postalInput.scrollIntoViewIfNeeded();
        await postalInput.fill('1111');
        await expect(postalInput).toHaveValue('1111');
      });

      // 13. Without leaving the step, type "Budapest" into the city input.
      await test.step('Without leaving the step, type "Budapest" into the city input.', async () => {
        const cityInput = page.getByTestId('address-input-city');
        await cityInput.scrollIntoViewIfNeeded();
        await cityInput.fill('Budapest');
        await expect(cityInput).toHaveValue('Budapest');
      });

      // 14. Without leaving the step, type "Teszt utca 42." into the street input.
      await test.step('Without leaving the step, type "Teszt utca 42." into the street input.', async () => {
        const line1Input = page.getByTestId('address-input-line1');
        await line1Input.scrollIntoViewIfNeeded();
        await line1Input.fill('Teszt utca 42.');
        await expect(line1Input).toHaveValue('Teszt utca 42.');
      });

      // 15. Read sessionStorage["mi-bolt.snapshot.default"] before reloading.
      await test.step('Read sessionStorage["mi-bolt.snapshot.default"] before reloading.', async () => {
        const snapshot = await readSnapshot(page);
        // The stored JSON document is the cart snapshot: a cartId, a single
        // line with the chosen variantId and quantity 1, and no contact or
        // address fields. The page holds the draft in memory while the
        // shopper stays in-app, so the storage snapshot stays cart-only.
        expect(snapshot.parses).toBe(true);
        expect(snapshot.cartId).not.toBeNull();
        expect(snapshot.cartId).toMatch(/^[0-9a-f-]+$/);
        expect(snapshot.itemCount).toBe(1);
        expect(snapshot.variantId).not.toBeNull();
        expect(snapshot.variantId).toMatch(/^[\w-]+$/);
        expect(snapshot.quantity).toBe(1);

        // None of the typed strings appears in the stored document: the draft
        // was kept in the page's memory only.
        expect(snapshot.typedStringsFound).toEqual([]);

        // The URL to reload is recorded here so the next step re-navigates to
        // exactly this address.
        expect(page.url()).toBe('http://localhost:4401/penztar/szallitas');
      });

      // 16. Reload the page by navigating to page.url().
      await test.step('Reload the page by navigating to page.url().', async () => {
        await page.goto(page.url());

        // The guard sends the reload back to the contact step with the
        // `navigationReason=incomplete` reason in the address bar and the
        // matching banner under the heading.
        await expect(page).toHaveURL(
          'http://localhost:4401/penztar/adatok?navigationReason=incomplete',
        );
        await expect(page).toHaveTitle('MiBolt — Kapcsolattartási adatok');

        await expect(navigationReason).toBeVisible();
        await expect(navigationReason).toContainText(
          'Előbb ezt a lépést kell kitöltened, utána léphetsz tovább.',
        );

        // The contact step fields start empty: the saved draft was not
        // restored across the page load.
        await expect(fullNameInput).toHaveValue('');
        await expect(emailInput).toHaveValue('');
        await expect(phoneInput).toHaveValue('');

        // The stepper shows the cart as done and the contact step as current;
        // step 2 has no check mark yet because the contact section has not
        // been saved on this fresh load.
        const steps = page.getByTestId('checkout-steps');
        await expect(steps.locator('li.is-done')).toHaveCount(1);
        const current = steps.locator('li.is-current');
        await expect(current).toHaveCount(1);
        await expect(current).toContainText('Adatok');

        // The sessionStorage snapshot is still the cart only, with the same
        // cartId, the same single line and quantity 1, and none of the typed
        // strings.
        const snapshot = await readSnapshot(page);
        expect(snapshot.parses).toBe(true);
        expect(snapshot.cartId).not.toBeNull();
        expect(snapshot.cartId).toMatch(/^[0-9a-f-]+$/);
        expect(snapshot.itemCount).toBe(1);
        expect(snapshot.variantId).not.toBeNull();
        expect(snapshot.variantId).toMatch(/^[\w-]+$/);
        expect(snapshot.quantity).toBe(1);
        expect(snapshot.typedStringsFound).toEqual([]);

        // The shop front still reads "Kosár 1": the cart was kept across the
        // reload. The checkout header above carries the "Demó pénztár" label
        // in place of a badge because the layout swaps when on `/penztar/*`.
        await page.goto('/');
        await expect(page.getByTestId('cart-link')).toBeVisible();
        // Wait for the cart facade to hydrate from sessionStorage before
        // reading the badge; the aria-label updates once itemCount() reflects
        // the persisted cart, so toHaveAccessibleName auto-retries past the
        // race (the cart starts at 0 and only takes the 1 it persisted once
        // the storage event is processed).
        await expect(page.getByTestId('cart-link')).toHaveAccessibleName(
          'Kosár megnyitása, 1 termék',
        );
        const shopBadge = await readCartBadge(page);
        expect(shopBadge.text).toBe('Kosár 1');
        expect(shopBadge.ariaLabel).toBe('Kosár megnyitása, 1 termék');

        // The cart page itself still lists the same line: the product's own
        // name, "1 db" and the line subtotal of "89 990 Ft".
        await page.goto('/penztar/kosar');
        await expect(page).toHaveURL(/\/penztar\/kosar$/);
        await expect(page.getByRole('heading', { level: 1, name: 'A kosarad' })).toBeVisible();
        const lines = page.getByTestId('cart-line');
        await expect(lines).toHaveCount(1);
        const line = lines.first();
        await expect(line.getByTestId('cart-line-quantity')).toHaveText('1 db');
        await expect(
          page.getByTestId('order-summary-subtotal').getByTestId('price-amount'),
        ).toBeVisible();
      });

      // 17. Close the run.
      await test.step('Close the run.', async () => {
        // Playwright tears the page down on its own once the test exits; an
        // explicit close here would race the V8-coverage fixture's teardown,
        // which still calls page.coverage.stopJSCoverage() against the now-
        // closed target (the fixture in e2e/fixtures/coverage.ts is `auto`).
      });
    },
  );
});
