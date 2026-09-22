/**
 * T21 — AddressForm (S4.3), rewritten for MIM-212 S3-C4 review fix round 1.
 *
 * Owned by the parent (`DeliveryStep`) via two-way `model()` bindings; field
 * rules mirror the wire (postalCode, city, line1, line2, country `HU`).
 * `pointerBase`/`legend` let one instance serve the delivery address and
 * another serve billing, each with its own pointers and element ids —
 * previously both shared `address-postalCode-message` and delivery
 * pointers (MIM-212 S3-C4 review finding).
 */

import { Component, computed, input, model, signal, type WritableSignal } from '@angular/core';

import {
  FormFieldMessage,
  type FieldError,
} from '../../shared/ui/form-field-message/form-field-message';
import { isHTMLInputElement } from '../../shared/utils/event-target';

type AddressField = 'postalCode' | 'city' | 'line1' | 'line2';
const FIELDS: readonly AddressField[] = ['postalCode', 'city', 'line1', 'line2'] as const;

const POSTAL_CODE_PATTERN = /^[1-9][0-9]{3}$/;
const ALL_TOUCHED: Record<AddressField, boolean> = {
  postalCode: true,
  city: true,
  line1: true,
  line2: true,
};
const ALL_UNTOUCHED: Record<AddressField, boolean> = {
  postalCode: false,
  city: false,
  line1: false,
  line2: false,
};

/** Validates a single trimmed field value against the wire rules;
 *  `null` means valid. */
function validateField(
  field: AddressField,
  value: string,
): { code: string; message: string } | null {
  switch (field) {
    case 'postalCode':
      if (value.length === 0)
        return { code: 'required', message: 'Az irányítószám megadása kötelező.' };
      if (!POSTAL_CODE_PATTERN.test(value)) {
        return {
          code: 'pattern',
          message: 'Az irányítószám formátuma 4 számjegy, 1-es vagy 9-es kezdettel.',
        };
      }
      return null;
    case 'city':
      if (value.length === 0) return { code: 'required', message: 'A város megadása kötelező.' };
      if (value.length < 2 || value.length > 80)
        return { code: 'length', message: 'A város 2–80 karakter hosszú lehet.' };
      return null;
    case 'line1':
      if (value.length === 0) return { code: 'required', message: 'A cím megadása kötelező.' };
      if (value.length < 3 || value.length > 120)
        return { code: 'length', message: 'A cím 3–120 karakter hosszú lehet.' };
      return null;
    case 'line2':
      if (value.length === 0) return null;
      if (value.length > 120)
        return { code: 'length', message: 'Az emelet/ajtó legfeljebb 120 karakter lehet.' };
      return null;
  }
}

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
  /** Surfaces errors even on unfocused fields once the parent submits. */
  readonly submitted = model<boolean>(false);

  /** JSON-pointer base for `FieldError.pointer`, and this instance's element id prefix. */
  readonly pointerBase = input<string>('/delivery/address');
  /** Rendered as `<legend>` when not null; billing passes `null` (its fieldset has a heading). */
  readonly legend = input<string | null>('Szállítási cím');

  readonly idPrefix = computed(() =>
    this.pointerBase()
      .split('/')
      .filter((s) => s.length > 0)
      .join('-'),
  );

  readonly countryCode = 'HU';
  readonly countryLabel = 'HU – Magyarország';

  private readonly touchedInternal = signal<Record<AddressField, boolean>>(ALL_UNTOUCHED);
  private readonly models: Record<AddressField, WritableSignal<string>> = {
    postalCode: this.postalCode,
    city: this.city,
    line1: this.line1,
    line2: this.line2,
  };

  readonly isComplete = computed<boolean>(() =>
    FIELDS.every((field) => this.errors(field).length === 0),
  );

  errors(field: AddressField): readonly FieldError[] {
    const result = validateField(field, this.models[field]().trim());
    if (result === null) return [];
    return [{ ...result, pointer: `${this.pointerBase()}/${field}` }];
  }

  /** `aria-invalid` is gated on touched/submitted: the message under
   *  the field already uses the same gate, and the border rule keys
   *  off `[aria-invalid='true']`. A pristine required field stays
   *  idle until the shopper has either left it or the parent has
   *  submitted. The validators themselves stay as they are; this
   *  only decides when the value is announced and painted. */
  showsInvalid(field: AddressField): boolean {
    return this.errors(field).length > 0 && (this.isTouched(field) || this.submitted());
  }

  fieldId(field: AddressField): string {
    return `${this.idPrefix()}-${field}`;
  }

  describedBy(field: AddressField): string {
    return `${this.fieldId(field)}-message`;
  }

  isTouched(field: AddressField): boolean {
    return this.touchedInternal()[field];
  }

  markTouched(field: AddressField): void {
    this.touchedInternal.update((touched) => ({ ...touched, [field]: true }));
  }

  markAllTouched(): void {
    this.touchedInternal.set(ALL_TOUCHED);
    this.submitted.set(true);
  }

  resetTouched(): void {
    this.touchedInternal.set(ALL_UNTOUCHED);
    this.submitted.set(false);
  }

  onInput(field: AddressField, event: Event): void {
    if (!isHTMLInputElement(event.target)) return;
    this.models[field].set(event.target.value);
  }
}
