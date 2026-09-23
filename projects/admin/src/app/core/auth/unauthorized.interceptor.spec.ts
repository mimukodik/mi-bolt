/**
 * Spec for `unauthorizedInterceptor` (MIM-337): a 401 from a plain
 * request clears the session and returns to the login page carrying
 * `vissza`, unless the admin is already there; a 401 from a
 * `skipUnauthorizedRedirect()`-marked request (the session priming GET,
 * the login POST and the logout POST, all `AdminSession`'s own) does neither; every
 * other status passes through untouched and the error is always
 * rethrown. Driven through MSW's `authHandlers` for the real auth flow,
 * plus one-off handlers for the statuses the mock does not itself answer
 * with (401/403/500 on an arbitrary admin endpoint).
 *
 * `root_url_used`: `resolveApiRoot()`, same reasoning as
 * `admin-session.spec.ts`.
 */
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
  withXhr,
} from '@angular/common/http';
import { MOCK_PLATFORM_LOCATION_CONFIG } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { HttpResponse, http } from 'msw';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveApiRoot } from '@mi-bolt/core-api/api-root';

import { provideApiConfiguration } from '../../api/generated/api-configuration';
import { authHandlers } from '../../../mocks/auth.handlers';
import { createDb } from '../../../mocks/db';
import { SEED_ADMIN, SEED_ADMIN_PASSWORD } from '../../../mocks/seed';
import { server, useMswServer } from '../../../testing/msw-server';

import { AdminSession } from './admin-session';
import { unauthorizedInterceptor } from './unauthorized.interceptor';

useMswServer();

/** Same `FakeNavigationPlatformLocation` fix as `admin-session.spec.ts`. */
function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withXhr(), withInterceptors([unauthorizedInterceptor])),
      provideApiConfiguration(resolveApiRoot()),
      provideRouter([]),
      { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: document.baseURI } },
    ],
  });
}

function usersUrl(): string {
  return `${resolveApiRoot()}/admin/users`;
}

function productsUrl(): string {
  return `${resolveApiRoot()}/admin/products`;
}

describe('unauthorizedInterceptor', () => {
  beforeEach(() => {
    configureTestBed();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/';
  });

  it('case 8: a 401 on a plain request clears the session, navigates once to /bejelentkezes?vissza=%2Ftermekek, and the caller still sees the 401', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    server?.use(http.get('*/api/v1/admin/users', () => HttpResponse.json({}, { status: 401 })));

    const session = TestBed.inject(AdminSession);
    await session.login({ username: SEED_ADMIN.username, password: SEED_ADMIN_PASSWORD });
    expect(session.current()).toEqual(SEED_ADMIN);

    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'url', { value: '/termekek', configurable: true });
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    const httpClient = TestBed.inject(HttpClient);
    let caught: unknown;
    try {
      await firstValueFrom(httpClient.get(usersUrl()));
    } catch (err) {
      caught = err;
    }

    expect(caught instanceof HttpErrorResponse).toBe(true);
    if (caught instanceof HttpErrorResponse) {
      expect(caught.status).toBe(401);
    }
    expect(session.current()).toBe(null);
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    const tree = navigateSpy.mock.calls[0][0];
    if (tree instanceof UrlTree) {
      expect(router.serializeUrl(tree)).toBe('/bejelentkezes?vissza=%2Ftermekek');
    } else {
      throw new Error('expected a UrlTree');
    }
  });

  it('case 9: a 401 on GET session or POST login is skip-marked — no navigation and no session.clear()', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));

    const session = TestBed.inject(AdminSession);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const clearSpy = vi.spyOn(session, 'clear');

    await session.refresh();
    expect(session.current()).toBe(null);
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();

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
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('case 10: a 403 or a 500 on a plain request triggers no navigation and is rethrown', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    server?.use(http.get('*/api/v1/admin/users', () => HttpResponse.json({}, { status: 403 })));
    server?.use(http.get('*/api/v1/admin/products', () => HttpResponse.json({}, { status: 500 })));

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const httpClient = TestBed.inject(HttpClient);

    let caught403: unknown;
    try {
      await firstValueFrom(httpClient.get(usersUrl()));
    } catch (err) {
      caught403 = err;
    }
    expect(caught403 instanceof HttpErrorResponse).toBe(true);
    if (caught403 instanceof HttpErrorResponse) {
      expect(caught403.status).toBe(403);
    }
    expect(navigateSpy).not.toHaveBeenCalled();

    let caught500: unknown;
    try {
      await firstValueFrom(httpClient.get(productsUrl()));
    } catch (err) {
      caught500 = err;
    }
    expect(caught500 instanceof HttpErrorResponse).toBe(true);
    if (caught500 instanceof HttpErrorResponse) {
      expect(caught500.status).toBe(500);
    }
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('case 11: a 401 while already on /bejelentkezes navigates there with no vissza', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    server?.use(http.get('*/api/v1/admin/users', () => HttpResponse.json({}, { status: 401 })));

    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'url', {
      value: '/bejelentkezes?vissza=%2Fadminok',
      configurable: true,
    });
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const httpClient = TestBed.inject(HttpClient);

    let caught: unknown;
    try {
      await firstValueFrom(httpClient.get(usersUrl()));
    } catch (err) {
      caught = err;
    }
    expect(caught instanceof HttpErrorResponse).toBe(true);
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    const tree = navigateSpy.mock.calls[0][0];
    if (tree instanceof UrlTree) {
      expect(router.serializeUrl(tree)).toBe('/bejelentkezes');
    } else {
      throw new Error('expected a UrlTree');
    }
  });

  it('case 12: a 401 on a page that merely shares the /bejelentkezes prefix still carries vissza', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    server?.use(http.get('*/api/v1/admin/users', () => HttpResponse.json({}, { status: 401 })));

    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'url', {
      value: '/bejelentkezes-info',
      configurable: true,
    });
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const httpClient = TestBed.inject(HttpClient);

    let caught: unknown;
    try {
      await firstValueFrom(httpClient.get(usersUrl()));
    } catch (err) {
      caught = err;
    }
    expect(caught instanceof HttpErrorResponse).toBe(true);
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    const tree = navigateSpy.mock.calls[0][0];
    if (tree instanceof UrlTree) {
      expect(router.serializeUrl(tree)).toBe('/bejelentkezes?vissza=%2Fbejelentkezes-info');
    } else {
      throw new Error('expected a UrlTree');
    }
  });

  it('case 13: a 401 on POST logout is skip-marked too — resolves, current() null, no navigation', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    server?.use(
      http.post('*/api/v1/admin/auth/logout', () => HttpResponse.json({}, { status: 401 })),
    );

    const session = TestBed.inject(AdminSession);
    await session.login({ username: SEED_ADMIN.username, password: SEED_ADMIN_PASSWORD });
    expect(session.current()).toEqual(SEED_ADMIN);

    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'url', { value: '/adminok', configurable: true });
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await session.logout();

    expect(session.current()).toBe(null);
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
