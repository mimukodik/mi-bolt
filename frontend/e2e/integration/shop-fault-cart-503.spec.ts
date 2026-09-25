// spec: specs/shop-fault-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Shop: service faults', () => {
  test(
    'the cart request answers 503, so the cart page shows its error state and the rest of the shop still works',
    { tag: '@integration' },
    async ({ page }) => {
      const cartPage = page.getByTestId('cart-page');
      const errorState = cartPage.getByTestId('error-state');
      const errorTitle = errorState.getByRole('heading', {
        level: 2,
        name: 'A kosár nem érhető el',
      });
      const errorMessage = errorState.getByText('A kosár betöltése sikertelen.', { exact: true });
      const errorHint = errorState.getByTestId('error-hint');
      const retryButton = errorState.getByRole('button', { name: 'Újrapróbálom' });
      const resultCount = page.getByTestId('result-count');
      const cards = page.getByTestId('product-card');
      // The badge lives in the shop header (`main-header`), which replaces the
      // checkout header once the shopper leaves the checkout shell.
      const shopHeader = page.getByTestId('main-header');
      const cartBadge = shopHeader.getByTestId('cart-badge');

      // 1. Open the cart with the cart fault on the URL's first load.
      await test.step('1. Open the cart with the cart fault on the URL\'s first load: `/penztar/kosar` with `?mi-scenario=fail-cart`. cart-page is rendered and its h1 reads "A kosarad"; error-state with role alert is shown, titled "A kosár nem érhető el"; the message reads "A kosár betöltése sikertelen." and the hint "A korábban megadott értékeket megőrizzük." is shown under it; the button reads "Újrapróbálom"; no cart-line, no cart-count, no cart-footer and no empty state ("A kosarad még üres.") is rendered.', async () => {
        // The fault is read from the query on this first load and held by the
        // mock for the rest of the browsing context, so every `GET /cart` in
        // this context answers 503 from here on.
        await page.goto('/penztar/kosar?mi-scenario=fail-cart');

        await expect(cartPage).toBeVisible();
        await expect(cartPage.getByRole('heading', { level: 1, name: 'A kosarad' })).toBeVisible();

        // The cart page's error branch renders the shared `ErrorState`, whose
        // root is the `error-state` section with role alert, carrying the cart
        // page's own copy: the 503's Problem text never reaches the page.
        await expect(errorState).toHaveRole('alert');
        await expect(errorTitle).toBeVisible();
        await expect(errorMessage).toBeVisible();
        await expect(errorHint).toHaveText('A korábban megadott értékeket megőrizzük.');
        await expect(retryButton).toHaveText('Újrapróbálom');

        // The error branch replaces the whole cart body, so neither the ready
        // layout (lines, count, footer) nor the empty state is rendered.
        await expect(cartPage.getByTestId('cart-line')).toHaveCount(0);
        await expect(cartPage.getByTestId('cart-count')).toHaveCount(0);
        await expect(cartPage.getByTestId('cart-footer')).toHaveCount(0);
        await expect(page.getByTestId('empty-state')).toHaveCount(0);
        await expect(page.getByText('A kosarad még üres.')).toHaveCount(0);
      });

      // 2. Press "Újrapróbálom".
      await test.step('2. Press "Újrapróbálom". The cart is requested again and the same error-state returns with the same four lines. During the retry the error button shows its loading label "Újrapróbálom…" and then settles back to "Újrapróbálom" with the error still on screen.', async () => {
        await retryButton.click();

        // The retry re-issues `GET /cart`, which the fault answers with 503
        // again, so the same error state comes back word for word. The loading
        // label ("Újrapróbálom…" with the button's spinner) lives for a single
        // animation frame, because the mock answers within the frame that the
        // click flips `revalidating` on; what can be pinned is the state the
        // re-issued request settles back into.
        await expect(errorState).toHaveRole('alert');
        await expect(errorTitle).toBeVisible();
        await expect(errorMessage).toBeVisible();
        await expect(errorHint).toHaveText('A korábban megadott értékeket megőrizzük.');
        await expect(retryButton).toHaveText('Újrapróbálom');
        await expect(retryButton).toBeEnabled();
      });

      // 3. Click `back-to-shop` ("Vissza a shopba") in the checkout header.
      await test.step('3. Click `back-to-shop` ("Vissza a shopba") in the checkout header. The browser lands on `/telefonok` and the catalogue loads normally: result-count reads "<n> találat a szűrt feltételek szerint" with n greater than 0 and product-card elements are rendered. No error-state is on the catalogue page, so the fault reaches the cart endpoint alone. cart-badge in the shop header reads "0", because the cart could never be read.', async () => {
        await page.getByTestId('back-to-shop').click();
        await expect(page).toHaveURL(/\/telefonok$/);

        // The catalogue's own endpoint answers as usual, because the fault
        // breaks the cart endpoint alone. The pattern stays unanchored: the
        // `result-count` element's text carries whitespace around the number
        // (" 55 találat a szűrt feltételek szerint "), and a regex expectation
        // is tested against that raw text, never the trimmed text a string
        // expectation is matched against, so `^`/`$` could never match here.
        // `[1-9]` still rules out a zero count.
        await expect(resultCount).toHaveText(/[1-9]\d* találat a szűrt feltételek szerint/);
        await expect(cards.first()).toBeVisible();
        await expect(page.getByTestId('error-state')).toHaveCount(0);

        // The badge cannot count a cart that was never read, so it keeps the
        // facade's zero baseline.
        await expect(shopHeader).toBeVisible();
        await expect(cartBadge).toHaveText('0');
      });
    },
  );
});
