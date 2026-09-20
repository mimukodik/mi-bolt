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
 *   - The two consent booleans (`acceptedTerms`,
 *     `acknowledgedSimulation`) live in the same model so the review
 *     step can disable the final submit button until both are true.
 *
 * Hidden fields (`address` when the delivery option is `demo_pickup`)
 * are excluded from the parent's `valid`/`invalid` aggregate, which
 * keeps the delivery page responsive without a separate "is pickup?"
 * branch in every validator.
 */

import {
  type FieldTree,
  type SchemaFn,
  email,
  form,
  pattern,
  required,
  validate,
  hidden,
} from '@angular/forms/signals';
import type { WritableSignal } from '@angular/core';
import type { CheckoutSession } from '../../api/generated/models/checkout-session';
import { PHONE_INTERNATIONAL } from './contact.schema';

/**
Allowed delivery option ids (matches OpenAPI `optionId` enum).
*/
export type DeliveryOptionId = 'home_delivery' | 'demo_pickup' | '';

/**
Allowed payment method ids (matches OpenAPI `paymentMethod` enum).
*/
export type PaymentMethod = 'demo_card' | 'demo_cod' | '';

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
  acceptedTerms: boolean;
  acknowledgedSimulation: boolean;
}

/**
Re-exported under the historical name; the rule itself lives in contact.schema.ts.
*/
export const PHONE_PATTERN = PHONE_INTERNATIONAL;

/**
HU postal code regex shared between the schema and the tests.
*/
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
    acceptedTerms: false,
    acknowledgedSimulation: false,
  };
}

/**
 * Hydrates the in-memory form model from the persisted
 * CheckoutSession snapshot returned by `getCheckoutSession`. The
 * facade calls this after a successful `loadSession(cartId)` so
 * the user lands on a step with their previously entered values
 * visible — except when they explicitly reload, in which case the
 * `CheckoutFacade.resetDraft()` path runs first and clears them
 * (privacy rule from the spec).
 *
 * Sections (delivery, paymentMethod) absent from the snapshot are
 * preserved from `base` rather than reset to ''. The `updateDraft`
 * mock merges only the supplied sections, so a save that PUTs one
 * section returns a session that omits the others — wiping those
 * fields would force the user to retype values the previous
 * selection already set. The same rule covers sub-fields inside a
 * present section: `paymentMethod` on the wire is a scalar so
 * `undefined`/`null` mean "not present in this response" and the
 * base value is kept.
 */
export function hydrateCheckoutFormModel(
  base: CheckoutFormModel,
  snapshot: {
    contact?: { fullName?: string; email?: string; phone?: string };
    delivery?: {
      optionId?: 'home_delivery' | 'demo_pickup';
      address?: {
        countryCode?: 'HU';
        postalCode?: string;
        city?: string;
        line1?: string;
        line2?: string;
      };
    };
    paymentMethod?: 'demo_card' | 'demo_cod' | null;
  },
): CheckoutFormModel {
  const next: CheckoutFormModel = { ...base };
  if (snapshot.delivery !== undefined) {
    if (snapshot.delivery.optionId !== undefined) {
      next.deliveryOptionId = snapshot.delivery.optionId;
    }
    if (snapshot.delivery.address !== undefined) {
      next.address = {
        countryCode: 'HU',
        postalCode: snapshot.delivery.address.postalCode ?? '',
        city: snapshot.delivery.address.city ?? '',
        line1: snapshot.delivery.address.line1 ?? '',
        line2: snapshot.delivery.address.line2 ?? '',
      };
    }
  }
  if (snapshot.paymentMethod !== undefined && snapshot.paymentMethod !== null) {
    next.paymentMethod = snapshot.paymentMethod;
  }
  if (snapshot.contact) {
    // Sub-fields inside a present `contact` follow the same
    // "preserve base on absence" rule the delivery / paymentMethod
    // branches apply. A PUT that round-trips only one field (e.g.
    // phone) returns a session whose other contact sub-fields are
    // absent; wiping them would force the user to retype values
    // they already entered.
    if (snapshot.contact.fullName !== undefined) {
      next.fullName = snapshot.contact.fullName;
    }
    if (snapshot.contact.email !== undefined) {
      next.email = snapshot.contact.email;
    }
    if (snapshot.contact.phone !== undefined) {
      next.phone = snapshot.contact.phone;
    }
  }
  return next;
}

/**
 * Schema bound to the form model. The rules below mirror the wire
 * constraints in `src/mocks/checkout/validate-checkout.ts` so the
 * client never advertises a value the mock would reject. Hidden
 * fields (the address when `deliveryOptionId === 'demo_pickup'`) are
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
  // when `demo_pickup` so its emptiness does not contribute to the
  // page's `valid()` aggregate. The `when` callback receives the
  // child field's context, so `value` is the address signal — we
  // must read the sibling `deliveryOptionId` via `valueOf`.
  hidden(path.address, {
    when: (context) => context.valueOf(path.deliveryOptionId) !== 'home_delivery',
  });

  required(path.address.postalCode, {
    message: 'Az irányítószám megadása kötelező.',
  });
  pattern(path.address.postalCode, POSTAL_CODE_PATTERN, {
    message: 'Az irányítószám formátuma 1-9 kezdetű négyjegyű szám.',
  });
  required(path.address.city, {
    message: 'A település megadása kötelező.',
  });
  validate(path.address.city, ({ value }) =>
    value().trim().length >= 2 && value().trim().length <= 80
      ? null
      : {
          kind: 'addressCity',
          message: 'A település 2 és 80 karakter közé eshet.',
        },
  );
  required(path.address.line1, {
    message: 'A cím első sora kötelező.',
  });
  validate(path.address.line1, ({ value }) =>
    value().trim().length >= 3 && value().trim().length <= 120
      ? null
      : {
          kind: 'addressLine1',
          message: 'A cím első sora 3 és 120 karakter közé eshet.',
        },
  );
  validate(path.address.line2, ({ value }) => {
    const v = value();
    if (v.length === 0) return null;
    return v.trim().length <= 120
      ? null
      : {
          kind: 'addressLine2',
          message: 'A cím második sora legfeljebb 120 karakter lehet.',
        };
  });

  required(path.paymentMethod, {
    message: 'Válassz fizetési módot.',
  });

  validate(path.acceptedTerms, ({ value }) =>
    value()
      ? null
      : {
          kind: 'mustAcceptTerms',
          message: 'A demo feltételek elfogadása kötelező.',
        },
  );
  validate(path.acknowledgedSimulation, ({ value }) =>
    value()
      ? null
      : {
          kind: 'mustAcknowledgeSimulation',
          message: 'A szimuláció tudomásulvétele kötelező.',
        },
  );
};

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

/** The spec's own shape (components.md:7 — "Shared types"): the three
 *  optional draft fields out of the six `CheckoutFacade.session()`
 *  carries. Structural typing lets a full `CheckoutSession` bind
 *  directly to a `[draft]` input typed this way — the extra fields on
 *  the wider type are simply ignored. */
export type CheckoutDraft = Pick<CheckoutSession, 'contact' | 'delivery' | 'paymentMethod'>;
