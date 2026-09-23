import type { HttpResponse } from 'msw';

import type { Problem } from '../app/api/generated/models/problem';
import type { MockAdmin, MockDb } from './db';
import { problem } from './problem';

export const XSRF_COOKIE = 'XSRF-TOKEN';
export const XSRF_HEADER = 'X-XSRF-TOKEN';

/** Rotates the token and returns the `Set-Cookie` value that carries it (path `/`, readable by the page). */
export function issueXsrfCookie(db: MockDb): string {
  db.xsrfToken = crypto.randomUUID();
  return `${XSRF_COOKIE}=${db.xsrfToken}; Path=/`;
}

/** 403 `CSRF_TOKEN_INVALID` unless the request's header matches the issued token. */
export function csrfRejection(db: MockDb, request: Request): HttpResponse<Problem> | undefined {
  const header = request.headers.get(XSRF_HEADER);
  if (db.xsrfToken !== null && header === db.xsrfToken) return undefined;
  return problem(403, 'CSRF_TOKEN_INVALID', 'CSRF token missing or invalid');
}

/** The signed-in admin, or `undefined` (a deleted admin's session ends here, as the backend's live re-check does). */
export function sessionAdmin(db: MockDb): MockAdmin | undefined {
  const admin = db.sessionAdminId === null ? undefined : db.admins.get(db.sessionAdminId);
  if (admin === undefined) db.sessionAdminId = null;
  return admin;
}

/** 401 `UNAUTHENTICATED` unless an admin is signed in. */
export function sessionRejection(db: MockDb): HttpResponse<Problem> | undefined {
  return sessionAdmin(db) === undefined
    ? problem(401, 'UNAUTHENTICATED', 'Authentication required')
    : undefined;
}
