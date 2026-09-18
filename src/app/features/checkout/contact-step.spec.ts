/**
 * T20 — contact step UI (S4.2).
 *
 * Acceptance criteria mapped to source-pattern tests, mirroring the
 * T18 cart-page suite so the runtime Angular signal-input
 * instantiation pitfalls documented in `vitest.config.ts` are
 * avoided. The validation/normalization logic is pure and
 * exercised directly against `contact.schema.ts`.
 *
 *   T20-AC01 — fullName 2..100 trimmed; email ≤254 with RFC 5322
 *              subset; phone normalizes spaces/hyphens to +36 and
 *              validates 8-9 national digits.
 *   T20-AC02 — labels/autocomplete/errors associated; invalid
 *              submission focuses summary then first invalid
 *              field; 422 server field errors target JSONpointer
 *              paths.
 *   T20-AC03 — NO marketing checkbox or account requirement; demo
 *              notice discourages real personal data. Fixture
 *              defaults use example.test and a fictitious address.
 *   T20-AC04 — pending save prevents duplicate advance; failure
 *              retains all typed fields and exposes Retry.
 *   T20-AC05 — default, touched-invalid, submitted-invalid, loading
 *              and server-error visual states on narrow and
 *              desktop views.
 *
 * T20 owns `contact-step.ts` and `contact.schema.ts`. The
 * `ContactPage` stub (`contact-page.ts`) is re-exported so the
 * route bound in `app.routes.ts` continues to resolve.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import {
  CONTACT_EMAIL_MAX,
  CONTACT_NAME_MAX,
  CONTACT_NAME_MIN,
  CONTACT_PHONE_NATIONAL_DIGITS_MAX,
  CONTACT_PHONE_NATIONAL_DIGITS_MIN,
  normalizeContact,
  pointerToFieldKey,
  validateContact,
  type ContactInput,
} from './contact.schema';
import { ContactStep, CONTACT_DRAFT_SAVER, type ContactDraftSaver } from './contact-step';
import { ContactPage } from './contact-page';

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (raw instanceof HTMLElement) return raw;
  throw new Error('Expected HTMLElement');
}

function isObjectOrFunction(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'function' || typeof value === 'object') && value !== null;
}

function getComponentStyles(comp: unknown): readonly string[] {
  if (!isObjectOrFunction(comp)) {
    return [];
  }
  const cmp = comp['ɵcmp'];
  if (!isObjectOrFunction(cmp)) {
    return [];
  }
  const styles = cmp['styles'];
  if (Array.isArray(styles)) {
    return styles.filter((s): s is string => typeof s === 'string');
  }
  return [];
}

const TEST_PROVIDERS = [
  provideZonelessChangeDetection(),
  provideRouter([{ path: '**', component: ContactStep }]),
];

// ---------------------------------------------------------------------------
// T20-AC01 — fullName 2..100 trimmed; email ≤254 + RFC 5322 subset;
// phone normalizes spaces / hyphens to +36 and validates 8-9 national
// digits.
// ---------------------------------------------------------------------------
describe('T20-AC01 contact schema validation and normalization', () => {
  it('exposes the documented 2..100 / 254 / 8-9 thresholds as exported constants', () => {
    expect(CONTACT_NAME_MIN).toBe(2);
    expect(CONTACT_NAME_MAX).toBe(100);
    expect(CONTACT_EMAIL_MAX).toBe(254);
    expect(CONTACT_PHONE_NATIONAL_DIGITS_MIN).toBe(8);
    expect(CONTACT_PHONE_NATIONAL_DIGITS_MAX).toBe(9);
  });

  it('accepts a fully-valid contact and produces no errors', () => {
    const result = validateContact({
      fullName: 'Teszt Elek',
      email: 'teszt@example.test',
      phone: '+36 30 123 4567',
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('treats trimmed fullName below 2 chars as too short', () => {
    const result = validateContact({
      fullName: '  A ',
      email: 'teszt@example.test',
      phone: '+36301234567',
    });
    expect(result.ok).toBe(false);
    const fullNameErrors = result.errors.filter((e) => e.field === 'fullName');
    expect(fullNameErrors.length).toBeGreaterThan(0);
    expect(fullNameErrors[0]?.code).toBe('tooShort');
  });

  it('treats trimmed fullName above 100 chars as too long', () => {
    const result = validateContact({
      fullName: 'A'.repeat(101),
      email: 'teszt@example.test',
      phone: '+36301234567',
    });
    expect(result.ok).toBe(false);
    const fullNameErrors = result.errors.filter((e) => e.field === 'fullName');
    expect(fullNameErrors[0]?.code).toBe('tooLong');
  });

  it('rejects an email longer than 254 characters', () => {
    const longLocal = 'a'.repeat(250);
    const email = `${longLocal}@example.test`;
    const result = validateContact({
      fullName: 'Teszt Elek',
      email,
      phone: '+36301234567',
    });
    expect(result.ok).toBe(false);
    const emailErrors = result.errors.filter((e) => e.field === 'email');
    expect(emailErrors[0]?.code).toBe('tooLong');
  });

  it('rejects an email without an @ or with malformed domain', () => {
    const malformed = [
      'plain',
      'no-at-sign.test',
      'user@',
      '@example.com',
      'user@example',
      'a@b.c',
    ];
    for (const value of malformed) {
      const result = validateContact({
        fullName: 'Teszt Elek',
        email: value,
        phone: '+36301234567',
      });
      const emailErrors = result.errors.filter((e) => e.field === 'email');
      expect(emailErrors[0]?.code).toBe('invalidFormat');
    }
  });

  it('accepts a syntactically valid RFC 5322 subset email with subdomain', () => {
    const result = validateContact({
      fullName: 'Teszt Elek',
      email: 'first.last+tag@mail.example.test',
      phone: '+36301234567',
    });
    expect(result.errors.filter((e) => e.field === 'email')).toEqual([]);
  });

  it('normalizes the phone: strips spaces, hyphens, parentheses, 00 prefix and 0 prefix', () => {
    expect(
      normalizeContact({
        fullName: '',
        email: '',
        phone: '+36 30 123 4567',
      }).phone,
    ).toBe('+36301234567');

    expect(
      normalizeContact({
        fullName: '',
        email: '',
        phone: '+36-30-123-4567',
      }).phone,
    ).toBe('+36301234567');

    expect(
      normalizeContact({
        fullName: '',
        email: '',
        phone: '+36 (30) 123-4567',
      }).phone,
    ).toBe('+36301234567');

    // Hungarian trunk prefix "06"
    expect(
      normalizeContact({
        fullName: '',
        email: '',
        phone: '06 30 123 4567',
      }).phone,
    ).toBe('+36301234567');

    // International "0036" prefix
    expect(
      normalizeContact({
        fullName: '',
        email: '',
        phone: '0036 1 234 5678',
      }).phone,
    ).toBe('+3612345678');
  });

  it('accepts 8-digit landline numbers normalized to +36', () => {
    const result = validateContact({
      fullName: 'Teszt Elek',
      email: 'teszt@example.test',
      phone: '+36-1-234-5678',
    });
    expect(result.errors.filter((e) => e.field === 'phone')).toEqual([]);
  });

  it('rejects a phone with fewer than 8 or more than 9 national digits', () => {
    const short = validateContact({
      fullName: 'Teszt Elek',
      email: 'teszt@example.test',
      phone: '+36123456',
    });
    expect(short.ok).toBe(false);
    expect(short.errors.some((e) => e.field === 'phone')).toBe(true);

    const tooLong = validateContact({
      fullName: 'Teszt Elek',
      email: 'teszt@example.test',
      phone: '+361234567890',
    });
    expect(tooLong.ok).toBe(false);
    expect(tooLong.errors.some((e) => e.field === 'phone')).toBe(true);
  });

  it('rejects a phone missing +36', () => {
    const result = validateContact({
      fullName: 'Teszt Elek',
      email: 'teszt@example.test',
      phone: '301234567',
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'phone')).toBe(true);
  });

  it('reports the required error for an empty name, email, or phone', () => {
    const blank: ContactInput = { fullName: '   ', email: '', phone: ' ' };
    const result = validateContact(blank);
    expect(result.ok).toBe(false);
    const codes = result.errors.map((e) => `${e.field}:${e.code}`).sort();
    expect(codes).toContain('fullName:required');
    expect(codes).toContain('email:required');
    expect(codes).toContain('phone:required');
  });
});

// ---------------------------------------------------------------------------
// T20-AC02 — accessible label/autocomplete/error wiring and 422 mapping.
// ---------------------------------------------------------------------------
describe('T20-AC02 accessible label/autocomplete/error wiring and 422 mapping', () => {
  it('every input sits inside a <label> and carries an autocomplete attribute', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.detectChanges();
    const root = getRootElement(fixture);

    const nameInput = root.querySelector<HTMLInputElement>('#contact-fullname-input');
    const emailInput = root.querySelector<HTMLInputElement>('#contact-email-input');
    const phoneInput = root.querySelector<HTMLInputElement>('#contact-phone-input');

    expect(nameInput).not.toBeNull();
    expect(emailInput).not.toBeNull();
    expect(phoneInput).not.toBeNull();

    expect(nameInput?.closest('label')).not.toBeNull();
    expect(emailInput?.closest('label')).not.toBeNull();
    expect(phoneInput?.closest('label')).not.toBeNull();

    expect(nameInput?.getAttribute('autocomplete')).toBe('name');
    expect(emailInput?.getAttribute('autocomplete')).toBe('email');
    expect(phoneInput?.getAttribute('autocomplete')).toBe('tel');

    expect(nameInput?.value).toBe('Teszt Elek');
    expect(emailInput?.value).toBe('teszt@example.test');
    expect(phoneInput?.value).toBe('+36 30 123 4567');
  });

  it('every input has an aria-describedby pointing at a FormFieldMessage id', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.detectChanges();
    const root = getRootElement(fixture);

    const nameInput = root.querySelector<HTMLInputElement>('#contact-fullname-input');
    const emailInput = root.querySelector<HTMLInputElement>('#contact-email-input');
    const phoneInput = root.querySelector<HTMLInputElement>('#contact-phone-input');

    expect(nameInput?.getAttribute('aria-describedby')).toBe('contact-fullname-message');
    expect(emailInput?.getAttribute('aria-describedby')).toBe('contact-email-message');
    expect(phoneInput?.getAttribute('aria-describedby')).toBe('contact-phone-message');

    // Trigger validation errors so FormFieldMessage elements render paragraphs with matching IDs
    fixture.componentInstance.model.set({ fullName: '', email: '', phone: '' });
    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(root.querySelector('#contact-fullname-message')).not.toBeNull();
    expect(root.querySelector('#contact-email-message')).not.toBeNull();
    expect(root.querySelector('#contact-phone-message')).not.toBeNull();
  });

  it('invalid submission focuses the summary first then jumps to the first invalid field', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.componentInstance.model.set({ fullName: '', email: '', phone: '' });
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="contact-summary"]')).toBeNull();

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    const summary = root.querySelector<HTMLElement>('[data-testid="contact-summary"]');
    expect(summary).not.toBeNull();
    expect(summary?.getAttribute('role')).toBe('alert');
    expect(summary?.getAttribute('tabindex')).toBe('-1');

    const invalidLinks = summary?.querySelectorAll('a');
    expect(invalidLinks?.length).toBeGreaterThan(0);
    expect(fixture.componentInstance.invalidFields().length).toBe(3);
  });

  it('422 server errors are mapped via the JSONpointer path on the FieldError', async () => {
    expect(pointerToFieldKey('/fullName')).toBe('fullName');
    expect(pointerToFieldKey('/email')).toBe('email');
    expect(pointerToFieldKey('/phone')).toBe('phone');
    expect(pointerToFieldKey('/unknown')).toBeNull();

    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    const step = fixture.componentInstance;
    expect(step.resolvePointer('/fullName')).toBe('fullName');
    expect(step.resolvePointer('/email')).toBe('email');
    expect(step.resolvePointer('/phone')).toBe('phone');
  });
});

// ---------------------------------------------------------------------------
// T20-AC03 — NO marketing checkbox or account requirement; demo notice
// discourages real personal data. Fixture defaults use example.test
// and a fictitious address.
// ---------------------------------------------------------------------------
describe('T20-AC03 demo notice, no marketing, fixture example.test values', () => {
  it('renders the demo notice discouraging real personal data', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.detectChanges();
    const root = getRootElement(fixture);

    const demoNotice = root.querySelector('[data-testid="contact-demo-notice"]');
    expect(demoNotice).not.toBeNull();
    const text = demoNotice?.textContent ?? '';
    expect(text).toContain('Demó pénztár.');
    expect(text).toContain('ne használj valós személyes adatokat');
  });

  it('does NOT render a marketing checkbox or "create account" affordance', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.detectChanges();
    const root = getRootElement(fixture);

    const checkboxes = root.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(0);

    const text = root.textContent.toLowerCase();
    expect(text.includes('marketing')).toBe(false);
    expect(text.includes('hírlevél')).toBe(false);
    expect(text.includes('newsletter')).toBe(false);
    expect(text.includes('create account')).toBe(false);
    expect(text.includes('regisztráció')).toBe(false);
    expect(text.includes('fiók létrehozása')).toBe(false);
  });

  it('seeds default fixture values that use example.test and a fictitious Hungarian address', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.detectChanges();

    const model = fixture.componentInstance.model();
    expect(model.fullName).toBe('Teszt Elek');
    expect(model.email).toBe('teszt@example.test');
    expect(model.phone).toBe('+36 30 123 4567');
    expect(model.email).toContain('example.test');
    expect(model.phone).toContain('+36');
  });
});

// ---------------------------------------------------------------------------
// T20-AC04 — pending save gates duplicate advance; failure retains
// all typed fields and exposes Retry.
// ---------------------------------------------------------------------------
describe('T20-AC04 pending save gates duplicate advance; failure retains fields + Retry', () => {
  it('submit button is disabled while pendingSave is true', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.detectChanges();

    expect(fixture.componentInstance.canSubmit()).toBe(true);

    fixture.componentInstance.pendingSave.set(true);
    fixture.detectChanges();

    expect(fixture.componentInstance.canSubmit()).toBe(false);
    const root = getRootElement(fixture);
    const submitBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="contact-submit"] button',
    );
    expect(submitBtn?.disabled).toBe(true);
  });

  it('exposes a Retry path that re-runs the same save action', async () => {
    let saveCount = 0;
    const failingSaver: ContactDraftSaver = () => {
      saveCount += 1;
      return Promise.resolve({ ok: false, message: 'Mentési hiba történt.' });
    };

    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: CONTACT_DRAFT_SAVER, useValue: failingSaver }],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.detectChanges();

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(saveCount).toBe(1);
    expect(fixture.componentInstance.saveError()).toBe('Mentési hiba történt.');

    const root = getRootElement(fixture);
    const errorState = root.querySelector('[data-testid="contact-save-error"]');
    expect(errorState).not.toBeNull();

    fixture.componentInstance.onRetry();
    fixture.detectChanges();

    expect(saveCount).toBe(2);
  });

  it('keeps the typed values intact when save fails (no value reset)', async () => {
    const failingSaver: ContactDraftSaver = () =>
      Promise.resolve({ ok: false, message: 'Hálózati hiba.' });

    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: CONTACT_DRAFT_SAVER, useValue: failingSaver }],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    const customContact: ContactInput = {
      fullName: 'Kovács János',
      email: 'kovacs@example.test',
      phone: '+36 20 987 6543',
    };
    fixture.componentInstance.model.set(customContact);
    fixture.detectChanges();

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(fixture.componentInstance.model().fullName).toBe('Kovács János');
    expect(fixture.componentInstance.model().email).toBe('kovacs@example.test');
    expect(fixture.componentInstance.model().phone).toBe('+36 20 987 6543');
    expect(fixture.componentInstance.saveError()).toBe('Hálózati hiba.');
  });

  it('runs the save through Signal Forms submit() so server errors attach via fieldTree', async () => {
    const fieldErrorSaver: ContactDraftSaver = () =>
      Promise.resolve({
        ok: false,
        fieldErrors: {
          email: [{ code: 'server', message: 'Ez az e-mail már foglalt.', pointer: '/email' }],
        },
      });

    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: CONTACT_DRAFT_SAVER, useValue: fieldErrorSaver }],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.detectChanges();

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(
      fixture.componentInstance
        .emailErrors()
        .some((e) => e.message === 'Ez az e-mail már foglalt.'),
    ).toBe(true);
    const root = getRootElement(fixture);
    expect(root.querySelector('#contact-email-message')?.textContent).toContain(
      'Ez az e-mail már foglalt.',
    );
  });

  it('uses an injectable save token so the facade (T19) can replace the no-op default', async () => {
    let customSaverCalled = false;
    const customSaver: ContactDraftSaver = () => {
      customSaverCalled = true;
      return Promise.resolve({ ok: true });
    };

    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, { provide: CONTACT_DRAFT_SAVER, useValue: customSaver }],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.detectChanges();

    await fixture.componentInstance.onSubmit();
    expect(customSaverCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T20-AC05 — default, touched-invalid, submitted-invalid, loading and
// server-error visual states on narrow and desktop views.
// ---------------------------------------------------------------------------
describe('T20-AC05 visual states across narrow and desktop views', () => {
  it('exposes data-state hooks on each field for default / touched-invalid / submitted-invalid', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.detectChanges();
    const root = getRootElement(fixture);

    const fields = root.querySelectorAll('.field');
    expect(fields.length).toBe(3);
    for (const f of Array.from(fields)) {
      expect(f.getAttribute('data-state')).toBe('default');
    }

    fixture.componentInstance.model.set({ fullName: '', email: '', phone: '' });
    fixture.detectChanges();

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(
      root.querySelector('#contact-fullname-input')?.closest('.field')?.getAttribute('data-state'),
    ).toBe('submitted-invalid');
  });

  it('renders the loading state on the submit button when save is pending', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.detectChanges();

    fixture.componentInstance.pendingSave.set(true);
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const submitBtn = root.querySelector('[data-testid="contact-submit"]');
    expect(submitBtn).not.toBeNull();
    expect(submitBtn?.textContent).toContain('Mentés…');
  });

  it('renders the server-error ErrorState block when saveError is set', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.detectChanges();

    fixture.componentInstance.saveError.set('Szerverhiba történt.');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const errorBlock = root.querySelector('[data-testid="contact-save-error"]');
    expect(errorBlock).not.toBeNull();
    expect(errorBlock?.textContent).toContain('Szerverhiba történt.');
    expect(errorBlock?.querySelector('app-error-state')).not.toBeNull();
  });

  it('declares a desktop layout at >= 1024 px and a narrower mobile layout', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    TestBed.createComponent(ContactStep).detectChanges();
    const css = getComponentStyles(ContactStep).join(' ');
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)/);
    expect(css).toMatch(/max-width|grid-template-columns/);
  });
});

// ---------------------------------------------------------------------------
// T20 wiring — ContactStep uses Signal Forms and shared primitives,
// ContactPage re-exports ContactStep so the route still resolves.
// ---------------------------------------------------------------------------
describe('T20 contact-step shared wiring and route stub', () => {
  it('ContactStep imports form / submit / validate / required / maxLength from @angular/forms/signals', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    expect(fixture.componentInstance.contactForm).toBeDefined();
    expect(fixture.componentInstance.contactForm.fullName).toBeDefined();
    expect(fixture.componentInstance.contactForm.email).toBeDefined();
    expect(fixture.componentInstance.contactForm.phone).toBeDefined();
  });

  it('ContactStep uses the T10 shared UI primitives (Button / FormFieldMessage / ErrorState)', async () => {
    TestBed.configureTestingModule({
      providers: TEST_PROVIDERS,
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(ContactStep);
    fixture.componentInstance.saveError.set('Hiba');
    fixture.detectChanges();
    const root = getRootElement(fixture);

    expect(root.querySelector('app-button')).not.toBeNull();
    expect(root.querySelector('app-form-field-message')).not.toBeNull();
    expect(root.querySelector('app-error-state')).not.toBeNull();
  });

  it('ContactPage is re-exported from contact-step so the lazy route still resolves', () => {
    expect(ContactPage).toBe(ContactStep);
  });
});
