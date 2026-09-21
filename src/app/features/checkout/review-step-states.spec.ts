/**
 * S3-F2-6 — the review step state switch and payment-return branch spec.
 *
 * Sibling of `review-step.spec.ts`: that file owns the snapshot rows, the
 * cart lines, the four-row summary, the consent and the CTA gating. This
 * file covers only the `state()` switch (`loading`, `ready`,
 * `price-changed`, `stock-error`, `conflict`, `submitting`, `error`) and
 * the payment-intent branch (succeeded, declined, pending,
 * requires_action, missing-intent). No other spec file is touched.
 *
 * `review-step.ts:15` ("no polling loop of any kind") rules a polling
 * intent branch out: PS-06 presses the check control twice and proves no
 * timer or repeated emission follows the second press.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewStep, type CheckoutViewState } from './review-step';
import type { PriceChange } from './checkout.facade';
import { PriceBlock } from '../../shared/ui/price-block/price-block';

import type { Cart } from '../../api/generated/models/cart';
import type { CartItem } from '../../api/generated/models/cart-item';
import type { CheckoutOptions } from '../../api/generated/models/checkout-options';
import type { CheckoutSession } from '../../api/generated/models/checkout-session';
import type { CheckoutSummary } from '../../api/generated/models/checkout-summary';
import type { PaymentIntent } from '../../api/generated/models/payment-intent';
import type { PaymentIntentStatus } from '../../api/generated/models/payment-intent-status';

function getRootElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected fixture.nativeElement to be HTMLElement');
  }
  return raw;
}

function getElement(parent: Element, selector: string): HTMLElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Expected HTMLElement matching "${selector}"`);
  }
  return el;
}

function queryElement(parent: Element, selector: string): HTMLElement | null {
  const el = parent.querySelector(selector);
  if (el === null) return null;
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Expected HTMLElement matching "${selector}"`);
  }
  return el;
}

function getButton(root: HTMLElement, testId: string): HTMLButtonElement {
  const host = root.querySelector(`[data-testid="${testId}"]`);
  if (host === null) throw new Error(`missing ${testId}`);
  const button = host.tagName === 'BUTTON' ? host : host.querySelector('button');
  if (!(button instanceof HTMLButtonElement)) throw new Error(`no <button> inside ${testId}`);
  return button;
}

const SUMMARY: CheckoutSummary = {
  subtotal: { amount: 89_990, currency: 'HUF' },
  shippingFee: { amount: 0, currency: 'HUF' },
  paymentFee: { amount: 490, currency: 'HUF' },
  total: { amount: 90_480, currency: 'HUF' },
};

const ITEM: CartItem = {
  availability: 'in_stock',
  colorName: 'Éjfekete',
  image: { alt: '', height: 10, id: 'img-1', src: '/img.png', width: 10 },
  lineTotal: { amount: 89_990, currency: 'HUF' },
  maxQuantity: 5,
  productId: 'prod-1',
  productName: 'Teszt Telefon',
  productSlug: 'teszt-telefon',
  quantity: 1,
  storageGb: 128,
  unitPrice: { amount: 89_990, currency: 'HUF' },
  variantId: 'variant-1',
  variantSlug: 'teszt-telefon-ejfekete-128gb',
};

const CART: Cart = {
  expiresAt: '2026-09-20T12:00:00.000Z',
  id: 'cart-1',
  items: [ITEM],
  lineCount: 1,
  notices: [],
  subtotal: { amount: 89_990, currency: 'HUF' },
  totalQuantity: 1,
  version: 1,
};

const DRAFT: CheckoutSession = {
  billing: {
    name: 'Teszt Elek',
    address: { city: 'Budapest', countryCode: 'HU', line1: 'Fő utca 1.', postalCode: '1011' },
  },
  complete: true,
  contact: { fullName: 'Teszt Elek', email: 'teszt@example.test', phone: '+36301234567' },
  delivery: { optionId: 'pickup_point' },
  payment: { method: 'cash_on_delivery' },
  summary: SUMMARY,
  version: 1,
};

const OPTIONS: CheckoutOptions = {
  deliveryOptions: [
    {
      id: 'home_delivery',
      label: 'Házhoz szállítás',
      description: 'Futárral, 1–2 munkanapon belül.',
      fee: { amount: 1490, currency: 'HUF' },
      requiresAddress: true,
      estimatedDays: 2,
      available: true,
    },
    {
      id: 'pickup_point',
      label: 'Átvételi pont',
      description: 'Csomagponton, 2–3 munkanapon belül.',
      fee: { amount: 990, currency: 'HUF' },
      requiresAddress: false,
      estimatedDays: 3,
      available: true,
    },
  ],
  paymentMethods: [
    {
      id: 'card',
      label: 'Bankkártya',
      description: 'Online kártyás fizetés.',
      fee: { amount: 0, currency: 'HUF' },
      available: true,
    },
    {
      id: 'cash_on_delivery',
      label: 'Utánvét',
      description: 'Készpénzzel vagy kártyával a futárnál.',
      fee: { amount: 490, currency: 'HUF' },
      available: true,
    },
  ],
  termsVersion: '2026-09',
};

function makeIntent(status: PaymentIntentStatus): PaymentIntent {
  return {
    id: 'pi-1',
    status,
    amount: { amount: 89_990, currency: 'HUF' },
    redirectUrl: '/demo-fizetes/pi-1',
    returnUrl: '/penztar/ellenorzes',
    createdAt: '2026-09-20T10:00:00.000Z',
    expiresAt: '2026-09-20T10:05:00.000Z',
  };
}

interface FixtureOverrides {
  readonly state?: CheckoutViewState;
  readonly paymentIntent?: PaymentIntent | null;
  readonly priceChange?: PriceChange | null;
  readonly paymentIntentMissing?: boolean;
  readonly paymentStarted?: boolean;
}

function createFixture(overrides: FixtureOverrides = {}): ComponentFixture<ReviewStep> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(ReviewStep);
  fixture.componentRef.setInput('summary', SUMMARY);
  fixture.componentRef.setInput('cart', CART);
  fixture.componentRef.setInput('draft', DRAFT);
  fixture.componentRef.setInput('options', OPTIONS);
  fixture.componentRef.setInput('state', overrides.state ?? 'ready');
  fixture.componentRef.setInput('paymentIntent', overrides.paymentIntent ?? null);
  fixture.componentRef.setInput('priceChange', overrides.priceChange ?? null);
  fixture.componentRef.setInput('paymentIntentMissing', overrides.paymentIntentMissing ?? false);
  fixture.componentRef.setInput('paymentStarted', overrides.paymentStarted ?? false);
  fixture.detectChanges();
  return fixture;
}

const PRICE_CHANGE: PriceChange = {
  shownTotal: { amount: 90_480, currency: 'HUF' },
  currentTotal: { amount: 159_980, currency: 'HUF' },
  awaitingConfirmation: true,
};

// ---------------------------------------------------------------------------
// PS-01 — succeeded intent: fixed sentence, no recovery control
// ---------------------------------------------------------------------------
describe('PS-01 a succeeded intent renders the approved sentence and offers no recovery control', () => {
  it('the status message reads exactly "A fizetés jóváhagyva." and no retry/change/check/back control is rendered', () => {
    const fixture = createFixture({ paymentIntent: makeIntent('succeeded') });
    const root = getRootElement(fixture);

    const status = getElement(root, '[data-testid="review-payment-status"]');
    expect(status.textContent.trim()).toBe('A fizetés jóváhagyva.');

    expect(queryElement(root, '[data-testid="review-payment-retry"]')).toBeNull();
    expect(queryElement(root, '[data-testid="review-payment-change"]')).toBeNull();
    expect(queryElement(root, '[data-testid="review-payment-check"]')).toBeNull();
    expect(queryElement(root, '[data-testid="review-payment-back"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PS-02 — declined intent: fixed sentence, retry and change controls
// ---------------------------------------------------------------------------
describe('PS-02 a declined intent renders the declined sentence with a retry and a change-method control', () => {
  it('the status message reads exactly "A szimulált fizetés elutasítva." and both controls carry their labels', () => {
    const fixture = createFixture({ paymentIntent: makeIntent('declined') });
    const root = getRootElement(fixture);

    const status = getElement(root, '[data-testid="review-payment-status"]');
    expect(status.textContent.trim()).toBe('A szimulált fizetés elutasítva.');

    const retry = getButton(root, 'review-payment-retry');
    expect(retry.textContent.trim()).toBe('Újrapróbálom');

    const change = getButton(root, 'review-payment-change');
    expect(change.textContent.trim()).toBe('Fizetési mód módosítása');
  });
});

describe('PS-03 the declined retry control emits paymentRetryRequested exactly once', () => {
  it('a single press emits once and no other output fires', () => {
    const fixture = createFixture({ paymentIntent: makeIntent('declined') });
    let retryCount = 0;
    let changeCount = 0;
    let checkCount = 0;
    let backCount = 0;
    let newCount = 0;
    fixture.componentInstance.paymentRetryRequested.subscribe(() => (retryCount += 1));
    fixture.componentInstance.paymentChangeMethodRequested.subscribe(() => (changeCount += 1));
    fixture.componentInstance.paymentCheckRequested.subscribe(() => (checkCount += 1));
    fixture.componentInstance.backToPaymentRequested.subscribe(() => (backCount += 1));
    fixture.componentInstance.newPaymentRequested.subscribe(() => (newCount += 1));

    getButton(getRootElement(fixture), 'review-payment-retry').click();
    fixture.detectChanges();

    expect(retryCount).toBe(1);
    expect(changeCount).toBe(0);
    expect(checkCount).toBe(0);
    expect(backCount).toBe(0);
    expect(newCount).toBe(0);
  });
});

describe('PS-04 the declined change-method control emits paymentChangeMethodRequested exactly once', () => {
  it('a single press emits once and no other output fires', () => {
    const fixture = createFixture({ paymentIntent: makeIntent('declined') });
    let retryCount = 0;
    let changeCount = 0;
    let checkCount = 0;
    let backCount = 0;
    let newCount = 0;
    fixture.componentInstance.paymentRetryRequested.subscribe(() => (retryCount += 1));
    fixture.componentInstance.paymentChangeMethodRequested.subscribe(() => (changeCount += 1));
    fixture.componentInstance.paymentCheckRequested.subscribe(() => (checkCount += 1));
    fixture.componentInstance.backToPaymentRequested.subscribe(() => (backCount += 1));
    fixture.componentInstance.newPaymentRequested.subscribe(() => (newCount += 1));

    getButton(getRootElement(fixture), 'review-payment-change').click();
    fixture.detectChanges();

    expect(changeCount).toBe(1);
    expect(retryCount).toBe(0);
    expect(checkCount).toBe(0);
    expect(backCount).toBe(0);
    expect(newCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PS-05 — pending intent: no rejection claim, exactly one check
// ---------------------------------------------------------------------------
describe('PS-05 a pending intent never claims a rejection and offers exactly one check control', () => {
  it('the status message reads exactly "Az eredmény még nem ismert, ezért nem tekintjük elutasítottnak." and only the check control is rendered', () => {
    const fixture = createFixture({ paymentIntent: makeIntent('pending') });
    const root = getRootElement(fixture);

    const status = getElement(root, '[data-testid="review-payment-status"]');
    expect(status.textContent.trim()).toBe(
      'Az eredmény még nem ismert, ezért nem tekintjük elutasítottnak.',
    );

    const check = getButton(root, 'review-payment-check');
    expect(check.textContent.trim()).toBe('Állapot ellenőrzése');

    expect(queryElement(root, '[data-testid="review-payment-retry"]')).toBeNull();
    expect(queryElement(root, '[data-testid="review-payment-change"]')).toBeNull();
    expect(queryElement(root, '[data-testid="review-payment-back"]')).toBeNull();
    expect(queryElement(root, '[data-testid="review-payment-new"]')).toBeNull();
  });
});

describe('PS-06 the pending check control emits paymentCheckRequested once per press and never loops', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('two presses emit exactly two events and nothing fires after the second', () => {
    vi.useFakeTimers();
    const fixture = createFixture({ paymentIntent: makeIntent('pending') });
    let count = 0;
    fixture.componentInstance.paymentCheckRequested.subscribe(() => (count += 1));

    const check = getButton(getRootElement(fixture), 'review-payment-check');
    check.click();
    fixture.detectChanges();
    check.click();
    fixture.detectChanges();

    expect(count).toBe(2);

    // Advance time well past any conceivable polling interval. No
    // timer fires from the component itself (review-step.ts:15:
    // "no polling loop of any kind").
    vi.advanceTimersByTime(10_000);
    fixture.detectChanges();
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// PS-07 — requires_action intent: unfinished sentence, back-to-payment
// ---------------------------------------------------------------------------
describe('PS-07 a requires_action intent renders the unfinished sentence with a back-to-payment control', () => {
  it('the status message reads exactly "A fizetés nem fejeződött be." and the back control emits backToPaymentRequested once', () => {
    const fixture = createFixture({ paymentIntent: makeIntent('requires_action') });
    let backCount = 0;
    fixture.componentInstance.backToPaymentRequested.subscribe(() => (backCount += 1));

    const root = getRootElement(fixture);
    const status = getElement(root, '[data-testid="review-payment-status"]');
    expect(status.textContent.trim()).toBe('A fizetés nem fejeződött be.');

    const back = getButton(root, 'review-payment-back');
    expect(back.textContent.trim()).toBe('Vissza a fizetéshez');

    back.click();
    fixture.detectChanges();
    expect(backCount).toBe(1);

    expect(queryElement(root, '[data-testid="review-payment-retry"]')).toBeNull();
    expect(queryElement(root, '[data-testid="review-payment-change"]')).toBeNull();
    expect(queryElement(root, '[data-testid="review-payment-check"]')).toBeNull();
    expect(queryElement(root, '[data-testid="review-payment-new"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PS-08 — missing intent, payment already started
// ---------------------------------------------------------------------------
describe('PS-08 no intent on a card draft that already started a payment says the intent is gone and offers a new one', () => {
  it('the status message reads exactly "A fizetési szándék nem található." and the new-payment label is "Új fizetés indítása"', () => {
    const fixture = createFixture({
      paymentIntent: null,
      paymentIntentMissing: true,
      paymentStarted: true,
    });
    const root = getRootElement(fixture);

    const status = getElement(root, '[data-testid="review-payment-status"]');
    expect(status.textContent.trim()).toBe('A fizetési szándék nem található.');

    const newPayment = getButton(root, 'review-payment-new');
    expect(newPayment.textContent.trim()).toBe('Új fizetés indítása');
  });
});

// ---------------------------------------------------------------------------
// PS-09 — missing intent, payment never started
// ---------------------------------------------------------------------------
describe('PS-09 no intent on a card draft that never started a payment invites the shopper to start one', () => {
  it('the status message reads exactly "A kártyás fizetéshez indítsd el a fizetést." and the new-payment label is "Fizetés indítása"', () => {
    const fixture = createFixture({
      paymentIntent: null,
      paymentIntentMissing: true,
      paymentStarted: false,
    });
    const root = getRootElement(fixture);

    const status = getElement(root, '[data-testid="review-payment-status"]');
    expect(status.textContent.trim()).toBe('A kártyás fizetéshez indítsd el a fizetést.');

    const newPayment = getButton(root, 'review-payment-new');
    expect(newPayment.textContent.trim()).toBe('Fizetés indítása');
  });
});

// ---------------------------------------------------------------------------
// PS-10 — new-payment emits once; no intent + not missing: branch absent
// ---------------------------------------------------------------------------
describe('PS-10 the new-payment control emits newPaymentRequested once, and the branch is absent for a cash on delivery draft', () => {
  it('a press on the missing-intent control emits once; without an intent and without paymentIntentMissing, no status branch renders at all', () => {
    // First sub-case: paymentIntentMissing true, paymentIntent null —
    // the missing-intent branch is present, the new-payment control emits.
    const missingFixture = createFixture({
      paymentIntent: null,
      paymentIntentMissing: true,
      paymentStarted: false,
    });
    let newCount = 0;
    missingFixture.componentInstance.newPaymentRequested.subscribe(() => (newCount += 1));
    getButton(getRootElement(missingFixture), 'review-payment-new').click();
    missingFixture.detectChanges();
    expect(newCount).toBe(1);

    // Second sub-case: no intent, not flagged missing — the entire
    // intent branch is absent (no status sentence, no new control).
    TestBed.resetTestingModule();
    const absentFixture = createFixture({
      paymentIntent: null,
      paymentIntentMissing: false,
      paymentStarted: false,
    });
    const absentRoot = getRootElement(absentFixture);
    expect(absentRoot.querySelectorAll('[data-testid="review-payment-status"]').length).toBe(0);
    expect(queryElement(absentRoot, '[data-testid="review-payment-new"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PC-01 — price-changed: both totals side by side
// ---------------------------------------------------------------------------
describe('PC-01 the price-changed state renders both totals side by side', () => {
  it('the old total, the new total, the alert banner and the role are exactly specified', () => {
    const fixture = createFixture({ state: 'price-changed', priceChange: PRICE_CHANGE });
    const root = getRootElement(fixture);

    const oldBlock = getElement(root, '[data-testid="review-price-change-old"]');
    expect(oldBlock.querySelector('app-price-block')).not.toBeNull();
    expect(oldBlock.querySelector('.label')?.textContent).toBe('Korábban');
    expect(oldBlock.querySelector('[data-testid="price-amount"]')?.textContent.trim()).toBe(
      PriceBlock.formatHuf(90_480),
    );

    const newBlock = getElement(root, '[data-testid="review-price-change-new"]');
    expect(newBlock.querySelector('app-price-block')).not.toBeNull();
    expect(newBlock.querySelector('.label')?.textContent).toBe('Most');
    expect(newBlock.querySelector('[data-testid="price-amount"]')?.textContent.trim()).toBe(
      PriceBlock.formatHuf(159_980),
    );

    const banner = getElement(root, '[data-testid="review-price-change"]');
    expect(banner.textContent).toContain('A végösszeg időközben megváltozott.');
    expect(banner.getAttribute('role')).toBe('alert');
  });
});

// ---------------------------------------------------------------------------
// PC-02 — confirm control label names the new total
// ---------------------------------------------------------------------------
describe('PC-02 the confirm control names the new total in its own label', () => {
  it('the confirm label reads exactly "Elfogadom az új végösszeget: {formatHuf(159980)} Ft" — built by formatHuf, not by typing the grouped digits', () => {
    const fixture = createFixture({ state: 'price-changed', priceChange: PRICE_CHANGE });
    const expected = `Elfogadom az új végösszeget: ${PriceBlock.formatHuf(159_980)} Ft`;
    const confirm = getButton(getRootElement(fixture), 'review-price-change-confirm');
    expect(confirm.textContent.trim()).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// PC-03 — confirm control emits priceChangeConfirmed once
// ---------------------------------------------------------------------------
describe('PC-03 the confirm control emits priceChangeConfirmed exactly once', () => {
  it('a single press emits once', () => {
    const fixture = createFixture({ state: 'price-changed', priceChange: PRICE_CHANGE });
    let count = 0;
    fixture.componentInstance.priceChangeConfirmed.subscribe(() => (count += 1));
    getButton(getRootElement(fixture), 'review-price-change-confirm').click();
    fixture.detectChanges();
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PC-04 — price-changed but priceChange is null: block not rendered
// ---------------------------------------------------------------------------
describe('PC-04 the price-change block is not rendered when the state is price-changed but the change is null', () => {
  it('no [data-testid="review-price-change"] element is rendered', () => {
    const fixture = createFixture({ state: 'price-changed', priceChange: null });
    const root = getRootElement(fixture);
    expect(queryElement(root, '[data-testid="review-price-change"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ST-01 — conflict: fixed sentence, retry control
// ---------------------------------------------------------------------------
describe('ST-01 the conflict state renders its fixed sentence and a retry control that emits retryRequested', () => {
  it('the status message reads exactly "Az adatok időközben megváltoztak. Ellenőrizd és próbáld újra." and the retry control emits once', () => {
    const fixture = createFixture({ state: 'conflict' });
    let retryCount = 0;
    fixture.componentInstance.retryRequested.subscribe(() => (retryCount += 1));

    const root = getRootElement(fixture);
    const status = getElement(root, '[data-testid="status-message"]');
    expect(status.textContent).toBe(
      'Az adatok időközben megváltoztak. Ellenőrizd és próbáld újra.',
    );

    const retry = getButton(root, 'review-conflict-retry');
    expect(retry.textContent.trim()).toBe('Újrapróbálom');
    retry.click();
    fixture.detectChanges();
    expect(retryCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ST-02 — stock-error / error: fixed sentences, no control in the row
// ---------------------------------------------------------------------------
describe('ST-02 the stock-error and error states each render their own fixed sentence and no control', () => {
  it('renders each sentence and no control inside the status row', () => {
    const stockFixture = createFixture({ state: 'stock-error' });
    const stockRoot = getRootElement(stockFixture);
    const stockMessages = stockRoot.querySelectorAll('[data-testid="status-message"]');
    expect(stockMessages.length).toBe(1);
    expect(stockMessages[0].textContent).toBe(
      'Egy vagy több változat elfogyott. Visszavonulhatsz a kosárhoz a cikk korrigálásához.',
    );
    expect(
      getElement(stockRoot, '[data-testid="review-status"]').querySelectorAll('app-button').length,
    ).toBe(0);

    TestBed.resetTestingModule();
    const errorFixture = createFixture({ state: 'error' });
    const errorRoot = getRootElement(errorFixture);
    const errorMessages = errorRoot.querySelectorAll('[data-testid="status-message"]');
    expect(errorMessages.length).toBe(1);
    expect(errorMessages[0].textContent).toBe('A rendelés leadása nem sikerült.');
    expect(
      getElement(errorRoot, '[data-testid="review-status"]').querySelectorAll('app-button').length,
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ST-03 — submitting / loading: loader labels, CTA disabled when submitting
// ---------------------------------------------------------------------------
describe('ST-03 the submitting and loading states each render their own loader, and submitting also disables the CTA and shows its loading label', () => {
  it('submitting shows the "Feldolgozás…" loader, disables the CTA with the same label and surfaces its explanation; loading shows its own loader and explanation', () => {
    const submittingFixture = createFixture({ state: 'submitting' });
    const submittingRoot = getRootElement(submittingFixture);

    const submittingLoaders = submittingRoot.querySelectorAll('app-loading-state');
    expect(submittingLoaders.length).toBe(1);
    expect(
      submittingRoot.querySelector('[data-testid="loading-state"]')?.getAttribute('aria-label'),
    ).toBe('Feldolgozás…');

    const submittingSubmit = getButton(submittingRoot, 'review-submit');
    expect(submittingSubmit.disabled).toBe(true);
    expect(submittingSubmit.querySelector('.label')?.textContent.trim()).toBe('Feldolgozás…');

    const submittingExplanation = getElement(
      submittingRoot,
      '[data-testid="review-cta-explanation"]',
    );
    expect(submittingExplanation.textContent.trim()).toBe(
      'A véglegesítés folyamatban van; kérlek várj.',
    );

    TestBed.resetTestingModule();
    const loadingFixture = createFixture({ state: 'loading' });
    const loadingRoot = getRootElement(loadingFixture);

    const loadingLoaders = loadingRoot.querySelectorAll('app-loading-state');
    expect(loadingLoaders.length).toBe(1);
    expect(
      loadingRoot.querySelector('[data-testid="loading-state"]')?.getAttribute('aria-label'),
    ).toBe('Rendelés adatainak betöltése');

    const loadingSubmit = getButton(loadingRoot, 'review-submit');
    expect(loadingSubmit.textContent.trim()).toBe('Demórendelés véglegesítése');

    const loadingExplanation = getElement(loadingRoot, '[data-testid="review-cta-explanation"]');
    expect(loadingExplanation.textContent.trim()).toBe(
      'A rendelés adatai még betöltés alatt vannak.',
    );
  });
});

// ---------------------------------------------------------------------------
// ST-04 — conflict / stock-error / error: no CTA explanation
// ---------------------------------------------------------------------------
describe('ST-04 the conflict, stock-error and error states render no CTA explanation, because their banner already says what happened', () => {
  it('renders no review-cta-explanation in any of the three states', () => {
    for (const state of ['conflict', 'stock-error', 'error'] as const) {
      const fixture = createFixture({ state });
      const root = getRootElement(fixture);
      expect(root.querySelectorAll('[data-testid="review-cta-explanation"]').length).toBe(0);
      TestBed.resetTestingModule();
    }
  });
});
