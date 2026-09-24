/**
 * MIM-423 — the interceptor that keeps a lost demo cookie from stranding
 * the visitor.
 *
 * A gated `/api/v1/*` call that answers the contract's 401
 * `DemoAccessRequired` means the demo cookie is gone, which the guard only
 * notices on the next navigation. The interceptor notices it at the moment
 * it happens: it forgets the remembered yes and sends the visitor to
 * `/belepes` with the page they were on, so the call's own error arrives
 * after the navigation has finished.
 *
 * Only a 401 under `/api/v1` counts, and `/demo/session` is excluded from
 * that: the sign-in call's own 401 is a wrong password rather than a
 * refusal, and the page shows it in place. `GET /media/{imageId}` is the
 * contract's one open shop operation, so it never answers this 401 at all.
 */

import { inject } from '@angular/core';
import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { DEMO_SIGN_IN_PATH, DemoAccess, isDemoSignInUrl } from './demo-access';

/** The path the demo gate protects, after the API root. */
const API_MARKER = '/api/v1/';

/** The one path under `/api/v1` whose 401 is a wrong password, not a refusal. */
const DEMO_SESSION_PATH = '/api/v1/demo/session';

/**
 * Whether `error` is the demo gate refusing `req`: a 401 on a gated
 * `/api/v1` path. A 401 from `/demo/session` itself is the sign-in call's
 * own wrong-password answer and stays with the caller.
 */
function isDemoAccessRefusal(req: HttpRequest<unknown>, error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 401) return false;
  const pathname = new URL(req.url, document.baseURI).pathname;
  if (!pathname.includes(API_MARKER)) return false;
  return !pathname.endsWith(DEMO_SESSION_PATH);
}

export const demoAccessInterceptor: HttpInterceptorFn = (req, next) => {
  const access = inject(DemoAccess);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!isDemoAccessRefusal(req, error)) return throwError(() => error);

      access.markSignedOut();

      // Already on the sign-in page: navigating there again would loop.
      if (isDemoSignInUrl(router.url)) return throwError(() => error);

      const target = router.createUrlTree([DEMO_SIGN_IN_PATH], {
        queryParams: { vissza: router.url },
      });
      return from(router.navigateByUrl(target)).pipe(switchMap(() => throwError(() => error)));
    }),
  );
};
