// MiBolt end-to-end conventions. Every playwright-test-* agent reads this file
// before it plans, generates or heals a test. Read it as rules, not as a sample.
//
// 1. Import `test` and `expect` from ./fixtures/coverage, never from
//    @playwright/test. The fixture starts and stops V8 coverage collection; a
//    spec that bypasses it is invisible to the coverage gate. ESLint enforces it.
// 2. page.reload() is banned. Use `await page.goto(page.url())` instead. The
//    data layer is MSW running as a service worker in the page (AGENTS.md); a
//    reload can re-register the worker or race its startup, and the coverage
//    fixture's `resetOnNavigation: false` collector is documented as not a
//    guaranteed reload collector (docs/spec/sources.md, S13). Playwright's
//    Firefox has reported `navigator.serviceWorker.controller` as null while a
//    worker controlled the page (https://github.com/microsoft/playwright/issues/37012),
//    the class of race a reload invites. The ban is this repository's own
//    decision; ESLint enforces it.
// 3. Locators, in this order of preference:
//    getByRole -> getByText -> getByLabel -> getByPlaceholder -> getByAltText
//    -> getByTitle -> getByTestId.  https://playwright.dev/docs/locators
//    This app has data-testid attributes everywhere (hero-heading,
//    add-to-cart, address-form, ...). Prefer a role when one exists; reach for
//    getByTestId when the accessible name is dynamic or Hungarian copy would
//    make the locator brittle. testIdAttribute is already `data-testid`.
// 4. Web-first assertions only. `expect(locator).toBeVisible()` and friends
//    retry; `expect(await locator.isVisible()).toBe(true)` does not.
//    No page.waitForTimeout, no waitForLoadState('networkidle'); use
//    expect.toPass() when a block has to be retried.
//    https://playwright.dev/docs/best-practices , /docs/test-assertions
// 5. Wrap each numbered plan step in test.step('<the step text>', ...) so the
//    HTML report reads like the plan. https://playwright.dev/docs/api/class-test#test-step
// 6. Shared setup goes in a fixture under e2e/fixtures/, not in beforeEach:
//    "if you have an after hook that tears down what was created in a before
//    hook, consider turning them into a fixture."  https://playwright.dev/docs/test-fixtures
// 7. Tests are isolated. Each test gets its own browser context; never lean on
//    state another test left behind, and never depend on file order.
//    https://playwright.dev/docs/browser-contexts
// 8. One test per file. The file name is the fs-friendly scenario name; the
//    test.describe title is the top-level plan item, verbatim; the test title
//    is the scenario name, verbatim. Two comment lines at the top of every
//    generated file: `// spec: specs/<plan>.md` and `// seed: e2e/seed.spec.ts`.
// 9. Tags: { tag: '@integration' } on everything under e2e/integration/, and
//    { tag: '@smoke' } on everything under e2e/smoke/. Selection is by
//    --grep / --grep-invert.  https://playwright.dev/docs/test-annotations#tag-tests
// 10. Never commit test.only. Never leave a test.fixme() without a comment
//    saying what the application actually does instead.
// 11. The demo gate. Signed out, every storefront route redirects to
//    /belepes, and every product, cart, checkout, order and payment call
//    answers 401. The demo payment page does not redirect: it shows "A demó
//    bolt jelszóval érhető el. Előbb lépj be a boltba." and a "Belépés a
//    boltba" link. /belepes has one password field and a "Belépés" button;
//    the password is 1MiBoltDemo1 (the backend's default; MIBOLT_DEMO_PASSWORD
//    overrides it, but is read only while the demo_user table is empty) and
//    is not a secret, so a spec may type it as a literal. A
//    wrong password shows "Hibás jelszó. Próbáld újra." The MSW projects
//    start signed in, and `?mi-scenario=demo-signed-out` starts the shop
//    signed out. The smoke project runs on the real backend and is already
//    signed in: its global setup, fixtures/backend-ready.ts, posts
//    /api/v1/demo/session once and saves a storageState that
//    playwright.config.ts gives the project. A smoke spec that needs the
//    signed-out state starts without it:
//    test.use({ storageState: { cookies: [], origins: [] } }).
//    https://playwright.dev/docs/auth#avoid-authentication-in-some-tests
//    The admin at /admin/ is not behind this gate. It has its own sign-in,
//    username `admin`, password `mibolt-admin-demo` on its MSW mock and on
//    the real backend the one the task gives. Signed out, product images
//    under /api/v1/media/ answer 401 too, and the storefront then shows its
//    first-letter fallback (data-testid image-fallback); on the real backend
//    the admin's product image previews load from that same path, so they
//    show only after the same browser has signed in at the shop's /belepes.

import { test, expect } from './fixtures/coverage';

test.describe('Seed', () => {
  test('the shop serves its home page on MSW', async ({ page }) => {
    await test.step('open the application root', async () => {
      const response = await page.goto('/');
      expect(response?.ok()).toBe(true);
    });

    await test.step('the app has bootstrapped with MSW active', async () => {
      // Angular only bootstraps after startMocks() resolves (src/main.ts), so
      // the hero heading rendering proves both bootstrap and MSW startup.
      // The getByTestId pin matters: the fatal-state template in
      // src/index.html also contains an `<h1>`, and `getByRole('heading',
      // { level: 1 })` would match that one when MSW fails, hiding the bug.
      await expect(page.getByTestId('hero-heading')).toBeVisible();
    });
  });
});
