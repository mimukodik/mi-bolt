// src/app/core/api/demo-session.interceptor.ts — T04-AC05
//
// Adds the X-Demo-Session header to every outgoing HTTP request so MSW can
// namespace state per browser tab. The id is stored in sessionStorage,
// which is scoped to the browser context exactly as architecture.md
// section 8 requires, so a reload of the same tab keeps the namespace
// and the mock's persisted snapshot stays reachable. A new tab gets a
// new id because sessionStorage is not shared between tabs.
//
// `If-Match` is request-specific: the cart version depends on prior mutations,
// so callers attach it via the `withIfMatch(version)` helper. The interceptor
// reads the version from HttpContext and writes the quoted header value, so
// the format `^"[0-9]+"$` is enforced centrally.
//
// `Idempotency-Key` is also request-specific and is left to callers because
// retry-safety requires the same caller to reuse the same key for retries.

import type {
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { HttpContext, HttpContextToken } from '@angular/common/http';
import type { Observable } from 'rxjs';

const DEMO_SESSION_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

/**
sessionStorage key holding the tab-scoped demo session id.
*/
const DEMO_SESSION_STORAGE_KEY = 'mi-bolt.demo-session';

/**
Cached id for this page. Resolved on the first intercepted request.
*/
let cachedSessionId: string | null = null;

/**
 * Returns the sessionStorage object, or null when the environment has
 * none (the Node unit runner) or denies access (private browsing).
 */
function readableStorage(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Resolves the tab-scoped demo session id. architecture.md section 8
 * scopes the demo namespace to the browser context, and a reload is the
 * same context, so the id is read back from sessionStorage when one is
 * already stored and generated once otherwise. A storage-denied context
 * falls back to a page-local id, which is exactly the behaviour every
 * context had before this change.
 */
function resolveSessionId(): string {
  const storage = readableStorage();
  const existing = storage?.getItem(DEMO_SESSION_STORAGE_KEY) ?? null;
  if (existing !== null && DEMO_SESSION_PATTERN.test(existing)) {
    return existing;
  }
  const fresh = sanitizeSessionId(globalThis.crypto.randomUUID());
  try {
    storage?.setItem(DEMO_SESSION_STORAGE_KEY, fresh);
  } catch {
    // Storage denied between the read and the write. The id stays
    // page-local, which is the pre-existing behaviour rather than a
    // new failure mode.
  }
  return fresh;
}

function currentSessionId(): string {
  cachedSessionId ??= resolveSessionId();
  return cachedSessionId;
}

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
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const headers = request.headers.set('X-Demo-Session', currentSessionId());
  const ifMatch = request.context.get(IF_MATCH_TOKEN);
  const finalHeaders =
    typeof ifMatch === 'string' ? headers.set('If-Match', quoteVersion(ifMatch)) : headers;
  return next(request.clone({ headers: finalHeaders }));
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
