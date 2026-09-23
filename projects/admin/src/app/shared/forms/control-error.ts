import { Component, computed, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';

/**
 * The error text of a control that has no `mat-form-field` around it — a toggle
 * group, a slide toggle, the image upload. It shows the same predicate Material
 * uses inside a form field: the first error of a field that was touched and is
 * invalid, so an untouched form still shows nothing (R1, R2).
 *
 * The paragraph stays in the DOM, empty while there is nothing to show, so an
 * `aria-describedby` bound to `errorId` always resolves and the `role="alert"`
 * live region exists before its text changes, which is what makes the message
 * announced.
 */
@Component({
  selector: 'adm-control-error',
  template: `<p class="adm-control-error" role="alert" [id]="errorId()">{{ message() }}</p>`,
  styles: `
    .adm-control-error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
      margin: 4px 0 0;
    }
  `,
})
export class ControlError {
  readonly field = input.required<FieldTree<unknown>>();
  readonly errorId = input.required<string>();

  /** The first error of a touched, invalid field, and an empty string otherwise. */
  protected readonly message = computed(() => {
    const state = this.field()();
    return state.touched() && state.invalid() ? (state.errors()[0]?.message ?? '') : '';
  });
}
