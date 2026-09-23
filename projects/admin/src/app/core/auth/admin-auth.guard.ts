import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AdminSession } from './admin-session';
import { LOGIN_PATH } from './login-path';

/**
 * Requires a signed-in admin. The app initializer guarantees `current`
 * is known before the first navigation, so `undefined` is treated as
 * signed out rather than awaited.
 */
export const adminAuthGuard: CanActivateFn = (_route, state) => {
  const session = inject(AdminSession);
  const router = inject(Router);

  const current = session.current();
  if (current !== null && current !== undefined) return true;

  return router.createUrlTree([LOGIN_PATH], { queryParams: { vissza: state.url } });
};
