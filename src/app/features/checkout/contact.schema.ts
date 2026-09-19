/**
 * T20 — pure validation and normalization for the contact step.
 *
 * No Angular dependency: the schema is the contract the Signal Form
 * in `contact-step.ts` is wired against and is exercised directly by
 * `tests/contact-step.spec.ts`. Hungarian error messages are the
 * user-visible copy; everything else stays English to match the rest
 * of the codebase.
 *
 *   - fullName: trimmed length 2..100.
 *   - email:    trimmed length ≤ 254, RFC 5322 subset.
 *   - phone:    Hungarian E.164 form: "+36" + 8-9 national digits.
 *               Spaces, hyphens, parentheses, the "00" international
 *               prefix and the leading "0" of a national number are
 *               normalized away before validation.
 *
 * The schema also owns the JSONpointer → field mapping the
 * checkout facade (T19) will reuse when it surfaces 422 server errors.
 */

export type ContactFieldKey = 'fullName' | 'email' | 'phone';

export const CONTACT_NAME_MIN = 2;
export const CONTACT_NAME_MAX = 100;
export const CONTACT_EMAIL_MAX = 254;
export const CONTACT_PHONE_NATIONAL_DIGITS_MIN = 8;
export const CONTACT_PHONE_NATIONAL_DIGITS_MAX = 9;

export interface ContactInput {
  fullName: string;
  email: string;
  phone: string;
}

export interface ContactValidationError {
  readonly field: ContactFieldKey;
  readonly code: 'required' | 'tooShort' | 'tooLong' | 'invalidFormat' | 'invalidPhone';
  readonly message: string;
}

export interface ContactValidationResult {
  readonly ok: boolean;
  readonly errors: readonly ContactValidationError[];
}

export interface NormalizedContact {
  fullName: string;
  email: string;
  phone: string;
}

export const EMAIL_RFC5322_SUBSET = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export const PHONE_INTERNATIONAL = /^\+36\d{8,9}$/;

export function pointerToFieldKey(pointer: string): ContactFieldKey | null {
  if (pointer === '/fullName') return 'fullName';
  if (pointer === '/email') return 'email';
  if (pointer === '/phone') return 'phone';
  return null;
}

export function normalizeContact(input: ContactInput): NormalizedContact {
  const fullName = input.fullName.trim().replace(/\s+/g, ' ');
  const email = input.email.trim();
  const phone = normalizePhone(input.phone);
  return { fullName, email, phone };
}

export function normalizePhone(raw: string): string {
  const stripped = raw.trim().replace(/[\s\-()]/g, '');
  if (stripped.length === 0) return '';
  if (stripped.startsWith('+36')) return stripped;
  if (stripped.startsWith('0036')) return '+36' + stripped.slice(4);
  if (stripped.startsWith('06')) return '+36' + stripped.slice(2);
  if (/^0\d+$/.test(stripped)) return '+36' + stripped.slice(1);
  if (/^36\d+$/.test(stripped)) return '+' + stripped;
  return stripped;
}

export function validateContact(input: ContactInput): ContactValidationResult {
  const errors: ContactValidationError[] = [];

  const trimmedName = input.fullName.trim();
  if (trimmedName.length === 0) {
    errors.push({
      field: 'fullName',
      code: 'required',
      message: 'A teljes név kötelező.',
    });
  } else if (trimmedName.length < CONTACT_NAME_MIN) {
    errors.push({
      field: 'fullName',
      code: 'tooShort',
      message: 'Add meg a teljes neved (legalább 2 karakter).',
    });
  } else if (trimmedName.length > CONTACT_NAME_MAX) {
    errors.push({
      field: 'fullName',
      code: 'tooLong',
      message: 'A teljes név legfeljebb 100 karakter lehet.',
    });
  }

  const trimmedEmail = input.email.trim();
  if (trimmedEmail.length === 0) {
    errors.push({
      field: 'email',
      code: 'required',
      message: 'Az e-mail cím kötelező.',
    });
  } else if (trimmedEmail.length > CONTACT_EMAIL_MAX) {
    errors.push({
      field: 'email',
      code: 'tooLong',
      message: 'Az e-mail cím legfeljebb 254 karakter lehet.',
    });
  } else if (!EMAIL_RFC5322_SUBSET.test(trimmedEmail)) {
    errors.push({
      field: 'email',
      code: 'invalidFormat',
      message: 'Adj meg egy érvényes e-mail címet.',
    });
  }

  const normalizedPhone = normalizePhone(input.phone);
  if (normalizedPhone.length === 0) {
    errors.push({
      field: 'phone',
      code: 'required',
      message: 'A telefonszám kötelező.',
    });
  } else if (!PHONE_INTERNATIONAL.test(normalizedPhone)) {
    errors.push({
      field: 'phone',
      code: 'invalidPhone',
      message: 'Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
    });
  }

  return { ok: errors.length === 0, errors };
}
