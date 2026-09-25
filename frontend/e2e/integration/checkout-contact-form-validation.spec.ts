// spec: specs/storefront-integration.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: from the cart to the receipt', () => {
  test(
    'the contact form reports its validation errors',
    { tag: '@integration' },
    async ({ page }) => {
      // The purchase control is laid out differently at the two integration
      // viewports: below 1024px the desktop CTA column is `display: none` (the
      // `.cta-desktop` rule in the product page stylesheet) and the sticky
      // `purchase-rail`, hidden above 1024px (the `.rail` rule in the mobile
      // buy rail stylesheet), carries the same "Kosárba teszem" press as its
      // `purchase-cta`. Both mounts stay in the DOM at either width, so the
      // viewport decides which one the test drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      // `cart-badge` is read on the product page only: `/penztar/*` runs under
      // the checkout layout, whose header renders no badge at all (it carries
      // "Vissza a shopba" instead).
      const cartBadge = page.getByTestId('cart-badge');
      const contactPage = page.getByTestId('contact-page');
      const contactForm = page.getByTestId('contact-form');
      const contactSummary = page.getByTestId('contact-summary');
      const fullNameInput = page.getByTestId('contact-fullname-input');
      const emailInput = page.getByTestId('contact-email-input');
      const phoneInput = page.getByTestId('contact-phone-input');
      const submitButton = page.getByTestId('contact-submit').getByRole('button');
      // Each input's `aria-describedby` names its own message paragraph (the
      // `contact-*-input` fields in contact-step.html), whose id is
      // `<fieldId>-message` (FormFieldMessage.describedById), so the message is
      // addressed by that id.
      const emailMessage = page.locator('#contact-email-message');
      const phoneMessage = page.locator('#contact-phone-message');

      // 1. Open `/telefonok`, wait for the grid, open the first in-stock card,
      // add it with the inner button of `add-to-cart-button`, open the cart
      // with `cart-link` and press `cart-continue` ("Tovább az adatokhoz").
      await test.step('Open `/telefonok`, wait for the grid, open the first in-stock card, add it with the inner button of `add-to-cart-button`, open the cart with `cart-link` and press `cart-continue` ("Tovább az adatokhoz").', async () => {
        await page.goto('/telefonok');
        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(page.getByTestId('product-page')).toBeVisible();
        await addToCartButton.click();
        // The add is a request of its own; the header badge reaching 1 is what
        // says it has landed before the cart is opened.
        await expect(cartBadge).toHaveText('1');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactPage).toBeVisible();
        await expect(
          contactPage.getByRole('heading', { level: 1, name: 'Kapcsolattartási adatok' }),
        ).toBeVisible();
        await expect(
          contactForm.getByText('A csillaggal jelölt mezők kitöltése kötelező.'),
        ).toBeVisible();
        await expect(page.getByTestId('contact-demo-notice')).toContainText('Demó pénztár');
      });

      // 2. Press the inner button of `contact-submit` ("Tovább a szállításhoz")
      // with every field empty.
      await test.step('Press the inner button of `contact-submit` ("Tovább a szállításhoz") with every field empty.', async () => {
        await submitButton.click();

        await expect(contactSummary).toBeVisible();
        await expect(contactSummary).toContainText(
          'Kérlek, javítsd a következő mezőket a folytatás előtt:',
        );
        await expect(
          contactSummary.getByRole('link', { name: 'Teljes név: A teljes név kötelező.' }),
        ).toBeVisible();
        await expect(
          contactSummary.getByRole('link', { name: 'E-mail cím: Az e-mail cím kötelező.' }),
        ).toBeVisible();
        await expect(
          contactSummary.getByRole('link', { name: 'Telefonszám: A telefonszám kötelező.' }),
        ).toBeVisible();
        await expect(fullNameInput).toHaveAttribute('aria-invalid', 'true');
        await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
        await expect(phoneInput).toHaveAttribute('aria-invalid', 'true');
        await expect(page).toHaveURL(/\/penztar\/adatok$/);
      });

      // 3. Type "Teszt Elek" into `contact-fullname-input`, "teszt@" into
      // `contact-email-input` and "1234" into `contact-phone-input`, then press
      // `contact-submit` again.
      await test.step('Type "Teszt Elek" into `contact-fullname-input`, "teszt@" into `contact-email-input` and "1234" into `contact-phone-input`, then press `contact-submit` again.', async () => {
        await fullNameInput.fill('Teszt Elek');
        await emailInput.fill('teszt@');
        await phoneInput.fill('1234');
        await submitButton.click();

        await expect(emailMessage).toHaveText('Adj meg egy érvényes e-mail címet.');
        await expect(phoneMessage).toHaveText(
          'Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
        );
        await expect(
          contactSummary.getByRole('link', {
            name: 'E-mail cím: Adj meg egy érvényes e-mail címet.',
          }),
        ).toBeVisible();
        await expect(
          contactSummary.getByRole('link', {
            name: 'Telefonszám: Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
          }),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/penztar\/adatok$/);
      });

      // 4. Correct the form: "Teszt Elek", "teszt@example.test" and
      // "+36 30 123 4567"; then press `contact-submit`.
      await test.step('Correct the form: "Teszt Elek", "teszt@example.test" and "+36 30 123 4567"; then press `contact-submit`.', async () => {
        await emailInput.fill('teszt@example.test');
        await phoneInput.fill('+36 30 123 4567');
        await submitButton.click();

        const deliveryStep = page.getByTestId('delivery-step');
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(deliveryStep).toBeVisible();
        await expect(
          deliveryStep.getByRole('heading', { level: 1, name: 'Átvétel és fizetés' }),
        ).toBeVisible();
        await expect(
          page.getByTestId('delivery-confirm').getByRole('button', {
            name: 'Tovább az ellenőrzéshez',
          }),
        ).toBeVisible();

        // The saved contact is read the way the review step reads it. The
        // review step itself is not reachable here: its guard sends an
        // incomplete draft back to `/penztar/szallitas`, so the draft the
        // contact step prefills from is what proves the values were saved.
        // The mock no longer keeps the draft in `sessionStorage` (owner,
        // 2026-09-25, standard row E016), so a full page load drops the
        // contact section and the guard sends the shopper to
        // `/penztar/adatok?navigationReason=incomplete`. The draft stays in
        // the page's memory when navigation stays in-app, so the browser
        // history's `Back` step is what returns to the contact step here.
        await page.goBack();
        await expect(contactPage).toBeVisible();
        await expect(fullNameInput).toHaveValue('Teszt Elek');
        await expect(emailInput).toHaveValue('teszt@example.test');
        // The draft holds the phone in its normalised form.
        await expect(phoneInput).toHaveValue('+36301234567');

        // Forward again with the saved values, which leaves the wizard on the
        // delivery step it advanced to.
        await submitButton.click();
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(deliveryStep).toBeVisible();
      });
    },
  );
});
