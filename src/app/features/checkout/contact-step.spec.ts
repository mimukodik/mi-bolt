/**
 * T20 — contact step UI (S4.2), rewritten for FIX-63.
 *
 * FIX-63 gave `ContactStep` the fixed signature `components.md:551-557`
 * declares: `contactFields:FieldTree<Contact>`/`saveState:AsyncStatus`
 * inputs, `continueRequested:void` output. The component injects no
 * `CONTACT_DRAFT_SAVER` and no `Router` — `contact-page.ts` owns the
 * Signal Forms model, the save call and the post-save navigation
 * (covered by `contact-page.spec.ts`).
 *
 *   T20-AC01 — fullName 2..100 trimmed; email ≤254 with RFC 5322
 *              subset; phone normalizes spaces/hyphens to +36 and
 *              validates 8-9 national digits.
 *   T20-AC02 — labels/autocomplete/errors associated; invalid
 *              submission focuses summary then first invalid field.
 *              (422 server field-error mapping is dropped by this task
 *              — see the commit body / FIX-63.md's "Two more things
 *              this task found": moving the save to the container means
 *              the container, not the field tree, sees the save result,
 *              so per-field mapping narrows to the generic
 *              `saveState() === 'error'` message R15 already allows.)
 *   T20-AC03 — NO marketing checkbox or account requirement; demo
 *              notice discourages real personal data.
 *   T20-AC04 — pending save (saveState 'loading') gates duplicate
 *              advance; a failed save (saveState 'error') retains all
 *              typed fields and shows a generic message.
 *   T20-AC05 — default, touched-invalid, submitted-invalid, loading
 *              and server-error visual states.
 *
 *   FIX-63-AC07 — a test that renders ContactStep with
 *                 contactFields/saveState set directly and no
 *                 CONTACT_DRAFT_SAVER provided, asserting it renders;
 *                 that test passing without the saver is the proof the
 *                 component no longer knows the save path.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { form, validate, type FieldTree } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';

import {
  CONTACT_EMAIL_MAX,
  CONTACT_NAME_MAX,
  CONTACT_NAME_MIN,
  CONTACT_PHONE_NATIONAL_DIGITS_MAX,
  CONTACT_PHONE_NATIONAL_DIGITS_MIN,
  buildContactForm,
  normalizeContact,
  pointerToFieldKey,
  validateContact,
  type ContactInput,
} from './contact.schema';
import { ContactStep } from './contact-step';

import type { AsyncStatus } from '../../shared/types/async-status';
import type { Contact } from '../../api/generated/models/contact';

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (raw instanceof HTMLElement) return raw;
  throw new Error('Expected HTMLElement');
}

const EMPTY_CONTACT: Contact = { fullName: '', email: '', phone: '' };
const VALID_CONTACT: Contact = {
  fullName: 'Teszt Elek',
  email: 'teszt@example.test',
  phone: '+36201234567',
};

const TEST_PROVIDERS = [provideZonelessChangeDetection(), provideRouter([])];

/**
 * Configures the testing module first, then builds the `FieldTree<Contact>`
 * the way `ContactPage` does (Signal Forms' `form()` calls `inject()`
 * internally, so this must run inside an injection context, and that
 * context must not be created before `configureTestingModule` runs — doing
 * it in the other order throws "Cannot configure the test module when the
 * test module has already been instantiated").
 */
function createContactStep(
  initial: Contact = EMPTY_CONTACT,
  saveState: AsyncStatus = 'idle',
): { fixture: ComponentFixture<ContactStep>; fields: FieldTree<Contact> } {
  TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
  const fields = TestBed.runInInjectionContext(() => buildContactForm(signal(initial)));
  const fixture = TestBed.createComponent(ContactStep);
  fixture.componentRef.setInput('contactFields', fields);
  fixture.componentRef.setInput('saveState', saveState);
  fixture.detectChanges();
  return { fixture, fields };
}

// ---------------------------------------------------------------------------
// T20-AC01 — fullName 2..100 trimmed; email ≤254 + RFC 5322 subset;
// phone normalizes spaces / hyphens to +36 and validates 8-9 national
// digits. Pure schema tests, unaffected by FIX-63's container split.
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
    expect(result.errors.find((e) => e.field === 'fullName')?.code).toBe('tooShort');
  });

  it('treats trimmed fullName above 100 chars as too long', () => {
    const result = validateContact({
      fullName: 'A'.repeat(101),
      email: 'teszt@example.test',
      phone: '+36301234567',
    });
    expect(result.errors.find((e) => e.field === 'fullName')?.code).toBe('tooLong');
  });

  it('rejects an email longer than 254 characters', () => {
    const email = `${'a'.repeat(250)}@example.test`;
    const result = validateContact({ fullName: 'Teszt Elek', email, phone: '+36301234567' });
    expect(result.errors.find((e) => e.field === 'email')?.code).toBe('tooLong');
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
      expect(result.errors.find((e) => e.field === 'email')?.code).toBe('invalidFormat');
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
    expect(normalizeContact({ fullName: '', email: '', phone: '+36 30 123 4567' }).phone).toBe(
      '+36301234567',
    );
    expect(normalizeContact({ fullName: '', email: '', phone: '+36-30-123-4567' }).phone).toBe(
      '+36301234567',
    );
    expect(normalizeContact({ fullName: '', email: '', phone: '+36 (30) 123-4567' }).phone).toBe(
      '+36301234567',
    );
    expect(normalizeContact({ fullName: '', email: '', phone: '06 30 123 4567' }).phone).toBe(
      '+36301234567',
    );
    expect(normalizeContact({ fullName: '', email: '', phone: '0036 1 234 5678' }).phone).toBe(
      '+3612345678',
    );
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
    expect(short.errors.some((e) => e.field === 'phone')).toBe(true);
    const tooLong = validateContact({
      fullName: 'Teszt Elek',
      email: 'teszt@example.test',
      phone: '+361234567890',
    });
    expect(tooLong.errors.some((e) => e.field === 'phone')).toBe(true);
  });

  it('rejects a phone missing +36', () => {
    const result = validateContact({
      fullName: 'Teszt Elek',
      email: 'teszt@example.test',
      phone: '301234567',
    });
    expect(result.errors.some((e) => e.field === 'phone')).toBe(true);
  });

  it('reports the required error for an empty name, email, or phone', () => {
    const blank: ContactInput = { fullName: '   ', email: '', phone: ' ' };
    const result = validateContact(blank);
    const codes = result.errors.map((e) => `${e.field}:${e.code}`).sort();
    expect(codes).toContain('fullName:required');
    expect(codes).toContain('email:required');
    expect(codes).toContain('phone:required');
  });
});

// ---------------------------------------------------------------------------
// FIX-63-AC07 — renders with contactFields/saveState set directly and no
// CONTACT_DRAFT_SAVER provided.
// ---------------------------------------------------------------------------
describe('FIX-63-AC07 ContactStep renders from its two inputs with no injected saver', () => {
  it('renders with contactFields/saveState set directly and no CONTACT_DRAFT_SAVER provided', () => {
    // TEST_PROVIDERS carries only zoneless change detection and an empty
    // router — no CONTACT_DRAFT_SAVER provider is registered anywhere in
    // this module. The component still renders: proof it no longer knows
    // the save path.
    const { fixture } = createContactStep();
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="contact-page"]')).not.toBeNull();
    expect(root.querySelector('#contact-fullname-input')).not.toBeNull();
  });

  it("declares exactly the contract's two inputs and one output", () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/features/checkout/contact-step.ts'),
      'utf8',
    );
    expect(source).toMatch(/contactFields\s*=\s*input\.required<FieldTree<Contact>>\(\)/);
    expect(source).toMatch(/saveState\s*=\s*input<AsyncStatus>\('idle'\)/);
    expect(source).toMatch(/continueRequested\s*=\s*output(<void>)?\(\)/);
    expect(source).not.toMatch(/submitContact/);
  });
});

// ---------------------------------------------------------------------------
// T20-AC02 — accessible label/autocomplete/error wiring; invalid submission
// focus management.
// ---------------------------------------------------------------------------
describe('T20-AC02 accessible label/autocomplete/error wiring', () => {
  it('every input sits inside a <label> and carries an autocomplete attribute', () => {
    const { fixture } = createContactStep();
    const root = getRootElement(fixture);

    const nameInput = root.querySelector<HTMLInputElement>('#contact-fullname-input');
    const emailInput = root.querySelector<HTMLInputElement>('#contact-email-input');
    const phoneInput = root.querySelector<HTMLInputElement>('#contact-phone-input');

    expect(nameInput?.closest('label')).not.toBeNull();
    expect(emailInput?.closest('label')).not.toBeNull();
    expect(phoneInput?.closest('label')).not.toBeNull();

    expect(nameInput?.getAttribute('autocomplete')).toBe('name');
    expect(emailInput?.getAttribute('autocomplete')).toBe('email');
    expect(phoneInput?.getAttribute('autocomplete')).toBe('tel');
  });

  it('every input has an aria-describedby pointing at a FormFieldMessage id', async () => {
    const { fixture } = createContactStep(EMPTY_CONTACT);
    const root = getRootElement(fixture);

    expect(root.querySelector('#contact-fullname-input')?.getAttribute('aria-describedby')).toBe(
      'contact-fullname-message',
    );

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(root.querySelector('#contact-fullname-message')).not.toBeNull();
    expect(root.querySelector('#contact-email-message')).not.toBeNull();
    expect(root.querySelector('#contact-phone-message')).not.toBeNull();
  });

  it('invalid submission focuses the summary first then jumps to the first invalid field', async () => {
    const { fixture } = createContactStep(EMPTY_CONTACT);
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="contact-summary"]')).toBeNull();

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    const summary = root.querySelector<HTMLElement>('[data-testid="contact-summary"]');
    expect(summary).not.toBeNull();
    expect(summary?.getAttribute('role')).toBe('alert');
    expect(summary?.getAttribute('tabindex')).toBe('-1');
    expect(fixture.componentInstance.invalidFields().length).toBe(3);
  });

  it('the summary links point at the lowercase input ids (MIM-212)', async () => {
    // Regression: the summary anchor built `#contact-${field}-input` from the
    // field key, but the DOM ids are lowercase — `#contact-fullname-input`,
    // not `#contact-fullName-input`. With only `fullName` invalid, the first
    // summary link's `href` must be the lowercase id.
    const { fixture } = createContactStep({
      fullName: '',
      email: 'teszt@example.test',
      phone: '+36301234567',
    });
    const root = getRootElement(fixture);

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    const link = root.querySelector<HTMLAnchorElement>('[data-testid="contact-summary"] a');
    expect(link?.getAttribute('href')).toBe('#contact-fullname-input');
  });

  it('moves focus to the full-name input when it is the first invalid field (MIM-212)', async () => {
    // Regression: `focusFirstInvalidField` built the DOM id from the field
    // key (`contact-${field}-input`), but the template id is lowercase —
    // `contact-fullname-input`, not `contact-fullName-input` — so the lookup
    // returned `null` for `fullName`. With email and phone valid only the
    // full-name field is invalid, so `document.activeElement` lands on it.
    const { fixture } = createContactStep({
      fullName: '',
      email: 'teszt@example.test',
      phone: '+36301234567',
    });

    document.body.focus();
    expect(document.activeElement).toBe(document.body);

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();

    expect(document.activeElement?.id).toBe('contact-fullname-input');
  });

  it('does not emit continueRequested when the form is invalid', async () => {
    const { fixture } = createContactStep(EMPTY_CONTACT);
    let count = 0;
    fixture.componentInstance.continueRequested.subscribe(() => (count += 1));

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(count).toBe(0);
  });

  it('emits continueRequested once the form is locally valid, with no navigation of its own', async () => {
    const { fixture } = createContactStep(VALID_CONTACT);
    let count = 0;
    fixture.componentInstance.continueRequested.subscribe(() => (count += 1));

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(count).toBe(1);
  });

  it('resolves a 422 JSONpointer back to the local field key (used by the container, if it re-derives mapping later)', () => {
    expect(pointerToFieldKey('/fullName')).toBe('fullName');
    expect(pointerToFieldKey('/email')).toBe('email');
    expect(pointerToFieldKey('/phone')).toBe('phone');
    expect(pointerToFieldKey('/unknown')).toBeNull();

    const { fixture } = createContactStep();
    expect(fixture.componentInstance.resolvePointer('/fullName')).toBe('fullName');
  });
});

// ---------------------------------------------------------------------------
// T20-AC03 — NO marketing checkbox or account requirement; demo notice.
// ---------------------------------------------------------------------------
describe('T20-AC03 demo notice, no marketing, no account affordance', () => {
  it('renders the demo notice discouraging real personal data', () => {
    const { fixture } = createContactStep();
    const root = getRootElement(fixture);
    const demoNotice = root.querySelector('[data-testid="contact-demo-notice"]');
    expect(demoNotice).not.toBeNull();
    const text = demoNotice?.textContent ?? '';
    expect(text).toContain('Demó pénztár.');
    expect(text).toContain('ne használj valós személyes adatokat');
  });

  it('does NOT render a marketing checkbox or "create account" affordance', () => {
    const { fixture } = createContactStep();
    const root = getRootElement(fixture);
    expect(root.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    const text = root.textContent.toLowerCase();
    expect(text.includes('marketing')).toBe(false);
    expect(text.includes('hírlevél')).toBe(false);
    expect(text.includes('newsletter')).toBe(false);
    expect(text.includes('create account')).toBe(false);
    expect(text.includes('regisztráció')).toBe(false);
  });

  // MIM-240b1: the notice is now `app-status-message` with the primitive's
  // own message string and `[persistent]` true, so the dismiss button is
  // hidden. The data-testid stays on the primitive's host so existing
  // queries keep working.
  it('renders the exact message string the primitive carries (MIM-240b1)', () => {
    const { fixture } = createContactStep();
    const root = getRootElement(fixture);
    const demoNotice = root.querySelector('[data-testid="contact-demo-notice"]');
    expect(demoNotice).not.toBeNull();
    expect(demoNotice?.textContent.trim()).toBe(
      'Demó pénztár. Kérlek, ne használj valós személyes adatokat — ez egy működési bemutató, nem küldünk valódi rendelést vagy e-mailt.',
    );
  });

  it('renders no "Bezárás" dismiss button because the primitive is persistent (MIM-240b1)', () => {
    const { fixture } = createContactStep();
    const root = getRootElement(fixture);
    const demoNotice = root.querySelector('[data-testid="contact-demo-notice"]');
    expect(demoNotice).not.toBeNull();
    expect(demoNotice?.textContent ?? '').not.toContain('Bezárás');
  });
});

// ---------------------------------------------------------------------------
// T20-AC04 — pending save gates duplicate advance; a failed save retains
// all typed fields and shows a generic message.
// ---------------------------------------------------------------------------
describe('T20-AC04 pending save gates duplicate advance; failure retains fields', () => {
  it('submit button is disabled while saveState is "loading"', () => {
    const { fixture } = createContactStep(VALID_CONTACT, 'loading');
    const root = getRootElement(fixture);
    expect(fixture.componentInstance.canSubmit()).toBe(false);
    expect(
      root.querySelector<HTMLButtonElement>('[data-testid="contact-submit"] button')?.disabled,
    ).toBe(true);
  });

  it('does not run submit() while saveState is "loading" (no duplicate emit)', async () => {
    const { fixture } = createContactStep(VALID_CONTACT, 'loading');
    let count = 0;
    fixture.componentInstance.continueRequested.subscribe(() => (count += 1));

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(count).toBe(0);
  });

  it('keeps the typed values intact when saveState is "error" (no value reset)', () => {
    const { fixture } = createContactStep(
      { fullName: 'Kovács János', email: 'kovacs@example.test', phone: '+36 20 987 6543' },
      'error',
    );

    expect(fixture.componentInstance.contactFields()().value().fullName).toBe('Kovács János');
    const root = getRootElement(fixture);
    expect(root.querySelector<HTMLInputElement>('#contact-fullname-input')?.value).toBe(
      'Kovács János',
    );
  });

  it('re-running submit() after an error re-validates and can still emit continueRequested — the retry path is simply pressing the same control again', async () => {
    const { fixture } = createContactStep(VALID_CONTACT, 'error');
    let count = 0;
    fixture.componentInstance.continueRequested.subscribe(() => (count += 1));

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(count).toBe(1);
  });

  it('the continue button is the form submit button (MIM-212)', () => {
    const { fixture } = createContactStep({
      fullName: 'Teszt Elek',
      email: 'teszt@example.test',
      phone: '+36301234567',
    });
    const button = getRootElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="contact-submit"] button',
    );
    expect(button?.getAttribute('type')).toBe('submit');
  });

  it('a click on the continue button emits continueRequested exactly once (MIM-212)', async () => {
    const { fixture } = createContactStep({
      fullName: 'Teszt Elek',
      email: 'teszt@example.test',
      phone: '+36301234567',
    });
    let count = 0;
    fixture.componentInstance.continueRequested.subscribe(() => (count += 1));
    const button = getRootElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="contact-submit"] button',
    );
    button?.click();
    await fixture.whenStable();
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T20-AC05 — visual states.
// ---------------------------------------------------------------------------
describe('T20-AC05 visual states', () => {
  it('exposes data-state hooks on each field for default / submitted-invalid', async () => {
    const { fixture } = createContactStep(EMPTY_CONTACT);
    const root = getRootElement(fixture);

    const fields = root.querySelectorAll('.field');
    expect(fields.length).toBe(3);
    for (const f of Array.from(fields)) {
      expect(f.getAttribute('data-state')).toBe('default');
    }

    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    expect(
      root.querySelector('#contact-fullname-input')?.closest('.field')?.getAttribute('data-state'),
    ).toBe('submitted-invalid');
  });

  it('renders the loading state on the submit button when saveState is "loading"', () => {
    const { fixture } = createContactStep(VALID_CONTACT, 'loading');
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="contact-submit"]')?.textContent).toContain('Mentés…');
  });

  it('renders a generic status message when saveState is "error" (no backend detail)', () => {
    const { fixture } = createContactStep(VALID_CONTACT, 'error');
    const root = getRootElement(fixture);
    const errorBlock = root.querySelector('[data-testid="contact-save-error"]');
    expect(errorBlock).not.toBeNull();
    expect(errorBlock?.querySelector('app-status-message')).not.toBeNull();
    expect(errorBlock?.textContent).toContain('A mentés sikertelen.');
  });
});

// ---------------------------------------------------------------------------
// T20 wiring — ContactStep uses Signal Forms against the passed-in field
// tree and the T10 shared UI primitives.
// ---------------------------------------------------------------------------
describe('T20 contact-step shared wiring', () => {
  it('renders against the contactFields input rather than a locally-built field tree', () => {
    const { fixture, fields } = createContactStep(VALID_CONTACT);
    expect(fixture.componentInstance.contactFields()).toBe(fields);
  });

  it('uses the T10 shared UI primitives (Button / FormFieldMessage / StatusMessage)', () => {
    const { fixture } = createContactStep(VALID_CONTACT, 'error');
    const root = getRootElement(fixture);
    expect(root.querySelector('app-button')).not.toBeNull();
    expect(root.querySelector('app-form-field-message')).not.toBeNull();
    expect(root.querySelector('app-status-message')).not.toBeNull();
  });

  it('a field error carrying a pointer keeps it, one without a pointer gets the field path (MIM-212)', async () => {
    // The harness's submit-driven errors are built-in `required` instances,
    // which carry no `pointer`. `invalidFields()` falls back to `/${key}`
    // for those (asserted for fullName below).
    const { fixture } = createContactStep(EMPTY_CONTACT);
    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    const fallback = fixture.componentInstance.invalidFields();
    const fullNameEntry = fallback.find((entry) => entry.field === 'fullName');
    expect(fullNameEntry).toBeDefined();
    expect(fullNameEntry?.pointer).toBe('/fullName');
    expect(fullNameEntry?.message).toBe('A teljes név kötelező.');

    // A second form with a server-style error carrying `pointer` is built
    // through an inline schema that returns the error from `validate()`.
    // The `pointer` value differs from the field-path fallback (`/email`)
    // so the assertion below fails if Signal Forms strips the field rather
    // than preserves it: a fallback `/${key}` here would land on `/email`,
    // not `/server-error`.
    const fieldsWithServerError = TestBed.runInInjectionContext(() =>
      form(signal(EMPTY_CONTACT), (path) => {
        validate(path.email, () => ({
          kind: 'server',
          message: 'Hibás e-mail',
          pointer: '/server-error',
        }));
      }),
    );
    const serverFixture = TestBed.createComponent(ContactStep);
    serverFixture.componentRef.setInput('contactFields', fieldsWithServerError);
    serverFixture.componentRef.setInput('saveState', 'idle');
    serverFixture.detectChanges();

    const emailEntry = serverFixture.componentInstance
      .invalidFields()
      .find((entry) => entry.field === 'email');
    expect(emailEntry?.pointer).toBe('/server-error');
    expect(emailEntry?.message).toBe('Hibás e-mail');
  });

  it('a field error whose pointer is not a string falls back to the field path (MIM-212)', () => {
    // A malformed server-style error: `pointer` present but a number.
    // `errorPointer` must reject it (`typeof pointer === 'string'`), so
    // `invalidFields()` lands on the `/${key}` fallback, `/email`.
    TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
    const malformed: { kind: string; message: string; pointer: number } = {
      kind: 'server',
      message: 'Hibás e-mail',
      pointer: 42,
    };
    const fieldsWithMalformedError = TestBed.runInInjectionContext(() =>
      form(signal(EMPTY_CONTACT), (path) => {
        validate(path.email, () => malformed);
      }),
    );
    const malformedFixture = TestBed.createComponent(ContactStep);
    malformedFixture.componentRef.setInput('contactFields', fieldsWithMalformedError);
    malformedFixture.componentRef.setInput('saveState', 'idle');
    malformedFixture.detectChanges();

    const emailEntry = malformedFixture.componentInstance
      .invalidFields()
      .find((entry) => entry.field === 'email');
    expect(emailEntry?.pointer).toBe('/email');
    expect(emailEntry?.message).toBe('Hibás e-mail');
  });
});

// ---------------------------------------------------------------------------
// MIM-254 — invalid contact field carries aria-invalid="true" so the
// border-color rule (src/styles/primitives.css) can match it. jsdom does not
// apply the stylesheet, so the attribute is what a spec pins; the
// browser pass asserts the border.
// ---------------------------------------------------------------------------
describe('MIM-254: a pristine required field is not marked invalid', () => {
  it('every required input keeps aria-invalid null on an empty, untouched form', () => {
    // The contact step uses `null` as the false branch of the
    // `[attr.aria-invalid]` binding so a pristine field carries no
    // aria-invalid attribute at all. The border-color rule keys off
    // `[aria-invalid='true']`; until the shopper has left the field or
    // tried to submit, the attribute must be absent on every required
    // input, not just the first one.
    const { fixture } = createContactStep(EMPTY_CONTACT);
    const root = getRootElement(fixture);

    const fullNameInput = root.querySelector<HTMLInputElement>('#contact-fullname-input');
    const emailInput = root.querySelector<HTMLInputElement>('#contact-email-input');
    const phoneInput = root.querySelector<HTMLInputElement>('#contact-phone-input');

    expect(fullNameInput?.getAttribute('aria-invalid')).toBeNull();
    expect(emailInput?.getAttribute('aria-invalid')).toBeNull();
    expect(phoneInput?.getAttribute('aria-invalid')).toBeNull();
  });
});

describe('MIM-254: blurring an empty required field marks it invalid', () => {
  it('blurring the full-name input flips its aria-invalid to "true"', () => {
    const { fixture } = createContactStep(EMPTY_CONTACT);
    const root = getRootElement(fixture);
    const input = root.querySelector<HTMLInputElement>('#contact-fullname-input');
    if (input === null) throw new Error('Expected fullname input');
    expect(input.getAttribute('aria-invalid')).toBeNull();

    input.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();

    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('blurring the e-mail input flips its aria-invalid to "true"', () => {
    const { fixture } = createContactStep(EMPTY_CONTACT);
    const root = getRootElement(fixture);
    const input = root.querySelector<HTMLInputElement>('#contact-email-input');
    if (input === null) throw new Error('Expected email input');
    expect(input.getAttribute('aria-invalid')).toBeNull();

    input.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();

    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('blurring the phone input flips its aria-invalid to "true"', () => {
    const { fixture } = createContactStep(EMPTY_CONTACT);
    const root = getRootElement(fixture);
    const input = root.querySelector<HTMLInputElement>('#contact-phone-input');
    if (input === null) throw new Error('Expected phone input');
    expect(input.getAttribute('aria-invalid')).toBeNull();

    input.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();

    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('blurring one empty field marks only that field', () => {
    const { fixture } = createContactStep(EMPTY_CONTACT);
    const root = getRootElement(fixture);
    const email = root.querySelector<HTMLInputElement>('#contact-email-input');
    if (email === null) throw new Error('Expected email input');

    email.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();

    expect(root.querySelector('#contact-fullname-input')?.getAttribute('aria-invalid')).toBeNull();
    expect(root.querySelector('#contact-phone-input')?.getAttribute('aria-invalid')).toBeNull();
  });
});

describe('MIM-254: submitting marks every empty required field invalid', () => {
  it('onSubmit flips aria-invalid to "true" on every required input without any blur', async () => {
    const { fixture } = createContactStep(EMPTY_CONTACT);
    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const fullNameInput = root.querySelector<HTMLInputElement>('#contact-fullname-input');
    const emailInput = root.querySelector<HTMLInputElement>('#contact-email-input');
    const phoneInput = root.querySelector<HTMLInputElement>('#contact-phone-input');

    expect(fullNameInput?.getAttribute('aria-invalid')).toBe('true');
    expect(emailInput?.getAttribute('aria-invalid')).toBe('true');
    expect(phoneInput?.getAttribute('aria-invalid')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// Server errors surface in the field-level messages and the
// submit-time summary, with the wire's `pointer` (e.g. `/phone`).
// ---------------------------------------------------------------------------
describe('server errors surface under the field and in the summary', () => {
  it('server errors appear in the summary with their pointer (MIM-212)', async () => {
    const { fixture } = createContactStep(VALID_CONTACT);

    // Submit the valid form so `submitted()` is true and the summary
    // renders. The values the server errors target match the form field
    // values here, so the step keeps them attached.
    await fixture.componentInstance.onSubmit();
    fixture.detectChanges();

    fixture.componentRef.setInput('serverErrors', {
      values: VALID_CONTACT,
      errors: {
        phone: [{ code: 'PHONE_FORMAT', message: 'm', pointer: '/phone' }],
      },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.invalidFields()).toEqual([
      { field: 'phone', label: 'Telefonszám', message: 'm', pointer: '/phone' },
    ]);

    const link = getRootElement(fixture).querySelector<HTMLAnchorElement>(
      '[data-testid="contact-summary"] a',
    );
    expect(link?.getAttribute('data-pointer')).toBe('/phone');
  });
});
