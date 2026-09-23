import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AdminSession } from './admin-session';
import { isLoginPath, LOGIN_PATH } from './login-path';
import { SKIP_UNAUTHORIZED_REDIRECT } from './skip-unauthorized-redirect';

/**
 * A 401 from any request that did not opt out with
 * `skipUnauthorizedRedirect()` clears the session and returns to the
 * login page, carrying the page the admin was on as `vissza` unless that
 * page already is the login page. The error is always rethrown so the
 * caller still sees it.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(AdminSession);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !request.context.get(SKIP_UNAUTHORIZED_REDIRECT)
      ) {
        session.clear();
        const currentUrl = router.url;
        const tree = isLoginPath(currentUrl)
          ? router.createUrlTree([LOGIN_PATH])
          : router.createUrlTree([LOGIN_PATH], { queryParams: { vissza: currentUrl } });
        void router.navigateByUrl(tree);
      }
      return throwError(() => error);
    }),
  );
};
