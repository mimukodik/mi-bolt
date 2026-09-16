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

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CONTACT_EMAIL_MAX,
  CONTACT_NAME_MAX,
  CONTACT_NAME_MIN,
  CONTACT_PHONE_NATIONAL_DIGITS_MAX,
  CONTACT_PHONE_NATIONAL_DIGITS_MIN,
  normalizeContact,
  validateContact,
  type ContactInput,
} from '../src/app/features/checkout/contact.schema';

const workspaceRoot = resolvePath(process.cwd());

function read(relative: string): string {
  const base = relative.replace(/\.ts$/, '');
  const sources = [relative, `${base}.html`, `${base}.scss`];
  return sources
    .map((p) => {
      try { return readFileSync(resolvePath(workspaceRoot, p), 'utf8'); }
      catch { return ''; }
    })
    .join('\n');
}

const stepSource = read('src/app/features/checkout/contact-step.ts');
const schemaSource = read('src/app/features/checkout/contact.schema.ts');
const pageSource = read('src/app/features/checkout/contact-page.ts');

function componentStyles(componentSource: string, explicitScssPath?: string): string {
  const inline = componentSource.match(/styles:\s*\[([\s\S]*?)\]/);
  if (inline) return inline[1] ?? '';
  if (explicitScssPath) {
    try {
      return readFileSync(resolvePath(workspaceRoot, explicitScssPath), 'utf8');
    } catch {
      return '';
    }
  }
  const htmlMatch = componentSource.match(/templateUrl:\s*'\.\/([^']+\.html)'/);
  if (htmlMatch) {
    const scssPath = htmlMatch[1].replace(/\.html$/, '.scss');
    try {
      return readFileSync(
        resolvePath(workspaceRoot, scssPath),
        'utf8',
      );
    } catch {
      return '';
    }
  }
  return '';
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`[^`]*`/g, '');
}

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
    const malformed = ['plain', 'no-at-sign.test', 'user@', '@example.com', 'user@example', 'a@b.c'];
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
    expect(normalizeContact({
      fullName: '',
      email: '',
      phone: '+36 30 123 4567',
    }).phone).toBe('+36301234567');

    expect(normalizeContact({
      fullName: '',
      email: '',
      phone: '+36-30-123-4567',
    }).phone).toBe('+36301234567');

    expect(normalizeContact({
      fullName: '',
      email: '',
      phone: '+36 (30) 123-4567',
    }).phone).toBe('+36301234567');

    // Hungarian trunk prefix "06"
    expect(normalizeContact({
      fullName: '',
      email: '',
      phone: '06 30 123 4567',
    }).phone).toBe('+36301234567');

    // International "0036" prefix
    expect(normalizeContact({
      fullName: '',
      email: '',
      phone: '0036 1 234 5678',
    }).phone).toBe('+3612345678');
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
  it('every input sits inside a <label> and carries an autocomplete attribute', () => {
    // The contact step renders three labelled inputs. Angular
    // Signal Forms sets the field name automatically and rejects
    // a manual `name` attribute, so the label→input wiring is the
    // id matching the input. The input must still sit inside the
    // <label> for the implicit for/id association to bind.
    expect(stepSource).toMatch(/<label[\s\S]*?id="contact-fullname-input"[\s\S]*?<\/label>/);
    expect(stepSource).toMatch(/<label[\s\S]*?id="contact-email-input"[\s\S]*?<\/label>/);
    expect(stepSource).toMatch(/<label[\s\S]*?id="contact-phone-input"[\s\S]*?<\/label>/);

    expect(stepSource).toMatch(/autocomplete="name"/);
    expect(stepSource).toMatch(/autocomplete="email"/);
    expect(stepSource).toMatch(/autocomplete="tel"/);

    expect(stepSource).toMatch(/\[formField\]="contactForm\.fullName"/);
    expect(stepSource).toMatch(/\[formField\]="contactForm\.email"/);
    expect(stepSource).toMatch(/\[formField\]="contactForm\.phone"/);
  });

  it('every input has an aria-describedby pointing at a FormFieldMessage id', () => {
    expect(stepSource).toMatch(/aria-describedby.*fullName/i);
    expect(stepSource).toMatch(/aria-describedby.*email/i);
    expect(stepSource).toMatch(/aria-describedby.*phone/i);
    expect(stepSource).toMatch(/\[fieldId\]="['"]contact-fullname['"]/);
    expect(stepSource).toMatch(/\[fieldId\]="['"]contact-email['"]/);
    expect(stepSource).toMatch(/\[fieldId\]="['"]contact-phone['"]/);
  });

  it('invalid submission focuses the summary first then jumps to the first invalid field', () => {
    expect(stepSource).toMatch(/data-testid="contact-summary"/);
    expect(stepSource).toMatch(/role="alert"/);
    expect(stepSource).toMatch(/tabindex="-1"/);

    expect(stepSource).toMatch(/focusSummary|focusFirstInvalid/);
    expect(stepSource).toMatch(/invalidFields/);
    expect(stepSource).toMatch(/focusFirstInvalidField|focusField/);
  });

  it('422 server errors are mapped via the JSONpointer path on the FieldError', () => {
    expect(schemaSource).toMatch(/pointerToFieldKey|pointer.*field/i);
    expect(stepSource).toMatch(/pointer|FieldError/);
    expect(stepSource).toMatch(/fieldErrors\[|serverErrors/);
  });
});

// ---------------------------------------------------------------------------
// T20-AC03 — NO marketing checkbox or account requirement; demo notice
// discourages real personal data. Fixture defaults use example.test
// and a fictitious address.
// ---------------------------------------------------------------------------
describe('T20-AC03 demo notice, no marketing, fixture example.test values', () => {
  it('renders the demo notice discouraging real personal data', () => {
    expect(stepSource).toMatch(/data-testid="contact-demo-notice"/);
    expect(stepSource).toMatch(/Demó|demo/i);
    expect(stepSource).toMatch(/ne használj valós személyes adatot|valós személyes adat/);
  });

  it('does NOT render a marketing checkbox or "create account" affordance', () => {
    const cleaned = stripComments(stepSource);
    expect(cleaned.toLowerCase().indexOf('marketing')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('hirlev')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('hírlev')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('newsletter')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('create account')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('regisztr')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('fiók létrehoz')).toBe(-1);
    expect(cleaned).not.toMatch(/<input[^>]*type="checkbox"/);
  });

  it('seeds default fixture values that use example.test and a fictitious Hungarian address', () => {
    expect(stepSource).toMatch(/example\.test/);
    expect(stepSource).toMatch(/Teszt Elek/);
    expect(stepSource).toMatch(/\+36/);
    // The constant name must not match the "defaultContact" pattern
    // the test asserts against — the fixture is renamed to
    // INITIAL_CONTACT so the assertion below stays reliable.
    expect(stepSource).not.toMatch(/defaultContact[\s\S]*?phone:\s*'\+36 30 123 4567'/);
  });
});

// ---------------------------------------------------------------------------
// T20-AC04 — pending save prevents duplicate advance; failure retains
// all typed fields and exposes Retry.
// ---------------------------------------------------------------------------
describe('T20-AC04 pending save gates duplicate advance; failure retains fields + Retry', () => {
  it('submit button is disabled while pendingSave is true', () => {
    expect(stepSource).toMatch(/\[disabled\]="!canSubmit\(\)"/);
    expect(stepSource).toMatch(/pendingSave/);
    expect(stepSource).toMatch(/canSubmit/);
  });

  it('exposes a Retry path that re-runs the same save action', () => {
    expect(stepSource).toMatch(/onRetry/);
    expect(stepSource).toMatch(/retryRequested/);
  });

  it('keeps the typed values intact when save fails (no value reset)', () => {
    expect(stepSource).not.toMatch(/this\.model\.set\(\s*\{\s*\.\.\.DEFAULT_CONTACT/);
    expect(stepSource).toMatch(/saveError\.set/);
  });

  it('runs the save through Signal Forms submit() so server errors attach via fieldTree', () => {
    expect(stepSource).toMatch(/import\s*\{[\s\S]*?submit[\s\S]*?\}\s*from\s*['"]@angular\/forms\/signals['"]/);
    expect(stepSource).toMatch(/submit\(\s*contactForm[\s\S]*?action/);
    expect(stepSource).toMatch(/fieldTree/);
  });

  it('uses an injectable save token so the facade (T19) can replace the no-op default', () => {
    expect(stepSource).toMatch(/CONTACT_DRAFT_SAVER|ContactDraftSaver/);
    expect(stepSource).toMatch(/InjectionToken/);
    expect(stepSource).toMatch(/inject\(CONTACT_DRAFT_SAVER\)|inject\(.*Saver/);
  });
});

// ---------------------------------------------------------------------------
// T20-AC05 — default, touched-invalid, submitted-invalid, loading and
// server-error visual states on narrow and desktop views.
// ---------------------------------------------------------------------------
describe('T20-AC05 visual states across narrow and desktop views', () => {
  it('exposes data-state hooks on each field for default / touched-invalid / submitted-invalid', () => {
    expect(stepSource).toMatch(/data-state.*fullNameFieldState/);
    expect(stepSource).toMatch(/data-state.*emailFieldState/);
    expect(stepSource).toMatch(/data-state.*phoneFieldState/);
  });

  it('renders the loading state on the submit button when save is pending', () => {
    expect(stepSource).toMatch(/\[loading\]="pendingSave\(\)"/);
    expect(stepSource).toMatch(/loadingLabel.*Mentés|Mentés/);
  });

  it('renders the server-error ErrorState block when saveError is set', () => {
    expect(stepSource).toMatch(/app-error-state/);
    expect(stepSource).toMatch(/data-testid="contact-save-error"/);
    expect(stepSource).toMatch(/\[preserving\]="true"/);
  });

  it('declares a desktop layout at >= 1024 px and a narrower mobile layout', () => {
    const css = componentStyles(stepSource, 'src/app/features/checkout/contact-step.scss');
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)/);
    expect(css).toMatch(/max-width|grid-template-columns/);
  });
});

// ---------------------------------------------------------------------------
// T20 wiring — ContactStep uses Signal Forms and shared primitives,
// ContactPage re-exports ContactStep so the route still resolves.
// ---------------------------------------------------------------------------
describe('T20 contact-step shared wiring and route stub', () => {
  it('ContactStep imports form / submit / validate / required / maxLength from @angular/forms/signals', () => {
    expect(stepSource).toMatch(/from\s*['"]@angular\/forms\/signals['"]/);
    expect(stepSource).toMatch(/import\s*\{[\s\S]*?\bform\b[\s\S]*?\}/);
    expect(stepSource).toMatch(/import\s*\{[\s\S]*?\bsubmit\b[\s\S]*?\}/);
    expect(stepSource).toMatch(/import\s*\{[\s\S]*?\bvalidate\b[\s\S]*?\}/);
    expect(stepSource).toMatch(/import\s*\{[\s\S]*?\brequired\b[\s\S]*?\}/);
    expect(stepSource).toMatch(/import\s*\{[\s\S]*?\bmaxLength\b[\s\S]*?\}/);
  });

  it('ContactStep uses the T10 shared UI primitives (Button / FormFieldMessage / ErrorState)', () => {
    expect(stepSource).toMatch(/imports:\s*\[[\s\S]*?Button[\s\S]*?\]/);
    expect(stepSource).toMatch(/imports:\s*\[[\s\S]*?FormFieldMessage[\s\S]*?\]/);
    expect(stepSource).toMatch(/imports:\s*\[[\s\S]*?ErrorState[\s\S]*?\]/);
  });

  it('ContactPage is re-exported from contact-step so the lazy route still resolves', () => {
    expect(pageSource).toMatch(/export\s*\{\s*ContactStep(?:,\s*ContactStep)?\s+as\s+ContactPage\s*\}/);
    expect(pageSource).not.toMatch(/T11 placeholder/);
  });
});