// spec: specs/checkout-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: edge paths', () => {
  // CI skips this spec (@ci-skip, BOLT-7): the wizard refuses a step whose earlier sections are missing; it runs locally.
  test(
    'the wizard refuses a step whose earlier sections are missing',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      // The purchase control is laid out differently at the two integration
      // viewports: below 1024px the desktop CTA column is `display: none` and
      // the sticky `purchase-rail` carries the same "Kosárba teszem" press as
      // its `purchase-cta`. Both mounts stay in the DOM at either width, so the
      // viewport decides which one the test drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      const contactPage = page.getByTestId('contact-page');
      const deliveryStep = page.getByTestId('delivery-step');
      const reviewPage = page.getByTestId('review-page');
      // The banner host leaves the flow and its `navigation-reason` element is
      // rendered only while a reason sentence exists, so no reason means no
      // element at all (the `navigation-reason` template and the host display
      // binding in navigation-reason-banner.ts).
      const navigationReason = page.getByTestId('navigation-reason');
      const incompleteReason = 'Előbb ezt a lépést kell kitöltened, utána léphetsz tovább.';

      // 1. Open `/telefonok`, wait for the grid, open the first `product-card`
      // that has no `product-card-stock` marker through its `product-card-cta`,
      // press the inner button of `add-to-cart-button`, then open the cart with
      // `cart-link` and press the inner button of `cart-continue` ("Tovább az
      // adatokhoz").
      await test.step('Open `/telefonok`, wait for the grid, open the first `product-card` that has no `product-card-stock` marker through its `product-card-cta`, press the inner button of `add-to-cart-button`, then open the cart with `cart-link` and press the inner button of `cart-continue` ("Tovább az adatokhoz").', async () => {
        await page.goto('/telefonok');
        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();
        // The product is never named: the first card without the "Elfogyott"
        // marker is the one the screen offers as buyable.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await addToCartButton.click();
        // The add is a request of its own; the header badge reaching 1 is what
        // says it has landed before the cart is opened.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactPage).toBeVisible();
        await expect(
          contactPage.getByRole('heading', { level: 1, name: 'Kapcsolattartási adatok' }),
        ).toBeVisible();
      });

      // 2. Deep-link the delivery step before the contact section is saved:
      // open `/penztar/szallitas`.
      await test.step('Deep-link the delivery step before the contact section is saved: open `/penztar/szallitas`.', async () => {
        // The guard hydrates asynchronously, so the redirect lands after the
        // navigation: the URL assertion is what waits for it.
        await page.goto('/penztar/szallitas');

        await expect(page).toHaveURL(/\/penztar\/adatok\?navigationReason=incomplete$/);
        await expect(navigationReason).toBeVisible();
        await expect(navigationReason).toContainText(incompleteReason);
        await expect(navigationReason.getByRole('button', { name: 'Bezárás' })).toBeVisible();
        await expect(contactPage).toBeVisible();
        await expect(deliveryStep).toHaveCount(0);
      });

      // 3. Fill the contact form with "Teszt Elek", "teszt@example.test" and
      // "+36 30 123 4567", then press the inner button of `contact-submit`
      // ("Tovább a szállításhoz").
      await test.step('Fill the contact form with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567", then press the inner button of `contact-submit` ("Tovább a szállításhoz").', async () => {
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        await page.getByTestId('contact-submit').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(deliveryStep).toBeVisible();
        await expect(
          deliveryStep.getByRole('heading', { level: 1, name: 'Átvétel és fizetés' }),
        ).toBeVisible();
        // The step was reached through the wizard, not by a deep link, so the
        // route carries no reason and the banner renders nothing.
        await expect(navigationReason).toHaveCount(0);
      });

      // 4. Deep-link the review step while the contact draft is in memory:
      // open `/penztar/ellenorzes`. The mock no longer keeps the draft in
      // `sessionStorage` outside the card round trip (mock standard E016,
      // owner, 2026-09-25), so the full page load drops the saved contact
      // and the guard sends the shopper back to the contact step with the
      // cart kept, not to the delivery step with the contact restored.
      await test.step('Deep-link the review step while the contact draft is in memory: open `/penztar/ellenorzes`. The mock no longer keeps the draft in `sessionStorage` outside the card round trip (mock standard E016, owner, 2026-09-25), so the full page load drops the saved contact and the guard sends the shopper back to the contact step with the cart kept, not to the delivery step with the contact restored.', async () => {
        await page.goto('/penztar/ellenorzes');

        // The guard lands on the contact step, not on the delivery step:
        // the saved contact was not restored across the page load.
        await expect(page).toHaveURL(/\/penztar\/adatok\?navigationReason=incomplete$/);
        await expect(navigationReason).toBeVisible();
        await expect(navigationReason).toContainText(incompleteReason);
        await expect(contactPage).toBeVisible();
        await expect(deliveryStep).toHaveCount(0);
        await expect(reviewPage).toHaveCount(0);

        // The contact form starts empty: the saved draft is not restored.
        await expect(page.getByTestId('contact-fullname-input')).toHaveValue('');
        await expect(page.getByTestId('contact-email-input')).toHaveValue('');
        await expect(page.getByTestId('contact-phone-input')).toHaveValue('');

        // The cart is kept: the contact page's own order summary still
        // shows the line that was added before the page load.
        await expect(
          page.getByTestId('order-summary-subtotal').getByTestId('price-amount'),
        ).toBeVisible();
      });
    },
  );
});
