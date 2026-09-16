/**
 * T21 — AddressForm (S4.3).
 *
 * Renders the home-delivery address inputs. The form is purely
 * presentational: every value is owned by the parent `DeliveryStep`
 * via two-way `model()` bindings so the parent can decide whether
 * to attach the address to the payload (`home_delivery`) or strip
 * it (`demo_pickup`).
 *
 * Field rules — pinned here so the schema cannot drift between the
 * UI and the wire:
 *
 *   - postalCode: ^[1-9][0-9]{3}$ — four digits, leading digit 1..9
 *   - city:       2..80 trimmed characters, NFC-normalized
 *   - line1:      3..120 trimmed characters
 *   - line2:      optional, 0..120 trimmed characters
 *   - country:    hard-coded to `HU` with a visible Hungarian label
 *                 "HU – Magyarország" so the user always knows the
 *                 address is restricted to Hungary (the demo never
 *                 ships cross-border).
 *
 * Each error is tagged with the matching JSON pointer so the
 * orchestrator can map a 422 server response back to the field
 * (`/delivery/address/postalCode`, etc.).
 *
 * The country field is rendered as plain text inside a paragraph,
 * never as a user-editable control — the rule is fixed by the demo
 * contract.
 */

import { Component, computed, model, signal } from '@angular/core';

import { FormFieldMessage, type FieldError } from '../../shared/ui/form-field-message/form-field-message';

interface AddressLike {
  readonly city: string;
  readonly countryCode: 'HU';
  readonly line1: string;
  readonly line2?: string;
  readonly postalCode: string;
}

const POSTAL_CODE_PATTERN = /^[1-9][0-9]{3}$/;
const COUNTRY_LABEL = 'HU – Magyarország';

@Component({
  selector: 'app-address-form',
  imports: [FormFieldMessage],
  templateUrl: './address-form.html',
  styleUrl: './address-form.scss',
})
export class AddressForm {
  readonly postalCode = model<string>('');
  readonly city = model<string>('');
  readonly line1 = model<string>('');
  readonly line2 = model<string>('');
  /** `true` once the parent tries to advance and field errors should
   *  surface even on fields the user did not focus. */
  readonly submitted = model<boolean>(false);

  private readonly touchedPostalInternal = signal<boolean>(false);
  private readonly touchedCityInternal = signal<boolean>(false);
  private readonly touchedLine1Internal = signal<boolean>(false);
  private readonly touchedLine2Internal = signal<boolean>(false);

  /** Two-way bound to the parent's address state; emitted so the
   *  parent can re-submit on every change. */
  readonly addressChanged = model<AddressLike | null>(null);

  readonly countryCode = computed<'HU'>(() => 'HU');
  readonly countryLabel = computed<string>(() => COUNTRY_LABEL);

  readonly touchedPostal = computed(() => this.touchedPostalInternal());
  readonly touchedCity = computed(() => this.touchedCityInternal());
  readonly touchedLine1 = computed(() => this.touchedLine1Internal());
  readonly touchedLine2 = computed(() => this.touchedLine2Internal());

  readonly postalErrors = computed<readonly FieldError[]>(() => {
    const value = this.postalCode().trim();
    if (value.length === 0) {
      return [{ code: 'required', message: 'Az irányítószám megadása kötelező.', pointer: '/delivery/address/postalCode' }];
    }
    if (!POSTAL_CODE_PATTERN.test(value)) {
      return [{ code: 'pattern', message: 'Az irányítószám formátuma 4 számjegy, 1-es vagy 9-es kezdettel.', pointer: '/delivery/address/postalCode' }];
    }
    return [];
  });

  readonly cityErrors = computed<readonly FieldError[]>(() => {
    const value = this.city().trim();
    if (value.length === 0) {
      return [{ code: 'required', message: 'A város megadása kötelező.', pointer: '/delivery/address/city' }];
    }
    if (value.length < 2 || value.length > 80) {
      return [{ code: 'length', message: 'A város 2–80 karakter hosszú lehet.', pointer: '/delivery/address/city' }];
    }
    return [];
  });

  readonly line1Errors = computed<readonly FieldError[]>(() => {
    const value = this.line1().trim();
    if (value.length === 0) {
      return [{ code: 'required', message: 'A cím megadása kötelező.', pointer: '/delivery/address/line1' }];
    }
    if (value.length < 3 || value.length > 120) {
      return [{ code: 'length', message: 'A cím 3–120 karakter hosszú lehet.', pointer: '/delivery/address/line1' }];
    }
    return [];
  });

  readonly line2Errors = computed<readonly FieldError[]>(() => {
    const value = this.line2().trim();
    if (value.length === 0) return [];
    if (value.length > 120) {
      return [{ code: 'length', message: 'Az emelet/ajtó legfeljebb 120 karakter lehet.', pointer: '/delivery/address/line2' }];
    }
    return [];
  });

  readonly postalDescribedBy = computed(() => 'address-postalCode-message');
  readonly cityDescribedBy = computed(() => 'address-city-message');
  readonly line1DescribedBy = computed(() => 'address-line1-message');
  readonly line2DescribedBy = computed(() => 'address-line2-message');

  readonly isComplete = computed<boolean>(() => {
    return (
      this.postalErrors().length === 0 &&
      this.cityErrors().length === 0 &&
      this.line1Errors().length === 0 &&
      this.line2Errors().length === 0
    );
  });

  /** Snapshot the current input values into the wire-shaped `Address`
   *  object. Returns `null` if the form has any visible error so the
   *  parent never sends a malformed payload. */
  readonly snapshot = computed<AddressLike | null>(() => {
    if (!this.isComplete()) return null;
    const line2 = this.line2().trim();
    return {
      countryCode: 'HU',
      postalCode: this.postalCode().trim(),
      city: this.city().trim(),
      line1: this.line1().trim(),
      ...(line2.length > 0 ? { line2 } : {}),
    };
  });

  markTouched(field: 'postalCode' | 'city' | 'line1' | 'line2'): void {
    switch (field) {
      case 'postalCode':
        this.touchedPostalInternal.set(true);
        return;
      case 'city':
        this.touchedCityInternal.set(true);
        return;
      case 'line1':
        this.touchedLine1Internal.set(true);
        return;
      case 'line2':
        this.touchedLine2Internal.set(true);
        return;
    }
  }

  markAllTouched(): void {
    this.touchedPostalInternal.set(true);
    this.touchedCityInternal.set(true);
    this.touchedLine1Internal.set(true);
    this.touchedLine2Internal.set(true);
    this.submitted.set(true);
  }

  resetTouched(): void {
    this.touchedPostalInternal.set(false);
    this.touchedCityInternal.set(false);
    this.touchedLine1Internal.set(false);
    this.touchedLine2Internal.set(false);
    this.submitted.set(false);
  }

  onPostalInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.postalCode.set(input.value);
    this.propagate();
  }

  onCityInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.city.set(input.value);
    this.propagate();
  }

  onLine1Input(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.line1.set(input.value);
    this.propagate();
  }

  onLine2Input(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.line2.set(input.value);
    this.propagate();
  }

  private propagate(): void {
    this.addressChanged.set(this.snapshot());
  }
}
