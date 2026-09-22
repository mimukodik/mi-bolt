/**
 * MIM-254 — `aria-invalid` is gated on touched/submitted, not on bare validity.
 *
 * The address form's `[attr.aria-invalid]` binding used to read the
 * field's error list directly, so an empty, untouched form already
 * painted every required input red. `app-form-field-message` was
 * already gated, so the message stayed hidden while the border shouted;
 * this file pins the fix that closes the gap.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AddressForm } from './address-form';

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected fixture.nativeElement to be HTMLElement');
  }
  return raw;
}

function getInputElement(parent: Element, testId: string): HTMLInputElement {
  const el = parent.querySelector(`[data-testid="${testId}"]`);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Expected HTMLInputElement with data-testid "${testId}"`);
  }
  return el;
}

function createFixture(): ComponentFixture<AddressForm> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(AddressForm);
  fixture.detectChanges();
  return fixture;
}

describe('MIM-254: a pristine required field is not marked invalid', () => {
  it('every required input carries aria-invalid="false" on an empty, untouched form', () => {
    // The address form uses `'false'` as the false branch of the
    // `[attr.aria-invalid]` binding. A pristine required input must
    // announce "not invalid" rather than "invalid"; the border rule
    // keys off `[aria-invalid='true']` and stays idle until the
    // shopper has either left the field or submitted the form.
    const fixture = createFixture();
    const root = getRootElement(fixture);

    expect(getInputElement(root, 'address-input-postalCode').getAttribute('aria-invalid')).toBe(
      'false',
    );
    expect(getInputElement(root, 'address-input-city').getAttribute('aria-invalid')).toBe('false');
    expect(getInputElement(root, 'address-input-line1').getAttribute('aria-invalid')).toBe('false');
    expect(getInputElement(root, 'address-input-line2').getAttribute('aria-invalid')).toBe('false');
  });
});

describe('MIM-254: blurring an empty required field marks it invalid', () => {
  it('blurring the postal-code input flips its aria-invalid to "true"', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);
    const postalCodeInput = getInputElement(root, 'address-input-postalCode');

    postalCodeInput.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();

    expect(postalCodeInput.getAttribute('aria-invalid')).toBe('true');
  });

  it('blurring the city input flips its aria-invalid to "true"', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);
    const cityInput = getInputElement(root, 'address-input-city');

    cityInput.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();

    expect(cityInput.getAttribute('aria-invalid')).toBe('true');
  });

  it('blurring the street input flips its aria-invalid to "true"', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);
    const line1Input = getInputElement(root, 'address-input-line1');

    line1Input.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();

    expect(line1Input.getAttribute('aria-invalid')).toBe('true');
  });

  it('blurring the empty optional second line leaves it valid', () => {
    const fixture = createFixture();
    const root = getRootElement(fixture);
    const line2Input = getInputElement(root, 'address-input-line2');

    line2Input.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();

    expect(line2Input.getAttribute('aria-invalid')).toBe('false');
  });
});

describe('MIM-254: submitting marks every empty required field invalid', () => {
  it('markAllTouched flips aria-invalid to "true" on every invalid input without any blur', () => {
    // `line2` is optional: an empty value carries no error, so it
    // stays aria-invalid="false". To pin the submitted gate on every
    // field the test owns, line2 is filled with a value past its
    // 120-character length cap so it carries a `length` error.
    const fixture = createFixture();
    fixture.componentInstance.line2.set('A'.repeat(121));
    fixture.componentInstance.markAllTouched();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(getInputElement(root, 'address-input-postalCode').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(getInputElement(root, 'address-input-city').getAttribute('aria-invalid')).toBe('true');
    expect(getInputElement(root, 'address-input-line1').getAttribute('aria-invalid')).toBe('true');
    expect(getInputElement(root, 'address-input-line2').getAttribute('aria-invalid')).toBe('true');
  });
});
