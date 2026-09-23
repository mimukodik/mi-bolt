import { HttpResponse, http, type HttpHandler } from 'msw';

import { isRecord } from '../app/core/is-record';
import type { Problem } from '../app/api/generated/models/problem';
import type { MockDb } from './db';
import { csrfRejection, issueXsrfCookie, sessionAdmin } from './guards';
import { problem } from './problem';

/**
 * Re-wraps a `problem()` response with an extra `Set-Cookie`. MSW only
 * forwards a `Set-Cookie` header to `document.cookie` when the header is
 * present at response construction time (`decorateResponse` in
 * `msw/core/utils/HttpResponse/decorators`), so adding it afterward with
 * `response.headers.set(...)` is silently dropped for that purpose.
 */
async function withCookie(response: HttpResponse<Problem>, cookie: string): Promise<Response> {
  const body: unknown = await response.json();
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', cookie);
  if (!isRecord(body)) return new Response(null, { status: response.status, headers });
  return HttpResponse.json(body, { status: response.status, headers });
}

/** The four `AdminAuth` operations: session read, login, logout, password change. */
export function authHandlers(db: MockDb): HttpHandler[] {
  return [
    http.get('*/api/v1/admin/auth/session', () => {
      const cookie = db.xsrfToken === null ? issueXsrfCookie(db) : undefined;
      const admin = sessionAdmin(db);
      if (admin !== undefined) {
        return HttpResponse.json(
          admin.user,
          cookie === undefined ? undefined : { headers: { 'Set-Cookie': cookie } },
        );
      }
      const rejection = problem(401, 'UNAUTHENTICATED', 'Authentication required');
      return cookie === undefined ? rejection : withCookie(rejection, cookie);
    }),

    http.post('*/api/v1/admin/auth/login', async ({ request }) => {
      const csrf = csrfRejection(db, request);
      if (csrf !== undefined) return csrf;

      const body = await request.json();
      const username =
        isRecord(body) && typeof body['username'] === 'string' ? body['username'] : undefined;
      const password =
        isRecord(body) && typeof body['password'] === 'string' ? body['password'] : undefined;
      if (username === undefined || password === undefined) {
        const fieldErrors = [
          ...(username === undefined ? [{ path: '/username', code: 'REQUIRED' }] : []),
          ...(password === undefined ? [{ path: '/password', code: 'REQUIRED' }] : []),
        ];
        return problem(400, 'INVALID_REQUEST', 'Invalid request', {
          detail: 'Missing required member',
          fieldErrors,
        });
      }

      const admin = [...db.admins.values()].find(
        (candidate) => candidate.user.username === username && candidate.password === password,
      );
      if (admin === undefined) {
        return problem(401, 'UNAUTHENTICATED', 'Authentication required', {
          detail: 'Wrong username or password',
        });
      }

      db.sessionAdminId = admin.user.id;
      const cookie = issueXsrfCookie(db);
      return HttpResponse.json(admin.user, { headers: { 'Set-Cookie': cookie } });
    }),

    http.post('*/api/v1/admin/auth/logout', ({ request }) => {
      const csrf = csrfRejection(db, request);
      if (csrf !== undefined) return csrf;

      db.sessionAdminId = null;
      const cookie = issueXsrfCookie(db);
      return new HttpResponse(null, { status: 204, headers: { 'Set-Cookie': cookie } });
    }),

    http.put('*/api/v1/admin/auth/password', async ({ request }) => {
      const csrf = csrfRejection(db, request);
      if (csrf !== undefined) return csrf;
      const admin = sessionAdmin(db);
      if (admin === undefined) {
        return problem(401, 'UNAUTHENTICATED', 'Authentication required');
      }

      const body = await request.json();
      const currentPassword =
        isRecord(body) && typeof body['currentPassword'] === 'string'
          ? body['currentPassword']
          : undefined;
      const newPassword =
        isRecord(body) && typeof body['newPassword'] === 'string' ? body['newPassword'] : undefined;
      if (currentPassword === undefined || newPassword === undefined) {
        const fieldErrors = [
          ...(currentPassword === undefined
            ? [{ path: '/currentPassword', code: 'REQUIRED' }]
            : []),
          ...(newPassword === undefined ? [{ path: '/newPassword', code: 'REQUIRED' }] : []),
        ];
        return problem(400, 'INVALID_REQUEST', 'Invalid request', {
          detail: 'Missing required member',
          fieldErrors,
        });
      }

      if (newPassword.length < 15 || newPassword.length > 64) {
        return problem(422, 'VALIDATION_FAILED', 'Section rejected', {
          detail: 'One or more supplied fields are not acceptable',
          fieldErrors: [{ path: '/newPassword', code: 'SIZE' }],
        });
      }
      if (currentPassword !== admin.password) {
        return problem(422, 'VALIDATION_FAILED', 'Section rejected', {
          detail: 'The current password is wrong',
          fieldErrors: [{ path: '/currentPassword', code: 'WRONG_PASSWORD' }],
        });
      }
      if (new TextEncoder().encode(newPassword).length > 72) {
        return problem(422, 'VALIDATION_FAILED', 'Section rejected', {
          detail: 'The new password does not meet the password policy',
          fieldErrors: [{ path: '/newPassword', code: 'PASSWORD_TOO_LONG' }],
        });
      }

      admin.password = newPassword;
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
