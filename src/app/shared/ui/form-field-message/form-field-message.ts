import { Component, computed, input } from '@angular/core';

/**
 * Wire-shaped FieldError used by the OpenAPI-generated SDK plus server
 * JSON-pointer mappings. Kept local so the primitive is decoupled from
 * the SDK build artefact.
 */
export interface FieldError {
  readonly code: string;
  readonly message: string;
  /** Optional JSON-pointer into the parent payload (server contract). */
  readonly pointer?: string;
}

/**
 * MiBolt FormFieldMessage primitive.
 *
 * Renders the error/help text that must be programmatically associated
 * with a form control. The component owns only the visible message:
 * the input control must add `aria-describedby="<id>"` referencing the
 * exposed `describedById` so a screen reader picks it up.
 *
 * Errors are shown only when the field has been touched or the form has
 * been submitted: it never nags per keystroke (R20). When server-side
 * validation fails the message is tagged `data-pointer` with the
 * originating JSON pointer so the orchestrator can match the error back
 * to its parent payload.
 *
 * Required states:
 * - pristine      — no visible message.
 * - valid         — no visible message.
 * - invalid       — visible error text in the error color.
 * - server-error  — invalid plus `data-pointer` for orchestration.
 */
@Component({
  selector: 'app-form-field-message',
  templateUrl: './form-field-message.html',
  styleUrl: './form-field-message.scss',
})
export class FormFieldMessage {
  readonly fieldId = input.required<string>();
  readonly errors = input<readonly FieldError[]>([]);
  readonly touched = input(false);
  readonly submitted = input(false);
  readonly helpText = input<string | null>(null);
  readonly severity = input<'help' | 'error'>('error');

  readonly describedById = computed(() => `${this.fieldId()}-message`);

  readonly showMessage = computed(() => {
    if (this.severity() === 'help') {
      const help = this.helpText();
      return help !== null && help.length > 0;
    }
    const errs = this.errors();
    if (errs.length === 0) return false;
    return this.touched() || this.submitted();
  });

  readonly visibleText = computed<string>(() => {
    if (this.severity() === 'help') {
      return this.helpText() ?? '';
    }
    const errs = this.errors();
    if (errs.length === 0) return '';
    return errs[0]?.message ?? '';
  });

  readonly dataPointer = computed<string | null>(() => {
    if (this.severity() !== 'error') return null;
    const errs = this.errors();
    if (errs.length === 0) return null;
    return errs[0]?.pointer ?? null;
  });
}
