/**
 * MIM-423 — the guard every shop route carries.
 *
 * It asks `DemoAccess.check()` for the demo gate's answer and sends a
 * signed-out visitor to `/belepes`, carrying the page they wanted in the
 * `vissza` query parameter so the sign-in page can put them back. Only the
 * contract's 401 counts as a refusal, so a check that failed for any other
 * reason lets the navigation through.
 *
 * The two `inject` calls stay above the `await` on purpose: a functional
 * guard is an injection context only for its synchronous part, and an
 * `inject` after an `await` throws NG0203.
 */

import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';

import { DEMO_SIGN_IN_PATH, DemoAccess } from './demo-access';

export const demoAccessGuard: CanActivateFn = async (_route, state) => {
  const access = inject(DemoAccess);
  const router = inject(Router);
  if (await access.check()) return true;
  return router.createUrlTree([DEMO_SIGN_IN_PATH], { queryParams: { vissza: state.url } });
};
