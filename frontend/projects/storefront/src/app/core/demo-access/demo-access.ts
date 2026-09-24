/**
 * MIM-423 — the demo gate as the storefront sees it.
 *
 * The contract puts every shop operation except `GET /media/{imageId}`
 * behind the `mibolt_demo_access` cookie: without it they answer 401
 * `DemoAccessRequired`. The owner's goal is keeping robots out of the demo
 * rather than a security boundary, so only that 401 closes the shop. A
 * check that failed for any other reason lets the page through: the pages
 * render their own error states, and the backend enforces the gate anyway.
 *
 * `DemoAccess` is the page-lifetime memory of the answer. A `yes` from
 * `GET /demo/session` is kept, so a route change costs no request; a `no`
 * is not remembered, so the next navigation asks again and a visitor who
 * signs in elsewhere is picked up.
 */

import { inject, Service, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { Api } from '@mi-bolt/api/api';
import { createDemoSession } from '@mi-bolt/api/fn/demo-access/create-demo-session';
import { getDemoSession } from '@mi-bolt/api/fn/demo-access/get-demo-session';

/** The one route the demo gate leaves open. */
export const DEMO_SIGN_IN_PATH = '/belepes';

/**
 * Whether `url` is the sign-in route itself, with or without a query string
 * or a sub-path. Used both by the interceptor (a 401 already on the sign-in
 * page must not navigate again) and by `isSafeReturnUrl` (a `vissza`
 * pointing back at the gate would loop).
 */
export function isDemoSignInUrl(url: string): boolean {
  return (
    url === DEMO_SIGN_IN_PATH ||
    url.startsWith(`${DEMO_SIGN_IN_PATH}?`) ||
    url.startsWith(`${DEMO_SIGN_IN_PATH}/`)
  );
}

/**
 * Whether `vissza` is safe to navigate to after a successful sign-in: a
 * same-origin absolute path (blocking `//evil.example` and
 * `https://evil.example`), free of a backslash, and not the sign-in route
 * itself (blocking a redirect loop). The admin's `isSafeTarget` is the
 * same guard for the same reason.
 */
export function isSafeReturnUrl(vissza: string | null): vissza is string {
  return (
    vissza !== null &&
    vissza.startsWith('/') &&
    !vissza.startsWith('//') &&
    !vissza.includes('\\') &&
    !isDemoSignInUrl(vissza)
  );
}

/** The storefront's page-lifetime memory of the demo gate's answer. */
@Service()
export class DemoAccess {
  private readonly api = inject(Api);

  /** The remembered `yes`. A `no` is deliberately not remembered. */
  private readonly signedIn = signal(false);

  /**
   * Asks the server whether the visitor already has demo access, and
   * remembers a `yes`. `false` is the contract's 401 `DemoAccessRequired` —
   * a refusal. Any other failure resolves to `true` without remembering
   * anything, so the page renders and shows its own error state.
   */
  async check(): Promise<boolean> {
    if (this.signedIn()) return true;
    try {
      await firstValueFrom(this.api.invoke(getDemoSession));
      this.signedIn.set(true);
      return true;
    } catch (error: unknown) {
      return !(error instanceof HttpErrorResponse && error.status === 401);
    }
  }

  /**
   * Signs the visitor in with the one demo password. Errors propagate
   * unchanged: the 401 is a wrong password, which the page reports, and
   * anything else is a failure it reports generically.
   */
  async signIn(password: string): Promise<void> {
    await firstValueFrom(this.api.invoke(createDemoSession, { body: { password } }));
    this.signedIn.set(true);
  }

  /**
   * Forgets the remembered `yes`. The interceptor calls this when a gated
   * call answers 401: the cookie is gone, so the next check must ask again.
   */
  markSignedOut(): void {
    this.signedIn.set(false);
  }
}
