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

import { test, expect } from './fixtures/coverage';

test.describe('Seed', () => {
  test('the shop serves its home page on MSW', { tag: '@integration' }, async ({ page }) => {
    await test.step('open the application root', async () => {
      const response = await page.goto('/');
      expect(response?.ok()).toBe(true);
    });

    await test.step('the app has bootstrapped and MSW has served the catalogue', async () => {
      // Angular only bootstraps after startMocks() resolves (src/main.ts), so a
      // rendered h1 proves the MSW worker came up.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  });
});
