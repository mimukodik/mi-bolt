import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, required } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';

import { MESSAGES } from './messages';
import { toServerErrors } from './server-errors';

interface TestModel {
  name: string;
  price: number;
  variants: { priceHuf: number }[];
}

/** The small test form whose shape mirrors the admin product form. */
function testForm(): FieldTree<TestModel> {
  return form<TestModel>(
    signal({ name: '', price: 0, variants: [{ priceHuf: 0 }, { priceHuf: 0 }] }),
    (p) => {
      required(p.name, { message: MESSAGES.required });
    },
  );
}

describe('toServerErrors', () => {
  let f: FieldTree<TestModel>;

  beforeEach(() => {
    // `form()` needs an injection context and these cases mount no component.
    f = TestBed.runInInjectionContext(testForm);
  });

  it('walks the JSON pointer onto the array item it names', () => {
    // Fails if server-errors.ts stops resolving the pointer: the error lands on
    // the root instead of `f.variants[1].priceHuf`, and the identity check below
    // fails.
    const errors = toServerErrors(f, [{ path: '/variants/1/priceHuf', code: 'NOTBLANK' }]);

    expect(errors.length).toBe(1);
    expect(errors[0].fieldTree).toBe(f.variants[1].priceHuf);
    expect(errors[0].kind).toBe('server');
    expect(errors[0].message).toBe('Kötelező mező.');
  });

  it('attaches an error to the root when a segment does not resolve', () => {
    // Fails if server-errors.ts throws or drops an unresolvable pointer instead
    // of falling back to the root (`resolve(...) ?? root`).
    const errors = toServerErrors(f, [{ path: '/nincs', code: 'REQUIRED' }]);

    expect(errors.length).toBe(1);
    expect(errors[0].fieldTree).toBe(f);
    expect(errors[0].message).toBe('Kötelező mező.');
  });

  it('falls back to the generic message for an unknown code', () => {
    // Fails if server-errors.ts stops applying SERVER_FIELD_FALLBACK.
    const errors = toServerErrors(f, [{ path: '/name', code: 'SOMETHING_NEW' }]);

    expect(errors[0].message).toBe('Ellenőrizd a mező értékét.');
  });

  it('replaces a placeholder with the param the wire sent', () => {
    // Fails if server-errors.ts stops interpolating `{max}` from `params`.
    const errors = toServerErrors(f, [
      { path: '/name', code: 'VARIANT_ID_TOO_LONG', params: { max: 80 } },
    ]);

    expect(errors[0].message).toBe('A változat azonosítója túl hosszú (legfeljebb 80 karakter).');
  });

  it('keeps the order the wire sent the errors in', () => {
    // Fails if server-errors.ts ever reorders or groups the incoming list.
    const errors = toServerErrors(f, [
      { path: '/name', code: 'REQUIRED' },
      { path: '/variants/1/priceHuf', code: 'NOTBLANK' },
    ]);

    expect(errors.length).toBe(2);
    expect(errors[0].fieldTree).toBe(f.name);
    expect(errors[0].message).toBe('Kötelező mező.');
    expect(errors[1].fieldTree).toBe(f.variants[1].priceHuf);
    expect(errors[1].message).toBe('Kötelező mező.');
  });

  it('returns no error for an empty wire list', () => {
    // Fails if server-errors.ts invents an error where the wire sent none.
    expect(toServerErrors(f, [])).toEqual([]);
  });
});
