// spec: specs/checkout-story-paths.md
// seed: e2e/seed.spec.ts

import { test, expect } from '../fixtures/coverage';

// The product page mounts its add control differently at the two integration
// widths: at 1024 px and wider the desktop CTA block carries
// `add-to-cart-button`, and below that width the block is `display: none` (the
// `.cta-desktop` rule in the product page stylesheet) while the fixed
// `purchase-rail` carries the same "Kosárba teszem" press through its
// `purchase-cta` (mobile-buy-rail.html), the only mount with a size at that
// width. Both mounts stay in the DOM either way, so the viewport decides which
// one the test drives.
const DESKTOP_MIN_WIDTH = 1024;

test.describe('Checkout: standard stories', () => {
  test(
    '[E075] the contact step reports each boundary on its own and sends nothing until the form is valid',
    { tag: '@integration' },
    async ({ page }) => {
      const narrowViewport = (page.viewportSize()?.width ?? 0) < DESKTOP_MIN_WIDTH;
      const addToCartButton = narrowViewport
        ? page.getByTestId('purchase-rail').getByTestId('purchase-cta').getByRole('button')
        : page.getByTestId('add-to-cart-button').getByRole('button');
      // The add confirmation is mounted twice — by the page's own status
      // message on the wide layout and by the rail's copy on the narrow one —
      // and the hidden mount carries the same text, so the assertion targets
      // whichever one the viewport shows.
      const addConfirmation = page.getByTestId('status-message').filter({ visible: true });
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
      const fullNameMessage = page.locator('#contact-fullname-message');
      const emailMessage = page.locator('#contact-email-message');
      const phoneMessage = page.locator('#contact-phone-message');

      // The draft save the wizard sends on a valid contact step: every PATCH to
      // the checkout endpoint, and the status each answered with. The plan arms
      // this recording when the contact step is reached, before any submit.
      const checkoutRequests: { readonly method: string; readonly url: string }[] = [];
      const checkoutResponseStatuses: number[] = [];

      // 1. Reach the contact step: open `/telefonok`, wait for `catalog-grid`,
      // open the first `product-card` without a `product-card-stock` marker
      // through its `product-card-cta`, add the variant with the inner button of
      // `add-to-cart-button` at 1024 px and wider or of the sticky rail's
      // `purchase-cta` at 390x844, open the cart with `cart-link`, and press the
      // inner button of `cart-continue`. Start recording the browser's request
      // events.
      await test.step("1. Reach the contact step: open `/telefonok`, wait for `catalog-grid`, open the first `product-card` without a `product-card-stock` marker through its `product-card-cta`, add the variant with the inner button of `add-to-cart-button` at 1024 px and wider or of the sticky rail's `purchase-cta` at 390x844, open the cart with `cart-link`, and press the inner button of `cart-continue`. Start recording the browser's request events.", async () => {
        await page.goto('/telefonok');
        await expect(page.getByTestId('catalog-grid')).toBeVisible();

        const cards = page.getByTestId('product-card');
        await expect(cards.first()).toBeVisible();
        // A card renders its "Elfogyott" marker in `product-card-stock` only
        // when it is out of stock, so the first card without one is the first
        // buyable one.
        const inStockCard = cards
          .filter({ hasNot: page.getByTestId('product-card-stock') })
          .first();
        await expect(inStockCard).toBeVisible();
        await inStockCard.getByTestId('product-card-cta').click();

        await expect(addToCartButton).toBeEnabled();
        await addToCartButton.click();
        // The add is a request of its own; the confirmation reaching the cart is
        // what says it has landed before the cart is opened.
        await expect(addConfirmation).toContainText('1 darab a kosárban.');

        await page.getByTestId('cart-link').click();
        await expect(page.getByTestId('cart-page')).toBeVisible();
        await page.getByTestId('cart-continue').getByRole('button').click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactPage).toBeVisible();
        await expect(contactPage.getByRole('heading', { level: 1 })).toHaveText(
          'Kapcsolattartási adatok',
        );
        await expect(
          contactForm.getByText('A csillaggal jelölt mezők kitöltése kötelező.'),
        ).toBeVisible();
        await expect(page.getByTestId('contact-demo-notice')).toBeVisible();

        // The submit control is enabled with every field empty: the step never
        // disables it for an incomplete form, it reports the errors on press.
        await expect(submitButton).toBeEnabled();

        // The recording starts here, before any submit: only a locally valid
        // form may send a draft save.
        page.on('request', (request) => {
          if (request.method() === 'PATCH' && request.url().endsWith('/api/v1/checkout')) {
            checkoutRequests.push({ method: request.method(), url: request.url() });
          }
        });
        page.on('response', (response) => {
          if (
            response.request().method() === 'PATCH' &&
            response.url().endsWith('/api/v1/checkout')
          ) {
            checkoutResponseStatuses.push(response.status());
          }
        });
      });

      // 2. Type "A" into `contact-fullname-input` (one character, below the
      // storefront's floor of 2, `CONTACT_NAME_MIN`), "teszt@example.test" into
      // `contact-email-input` and "+36 30 123 4567" into `contact-phone-input`,
      // then press the inner button of `contact-submit`.
      await test.step('2. Type "A" into `contact-fullname-input` (one character, below the storefront\'s floor of 2, `CONTACT_NAME_MIN`), "teszt@example.test" into `contact-email-input` and "+36 30 123 4567" into `contact-phone-input`, then press the inner button of `contact-submit`.', async () => {
        await fullNameInput.fill('A');
        await emailInput.fill('teszt@example.test');
        await phoneInput.fill('+36 30 123 4567');
        await expect(submitButton).toBeEnabled();
        await submitButton.click();

        // The step refuses the too-short name: the wizard stays on the contact
        // step and the summary names the one invalid field.
        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactPage).toBeVisible();
        await expect(contactSummary).toBeVisible();
        await expect(contactSummary).toContainText(
          'Kérlek, javítsd a következő mezőket a folytatás előtt:',
        );
        await expect(contactSummary.getByRole('listitem')).toHaveCount(1);
        await expect(
          contactSummary.getByRole('link', {
            name: 'Teljes név: Add meg a teljes neved (legalább 2 karakter).',
          }),
        ).toBeVisible();
        await expect(fullNameMessage).toHaveText('Add meg a teljes neved (legalább 2 karakter).');
        await expect(fullNameInput).toHaveAttribute('aria-invalid', 'true');

        // The step saves nothing while the form is invalid.
        expect(checkoutRequests).toEqual([]);
      });

      // 3. Set `contact-fullname-input` to a 101-character name (above the
      // ceiling of 100, `CONTACT_NAME_MAX`; the input carries
      // `maxlength="100"`, so the value is set past that attribute) and press
      // the inner button of `contact-submit`.
      await test.step('3. Set `contact-fullname-input` to a 101-character name (above the ceiling of 100, `CONTACT_NAME_MAX`; the input carries `maxlength="100"`, so the value is set past that attribute) and press the inner button of `contact-submit`.', async () => {
        // A typed or `fill`-ed value cannot pass the input's `maxlength="100"`,
        // so the 101-character value is assigned directly on the element and an
        // `input` event raised, which is what the form field binds to.
        await fullNameInput.evaluate((el) => {
          if (!(el instanceof HTMLInputElement)) {
            throw new Error('contact-fullname-input is not an HTMLInputElement');
          }
          el.focus();
          el.value = 'A'.repeat(101);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await submitButton.click();

        // The ceiling is reported on its own, and the summary lists one line.
        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactSummary).toBeVisible();
        await expect(contactSummary.getByRole('listitem')).toHaveCount(1);
        await expect(
          contactSummary.getByRole('link', {
            name: 'Teljes név: A teljes név legfeljebb 100 karakter lehet.',
          }),
        ).toBeVisible();
        await expect(fullNameMessage).toHaveText('A teljes név legfeljebb 100 karakter lehet.');

        // Still no save while the form is invalid.
        expect(checkoutRequests).toEqual([]);
      });

      // 4. Set `contact-fullname-input` to "Teszt Elek" and
      // `contact-email-input` to "teszt@" (an address with no valid form: the
      // storefront accepts the RFC 5322 subset its own pattern matches, up to
      // 254 characters), then press the inner button of `contact-submit`.
      await test.step('4. Set `contact-fullname-input` to "Teszt Elek" and `contact-email-input` to "teszt@" (an address with no valid form: the storefront accepts the RFC 5322 subset its own pattern matches, up to 254 characters), then press the inner button of `contact-submit`.', async () => {
        await fullNameInput.fill('Teszt Elek');
        await emailInput.fill('teszt@');
        await submitButton.click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactSummary).toBeVisible();
        await expect(contactSummary.getByRole('listitem')).toHaveCount(1);
        await expect(
          contactSummary.getByRole('link', {
            name: 'E-mail cím: Adj meg egy érvényes e-mail címet.',
          }),
        ).toBeVisible();
        await expect(emailMessage).toHaveText('Adj meg egy érvényes e-mail címet.');
        await expect(emailInput).toHaveAttribute('aria-invalid', 'true');

        expect(checkoutRequests).toEqual([]);
      });

      // 5. Set `contact-email-input` to "teszt@example.test" and
      // `contact-phone-input` to "1234" (a form the storefront refuses: a
      // Hungarian number is "+36" followed by 8 or 9 national digits, with
      // spaces, hyphens, parentheses and a leading national "0" normalized
      // away), then press the inner button of `contact-submit`.
      await test.step('5. Set `contact-email-input` to "teszt@example.test" and `contact-phone-input` to "1234" (a form the storefront refuses: a Hungarian number is "+36" followed by 8 or 9 national digits, with spaces, hyphens, parentheses and a leading national "0" normalized away), then press the inner button of `contact-submit`.', async () => {
        await emailInput.fill('teszt@example.test');
        await phoneInput.fill('1234');
        await submitButton.click();

        await expect(page).toHaveURL(/\/penztar\/adatok$/);
        await expect(contactSummary).toBeVisible();
        await expect(contactSummary.getByRole('listitem')).toHaveCount(1);
        await expect(
          contactSummary.getByRole('link', {
            name: 'Telefonszám: Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
          }),
        ).toBeVisible();
        await expect(phoneMessage).toHaveText(
          'Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
        );
        await expect(phoneInput).toHaveAttribute('aria-invalid', 'true');

        expect(checkoutRequests).toEqual([]);
      });

      // 6. Correct the phone to "+36 30 123 4567" and press the inner button of
      // `contact-submit`.
      await test.step('6. Correct the phone to "+36 30 123 4567" and press the inner button of `contact-submit`.', async () => {
        await phoneInput.fill('+36 30 123 4567');

        // The corrected value reaches the form on the next render, and it takes
        // the refused press's state with it: the phone field stops carrying
        // `aria-invalid` and the summary above the form actions is removed,
        // which lifts the submit button. The press has to come after that has
        // settled — aimed at the button's old position it would miss it and
        // leave the shopper on the contact step.
        await expect(phoneInput).not.toHaveAttribute('aria-invalid', 'true');
        await expect(contactSummary).toHaveCount(0);

        await submitButton.click();

        // The wizard advances: the step saves only once the form is locally
        // valid, and the summary is gone with the error.
        await expect(page).toHaveURL(/\/penztar\/szallitas$/);
        await expect(page.getByTestId('delivery-step')).toBeVisible();
        await expect(
          page.getByTestId('delivery-step').getByRole('heading', { level: 1 }),
        ).toHaveText('Átvétel és fizetés');
        await expect(contactSummary).toHaveCount(0);

        // Exactly one draft save left the step, and it was accepted.
        expect(checkoutRequests).toHaveLength(1);
        expect(checkoutRequests[0]?.method).toBe('PATCH');
        expect(checkoutRequests[0]?.url).toMatch(/\/api\/v1\/checkout$/);
        expect(checkoutResponseStatuses).toEqual([200]);
      });
    },
  );
});
