/**
 * Spec for `usersHandlers` (projects/admin/src/mocks/users.handlers.ts):
 * the three `AdminUsers` operations — list, create, delete — answered
 * exactly as the backend does (MIM-333).
 *
 * Driven through the Node MSW server with `fetch`, exactly as
 * `guards.spec.ts` does.
 */
import { describe, expect, it } from 'vitest';

import { isRecord } from '../app/core/is-record';
import { useMswServer, server } from '../testing/msw-server';
import { createDb, type MockDb } from './db';
import { issueXsrfCookie } from './guards';
import { SEED_ADMIN } from './seed';
import { usersHandlers } from './users.handlers';

useMswServer();

const USERS_URL = new URL('/api/v1/admin/users', document.baseURI).href;

function userUrl(id: string): string {
  return new URL(`/api/v1/admin/users/${id}`, document.baseURI).href;
}

function signIn(db: MockDb): void {
  db.sessionAdminId = SEED_ADMIN.id;
}

function primeToken(db: MockDb): string {
  issueXsrfCookie(db);
  return db.xsrfToken ?? '';
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

/** Reads a JSON response body as a record, asserting the wire shape first. */
async function jsonRecord(res: Response): Promise<Record<string, unknown>> {
  const body: unknown = await res.json();
  expect(isRecord(body)).toBe(true);
  return isRecord(body) ? body : {};
}

/** Reads a JSON response body as an array of records, asserting the wire shape first. */
async function jsonRecords(res: Response): Promise<Record<string, unknown>[]> {
  const body: unknown = await res.json();
  expect(isRecordArray(body)).toBe(true);
  return isRecordArray(body) ? body : [];
}

describe('GET /admin/users', () => {
  it('returns 401 when nobody is signed in', async () => {
    const db = createDb();
    server?.use(...usersHandlers(db));

    const res = await fetch(USERS_URL);
    expect(res.status).toBe(401);
  });

  it('lists every admin ordered by createdAt', async () => {
    const db = createDb();
    signIn(db);
    db.admins.set('id-zed', {
      user: { id: 'id-zed', username: 'zed', createdAt: '2026-09-20T00:00:00Z' },
      password: 'irrelevant-secret-000',
    });
    db.admins.set('id-alice', {
      user: { id: 'id-alice', username: 'alice', createdAt: '2026-09-21T00:00:00Z' },
      password: 'irrelevant-secret-000',
    });
    server?.use(...usersHandlers(db));

    const res = await fetch(USERS_URL);
    expect(res.status).toBe(200);
    const body = await jsonRecords(res);
    expect(body.map((u) => u['username'])).toEqual(['zed', 'alice', SEED_ADMIN.username]);
  });

  it('breaks a createdAt tie by username', async () => {
    const db = createDb();
    signIn(db);
    const createdAt = '2026-09-23T00:00:00Z';
    db.admins.set('id-bob', {
      user: { id: 'id-bob', username: 'bob', createdAt },
      password: 'irrelevant-secret-000',
    });
    db.admins.set('id-amy', {
      user: { id: 'id-amy', username: 'amy', createdAt },
      password: 'irrelevant-secret-000',
    });
    server?.use(...usersHandlers(db));

    const res = await fetch(USERS_URL);
    const body = await jsonRecords(res);
    const names = body
      .filter((u) => u['username'] === 'bob' || u['username'] === 'amy')
      .map((u) => u['username']);
    expect(names).toEqual(['amy', 'bob']);
  });

  // Fails if the unknown-query-key check on this operation is removed or moved before the session check.
  it('rejects an unknown query key with 400', async () => {
    const db = createDb();
    signIn(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(`${USERS_URL}?page=1`);
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body).toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Unknown query parameter',
      params: { parameter: 'page' },
    });
  });
});

describe('POST /admin/users', () => {
  it('rejects with 403 when no XSRF header is sent', async () => {
    const db = createDb();
    signIn(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(USERS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'new-admin' }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects with 401 when no admin is signed in', async () => {
    const db = createDb();
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(USERS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ username: 'new-admin' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a missing username with 400 INVALID_REQUEST', async () => {
    const db = createDb();
    signIn(db);
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(USERS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('INVALID_REQUEST');
    expect(body['detail']).toBe('Missing required member');
    expect(body['fieldErrors']).toEqual([{ path: '/username', code: 'REQUIRED', params: {} }]);
  });

  it('rejects a username over 80 characters with 422 SIZE', async () => {
    const db = createDb();
    signIn(db);
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(USERS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ username: 'a'.repeat(81) }),
    });
    expect(res.status).toBe(422);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('VALIDATION_FAILED');
    expect(body['title']).toBe('Section rejected');
    expect(body['detail']).toBe('One or more supplied fields are not acceptable');
    expect(body['fieldErrors']).toEqual([{ path: '/username', code: 'SIZE', params: {} }]);
  });

  it('rejects a username that fails the pattern with 422 PATTERN', async () => {
    const db = createDb();
    signIn(db);
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(USERS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ username: 'Not_Valid' }),
    });
    expect(res.status).toBe(422);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('VALIDATION_FAILED');
    expect(body['title']).toBe('Section rejected');
    expect(body['detail']).toBe('One or more supplied fields are not acceptable');
    expect(body['fieldErrors']).toEqual([{ path: '/username', code: 'PATTERN', params: {} }]);
  });

  // Fails if the PATTERN and SIZE violations stop being reported together, PATTERN first.
  it('rejects a username that fails both the pattern and the size, PATTERN first', async () => {
    const db = createDb();
    signIn(db);
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(USERS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ username: 'A'.repeat(90) }),
    });
    expect(res.status).toBe(422);
    const body = await jsonRecord(res);
    expect(body).toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      fieldErrors: [
        { path: '/username', code: 'PATTERN', params: {} },
        { path: '/username', code: 'SIZE', params: {} },
      ],
    });
  });

  // Fails if a member the schema does not declare stops making the whole body malformed.
  it('rejects a body with an undeclared member as malformed', async () => {
    const db = createDb();
    signIn(db);
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(USERS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ username: 'bea', role: 'x' }),
    });
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('INVALID_REQUEST');
    expect(body['detail']).toBe('Malformed request body');
  });

  it('rejects an existing username with 409 USERNAME_TAKEN', async () => {
    const db = createDb();
    signIn(db);
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(USERS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ username: SEED_ADMIN.username }),
    });
    expect(res.status).toBe(409);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('USERNAME_TAKEN');
  });

  it('creates an admin with a generated password and 201, and it appears in the list', async () => {
    const db = createDb();
    signIn(db);
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(USERS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-XSRF-TOKEN': token },
      body: JSON.stringify({ username: 'new.admin-1' }),
    });
    expect(res.status).toBe(201);
    const body = await jsonRecord(res);
    expect(isRecord(body['user'])).toBe(true);
    const user = isRecord(body['user']) ? body['user'] : {};
    expect(user['username']).toBe('new.admin-1');
    expect(body['generatedPassword']).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const userId = user['id'];
    expect(typeof userId).toBe('string');
    expect(typeof userId === 'string' && db.admins.has(userId)).toBe(true);

    const list = await fetch(USERS_URL);
    const users = await jsonRecords(list);
    expect(users.some((u) => u['id'] === userId)).toBe(true);
  });
});

describe('DELETE /admin/users/:adminId', () => {
  it('rejects with 403 when no XSRF header is sent', async () => {
    const db = createDb();
    signIn(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(userUrl('some-id'), { method: 'DELETE' });
    expect(res.status).toBe(403);
  });

  it('rejects with 401 when no admin is signed in', async () => {
    const db = createDb();
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(userUrl('some-id'), {
      method: 'DELETE',
      headers: { 'X-XSRF-TOKEN': token },
    });
    expect(res.status).toBe(401);
  });

  // Fails if the UUID-shape check on the path id is removed or its wrongType wording drifts.
  it('rejects an id that is not a UUID with 400', async () => {
    const db = createDb();
    signIn(db);
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(userUrl('not-a-uuid'), {
      method: 'DELETE',
      headers: { 'X-XSRF-TOKEN': token },
    });
    expect(res.status).toBe(400);
    const body = await jsonRecord(res);
    expect(body).toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'adminId', reason: 'type UUID' },
    });
  });

  it('rejects deleting the signed-in admin with 409 ADMIN_SELF_DELETE', async () => {
    const db = createDb();
    signIn(db);
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(userUrl(SEED_ADMIN.id), {
      method: 'DELETE',
      headers: { 'X-XSRF-TOKEN': token },
    });
    expect(res.status).toBe(409);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('ADMIN_SELF_DELETE');
  });

  // Fails if the id is no longer normalised before the self check, so an upper-cased id slips past it.
  it('rejects deleting the signed-in admin by an upper-cased id, normalised first', async () => {
    const db = createDb();
    signIn(db);
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(userUrl(SEED_ADMIN.id.toUpperCase()), {
      method: 'DELETE',
      headers: { 'X-XSRF-TOKEN': token },
    });
    expect(res.status).toBe(409);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('ADMIN_SELF_DELETE');
  });

  it('rejects an unknown id with 404 NOT_FOUND', async () => {
    const db = createDb();
    signIn(db);
    const token = primeToken(db);
    server?.use(...usersHandlers(db));
    const unknownId = '00000000-0000-4000-8000-000000000000';

    const res = await fetch(userUrl(unknownId), {
      method: 'DELETE',
      headers: { 'X-XSRF-TOKEN': token },
    });
    expect(res.status).toBe(404);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('NOT_FOUND');
    expect(body['params']).toEqual({ adminId: unknownId });
  });

  // Fails if the params.adminId the 404 carries stops being the normalised form of the requested id.
  it('rejects the table-cased unknown id with 404, the normalised id in params', async () => {
    const db = createDb();
    signIn(db);
    const token = primeToken(db);
    server?.use(...usersHandlers(db));
    const unknownId = '00000000-0000-4000-8000-00000000abcd';

    const res = await fetch(userUrl(unknownId), {
      method: 'DELETE',
      headers: { 'X-XSRF-TOKEN': token },
    });
    expect(res.status).toBe(404);
    const body = await jsonRecord(res);
    expect(body['code']).toBe('NOT_FOUND');
    expect(body['params']).toEqual({ adminId: unknownId });
  });

  it('deletes a non-self admin: 204, and it is removed', async () => {
    const db = createDb();
    signIn(db);
    const secondId = 'a0000000-0000-4000-8000-000000000002';
    db.admins.set(secondId, {
      user: { id: secondId, username: 'second', createdAt: '2026-09-20T00:00:00Z' },
      password: 'irrelevant-secret-000',
    });
    const token = primeToken(db);
    server?.use(...usersHandlers(db));

    const res = await fetch(userUrl(secondId), {
      method: 'DELETE',
      headers: { 'X-XSRF-TOKEN': token },
    });
    expect(res.status).toBe(204);
    expect(db.admins.has(secondId)).toBe(false);
  });
});
