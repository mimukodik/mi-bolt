// src/app/core/api/demo-session.interceptor.ts — T04-AC05
//
// Adds the X-Demo-Session header to every outgoing HTTP request so MSW can
// namespace state per browser tab. The session id is generated once when the
// module is first evaluated and reused for the rest of the process, matching
// the spec's "process-local" wording (a fresh tab = fresh reload = fresh
// module instance, so a new session id is created per session).
//
// `If-Match` is request-specific: the cart version depends on prior mutations,
// so callers attach it via the `withIfMatch(version)` helper. The interceptor
// reads the version from HttpContext and writes the quoted header value, so
// the format `^"[0-9]+"$` is enforced centrally.
//
// `Idempotency-Key` is also request-specific and is left to callers because
// retry-safety requires the same caller to reuse the same key for retries.

import { HttpContext, HttpContextToken, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';

const DEMO_SESSION_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

const sessionId: string = sanitizeSessionId(globalThis.crypto.randomUUID());

const IF_MATCH_TOKEN = new HttpContextToken<string | null>(() => null);

/**
 * Returns an `HttpContext` carrying a quoted `If-Match` value. Pass the
 * resulting context as the third argument of `api.invoke(...)`; the
 * interceptor picks it up and writes `If-Match: "<version>"` on the
 * outgoing request.
 */
export function withIfMatch(version: string | number): HttpContext {
  return new HttpContext().set(IF_MATCH_TOKEN, String(version));
}

export const demoSessionInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const headers = req.headers.set('X-Demo-Session', sessionId);
  const ifMatch = req.context.get(IF_MATCH_TOKEN);
  const finalHeaders = typeof ifMatch === 'string'
    ? headers.set('If-Match', quoteVersion(ifMatch))
    : headers;
  return next(req.clone({ headers: finalHeaders }));
};

/**
 * randomUUID() emits lowercase hex with dashes; the contract requires the
 * namespace pattern `^[a-zA-Z0-9_-]{8,80}$`, which the raw uuid already
 * matches. The fallback exists for environments that ship a uuid variant
 * with uppercase letters outside that set — keep the contract honest
 * instead of silently widening it.
 */
function sanitizeSessionId(candidate: string): string {
  const trimmed = candidate.trim();
  if (!DEMO_SESSION_PATTERN.test(trimmed)) {
    throw new Error(
      `[mi-bolt] demo session id "${trimmed}" violates the contract pattern ${DEMO_SESSION_PATTERN.source}`,
    );
  }
  return trimmed;
}

function quoteVersion(version: string): string {
  if (/^"\d+"$/.test(version)) return version;
  if (/^\d+$/.test(version)) return `"${version}"`;
  throw new Error(
    `[mi-bolt] withIfMatch(version): version must be a non-negative integer or already-quoted string; got "${version}"`,
  );
}