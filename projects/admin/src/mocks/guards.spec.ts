/**
 * Spec for the XSRF + session guards
 * (projects/admin/src/mocks/guards.ts).
 *
 * `issueXsrfCookie` rotates the db token and returns the
 * `Set-Cookie` value the response header carries; `csrfRejection`
 * returns the 403 Problem when the request header is missing or
 * stale, and `undefined` when it matches the issued token;
 * `sessionRejection` is the matching 401 guard and clears a stale
 * session id back to `null` (the live re-check the backend does).
 *
 * The XSRF round trip runs through MSW so the cookie actually
 * reaches `document.cookie` (plan D22: MSW writes a mocked
 * `Set-Cookie` to `document.cookie` where `document` exists, jsdom
 * included), proving the wire shape the page-side login flow
 * depends on, not just the in-memory token state.
 */
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { useMswServer, server } from '../testing/msw-server';
import { createDb } from './db';
import { csrfRejection, issueXsrfCookie, sessionAdmin, sessionRejection } from './guards';
import { SEED_ADMIN } from './seed';

useMswServer();

const SESSION_URL = new URL('/api/v1/admin/auth/session', document.baseURI).href;

function readSessionCookie(): string | null {
  const jar = document.cookie.split('; ');
  for (const cookie of jar) {
    const eq = cookie.indexOf('=');
    if (eq < 0) continue;
    if (cookie.slice(0, eq) === 'XSRF-TOKEN') return cookie.slice(eq + 1);
  }
  return null;
}

describe('issueXsrfCookie', () => {
  it('sets the db token and returns the Set-Cookie value', () => {
    const db = createDb();
    const cookie = issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    expect(cookie).toBe(`XSRF-TOKEN=${token}; Path=/`);
  });

  it('returns a different token on the second call', () => {
    const db = createDb();
    const first = db.xsrfToken;
    issueXsrfCookie(db);
    const second = db.xsrfToken;
    expect(first).toBeNull();
    expect(second).not.toBeNull();
    issueXsrfCookie(db);
    const third = db.xsrfToken;
    expect(third).not.toBeNull();
    expect(third).not.toBe(second);
  });
});

describe('csrfRejection', () => {
  it('returns the 403 Problem when no header is present and a token has been issued', () => {
    const db = createDb();
    issueXsrfCookie(db);
    const request = new Request('http://localhost/api/v1/admin/products', { method: 'POST' });

    const rejection = csrfRejection(db, request);
    expect(rejection).toBeDefined();
    if (rejection === undefined) return;
    expect(rejection.status).toBe(403);
  });

  it('returns the 403 Problem when the header is wrong', () => {
    const db = createDb();
    issueXsrfCookie(db);
    const request = new Request('http://localhost/api/v1/admin/products', {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': 'nope' },
    });

    const rejection = csrfRejection(db, request);
    expect(rejection).toBeDefined();
    if (rejection === undefined) return;
    expect(rejection.status).toBe(403);
  });

  it('returns undefined when the header matches the issued token', () => {
    const db = createDb();
    issueXsrfCookie(db);
    const request = new Request('http://localhost/api/v1/admin/products', {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': db.xsrfToken ?? '' },
    });

    expect(csrfRejection(db, request)).toBeUndefined();
  });

  it('returns 403 for any header when no token has been issued', () => {
    const db = createDb();
    const request = new Request('http://localhost/api/v1/admin/products', {
      method: 'POST',
      headers: { 'X-XSRF-TOKEN': 'anything' },
    });

    const rejection = csrfRejection(db, request);
    expect(rejection).toBeDefined();
    if (rejection === undefined) return;
    expect(rejection.status).toBe(403);
  });
});

describe('sessionRejection', () => {
  it('returns the 401 Problem when no admin is signed in', () => {
    const db = createDb();
    const rejection = sessionRejection(db);
    expect(rejection).toBeDefined();
    if (rejection === undefined) return;
    expect(rejection.status).toBe(401);
  });

  it('returns undefined when the seed admin is signed in', () => {
    const db = createDb();
    db.sessionAdminId = SEED_ADMIN.id;
    expect(sessionRejection(db)).toBeUndefined();
  });

  it('clears the session and returns 401 when the admin id is unknown', () => {
    const db = createDb();
    db.sessionAdminId = 'unknown-admin-id';

    const rejection = sessionRejection(db);
    expect(rejection).toBeDefined();
    if (rejection === undefined) return;
    expect(rejection.status).toBe(401);
    expect(db.sessionAdminId).toBeNull();
    expect(sessionAdmin(db)).toBeUndefined();
  });
});

describe('XSRF round trip over MSW', () => {
  it('writes the issued token to document.cookie', async () => {
    const db = createDb();
    const cookie = issueXsrfCookie(db);
    const token = db.xsrfToken ?? '';

    server?.use(
      http.get(
        SESSION_URL,
        () => new HttpResponse(null, { status: 200, headers: { 'Set-Cookie': cookie } }),
      ),
    );

    await fetch(SESSION_URL);
    expect(readSessionCookie()).toBe(token);
  });
});
