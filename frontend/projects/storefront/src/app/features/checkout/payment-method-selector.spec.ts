/**
 * PaymentMethodSelector (S3-F2-2) — the wire-rendered radio list.
 *
 * Renders whatever `PaymentMethodOption[]` the server sends. `label`,
 * `description` and `fee` are wire data, so a real surcharge or a real
 * unavailability sentence flows through unchanged. The component owns
 * the `value` model, the `paymentChanged` output, and the
 * `unavailableSentence` translation; nothing else.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { PaymentMethodSelector } from './payment-method-selector';
import { PriceBlock } from '../../shared/ui/price-block/price-block';

import type { PaymentMethodId } from '@mi-bolt/api/models/payment-method-id';
import type { PaymentMethodOption } from '@mi-bolt/api/models/payment-method-option';

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

function makeOption(
  id: PaymentMethodId,
  overrides: Partial<PaymentMethodOption> = {},
): PaymentMethodOption {
  return {
    id,
    label: id,
    description: '',
    fee: { amount: 0, currency: 'HUF' },
    available: true,
    ...overrides,
  };
}

/** Renders `PaymentMethodSelector` against the given wire options. */
function createFixture(
  options: readonly PaymentMethodOption[],
): ComponentFixture<PaymentMethodSelector> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(PaymentMethodSelector);
  fixture.componentRef.setInput('options', options);
  fixture.detectChanges();
  return fixture;
}

function dispatchChange(radio: HTMLInputElement): void {
  radio.dispatchEvent(new Event('change'));
}

// ---------------------------------------------------------------------------
// PM-01
// ---------------------------------------------------------------------------
describe('PaymentMethodSelector', () => {
  it('renders one radio per wire payment method with its label, description and fee', () => {
    const fixture = createFixture([
      makeOption('card', {
        label: 'Bankkártya',
        description: 'Online kártyás fizetés.',
        fee: { amount: 0, currency: 'HUF' },
      }),
      makeOption('cash_on_delivery', {
        label: 'Utánvét',
        description: 'Készpénzzel vagy kártyával a futárnál.',
        fee: { amount: 490, currency: 'HUF' },
      }),
    ]);
    const root = getRootElement(fixture);

    const optionRows = root.querySelectorAll<HTMLElement>('[data-testid="payment-option"]');
    expect(optionRows.length).toBe(2);

    const cardRow = getElement(root, '#payment-option-card').closest(
      '[data-testid="payment-option"]',
    );
    const codRow = getElement(root, '#payment-option-cash_on_delivery').closest(
      '[data-testid="payment-option"]',
    );
    if (!(cardRow instanceof HTMLElement) || !(codRow instanceof HTMLElement)) {
      throw new Error('Expected the two payment-option rows to be HTMLElements');
    }

    const cardTitle = getElement(cardRow, '.option-title').textContent.trim();
    const codTitle = getElement(codRow, '.option-title').textContent.trim();
    expect(cardTitle).toBe('Bankkártya');
    expect(codTitle).toBe('Utánvét');

    const cardHelper = getElement(cardRow, '.option-helper').textContent.trim();
    const codHelper = getElement(codRow, '.option-helper').textContent.trim();
    expect(cardHelper).toBe('Online kártyás fizetés.');
    expect(codHelper).toBe('Készpénzzel vagy kártyával a futárnál.');

    const cardFee = getElement(cardRow, '[data-testid="price-amount"]').textContent.trim();
    const codFee = getElement(codRow, '[data-testid="price-amount"]').textContent.trim();
    expect(cardFee).toBe(PriceBlock.formatHuf(0));
    expect(codFee).toBe(PriceBlock.formatHuf(490));
  });

  // -------------------------------------------------------------------------
  // PM-01b
  // -------------------------------------------------------------------------
  it('each fee prints the amount alone at the md size, on the title row pushed to its end', () => {
    const fixture = createFixture([
      makeOption('card', { label: 'Bankkártya' }),
      makeOption('cash_on_delivery', {
        label: 'Utánvét',
        fee: { amount: 490, currency: 'HUF' },
      }),
    ]);
    const root = getRootElement(fixture);
    const blocks = Array.from(
      root.querySelectorAll('[data-testid="payment-option"] app-price-block'),
    );
    expect(blocks.length).toBe(2);
    for (const block of blocks) {
      expect(block.querySelector('.label')).toBeNull();
      expect(getElement(block, '.root').getAttribute('data-size')).toBe('md');
      expect(block.parentElement?.classList.contains('justify-between')).toBe(true);
    }
    expect(root.textContent).not.toContain('Fizetési díj');
  });

  // -------------------------------------------------------------------------
  // PM-02
  // -------------------------------------------------------------------------
  it('no payment method is preselected', () => {
    const fixture = createFixture([
      makeOption('card', { label: 'Bankkártya' }),
      makeOption('cash_on_delivery', { label: 'Utánvét' }),
    ]);
    const root = getRootElement(fixture);

    const radios = root.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios.length).toBe(2);
    for (const radio of radios) {
      expect(radio.checked).toBe(false);
    }

    expect(queryElement(root, '[data-testid="payment-selected-badge"]')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // PM-03
  // -------------------------------------------------------------------------
  it('selecting a method checks its radio and renders the selected badge', () => {
    const fixture = createFixture([
      makeOption('card', { label: 'Bankkártya' }),
      makeOption('cash_on_delivery', { label: 'Utánvét' }),
    ]);
    const root = getRootElement(fixture);

    const cardRadio = getInputElement(root, '#payment-option-card');
    const codRadio = getInputElement(root, '#payment-option-cash_on_delivery');
    dispatchChange(cardRadio);
    fixture.detectChanges();

    expect(cardRadio.checked).toBe(true);
    expect(codRadio.checked).toBe(false);

    const badges = root.querySelectorAll<HTMLElement>('[data-testid="payment-selected-badge"]');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent.trim()).toBe('Kiválasztva');
    expect(badges[0].getAttribute('aria-live')).toBe('polite');
  });

  // -------------------------------------------------------------------------
  // PM-04
  // -------------------------------------------------------------------------
  it('selecting a method emits paymentChanged exactly once with its id', () => {
    const fixture = createFixture([
      makeOption('card', { label: 'Bankkártya' }),
      makeOption('cash_on_delivery', { label: 'Utánvét' }),
    ]);

    const emissions: PaymentMethodId[] = [];
    fixture.componentInstance.paymentChanged.subscribe((id) => {
      emissions.push(id);
    });

    const cardRadio = getInputElement(getRootElement(fixture), '#payment-option-card');
    dispatchChange(cardRadio);
    fixture.detectChanges();

    expect(emissions).toEqual(['card']);
    expect(fixture.componentInstance.value()).toBe('card');
  });

  // -------------------------------------------------------------------------
  // PM-05
  // -------------------------------------------------------------------------
  it('re-selecting the method already chosen emits nothing', () => {
    const fixture = createFixture([
      makeOption('card', { label: 'Bankkártya' }),
      makeOption('cash_on_delivery', { label: 'Utánvét' }),
    ]);
    fixture.componentRef.setInput('value', 'card');
    fixture.detectChanges();

    const emissions: PaymentMethodId[] = [];
    fixture.componentInstance.paymentChanged.subscribe((id) => {
      emissions.push(id);
    });

    const cardRadio = getInputElement(getRootElement(fixture), '#payment-option-card');
    dispatchChange(cardRadio);
    fixture.detectChanges();

    expect(emissions.length).toBe(0);
    expect(fixture.componentInstance.value()).toBe('card');
  });

  // -------------------------------------------------------------------------
  // PM-06
  // -------------------------------------------------------------------------
  it('an unavailable method renders a disabled radio carrying its reason', () => {
    const fixture = createFixture([
      makeOption('card', { label: 'Bankkártya' }),
      makeOption('cash_on_delivery', {
        label: 'Utánvét',
        available: false,
        unavailableReason: 'CART_VALUE_TOO_HIGH',
      }),
    ]);
    const root = getRootElement(fixture);

    const codRadio = getInputElement(root, '#payment-option-cash_on_delivery');
    expect(codRadio.disabled).toBe(true);

    const codRow = codRadio.closest('[data-testid="payment-option"]');
    if (!(codRow instanceof HTMLElement)) {
      throw new Error('Expected the cod payment-option row to be an HTMLElement');
    }
    const reason = getElement(codRow, '[data-testid="payment-unavailable-reason"]');
    expect(reason.textContent.trim()).toBe(
      'A kosár értéke meghaladja az ennél az opciónál megengedett összeget.',
    );
  });

  // -------------------------------------------------------------------------
  // PM-07
  // -------------------------------------------------------------------------
  it('selecting an unavailable method changes nothing and emits nothing', () => {
    const fixture = createFixture([
      makeOption('card', { label: 'Bankkártya' }),
      makeOption('cash_on_delivery', {
        label: 'Utánvét',
        available: false,
        unavailableReason: 'CART_VALUE_TOO_HIGH',
      }),
    ]);

    const emissions: PaymentMethodId[] = [];
    fixture.componentInstance.paymentChanged.subscribe((id) => {
      emissions.push(id);
    });

    const codRadio = getInputElement(getRootElement(fixture), '#payment-option-cash_on_delivery');
    dispatchChange(codRadio);
    fixture.detectChanges();

    expect(emissions.length).toBe(0);
    expect(fixture.componentInstance.value()).toBeNull();
    expect(codRadio.checked).toBe(false);
    expect(
      getRootElement(fixture).querySelectorAll('[data-testid="payment-selected-badge"]').length,
    ).toBe(0);
  });

  // -------------------------------------------------------------------------
  // PM-08
  // -------------------------------------------------------------------------
  it('an empty cart disables both methods with the empty-cart sentence', () => {
    const fixture = createFixture([
      makeOption('card', {
        label: 'Bankkártya',
        available: false,
        unavailableReason: 'CART_EMPTY',
      }),
      makeOption('cash_on_delivery', {
        label: 'Utánvét',
        available: false,
        unavailableReason: 'CART_EMPTY',
      }),
    ]);
    const root = getRootElement(fixture);

    const cardRadio = getInputElement(root, '#payment-option-card');
    const codRadio = getInputElement(root, '#payment-option-cash_on_delivery');
    expect(cardRadio.disabled).toBe(true);
    expect(codRadio.disabled).toBe(true);

    const cardRow = cardRadio.closest('[data-testid="payment-option"]');
    const codRow = codRadio.closest('[data-testid="payment-option"]');
    if (!(cardRow instanceof HTMLElement) || !(codRow instanceof HTMLElement)) {
      throw new Error('Expected the two payment-option rows to be HTMLElements');
    }
    const cardReason = getElement(cardRow, '[data-testid="payment-unavailable-reason"]');
    const codReason = getElement(codRow, '[data-testid="payment-unavailable-reason"]');
    expect(cardReason.textContent.trim()).toBe('A kosarad jelenleg üres.');
    expect(codReason.textContent.trim()).toBe('A kosarad jelenleg üres.');
  });

  // -------------------------------------------------------------------------
  // PM-09
  // -------------------------------------------------------------------------
  it('a reason the component does not name falls back to the generic sentence', () => {
    const itemsFixture = createFixture([
      makeOption('card', {
        label: 'Bankkártya',
        available: false,
        unavailableReason: 'NOT_AVAILABLE_FOR_ITEMS',
      }),
    ]);
    const itemsRow = getInputElement(getRootElement(itemsFixture), '#payment-option-card').closest(
      '[data-testid="payment-option"]',
    );
    if (!(itemsRow instanceof HTMLElement)) {
      throw new Error('Expected the card payment-option row to be an HTMLElement');
    }
    expect(
      getElement(itemsRow, '[data-testid="payment-unavailable-reason"]').textContent.trim(),
    ).toBe('A kosaradban lévő termékekhez ez az opció nem elérhető.');

    const absentFixture = createFixture([
      makeOption('card', {
        label: 'Bankkártya',
        available: false,
      }),
    ]);
    const absentRow = getInputElement(
      getRootElement(absentFixture),
      '#payment-option-card',
    ).closest('[data-testid="payment-option"]');
    if (!(absentRow instanceof HTMLElement)) {
      throw new Error('Expected the card payment-option row to be an HTMLElement');
    }
    expect(
      getElement(absentRow, '[data-testid="payment-unavailable-reason"]').textContent.trim(),
    ).toBe('Ez az opció jelenleg nem elérhető.');
  });

  // -------------------------------------------------------------------------
  // PM-10
  // -------------------------------------------------------------------------
  it('describedBy lands on the group fieldset as aria-describedby, and is absent by default', () => {
    const fixture = createFixture([makeOption('card')]);
    const root = getRootElement(fixture);

    const group = getElement(root, '[data-testid="payment-selector"]');
    expect(group.getAttribute('aria-describedby')).toBeNull();

    fixture.componentRef.setInput('describedBy', 'payment-method-message');
    fixture.detectChanges();

    expect(group.getAttribute('aria-describedby')).toBe('payment-method-message');
  });
});
