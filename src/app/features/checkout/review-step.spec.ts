/**
 * S3-F2-5 — the review step on the 2.0.0 contract.
 *
 * Twenty-six cases over the rendered review surface. The component is
 * purely presentational: it injects nothing and calls no network.
 * `review-page.ts` (S3-F2) owns the facades and the navigation, and
 * drives this component through its nine declared inputs. The seven
 * view states and the payment-return branch belong to the sibling
 * states spec.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewStep, type CheckoutViewState } from './review-step';
import { TermsDialog } from './terms-dialog';
import { PriceBlock } from '../../shared/ui/price-block/price-block';

import type { Address } from '../../api/generated/models/address';
import type { BillingDetails } from '../../api/generated/models/billing-details';
import type { Cart } from '../../api/generated/models/cart';
import type { CartItem } from '../../api/generated/models/cart-item';
import type { CheckoutOptions } from '../../api/generated/models/checkout-options';
import type { CheckoutSession } from '../../api/generated/models/checkout-session';
import type { CheckoutSummary } from '../../api/generated/models/checkout-summary';
import type { Contact } from '../../api/generated/models/contact';
import type { DeliverySelection } from '../../api/generated/models/delivery-selection';
import type { PaymentSelection } from '../../api/generated/models/payment-selection';
import type { PaymentIntent } from '../../api/generated/models/payment-intent';

import type { PriceChange } from './checkout.facade';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADDRESS: Address = {
  countryCode: 'HU',
  postalCode: '1051',
  city: 'Budapest',
  line1: 'Fő utca 1.',
};

const CONTACT: Contact = {
  fullName: 'Teszt Elek',
  email: 'teszt@example.com',
  phone: '+36301234567',
};

const PADDED_CONTACT: Contact = {
  fullName: '  Teszt Elek  ',
  email: '  teszt@example.com  ',
  phone: '  +36301234567  ',
};

const BILLING: BillingDetails = {
  name: 'Teszt Elek',
  address: ADDRESS,
};

const CART_ITEM: CartItem = {
  variantId: 'motorola-edge-50-fusion--zold--256',
  productId: 'motorola-edge-50-fusion',
  productSlug: 'motorola-edge-50-fusion',
  productName: 'Motorola Edge 50 Fusion',
  variantSlug: 'motorola-edge-50-fusion--zold--256',
  colorName: 'Zöld',
  storageGb: 256,
  quantity: 1,
  unitPrice: { amount: 89990, currency: 'HUF' },
  lineTotal: { amount: 89990, currency: 'HUF' },
  maxQuantity: 5,
  availability: 'in_stock',
  image: { id: 'img-1', src: '/img.png', alt: '', width: 10, height: 10 },
};

const CART: Cart = {
  id: 'cart-1',
  expiresAt: '2026-01-01T00:00:00.000Z',
  items: [CART_ITEM],
  lineCount: 1,
  notices: [],
  subtotal: { amount: 89990, currency: 'HUF' },
  totalQuantity: 1,
  version: 1,
};

const EMPTY_CART: Cart = {
  ...CART,
  items: [],
  lineCount: 0,
  totalQuantity: 0,
};

const SUMMARY: CheckoutSummary = {
  subtotal: { amount: 89990, currency: 'HUF' },
  shippingFee: { amount: 0, currency: 'HUF' },
  paymentFee: { amount: 490, currency: 'HUF' },
  total: { amount: 90480, currency: 'HUF' },
};

const HOME_DELIVERY: DeliverySelection = {
  optionId: 'home_delivery',
  address: ADDRESS,
};

const PICKUP: DeliverySelection = {
  optionId: 'pickup_point',
};

const CASH_PAYMENT: PaymentSelection = {
  method: 'cash_on_delivery',
};

const CARD_PAYMENT: PaymentSelection = {
  method: 'card',
};

const CARD_DRAFT_COMPLETE: CheckoutSession = {
  contact: CONTACT,
  billing: BILLING,
  delivery: HOME_DELIVERY,
  payment: CARD_PAYMENT,
  complete: true,
  summary: SUMMARY,
  version: 1,
};

const CASH_DRAFT_COMPLETE: CheckoutSession = {
  ...CARD_DRAFT_COMPLETE,
  payment: CASH_PAYMENT,
};

const INCOMPLETE_DRAFT: CheckoutSession = {
  ...CARD_DRAFT_COMPLETE,
  complete: false,
};

const PICKUP_DRAFT: CheckoutSession = {
  ...CARD_DRAFT_COMPLETE,
  delivery: PICKUP,
};

const NO_BILLING_DRAFT: CheckoutSession = {
  ...CARD_DRAFT_COMPLETE,
  billing: undefined,
};

const PADDED_DRAFT: CheckoutSession = {
  ...CARD_DRAFT_COMPLETE,
  contact: PADDED_CONTACT,
};

const OPTIONS: CheckoutOptions = {
  deliveryOptions: [
    {
      id: 'home_delivery',
      label: 'Házhoz szállítás',
      fee: { amount: 0, currency: 'HUF' },
      requiresAddress: true,
      available: true,
      description: 'Házhoz szállítás.',
    },
    {
      id: 'pickup_point',
      label: 'Átvételi pont',
      fee: { amount: 0, currency: 'HUF' },
      requiresAddress: false,
      available: true,
      description: 'Átvételi pont.',
    },
  ],
  paymentMethods: [
    {
      id: 'card',
      label: 'Bankkártya',
      fee: { amount: 0, currency: 'HUF' },
      available: true,
      description: 'Bankkártyás fizetés.',
    },
    {
      id: 'cash_on_delivery',
      label: 'Utánvét',
      fee: { amount: 490, currency: 'HUF' },
      available: true,
      description: 'Utánvétes fizetés.',
    },
  ],
  termsVersion: '2026-09',
};

const SUCCEEDED_INTENT: PaymentIntent = {
  id: 'pi-1',
  amount: { amount: 90480, currency: 'HUF' },
  status: 'succeeded',
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-01-01T00:05:00.000Z',
  redirectUrl: '/demo-fizetes/?next=review',
  returnUrl: '/penztar/ellenorzes',
};

const PRICE_CHANGE: PriceChange = {
  shownTotal: { amount: 90480, currency: 'HUF' },
  currentTotal: { amount: 91990, currency: 'HUF' },
  awaitingConfirmation: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// The terms tick is kept in sessionStorage (checkout-keys.ts), so a case
// that ticks it must not leak the tick into the next case.
afterEach(() => {
  sessionStorage.removeItem('mi-bolt.checkout.terms-accepted');
});

function getRoot(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected fixture.nativeElement to be HTMLElement');
  }
  return raw;
}

function getByTestId(root: ParentNode, testId: string): HTMLElement {
  const el = root.querySelector(`[data-testid="${testId}"]`);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Expected element with data-testid="${testId}"`);
  }
  return el;
}

function getButton(root: HTMLElement, testId: string): HTMLButtonElement {
  const host = root.querySelector(`[data-testid="${testId}"]`);
  if (host === null) throw new Error(`missing host ${testId}`);
  if (host.tagName === 'BUTTON') {
    if (!(host instanceof HTMLButtonElement)) {
      throw new Error(`expected HTMLButtonElement for ${testId}`);
    }
    return host;
  }
  const inner = host.querySelector('button');
  if (!(inner instanceof HTMLButtonElement)) {
    throw new Error(`expected inner <button> for ${testId}`);
  }
  return inner;
}

function getCheckbox(root: HTMLElement, testId: string): HTMLInputElement {
  const el = root.querySelector(`[data-testid="${testId}"]`);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`expected HTMLInputElement for ${testId}`);
  }
  return el;
}

function getTermsDialog(fixture: ComponentFixture<ReviewStep>): TermsDialog {
  const debugEl = fixture.debugElement.query(By.directive(TermsDialog));
  const instance: unknown = debugEl.componentInstance;
  if (!(instance instanceof TermsDialog)) {
    throw new Error('expected TermsDialog component instance');
  }
  return instance;
}

interface ReviewStepInputs {
  readonly summary?: CheckoutSummary | null;
  readonly cart?: Cart;
  readonly draft?: CheckoutSession;
  readonly options?: CheckoutOptions | null;
  readonly state?: CheckoutViewState;
  readonly paymentIntent?: PaymentIntent | null;
  readonly priceChange?: PriceChange | null;
  readonly paymentIntentMissing?: boolean;
  readonly paymentStarted?: boolean;
}

function createFixture(overrides: ReviewStepInputs = {}): ComponentFixture<ReviewStep> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(ReviewStep);
  fixture.componentRef.setInput(
    'summary',
    overrides.summary !== undefined ? overrides.summary : SUMMARY,
  );
  fixture.componentRef.setInput('cart', overrides.cart ?? CART);
  fixture.componentRef.setInput('draft', overrides.draft ?? CARD_DRAFT_COMPLETE);
  fixture.componentRef.setInput(
    'options',
    overrides.options !== undefined ? overrides.options : OPTIONS,
  );
  fixture.componentRef.setInput('state', overrides.state ?? 'ready');
  fixture.componentRef.setInput(
    'paymentIntent',
    overrides.paymentIntent !== undefined ? overrides.paymentIntent : null,
  );
  fixture.componentRef.setInput(
    'priceChange',
    overrides.priceChange !== undefined ? overrides.priceChange : null,
  );
  fixture.componentRef.setInput('paymentIntentMissing', overrides.paymentIntentMissing ?? false);
  fixture.componentRef.setInput('paymentStarted', overrides.paymentStarted ?? false);
  fixture.detectChanges();
  return fixture;
}

function checkTermsConsent(fixture: ComponentFixture<ReviewStep>): void {
  const root = getRoot(fixture);
  const checkbox = getCheckbox(root, 'review-consent-terms-input');
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

// ---------------------------------------------------------------------------
// RS-01 — renders from its inputs alone
// ---------------------------------------------------------------------------

describe('S3-F2-5 ReviewStep on the 2.0.0 contract', () => {
  it('RS-01 renders from its inputs alone with no facade, no router call and no HttpClient provided', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const pages = root.querySelectorAll('[data-testid="review-page"]');
    expect(pages.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // RS-02..RS-05 — the contact and billing snapshot
  // ---------------------------------------------------------------------------

  it('RS-02 renders the contact name, email and phone from the server-confirmed draft', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const contact = getByTestId(root, 'review-contact');
    expect(contact.textContent).toContain('Teszt Elek');
    expect(contact.textContent).toContain('teszt@example.com');
    expect(contact.textContent).toContain('+36301234567');
  });

  it('RS-03 trims the contact values it renders', () => {
    const fixture = createFixture({ draft: PADDED_DRAFT });
    const root = getRoot(fixture);
    const contact = getByTestId(root, 'review-contact');
    expect(contact.textContent).toContain('Teszt Elek');
    expect(contact.textContent).toContain('teszt@example.com');
    expect(contact.textContent).toContain('+36301234567');
    expect(contact.textContent).not.toContain('  Teszt Elek  ');
    expect(contact.textContent).not.toContain('  teszt@example.com  ');
    expect(contact.textContent).not.toContain('  +36301234567  ');
  });

  it('RS-04 renders the billing name and address from the draft', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const billing = getByTestId(root, 'review-billing');
    const billingAddress = getByTestId(root, 'review-billing-address');
    expect(billing.textContent).toContain('Teszt Elek');
    expect(billingAddress.textContent).toContain('1051');
    expect(billingAddress.textContent).toContain('Budapest');
    expect(billingAddress.textContent).toContain('Fő utca 1.');
  });

  it('RS-05 renders the em dash for a billing name the draft does not carry', () => {
    const fixture = createFixture({ draft: NO_BILLING_DRAFT });
    const root = getRoot(fixture);
    const billing = getByTestId(root, 'review-billing');
    expect(billing.textContent).toContain('—');
  });

  // ---------------------------------------------------------------------------
  // RS-06..RS-10 — the delivery and payment labels
  // ---------------------------------------------------------------------------

  it('RS-06 renders the delivery address for a home delivery draft', () => {
    const fixture = createFixture({ draft: CARD_DRAFT_COMPLETE });
    const root = getRoot(fixture);
    const addresses = root.querySelectorAll('[data-testid="review-delivery-address"]');
    expect(addresses.length).toBe(1);
    const text = addresses[0].textContent;
    expect(text).toContain('Fő utca 1.');
    expect(text).toContain('1051');
    expect(text).toContain('Budapest');
  });

  it('RS-07 renders no delivery address row for a pickup draft', () => {
    const fixture = createFixture({ draft: PICKUP_DRAFT });
    const root = getRoot(fixture);
    expect(root.querySelectorAll('[data-testid="review-delivery-address"]').length).toBe(0);
  });

  it('RS-08 renders the delivery and payment labels from the options input', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const delivery = getByTestId(root, 'review-delivery');
    expect(delivery.textContent).toContain('Házhoz szállítás');
    const payment = getByTestId(root, 'review-payment');
    expect(payment.textContent.trim()).toBe('Bankkártya');
  });

  it('RS-09 renders the em dash when the options have not loaded', () => {
    const fixture = createFixture({ options: null });
    const root = getRoot(fixture);
    const delivery = getByTestId(root, 'review-delivery');
    const payment = getByTestId(root, 'review-payment');
    expect(delivery.textContent).toContain('—');
    expect(payment.textContent.trim()).toBe('—');
  });

  it('RS-10 renders the em dash when the wire has no entry for the saved option id', () => {
    const fixture = createFixture({
      options: { ...OPTIONS, deliveryOptions: [] },
    });
    const root = getRoot(fixture);
    const delivery = getByTestId(root, 'review-delivery');
    expect(delivery.textContent).toContain('—');
  });

  // ---------------------------------------------------------------------------
  // RS-11..RS-13 — the three edit controls
  // ---------------------------------------------------------------------------

  it('RS-11 the contact edit control emits editRequested with contact', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const emitted: ('contact' | 'delivery')[] = [];
    const sub = fixture.componentInstance.editRequested.subscribe((v) => emitted.push(v));
    getButton(root, 'review-edit-contact').click();
    fixture.detectChanges();
    sub.unsubscribe();
    expect(emitted).toEqual(['contact']);
  });

  it('RS-12 the delivery edit control emits editRequested with delivery', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const emitted: ('contact' | 'delivery')[] = [];
    const sub = fixture.componentInstance.editRequested.subscribe((v) => emitted.push(v));
    getButton(root, 'review-edit-delivery').click();
    fixture.detectChanges();
    sub.unsubscribe();
    expect(emitted).toEqual(['delivery']);
  });

  it('RS-13 the billing edit control also asks for the delivery step, because billing is entered there', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const emitted: ('contact' | 'delivery')[] = [];
    const sub = fixture.componentInstance.editRequested.subscribe((v) => emitted.push(v));
    getButton(root, 'review-edit-billing').click();
    fixture.detectChanges();
    sub.unsubscribe();
    expect(emitted).toEqual(['delivery']);
  });

  // ---------------------------------------------------------------------------
  // RS-14..RS-18 — the cart lines and the four-row summary
  // ---------------------------------------------------------------------------

  it('RS-14 renders one line per cart item with its name, variant label, quantity and totals', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const lines = root.querySelectorAll('[data-testid="review-line"]');
    expect(lines.length).toBe(1);
    const text = lines[0].textContent;
    expect(text).toContain('Motorola Edge 50 Fusion');
    expect(text).toContain('Zöld · 256 GB');
    expect(text).toContain('1 ×');
    expect(text).toContain(PriceBlock.formatHuf(89990));
    const quantity = getByTestId(root, 'review-line-quantity');
    expect(quantity.textContent.replace(/\s+/g, ' ').trim()).toBe('1 × 89 990 Ft');
    expect(text).not.toContain('Egységár');
  });

  it('RS-15 renders the empty placeholder when the cart carries no items', () => {
    const fixture = createFixture({ cart: EMPTY_CART });
    const root = getRoot(fixture);
    expect(root.querySelectorAll('[data-testid="review-items-empty"]').length).toBe(1);
    expect(root.querySelectorAll('[data-testid="review-line"]').length).toBe(0);
  });

  it("RS-16 the four summary rows carry the server's own subtotal, shipping fee, payment fee and total", () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const subtotal = getByTestId(root, 'order-summary-subtotal');
    const shipping = getByTestId(root, 'order-summary-shipping');
    const paymentFee = getByTestId(root, 'order-summary-payment-fee');
    const total = getByTestId(root, 'order-summary-total');
    expect(subtotal.textContent).toContain(PriceBlock.formatHuf(89990));
    expect(shipping.textContent).toContain(PriceBlock.formatHuf(0));
    expect(paymentFee.textContent).toContain(PriceBlock.formatHuf(490));
    expect(total.textContent).toContain(PriceBlock.formatHuf(90480));
  });

  it('RS-17 renders the summary loading placeholder while the summary is null', () => {
    const fixture = createFixture({ summary: null });
    const root = getRoot(fixture);
    expect(root.querySelectorAll('[data-testid="review-summary-loading"]').length).toBe(1);
    expect(root.querySelectorAll('app-order-summary').length).toBe(0);
  });

  it('RS-18 the right-rail rows repeat the payment and delivery labels and carry the demo badge', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const summary = getByTestId(root, 'review-summary');
    expect(summary.textContent).toContain('Bankkártya');
    expect(summary.textContent).toContain('Házhoz szállítás');
    const badge = getByTestId(root, 'review-demo-badge');
    expect(badge.textContent.trim()).toBe('Demó');
  });

  // ---------------------------------------------------------------------------
  // RS-19..RS-26 — the terms consent, the CTA gating, and the dialog
  // ---------------------------------------------------------------------------

  it('RS-19 the terms checkbox starts unchecked, in the default state, with no message', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const checkbox = getCheckbox(root, 'review-consent-terms-input');
    expect(checkbox.checked).toBe(false);
    const terms = getByTestId(root, 'review-consent-terms');
    expect(terms.getAttribute('data-state')).toBe('default');
    expect(root.querySelectorAll('[data-testid="review-consent-terms-message"]').length).toBe(0);
    expect(checkbox.getAttribute('aria-invalid')).toBeNull();
    expect(checkbox.getAttribute('aria-describedby')).toBeNull();
  });

  it('RS-19b a tick survives the cold return from the card payment: a new ReviewStep starts ticked', () => {
    const first = createFixture();
    checkTermsConsent(first);
    first.destroy();
    TestBed.resetTestingModule();

    const second = createFixture();
    const checkbox = getCheckbox(getRoot(second), 'review-consent-terms-input');
    expect(checkbox.checked).toBe(true);
    expect(second.componentInstance.acceptedTerms()).toBe(true);
  });

  it('RS-19c an untick is remembered too: a new ReviewStep starts unticked', () => {
    const first = createFixture();
    checkTermsConsent(first);
    const box = getCheckbox(getRoot(first), 'review-consent-terms-input');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    first.detectChanges();
    first.destroy();
    TestBed.resetTestingModule();

    const second = createFixture();
    expect(getCheckbox(getRoot(second), 'review-consent-terms-input').checked).toBe(false);
  });

  it('RS-20 blurring the unchecked checkbox moves it to the touched-invalid state and shows the message', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const checkbox = getCheckbox(root, 'review-consent-terms-input');
    checkbox.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    const terms = getByTestId(root, 'review-consent-terms');
    expect(terms.getAttribute('data-state')).toBe('touched-invalid');
    const message = getByTestId(root, 'review-consent-terms-message');
    expect(message.textContent.trim()).toBe('A demó feltételek elfogadása kötelező.');
  });

  it('RS-21 the CTA is active without consent; a click emits nothing, marks the terms invalid and focuses the checkbox', async () => {
    const fixture = createFixture({ draft: CASH_DRAFT_COMPLETE });
    let emitted = 0;
    const sub = fixture.componentInstance.submitRequested.subscribe(() => (emitted += 1));
    const root = getRoot(fixture);
    const button = getButton(root, 'review-submit');
    expect(button.disabled).toBe(false);

    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    try {
      button.click();
      fixture.detectChanges();
      await fixture.whenStable();
      await Promise.resolve();

      expect(emitted).toBe(0);
      expect(getByTestId(root, 'review-consent-terms').getAttribute('data-state')).toBe(
        'submitted-invalid',
      );
      const checkbox = getCheckbox(root, 'review-consent-terms-input');
      expect(checkbox.getAttribute('aria-invalid')).toBe('true');
      expect(checkbox.getAttribute('aria-describedby')).toBe('review-consent-terms-message');
      expect(document.activeElement).toBe(checkbox);
      expect(focusSpy).toHaveBeenLastCalledWith({ focusVisible: true });
    } finally {
      focusSpy.mockRestore();
      sub.unsubscribe();
    }
  });

  it('RS-22 a complete cash on delivery draft with the terms accepted enables the CTA and emits once', () => {
    const fixture = createFixture({ draft: CASH_DRAFT_COMPLETE });
    let emitted = 0;
    const sub = fixture.componentInstance.submitRequested.subscribe(() => (emitted += 1));
    checkTermsConsent(fixture);
    const root = getRoot(fixture);
    const button = getButton(root, 'review-submit');
    expect(button.disabled).toBe(false);
    button.click();
    fixture.detectChanges();
    sub.unsubscribe();
    expect(emitted).toBe(1);
  });

  it('RS-23 an incomplete draft keeps the CTA from submitting and says which condition is unmet', () => {
    const fixture = createFixture({ draft: INCOMPLETE_DRAFT });
    checkTermsConsent(fixture);
    const root = getRoot(fixture);
    const button = getButton(root, 'review-submit');
    expect(button.disabled).toBe(false);
    let emitted = 0;
    const sub = fixture.componentInstance.submitRequested.subscribe(() => (emitted += 1));
    button.click();
    fixture.detectChanges();
    sub.unsubscribe();
    expect(emitted).toBe(0);
    const explanation = getByTestId(root, 'review-cta-explanation');
    expect(explanation.textContent.trim()).toBe(
      'Hiányzó adatok: egészítsd ki a korábbi lépéseket a rendelés leadásához.',
    );
  });

  it('RS-24 a card draft only submits once the intent has succeeded', () => {
    const noIntent = createFixture({ draft: CARD_DRAFT_COMPLETE, paymentIntent: null });
    checkTermsConsent(noIntent);
    const noIntentRoot = getRoot(noIntent);
    const noIntentButton = getButton(noIntentRoot, 'review-submit');
    expect(noIntentButton.disabled).toBe(false);
    let noIntentEmitted = 0;
    const noIntentSub = noIntent.componentInstance.submitRequested.subscribe(
      () => (noIntentEmitted += 1),
    );
    noIntentButton.click();
    noIntent.detectChanges();
    noIntentSub.unsubscribe();
    expect(noIntentEmitted).toBe(0);
    const noIntentExplanation = getByTestId(noIntentRoot, 'review-cta-explanation');
    expect(noIntentExplanation.textContent.trim()).toBe(
      'A kártyás fizetés jóváhagyása szükséges a rendelés leadásához.',
    );

    TestBed.resetTestingModule();
    const withIntent = createFixture({
      draft: CARD_DRAFT_COMPLETE,
      paymentIntent: SUCCEEDED_INTENT,
    });
    checkTermsConsent(withIntent);
    const withIntentRoot = getRoot(withIntent);
    const withIntentButton = getButton(withIntentRoot, 'review-submit');
    expect(withIntentButton.disabled).toBe(false);
    expect(withIntentRoot.querySelectorAll('[data-testid="review-cta-explanation"]').length).toBe(
      0,
    );
  });

  it('RS-25 an unconfirmed price change keeps the CTA from submitting ahead of every other reason', () => {
    const fixture = createFixture({ priceChange: PRICE_CHANGE });
    checkTermsConsent(fixture);
    const root = getRoot(fixture);
    const button = getButton(root, 'review-submit');
    expect(button.disabled).toBe(false);
    let emitted = 0;
    const sub = fixture.componentInstance.submitRequested.subscribe(() => (emitted += 1));
    button.click();
    fixture.detectChanges();
    sub.unsubscribe();
    expect(emitted).toBe(0);
    const explanation = getByTestId(root, 'review-cta-explanation');
    expect(explanation.textContent.trim()).toBe(
      'Erősítsd meg az új végösszeget a rendelés leadásához.',
    );
  });

  it("RS-26 the terms dialog opens from its control and closes from the dialog's own event", () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    getButton(root, 'review-consent-terms-button').click();
    fixture.detectChanges();
    const dialog = getTermsDialog(fixture);
    expect(dialog.opened()).toBe(true);

    dialog.closed.emit();
    fixture.detectChanges();
    expect(dialog.opened()).toBe(false);
  });

  it('the order summary precedes the payment panel and the terms card in DOM order (MIM-212)', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const items = getByTestId(root, 'review-items');
    const summary = getByTestId(root, 'review-summary');
    const status = getByTestId(root, 'review-status');
    const confirm = getByTestId(root, 'review-confirm');

    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(items.compareDocumentPosition(summary) & FOLLOWING).toBeTruthy();
    expect(summary.compareDocumentPosition(status) & FOLLOWING).toBeTruthy();
    expect(confirm.contains(status)).toBe(true);
  });

  // MIM-240b1: the demo notice is `app-status-message` with the primitive's
  // own message string and `[persistent]` true. The data-testid stays on
  // the primitive's host so any existing query keeps working.
  it('renders the exact message string the primitive carries (MIM-240b1)', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const demoNotice = getByTestId(root, 'review-demo-notice');
    expect(demoNotice.textContent.trim()).toBe(
      'Demó pénztár. A rendelés leadása nem küld valódi megrendelést, nem indít valódi fizetést, és nem küld e-mailt. Az adatok a böngésző memóriájában maradnak.',
    );
  });

  it('renders no "Bezárás" dismiss button because the primitive is persistent (MIM-240b1)', () => {
    const fixture = createFixture();
    const root = getRoot(fixture);
    const demoNotice = getByTestId(root, 'review-demo-notice');
    expect(demoNotice.textContent).not.toContain('Bezárás');
  });
});
