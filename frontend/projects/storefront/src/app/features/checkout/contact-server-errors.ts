/**
 * `ContactServerErrors` and `toContactFieldErrors`.
 *
 * `PATCH /checkout` answers 422 with `fieldErrors` (each `{ path,
 * code, params? }`) on the contact payload, e.g.
 * `{ path: '/contact/email', code: 'EMAIL_FORMAT' }`. The contact
 * page surfaces those errors back on the corresponding form field
 * (the e-mail and phone messages here match `contact.schema.ts`'s
 * own copy, so a wire 422 and a client-side validation show the
 * same sentence).
 *
 * The `ContactStep` component stays the presentational layer: it
 * receives the mapped `ContactFieldErrors` plus the `Contact`
 * values they apply to and shows them until the user edits the
 * field whose value no longer matches the saved one.
 */

import type { Contact } from '../../api/generated/models/contact';
import type { FieldError as WireFieldError } from '../../api/generated/models/field-error';

import type { FieldError } from '../../shared/ui/form-field-message/form-field-message';
import { pointerToFieldKey, type ContactFieldKey } from './contact.schema';

/** Pointer prefix that signals a wire 422 targets the contact
 *  section (e.g. `/contact/email`). Dropping the prefix leaves the
 *  local pointer (`/email`) `contact.schema.ts`'s `pointerToFieldKey`
 *  resolves. */
const CONTACT_PATH_PREFIX = '/contact/';

/**
 * Per-field error list, keyed by `ContactFieldKey`. The wire 422 may
 * carry multiple errors on the same field; they all reach the form
 * field message in declaration order.
 */
export type ContactFieldErrors = Partial<Record<ContactFieldKey, readonly FieldError[]>>;

/**
 * The mapped wire errors plus the `Contact` values they apply to.
 * The values travel with the errors so a server error disappears as
 * soon as the user edits a field: the moment `s.values[key]` differs
 * from `contactFields()[key]().value()`, the step drops that key's
 * server errors.
 */
export interface ContactServerErrors {
  readonly values: Contact;
  readonly errors: ContactFieldErrors;
}

/** Hungarian messages for the machine codes the wire 422 currently
 *  carries for the contact section. The e-mail and phone strings
 *  match `contact.schema.ts`'s own copy so a server error shows the
 *  same sentence a client-side validation does. */
const SERVER_FIELD_MESSAGES: Readonly<Record<string, string>> = {
  FULL_NAME_LENGTH: 'Add meg a teljes neved (2–100 karakter).',
  EMAIL_FORMAT: 'Adj meg egy érvényes e-mail címet.',
  PHONE_FORMAT: 'Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
};

/** Fallback message when a wire code has no Hungarian override yet. */
const SERVER_FIELD_FALLBACK = 'Ellenőrizd a mező értékét.';

/**
 * Maps the wire's `FieldError[]` (the ones `PATCH /checkout` carries
 * on a 422) onto the local `ContactFieldKey` map. Errors whose
 * pointer does not start with `/contact/` (e.g. `/billing/name`) are
 * ignored — `BillingStep` will surface those in its own unit.
 */
export function toContactFieldErrors(errors: readonly WireFieldError[]): ContactFieldErrors {
  const out: Partial<Record<ContactFieldKey, FieldError[]>> = {};
  for (const error of errors) {
    const pointer = error.path.startsWith(CONTACT_PATH_PREFIX)
      ? error.path.slice(CONTACT_PATH_PREFIX.length - 1)
      : error.path;
    const key = pointerToFieldKey(pointer);
    if (key === null) continue;
    const list = out[key] ?? [];
    list.push({
      code: error.code,
      message: SERVER_FIELD_MESSAGES[error.code] ?? SERVER_FIELD_FALLBACK,
      pointer,
    });
    out[key] = list;
  }
  return out;
}
