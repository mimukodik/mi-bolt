import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AdminSession } from './admin-session';

/** Redirects a signed-in admin away from the login page; lets everyone else through. */
export const guestOnlyGuard: CanActivateFn = () => {
  const session = inject(AdminSession);
  const router = inject(Router);

  const current = session.current();
  if (current !== null && current !== undefined) return router.createUrlTree(['/attekintes']);

  return true;
};
