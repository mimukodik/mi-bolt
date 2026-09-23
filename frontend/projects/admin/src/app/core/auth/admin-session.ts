import { Service, inject, signal } from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { AdminApi } from '../../api/generated/admin-api';
import { changeAdminPassword } from '../../api/generated/fn/admin-auth/change-admin-password';
import { getAdminSession } from '../../api/generated/fn/admin-auth/get-admin-session';
import { loginAdmin } from '../../api/generated/fn/admin-auth/login-admin';
import { logoutAdmin } from '../../api/generated/fn/admin-auth/logout-admin';
import type { AdminLoginRequest } from '../../api/generated/models/admin-login-request';
import type { AdminPasswordChangeRequest } from '../../api/generated/models/admin-password-change-request';
import type { AdminUser } from '../../api/generated/models/admin-user';
import { skipUnauthorizedRedirect } from './skip-unauthorized-redirect';

/**
 * The signed-in admin's session, backed by `/admin/auth/*`. `current` is
 * `undefined` before `refresh()` has ever completed, `null` once it is
 * known nobody is signed in, and an `AdminUser` once it is known who is.
 * `refresh()` runs as the app initializer (MIM-337), so a route guard
 * evaluated after bootstrap never sees `undefined`.
 */
@Service()
export class AdminSession {
  private readonly api = inject(AdminApi);

  private readonly currentSignal: WritableSignal<AdminUser | null | undefined> = signal(undefined);
  readonly current: Signal<AdminUser | null | undefined> = this.currentSignal.asReadonly();

  /**
   * Reads the session and primes the `XSRF-TOKEN` cookie. Never rejects:
   * it runs as the app initializer, and a rejected initializer stops the
   * application from starting, so every failure (401, 503, a network
   * error) is read as signed out.
   */
  async refresh(): Promise<void> {
    try {
      const user = await firstValueFrom(
        this.api.invoke(getAdminSession, undefined, skipUnauthorizedRedirect()),
      );
      this.currentSignal.set(user);
    } catch {
      this.currentSignal.set(null);
    }
  }

  /**
   * Primes the `XSRF-TOKEN` cookie with a GET session first (its own
   * outcome ignored), so a login after a logout rotated the token still
   * carries a matching `X-XSRF-TOKEN`; then signs in.
   */
  async login(credentials: AdminLoginRequest): Promise<AdminUser> {
    try {
      await firstValueFrom(this.api.invoke(getAdminSession, undefined, skipUnauthorizedRedirect()));
    } catch {
      // The priming GET's own outcome is irrelevant; only its Set-Cookie matters.
    }
    const user = await firstValueFrom(
      this.api.invoke(loginAdmin, { body: credentials }, skipUnauthorizedRedirect()),
    );
    this.currentSignal.set(user);
    return user;
  }

  /**
   * 204 or 401 both mean signed out; any other error leaves `current`
   * unchanged. Skip-marked like the priming GET and the login POST: the
   * caller owns the navigation after a logout, so the interceptor must
   * not also navigate with `vissza`.
   */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.invoke(logoutAdmin, undefined, skipUnauthorizedRedirect()));
      this.currentSignal.set(null);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.currentSignal.set(null);
        return;
      }
      throw err;
    }
  }

  /** Resolves on 204; rejects with the `HttpErrorResponse` otherwise. Never changes `current`. */
  async changePassword(request: AdminPasswordChangeRequest): Promise<void> {
    await firstValueFrom(this.api.invoke(changeAdminPassword, { body: request }));
  }

  /** Sets `current` to signed out, used by `unauthorizedInterceptor`. */
  clear(): void {
    this.currentSignal.set(null);
  }
}
