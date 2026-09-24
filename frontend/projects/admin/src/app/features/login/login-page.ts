import { Component, inject, linkedSignal, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import type { TreeValidationResult } from '@angular/forms/signals';

import { AdminSession } from '../../core/auth/admin-session';
import { isLoginPath } from '../../core/auth/login-path';
import { applyMaterialSymbolsFont } from '../../core/icons/icon-font';
import { MESSAGES } from '../../shared/forms/messages';
import { SubmitAttempt } from '../../shared/forms/submit-attempt';

/** The overview page: where a signed-in admin lands with no `vissza` to return to. */
const DEFAULT_TARGET = '/attekintes';

/**
 * Whether `vissza` is safe to navigate to after a successful login: a
 * same-origin absolute path (blocking `//evil.example` and
 * `https://evil.example`), free of a backslash, and not the login route
 * itself (blocking a redirect loop).
 */
function isSafeTarget(vissza: string | null): vissza is string {
  return (
    vissza !== null &&
    vissza.startsWith('/') &&
    !vissza.startsWith('//') &&
    !vissza.includes('\\') &&
    !isLoginPath(vissza)
  );
}

/** The Bejelentkezés page: Felhasználónév, Jelszó with a visibility toggle, Belépés. */
@Component({
  selector: 'adm-login-page',
  templateUrl: './login-page.html',
  imports: [
    FormField,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  providers: [SubmitAttempt],
  styles: `
    .adm-login-error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-medium);
      margin: 0 0 8px;
    }
  `,
})
export class LoginPage {
  private readonly session = inject(AdminSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly attempt = inject(SubmitAttempt);

  private readonly model = signal({ username: '', password: '' });

  protected readonly form = form(this.model, (p) => {
    required(p.username, { message: MESSAGES.required });
    maxLength(p.username, 80, { message: MESSAGES.maxLength(80) });
    required(p.password, { message: MESSAGES.required });
    maxLength(p.password, 64, { message: MESSAGES.maxLength(64) });
  });

  /** The 401/failure alert; any edit to the model clears it (R8). */
  protected readonly loginError: WritableSignal<string | null> = linkedSignal({
    source: this.model,
    computation: () => null,
  });

  protected readonly passwordVisible = signal(false);

  constructor() {
    applyMaterialSymbolsFont();
  }

  protected togglePassword(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await this.attempt.run(this.form, () => this.login());
  }

  private async login(): Promise<TreeValidationResult> {
    try {
      await this.session.login(this.model());
    } catch (err) {
      this.loginError.set(
        err instanceof HttpErrorResponse && err.status === 401
          ? 'Hibás felhasználónév vagy jelszó.'
          : 'A bejelentkezés nem sikerült. Próbáld újra.',
      );
      return undefined;
    }
    const vissza = this.route.snapshot.queryParamMap.get('vissza');
    await this.router.navigateByUrl(isSafeTarget(vissza) ? vissza : DEFAULT_TARGET, {
      replaceUrl: true,
    });
    return undefined;
  }
}
