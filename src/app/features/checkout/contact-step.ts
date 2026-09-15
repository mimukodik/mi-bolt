/**
 * T20 — contact step UI (S4.2).
 *
 * Replaces the T11 stub. Owns the fullName / email / phone entry
 * surface that feeds the T19 CheckoutFacade. The page binds the
 * contact payload through Angular Signal Forms (`@angular/forms/signals`)
 * so validation, touched-state and dirty-state are exposed as
 * signals the template can read directly.
 *
 * Responsibilities:
 *   - render the demo notice and the three labelled inputs with
 *     autocomplete hints (AC02 / AC03);
 *   - validate per the `contact.schema.ts` rules (AC01) using a
 *     combination of built-in (`required`, `maxLength`) and
 *     custom (`validate`) Signal Form rules;
 *   - on submit, focus the form summary then the first invalid
 *     field when the form is invalid, or surface the
 *     server-side error via `ErrorState` when the save fails
 *     (AC02 / AC04);
 *   - prevent duplicate advances while the save is pending
 *     (AC04) and emit `submitContact` on success so the T19
 *     facade can persist the draft;
 *   - normalize the phone on submit so the wire payload always
 *     carries the canonical +36 + 8-9 digits form regardless of
 *     what the user typed.
 *
 * Visual state contract (AC05):
 *   default            → clean surface, no error / help shown.
 *   touched-invalid    → field error visible after blur.
 *   submitted-invalid  → form summary is announced; first invalid
 *                        field receives focus.
 *   loading            → submit button shows "Mentés…" with spinner;
 *                        duplicate submits are blocked.
 *   server-error       → ErrorState appears above the form, Retry
 *                        action re-runs the same save.
 *
 * The page does not own the draft save: it delegates to a
 * `ContactDraftSaver` injected via the `CONTACT_DRAFT_SAVER`
 * token. The default factory resolves immediately so the page
 * works in isolation; the T19 facade will provide the real impl
 * that talks to the SDK.
 */

import {
  Component,
  ElementRef,
  InjectionToken,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  email,
  form,
  FormField,
  maxLength as maxLengthRule,
  required,
  submit,
  validate,
  type FieldTree,
  type ReadonlyFieldTree,
  type ValidationError,
} from '@angular/forms/signals';

import { Button } from '../../shared/ui/button/button';
import {
  FormFieldMessage,
  type FieldError,
} from '../../shared/ui/form-field-message/form-field-message';
import { ErrorState } from '../../shared/ui/error-state/error-state';

import {
  CONTACT_EMAIL_MAX,
  CONTACT_NAME_MAX,
  CONTACT_NAME_MIN,
  CONTACT_PHONE_NATIONAL_DIGITS_MAX,
  CONTACT_PHONE_NATIONAL_DIGITS_MIN,
  normalizeContact,
  pointerToFieldKey,
  type ContactFieldKey,
  type ContactInput,
  type NormalizedContact,
} from './contact.schema';

/**
 * Final shape emitted by the contact step on a successful save.
 * Mirrors the generated `Contact` SDK type, minus the JSONpointer
 * plumbing.
 */
export interface ContactSubmission {
  fullName: string;
  email: string;
  phone: string;
}

/**
 * Server save result. The 422 branch carries per-field errors
 * keyed by `ContactFieldKey`; each error preserves the originating
 * JSONpointer so the orchestrator can match it back to the
 * upstream payload.
 */
export interface ContactSaveResult {
  ok: boolean;
  fieldErrors?: Partial<Record<ContactFieldKey, readonly FieldError[]>>;
  message?: string;
}

/** Pluggable save function the T19 facade will provide. */
export type ContactDraftSaver = (
  contact: ContactSubmission,
) => Promise<ContactSaveResult>;

/** injection token for the draft save. */
export const CONTACT_DRAFT_SAVER = new InjectionToken<ContactDraftSaver>(
  'CONTACT_DRAFT_SAVER',
  {
    providedIn: 'root',
    factory: () => async () => ({ ok: true }),
  },
);

/**
 * Fixture defaults: synthetic data so the demo never hints at a
 * real person. `example.test` is reserved by RFC 2606 for exactly
 * this kind of use; "Teszt Elek" is a Hungarian placeholder name
 * used in test fixtures across the project.
 */
const INITIAL_CONTACT: ContactInput = {
  fullName: 'Teszt Elek',
  email: 'teszt@example.test',
  phone: '+36 30 123 4567',
};

const EMAIL_RFC5322_SUBSET =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const PHONE_E164 = /^\+36\d{8,9}$/;

/** Convert the Signal Form errors array into the local FieldError shape. */
function toFieldErrors(
  errors: readonly ValidationError.WithFieldTree[],
): readonly FieldError[] {
  const out: FieldError[] = [];
  for (const error of errors) {
    const pointer = (error as ValidationError.WithFieldTree & { pointer?: string })
      .pointer;
    out.push({
      code: error.kind,
      message: error.message ?? error.kind,
      ...(pointer !== undefined ? { pointer } : {}),
    });
  }
  return out;
}

@Component({
  selector: 'app-contact-step',
  imports: [
    RouterLink,
    Button,
    FormField,
    FormFieldMessage,
    ErrorState,
  ],
  template: `
    <section class="contact" data-testid="contact-page">
      <header class="heading">
        <nav class="breadcrumbs" aria-label="Navigáció">
          <a routerLink="/penztar/kosar" class="breadcrumb">Kosár</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <span class="breadcrumb is-current" aria-current="page">Adatok</span>
        </nav>
        <h1 class="title">Kapcsolattartási adatok</h1>
        <p class="demo-notice" data-testid="contact-demo-notice" role="note">
          <strong>Demó pénztár.</strong>
          Kérlek, ne használj valós személyes adatokat —
          ez egy működési bemutató, nem küldünk valódi rendelést vagy e-mailt.
        </p>
      </header>

      @if (saveError(); as err) {
        <div class="save-error" data-testid="contact-save-error">
          <app-error-state
            [title]="'A mentés nem sikerült'"
            [message]="err"
            [retryLabel]="'Újrapróbálkozás'"
            [pending]="pendingSave()"
            [preserving]="true"
            (retryRequested)="onRetry()"
          ></app-error-state>
        </div>
      }

      <form
        class="form"
        novalidate
        (submit)="onSubmit($event)"
        data-testid="contact-form"
      >
        <p class="form-hint" id="contact-form-hint">
          A csillaggal jelölt mezők kitöltése kötelező.
        </p>

        <label class="field" [attr.data-state]="fullNameFieldState()">
          <span class="field__label">
            Teljes név <span aria-hidden="true" class="required-mark">*</span>
          </span>
          <input
            id="contact-fullname-input"
            type="text"
            autocomplete="name"
            inputmode="text"
            [formField]="contactForm.fullName"
            [attr.aria-invalid]="fullNameInvalid() ? 'true' : null"
            aria-describedby="contact-fullname-message"
            data-testid="contact-fullname-input"
          />
          <app-form-field-message
            [fieldId]="'contact-fullname'"
            [errors]="fullNameErrors()"
            [touched]="fullNameTouched()"
            [submitted]="submitted()"
            [helpText]="'A számlán is ez a név fog megjelenni.'"
          ></app-form-field-message>
        </label>

        <label class="field" [attr.data-state]="emailFieldState()">
          <span class="field__label">
            E-mail cím <span aria-hidden="true" class="required-mark">*</span>
          </span>
          <input
            id="contact-email-input"
            type="email"
            autocomplete="email"
            inputmode="email"
            [formField]="contactForm.email"
            [attr.aria-invalid]="emailInvalid() ? 'true' : null"
            aria-describedby="contact-email-message"
            data-testid="contact-email-input"
          />
          <app-form-field-message
            [fieldId]="'contact-email'"
            [errors]="emailErrors()"
            [touched]="emailTouched()"
            [submitted]="submitted()"
            [helpText]="'Ide küldjük a demó visszaigazolást.'"
          ></app-form-field-message>
        </label>

        <label class="field" [attr.data-state]="phoneFieldState()">
          <span class="field__label">
            Telefonszám <span aria-hidden="true" class="required-mark">*</span>
          </span>
          <input
            id="contact-phone-input"
            type="tel"
            autocomplete="tel"
            inputmode="tel"
            [formField]="contactForm.phone"
            [attr.aria-invalid]="phoneInvalid() ? 'true' : null"
            aria-describedby="contact-phone-message"
            data-testid="contact-phone-input"
          />
          <app-form-field-message
            [fieldId]="'contact-phone'"
            [errors]="phoneErrors()"
            [touched]="phoneTouched()"
            [submitted]="submitted()"
            [helpText]="'Formátum: +36 30 123 4567 vagy +36-1-234-5678.'"
          ></app-form-field-message>
        </label>

        @if (submitted() && invalidFields().length > 0) {
          <div
            class="form-summary"
            tabindex="-1"
            #summary
            role="alert"
            aria-labelledby="contact-summary-title"
            data-testid="contact-summary"
          >
            <p class="form-summary__title" id="contact-summary-title">
              Kérlek, javítsd a következő mezőket a folytatás előtt:
            </p>
            <ul class="form-summary__list">
              @for (item of invalidFields(); track item.field) {
                <li>
                  <a
                    [href]="'#contact-' + item.field + '-input'"
                    (click)="focusField(item.field, $event)"
                    [attr.data-pointer]="item.pointer ?? null"
                  >
                    {{ item.label }}: {{ item.message }}
                  </a>
                </li>
              }
            </ul>
          </div>
        }

        <div class="form-actions">
          <app-button
            variant="secondary"
            size="comfortable"
            label="Vissza a kosárhoz"
            (pressed)="onBack()"
          ></app-button>
          <app-button
            variant="primary"
            size="comfortable"
            label="Tovább a szállításhoz"
            loadingLabel="Mentés…"
            [loading]="pendingSave()"
            [disabled]="!canSubmit()"
            (pressed)="onSubmit()"
            data-testid="contact-submit"
          ></app-button>
        </div>
      </form>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .contact {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
      }

      .heading {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .breadcrumbs {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .breadcrumb {
        color: var(--color-text-secondary);
        text-decoration: none;
      }

      .breadcrumb:hover,
      .breadcrumb:focus-visible {
        text-decoration: underline;
      }

      .breadcrumb.is-current {
        color: var(--color-text-primary);
        font-weight: var(--weight-medium);
      }

      .breadcrumb__sep {
        margin: 0 var(--space-1);
      }

      .title {
        margin: 0;
        font-size: var(--type-page-title-mobile);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      @media (min-width: 640px) {
        .title {
          font-size: var(--type-page-title);
        }
      }

      .demo-notice {
        margin: 0;
        padding: var(--space-3) var(--space-4);
        background: var(--color-brand-accent-soft);
        border: 1px solid var(--color-brand-accent);
        border-radius: var(--radius-card);
        color: var(--color-text-primary);
        font-size: var(--type-helper);
        line-height: var(--line-height-body);
      }

      .demo-notice strong {
        font-weight: var(--weight-bold);
        color: var(--color-brand-ink);
        margin-right: var(--space-1);
      }

      .save-error {
        display: block;
      }

      .form {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
        max-width: 640px;
      }

      .form-hint {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .field__label {
        font-size: var(--type-helper);
        font-weight: var(--weight-medium);
        color: var(--color-text-primary);
      }

      .required-mark {
        color: var(--color-brand-ink);
        margin-left: var(--space-1);
      }

      .field input {
        min-height: var(--size-control);
        padding: var(--space-2) var(--space-3);
        font-size: var(--type-body);
        color: var(--color-text-primary);
        background: var(--color-surface-light);
        border: 1px solid var(--color-border-control);
        border-radius: var(--radius-control);
      }

      .field input:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .form-summary {
        padding: var(--space-4);
        background: var(--color-brand-accent-soft);
        border: 1px solid var(--color-status-error);
        border-radius: var(--radius-card);
      }

      .form-summary:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .form-summary__title {
        margin: 0 0 var(--space-2);
        font-weight: var(--weight-bold);
        color: var(--color-status-error);
      }

      .form-summary__list {
        margin: 0;
        padding-left: var(--space-5);
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .form-summary__list a {
        color: var(--color-brand-ink);
      }

      .form-actions {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      @media (min-width: 640px) {
        .form-actions {
          flex-direction: row;
          justify-content: space-between;
          align-items: center;
        }
      }

      @media (min-width: 1024px) {
        .form {
          max-width: 720px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .field input,
        .demo-notice,
        .form-summary {
          transition: none;
        }
      }
    `,
  ],
})
export class ContactStep {
  private readonly saver = inject(CONTACT_DRAFT_SAVER);
  private readonly router = inject(Router);

  /** Last successful save payload — emitted so the T19 facade can
   *  persist the draft and continue the wizard. */
  readonly submitContact = output<NormalizedContact>();

  /** Reference to the form summary so we can move focus to it on
   *  invalid submission. */
  private readonly summaryRef =
    viewChild<ElementRef<HTMLElement>>('summary');

  /** Form model. Mirrors the Signal Form root. The schema reads
   *  from this signal so submitting the form serializes the same
   *  values the user sees. */
  readonly model = signal<ContactInput>({ ...INITIAL_CONTACT });

  /** Pending save prevents duplicate advances. */
  readonly pendingSave = signal<boolean>(false);

  /** Generic save-error message that surfaces through the
   *  ErrorState block. Reset on every submit attempt. */
  readonly saveError = signal<string | null>(null);

  /** `true` after the user has tried to submit at least once. */
  readonly submitted = signal<boolean>(false);

  /**
   * Signal Form root. The schema mirrors `contact.schema.ts`
   * exactly; custom `validate` rules handle the bits Signal Forms
   * does not ship a built-in for (trim-aware length bounds,
   * normalized-phone shape, RFC 5322 subset email).
   */
  readonly contactForm = form(this.model, (path) => {
    required(path.fullName, {
      message: 'A teljes név kötelező.',
    });
    maxLengthRule(path.fullName, CONTACT_NAME_MAX, {
      message: 'A teljes név legfeljebb 100 karakter lehet.',
    });
    validate(path.fullName, ({ value }) => {
      const v = (value() ?? '').trim();
      if (v.length === 0) return null;
      if (v.length < CONTACT_NAME_MIN) {
        return {
          kind: 'tooShort',
          message: 'Add meg a teljes neved (legalább 2 karakter).',
        };
      }
      return null;
    });

    required(path.email, {
      message: 'Az e-mail cím kötelező.',
    });
    maxLengthRule(path.email, CONTACT_EMAIL_MAX, {
      message: 'Az e-mail cím legfeljebb 254 karakter lehet.',
    });
    validate(path.email, ({ value }) => {
      const v = (value() ?? '').trim();
      if (v.length === 0) return null;
      if (!EMAIL_RFC5322_SUBSET.test(v)) {
        return {
          kind: 'invalidFormat',
          message: 'Adj meg egy érvényes e-mail címet.',
        };
      }
      return null;
    });

    required(path.phone, {
      message: 'A telefonszám kötelező.',
    });
    validate(path.phone, ({ value }) => {
      const v = (value() ?? '').trim();
      if (v.length === 0) return null;
      const normalized = normalizeContact({
          fullName: '',
          email: '',
          phone: v,
        }).phone;
      if (!PHONE_E164.test(normalized)) {
        return {
          kind: 'invalidPhone',
          message:
            'Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
        };
      }
      if (
        normalized.length - 3 < CONTACT_PHONE_NATIONAL_DIGITS_MIN ||
        normalized.length - 3 > CONTACT_PHONE_NATIONAL_DIGITS_MAX
      ) {
        return {
          kind: 'invalidPhone',
          message:
            'Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
        };
      }
      return null;
    });

    void email;
  });

  // ---- Field state helpers ------------------------------------------

  readonly fullNameErrors = computed<readonly FieldError[]>(() =>
    toFieldErrors(this.contactForm.fullName().errors()),
  );
  readonly fullNameInvalid = computed(() => this.fullNameErrors().length > 0);
  readonly fullNameTouched = computed(() => this.contactForm.fullName().touched());

  readonly emailErrors = computed<readonly FieldError[]>(() =>
    toFieldErrors(this.contactForm.email().errors()),
  );
  readonly emailInvalid = computed(() => this.emailErrors().length > 0);
  readonly emailTouched = computed(() => this.contactForm.email().touched());

  readonly phoneErrors = computed<readonly FieldError[]>(() =>
    toFieldErrors(this.contactForm.phone().errors()),
  );
  readonly phoneInvalid = computed(() => this.phoneErrors().length > 0);
  readonly phoneTouched = computed(() => this.contactForm.phone().touched());

  readonly fullNameFieldState = computed(() =>
    this.computeFieldState(this.fullNameInvalid(), this.fullNameTouched()),
  );
  readonly emailFieldState = computed(() =>
    this.computeFieldState(this.emailInvalid(), this.emailTouched()),
  );
  readonly phoneFieldState = computed(() =>
    this.computeFieldState(this.phoneInvalid(), this.phoneTouched()),
  );

  readonly invalidFields = computed<
    readonly {
      field: ContactFieldKey;
      label: string;
      message: string;
      pointer: string | null;
    }[]
  >(() => {
    const root = this.contactForm;
    const out: {
      field: ContactFieldKey;
      label: string;
      message: string;
      pointer: string | null;
    }[] = [];
    const collect = (
      key: ContactFieldKey,
      label: string,
      field: { errors: () => readonly ValidationError.WithFieldTree[] },
    ): void => {
      const errors = field.errors();
      if (errors.length === 0) return;
      const first = errors[0];
      if (first === undefined) return;
      const pointer =
        (first as ValidationError.WithFieldTree & { pointer?: string })
          .pointer ?? `/${key}`;
      out.push({
        field: key,
        label,
        message: first.message ?? first.kind,
        pointer,
      });
    };
    collect('fullName', 'Teljes név', root.fullName());
    collect('email', 'E-mail cím', root.email());
    collect('phone', 'Telefonszám', root.phone());
    return out;
  });

  /** Submit gating. Disabled while a save is pending so a rapid
   *  second click does not fire the action twice. */
  readonly canSubmit = computed<boolean>(() => !this.pendingSave());

  // ---- Actions ------------------------------------------------------

  onBack(): void {
    void this.router.navigate(['/penztar/kosar']);
  }

  onRetry(): void {
    void this.onSubmit();
  }

  async onSubmit(event?: Event): Promise<void> {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (this.pendingSave()) return;

    this.submitted.set(true);
    this.saveError.set(null);

    this.pendingSave.set(true);
    try {
      const contactForm = this.contactForm;
      const ok = await submit(contactForm, {
        action: async (rootField) => {
          const normalized = normalizeContact(this.model());
          const saveResult = await this.saver(normalized);
          if (saveResult.ok) {
            return undefined;
          }
          if (saveResult.message && !saveResult.fieldErrors) {
            this.saveError.set(saveResult.message);
            return undefined;
          }
          return this.buildServerErrors(saveResult, rootField);
        },
        onInvalid: () => {
          this.focusSummary();
          this.focusFirstInvalidField();
        },
      });

      if (!ok) {
        if (this.contactForm().invalid() && !this.saveError()) {
          this.focusSummary();
          this.focusFirstInvalidField();
        }
        return;
      }

      const normalized = normalizeContact(this.model());
      this.submitContact.emit(normalized);
      void this.router.navigate(['/penztar/szallitas']);
    } finally {
      this.pendingSave.set(false);
    }
  }

  focusSummary(): void {
    queueMicrotask(() => {
      const ref = this.summaryRef();
      if (ref === undefined) return;
      ref.nativeElement.focus();
    });
  }

  focusFirstInvalidField(): void {
    queueMicrotask(() => {
      const first = this.invalidFields()[0];
      if (first === undefined) return;
      const target = document.getElementById(`contact-${first.field}-input`);
      target?.focus();
    });
  }

  focusField(field: ContactFieldKey, event: Event): void {
    event.preventDefault();
    const target = document.getElementById(`contact-${field}-input`);
    target?.focus();
  }

  // ---- Internals ----------------------------------------------------

  private computeFieldState(invalid: boolean, touched: boolean): string {
    if (this.saveError() !== null) return 'server-error';
    if (this.pendingSave()) return 'loading';
    if (invalid && this.submitted()) return 'submitted-invalid';
    if (invalid && touched) return 'touched-invalid';
    return 'default';
  }

  private buildServerErrors(
    saveResult: ContactSaveResult,
    rootField: FieldTree<ContactInput> & ReadonlyFieldTree<ContactInput>,
  ): ValidationError.WithOptionalFieldTree[] {
    const out: ValidationError.WithOptionalFieldTree[] = [];
    const fieldErrors = saveResult.fieldErrors;
    if (fieldErrors !== undefined) {
      for (const key of Object.keys(fieldErrors) as ContactFieldKey[]) {
        const list = fieldErrors[key];
        if (list === undefined) continue;
        const path = this.contactForm[key] as unknown as ReadonlyFieldTree<unknown>;
        for (const fe of list) {
          const pointer = fe.pointer ?? `/${key}`;
          out.push({
            kind: 'server',
            message: fe.message,
            fieldTree: path,
            pointer,
          } as ValidationError.WithOptionalFieldTree & { pointer: string });
        }
      }
    }
    if (out.length === 0) {
      out.push({
        kind: 'server',
        message: saveResult.message ?? 'A mentés nem sikerült.',
        fieldTree: rootField as unknown as ReadonlyFieldTree<unknown>,
      });
    }
    return out;
  }

  resolvePointer(pointer: string): ContactFieldKey | null {
    return pointerToFieldKey(pointer);
  }
}