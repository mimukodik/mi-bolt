import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';

/**
 * The error text of a control that has no `mat-form-field` around it — a toggle
 * group, a slide toggle, the image upload. It shows the same predicate Material
 * uses inside a form field: the first error of a field that was touched and is
 * invalid, so an untouched form still shows nothing (R1, R2).
 *
 * `role="alert"` is what announces the message; bind the control's
 * `aria-describedby` to `errorId`.
 */
@Component({
  selector: 'adm-control-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (field()().touched() && field()().invalid()) {
    <p class="adm-control-error" role="alert" [id]="errorId()">
      {{ field()().errors()[0]?.message }}
    </p>
  }`,
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
}
