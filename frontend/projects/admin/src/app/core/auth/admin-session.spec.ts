/**
 * Spec for `AdminSession` (MIM-337): `refresh()` reads the session and
 * never rejects, `login()` primes the XSRF cookie with a GET session
 * before signing in, `logout()` treats 401 the same as 204, and
 * `changePassword()` never touches `current`. Driven through MSW's
 * `authHandlers` exactly as `mocks/auth.handlers.spec.ts` does, so the
 * cookie priming is the real `document.cookie` round trip.
 *
 * `root_url_used`: `resolveApiRoot()` — it derives
 * `${document.baseURI origin}/api/v1`, the same string
 * `new URL('/api/v1', document.baseURI).href` in the mock's own spec
 * resolves to, and it is what `app.config.ts` wires in production.
 */
import { HttpResponse, http } from 'msw';
import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { MOCK_PLATFORM_LOCATION_CONFIG } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveApiRoot } from '@mi-bolt/core-api/api-root';

import { provideApiConfiguration } from '../../api/generated/api-configuration';
import { authHandlers } from '../../../mocks/auth.handlers';
import { createDb } from '../../../mocks/db';
import { SEED_ADMIN, SEED_ADMIN_PASSWORD } from '../../../mocks/seed';
import { server, useMswServer } from '../../../testing/msw-server';

import { AdminSession } from './admin-session';

useMswServer();

/**
 * Under `TestBed`, `PlatformLocation` is `@angular/common/testing`'s
 * `FakeNavigationPlatformLocation`, whose `href` defaults to
 * `http://_empty_/` (`node_modules/@angular/common/fesm2022/testing.mjs`).
 * Angular's built-in XSRF interceptor (`xsrfInterceptorFn`,
 * `_module-chunk.mjs`) compares that origin against the request's and
 * skips the `X-XSRF-TOKEN` header on a mismatch, so without this the
 * mock's CSRF check would 403 every mutating request in this spec.
 * `MOCK_PLATFORM_LOCATION_CONFIG.startUrl` points the fake at the same
 * origin `resolveApiRoot()` resolves against.
 */
function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withXhr()),
      provideApiConfiguration(resolveApiRoot()),
      provideRouter([]),
      { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: document.baseURI } },
    ],
  });
}

function xsrfCookie(): string | null {
  const jar = document.cookie.split('; ');
  for (const entry of jar) {
    const eq = entry.indexOf('=');
    if (eq < 0) continue;
    if (entry.slice(0, eq) === 'XSRF-TOKEN') return entry.slice(eq + 1);
  }
  return null;
}

describe('AdminSession', () => {
  beforeEach(() => {
    configureTestBed();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/';
  });

  it('case 1: refresh() signed out then, after logging in with the seeded admin, refresh() matches', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    const session = TestBed.inject(AdminSession);

    expect(session.current()).toBe(undefined);
    await session.refresh();
    expect(session.current()).toBe(null);

    await session.login({ username: SEED_ADMIN.username, password: SEED_ADMIN_PASSWORD });
    await session.refresh();
    expect(session.current()).toEqual(SEED_ADMIN);
  });

  it('case 2: refresh() on a 503 answer leaves current() null and resolves', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    server?.use(
      http.get('*/api/v1/admin/auth/session', () => HttpResponse.json(null, { status: 503 })),
    );
    const session = TestBed.inject(AdminSession);

    await session.refresh();
    expect(session.current()).toBe(null);
  });

  it('case 3: login() succeeds after logout() rotated the token, and current() equals the AdminUser', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    const session = TestBed.inject(AdminSession);

    const first = await session.login({
      username: SEED_ADMIN.username,
      password: SEED_ADMIN_PASSWORD,
    });
    expect(first).toEqual(SEED_ADMIN);

    await session.logout();
    expect(session.current()).toBe(null);

    const second = await session.login({
      username: SEED_ADMIN.username,
      password: SEED_ADMIN_PASSWORD,
    });
    expect(second).toEqual(SEED_ADMIN);
    expect(session.current()).toEqual(SEED_ADMIN);
  });

  it('case 4: login() with a wrong password rejects with a 401 HttpErrorResponse and leaves current() unchanged', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    const session = TestBed.inject(AdminSession);
    await session.refresh();
    expect(session.current()).toBe(null);

    let caught: unknown;
    try {
      await session.login({ username: SEED_ADMIN.username, password: 'wrong-password' });
    } catch (err) {
      caught = err;
    }
    expect(caught instanceof HttpErrorResponse).toBe(true);
    if (caught instanceof HttpErrorResponse) {
      expect(caught.status).toBe(401);
    }
    expect(session.current()).toBe(null);
  });

  it('case 5: login() sends X-XSRF-TOKEN equal to the XSRF-TOKEN cookie value', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    const session = TestBed.inject(AdminSession);

    let loginHeader: string | null = null;
    let cookieAtRequestTime: string | null = null;
    const listener = ({ request }: { request: Request }): void => {
      if (request.method === 'POST' && request.url.includes('/admin/auth/login')) {
        loginHeader = request.headers.get('X-XSRF-TOKEN');
        cookieAtRequestTime = xsrfCookie();
      }
    };
    server?.events.on('request:start', listener);

    try {
      await session.login({ username: SEED_ADMIN.username, password: SEED_ADMIN_PASSWORD });
    } finally {
      server?.events.removeListener('request:start', listener);
    }

    expect(loginHeader).toBe(cookieAtRequestTime);
    expect(loginHeader).not.toBe(null);
  });

  it('case 6: logout() sets current() to null', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    const session = TestBed.inject(AdminSession);

    await session.login({ username: SEED_ADMIN.username, password: SEED_ADMIN_PASSWORD });
    await session.logout();
    expect(session.current()).toBe(null);
  });

  it('case 6b: logout() treats a 401 the same as a 204 — current() null, resolves', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    server?.use(
      http.post('*/api/v1/admin/auth/logout', () => HttpResponse.json({}, { status: 401 })),
    );
    const session = TestBed.inject(AdminSession);

    await session.login({ username: SEED_ADMIN.username, password: SEED_ADMIN_PASSWORD });
    await session.logout();
    expect(session.current()).toBe(null);
  });

  it('case 6c: logout() rejects on any other error and leaves current() unchanged', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    server?.use(
      http.post('*/api/v1/admin/auth/logout', () => HttpResponse.json({}, { status: 500 })),
    );
    const session = TestBed.inject(AdminSession);

    await session.login({ username: SEED_ADMIN.username, password: SEED_ADMIN_PASSWORD });
    expect(session.current()).toEqual(SEED_ADMIN);

    let caught: unknown;
    try {
      await session.logout();
    } catch (err) {
      caught = err;
    }
    expect(caught instanceof HttpErrorResponse).toBe(true);
    if (caught instanceof HttpErrorResponse) {
      expect(caught.status).toBe(500);
    }
    expect(session.current()).toEqual(SEED_ADMIN);
  });

  it('case 7: changePassword() with a wrong current password rejects with a 422 HttpErrorResponse', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    const session = TestBed.inject(AdminSession);

    await session.login({ username: SEED_ADMIN.username, password: SEED_ADMIN_PASSWORD });

    let caught: unknown;
    try {
      await session.changePassword({
        currentPassword: 'wrong-password',
        newPassword: 'a-brand-new-password',
      });
    } catch (err) {
      caught = err;
    }
    expect(caught instanceof HttpErrorResponse).toBe(true);
    if (caught instanceof HttpErrorResponse) {
      expect(caught.status).toBe(422);
    }
  });
});
