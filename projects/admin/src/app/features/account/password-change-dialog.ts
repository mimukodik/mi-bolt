import { Component, inject, linkedSignal, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormField, form, maxLength, minLength, required, validate } from '@angular/forms/signals';
import type { TreeValidationResult } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';

import { fieldErrorsOf } from '../../core/api/problem';
import { AdminSession } from '../../core/auth/admin-session';
import { MESSAGES } from '../../shared/forms/messages';
import { toServerErrors } from '../../shared/forms/server-errors';
import { SubmitAttempt } from '../../shared/forms/submit-attempt';

interface PasswordChangeModel {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * `changeAdminPassword` (api/generated/fn/admin-auth/change-admin-password.ts)
 * requests `responseType: 'text'`, because its only success shape is 204 with
 * no body; Angular's `HttpXhrBackend` only JSON-parses a response when
 * `responseType === 'json'` (`node_modules/@angular/common/fesm2022/_module-chunk.mjs`,
 * the `onLoad` handler), so on a 422 (or any other) error `err.error` is left
 * as the raw response text rather than a parsed `Problem`, and
 * `fieldErrorsOf` — which expects an already-parsed body — reads it as
 * empty. Reparsing here, only when the body is still a string, is what
 * makes `fieldErrorsOf` see the same `Problem` a JSON-responseType
 * endpoint would have handed it.
 */
function parsedProblemResponse(err: HttpErrorResponse): HttpErrorResponse {
  if (typeof err.error !== 'string') {
    return err;
  }
  try {
    const parsed: unknown = JSON.parse(err.error);
    return new HttpErrorResponse({
      error: parsed,
      headers: err.headers,
      status: err.status,
      url: err.url ?? undefined,
    });
  } catch {
    return err;
  }
}

/**
 * The "Jelszó módosítása" dialog opened from the account menu (MIM-339).
 * Closes with `true` on a successful save, `false` on a 401 (the
 * unauthorized interceptor is already navigating away), `undefined`
 * on cancel.
 */
@Component({
  selector: 'adm-password-change-dialog',
  templateUrl: './password-change-dialog.html',
  imports: [
    FormField,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatSuffix,
  ],
  providers: [SubmitAttempt],
})
export class PasswordChangeDialog {
  private readonly session = inject(AdminSession);

  protected readonly dialogRef = inject(MatDialogRef<PasswordChangeDialog, boolean>);
  protected readonly attempt = inject(SubmitAttempt);

  protected readonly currentVisible = signal(false);
  protected readonly newVisible = signal(false);
  protected readonly confirmVisible = signal(false);

  private readonly model = signal<PasswordChangeModel>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  protected readonly form = form(this.model, (p) => {
    required(p.currentPassword, { message: MESSAGES.required });
    maxLength(p.currentPassword, 64, { message: MESSAGES.maxLength(64) });

    required(p.newPassword, { message: MESSAGES.required });
    minLength(p.newPassword, 15, { message: MESSAGES.minLength(15) });
    maxLength(p.newPassword, 64, { message: MESSAGES.maxLength(64) });

    required(p.confirmPassword, { message: MESSAGES.required });
    validate(p.confirmPassword, (ctx) => {
      const confirmPassword = ctx.value();
      return confirmPassword !== '' && confirmPassword !== ctx.valueOf(p.newPassword)
        ? { kind: 'mismatch', message: MESSAGES.passwordMismatch }
        : null;
    });
  });

  protected readonly failure: WritableSignal<string | null> = linkedSignal<
    PasswordChangeModel,
    string | null
  >({
    source: this.model,
    computation: () => null,
  });

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.attempt.run(this.form, () => this.submit());
  }

  private async submit(): Promise<TreeValidationResult> {
    const { currentPassword, newPassword } = this.model();
    try {
      await this.session.changePassword({ currentPassword, newPassword });
      this.dialogRef.close(true);
      return undefined;
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        const fieldErrors = fieldErrorsOf(parsedProblemResponse(err));
        if (err.status === 422 && fieldErrors.length > 0) {
          return toServerErrors(this.form, fieldErrors);
        }
        if (err.status === 401) {
          this.dialogRef.close(false);
          return undefined;
        }
      }
      this.failure.set('A jelszó módosítása nem sikerült. Próbáld újra.');
      return undefined;
    }
  }
}
