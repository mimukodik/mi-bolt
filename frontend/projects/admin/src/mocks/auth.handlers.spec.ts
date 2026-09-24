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

import { useMswServer, server } from '../testing/msw-server';
import { ANY_TRACE_ID, SESSION_URL, jsonRecord, xsrfCookie } from '../testing/mock-spec-helpers';
import { authHandlers } from './auth.handlers';
import { createDb } from './db';
import { issueXsrfCookie } from './guards';
import { SEED_ADMIN, SEED_ADMIN_PASSWORD } from './seed';

useMswServer();

const LOGIN_URL = new URL('/api/v1/admin/auth/login', document.baseURI).href;
const LOGOUT_URL = new URL('/api/v1/admin/auth/logout', document.baseURI).href;
const PASSWORD_URL = new URL('/api/v1/admin/auth/password', document.baseURI).href;

function login(username: string, password: string, token: string): Promise<Response> {
  return fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
    body: JSON.stringify({ username, password }),
  });
}

/** POSTs a raw body string to `/admin/auth/login` with a valid XSRF header. */
function loginRaw(db: ReturnType<typeof createDb>, body: string): Promise<Response> {
  const token = db.xsrfToken ?? '';
  return fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
    body,
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

  // Fails if the unknown-query-key check on this operation is removed or moved after the admin lookup.
  it('rejects an unknown query key with 400 and still issues the XSRF cookie', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));

    const res = await fetch(`${SESSION_URL}?x=1`);
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:invalid-request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Unknown query parameter',
      traceId: ANY_TRACE_ID,
      fieldErrors: [],
      params: { parameter: 'x' },
    });
    expect(xsrfCookie()).toBe(db.xsrfToken);
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

  it('rejects a missing password with 400 INVALID_REQUEST', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ username: 'admin' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('INVALID_REQUEST');
    expect(body['detail']).toBe('Missing required member');
    expect(body['fieldErrors']).toEqual([{ path: '/password', code: 'REQUIRED', params: {} }]);
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

  // Fails if the SIZE bound on username (80) is dropped from the login handler.
  it('rejects a username over 80 characters with 422 SIZE', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await login('a'.repeat(85), 'x', token);
    expect(res.status).toBe(422);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:validation-failed',
      title: 'Section rejected',
      status: 422,
      code: 'VALIDATION_FAILED',
      detail: 'One or more supplied fields are not acceptable',
      traceId: ANY_TRACE_ID,
      fieldErrors: [{ path: '/username', code: 'SIZE', params: {} }],
    });
  });

  // Fails if bean validation stops collecting both SIZE violations together.
  it('rejects an empty username and password with 422, both SIZE', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await login('', '', token);
    expect(res.status).toBe(422);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:validation-failed',
      title: 'Section rejected',
      status: 422,
      code: 'VALIDATION_FAILED',
      detail: 'One or more supplied fields are not acceptable',
      traceId: ANY_TRACE_ID,
      fieldErrors: [
        { path: '/username', code: 'SIZE', params: {} },
        { path: '/password', code: 'SIZE', params: {} },
      ],
    });
  });

  // Fails if an empty body stops reporting REQUIRED on every declared member.
  it('rejects an empty body with 400, both REQUIRED', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);

    const res = await loginRaw(db, '{}');
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:invalid-request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Missing required member',
      traceId: ANY_TRACE_ID,
      fieldErrors: [
        { path: '/username', code: 'REQUIRED', params: {} },
        { path: '/password', code: 'REQUIRED', params: {} },
      ],
    });
  });

  // Fails if a null member stops reading as REQUIRED, or a valid sibling starts reporting SIZE too.
  it('rejects a null username with 400, REQUIRED alone', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);

    const res = await loginRaw(db, JSON.stringify({ username: null, password: 'a' }));
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:invalid-request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Missing required member',
      traceId: ANY_TRACE_ID,
      fieldErrors: [{ path: '/username', code: 'REQUIRED', params: {} }],
    });
  });

  // Fails if a numeric username stops being coerced to text and answered as an unknown user.
  it('coerces a numeric username to text, then answers 401', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);

    const res = await loginRaw(db, JSON.stringify({ username: 123, password: 'x' }));
    expect(res.status).toBe(401);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('UNAUTHENTICATED');
    expect(body['detail']).toBe('Wrong username or password');
  });

  // Fails if an array-valued username stops being read as malformed.
  it('rejects an array-valued username as a malformed body', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);

    const res = await loginRaw(db, JSON.stringify({ username: ['a'], password: 'x' }));
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:invalid-request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Malformed request body',
      traceId: ANY_TRACE_ID,
      fieldErrors: [],
    });
  });

  // Fails if an undeclared member stops making the whole body malformed.
  it('rejects a body with an undeclared member as malformed', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);

    const res = await loginRaw(db, JSON.stringify({ username: 'admin', password: 'x', extra: 1 }));
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('INVALID_REQUEST');
    expect(body['detail']).toBe('Malformed request body');
  });

  // Fails if unparsable text or a JSON array body stop being read as malformed.
  it('rejects text that is not JSON and a JSON array body, both malformed', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);

    const notJson = await loginRaw(db, '{not json');
    expect(notJson.status).toBe(400);
    expect((await jsonRecord(notJson))['detail']).toBe('Malformed request body');

    const array = await loginRaw(db, '[]');
    expect(array.status).toBe(400);
    expect((await jsonRecord(array))['detail']).toBe('Malformed request body');
  });

  // Fails if the unknown-query-key check on this operation is removed or moved after CSRF.
  it('rejects an unknown query key with 400', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(`${LOGIN_URL}?next=/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ username: SEED_ADMIN.username, password: SEED_ADMIN_PASSWORD }),
    });
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:invalid-request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Unknown query parameter',
      traceId: ANY_TRACE_ID,
      fieldErrors: [],
      params: { parameter: 'next' },
    });
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

  // Fails if the CSRF check on logout is removed.
  it('rejects with 403 when no XSRF header is sent', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;

    const res = await fetch(LOGOUT_URL, { method: 'POST' });
    expect(res.status).toBe(403);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('CSRF_TOKEN_INVALID');
    expect(db.sessionAdminId).toBe(SEED_ADMIN.id);
  });

  // Fails if the unknown-query-key check on logout is removed.
  it('rejects an unknown query key with 400 and keeps the session', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(`${LOGOUT_URL}?x=1`, {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': token },
    });
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:invalid-request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Unknown query parameter',
      traceId: ANY_TRACE_ID,
      fieldErrors: [],
      params: { parameter: 'x' },
    });
    expect(db.sessionAdminId).toBe(SEED_ADMIN.id);
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

  // Fails if the unknown-query-key check on the password change is removed.
  it('rejects an unknown query key with 400', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(`${PASSWORD_URL}?x=1`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({
        currentPassword: SEED_ADMIN_PASSWORD,
        newPassword: 'a-brand-new-password-1',
      }),
    });
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:invalid-request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Unknown query parameter',
      traceId: ANY_TRACE_ID,
      fieldErrors: [],
      params: { parameter: 'x' },
    });
  });

  it('rejects a missing newPassword with 400 INVALID_REQUEST', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(PASSWORD_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ currentPassword: SEED_ADMIN_PASSWORD }),
    });
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('INVALID_REQUEST');
    expect(body['detail']).toBe('Missing required member');
    expect(body['fieldErrors']).toEqual([{ path: '/newPassword', code: 'REQUIRED', params: {} }]);
  });

  // Fails if an array-valued newPassword stops being read as malformed on this operation too.
  it('rejects an array-valued newPassword as a malformed body', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(PASSWORD_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ currentPassword: SEED_ADMIN_PASSWORD, newPassword: ['x'] }),
    });
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:invalid-request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Malformed request body',
      traceId: ANY_TRACE_ID,
      fieldErrors: [],
    });
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
    expect(body['fieldErrors']).toEqual([{ path: '/newPassword', code: 'SIZE', params: {} }]);
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
    expect(body['fieldErrors']).toEqual([{ path: '/newPassword', code: 'SIZE', params: {} }]);
  });

  // Fails if the empty-currentPassword SIZE violation stops being reported ahead of WRONG_PASSWORD.
  it('rejects an empty currentPassword with 422 SIZE, not WRONG_PASSWORD', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(PASSWORD_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ currentPassword: '', newPassword: 'a-valid-15-char-pw' }),
    });
    expect(res.status).toBe(422);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:validation-failed',
      title: 'Section rejected',
      status: 422,
      code: 'VALIDATION_FAILED',
      detail: 'One or more supplied fields are not acceptable',
      traceId: ANY_TRACE_ID,
      fieldErrors: [{ path: '/currentPassword', code: 'SIZE', params: {} }],
    });
  });

  // Fails if bean validation stops collecting both password SIZE violations together.
  it('rejects an empty currentPassword and a short newPassword with 422, both SIZE', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(PASSWORD_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ currentPassword: '', newPassword: 'short' }),
    });
    expect(res.status).toBe(422);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:validation-failed',
      title: 'Section rejected',
      status: 422,
      code: 'VALIDATION_FAILED',
      detail: 'One or more supplied fields are not acceptable',
      traceId: ANY_TRACE_ID,
      fieldErrors: [
        { path: '/currentPassword', code: 'SIZE', params: {} },
        { path: '/newPassword', code: 'SIZE', params: {} },
      ],
    });
  });

  // Fails if a missing currentPassword stops flipping the answer to 400 while keeping newPassword's SIZE.
  it('rejects a missing currentPassword and a short newPassword with 400, REQUIRED and SIZE', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    db.sessionAdminId = SEED_ADMIN.id;
    issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    const res = await fetch(PASSWORD_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ newPassword: 'short' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body).toEqual({
      type: 'urn:mi-bolt:problem:invalid-request',
      title: 'Invalid request',
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Missing required member',
      traceId: ANY_TRACE_ID,
      fieldErrors: [
        { path: '/currentPassword', code: 'REQUIRED', params: {} },
        { path: '/newPassword', code: 'SIZE', params: {} },
      ],
    });
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
    expect(body['fieldErrors']).toEqual([
      { path: '/currentPassword', code: 'WRONG_PASSWORD', params: {} },
    ]);
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
    expect(body['fieldErrors']).toEqual([
      { path: '/newPassword', code: 'PASSWORD_TOO_LONG', params: {} },
    ]);
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
