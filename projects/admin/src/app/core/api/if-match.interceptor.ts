import { HttpContext, HttpContextToken, type HttpInterceptorFn } from '@angular/common/http';

const IF_MATCH = new HttpContextToken<string | null>(() => null);

/** Carries the server's ETag verbatim into the If-Match header of one request. */
export function withIfMatch(etag: string): HttpContext {
  return new HttpContext().set(IF_MATCH, etag);
}

export const ifMatchInterceptor: HttpInterceptorFn = (request, next) => {
  const etag = request.context.get(IF_MATCH);
  return next(etag === null ? request : request.clone({ setHeaders: { 'If-Match': etag } }));
};
