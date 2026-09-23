import { HttpContext, HttpContextToken } from '@angular/common/http';

/** Marks a request whose 401 must not clear the session or redirect to the login page. */
export const SKIP_UNAUTHORIZED_REDIRECT = new HttpContextToken<boolean>(() => false);

/** Carries `SKIP_UNAUTHORIZED_REDIRECT` on one request: the session-priming GET session, the login POST, and the logout POST. */
export function skipUnauthorizedRedirect(): HttpContext {
  return new HttpContext().set(SKIP_UNAUTHORIZED_REDIRECT, true);
}
