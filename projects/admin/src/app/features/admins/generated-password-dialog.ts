import { Component, inject } from '@angular/core';
import { CdkCopyToClipboard } from '@angular/cdk/clipboard';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';

/** The data the Új admin flow hands to this dialog: the password lives only here. */
export interface GeneratedPasswordData {
  readonly username: string;
  readonly password: string;
}

/**
 * Shows the password the mock server generated for a newly created admin
 * (MIM-345, F14). Opened with `disableClose: true`; only Bezárás closes
 * it. The password lives only in `data`, never copied into a field or
 * signal of this component.
 */
@Component({
  selector: 'adm-generated-password-dialog',
  templateUrl: './generated-password-dialog.html',
  imports: [
    CdkCopyToClipboard,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatSuffix,
  ],
  styles: `
    .adm-password {
      font-family: monospace;
    }
  `,
})
export class GeneratedPasswordDialog {
  protected readonly data = inject<GeneratedPasswordData>(MAT_DIALOG_DATA);
  private readonly snackBar = inject(MatSnackBar);

  protected onCopied(copied: boolean): void {
    this.snackBar.open(
      copied ? 'Vágólapra másolva.' : 'A másolás nem sikerült; jelöld ki és másold kézzel.',
      undefined,
      { duration: 4000 },
    );
  }
}
