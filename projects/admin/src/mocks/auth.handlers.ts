import { HttpResponse, http, type HttpHandler } from 'msw';

import { isRecord } from '../app/core/is-record';
import type { Problem } from '../app/api/generated/models/problem';
import {
  asText,
  bodyViolations,
  fieldError,
  firstQueryKey,
  isTextual,
  malformedBody,
  readJsonObject,
  unknownQueryParameter,
} from './backend-answers';
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
    http.get('*/api/v1/admin/auth/session', ({ request }) => {
      const cookie = db.xsrfToken === null ? issueXsrfCookie(db) : undefined;
      const key = firstQueryKey(request);
      if (key !== undefined) {
        const rejection = unknownQueryParameter(key);
        return cookie === undefined ? rejection : withCookie(rejection, cookie);
      }
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

      const key = firstQueryKey(request);
      if (key !== undefined) return unknownQueryParameter(key);

      const body = await readJsonObject(request, ['username', 'password']);
      if (body === undefined) return malformedBody();
      if (!isTextual(body['username']) || !isTextual(body['password'])) return malformedBody();

      const usernameText = asText(body['username']);
      const passwordText = asText(body['password']);
      const errors = [
        ...(usernameText === undefined
          ? [fieldError('/username', 'REQUIRED')]
          : usernameText.length < 1 || usernameText.length > 80
            ? [fieldError('/username', 'SIZE')]
            : []),
        ...(passwordText === undefined
          ? [fieldError('/password', 'REQUIRED')]
          : passwordText.length < 1 || passwordText.length > 64
            ? [fieldError('/password', 'SIZE')]
            : []),
      ];
      if (errors.length > 0) return bodyViolations(errors);
      if (usernameText === undefined || passwordText === undefined) return bodyViolations(errors);

      const admin = [...db.admins.values()].find(
        (candidate) =>
          candidate.user.username === usernameText && candidate.password === passwordText,
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

      const key = firstQueryKey(request);
      if (key !== undefined) return unknownQueryParameter(key);

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

      const key = firstQueryKey(request);
      if (key !== undefined) return unknownQueryParameter(key);

      const body = await readJsonObject(request, ['currentPassword', 'newPassword']);
      if (body === undefined) return malformedBody();
      if (!isTextual(body['currentPassword']) || !isTextual(body['newPassword'])) {
        return malformedBody();
      }

      const currentPasswordText = asText(body['currentPassword']);
      const newPasswordText = asText(body['newPassword']);
      const errors = [
        ...(currentPasswordText === undefined
          ? [fieldError('/currentPassword', 'REQUIRED')]
          : currentPasswordText.length < 1 || currentPasswordText.length > 64
            ? [fieldError('/currentPassword', 'SIZE')]
            : []),
        ...(newPasswordText === undefined
          ? [fieldError('/newPassword', 'REQUIRED')]
          : newPasswordText.length < 15 || newPasswordText.length > 64
            ? [fieldError('/newPassword', 'SIZE')]
            : []),
      ];
      if (errors.length > 0) return bodyViolations(errors);
      if (currentPasswordText === undefined || newPasswordText === undefined)
        return bodyViolations(errors);

      if (currentPasswordText !== admin.password) {
        return problem(422, 'VALIDATION_FAILED', 'Section rejected', {
          detail: 'The current password is wrong',
          fieldErrors: [fieldError('/currentPassword', 'WRONG_PASSWORD')],
        });
      }
      if (new TextEncoder().encode(newPasswordText).length > 72) {
        return problem(422, 'VALIDATION_FAILED', 'Section rejected', {
          detail: 'The new password does not meet the password policy',
          fieldErrors: [fieldError('/newPassword', 'PASSWORD_TOO_LONG')],
        });
      }

      admin.password = newPasswordText;
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
