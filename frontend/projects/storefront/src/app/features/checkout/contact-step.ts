/**
 * T20 — contact step UI (S4.2).
 *
 * FIX-63 gave `ContactStep` the signature `docs/spec/components.md:536-542`
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

import type { ElementRef } from '@angular/core';
import {
  Component,
  InjectionToken,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, submit, type FieldTree, type ValidationError } from '@angular/forms/signals';

import { Button } from '../../shared/ui/button/button';
import {
  FormFieldMessage,
  type FieldError,
} from '../../shared/ui/form-field-message/form-field-message';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import { NavigationReasonBanner } from './navigation-reason-banner';

import type { AsyncStatus } from '../../shared/types/async-status';
import type { Contact } from '../../api/generated/models/contact';

import { CheckoutStepHeader, type CheckoutCrumb } from './checkout-step-header';
import { pointerToFieldKey, type ContactFieldKey } from './contact.schema';
import type { ContactFieldErrors, ContactServerErrors } from './contact-server-errors';

/** DOM id of each field's input; the ids are lowercase while the keys are not. */
const INPUT_IDS: Record<ContactFieldKey, string> = {
  fullName: 'contact-fullname-input',
  email: 'contact-email-input',
  phone: 'contact-phone-input',
};

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
  fieldErrors?: ContactFieldErrors;
  message?: string;
}

/** Pluggable save function `ContactPage` (the owning container) calls. */
export type ContactDraftSaver = (contact: ContactSubmission) => Promise<ContactSaveResult>;

/** injection token for the draft save. */
export const CONTACT_DRAFT_SAVER = new InjectionToken<ContactDraftSaver>('CONTACT_DRAFT_SAVER', {
  providedIn: 'root',
  factory: () => () => Promise.resolve({ ok: true }),
});

/** Reads the `pointer` a server-style field error carries; schema-defined
 *  errors do not carry one and the function returns `undefined` for them. */
function errorPointer(error: ValidationError.WithFieldTree): string | undefined {
  if (!('pointer' in error)) return undefined;
  const { pointer } = error;
  return typeof pointer === 'string' ? pointer : undefined;
}

/** Convert the Signal Form errors array into the local FieldError shape. */
function toFieldErrors(errors: readonly ValidationError.WithFieldTree[]): readonly FieldError[] {
  const out: FieldError[] = [];
  for (const error of errors) {
    const pointer = errorPointer(error);
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
    Button,
    CheckoutStepHeader,
    FormField,
    FormFieldMessage,
    NavigationReasonBanner,
    StatusMessage,
  ],
  templateUrl: './contact-step.html',
  styleUrl: './contact-step.scss',
})
export class ContactStep {
  readonly contactFields = input.required<FieldTree<Contact>>();
  readonly saveState = input<AsyncStatus>('idle');
  readonly serverErrors = input<ContactServerErrors | null>(null);

  readonly continueRequested = output();

  /** Reference to the form summary so we can move focus to it on
   *  invalid submission. */
  private readonly summaryRef = viewChild<ElementRef<HTMLElement>>('summary');

  /** `afterNextRender` needs an injector outside the constructor: the
   *  focus moves run after the next render, because the summary and a
   *  field's server-error state only reach the DOM on the next change
   *  detection tick, and a microtask ran before the zoneless scheduler's
   *  tick with the summary ref and the `serverErrors` input still stale. */
  private readonly injector = inject(Injector);

  /** Breadcrumb trail for the shared `CheckoutStepHeader`: the same
   *  trail `delivery-step.ts` and `review-step.ts` open with, so every
   *  checkout step starts at `Főoldal`. This step (`Adatok`) is the
   *  trailing non-link. */
  protected readonly crumbs: readonly CheckoutCrumb[] = [
    { label: 'Főoldal', link: '/' },
    { label: 'Kosár', link: '/penztar/kosar' },
  ];

  /** `true` after the user has tried to submit at least once. */
  readonly submitted = signal<boolean>(false);

  /** `saveState:AsyncStatus` carries no payload (`components.md:536-542`),
   *  so this message is a fixed, generic sentence rather than the wire's
   *  own detail — the container renders the actual save call, and this
   *  component only reports the outcome R15 allows it to show. */
  readonly saveErrorMessage = 'A mentés sikertelen. Próbáld újra.';

  /** Standing "this is a demo" notice rendered as `app-status-message` on
   *  this screen. Persistent: the primitive hides its dismiss button
   *  when `[persistent]` is true (MIM-240b1). */
  readonly demoNoticeMessage =
    'Demó pénztár. Kérlek, ne használj valós személyes adatokat — ez egy működési bemutató, nem küldünk valódi rendelést vagy e-mailt.';

  /** Submit gating. Disabled while a save is pending so a rapid
   *  second click does not fire the action twice. */
  readonly canSubmit = computed<boolean>(() => this.saveState() !== 'loading');

  // ---- Field state helpers ------------------------------------------

  /** Server errors for `key` that still apply: the `Contact` value the
   *  page saved differs from the current form value the moment the user
   *  edits a field, so the message disappears on edit. */
  private serverErrorsFor(key: ContactFieldKey): readonly FieldError[] {
    const s = this.serverErrors();
    if (s === null) return [];
    if (s.values[key] !== this.contactFields()[key]().value()) return [];
    return s.errors[key] ?? [];
  }

  readonly fullNameErrors = computed<readonly FieldError[]>(() => [
    ...toFieldErrors(this.contactFields().fullName().errors()),
    ...this.serverErrorsFor('fullName'),
  ]);
  readonly fullNameInvalid = computed(() => this.fullNameErrors().length > 0);
  readonly fullNameTouched = computed(() => this.contactFields().fullName().touched());
  /** `aria-invalid` is gated on touched/submitted: the message under
   *  the field already uses the same gate, and the border rule keys
   *  off `[aria-invalid='true']`. A pristine required field stays
   *  idle until the shopper has either left it or tried to submit. */
  readonly fullNameShowsInvalid = computed<boolean>(
    () => this.fullNameInvalid() && (this.fullNameTouched() || this.submitted()),
  );

  readonly emailErrors = computed<readonly FieldError[]>(() => [
    ...toFieldErrors(this.contactFields().email().errors()),
    ...this.serverErrorsFor('email'),
  ]);
  readonly emailInvalid = computed(() => this.emailErrors().length > 0);
  readonly emailTouched = computed(() => this.contactFields().email().touched());
  readonly emailShowsInvalid = computed<boolean>(
    () => this.emailInvalid() && (this.emailTouched() || this.submitted()),
  );

  readonly phoneErrors = computed<readonly FieldError[]>(() => [
    ...toFieldErrors(this.contactFields().phone().errors()),
    ...this.serverErrorsFor('phone'),
  ]);
  readonly phoneInvalid = computed(() => this.phoneErrors().length > 0);
  readonly phoneTouched = computed(() => this.contactFields().phone().touched());
  readonly phoneShowsInvalid = computed<boolean>(
    () => this.phoneInvalid() && (this.phoneTouched() || this.submitted()),
  );

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
    const out: {
      field: ContactFieldKey;
      label: string;
      message: string;
      pointer: string | null;
    }[] = [];
    const collect = (key: ContactFieldKey, label: string, errors: readonly FieldError[]): void => {
      if (errors.length === 0) return;
      const first = errors[0];
      out.push({
        field: key,
        label,
        message: first.message,
        pointer: first.pointer ?? `/${key}`,
      });
    };
    collect('fullName', 'Teljes név', this.fullNameErrors());
    collect('email', 'E-mail cím', this.emailErrors());
    collect('phone', 'Telefonszám', this.phoneErrors());
    return out;
  });

  // ---- Actions ------------------------------------------------------

  async onSubmit(event?: Event): Promise<void> {
    if (event !== undefined && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (this.saveState() === 'loading') return;

    this.submitted.set(true);

    const contactFields = this.contactFields();
    const ok = await submit(contactFields, {
      action: () =>
        // No network call from inside the field tree's own submit flow —
        // the container performs the save when `continueRequested` fires.
        Promise.resolve(undefined),
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
    afterNextRender(
      () => {
        const ref = this.summaryRef();
        if (ref === undefined) return;
        ref.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }

  focusFirstInvalidField(): void {
    afterNextRender(
      () => {
        const invalid = this.invalidFields();
        if (invalid.length === 0) return;
        const first = invalid[0];
        const target = document.getElementById(INPUT_IDS[first.field]);
        target?.focus();
      },
      { injector: this.injector },
    );
  }

  focusField(field: ContactFieldKey, event: Event): void {
    event.preventDefault();
    const target = document.getElementById(INPUT_IDS[field]);
    target?.focus();
  }

  /** DOM id of the input for `field`; the ids are lowercase while the
   *  field keys are not. Read from the same map `focusField` uses so
   *  the summary anchor href and the lookup stay in sync. */
  protected inputId(field: ContactFieldKey): string {
    return INPUT_IDS[field];
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
