import { Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import type { MatDialog } from '@angular/material/dialog';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';

/**
 * The save-conflict dialog (412): someone saved the product since it was loaded.
 * It has one way out, Újratöltés; the page then reloads the product and drops the
 * edits. Opened with `disableClose`, so Escape and the backdrop do nothing.
 */
@Component({
  selector: 'adm-conflict-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton],
  template: `
    <h2 mat-dialog-title>Valaki közben módosította ezt a terméket</h2>
    <mat-dialog-content>
      <p>
        A mentés nem történt meg. Töltsd újra a legfrissebb változatot; a módosításaid elvesznek.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-dialog-close matButton="filled" type="button">Újratöltés</button>
    </mat-dialog-actions>
  `,
})
export class ConflictDialog {}

/** Opens {@link ConflictDialog}; emits once when Újratöltés closed it. */
export function openConflict(dialog: MatDialog): Observable<void> {
  return dialog
    .open(ConflictDialog, { disableClose: true, width: '28rem' })
    .afterClosed()
    .pipe(map(() => undefined));
}
