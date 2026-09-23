/**
 * Spec for `authHandlers` (projects/admin/src/mocks/auth.handlers.ts):
 * the four `AdminAuth` operations — session read, login, logout, password
 * change — answered exactly as the backend does (MIM-333).
 *
 * Driven through the Node MSW server with `fetch`, exactly as
 * `guards.spec.ts` does, so the cookie assertions read the real
 * `document.cookie` the browser-side login flow depends on.
 */
import { describe, expect, it } from 'vitest';

import { isRecord } from '../app/core/is-record';
import { useMswServer, server } from '../testing/msw-server';
import { authHandlers } from './auth.handlers';
import { createDb } from './db';
import { issueXsrfCookie } from './guards';
import { SEED_ADMIN, SEED_ADMIN_PASSWORD } from './seed';

useMswServer();

const SESSION_URL = new URL('/api/v1/admin/auth/session', document.baseURI).href;
const LOGIN_URL = new URL('/api/v1/admin/auth/login', document.baseURI).href;
const LOGOUT_URL = new URL('/api/v1/admin/auth/logout', document.baseURI).href;
const PASSWORD_URL = new URL('/api/v1/admin/auth/password', document.baseURI).href;

function xsrfCookie(): string | null {
  const jar = document.cookie.split('; ');
  for (const cookie of jar) {
    const eq = cookie.indexOf('=');
    if (eq < 0) continue;
    if (cookie.slice(0, eq) === 'XSRF-TOKEN') return cookie.slice(eq + 1);
  }
  return null;
}

/** Reads a JSON response body as a record, asserting the wire shape first. */
async function jsonRecord(res: Response): Promise<Record<string, unknown>> {
  const body: unknown = await res.json();
  expect(isRecord(body)).toBe(true);
  return isRecord(body) ? body : {};
}

function login(username: string, password: string, token: string): Promise<Response> {
  return fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
    body: JSON.stringify({ username, password }),
  });
}

describe('GET /admin/auth/session', () => {
  it('returns 401 and issues the XSRF cookie when nobody is signed in', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));

    const res = await fetch(SESSION_URL);
    expect(res.status).toBe(401);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('UNAUTHENTICATED');
    expect(body['detail']).toBe('Authentication required');
    expect(xsrfCookie()).toBe(db.xsrfToken);
  });

  it('returns 200 with the user after logging in', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));

    await fetch(SESSION_URL);
    const token = db.xsrfToken ?? '';
    await login(SEED_ADMIN.username, SEED_ADMIN_PASSWORD, token);

    const res = await fetch(SESSION_URL);
    expect(res.status).toBe(200);
    const body = await jsonRecord(res);
    expect(body).toEqual(SEED_ADMIN);
  });
});

describe('POST /admin/auth/login', () => {
  it('rejects with 403 when no XSRF header is sent', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));

    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: SEED_ADMIN.username, password: SEED_ADMIN_PASSWORD }),
    });
    expect(res.status).toBe(403);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('CSRF_TOKEN_INVALID');
  });

  it('rejects a wrong password with 401 UNAUTHENTICATED / Wrong username or password', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await login(SEED_ADMIN.username, 'not-the-password', token);
    expect(res.status).toBe(401);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('UNAUTHENTICATED');
    expect(body['detail']).toBe('Wrong username or password');
  });

  it('rejects an unknown user with the same 401 code and detail', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await login('nobody', 'whatever', token);
    expect(res.status).toBe(401);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('UNAUTHENTICATED');
    expect(body['detail']).toBe('Wrong username or password');
  });

  it('signs in and rotates the XSRF cookie on success', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    await fetch(SESSION_URL);
    const tokenBefore = xsrfCookie();

    const res = await login(SEED_ADMIN.username, SEED_ADMIN_PASSWORD, tokenBefore ?? '');
    expect(res.status).toBe(200);
    const body = await jsonRecord(res);
    expect(body).toEqual(SEED_ADMIN);
    expect(db.sessionAdminId).toBe(SEED_ADMIN.id);

    const tokenAfter = xsrfCookie();
    expect(tokenAfter).not.toBeNull();
    expect(tokenAfter).not.toBe(tokenBefore);
  });
});

describe('POST /admin/auth/logout', () => {
  it('signs out and rotates the token, then the session read is 401', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(LOGOUT_URL, { method: 'POST', headers: { 'X-XSRF-TOKEN': token } });
    expect(res.status).toBe(204);
    expect(db.sessionAdminId).toBeNull();

    const session = await fetch(SESSION_URL);
    expect(session.status).toBe(401);
  });
});

describe('PUT /admin/auth/password', () => {
  it('rejects with 403 when no XSRF header is sent', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;

    const res = await fetch(PASSWORD_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: SEED_ADMIN_PASSWORD,
        newPassword: 'a-brand-new-password-1',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects with 401 when no admin is signed in', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(PASSWORD_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({
        currentPassword: SEED_ADMIN_PASSWORD,
        newPassword: 'a-brand-new-password-1',
      }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a new password shorter than 15 characters with 422 SIZE', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(PASSWORD_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ currentPassword: SEED_ADMIN_PASSWORD, newPassword: 'short' }),
    });
    expect(res.status).toBe(422);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('VALIDATION_FAILED');
    expect(body['title']).toBe('Section rejected');
    expect(body['detail']).toBe('One or more supplied fields are not acceptable');
    expect(body['fieldErrors']).toEqual([{ path: '/newPassword', code: 'SIZE' }]);
  });

  it('rejects a new password longer than 64 characters with 422 SIZE', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(PASSWORD_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ currentPassword: SEED_ADMIN_PASSWORD, newPassword: 'a'.repeat(65) }),
    });
    expect(res.status).toBe(422);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('VALIDATION_FAILED');
    expect(body['fieldErrors']).toEqual([{ path: '/newPassword', code: 'SIZE' }]);
  });

  it('rejects a wrong current password with 422 WRONG_PASSWORD', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(PASSWORD_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({
        currentPassword: 'not-the-password',
        newPassword: 'a-brand-new-password-1',
      }),
    });
    expect(res.status).toBe(422);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('VALIDATION_FAILED');
    expect(body['title']).toBe('Section rejected');
    expect(body['detail']).toBe('The current password is wrong');
    expect(body['fieldErrors']).toEqual([{ path: '/currentPassword', code: 'WRONG_PASSWORD' }]);
  });

  it('rejects a new password over 72 UTF-8 bytes with 422 PASSWORD_TOO_LONG', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';
    // 'é' is one UTF-16 code unit (within the 15-64 char SIZE window) and
    // two UTF-8 bytes, so 40 of them are 40 chars / 80 bytes: over the
    // 72-byte cap without tripping the character-count check first.
    const newPassword = 'é'.repeat(40);
    expect(newPassword.length).toBe(40);
    expect(new TextEncoder().encode(newPassword).length).toBe(80);

    const res = await fetch(PASSWORD_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ currentPassword: SEED_ADMIN_PASSWORD, newPassword }),
    });
    expect(res.status).toBe(422);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('VALIDATION_FAILED');
    expect(body['title']).toBe('Section rejected');
    expect(body['detail']).toBe('The new password does not meet the password policy');
    expect(body['fieldErrors']).toEqual([{ path: '/newPassword', code: 'PASSWORD_TOO_LONG' }]);
  });

  it('changes the password: 204, then the new password signs in and the old does not', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';
    const newPassword = 'a-brand-new-password-1';

    const change = await fetch(PASSWORD_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ currentPassword: SEED_ADMIN_PASSWORD, newPassword }),
    });
    expect(change.status).toBe(204);

    db.sessionAdminId = null;
    const oldLogin = await login(SEED_ADMIN.username, SEED_ADMIN_PASSWORD, token);
    expect(oldLogin.status).toBe(401);

    const newLogin = await login(SEED_ADMIN.username, newPassword, token);
    expect(newLogin.status).toBe(200);
  });
});
