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
  templateUrl: './contact-step.html',
  styleUrl: './contact-step.scss',
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