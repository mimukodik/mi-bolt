/**
 * Spec for `AdminsStore` (projects/admin/src/app/features/admins/admins.store.ts):
 * `load()` reads the admin list and orders it by `createdAt` then `username`
 * — the same order the backend answers with, so the store never re-sorts —
 * and `delete()` maps each server answer to its `DeleteResult` kind
 * (MIM-344, F13). Driven through MSW exactly as `admin-session.spec.ts`
 * does, with the XSRF cookie primed via `issueXsrfCookie`.
 *
 * `root_url_used`: `resolveApiRoot()` — same string the mock spec uses for
 * `/api/v1/admin/users`, and what `app.config.ts` wires in production.
 */
import { HttpResponse, http } from 'msw';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { MOCK_PLATFORM_LOCATION_CONFIG } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveApiRoot } from '@mi-bolt/core-api/api-root';

import { provideApiConfiguration } from '../../api/generated/api-configuration';
import { issueXsrfCookie } from '../../../mocks/guards';
import { createDb } from '../../../mocks/db';
import { SEED_ADMIN } from '../../../mocks/seed';
import { server, useMswServer } from '../../../testing/msw-server';
import { usersHandlers } from '../../../mocks/users.handlers';
import type { MockDb } from '../../../mocks/db';

import { AdminsStore } from './admins.store';

useMswServer();

const OTHER_ADMIN_ID = 'a0000000-0000-4000-8000-000000000002';
const OTHER_ADMIN = {
  id: OTHER_ADMIN_ID,
  username: 'second',
  createdAt: '2026-09-20T00:00:00Z',
} as const;

function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withXhr()),
      provideApiConfiguration(resolveApiRoot()),
      provideRouter([]),
      AdminsStore,
      { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: document.baseURI } },
    ],
  });
}

function primeXsrf(db: MockDb): void {
  issueXsrfCookie(db);
  // The mock's CSRF check sees the `X-XSRF-TOKEN` request header against
  // the db's stored token; Angular's built-in XSRF interceptor reads that
  // token from `document.cookie`, so set it for the page's HttpClient
  // to pick up on the DELETE.
  document.cookie = `XSRF-TOKEN=${db.xsrfToken ?? ''}; Path=/`;
}

function signedInDb(): MockDb {
  const db = createDb();
  db.sessionAdminId = SEED_ADMIN.id;
  db.admins.set(OTHER_ADMIN_ID, {
    user: { ...OTHER_ADMIN },
    password: 'irrelevant-secret-000',
  });
  return db;
}

describe('AdminsStore', () => {
  beforeEach(() => {
    configureTestBed();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/';
  });

  // Fails if `load()` does not map a 200 to `status() === 'ready'` and to the
  // handler's `createdAt`-then-`username` order (the order the backend ships).
  it('case 1: load() sets status ready and admins in handler order', async () => {
    const db = signedInDb();
    server?.use(...usersHandlers(db));

    const store = TestBed.inject(AdminsStore);
    await store.load();

    expect(store.status()).toBe('ready');
    const expected = [...db.admins.values()]
      .map((entry) => entry.user)
      .sort((a, b) => {
        const byCreatedAt = a.createdAt.localeCompare(b.createdAt);
        return byCreatedAt !== 0 ? byCreatedAt : a.username.localeCompare(b.username);
      });
    expect(store.admins()).toEqual(expected);
  });

  // Fails if `load()` does not catch every failure and keep the previous list.
  it('case 1b: load() on a 503 leaves admins unchanged and status error', async () => {
    const db = signedInDb();
    server?.use(...usersHandlers(db));
    server?.use(http.get('*/api/v1/admin/users', () => HttpResponse.json(null, { status: 503 })));

    const store = TestBed.inject(AdminsStore);
    await store.load();

    expect(store.status()).toBe('error');
    expect(store.admins()).toEqual([]);
  });

  // Fails if a 204 does not remove the admin locally and answer `{ kind: 'deleted' }`.
  it('case 2: delete(other) returns deleted and removes the admin', async () => {
    const db = signedInDb();
    primeXsrf(db);
    server?.use(...usersHandlers(db));

    const store = TestBed.inject(AdminsStore);
    await store.load();
    const other = store.admins().find((admin) => admin.id === OTHER_ADMIN_ID);
    if (other === undefined) throw new Error('expected the second admin in the seeded db');

    const result = await store.delete(other);

    expect(result).toEqual({ kind: 'deleted' });
    expect(store.admins().map((admin) => admin.id)).toEqual([SEED_ADMIN.id]);
    expect(db.admins.has(OTHER_ADMIN_ID)).toBe(false);
  });

  // Fails if a 409 `ADMIN_SELF_DELETE` does not map to `{ kind: 'self' }`.
  it('case 2b: delete(self) returns self and leaves the admin in the list', async () => {
    const db = signedInDb();
    primeXsrf(db);
    server?.use(...usersHandlers(db));

    const store = TestBed.inject(AdminsStore);
    await store.load();
    const self = store.admins().find((admin) => admin.id === SEED_ADMIN.id);
    if (self === undefined) throw new Error('expected the seeded admin in the seeded db');

    const result = await store.delete(self);

    expect(result).toEqual({ kind: 'self' });
    expect(store.admins().map((admin) => admin.id)).toContain(SEED_ADMIN.id);
  });

  // Fails if 409 `LAST_ADMIN` does not map to `{ kind: 'last' }`. The mock's
  // `sessionAdmin` helper clears `db.sessionAdminId` once the signed-in admin
  // is missing from `db.admins`, so going through `usersHandlers` answers
  // 401 `UNAUTHENTICATED` instead of 409 `LAST_ADMIN`. The one-off DELETE
  // here bypasses the session check (case 7 does the same) and returns
  // 409 directly.
  it('case 2c: delete() of the only remaining admin returns last', async () => {
    const db = signedInDb();
    primeXsrf(db);
    db.admins.delete(SEED_ADMIN.id);
    server?.use(
      http.delete('*/api/v1/admin/users/:adminId', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:last-admin',
            title: 'Last admin',
            status: 409,
            code: 'LAST_ADMIN',
            detail: 'The last admin cannot be deleted',
            traceId: 'fixed-trace',
            fieldErrors: [],
          },
          { status: 409 },
        ),
      ),
    );

    const store = TestBed.inject(AdminsStore);
    const other = {
      id: OTHER_ADMIN_ID,
      username: OTHER_ADMIN.username,
      createdAt: OTHER_ADMIN.createdAt,
    };
    const result = await store.delete(other);
    expect(result).toEqual({ kind: 'last' });
    expect(db.admins.has(OTHER_ADMIN_ID)).toBe(true);
  });

  // Fails if a 404 does not map to `{ kind: 'gone' }`.
  it('case 2d: delete() of an id the db lacks returns gone', async () => {
    const db = signedInDb();
    primeXsrf(db);
    server?.use(...usersHandlers(db));

    const store = TestBed.inject(AdminsStore);
    const missing = {
      id: '00000000-0000-4000-8000-000000000000',
      username: 'ghost',
      createdAt: '2026-09-19T00:00:00Z',
    };

    const result = await store.delete(missing);

    expect(result).toEqual({ kind: 'gone' });
    expect(store.admins()).toEqual([]);
  });

  // Fails if a 503 does not map to `{ kind: 'failed', problem: <Problem> }` and the
  // Problem is asserted whole so the parsing path stays wired.
  it('case 2e: delete() on a 503 returns failed with the Problem body', async () => {
    const db = signedInDb();
    primeXsrf(db);
    server?.use(...usersHandlers(db));
    server?.use(
      http.delete('*/api/v1/admin/users/:adminId', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:service-unavailable',
            title: 'Service Unavailable',
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            detail: 'Try again later',
            traceId: 'fixed-trace-id-for-test',
            fieldErrors: [],
          },
          { status: 503 },
        ),
      ),
    );

    const store = TestBed.inject(AdminsStore);
    await store.load();
    expect(store.admins().map((admin) => admin.id)).toContain(OTHER_ADMIN_ID);

    const result = await store.delete({
      id: OTHER_ADMIN_ID,
      username: OTHER_ADMIN.username,
      createdAt: OTHER_ADMIN.createdAt,
    });

    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.problem).toEqual({
        type: 'urn:mi-bolt:problem:service-unavailable',
        title: 'Service Unavailable',
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        detail: 'Try again later',
        traceId: 'fixed-trace-id-for-test',
        fieldErrors: [],
      });
    }
    // The 503 leaves the local list intact — the server answer was not a
    // 204 so no row was removed.
    expect(store.admins().map((admin) => admin.id)).toContain(OTHER_ADMIN_ID);
  });
});
