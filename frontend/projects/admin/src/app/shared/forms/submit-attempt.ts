import { Injectable, Injector, afterNextRender, inject, signal } from '@angular/core';
import { submit } from '@angular/forms/signals';
import type { FieldTree, TreeValidationResult } from '@angular/forms/signals';

/**
 * The submit state every admin form shares. The validation rule is the table in
 * the frontend plan §3: an untouched form shows nothing and stays submittable
 * (R1), the button is disabled while the save runs (R6) and stays disabled
 * after a failed attempt until the form is valid again (R3-R5).
 *
 * Provided per component (`providers: [SubmitAttempt]`), never in root: the
 * `attempted` flag belongs to one form.
 */
@Injectable()
export class SubmitAttempt {
  private readonly injector = inject(Injector);

  /** True from the first submit attempt on, however that attempt ended. */
  readonly attempted = signal(false);

  /** Whether the submit button bound to `form` is disabled. */
  disabled(form: FieldTree<unknown>): boolean {
    return form().submitting() || (this.attempted() && form().invalid());
  }

  /**
   * Submits `form`, marking it as attempted first. The action runs only when the
   * form is valid; otherwise every bound control is marked touched and the first
   * errored one is focused (R3). The focus call goes in `afterNextRender` so the
   * control still exists after the error state has rendered, never in a timer.
   */
  run<T>(form: FieldTree<T>, action: () => Promise<TreeValidationResult>): Promise<boolean> {
    this.attempted.set(true);
    return submit(form, {
      action,
      onInvalid: (field) => {
        afterNextRender(
          () => {
            field().errorSummary()[0]?.fieldTree().focusBoundControl();
          },
          { injector: this.injector },
        );
      },
    });
  }

  /** Whether `field` or one of its descendants holds an error, after an attempt (section counts). */
  hasErrors(field: FieldTree<unknown>): boolean {
    return this.attempted() && field().errorSummary().length > 0;
  }
}
