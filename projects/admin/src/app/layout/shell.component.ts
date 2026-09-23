import { Component, DestroyRef, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatSidenavModule } from '@angular/material/sidenav';
import type { MatSidenav } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { AdminSession } from '../core/auth/admin-session';
import { PasswordChangeDialog } from '../features/account/password-change-dialog';

/**
 * Top-level admin shell: side navigation on desktop, drawer on handset.
 * Closes the drawer after every navigation when the viewport is narrow,
 * so a handset user does not see the sidenav linger on top of the next page.
 * The toolbar also carries the signed-in admin's account menu (MIM-339):
 * "Jelszó módosítása" opens a dialog, "Kijelentkezés" signs out and
 * returns to the login page.
 */
@Component({
  selector: 'adm-shell',
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.css',
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatMenuModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
})
export class ShellComponent {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly session = inject(AdminSession);

  readonly drawer = viewChild.required<MatSidenav>('drawer');

  readonly isHandset = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.isHandset()) {
          void this.drawer().close();
        }
      });
  }

  openPasswordChange(): void {
    const ref = this.dialog.open<PasswordChangeDialog, unknown, boolean>(PasswordChangeDialog, {
      width: '28rem',
      autoFocus: 'first-tabbable',
    });
    ref.afterClosed().subscribe((changed) => {
      if (changed === true) {
        this.snackBar.open('Jelszó módosítva.', undefined, { duration: 4000 });
      }
    });
  }

  async logout(): Promise<void> {
    try {
      await this.session.logout();
      await this.router.navigateByUrl('/bejelentkezes');
    } catch {
      this.snackBar.open('A kijelentkezés nem sikerült. Próbáld újra.', undefined, {
        duration: 4000,
      });
    }
  }
}
