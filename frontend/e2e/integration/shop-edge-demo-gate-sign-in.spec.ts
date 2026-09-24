// spec: specs/shop-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The gated page the visitor asked for, its own query string included: the
// guard builds `vissza` from the state's URL (`demo-access.guard.ts`), so the
// whole string travels with the redirect.
const WANTED_PAGE = '/penztar/kosar?mi-scenario=demo-signed-out';

// The one password the mock accepts; not a secret (e2e/seed.spec.ts rule 11).
const DEMO_PASSWORD = '1MiBoltDemo1';

/**
 * True while the sign-in page carries the wanted page in its `vissza`
 * parameter. The check reads the parsed URL rather than its percent-encoding,
 * so it holds whatever case the browser writes the escapes in.
 */
function onSignInCarryingWantedPage(url: URL): boolean {
  return url.pathname === '/belepes' && url.searchParams.get('vissza') === WANTED_PAGE;
}

/** True when the browser sits back on the wanted page with no `vissza` left. */
function backOnWantedPage(url: URL): boolean {
  return url.pathname === '/penztar/kosar' && url.search === '?mi-scenario=demo-signed-out';
}

/** True on the shop's home page. */
function onHomePage(url: URL): boolean {
  return url.pathname === '/';
}

test.describe('Shop: edge paths', () => {
  test(
    'the demo gate sends a signed-out visitor to the sign-in page and back',
    { tag: '@integration' },
    async ({ page }) => {
      const form = page.getByTestId('demo-sign-in-form');
      const passwordField = page.getByTestId('demo-password-input');
      const submitHost = page.getByTestId('demo-sign-in-submit');
      const submit = submitHost.getByRole('button', { name: 'Belépés' });

      // 1. Open a protected route while signed out: `/penztar/kosar?mi-scenario=demo-signed-out`.
      await test.step('Open a protected route while signed out: `/penztar/kosar?mi-scenario=demo-signed-out`.', async () => {
        await page.goto(WANTED_PAGE);

        // The guard answers the navigation with a UrlTree, so the sign-in page
        // arrives one navigation later and `toHaveURL` retries until it lands.
        // The `demo-signed-out` scenario is what makes the mock answer the
        // gate's check with the contract's 401.
        await expect(page).toHaveURL(onSignInCarryingWantedPage);
        await expect(page).toHaveTitle('MiBolt — Belépés');
        await expect(page.getByTestId('cart-page')).toHaveCount(0);
      });

      // 2. Read the sign-in page.
      await test.step('Read the sign-in page.', async () => {
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Belépés a demóba');
        await expect(page.getByText('A MiBolt demó bolt jelszóval érhető el.')).toBeVisible();

        // One field, inside a `<label>` whose text is its accessible name, and
        // one submit control (`demo-sign-in-page.html`).
        await expect(form.locator('input, select, textarea')).toHaveCount(1);
        await expect(page.getByLabel('Jelszó')).toBeVisible();
        await expect(submitHost).toHaveText('Belépés');

        // The page is the gate: no AppShell around it, so no header, no cart
        // link and no demo notice.
        await expect(page.getByTestId('main-header')).toHaveCount(0);
        await expect(page.getByTestId('cart-link')).toHaveCount(0);
        await expect(page.getByTestId('demo-notice')).toHaveCount(0);
      });

      // 3. Press `demo-sign-in-submit` with the field empty.
      await test.step('Press `demo-sign-in-submit` with the field empty.', async () => {
        await submit.click();

        // The required rule's message appears on the first submit
        // (`FormFieldMessage.showMessage`), beside `aria-invalid` on the field.
        await expect(form.getByTestId('form-field-message')).toHaveText('Add meg a jelszót.');
        await expect(passwordField).toHaveAttribute('aria-invalid', 'true');

        // A refused submit issues no request and no navigation.
        await expect(page).toHaveURL(onSignInCarryingWantedPage);
      });

      // 4. Type a wrong password (for example "rossz-jelszo") and press `demo-sign-in-submit`.
      await test.step('Type a wrong password (for example "rossz-jelszo") and press `demo-sign-in-submit`.', async () => {
        await passwordField.fill('rossz-jelszo');
        await submit.click();

        // The mock answers a wrong password with the contract's 401, which the
        // page renders as the alert; the field's own message is gone, because
        // the value is no longer missing.
        await expect(page.getByTestId('demo-sign-in-error')).toHaveText(
          'Hibás jelszó. Próbáld újra.',
        );
        await expect(form.getByTestId('form-field-message')).not.toBeVisible();
        await expect(page).toHaveURL(onSignInCarryingWantedPage);
      });

      // 5. Type "1MiBoltDemo1" and press `demo-sign-in-submit`.
      await test.step('Type "1MiBoltDemo1" and press `demo-sign-in-submit`.', async () => {
        await passwordField.fill(DEMO_PASSWORD);
        await submit.click();

        // `vissza` is a same-origin absolute path, so the visitor goes back to
        // the page the guard took them from.
        await expect(page).toHaveURL(backOnWantedPage);
        await expect(page.getByTestId('demo-sign-in-error')).toHaveCount(0);

        const cartPage = page.getByTestId('cart-page');
        await expect(cartPage).toBeVisible();
        await expect(page.getByTestId('checkout-header')).toBeVisible();

        // The mock keys its cart by the scenario name and this scenario's cart
        // was never filled, so the page shows its empty state.
        const emptyState = cartPage.getByTestId('empty-state');
        await expect(emptyState.getByRole('heading', { level: 2 })).toHaveText(
          'A kosarad még üres.',
        );
        await expect(
          emptyState.getByText('Nézd meg a demókészülékeket, és válaszd ki a kedvenced.'),
        ).toBeVisible();
        await expect(emptyState.getByRole('button', { name: 'Telefonokat nézek' })).toBeVisible();
      });

      // 6. Open `/belepes?vissza=https%3A%2F%2Fevil.example&mi-scenario=demo-signed-out`, type "1MiBoltDemo1" and press `demo-sign-in-submit`.
      await test.step('Open `/belepes?vissza=https%3A%2F%2Fevil.example&mi-scenario=demo-signed-out`, type "1MiBoltDemo1" and press `demo-sign-in-submit`.', async () => {
        await page.goto('/belepes?vissza=https%3A%2F%2Fevil.example&mi-scenario=demo-signed-out');
        await passwordField.fill(DEMO_PASSWORD);
        await submit.click();

        // `isSafeReturnUrl` refuses an absolute target, so the visitor lands on
        // the home page instead.
        await expect(page).toHaveURL(onHomePage);
        await expect(page.getByTestId('hero-heading')).toBeVisible();
      });

      // 7. Open `/belepes?mi-scenario=demo-signed-out` with no `vissza` at all, type "1MiBoltDemo1" and press `demo-sign-in-submit`.
      await test.step('Open `/belepes?mi-scenario=demo-signed-out` with no `vissza` at all, type "1MiBoltDemo1" and press `demo-sign-in-submit`.', async () => {
        await page.goto('/belepes?mi-scenario=demo-signed-out');
        await passwordField.fill(DEMO_PASSWORD);
        await submit.click();

        // No `vissza` means the home page too.
        await expect(page).toHaveURL(onHomePage);
        await expect(page.getByTestId('hero-heading')).toBeVisible();
      });
    },
  );
});
