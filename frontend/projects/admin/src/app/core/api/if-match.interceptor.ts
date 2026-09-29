import { HttpContext, HttpContextToken, type HttpInterceptorFn } from '@angular/common/http';

const IF_MATCH = new HttpContextToken<string | null>(() => null);

/** Carries a precondition (`"<version>"`, built from a response body) verbatim into the If-Match header of one request. */
export function withIfMatch(precondition: string): HttpContext {
  return new HttpContext().set(IF_MATCH, precondition);
}

export const ifMatchInterceptor: HttpInterceptorFn = (request, next) => {
  const etag = request.context.get(IF_MATCH);
  return next(etag === null ? request : request.clone({ setHeaders: { 'If-Match': etag } }));
};
