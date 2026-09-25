// spec: specs/checkout-edge-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

test.describe('Checkout: edge paths', () => {
  test(
    'a server-side contact error reaches the form and its summary',
    { tag: '@integration' },
    async ({ page }) => {
      // The purchase control is laid out differently at the two integration
      // viewports: below 1024px the product page's desktop CTA column is
      // `display: none` and the sticky `purchase-rail` carries the same
      // "Kosárba teszem" press through its `purchase-cta`. Both mounts stay in
      // the DOM at either width, so the viewport decides which one the test
      // drives.
      const narrowViewport = (page.viewportSize()?.width ?? 0) < 1024;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');

      // `cart-badge` is read on the product page only: `/penztar/*` runs under
      // the checkout layout, whose header renders no badge at all.
      const cartBadge = page.getByTestId('cart-badge');
      const contactPage = page.getByTestId('contact-page');
      const contactSummary = page.getByTestId('contact-summary');
      const fullNameInput = page.getByTestId('contact-fullname-input');
      const emailInput = page.getByTestId('contact-email-input');
      const phoneInput = page.getByTestId('contact-phone-input');
      const submitButton = page.getByTestId('contact-submit').getByRole('button');
      // The input's `aria-describedby` names its own message paragraph (the
      // `contact-email-input` field in contact-step.html), whose id is
      // `<fieldId>-message` (FormFieldMessage.describedById).
      const emailMessage = page.locator('#contact-email-message');

      // 1. Reach the contact step: open `/telefonok`, open the first card
      // without a `product-card-stock` marker, add it with the inner button of
      // `add-to-cart-button`, open the cart with `cart-link`, press the inner
      // button of `cart-continue`.
      await test.step('Reach the contact step: open `/telefonok`, open the first card without a `product-card-stock` marker, add it with the inner button of `add-to-cart-button`, open the cart with `cart-link`, press the inner button of `cart-continue`.', async () => {
        await page.goto('/telefonok');
        const cards = page.getByTestId('product-card');
        // The grid renders a loading status while it is empty, so waiting for
        // the first card means the pick below reads real cards.
        await expect(cards.first()).toBeVisible();
        // The product is never named: the first card that carries no
        // "Elfogyott" marker is the one the screen offers as buyable.
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
        // Nothing is prefilled: the placeholder values on the inputs are not
        // content, and a pre-filled form would satisfy the required fields
        // without the shopper having entered anything. The submit control stays
        // pressable on an incomplete form; the step validates on the press.
        await expect(fullNameInput).toHaveValue('');
        await expect(emailInput).toHaveValue('');
        await expect(phoneInput).toHaveValue('');
        await expect(submitButton).toBeEnabled();
      });

      // 2. Type "Teszt Elek" into `contact-fullname-input`, "+36 30 123 4567"
      // into `contact-phone-input` and "teszt@-example.test" into
      // `contact-email-input` (an address the form's own rules accept but the
      // mock refuses).
      await test.step('Type "Teszt Elek" into `contact-fullname-input`, "+36 30 123 4567" into `contact-phone-input` and "teszt@-example.test" into `contact-email-input` (an address the form\'s own rules accept but the mock refuses).', async () => {
        await fullNameInput.fill('Teszt Elek');
        await phoneInput.fill('+36 30 123 4567');
        await emailInput.fill('teszt@-example.test');

        // The form's own rule accepts this address (a local part, then a domain
        // label, then a TLD), so nothing is flagged until the mock answers.
        await expect(emailMessage).toBeHidden();
        await expect(emailInput).not.toHaveAttribute('aria-invalid', 'true');
        await expect(contactSummary).toHaveCount(0);
        await expect(submitButton).toBeEnabled();
      });

      // 3. Press the inner button of `contact-submit`.
      await test.step('Press the inner button of `contact-submit`.', async () => {
        await submitButton.click();

        // The mock answers the draft patch with a 422 per-field refusal, so the
        // wizard stays on the step and the refusal lands on the form itself.
        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactPage).toBeVisible();

        await expect(contactSummary).toBeVisible();
        await expect(contactSummary).toContainText(
          'Kérlek, javítsd a következő mezőket a folytatás előtt:',
        );
        const summaryLink = contactSummary.getByRole('link');
        await expect(summaryLink).toHaveCount(1);
        await expect(summaryLink).toHaveText('E-mail cím: Adj meg egy érvényes e-mail címet.');
        // The anchor points at the field and carries the wire pointer, so the
        // summary can be matched back to the payload it came from.
        await expect(summaryLink).toHaveAttribute('href', '#contact-email-input');
        await expect(summaryLink).toHaveAttribute('data-pointer', '/email');

        await expect(emailMessage).toHaveText('Adj meg egy érvényes e-mail címet.');
        await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
        // A per-field refusal is not the generic save failure.
        await expect(page.getByTestId('contact-save-error')).toHaveCount(0);
      });

      // 4. Click the summary's "E-mail cím: Adj meg egy érvényes e-mail címet."
      // link.
      await test.step('Click the summary\'s "E-mail cím: Adj meg egy érvényes e-mail címet." link.', async () => {
        await contactSummary.getByRole('link').click();

        // The link is an in-page anchor to the field, not a navigation: the URL
        // keeps no hash and the summary stays where it was.
        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactPage).toBeVisible();
        await expect(contactSummary).toBeVisible();
      });

      // 5. Correct the address: type "teszt@example.test" into
      // `contact-email-input`.
      await test.step('Correct the address: type "teszt@example.test" into `contact-email-input`.', async () => {
        await emailInput.fill('teszt@example.test');

        // The server error is keyed to the values that were saved, so editing
        // the field drops it: the summary and the field message both go.
        await expect(contactSummary).toHaveCount(0);
        await expect(emailMessage).toBeHidden();
        await expect(emailInput).not.toHaveAttribute('aria-invalid', 'true');
      });

      // 6. Press the inner button of `contact-submit` again.
      await test.step('Press the inner button of `contact-submit` again.', async () => {
        await submitButton.click();

        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        const deliveryStep = page.getByTestId('delivery-step');
        await expect(deliveryStep).toBeVisible();
        await expect(
          deliveryStep.getByRole('heading', { level: 1, name: 'Átvétel és fizetés' }),
        ).toBeVisible();
        // The step was reached through the wizard rather than by a deep link.
        await expect(page.getByTestId('navigation-reason')).toHaveCount(0);
      });
    },
  );
});
