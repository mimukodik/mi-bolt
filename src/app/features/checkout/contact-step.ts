/**
 * T20 — contact step UI (S4.2).
 *
 * FIX-63 gave `ContactStep` the signature `docs/spec/components.md:551-557`
 * declares: `contactFields`/`saveState` inputs, `continueRequested` output.
 * The component is purely presentational: it renders the three labelled
 * inputs against the `contactFields` Signal Forms field tree the owning
 * container (`contact-page.ts`) passes in, runs its own client-side
 * validation gating and focus management, and reports `saveState` through
 * `saveState()`. It performs no save of its own and knows no
 * `CONTACT_DRAFT_SAVER` or `Router` — the container does the save and the
 * post-save navigation.
 *
 * Responsibilities:
 *   - render the demo notice and the three labelled inputs with
 *     autocomplete hints (AC02 / AC03);
 *   - validate per `contact.schema.ts`'s `contactFormSchema` (AC01),
 *     built by the container into the `contactFields` tree this
 *     component reads;
 *   - on submit, focus the form summary then the first invalid
 *     field when the form is invalid, or emit `continueRequested`
 *     when the form is locally valid (AC02);
 *   - prevent duplicate advances while `saveState()` is `'loading'`
 *     (AC04) and show a generic failure message when it is `'error'`
 *     — no backend detail, matching the pattern `FIX-56` established
 *     for `DeliveryStep` (R15).
 *
 * Visual state contract (AC05):
 *   default            → clean surface, no error / help shown.
 *   touched-invalid    → field error visible after blur.
 *   submitted-invalid  → form summary is announced; first invalid
 *                        field receives focus.
 *   loading            → submit button shows "Mentés…" with spinner;
 *                        duplicate submits are blocked.
 *   server-error       → a generic status message appears above the
 *                        form actions.
 */

import {
  Component,
  ElementRef,
  InjectionToken,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormField, submit, type FieldTree, type ValidationError } from '@angular/forms/signals';

import { Button } from '../../shared/ui/button/button';
import {
  FormFieldMessage,
  type FieldError,
} from '../../shared/ui/form-field-message/form-field-message';
import { StatusMessage } from '../../shared/ui/status-message/status-message';

import type { AsyncStatus } from '../../shared/types/async-status';
import type { Contact } from '../../api/generated/models/contact';

import { pointerToFieldKey, type ContactFieldKey } from './contact.schema';

/**
 * Final shape emitted by the contact step on a successful save.
 * Mirrors the generated `Contact` SDK type, minus the JSONpointer
 * plumbing. Consumed by `ContactPage` (the owning container, FIX-63)
 * and by `checkout.routes.ts`'s `buildContactDraftSaver`.
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

/** Pluggable save function `ContactPage` (the owning container) calls. */
export type ContactDraftSaver = (contact: ContactSubmission) => Promise<ContactSaveResult>;

/** injection token for the draft save. */
export const CONTACT_DRAFT_SAVER = new InjectionToken<ContactDraftSaver>('CONTACT_DRAFT_SAVER', {
  providedIn: 'root',
  factory: () => () => Promise.resolve({ ok: true }),
});

/** Convert the Signal Form errors array into the local FieldError shape. */
function toFieldErrors(errors: readonly ValidationError.WithFieldTree[]): readonly FieldError[] {
  const out: FieldError[] = [];
  for (const error of errors) {
    const pointer = (error as ValidationError.WithFieldTree & { pointer?: string }).pointer;
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
  imports: [RouterLink, Button, FormField, FormFieldMessage, StatusMessage],
  templateUrl: './contact-step.html',
  styleUrl: './contact-step.scss',
})
export class ContactStep {
  readonly contactFields = input.required<FieldTree<Contact>>();
  readonly saveState = input<AsyncStatus>('idle');

  readonly continueRequested = output();

  /** Reference to the form summary so we can move focus to it on
   *  invalid submission. */
  private readonly summaryRef = viewChild<ElementRef<HTMLElement>>('summary');

  /** `true` after the user has tried to submit at least once. */
  readonly submitted = signal<boolean>(false);

  /** `saveState:AsyncStatus` carries no payload (`components.md:551-557`),
   *  so this message is a fixed, generic sentence rather than the wire's
   *  own detail — the container renders the actual save call, and this
   *  component only reports the outcome R15 allows it to show. */
  readonly saveErrorMessage = 'A mentés sikertelen. Próbáld újra.';

  /** Submit gating. Disabled while a save is pending so a rapid
   *  second click does not fire the action twice. */
  readonly canSubmit = computed<boolean>(() => this.saveState() !== 'loading');

  // ---- Field state helpers ------------------------------------------

  readonly fullNameErrors = computed<readonly FieldError[]>(() =>
    toFieldErrors(this.contactFields().fullName().errors()),
  );
  readonly fullNameInvalid = computed(() => this.fullNameErrors().length > 0);
  readonly fullNameTouched = computed(() => this.contactFields().fullName().touched());

  readonly emailErrors = computed<readonly FieldError[]>(() =>
    toFieldErrors(this.contactFields().email().errors()),
  );
  readonly emailInvalid = computed(() => this.emailErrors().length > 0);
  readonly emailTouched = computed(() => this.contactFields().email().touched());

  readonly phoneErrors = computed<readonly FieldError[]>(() =>
    toFieldErrors(this.contactFields().phone().errors()),
  );
  readonly phoneInvalid = computed(() => this.phoneErrors().length > 0);
  readonly phoneTouched = computed(() => this.contactFields().phone().touched());

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
    const root = this.contactFields();
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
      const pointer =
        (first as ValidationError.WithFieldTree & { pointer?: string }).pointer ?? `/${key}`;
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

  // ---- Actions ------------------------------------------------------

  async onSubmit(event?: Event): Promise<void> {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (this.saveState() === 'loading') return;

    this.submitted.set(true);

    const contactFields = this.contactFields();
    const ok = await submit(contactFields, {
      action: () => {
        // No network call from inside the field tree's own submit flow —
        // the container performs the save when `continueRequested` fires.
        return Promise.resolve(undefined);
      },
      onInvalid: () => {
        this.focusSummary();
        this.focusFirstInvalidField();
      },
    });

    if (!ok) {
      if (this.contactFields()().invalid()) {
        this.focusSummary();
        this.focusFirstInvalidField();
      }
      return;
    }

    this.continueRequested.emit();
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
      const invalid = this.invalidFields();
      if (invalid.length === 0) return;
      const first = invalid[0];
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
    if (this.saveState() === 'error') return 'server-error';
    if (this.saveState() === 'loading') return 'loading';
    if (invalid && this.submitted()) return 'submitted-invalid';
    if (invalid && touched) return 'touched-invalid';
    return 'default';
  }

  resolvePointer(pointer: string): ContactFieldKey | null {
    return pointerToFieldKey(pointer);
  }
}
