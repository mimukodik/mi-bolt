import { Component, inject, linkedSignal, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormField, form, maxLength, required, validate } from '@angular/forms/signals';
import type { TreeValidationResult } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogState,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';

import { AdminApi } from '../../api/generated/admin-api';
import { createAdminUser } from '../../api/generated/fn/admin-users/create-admin-user';
import type { AdminUserCreated } from '../../api/generated/models/admin-user-created';
import { fieldErrorsOf, problemOf } from '../../core/api/problem';
import { MESSAGES } from '../../shared/forms/messages';
import { toServerErrors } from '../../shared/forms/server-errors';
import { SubmitAttempt } from '../../shared/forms/submit-attempt';

interface NewAdminModel {
  username: string;
}

/**
 * The username pattern the mock's `matchesUsernamePattern`
 * (`projects/admin/src/mocks/users.handlers.ts`) enforces server-side:
 * lowercase letters, digits and the three separators, no leading or
 * trailing separator, no run of two or more separators in a row. Written
 * as three tests rather than one nested-quantifier regex, which the
 * `security/detect-unsafe-regex` lint rule refuses.
 */
function isValidUsername(value: string): boolean {
  return /^[a-z0-9._-]+$/.test(value) && !/^[._-]|[._-]$/.test(value) && !/[._-]{2,}/.test(value);
}

/**
 * The "Új admin" dialog opened from the Adminok page (MIM-345, F14).
 * Closes with the `AdminUserCreated` body on a successful 201, with
 * nothing on cancel.
 * While the request is in flight neither Escape, the backdrop nor Mégse
 * closes it, so a created admin's password is never lost.
 */
@Component({
  selector: 'adm-new-admin-dialog',
  templateUrl: './new-admin-dialog.html',
  imports: [
    FormField,
    MatButton,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatHint,
    MatInput,
    MatLabel,
  ],
  providers: [SubmitAttempt],
  styles: `
    .adm-dialog-error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
      margin: 4px 0 0;
    }
  `,
})
export class NewAdminDialog {
  private readonly api = inject(AdminApi);

  protected readonly dialogRef = inject(MatDialogRef<NewAdminDialog, AdminUserCreated>);
  protected readonly attempt = inject(SubmitAttempt);

  private readonly model = signal<NewAdminModel>({ username: '' });

  protected readonly form = form(this.model, (p) => {
    required(p.username, { message: MESSAGES.required });
    maxLength(p.username, 80, { message: MESSAGES.maxLength(80) });
    validate(p.username, (ctx) => {
      const value = ctx.value();
      return value !== '' && !isValidUsername(value)
        ? { kind: 'pattern', message: MESSAGES.usernamePattern }
        : null;
    });
  });

  protected readonly failure: WritableSignal<string | null> = linkedSignal<
    NewAdminModel,
    string | null
  >({
    source: this.model,
    computation: () => null,
  });

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.attempt.run(this.form, () => this.submit());
  }

  /** Whether the dialog has not already started closing. */
  private get isOpen(): boolean {
    return this.dialogRef.getState() === MatDialogState.OPEN;
  }

  /** Mégse: closes with no result, unless a close is already under way. */
  protected cancel(): void {
    if (this.isOpen) {
      this.dialogRef.close();
    }
  }

  private async submit(): Promise<TreeValidationResult> {
    const { username } = this.model();
    this.dialogRef.disableClose = true;
    try {
      const created = await firstValueFrom(
        this.api.invoke(createAdminUser, { body: { username } }),
      );
      this.dialogRef.close(created);
      return undefined;
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        const fieldErrors = fieldErrorsOf(err);
        if (err.status === 422 && fieldErrors.length > 0) {
          return toServerErrors(this.form, fieldErrors);
        }
        if (err.status === 409 && problemOf(err)?.code === 'USERNAME_TAKEN') {
          return [
            { kind: 'server', message: MESSAGES.usernameTaken, fieldTree: this.form.username },
          ];
        }
        if (err.status === 401) {
          this.dialogRef.close();
          return undefined;
        }
      }
      this.failure.set('Az admin létrehozása nem sikerült. Próbáld újra.');
      return undefined;
    } finally {
      // A close already started keeps Escape and the backdrop blocked: a second
      // close would replace the result on its way out.
      if (this.isOpen) {
        this.dialogRef.disableClose = false;
      }
    }
  }
}
