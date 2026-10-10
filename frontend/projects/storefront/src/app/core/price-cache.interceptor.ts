import { HttpContextToken, type HttpInterceptorFn } from '@angular/common/http';

/** Identifies the shell availability read without changing catalogue filters. */
export const PROMOTION_PROBE = new HttpContextToken<boolean>(() => false);

/** Price-bearing session reads must also bypass entries from older releases. */
export const priceCacheInterceptor: HttpInterceptorFn = (req, next) => {
  const path = new URL(req.url, document.baseURI).pathname;
  const sessionRead = req.method === 'GET' && /\/api\/v1\/(cart|checkout)(\/options)?$/.test(path);
  const read = sessionRead ? req.clone({ cache: 'no-store' }) : req;
  return next(
    req.context.get(PROMOTION_PROBE)
      ? read.clone({ setHeaders: { 'X-Mibolt-Promotion-Probe': 'true' } })
      : read,
  );
};
