/**
 * DeliveryStep on the 2.0.0 contract — twenty-six cases over the
 * delivery options, the unavailable-option branches, the address form
 * gating, the billing block, the summary rows and the save states.
 *
 * The component is purely presentational: it reads its `options` and
 * `fields` inputs, writes address and billing values back through the
 * field tree, mirrors the chosen delivery option and payment method
 * into the shared field tree at confirm time, and reports
 * `continueRequested` / `retryOptions`. It does not fetch, save, or
 * navigate. The TestBed carries no HttpClient and no MSW handler — the
 * proof that this slice is SDK-free lives in the suite itself.
 */

import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import {
  buildCheckoutForm,
  createInitialCheckoutFormModel,
  type CheckoutFieldTree,
} from './checkout-form.model';
import { DeliveryStep } from './delivery-step';

import { PriceBlock } from '../../shared/ui/price-block/price-block';

import type { CheckoutOptions } from '../../api/generated/models/checkout-options';
import type { DeliveryOption } from '../../api/generated/models/delivery-option';
import type { PaymentMethodOption } from '../../api/generated/models/payment-method-option';

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

const HOME_DELIVERY: DeliveryOption = {
  id: 'home_delivery',
  label: 'Házhoz szállítás',
  description: 'Futárral, 1–2 munkanapon belül.',
  fee: { amount: 1490, currency: 'HUF' },
  requiresAddress: true,
  estimatedDays: 2,
  available: true,
};

const PICKUP_POINT: DeliveryOption = {
  id: 'pickup_point',
  label: 'Átvételi pont',
  description: 'Csomagponton, 2–3 munkanapon belül.',
  fee: { amount: 990, currency: 'HUF' },
  requiresAddress: false,
  estimatedDays: 3,
  available: true,
};

const HOME_DELIVERY_FREE: DeliveryOption = {
  ...HOME_DELIVERY,
  fee: { amount: 0, currency: 'HUF' },
};

const PICKUP_POINT_FREE: DeliveryOption = {
  ...PICKUP_POINT,
  fee: { amount: 0, currency: 'HUF' },
};

const CARD: PaymentMethodOption = {
  id: 'card',
  label: 'Bankkártya',
  description: 'Online kártyás fizetés.',
  fee: { amount: 0, currency: 'HUF' },
  available: true,
};

const CASH_ON_DELIVERY: PaymentMethodOption = {
  id: 'cash_on_delivery',
  label: 'Utánvét',
  description: 'Készpénzzel vagy kártyával a futárnál.',
  fee: { amount: 490, currency: 'HUF' },
  available: true,
};

const DEFAULT_OPTIONS: CheckoutOptions = {
  deliveryOptions: [HOME_DELIVERY, PICKUP_POINT],
  paymentMethods: [CARD, CASH_ON_DELIVERY],
  termsVersion: '2026-09',
};

function freshFields(): CheckoutFieldTree {
  return TestBed.runInInjectionContext(() =>
    buildCheckoutForm(signal(createInitialCheckoutFormModel())),
  );
}

function createFixture(
  overrides: {
    options?: CheckoutOptions;
    seedFields?: (fields: CheckoutFieldTree) => void;
  } = {},
): ComponentFixture<DeliveryStep> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  });
  const fields = freshFields();
  overrides.seedFields?.(fields);
  const fixture = TestBed.createComponent(DeliveryStep);
  fixture.componentRef.setInput('options', overrides.options ?? DEFAULT_OPTIONS);
  fixture.componentRef.setInput('fields', fields);
  fixture.detectChanges();
  return fixture;
}

function selectDelivery(
  fixture: ComponentFixture<DeliveryStep>,
  id: 'home_delivery' | 'pickup_point',
): void {
  const root = getRootElement(fixture);
  const radio = getInputElement(root, `#delivery-option-${id}`);
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
  fixture.detectChanges();
}

function selectPayment(
  fixture: ComponentFixture<DeliveryStep>,
  id: 'card' | 'cash_on_delivery',
): void {
  const root = getRootElement(fixture);
  const radio = getInputElement(root, `#payment-option-${id}`);
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
  fixture.detectChanges();
}

function fillHomeAddress(fixture: ComponentFixture<DeliveryStep>): void {
  const fields = fixture.componentInstance.fields();
  fields.address.postalCode().value.set('1051');
  fields.address.city().value.set('Budapest');
  fields.address.line1().value.set('Fő utca 1.');
  fields.address.line2().value.set('');
  fixture.detectChanges();
}

function confirmButton(fixture: ComponentFixture<DeliveryStep>): HTMLButtonElement {
  const root = getRootElement(fixture);
  const host = getElement(root, '[data-testid="delivery-confirm"]');
  const button = host.querySelector('button');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Expected HTMLButtonElement inside the confirm host');
  }
  return button;
}

// ---------------------------------------------------------------------------
// DS-01 / DS-02 — renders the wire delivery options and their descriptions
// ---------------------------------------------------------------------------

describe('DS-01 renders both delivery options from the options input with no HttpClient and no facade provided', () => {
  it('renders two delivery-option rows whose titles come from the wire options', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);

    const optionHosts = root.querySelectorAll('[data-testid="delivery-option"]');
    expect(optionHosts.length).toBe(2);

    const titles = Array.from(optionHosts).map((host) => {
      const titleEl = host.querySelector('.option-title');
      return titleEl?.textContent.trim() ?? '';
    });
    expect(titles).toEqual(['Házhoz szállítás', 'Átvételi pont']);

    expect(queryElement(root, '[data-testid="delivery-save-failure"]')).toBeNull();
  });
});

describe('DS-02 renders each delivery option wire description', () => {
  it('the two description spans read the wire description strings exactly', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);

    const homeDesc = getElement(root, '#delivery-option-desc-home_delivery');
    const pickupDesc = getElement(root, '#delivery-option-desc-pickup_point');
    expect(homeDesc.textContent.trim()).toBe('Futárral, 1–2 munkanapon belül.');
    expect(pickupDesc.textContent.trim()).toBe('Csomagponton, 2–3 munkanapon belül.');
  });
});

// ---------------------------------------------------------------------------
// DS-03 / DS-04 — selection state and the visible badge
// ---------------------------------------------------------------------------

describe('DS-03 no delivery option is selected on a fresh field tree', () => {
  it('every delivery radio is unchecked and no selected badge is rendered', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);

    const radios = root.querySelectorAll<HTMLInputElement>('[data-testid="delivery-radio"]');
    expect(radios.length).toBe(2);
    for (const radio of Array.from(radios)) {
      expect(radio.checked).toBe(false);
    }
    expect(root.querySelectorAll('[data-testid="delivery-selected-badge"]').length).toBe(0);
  });
});

describe('DS-04 selecting home delivery checks its radio and renders the selected badge', () => {
  it('dispatching change on the home_delivery radio sets checked and shows a Kiválasztva badge', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);
    const homeRadio = getInputElement(root, '#delivery-option-home_delivery');
    homeRadio.checked = true;
    homeRadio.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(homeRadio.checked).toBe(true);

    const badges = root.querySelectorAll('[data-testid="delivery-selected-badge"]');
    expect(badges.length).toBe(1);
    const badge = badges.item(0);
    if (!(badge instanceof HTMLElement)) throw new Error('Expected badge host');
    expect(badge.textContent.trim()).toBe('Kiválasztva');
    expect(badge.getAttribute('aria-live')).toBe('polite');
  });
});

// ---------------------------------------------------------------------------
// DS-05 / DS-06 / DS-07 — fee rendering and the summary fee row
// ---------------------------------------------------------------------------

describe('DS-05 the fee shown per option is the wire fee, zero on both options above the free-shipping threshold', () => {
  it('above the threshold both rows render formatHuf(0); at default the 1490 and 990 fees render', () => {
    const freeFixture = createFixture({
      options: {
        deliveryOptions: [HOME_DELIVERY_FREE, PICKUP_POINT_FREE],
        paymentMethods: [CARD, CASH_ON_DELIVERY],
        termsVersion: '2026-09',
      },
    });
    const freeRoot = getRootElement(freeFixture);
    const freeAmounts = Array.from(
      freeRoot.querySelectorAll('[data-testid="delivery-option"] [data-testid="price-amount"]'),
    ).map((el) => el.textContent.trim());
    expect(freeAmounts).toEqual([PriceBlock.formatHuf(0), PriceBlock.formatHuf(0)]);

    const defaultFixture = createFixture();
    const defaultRoot = getRootElement(defaultFixture);
    const defaultAmounts = Array.from(
      defaultRoot.querySelectorAll('[data-testid="delivery-option"] [data-testid="price-amount"]'),
    ).map((el) => el.textContent.trim());
    expect(defaultAmounts).toEqual([PriceBlock.formatHuf(1490), PriceBlock.formatHuf(990)]);
  });
});

describe('DS-06 the summary fee row follows the selected option fee and label', () => {
  it('after selecting pickup_point the summary fee row carries formatHuf(990) and the pickup label', () => {
    const fixture = createFixture();
    selectDelivery(fixture, 'pickup_point');

    const root = getRootElement(fixture);
    const feeRow = getElement(root, '[data-testid="summary-row-fee"]');
    expect(feeRow.textContent).toContain(PriceBlock.formatHuf(990));
    expect(feeRow.textContent).toContain('Átvételi pont');
  });
});

describe('DS-07 the summary fee row reads "Nincs kiválasztva" before a delivery option is chosen', () => {
  it('on a fresh field tree the summary fee row carries the unselected label', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);
    const feeRow = getElement(root, '[data-testid="summary-row-fee"]');
    expect(feeRow.textContent).toContain('Nincs kiválasztva');
  });
});

// ---------------------------------------------------------------------------
// DS-08 / DS-09 / DS-10 — unavailable options
// ---------------------------------------------------------------------------

describe('DS-08 an unavailable delivery option renders a disabled radio carrying its reason', () => {
  it('pickup_point unavailable with CART_VALUE_TOO_HIGH renders a disabled radio and the matching sentence', () => {
    const unavailablePickup: DeliveryOption = {
      ...PICKUP_POINT,
      available: false,
      unavailableReason: 'CART_VALUE_TOO_HIGH',
    };
    const fixture = createFixture({
      options: {
        deliveryOptions: [HOME_DELIVERY, unavailablePickup],
        paymentMethods: [CARD, CASH_ON_DELIVERY],
        termsVersion: '2026-09',
      },
    });
    const root = getRootElement(fixture);
    const pickupRadio = getInputElement(root, '#delivery-option-pickup_point');
    expect(pickupRadio.disabled).toBe(true);

    const reasonEl = getElement(root, '[data-testid="delivery-unavailable-reason"]');
    expect(reasonEl.textContent.trim()).toBe(
      'A kosár értéke meghaladja az ennél az opciónál megengedett összeget.',
    );
  });
});

describe('DS-09 an unavailable delivery option cannot be selected', () => {
  it('dispatching change on a disabled radio leaves the summary at the unselected label', () => {
    const unavailablePickup: DeliveryOption = {
      ...PICKUP_POINT,
      available: false,
      unavailableReason: 'CART_VALUE_TOO_HIGH',
    };
    const fixture = createFixture({
      options: {
        deliveryOptions: [HOME_DELIVERY, unavailablePickup],
        paymentMethods: [CARD, CASH_ON_DELIVERY],
        termsVersion: '2026-09',
      },
    });
    const root = getRootElement(fixture);
    const pickupRadio = getInputElement(root, '#delivery-option-pickup_point');
    pickupRadio.checked = true;
    pickupRadio.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(root.querySelectorAll('[data-testid="delivery-selected-badge"]').length).toBe(0);
    const feeRow = getElement(root, '[data-testid="summary-row-fee"]');
    expect(feeRow.textContent).toContain('Nincs kiválasztva');
  });
});

describe('DS-10 an unavailable reason the component does not name falls back to the generic sentence', () => {
  it('NOT_AVAILABLE_FOR_ITEMS renders the specific sentence, absent reason renders the generic fallback', () => {
    const specificUnavailable: DeliveryOption = {
      ...PICKUP_POINT,
      available: false,
      unavailableReason: 'NOT_AVAILABLE_FOR_ITEMS',
    };
    const specificFixture = createFixture({
      options: {
        deliveryOptions: [HOME_DELIVERY, specificUnavailable],
        paymentMethods: [CARD, CASH_ON_DELIVERY],
        termsVersion: '2026-09',
      },
    });
    const specificRoot = getRootElement(specificFixture);
    const specificReason = getElement(specificRoot, '[data-testid="delivery-unavailable-reason"]');
    expect(specificReason.textContent.trim()).toBe(
      'A kosaradban lévő termékekhez ez az opció nem elérhető.',
    );

    const genericUnavailable: DeliveryOption = {
      ...PICKUP_POINT,
      available: false,
    };
    const genericFixture = createFixture({
      options: {
        deliveryOptions: [HOME_DELIVERY, genericUnavailable],
        paymentMethods: [CARD, CASH_ON_DELIVERY],
        termsVersion: '2026-09',
      },
    });
    const genericRoot = getRootElement(genericFixture);
    const genericReason = getElement(genericRoot, '[data-testid="delivery-unavailable-reason"]');
    expect(genericReason.textContent.trim()).toBe('Ez az opció jelenleg nem elérhető.');
  });
});

// ---------------------------------------------------------------------------
// DS-11 / DS-12 — address form vs pickup notice
// ---------------------------------------------------------------------------

describe('DS-11 home delivery renders the address form and pickup renders the pickup notice instead', () => {
  it('home_delivery shows one address-form and zero pickup-notice; pickup_point flips them', () => {
    // The billing address form also renders an inner [data-testid="address-form"] fieldset once pickup clears "same as delivery", so the delivery-side host is what is counted.
    const fixture = createFixture();
    selectDelivery(fixture, 'home_delivery');
    let root = getRootElement(fixture);
    expect(
      root.querySelectorAll('app-address-form:not([data-testid="billing-address-form"])').length,
    ).toBe(1);
    expect(root.querySelectorAll('[data-testid="pickup-notice"]').length).toBe(0);

    selectDelivery(fixture, 'pickup_point');
    root = getRootElement(fixture);
    expect(
      root.querySelectorAll('app-address-form:not([data-testid="billing-address-form"])').length,
    ).toBe(0);
    expect(root.querySelectorAll('[data-testid="pickup-notice"]').length).toBe(1);
  });
});

describe('DS-12 the pickup notice states that the virtual pickup is not a real pickup place', () => {
  it('the pickup notice text mentions nincs valós üzletcím and valós átvételi pont nélkül with role note', () => {
    const fixture = createFixture();
    selectDelivery(fixture, 'pickup_point');
    const root = getRootElement(fixture);
    const notice = getElement(root, '[data-testid="pickup-notice"]');
    expect(notice.textContent).toContain('nincs valós üzletcím');
    expect(notice.textContent).toContain('valós átvételi pont nélkül');
    expect(notice.getAttribute('role')).toBe('note');
  });
});

// ---------------------------------------------------------------------------
// DS-13 — billing name prefilled from the field tree
// ---------------------------------------------------------------------------

describe('DS-13 the billing name is prefilled from whatever the field tree already holds', () => {
  it('seeding fields.billingName before detectChanges renders the value in the input', () => {
    const fixture = createFixture({
      seedFields: (fields) => {
        fields.billingName().value.set('Teszt Elek');
      },
    });
    const root = getRootElement(fixture);
    const input = getInputElement(root, '[data-testid="billing-name-input"]');
    expect(input.value).toBe('Teszt Elek');
  });
});

// ---------------------------------------------------------------------------
// DS-14 / DS-15 / DS-16 / DS-17 — billing block visibility rules
// ---------------------------------------------------------------------------

describe('DS-14 the same-as-delivery checkbox is shown for home delivery and hidden for pickup', () => {
  it('home_delivery renders one checkbox; pickup_point renders zero', () => {
    const fixture = createFixture();
    selectDelivery(fixture, 'home_delivery');
    let root = getRootElement(fixture);
    expect(root.querySelectorAll('[data-testid="billing-same-as-delivery"]').length).toBe(1);

    selectDelivery(fixture, 'pickup_point');
    root = getRootElement(fixture);
    expect(root.querySelectorAll('[data-testid="billing-same-as-delivery"]').length).toBe(0);
  });
});

describe('DS-15 choosing pickup forces the same-as-delivery field to false', () => {
  it('seeding billingSameAsDelivery true and selecting pickup_point drives it to false', async () => {
    const fixture = createFixture({
      seedFields: (fields) => {
        fields.billingSameAsDelivery().value.set(true);
      },
    });
    selectDelivery(fixture, 'pickup_point');
    await fixture.whenStable();
    expect(fixture.componentInstance.fields().billingSameAsDelivery().value()).toBe(false);
  });
});

describe('DS-16 unchecking same-as-delivery reveals the billing address form', () => {
  it('home_delivery with the box checked hides the billing address; unchecking reveals it', () => {
    const fixture = createFixture({
      seedFields: (fields) => {
        fields.billingSameAsDelivery().value.set(true);
      },
    });
    selectDelivery(fixture, 'home_delivery');
    let root = getRootElement(fixture);
    expect(root.querySelectorAll('[data-testid="billing-address-form"]').length).toBe(0);

    const fields = fixture.componentInstance.fields();
    fields.billingSameAsDelivery().value.set(false);
    fixture.detectChanges();

    root = getRootElement(fixture);
    expect(root.querySelectorAll('[data-testid="billing-address-form"]').length).toBe(1);
  });
});

describe('DS-17 the billing address form is always shown for pickup', () => {
  it('selecting pickup_point renders exactly one billing-address-form regardless of the checkbox field', () => {
    const fixture = createFixture({
      seedFields: (fields) => {
        fields.billingSameAsDelivery().value.set(true);
      },
    });
    selectDelivery(fixture, 'pickup_point');
    const root = getRootElement(fixture);
    expect(root.querySelectorAll('[data-testid="billing-address-form"]').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// DS-18 — billing name required validation
// ---------------------------------------------------------------------------

describe('DS-18 an empty billing name reports the required message once the field is blurred', () => {
  it('blurring an empty billing name input renders the required message with aria-invalid true', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);
    const input = getInputElement(root, '[data-testid="billing-name-input"]');
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();

    expect(input.getAttribute('aria-invalid')).toBe('true');

    const field = getElement(root, '[data-testid="billing-name-field"]');
    const messageEl = field.querySelector('[data-testid="form-field-message"]');
    expect(messageEl?.textContent.trim()).toBe('A számlázási név megadása kötelező.');
  });
});

// ---------------------------------------------------------------------------
// DS-19 — address setters write through to the shared field tree
// ---------------------------------------------------------------------------

describe('DS-19 the address setters write straight through to the shared field tree and the last write wins', () => {
  it('five sequential setter calls leave the four address fields at the values of the last write', () => {
    const fixture = createFixture();
    const instance = fixture.componentInstance;

    instance.setPostalCode('1051');
    instance.setCity('Budapest');
    instance.setLine1('Fő utca 1.');
    instance.setLine2('2. em.');
    instance.setPostalCode('1052');

    const fields = instance.fields();
    expect(fields.address.postalCode().value()).toBe('1052');
    expect(fields.address.city().value()).toBe('Budapest');
    expect(fields.address.line1().value()).toBe('Fő utca 1.');
    expect(fields.address.line2().value()).toBe('2. em.');
  });
});

// ---------------------------------------------------------------------------
// DS-20 / DS-21 / DS-22 — canConfirm gating
// ---------------------------------------------------------------------------

describe('DS-20 the confirm control is disabled until an option, a payment method, a complete address and a billing name are all present', () => {
  it('the button stays disabled after each of the four steps and enables only after the fourth', () => {
    const fixture = createFixture();
    const fields = fixture.componentInstance.fields();

    expect(confirmButton(fixture).disabled).toBe(true);

    selectDelivery(fixture, 'home_delivery');
    expect(confirmButton(fixture).disabled).toBe(true);

    fillHomeAddress(fixture);
    expect(confirmButton(fixture).disabled).toBe(true);

    selectPayment(fixture, 'card');
    expect(confirmButton(fixture).disabled).toBe(true);

    fields.billingName().value.set('Teszt Elek');
    fixture.detectChanges();
    expect(confirmButton(fixture).disabled).toBe(false);
  });
});

describe('DS-21 an invalid postal code keeps the confirm control disabled', () => {
  it('postal code 0511 leaves the button disabled; 1051 enables it', () => {
    const fixture = createFixture();
    selectDelivery(fixture, 'home_delivery');
    const fields = fixture.componentInstance.fields();

    fields.address.postalCode().value.set('0511');
    fields.address.city().value.set('Budapest');
    fields.address.line1().value.set('Fő utca 1.');
    fields.address.line2().value.set('');
    selectPayment(fixture, 'card');
    fields.billingName().value.set('Teszt Elek');
    fixture.detectChanges();

    expect(confirmButton(fixture).disabled).toBe(true);

    fields.address.postalCode().value.set('1051');
    fixture.detectChanges();
    expect(confirmButton(fixture).disabled).toBe(false);
  });
});

describe('DS-22 an incomplete billing address keeps the confirm control disabled while those fields are shown', () => {
  it('pickup with empty billing city disables the button; filling it enables it', () => {
    const fixture = createFixture();
    selectDelivery(fixture, 'pickup_point');
    const fields = fixture.componentInstance.fields();

    selectPayment(fixture, 'card');
    fields.billingName().value.set('Teszt Elek');
    fields.billingAddress.postalCode().value.set('1051');
    fields.billingAddress.line1().value.set('Fő utca 1.');
    fields.billingAddress.line2().value.set('');
    fixture.detectChanges();

    expect(confirmButton(fixture).disabled).toBe(true);

    fields.billingAddress.city().value.set('Budapest');
    fixture.detectChanges();
    expect(confirmButton(fixture).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DS-23 / DS-24 — confirm mirrors the choice into the field tree and emits
// ---------------------------------------------------------------------------

describe('DS-23 confirming mirrors the chosen option id and payment method into the shared field tree', () => {
  it('a valid home_delivery + card confirm writes both ids back to fields', () => {
    const fixture = createFixture();
    selectDelivery(fixture, 'home_delivery');
    fillHomeAddress(fixture);
    selectPayment(fixture, 'card');
    const fields = fixture.componentInstance.fields();
    fields.billingName().value.set('Teszt Elek');
    fixture.detectChanges();

    confirmButton(fixture).click();
    fixture.detectChanges();

    expect(fields.deliveryOptionId().value()).toBe('home_delivery');
    expect(fields.paymentMethod().value()).toBe('card');
  });
});

describe('DS-24 confirming emits continueRequested exactly once and nothing else', () => {
  it('emits once on a valid confirm and zero times on an invalid confirm', () => {
    const validFixture = createFixture();
    selectDelivery(validFixture, 'home_delivery');
    fillHomeAddress(validFixture);
    selectPayment(validFixture, 'card');
    const validFields = validFixture.componentInstance.fields();
    validFields.billingName().value.set('Teszt Elek');
    validFixture.detectChanges();

    let validEmissions = 0;
    validFixture.componentInstance.continueRequested.subscribe(() => {
      validEmissions += 1;
    });
    confirmButton(validFixture).click();
    expect(validEmissions).toBe(1);

    const invalidFixture = createFixture();
    let invalidEmissions = 0;
    invalidFixture.componentInstance.continueRequested.subscribe(() => {
      invalidEmissions += 1;
    });
    confirmButton(invalidFixture).click();
    expect(invalidEmissions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DS-25 / DS-26 — save states
// ---------------------------------------------------------------------------

describe('DS-25 the loading save state disables the confirm control and shows its loading label', () => {
  it('loading renders Mentés… on a disabled button; idle renders Tovább az ellenőrzéshez and no error banner', () => {
    const loadingFixture = createFixture();
    loadingFixture.componentRef.setInput('saveState', 'loading');
    loadingFixture.detectChanges();

    const loadingButton = confirmButton(loadingFixture);
    expect(loadingButton.disabled).toBe(true);
    expect(loadingButton.textContent).toContain('Mentés…');

    const idleFixture = createFixture();
    const idleRoot = getRootElement(idleFixture);
    const idleButton = confirmButton(idleFixture);
    expect(idleButton.textContent).toContain('Tovább az ellenőrzéshez');
    expect(queryElement(idleRoot, '[data-testid="delivery-save-failure"]')).toBeNull();
  });
});

describe('DS-26 the error save state renders the fixed failure sentence and a retry control that emits retryOptions', () => {
  it('error renders the failure sentence; pressing the retry button emits retryOptions once', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('saveState', 'error');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const banner = getElement(root, '[data-testid="delivery-save-failure"]');
    expect(banner.textContent).toContain('A mentés sikertelen. Próbáld újra.');

    let retries = 0;
    fixture.componentInstance.retryOptions.subscribe(() => {
      retries += 1;
    });

    const retryHost = getElement(root, '[data-testid="delivery-retry"]');
    const retryButton = getElement(retryHost, 'button');
    retryButton.click();
    fixture.detectChanges();

    expect(retries).toBe(1);
  });
});
