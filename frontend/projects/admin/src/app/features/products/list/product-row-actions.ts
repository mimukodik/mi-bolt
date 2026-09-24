/**
 * The row menu of the Termékek table (MIM-352, F17): Archiválás behind the
 * shared confirm dialog, or Visszaállítás on an archived row, with the
 * result reported in a snack-bar. An archive's snack-bar offers
 * Visszavonás, which restores with the version the archive returned.
 */
import { Component, inject, input } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import type { AdminProductListItem } from '../../../api/generated/models/admin-product-list-item';
import { openConfirm } from '../../../shared/confirm-dialog/confirm-dialog';

import { ProductListStore, type RowActionResult } from './product-list.store';

@Component({
  selector: 'adm-product-row-actions',
  imports: [MatIcon, MatIconButton, MatMenu, MatMenuItem, MatMenuTrigger],
  template: `
    <button class="adm-row-menu" matIconButton type="button" [matMenuTriggerFor]="menu">
      <mat-icon>more_vert</mat-icon>
    </button>
    <mat-menu #menu="matMenu">
      @if (item().status === 'active') {
        <button mat-menu-item type="button" (click)="archive()">
          <mat-icon>archive</mat-icon>
          <span>Archiválás</span>
        </button>
      } @else {
        <button mat-menu-item type="button" (click)="restore()">
          <mat-icon>unarchive</mat-icon>
          <span>Visszaállítás</span>
        </button>
      }
    </mat-menu>
  `,
})
export class ProductRowActions {
  private readonly store = inject(ProductListStore);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly item = input.required<AdminProductListItem>();

  async archive(): Promise<void> {
    const item = this.item();
    const confirmed = await firstValueFrom(
      openConfirm(this.dialog, {
        title: 'Termék archiválása',
        message: `Biztosan archiválod: ${item.name}? Eltűnik a boltból, később visszaállítható.`,
        confirmLabel: 'Archiválás',
        cancelLabel: 'Mégse',
        danger: true,
      }),
    );
    if (!confirmed) return;
    const result = await this.store.archive(item);
    if (result.kind === 'done') {
      this.snackBar
        .open(`Archiválva: ${item.name}`, 'Visszavonás')
        .onAction()
        .subscribe(() => void this.restore(result.item));
      return;
    }
    this.report(result, 'Az archiválás nem sikerült. Próbáld újra.');
  }

  async restore(item: AdminProductListItem = this.item()): Promise<void> {
    const result = await this.store.restore(item);
    if (result.kind === 'done') {
      this.snackBar.open(`Visszaállítva: ${item.name}`, undefined, { duration: 4000 });
      return;
    }
    this.report(result, 'A visszaállítás nem sikerült. Próbáld újra.');
  }

  private report(result: Exclude<RowActionResult, { kind: 'done' }>, failed: string): void {
    switch (result.kind) {
      case 'conflict':
        this.snackBar.open(
          'Valaki közben módosította ezt a terméket; a lista frissült.',
          undefined,
          {
            duration: 4000,
          },
        );
        this.store.retry();
        return;
      case 'featured-limit':
        this.snackBar.open('Nem állítható vissza: már 4 aktív kiemelt termék van.', undefined, {
          duration: 4000,
        });
        return;
      case 'failed':
        this.snackBar.open(failed, undefined, { duration: 4000 });
        return;
    }
  }
}
