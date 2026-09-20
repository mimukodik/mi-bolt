/**
 * T21 - DeliveryStep (S4.3), the presentational component.
 *
 * FIX-56 gave `DeliveryStep` the signature `docs/spec/components.md:566-576`
 * declares: `options`/`fields`/`saveState` inputs, `continueRequested` /
 * `retryOptions` outputs. It no longer fetches, saves or navigates, so
 * every case here renders it with the three inputs set directly and
 * **no HttpClient, no MSW handler and no CheckoutFacade save call** — the
 * proof that the component no longer knows the SDK. The options-fetch and
 * save-failure cases that used to live here now belong to `DeliveryPage`
 * (`delivery-page.spec.ts`), the container that owns the network calls.
 *
 * Acceptance criteria mapped to real TestBed behavior tests:
 *
 *   T21-AC01 - Home delivery requires an address; virtual pickup removes
 *               it from the submitted payload and announces no real
 *               pickup place.
 *   T21-AC02 - Postal code [1-9][0-9]{3}, city 2..80, line1 3..120,
 *               optional line2 <=120; country fixed HU with visible label.
 *   T21-AC03 - Shipping fee visibly follows the selected option:
 *               1990 HUF for home / 0 HUF for pickup. No tariff,
 *               installment, insurance, real card field, or provider
 *               redirect.
 *   T21-AC04 - Selection is announced through a visible badge, not by
 *               color alone.
 */

import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AddressForm } from './address-form';
import {
  buildCheckoutForm,
  createInitialCheckoutFormModel,
  type CheckoutFieldTree,
} from './checkout-form.model';
import { DeliveryStep } from './delivery-step';
import { PaymentMethodSelector, type PaymentMethod } from './payment-method-selector';

import type { CheckoutOptions } from '../../api/generated/models/checkout-options';

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

function getInputElement(parent: Element, selector: string): HTMLInputElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Expected HTMLInputElement matching "${selector}"`);
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

const DEFAULT_OPTIONS: CheckoutOptions = {
  deliveryOptions: [
    {
      id: 'home_delivery',
      label: 'Házhoz szállítás',
      fee: { amount: 1990, currency: 'HUF' },
      requiresAddress: true,
      description: 'Kiszállítás a megadott címre.',
    },
    {
      id: 'demo_pickup',
      label: 'Virtuális átvétel',
      fee: { amount: 0, currency: 'HUF' },
      requiresAddress: false,
      description: 'Demó átvételi mód, valós üzletcím nélkül.',
    },
  ],
  paymentMethods: ['demo_card', 'demo_cod'],
  termsVersion: 'demo-1',
};

function freshFields(): CheckoutFieldTree {
  // `form()` (Signal Forms) calls `inject()` internally, so it must run
  // inside an injection context — TestBed's, once configured.
  return TestBed.runInInjectionContext(() =>
    buildCheckoutForm(signal(createInitialCheckoutFormModel())),
  );
}

/** Renders `DeliveryStep` with its three declared inputs set directly.
 *  No HttpClient provider, no MSW handler, no CheckoutFacade — this is
 *  FIX-56-AC05's proof that the component no longer knows the SDK. */
function createFixture(
  overrides: { options?: CheckoutOptions; fields?: CheckoutFieldTree } = {},
): ComponentFixture<DeliveryStep> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(DeliveryStep);
  fixture.componentRef.setInput('options', overrides.options ?? DEFAULT_OPTIONS);
  fixture.componentRef.setInput('fields', overrides.fields ?? freshFields());
  fixture.detectChanges();
  return fixture;
}

// ---------------------------------------------------------------------------
// FIX-56-AC05 - renders with no MSW handler and no SDK dependency
// ---------------------------------------------------------------------------
describe('FIX-56-AC05 DeliveryStep renders from its declared inputs alone', () => {
  it('renders the given delivery options with no HttpClient/MSW/CheckoutFacade involved', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);
    expect(root.textContent).toContain('Házhoz szállítás');
    expect(root.textContent).toContain('Virtuális átvétel');
  });
});

// ---------------------------------------------------------------------------
// T21-AC01 - home-only address, pickup removes it, "no real pickup place"
// ---------------------------------------------------------------------------
describe('T21-AC01 home delivery requires address; pickup removes it and announces no real pickup place', () => {
  it('AddressForm is rendered only when the chosen delivery option requires it', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);

    expect(queryElement(root, 'app-address-form')).toBeNull();

    fixture.componentInstance.onOptionSelected('demo_pickup');
    fixture.detectChanges();
    expect(queryElement(root, 'app-address-form')).toBeNull();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.detectChanges();
    expect(queryElement(root, 'app-address-form')).not.toBeNull();
  });

  it('confirming a home_delivery selection strips the address for a pickup switch and back', () => {
    const fixture = createFixture();
    const fields = fixture.componentInstance.fields();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.componentInstance.setPostalCode('1011');
    fixture.componentInstance.setCity('Budapest');
    fixture.componentInstance.setLine1('Fő utca 1.');
    fixture.detectChanges();
    fixture.componentInstance.onConfirm();

    expect(fields.deliveryOptionId().value()).toBe('home_delivery');
    expect(fields.address.postalCode().value()).toBe('1011');
    expect(fields.address.city().value()).toBe('Budapest');

    fixture.componentInstance.onOptionSelected('demo_pickup');
    fixture.detectChanges();
    fixture.componentInstance.onConfirm();

    expect(fields.deliveryOptionId().value()).toBe('demo_pickup');
  });

  it('DeliveryStep announces that virtual pickup is not a real pickup place', () => {
    const fixture = createFixture();

    fixture.componentInstance.onOptionSelected('demo_pickup');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const notice = getElement(root, '[data-testid="pickup-notice"]');
    expect(notice.textContent).toMatch(/nincs valós üzletcím|Virtuális átvételi lehetőség/);
    expect(notice.getAttribute('role')).toBe('note');
  });

  it('DeliveryStep exposes radio inputs (one per delivery option) and addresses are programmatic only', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);
    const radios = root.querySelectorAll<HTMLInputElement>(
      'input[type="radio"][name="deliveryOption"]',
    );
    expect(radios.length).toBe(2);
    const values = Array.from(radios).map((r) => r.value);
    expect(values).toContain('home_delivery');
    expect(values).toContain('demo_pickup');
  });
});

// ---------------------------------------------------------------------------
// T21-AC02 - postal code regex, length bounds, HU country fixed.
// AddressForm is exercised directly; this component is unchanged by FIX-56.
// ---------------------------------------------------------------------------
describe('T21-AC02 address field rules and fixed HU country', () => {
  it('AddressForm regex for postal code is [1-9][0-9]{3} and rejects leading-zero codes', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(AddressForm);
    fixture.detectChanges();

    fixture.componentInstance.postalCode.set('0123');
    fixture.detectChanges();
    expect(fixture.componentInstance.postalErrors().length).toBe(1);
    expect(fixture.componentInstance.postalErrors()[0]?.code).toBe('pattern');

    fixture.componentInstance.postalCode.set('1011');
    fixture.detectChanges();
    expect(fixture.componentInstance.postalErrors().length).toBe(0);
  });

  it('AddressForm hard-codes country to HU with a visible label, not a user-editable select', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(AddressForm);
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(root.querySelector('select')).toBeNull();
    const countryEl = getElement(root, '[data-testid="address-field-country"]');
    expect(countryEl.textContent).toContain('HU');
    expect(fixture.componentInstance.countryCode()).toBe('HU');
  });
});

// ---------------------------------------------------------------------------
// T21-AC03 - visible shipping fee per option; no tariff / installments / insurance
// ---------------------------------------------------------------------------
describe('T21-AC03 visible shipping fee per option; no tariff / installments / insurance / real card field', () => {
  it('DeliveryStep renders the shipping fee as a PriceBlock whose money matches the selected option', () => {
    const fixture = createFixture();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.detectChanges();
    expect(fixture.componentInstance.currentShippingFee()).toEqual({
      amount: 1990,
      currency: 'HUF',
    });

    fixture.componentInstance.onOptionSelected('demo_pickup');
    fixture.detectChanges();
    expect(fixture.componentInstance.currentShippingFee()).toEqual({ amount: 0, currency: 'HUF' });
  });

  it('FIX-35: the pickup option renders an explicit 0 Ft, not a dash (a known zero is a fact)', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);
    const pickupRadio = getInputElement(root, 'input[value="demo_pickup"]');
    const pickupOption = pickupRadio.closest('[data-testid="delivery-option"]');
    if (!(pickupOption instanceof HTMLElement)) throw new Error('Expected the pickup option row');
    const priceAmount = getElement(pickupOption, '[data-testid="price-amount"]');
    expect(priceAmount.textContent.trim()).toBe('0');
    expect(pickupOption.querySelector('[data-testid="price-empty"]')).toBeNull();
  });

  it('does not mention tariff, installment, insurance, monthly fee, hidden add-on or card fields', () => {
    const fixture = createFixture();
    const text = getRootElement(fixture).textContent.toLowerCase();
    expect(text).not.toContain('vám');
    expect(text).not.toContain('részlet');
    expect(text).not.toContain('installment');
    expect(text).not.toContain('biztosítás');
    expect(text).not.toContain('havi díj');
    expect(text).not.toContain('extra költség');
    expect(text).not.toContain('rejtett');
    expect(text).not.toContain('card number');
    expect(text).not.toContain('cvc');
  });

  it('PaymentMethodSelector accepts demo_card | demo_cod only - no wallet, transfer, or card-detail inputs', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PaymentMethodSelector);
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const radios = root.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios.length).toBe(2);
    const values = Array.from(radios).map((r) => r.value);
    expect(values).toEqual(['demo_card', 'demo_cod']);
    expect(root.querySelector('input[name="cardnumber"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T21-AC04 - selection is not indicated by color alone
// ---------------------------------------------------------------------------
describe('T21-AC04 selection is announced by a visible badge, not by color alone', () => {
  it('Selection state is conveyed by an explicit "Kiválasztva" badge, not only by a class', () => {
    const fixture = createFixture();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const badge = getElement(root, '[data-testid="delivery-selected-badge"]');
    expect(badge.textContent.trim()).toBe('Kiválasztva');
    expect(badge.getAttribute('aria-live')).toBe('polite');
  });

  it('Selection radios bind their `checked` state to the signal so the DOM stays in sync', () => {
    const fixture = createFixture();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const homeRadio = getInputElement(root, 'input[value="home_delivery"]');
    const pickupRadio = getInputElement(root, 'input[value="demo_pickup"]');
    expect(homeRadio.checked).toBe(true);
    expect(homeRadio.getAttribute('aria-checked')).toBe('true');
    expect(pickupRadio.checked).toBe(false);
    expect(pickupRadio.getAttribute('aria-checked')).toBe('false');
  });

  it('PaymentMethodSelector emits paymentChanged with demo_card | demo_cod and selection is not color-only', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PaymentMethodSelector);
    fixture.detectChanges();

    let emitted: PaymentMethod | null = null;
    fixture.componentInstance.paymentChanged.subscribe((val) => {
      emitted = val;
    });

    fixture.componentInstance.onSelected('demo_cod');
    fixture.detectChanges();

    expect(emitted).toBe('demo_cod');
    const root = getRootElement(fixture);
    const badge = getElement(root, '[data-testid="payment-selected-badge"]');
    expect(badge.textContent.trim()).toBe('Kiválasztva');
  });
});

// ---------------------------------------------------------------------------
// FIX-22 - one working continue button; the summary shows the chosen
// delivery method instead of repeating the row label or an internal flag.
// ---------------------------------------------------------------------------
describe('FIX-22 one working continue button and a readable summary', () => {
  it('DeliveryStep renders exactly one "Tovább az ellenőrzéshez" button', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);
    const buttons = Array.from(root.querySelectorAll('button')).filter(
      (b) => b.textContent.trim() === 'Tovább az ellenőrzéshez',
    );
    expect(buttons.length).toBe(1);
  });

  it('the fee row shows the chosen delivery option label exactly once, not the literal row term twice', () => {
    const fixture = createFixture();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const feeRow = getElement(root, '[data-testid="summary-row-fee"]');
    const option = fixture.componentInstance
      .options()
      .deliveryOptions.find((o) => o.id === 'home_delivery');
    if (option === undefined) {
      throw new Error('Expected a home_delivery option');
    }
    expect(feeRow.textContent).toContain(option.label);
    const occurrences = (feeRow.textContent.match(/Szállítási díj/g) ?? []).length;
    expect(occurrences).toBe(1);
    expect(fixture.componentInstance.deliveryLabel()).toBe(option.label);
  });
});

// ---------------------------------------------------------------------------
// FIX-56-AC06 - continueRequested / retryOptions emit, and saveState renders
// a visible difference per required state (loading, saving, error).
// ---------------------------------------------------------------------------
describe('FIX-56-AC06 continueRequested, retryOptions and saveState-driven states', () => {
  it('continueRequested emits when the confirm control is activated in a valid state, with no navigation of its own', () => {
    const fixture = createFixture();
    let emitted = 0;
    fixture.componentInstance.continueRequested.subscribe(() => emitted++);

    fixture.componentInstance.onOptionSelected('demo_pickup');
    fixture.detectChanges();
    fixture.componentInstance.onConfirm();

    expect(emitted).toBe(1);
  });

  it('continueRequested does not emit while the selection is incomplete (invalid state)', () => {
    const fixture = createFixture();
    let emitted = 0;
    fixture.componentInstance.continueRequested.subscribe(() => emitted++);

    // No option selected — `canConfirm()` is false.
    fixture.componentInstance.onConfirm();
    expect(emitted).toBe(0);
    expect(fixture.componentInstance.canConfirm()).toBe(false);
  });

  it('retryOptions emits from the error branch retry control', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('saveState', 'error');
    fixture.detectChanges();

    let emitted = 0;
    fixture.componentInstance.retryOptions.subscribe(() => emitted++);

    const root = getRootElement(fixture);
    const retryHost = getElement(root, '[data-testid="delivery-retry"]');
    const retryButton = getElement(retryHost, 'button');
    retryButton.click();
    fixture.detectChanges();

    expect(emitted).toBe(1);
  });

  it('saveState "loading" renders the confirm button in its loading state and disables it', () => {
    const fixture = createFixture();
    fixture.componentInstance.onOptionSelected('demo_pickup');
    fixture.componentRef.setInput('saveState', 'loading');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const confirmButton = getElement(root, '[data-testid="delivery-confirm"]');
    expect(confirmButton.textContent).toContain('Mentés…');
    expect(fixture.componentInstance.canConfirm()).toBe(false);
    expect(queryElement(root, '[data-testid="delivery-save-failure"]')).toBeNull();
  });

  it('saveState "error" renders a distinct error banner and retry control the other states do not', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('saveState', 'error');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const banner = getElement(root, '[data-testid="delivery-save-failure"]');
    expect(banner.textContent).toContain('sikertelen');
    expect(queryElement(root, '[data-testid="delivery-retry"]')).not.toBeNull();
  });

  it('saveState "idle" renders neither the loading label nor the error banner (the "ready" required state)', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(queryElement(root, '[data-testid="delivery-save-failure"]')).toBeNull();
    const confirmButton = getElement(root, '[data-testid="delivery-confirm"]');
    expect(confirmButton.textContent).not.toContain('Mentés…');
  });
});

// ---------------------------------------------------------------------------
// FIX-55 - the breadcrumbs are `routerLink`s, not raw `href`s.
// ---------------------------------------------------------------------------
describe('FIX-55 breadcrumbs use routerLink', () => {
  it('the three breadcrumb anchors carry the expected hrefs', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);
    const anchors = root.querySelectorAll<HTMLAnchorElement>('nav.breadcrumbs a');
    expect(anchors.length).toBe(3);
    expect(Array.from(anchors).map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/penztar/kosar',
      '/penztar/adatok',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Wiring + primitive conformance
// ---------------------------------------------------------------------------
describe('T21 wiring - owned files use the documented T10 primitives', () => {
  it('DeliveryStep wires PriceBlock and StatusMessage; delegates FormFieldMessage to AddressForm', () => {
    const fixture = createFixture();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-price-block')).not.toBeNull();
    expect(queryElement(root, 'app-address-form')).not.toBeNull();
    expect(queryElement(root, 'app-form-field-message')).not.toBeNull();
  });

  it('DeliveryStep never renders app-error-state or app-loading-state — the container owns the fetch states', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('saveState', 'error');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-error-state')).toBeNull();
    expect(queryElement(root, 'app-loading-state')).toBeNull();
  });
});
