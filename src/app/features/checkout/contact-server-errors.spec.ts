/**
 * `toContactFieldErrors` mapping the wire's `FieldError[]`
 * (the ones `PATCH /checkout` answers 422 with) onto the local
 * `ContactFieldKey` map `ContactStep` reads. The mapper strips the
 * `/contact` JSONpointer prefix, ignores errors from outside the
 * contact section, and translates the server's machine codes into
 * the Hungarian sentences the contact form already renders for the
 * same cases (e-mail and phone).
 */

import { describe, expect, it } from 'vitest';

import { toContactFieldErrors } from './contact-server-errors';

import type { FieldError as WireFieldError } from '../../api/generated/models/field-error';

describe('toContactFieldErrors — wire → local field map', () => {
  it('maps a /contact/email wire error onto email with the schema email message', () => {
    const errors: WireFieldError[] = [{ path: '/contact/email', code: 'EMAIL_FORMAT' }];
    expect(toContactFieldErrors(errors)).toEqual({
      email: [
        {
          code: 'EMAIL_FORMAT',
          message: 'Adj meg egy érvényes e-mail címet.',
          pointer: '/email',
        },
      ],
    });
  });

  it('ignores pointers outside the contact section (no entry is added)', () => {
    const errors: WireFieldError[] = [{ path: '/billing/name', code: 'NAME_LENGTH' }];
    expect(toContactFieldErrors(errors)).toEqual({});
  });

  it('falls back to a generic Hungarian message for an unknown code', () => {
    const errors: WireFieldError[] = [{ path: '/contact/email', code: 'SOMETHING_NEW' }];
    const out = toContactFieldErrors(errors);
    expect(out.email).toHaveLength(1);
    expect(out.email?.[0]?.code).toBe('SOMETHING_NEW');
    expect(out.email?.[0]?.message).toBe('Ellenőrizd a mező értékét.');
    expect(out.email?.[0]?.pointer).toBe('/email');
  });

  it('lands two errors on two different keys', () => {
    const errors: WireFieldError[] = [
      { path: '/contact/fullName', code: 'FULL_NAME_LENGTH' },
      { path: '/contact/phone', code: 'PHONE_FORMAT' },
    ];
    const out = toContactFieldErrors(errors);
    expect(Object.keys(out).sort()).toEqual(['fullName', 'phone']);
    expect(out.fullName?.[0]?.message).toBe('Add meg a teljes neved (2–100 karakter).');
    expect(out.fullName?.[0]?.pointer).toBe('/fullName');
    expect(out.phone?.[0]?.message).toBe(
      'Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
    );
    expect(out.phone?.[0]?.pointer).toBe('/phone');
  });
});
