import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import type { MatDialog } from '@angular/material/dialog';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';

/** What every admin confirmation asks and how its two buttons are labelled. */
export interface ConfirmDialogData {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  /** Paints the confirm button as destructive (Archiválás, Törlés). */
  readonly danger?: boolean;
}

/**
 * The confirmation dialog of the admin (Archiválás, Törlés, kiléptetés). The
 * cancel button comes first in the DOM on purpose: Material focuses the first
 * tabbable element, so the default answer of a keyboard user is the safe one.
 */
@Component({
  selector: 'adm-confirm-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="false">{{ data.cancelLabel }}</button>
      <button
        matButton="filled"
        type="button"
        [class.adm-danger]="data.danger === true"
        [mat-dialog-close]="true"
      >
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialog {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}

/** Opens {@link ConfirmDialog} and emits `true` only when the user confirmed it. */
export function openConfirm(dialog: MatDialog, data: ConfirmDialogData): Observable<boolean> {
  return dialog
    .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data, width: '28rem' })
    .afterClosed()
    .pipe(map((result) => result === true));
}
