import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatRow,
  MatRowDef,
  MatTable,
} from '@angular/material/table';
import { MatTooltip } from '@angular/material/tooltip';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';

import { AdminSession } from '../../core/auth/admin-session';
import { openConfirm } from '../../shared/confirm-dialog/confirm-dialog';
import type { AdminUser } from '../../api/generated/models/admin-user';
import type { AdminUserCreated } from '../../api/generated/models/admin-user-created';

import { AdminsStore } from './admins.store';
import { GeneratedPasswordDialog } from './generated-password-dialog';
import type { GeneratedPasswordData } from './generated-password-dialog';
import { NewAdminDialog } from './new-admin-dialog';

const COLUMNS = ['username', 'createdAt', 'actions'] as const;

/**
 * The Adminok page (MIM-344, F13; MIM-345, F14): a Material table of the
 * admins with the signed-in row marked `(te)`, and a Törlés button per
 * row that is disabled with a tooltip for the self row and the
 * last-admin row, asks for confirmation, and reports each server answer
 * in a snack-bar. The "Új admin" button opens `NewAdminDialog`, then the
 * `GeneratedPasswordDialog`; the page keeps no field or signal holding
 * the generated password.
 */
@Component({
  selector: 'adm-admins-page',
  templateUrl: './admins-page.html',
  imports: [
    DatePipe,
    MatButton,
    MatCell,
    MatCellDef,
    MatColumnDef,
    MatHeaderCell,
    MatHeaderCellDef,
    MatHeaderRow,
    MatHeaderRowDef,
    MatIcon,
    MatProgressBar,
    MatRow,
    MatRowDef,
    MatTable,
    MatTooltip,
  ],
  providers: [AdminsStore],
})
export class AdminsPage {
  protected readonly store = inject(AdminsStore);
  protected readonly session = inject(AdminSession);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly columns = COLUMNS;

  constructor() {
    void this.store.load();
  }

  /**
   * Why the Törlés button is disabled for `admin`. The signed-in admin
   * gets the self-delete message; an admin that is the only remaining
   * row gets the last-admin message. Otherwise the button is enabled
   * and the tooltip is hidden.
   */
  protected deleteBlock(admin: AdminUser): string | null {
    if (this.session.current()?.id === admin.id) {
      return 'A saját fiókodat nem törölheted.';
    }
    if (this.store.admins().length === 1) {
      return 'Az utolsó admin nem törölhető.';
    }
    return null;
  }

  /**
   * Opens the confirmation dialog; on confirmation calls the store and
   * shows the snack-bar matching the `DeleteResult`. A click on a
   * blocked button is filtered out by the early return. Public so a
   * spec can await the whole flow the click started.
   */
  async confirmDelete(admin: AdminUser): Promise<void> {
    if (this.deleteBlock(admin) !== null) return;

    const confirmed = await firstValueFrom(
      openConfirm(this.dialog, {
        title: 'Admin törlése',
        message: `Biztosan törlöd: ${admin.username}? A fiók azonnal megszűnik.`,
        confirmLabel: 'Törlés',
        cancelLabel: 'Mégse',
        danger: true,
      }),
    );
    if (!confirmed) return;

    const result = await this.store.delete(admin);
    switch (result.kind) {
      case 'deleted':
        this.snackBar.open(`Admin törölve: ${admin.username}`, undefined, { duration: 4000 });
        return;
      case 'self':
        this.snackBar.open('A saját fiókodat nem törölheted.', undefined, { duration: 4000 });
        break;
      case 'last':
        this.snackBar.open('Az utolsó admin nem törölhető.', undefined, { duration: 4000 });
        break;
      case 'gone':
        this.snackBar.open('Ez az admin már nem létezik.', undefined, { duration: 4000 });
        break;
      case 'failed':
        this.snackBar.open('A törlés nem sikerült. Próbáld újra.', undefined, { duration: 4000 });
        return;
    }
    // After a self / last / gone answer the row is still there (or
    // wasn't ours to remove), so reload to pick up the server's view.
    void this.store.load();
  }

  /**
   * Opens `NewAdminDialog`; on cancel (`created` is `undefined`) returns.
   * On a 201, reloads the list and shows the generated password in a
   * `disableClose` dialog that only Bezárás closes. Public so a spec can
   * await the whole flow the click started.
   */
  async openNewAdmin(): Promise<void> {
    const created = await firstValueFrom(
      this.dialog
        .open<NewAdminDialog, undefined, AdminUserCreated>(NewAdminDialog, {
          width: '28rem',
          autoFocus: 'first-tabbable',
        })
        .afterClosed(),
    );
    if (created === undefined) return;

    void this.store.load();

    await firstValueFrom(
      this.dialog
        .open<GeneratedPasswordDialog, GeneratedPasswordData>(GeneratedPasswordDialog, {
          width: '32rem',
          disableClose: true,
          data: { username: created.user.username, password: created.generatedPassword },
        })
        .afterClosed(),
    );
  }
}
