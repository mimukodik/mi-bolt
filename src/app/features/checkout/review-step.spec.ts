/**
 * T22 — final review step (S4.4), rewritten for FIX-63.
 *
 * FIX-63 gave `ReviewStep` the fixed signature `components.md:611-617`
 * declares: `quote`/`cart`/`draft`/`state` inputs, `editRequested`/
 * `refreshQuote`/`submitRequested` outputs. The component injects no
 * facade, no SDK and no `Router` — `review-page.ts` owns `CartFacade`,
 * `CheckoutFacade`, `QuoteController`, `OrderSubmission` and the
 * `Router`, and renders `PaymentProgress` plus the generic-error retry
 * banner beside `<app-review-step>` (their orchestration is covered by
 * `review-page.spec.ts`).
 *
 *   FIX-63-AC08 — a test that renders ReviewStep with all four inputs
 *                 set directly and no CartFacade, CheckoutFacade or
 *                 QuoteController provided, asserting it renders the
 *                 given cart lines and quote totals; a test per state
 *                 kind — including error, the seventh member this task
 *                 newly wires up — asserting a rendered difference;
 *                 and a test that each of the three outputs emits from
 *                 its triggering control.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { ReviewStep } from './review-step';

import type { Cart } from '../../api/generated/models/cart';
import type { CartItem } from '../../api/generated/models/cart-item';
import type { Quote } from '../../api/generated/models/quote';
import type { CheckoutDraft } from './checkout-form.model';
import type { ReviewState } from './quote-state';

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (raw instanceof HTMLElement) return raw;
  throw new Error('Expected HTMLElement');
}

function getButton(root: HTMLElement, testId: string): HTMLButtonElement {
  const host = root.querySelector(`[data-testid="${testId}"]`);
  if (host === null) throw new Error(`missing ${testId}`);
  const button = host.tagName === 'BUTTON' ? host : host.querySelector('button');
  if (!(button instanceof HTMLButtonElement)) throw new Error(`no <button> inside ${testId}`);
  return button;
}

const ITEM: CartItem = {
  availability: 'in_stock',
  colorName: 'Éjfekete',
  id: 'item-1',
  image: { alt: '', height: 10, id: 'img-1', src: '/img.png', width: 10 },
  lineTotal: { amount: 339990, currency: 'HUF' },
  maxQuantity: 5,
  productId: 'prod-1',
  productName: 'Teszt Telefon',
  productSlug: 'teszt-telefon',
  quantity: 1,
  storageGb: 128,
  unitPrice: { amount: 339990, currency: 'HUF' },
  variantId: 'variant-1',
};

const CART: Cart = {
  expiresAt: '2026-01-01T00:00:00.000Z',
  id: 'cart-1',
  itemCount: 1,
  items: [ITEM],
  status: 'active',
  subtotal: { amount: 339990, currency: 'HUF' },
  version: 1,
};

const QUOTE: Quote = {
  cartId: 'cart-1',
  cartVersion: 1,
  expiresAt: '2026-01-01T00:05:00.000Z',
  id: 'quote-1',
  shipping: { amount: 1990, currency: 'HUF' },
  subtotal: { amount: 339990, currency: 'HUF' },
  total: { amount: 341980, currency: 'HUF' },
};

const DRAFT_COMPLETE: CheckoutDraft = {
  contact: { fullName: 'Teszt Elek', email: 'teszt@example.test', phone: '+36301234567' },
  delivery: {
    optionId: 'home_delivery',
    address: { city: 'Budapest', countryCode: 'HU', line1: 'Fő utca 1.', postalCode: '1011' },
  },
  paymentMethod: 'demo_card',
};

// A wildcard route (rather than an empty list) so a routerLink click
// resolves instead of rejecting NG04002 "Cannot match any routes" as an
// unhandled rejection — the edit-link tests below click the anchors.
const TEST_PROVIDERS = [
  provideZonelessChangeDetection(),
  provideRouter([{ path: '**', component: ReviewStep }]),
];

interface ReviewStepInputs {
  readonly quote: Quote | null;
  readonly cart: Cart;
  readonly draft: CheckoutDraft;
  readonly state: ReviewState;
}

function createReviewStep(overrides: Partial<ReviewStepInputs> = {}) {
  TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
  const fixture = TestBed.createComponent(ReviewStep);
  // `quote` legitimately overrides to `null`, so a plain `??` default would
  // collapse an explicit `null` back to `QUOTE`; check for the key instead.
  const quote = 'quote' in overrides ? (overrides.quote ?? null) : QUOTE;
  fixture.componentRef.setInput('quote', quote);
  fixture.componentRef.setInput('cart', overrides.cart ?? CART);
  fixture.componentRef.setInput('draft', overrides.draft ?? DRAFT_COMPLETE);
  fixture.componentRef.setInput('state', overrides.state ?? 'ready');
  fixture.detectChanges();
  return fixture;
}

function checkBothConsents(fixture: ReturnType<typeof createReviewStep>): void {
  const root = getRootElement(fixture);
  const terms = root.querySelector<HTMLInputElement>('#review-consent-terms-input');
  const simulation = root.querySelector<HTMLInputElement>('#review-consent-simulation-input');
  if (terms === null || simulation === null) throw new Error('consent checkboxes missing');
  terms.checked = true;
  terms.dispatchEvent(new Event('change'));
  simulation.checked = true;
  simulation.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

// ---------------------------------------------------------------------------
// FIX-63-AC08 — renders with no facade/service dependency, given cart lines
// and quote totals directly.
// ---------------------------------------------------------------------------
describe('FIX-63-AC08 ReviewStep renders from its four inputs with no injected service', () => {
  it('renders the given cart lines and quote totals with no CartFacade, CheckoutFacade or QuoteController provided', () => {
    // TEST_PROVIDERS carries only zoneless change detection and an empty
    // router — no CartFacade, CheckoutFacade, QuoteController or SDK/HTTP
    // provider is registered. The component still renders: proof it
    // reads only its declared inputs.
    const fixture = createReviewStep();
    const root = getRootElement(fixture);

    const lines = root.querySelectorAll('[data-testid="review-line"]');
    expect(lines.length).toBe(1);
    expect(lines[0].textContent).toContain('Teszt Telefon');
    expect(lines[0].textContent).toContain('Éjfekete');

    const summary = root.querySelector('[data-testid="review-summary"]');
    expect(summary?.querySelector('app-order-summary')).not.toBeNull();
    expect(summary?.textContent).toContain('Bankkártya (szimulált)');
    expect(summary?.textContent).toContain('Házhoz szállítás (1990 Ft)');
  });

  it('renders an empty-cart message when the cart has no items', () => {
    const fixture = createReviewStep({ cart: { ...CART, items: [], itemCount: 0 } });
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="review-items-empty"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-testid="review-line"]').length).toBe(0);
  });

  it('renders the contact and delivery snapshot from draft(), not from a live form', () => {
    const fixture = createReviewStep();
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="review-contact"]')?.textContent).toContain(
      'Teszt Elek',
    );
    expect(root.querySelector('[data-testid="review-contact"]')?.textContent).toContain(
      'teszt@example.test',
    );
    expect(root.querySelector('[data-testid="review-delivery-address"]')?.textContent).toContain(
      'Fő utca 1.',
    );
  });

  it('FIX-35: the page heading is "Minden rendben?"', () => {
    const fixture = createReviewStep();
    const root = getRootElement(fixture);
    expect(root.querySelector('h1')?.textContent.trim()).toBe('Minden rendben?');
  });
});

// ---------------------------------------------------------------------------
// One test per ReviewState member — each asserts a rendered difference.
// ---------------------------------------------------------------------------
describe('FIX-63-AC08 one rendered difference per ReviewState member', () => {
  it('quoting: shows the quote-loading skeleton and no order summary yet', () => {
    const fixture = createReviewStep({ quote: null, state: 'quoting' });
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="review-summary-loading"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="review-status"]')?.textContent).toContain(
      'Árajánlat frissítése',
    );
  });

  it('ready: shows the order summary totals and no status banner', () => {
    const fixture = createReviewStep({ state: 'ready' });
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="review-summary-loading"]')).toBeNull();
    expect(root.querySelector('app-order-summary')).not.toBeNull();
    expect(root.querySelector('[data-testid="review-status"]')?.textContent.trim()).toBe('');
  });

  it('expired: shows the quote-expired status message', () => {
    const fixture = createReviewStep({ state: 'expired' });
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="review-status"]')?.textContent).toContain(
      'Az árajánlat lejárt.',
    );
  });

  it('price-changed: shows the price-changed status message', () => {
    const fixture = createReviewStep({ state: 'price-changed' });
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="review-status"]')?.textContent).toContain(
      'A katalógus ára megváltozott.',
    );
  });

  it('stock-error: shows the out-of-stock status message', () => {
    const fixture = createReviewStep({ state: 'stock-error' });
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="review-status"]')?.textContent).toContain(
      'Egy vagy több változat elfogyott.',
    );
  });

  it('submitting: shows the submitting skeleton and a loading submit button', () => {
    const fixture = createReviewStep({ state: 'submitting' });
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="review-status"]')?.textContent).toContain(
      'Véglegesítés…',
    );
    expect(getButton(root, 'review-submit').disabled).toBe(true);
  });

  it('error: shows the generic submit-failed status message (the seventh member this task wires up)', () => {
    const fixture = createReviewStep({ state: 'error' });
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="review-status"]')?.textContent).toContain(
      'A rendelés leadása nem sikerült.',
    );
  });

  it('reflects the current state on the root element via data-status', () => {
    const fixture = createReviewStep({ state: 'expired' });
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="review-page"]')?.getAttribute('data-status')).toBe(
      'expired',
    );
  });
});

// ---------------------------------------------------------------------------
// Each of the three outputs emits from its triggering control.
// ---------------------------------------------------------------------------
describe('FIX-63-AC08 each output emits from its triggering control', () => {
  it('editRequested emits "contact" from the contact section edit link', () => {
    const fixture = createReviewStep();
    const root = getRootElement(fixture);
    const emitted: ('contact' | 'delivery')[] = [];
    fixture.componentInstance.editRequested.subscribe((v) => emitted.push(v));

    root.querySelector<HTMLAnchorElement>('[data-testid="review-edit-contact"]')?.click();
    fixture.detectChanges();

    expect(emitted).toEqual(['contact']);
  });

  it('editRequested emits "delivery" from the delivery section edit link', () => {
    const fixture = createReviewStep();
    const root = getRootElement(fixture);
    const emitted: ('contact' | 'delivery')[] = [];
    fixture.componentInstance.editRequested.subscribe((v) => emitted.push(v));

    root.querySelector<HTMLAnchorElement>('[data-testid="review-edit-delivery"]')?.click();
    fixture.detectChanges();

    expect(emitted).toEqual(['delivery']);
  });

  it('refreshQuote emits from the "Árajánlat frissítése" control', () => {
    const fixture = createReviewStep({ state: 'expired', quote: null });
    const root = getRootElement(fixture);
    let count = 0;
    fixture.componentInstance.refreshQuote.subscribe(() => (count += 1));

    root.querySelector<HTMLButtonElement>('[data-testid="review-refresh"]')?.click();
    fixture.detectChanges();

    expect(count).toBe(1);
  });

  it('submitRequested emits from the primary CTA once both consents are checked and the state is ready', () => {
    const fixture = createReviewStep({ state: 'ready' });
    let count = 0;
    fixture.componentInstance.submitRequested.subscribe(() => (count += 1));

    checkBothConsents(fixture);
    const root = getRootElement(fixture);
    getButton(root, 'review-submit').click();
    fixture.detectChanges();

    expect(count).toBe(1);
  });

  it('does not emit submitRequested while a consent is unchecked; the CTA stays disabled with an explanation', () => {
    const fixture = createReviewStep({ state: 'ready' });
    let count = 0;
    fixture.componentInstance.submitRequested.subscribe(() => (count += 1));

    const root = getRootElement(fixture);
    expect(getButton(root, 'review-submit').disabled).toBe(true);
    getButton(root, 'review-submit').click();
    fixture.detectChanges();

    expect(count).toBe(0);
    expect(root.querySelector('[data-testid="review-cta-explanation"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Consent + terms dialog wiring (T22-AC02), kept from the pre-FIX-63 suite
// but as plain checkbox/local-state assertions now that neither consent is
// backed by a shared field tree (components.md:615 declares no such input).
// ---------------------------------------------------------------------------
describe('T22-AC02 demo terms + simulation acknowledgement', () => {
  it('renders two unchecked consent checkboxes', () => {
    const fixture = createReviewStep();
    const root = getRootElement(fixture);
    const checkboxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
    for (const box of Array.from(checkboxes)) {
      expect(box.checked).toBe(false);
    }
  });

  it("opens and closes the terms dialog via the demo-terms link and the dialog's own close event", () => {
    const fixture = createReviewStep();
    expect(fixture.componentInstance.termsOpened()).toBe(false);

    fixture.componentInstance.openTerms();
    fixture.detectChanges();
    expect(fixture.componentInstance.termsOpened()).toBe(true);

    fixture.componentInstance.closeTerms();
    fixture.detectChanges();
    expect(fixture.componentInstance.termsOpened()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CTA gating on an incomplete draft — the container is not required to
// resolve every branch before rendering the review step.
// ---------------------------------------------------------------------------
describe('FIX-63-AC08 CTA also gates on an incomplete draft', () => {
  it('disables the CTA when the draft has no chosen payment method', () => {
    const fixture = createReviewStep({
      state: 'ready',
      draft: { ...DRAFT_COMPLETE, paymentMethod: undefined },
    });
    checkBothConsents(fixture);
    const root = getRootElement(fixture);
    expect(getButton(root, 'review-submit').disabled).toBe(true);
  });

  it('disables the CTA when the draft has no chosen delivery option', () => {
    const fixture = createReviewStep({
      state: 'ready',
      draft: { ...DRAFT_COMPLETE, delivery: undefined },
    });
    checkBothConsents(fixture);
    const root = getRootElement(fixture);
    expect(getButton(root, 'review-submit').disabled).toBe(true);
  });
});
