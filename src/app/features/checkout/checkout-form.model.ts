/**
 * T19 — checkout Signal Forms model and schema.
 *
 * `CheckoutFormModel` is the in-memory shape that backs the Signal
 * Forms FieldTree used by the wizard. The schema bound to this model
 * is the single source of truth for form validity — there is no
 * parallel `FormGroup`, no `BehaviorSubject`, no manual flag
 * flipping.
 *
 * The model is deliberately wider than the wire payload:
 *
 *   - `deliveryOptionId` accepts an empty string while the user has
 *     not picked one; the schema treats the empty value as "required
 *     and missing".
 *   - `address.line2` is optional on the wire but always present in
 *     the model; `normalizeCheckoutForm` (T08's helpers) handles the
 *     "undefined vs empty string" distinction.
 *   - The billing block mirrors the delivery address shape so a single
 *     set of address rules applies to both, and `billingSameAsDelivery`
 *     hides the billing address when the shopper picked the same
 *     address for both.
 *
 * Hidden fields (`address` when the delivery option is `pickup_point`,
 * and `billingAddress` when `billingSameAsDelivery` is true) are
 * excluded from the parent's `valid`/`invalid` aggregate, which keeps
 * the page responsive without a separate "is pickup?" branch in every
 * validator.
 */

import type { PathKind } from '@angular/forms/signals';
import {
  type FieldTree,
  type SchemaFn,
  type SchemaPathTree,
  email,
  form,
  pattern,
  required,
  validate,
  hidden,
} from '@angular/forms/signals';
import type { WritableSignal } from '@angular/core';
import type { DeliveryOptionId as GeneratedDeliveryOptionId } from '../../api/generated/models/delivery-option-id';
import type { PaymentMethodId as GeneratedPaymentMethodId } from '../../api/generated/models/payment-method-id';
import type { CheckoutSession } from '../../api/generated/models/checkout-session';
import { PHONE_INTERNATIONAL } from './contact.schema';

/** Allowed delivery option ids (matches the generated OpenAPI union plus
 *  the empty initial value). */
export type DeliveryOptionId = GeneratedDeliveryOptionId | '';

/** Allowed payment method ids (matches the generated OpenAPI union plus
 *  the empty initial value). */
export type PaymentMethod = GeneratedPaymentMethodId | '';

/**
 * Address section model. Only `countryCode: 'HU'` is accepted per
 * the wire schema; the helper type keeps the empty-string initial
 * state out of the validators so the field starts untouched.
 */
export interface CheckoutFormAddress {
  countryCode: 'HU';
  postalCode: string;
  city: string;
  line1: string;
  line2: string;
}

/**
 * Single in-memory shape that owns the checkout form state.
 * Mutations go through Signal Forms `FieldState.value.set(...)` so
 * the schema re-evaluates validity on every change.
 */
export interface CheckoutFormModel {
  fullName: string;
  email: string;
  phone: string;
  deliveryOptionId: DeliveryOptionId;
  address: CheckoutFormAddress;
  paymentMethod: PaymentMethod;
  billingName: string;
  billingSameAsDelivery: boolean;
  billingAddress: CheckoutFormAddress;
}

/** Re-exported under the historical name; the rule itself lives in contact.schema.ts. */
export const PHONE_PATTERN = PHONE_INTERNATIONAL;

/** HU postal code regex shared between the schema and the tests. */
export const POSTAL_CODE_PATTERN = /^[1-9][0-9]{3}$/;

/**
 * Builds a fresh empty model so each checkout session starts from
 * the same deterministic shape.
 */
export function createInitialCheckoutFormModel(): CheckoutFormModel {
  return {
    fullName: '',
    email: '',
    phone: '',
    deliveryOptionId: '',
    address: {
      countryCode: 'HU',
      postalCode: '',
      city: '',
      line1: '',
      line2: '',
    },
    paymentMethod: '',
    billingName: '',
    billingSameAsDelivery: true,
    billingAddress: {
      countryCode: 'HU',
      postalCode: '',
      city: '',
      line1: '',
      line2: '',
    },
  };
}

/**
 * Schema bound to the form model. The rules below mirror the wire
 * constraints in `src/mocks/checkout/validate-checkout.ts` so the
 * client never advertises a value the mock would reject. Hidden
 * fields (the address when `deliveryOptionId === 'pickup_point'`, and
 * the billing address when `billingSameAsDelivery` is true) are
 * automatically excluded from validity aggregation.
 *
 * Custom `validate` calls back into pure helpers rather than
 * referencing the mock domain so the same schema runs in a
 * browser-only test as it does behind the MSW worker.
 */
export const checkoutFormSchema: SchemaFn<CheckoutFormModel> = (path) => {
  required(path.fullName, { message: 'A név megadása kötelező.' });
  required(path.email, { message: 'Az e-mail megadása kötelező.' });
  email(path.email, { message: 'Érvénytelen e-mail cím.' });
  required(path.phone, { message: 'A telefonszám megadása kötelező.' });
  pattern(path.phone, PHONE_PATTERN, {
    message: 'A telefonszám +36 prefixumú, 8-9 számjegy.',
  });

  required(path.deliveryOptionId, {
    message: 'Válassz szállítási módot.',
  });

  // Address is required when the user picked `home_delivery`; hidden
  // when `pickup_point` so its emptiness does not contribute to the
  // page's `valid()` aggregate. The `when` callback receives the
  // child field's context, so `value` is the address signal — we
  // must read the sibling `deliveryOptionId` via `valueOf`.
  hidden(path.address, {
    when: (ctx) => ctx.valueOf(path.deliveryOptionId) !== 'home_delivery',
  });
  applyAddressRules(path.address);

  required(path.paymentMethod, {
    message: 'Válassz fizetési módot.',
  });

  // Billing block. The address is hidden when the shopper copies the
  // delivery address, so its emptiness does not contribute to the
  // page's `valid()` aggregate.
  required(path.billingName, { message: 'A számlázási név megadása kötelező.' });

  hidden(path.billingAddress, {
    when: (ctx) => ctx.valueOf(path.billingSameAsDelivery),
  });
  applyAddressRules(path.billingAddress);
};

/**
 * Applies the seven shared address rules to a path. Both the delivery
 * address (`path.address`) and the billing address
 * (`path.billingAddress`) use the same wire-level constraints
 * (`Address` in openapi.yaml: `postalCode` 1-9 + 3 digits, `city`
 * 2..80, `line1` 3..120, `line2` optional up to 120), so the rules
 * live in one place and stay in lock-step when the contract moves.
 *
 * The path type is inferred at the call site so the generic child
 * `PathKind` parameter that `SchemaPath` requires stays correct
 * without a hand-written annotation.
 */
function applyAddressRules(path: SchemaPathTree<CheckoutFormAddress, PathKind.Child>): void {
  required(path.postalCode, {
    message: 'Az irányítószám megadása kötelező.',
  });
  pattern(path.postalCode, POSTAL_CODE_PATTERN, {
    message: 'Az irányítószám formátuma 1-9 kezdetű négyjegyű szám.',
  });
  required(path.city, {
    message: 'A település megadása kötelező.',
  });
  validate(path.city, ({ value }) => {
    const trimmed = value().trim();
    return trimmed.length >= 2 && trimmed.length <= 80
      ? null
      : {
          kind: 'addressCity',
          message: 'A település 2 és 80 karakter közé eshet.',
        };
  });
  required(path.line1, {
    message: 'A cím első sora kötelező.',
  });
  validate(path.line1, ({ value }) => {
    const trimmed = value().trim();
    return trimmed.length >= 3 && trimmed.length <= 120
      ? null
      : {
          kind: 'addressLine1',
          message: 'A cím első sora 3 és 120 karakter közé eshet.',
        };
  });
  validate(path.line2, ({ value }) => {
    const v = value();
    if (v.length === 0) return null;
    return v.trim().length <= 120
      ? null
      : {
          kind: 'addressLine2',
          message: 'A cím második sora legfeljebb 120 karakter lehet.',
        };
  });
}

/**
 * Builds the Signal Forms FieldTree from a writable model signal.
 * The caller (the facade) owns the signal so the form value can be
 * read by both the UI binding and the wire-replay helpers.
 */
export function buildCheckoutForm(
  model: WritableSignal<CheckoutFormModel>,
): FieldTree<CheckoutFormModel> {
  return form(model, checkoutFormSchema);
}

/** The Signal Forms field tree the CheckoutFacade owns. `components.md:570`
 *  names this type `CheckoutFieldTree`; it is the return type of
 *  `buildCheckoutForm` under the name the specification uses. */
export type CheckoutFieldTree = FieldTree<CheckoutFormModel>;

/** The spec's own shape (components.md:7 — "Shared types"): the four
 *  optional draft fields out of the six `CheckoutFacade.session()`
 *  carries. Structural typing lets a full `CheckoutSession` bind
 *  directly to a `[draft]` input typed this way — the extra fields on
 *  the wider type are simply ignored. */
export type CheckoutDraft = Pick<CheckoutSession, 'contact' | 'billing' | 'delivery' | 'payment'>;
