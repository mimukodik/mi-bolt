// spec: specs/checkout-fault-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The add control is laid out differently at the two integration viewports:
// below 1024px the product page's desktop CTA block is `display: none` (the
// `.cta-desktop` rule in the product page stylesheet) and the sticky
// `purchase-rail` carries the same "Kosárba teszem" press through its
// `purchase-cta`. Both mounts stay in the DOM at either width, so the viewport
// decides which one this test drives.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: service faults', () => {
  // CI skips this spec (@ci-skip, BOLT-7): an unreadable draft sends deep links back to the contact step; it runs locally.
  test(
    'a deep link to the delivery or review step bounces to the contact step when the draft cannot be read',
    { tag: ['@integration', '@ci-skip'] },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      const reasonBanner = page.getByTestId('navigation-reason');

      // 1. Open `/telefonok?mi-scenario=fail-checkout`, open the first
      // `product-card` with no `product-card-stock` marker through its
      // `product-card-cta`, add it with the inner button of
      // `add-to-cart-button`, open the cart with `cart-link`, press
      // `cart-continue`, fill the contact step with "Teszt Elek",
      // "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`.
      await test.step('Open `/telefonok?mi-scenario=fail-checkout`, open the first `product-card` with no `product-card-stock` marker through its `product-card-cta`, add it with the inner button of `add-to-cart-button`, open the cart with `cart-link`, press `cart-continue`, fill the contact step with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press `contact-submit`.', async () => {
        await page.goto('/telefonok?mi-scenario=fail-checkout');
        await expect(page.getByTestId('result-count')).toHaveText(
          '55 találat a szűrt feltételek szerint',
        );

        // The product is never named: the scenario picks its card by what the
        // screen shows, the first one without an "Elfogyott" marker.
        const inStockCard = page
          .getByTestId('product-card')
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();
        // The scenario breaks only the checkout draft read, so the addition
        // still succeeds and the header badge counts the line.
        await expect(page.getByTestId('cart-badge')).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await expect(page.getByTestId('cart-line')).toHaveCount(1);
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(page.getByTestId('contact-page')).toBeVisible();

        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        const contactSubmit = page.getByTestId('contact-submit').getByRole('button');
        await expect(contactSubmit).toBeEnabled();
        await contactSubmit.click();

        // The section write (`checkout-update`) is not the endpoint this
        // scenario breaks, so the contact section is written and the wizard
        // advances even though the draft read answers 503.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();
      });

      // 2. Open the delivery step as a fresh page load inside the fault:
      // navigate to `/penztar/szallitas?mi-scenario=fail-checkout`.
      await test.step('Open the delivery step as a fresh page load inside the fault: navigate to `/penztar/szallitas?mi-scenario=fail-checkout`.', async () => {
        await page.goto('/penztar/szallitas?mi-scenario=fail-checkout');

        // The delivery step's guard could not read the draft, so it sends the
        // shopper to the earliest step it cannot confirm.
        await expect(page).toHaveURL(/\/penztar\/adatok\?navigationReason=incomplete$/);
        await expect(page.getByTestId('contact-page')).toBeVisible();
        await expect(reasonBanner).toBeVisible();
        await expect(reasonBanner).toContainText(
          'Előbb ezt a lépést kell kitöltened, utána léphetsz tovább.',
        );
        await expect(reasonBanner.getByRole('button', { name: 'Bezárás' })).toBeVisible();

        // The form is seeded from the draft the page could not load, so the
        // section saved in the first step is not on screen.
        await expect(page.getByTestId('contact-fullname-input')).toHaveValue('');
        await expect(page.getByTestId('contact-email-input')).toHaveValue('');
        await expect(page.getByTestId('contact-phone-input')).toHaveValue('');

        // The delivery page is never reached and it does not fall back to an
        // error state either.
        await expect(page.getByTestId('delivery-step')).toHaveCount(0);
        await expect(page.getByTestId('error-state')).toHaveCount(0);
      });

      // 3. Open the review step the same way: navigate to
      // `/penztar/ellenorzes?mi-scenario=fail-checkout`.
      await test.step('Open the review step the same way: navigate to `/penztar/ellenorzes?mi-scenario=fail-checkout`.', async () => {
        await page.goto('/penztar/ellenorzes?mi-scenario=fail-checkout');

        // The same landing: no step past the contact form is reachable while
        // the draft read fails.
        await expect(page).toHaveURL(/\/penztar\/adatok\?navigationReason=incomplete$/);
        await expect(page.getByTestId('contact-page')).toBeVisible();
        await expect(reasonBanner).toBeVisible();
        await expect(reasonBanner).toContainText(
          'Előbb ezt a lépést kell kitöltened, utána léphetsz tovább.',
        );
        await expect(page.getByTestId('review-page')).toHaveCount(0);
      });

      // 4. Fill the contact form again with "Teszt Elek", "teszt@example.test"
      // and "+36 30 123 4567" and press the inner button of `contact-submit`.
      await test.step('Fill the contact form again with "Teszt Elek", "teszt@example.test" and "+36 30 123 4567" and press the inner button of `contact-submit`.', async () => {
        await page.getByTestId('contact-fullname-input').fill('Teszt Elek');
        await page.getByTestId('contact-email-input').fill('teszt@example.test');
        await page.getByTestId('contact-phone-input').fill('+36 30 123 4567');
        const contactSubmit = page.getByTestId('contact-submit').getByRole('button');
        await expect(contactSubmit).toBeEnabled();
        await contactSubmit.click();

        // The section write puts the session back in memory for this document,
        // so the wizard advances and no redirect reason stays on the route.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();
        await expect(reasonBanner).toHaveCount(0);
        // The wizard's own header still carries the step indicator, so the
        // shopper is inside the checkout session the cart was handed over to.
        await expect(page.getByTestId('checkout-steps')).toBeVisible();
      });
    },
  );
});
