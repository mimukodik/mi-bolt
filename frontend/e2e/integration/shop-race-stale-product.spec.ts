// spec: specs/shop-race-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Shop: a newer request wins the race', () => {
  // CI skips this spec (@ci-skip, BOLT-7): a late first product answer cannot overwrite the second page; it runs locally.
  test(
    '[E038] a second product page keeps its address and heading when the first product answers late',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      await page.clock.install();

      const resultCount = page.getByTestId('result-count');
      const cards = page.getByTestId('product-card');
      const firstCard = cards.nth(0);
      const secondCard = cards.nth(1);
      const firstCta = firstCard.getByTestId('product-card-cta');
      const secondCta = secondCard.getByTestId('product-card-cta');
      const productPage = page.getByTestId('product-page');
      const productLoading = page.getByTestId('product-loading');
      const productName = page.getByTestId('product-name');
      const related = page.getByTestId('related-products');

      // The mock holds this document's first product request for 2000 ms
      // (`?mi-scenario=slow-once-product`). The listeners are registered before
      // that route is opened, so the request's settlement is recorded from its
      // start: leaving the route aborts it, which Playwright reports here as a
      // failed request, and it is never recorded as a response.
      const failedProductRequests: string[] = [];
      const answeredProductRequests: string[] = [];
      page.on('requestfailed', (request) => {
        const { pathname } = new URL(request.url());
        // The detail path is `/api/v1/products/<slug>`; the catalogue list's
        // own `/api/v1/products` is a different request.
        if (!pathname.startsWith('/api/v1/products/')) return;
        const reason = request.failure()?.errorText ?? 'no failure reason';
        failedProductRequests.push(`${pathname} ${reason}`);
      });
      page.on('response', (response) => {
        const { pathname } = new URL(response.url());
        if (!pathname.startsWith('/api/v1/products/')) return;
        answeredProductRequests.push(pathname);
      });

      // Read off the first two cards in step 1 and held for the later steps:
      // the ctas' `href` (the shown variant travels in its `?variant=`), the
      // cards' names, and the slugs read out of the address bar.
      let firstHref = '';
      let firstName = '';
      let secondHref = '';
      let secondName = '';
      let firstSlug = '';
      let secondSlug = '';

      // 1. Open `/telefonok?mi-scenario=slow-once-product`, wait for the grid,
      // and read the first two cards.
      await test.step('1. Open `/telefonok?mi-scenario=slow-once-product`, wait for the grid, and read the first two cards.', async () => {
        // The scenario query arms the fault on this page load, so this load's
        // first product request is the one answered 2000 ms late.
        await page.goto('/telefonok?mi-scenario=slow-once-product');

        // The counter reads "Keresés a katalógusban…" while the first response
        // is in flight, so this text is only reached once it landed.
        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);

        await expect(firstCard).toBeVisible();
        await expect(secondCard).toBeVisible();

        // Neither card carries the "Elfogyott" marker: both are in stock.
        await expect(firstCard.getByTestId('product-card-stock')).toHaveCount(0);
        await expect(secondCard.getByTestId('product-card-stock')).toHaveCount(0);

        // Each card's name, shown colour and storage size is read from the card
        // itself, and its cta carries the shown variant in `?variant=`.
        const firstHeading = firstCard.getByRole('heading', { level: 3 });
        const secondHeading = secondCard.getByRole('heading', { level: 3 });
        await expect(firstHeading).toHaveText(/\S/);
        await expect(firstCard.locator('.variant__color')).toHaveText(/\S/);
        await expect(firstCard.locator('.variant__storage')).toHaveText(/\S/);
        await expect(secondHeading).toHaveText(/\S/);
        await expect(secondCard.locator('.variant__color')).toHaveText(/\S/);
        await expect(secondCard.locator('.variant__storage')).toHaveText(/\S/);

        await expect(firstCta).toBeVisible();
        await expect(secondCta).toBeVisible();
        firstHref = (await firstCta.getAttribute('href')) ?? '';
        secondHref = (await secondCta.getAttribute('href')) ?? '';
        expect(firstHref).toContain('?variant=');
        expect(secondHref).toContain('?variant=');

        firstName = ((await firstHeading.textContent()) ?? '').trim();
        secondName = ((await secondHeading.textContent()) ?? '').trim();
      });

      // 2. Open the first card through its `product-card-cta`, read its slug
      // out of the address and note it as the first slug, then read the page
      // while the product's request is held.
      await test.step("2. Open the first card through its `product-card-cta`, read its slug out of the address and note it as the first slug, then read the page while the product's request is held.", async () => {
        // The card's shown variant travels in the query, so the address bar
        // reads `/telefonok/<slug>?variant=<id>` for the very card opened.
        await firstCta.click();

        await expect(productPage).toBeVisible();
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === firstHref);

        // The request `GET /api/v1/products/<first slug>` is the one the mock
        // holds for 2000 ms, so the page is still in its loading state.
        await expect(productLoading).toBeVisible();

        // The slug the variant id is built from, read after the assertion
        // above proved the new address rendered.
        firstSlug = new URL(page.url()).pathname.split('/').pop() ?? '';
        expect(firstSlug).not.toBe('');
        expect(firstHref).toContain(firstSlug);

        // The related strip is requested only after the product has loaded:
        // the heading is not rendered, the strip is not on screen, and no
        // in-page link leads to another product to switch through.
        await expect(productName).toHaveCount(0);
        await expect(related).toHaveCount(0);
        await expect(productPage.locator('a[href^="/telefonok/"]')).toHaveCount(0);
      });

      // 3. Switch routes before the held answer lands: go back to the
      // catalogue with the browser's back, wait for the grid, and open the
      // second `product-card` through its `product-card-cta`.
      await test.step("3. Switch routes before the held answer lands: go back to the catalogue with the browser's back, wait for the grid, and open the second `product-card` through its `product-card-cta`.", async () => {
        // The browser's back is an in-app navigation: the armed scenario stays
        // for this document and the address drops its query.
        await page.goBack();

        await expect(resultCount).toHaveText('55 találat a szűrt feltételek szerint');
        await expect(cards).toHaveCount(12);
        await expect(page).toHaveURL((url) => url.pathname === '/telefonok');

        // The second card opened through its cta, still inside the held window.
        await secondCta.click();

        await expect(productPage).toBeVisible();
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === secondHref);
        await expect(productName).toHaveText(secondName);

        // The slug read off the address bar differs from the first one.
        secondSlug = new URL(page.url()).pathname.split('/').pop() ?? '';
        expect(secondSlug).not.toBe(firstSlug);

        // The first product's request was cancelled rather than answered: the
        // page reports `GET /api/v1/products/<first slug>` as a failed request
        // when the second product page requests its own, and no response is
        // ever recorded for it. The error text a cancelled request carries is
        // engine-specific (Chromium reports `net::ERR_ABORTED`, Firefox
        // `NS_BINDING_ABORTED`, WebKit `cancelled`), so the settlement itself
        // is asserted here and one engine's abort code is not: that no response
        // carries the first slug is what proves the held answer never landed.
        await expect
          .poll(() => failedProductRequests.join(' | '))
          .toContain(`/api/v1/products/${firstSlug}`);
        expect(answeredProductRequests).not.toContain(`/api/v1/products/${firstSlug}`);
      });

      // 4. Hold the check across the moment the first product's answer would
      // have landed and re-read the page.
      await test.step("4. Hold the check across the moment the first product's answer would have landed and re-read the page.", async () => {
        // The second product page has finished loading: the loading state is
        // gone and the heading names the second card's phone.
        await expect(productLoading).toBeHidden();
        await expect(productName).toHaveText(secondName);

        // The page never shows the first card's phone.
        await expect(productName).not.toHaveText(firstName);

        // The address still carries the second slug and its `?variant=`.
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === secondHref);

        // The product route's own title carries no product name (measured on
        // the running app), so a stale write would change the heading.
        await expect(page).toHaveTitle('MiBolt — Termék');

        // The page clock (page.clock, BOLT-7) runs past the moment the held
        // answer would have landed; the second phone and the second slug stay.
        await page.clock.fastForward(2000);
        await expect(productName).toHaveText(secondName);
        await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === secondHref);
      });
    },
  );
});
