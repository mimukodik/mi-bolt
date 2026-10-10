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

export interface ConflictDifference {
  readonly label: string;
  readonly local: string;
  readonly server: string;
}

@Component({
  selector: 'adm-conflict-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton],
  template: `
    <h2 mat-dialog-title>Valaki közben módosította ezt a terméket</h2>
    <mat-dialog-content>
      <p>
        A mentés nem történt meg. A beviteled megmarad. Hasonlítsd össze a friss szerveradatokat a
        saját értékeiddel; újabb mentéssel ezeket az értékeket mented.
      </p>
      @for (row of differences; track row.label) {
        <h3>{{ row.label }}</h3>
        <p>Saját bevitel: {{ row.local }}</p>
        <p>Friss szerveradat: {{ row.server }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-dialog-close matButton="filled" type="button">Bevitel megtartása</button>
    </mat-dialog-actions>
  `,
})
export class ConflictDialog {
  protected readonly differences = inject<readonly ConflictDifference[]>(MAT_DIALOG_DATA);
}

/** The dialog preserves edits; it never saves or discards them. */
export function openConflict(
  dialog: MatDialog,
  differences: readonly ConflictDifference[] = [],
): Observable<void> {
  return dialog
    .open(ConflictDialog, { disableClose: true, width: '40rem', data: differences })
    .afterClosed()
    .pipe(map(() => undefined));
}
