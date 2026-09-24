/**
 * MIM-423 — `demoAccessInterceptor`.
 *
 * A gated `/api/v1/*` call answering the contract's 401 means the demo
 * cookie is gone: the interceptor forgets the remembered yes and sends the
 * visitor to `/belepes` with the page they were on. A 401 from
 * `/demo/session` itself is a wrong password rather than a refusal, and any
 * other status passes through untouched.
 */

// @vitest-environment jsdom
import '@angular/compiler';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Component } from '@angular/core';
import { HttpResponse, http, type DefaultBodyType } from 'msw';
import { firstValueFrom } from 'rxjs';
import { server, useMswServer } from '../../../../../../tests/msw-server';

import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter } from '@angular/router';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';

import { DemoAccess } from './demo-access';
import { demoAccessInterceptor } from './demo-access.interceptor';

useMswServer();

const BASE_URL = 'http://localhost/api/v1';

/** An empty standalone component standing in for a routed page. */
@Component({ selector: 'app-demo-access-interceptor-stub', template: '' })
class Stub {}

/** Every request MSW saw, as `"<METHOD> <pathname>"`, in the order it saw it. */
let requestLog: string[] = [];

/** The contract's 401 `DemoAccessRequired` (contract 2.2.0). */
function demoAccessRequired(): HttpResponse<DefaultBodyType> {
  return HttpResponse.json(
    {
      type: 'https://mi-bolt.example/problems/unauthenticated',
      title: 'Demo access required',
      status: 401,
      code: 'UNAUTHENTICATED',
      traceId: 't',
      fieldErrors: [],
    },
    { status: 401, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** A 500 on a gated call: a server failure rather than a refusal. */
function serverError(): HttpResponse<DefaultBodyType> {
  return HttpResponse.json(
    {
      type: 'https://mi-bolt.example/problems/internal',
      title: 'Internal error',
      status: 500,
      code: 'INTERNAL_ERROR',
      traceId: 't',
      fieldErrors: [],
    },
    { status: 500, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** A 204 with no body, the contract's success answer for both demo operations. */
function noContent(): HttpResponse<null> {
  return new HttpResponse(null, { status: 204 });
}

/** The status of the `HttpErrorResponse` a rejected call carries. */
async function failureStatus(call: Promise<unknown>): Promise<number> {
  let caught: unknown = null;
  try {
    await call;
  } catch (error: unknown) {
    caught = error;
  }
  if (!(caught instanceof HttpErrorResponse)) throw new Error('expected HttpErrorResponse');
  return caught.status;
}

beforeEach(async (): Promise<void> => {
  requestLog = [];
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoAccessInterceptor])),
      provideApiConfiguration(BASE_URL),
      provideRouter([
        { path: 'belepes', component: Stub },
        { path: 'telefonok', component: Stub },
      ]),
    ],
    teardown: { destroyAfterEach: true },
  });
  server.events.on('request:start', ({ request }) => {
    requestLog.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  await TestBed.inject(Router).navigateByUrl('/telefonok?brand=apple');
});

afterEach((): void => {
  server.events.removeAllListeners('request:start');
  TestBed.resetTestingModule();
});

describe('demoAccessInterceptor', () => {
  it('a gated 401 sends the visitor to /belepes with vissza', async () => {
    server.use(http.get('*/api/v1/products', () => demoAccessRequired()));

    const status = await failureStatus(
      firstValueFrom(TestBed.inject(HttpClient).get(`${BASE_URL}/products`)),
    );
    expect(status).toBe(401);

    const router = TestBed.inject(Router);
    expect(router.url.split('?')[0]).toBe('/belepes');
    expect(router.parseUrl(router.url).queryParamMap.get('vissza')).toBe('/telefonok?brand=apple');
  });

  it('a gated 401 makes DemoAccess ask again', async () => {
    server.use(http.get('*/api/v1/demo/session', () => noContent()));
    server.use(http.get('*/api/v1/products', () => demoAccessRequired()));

    const access = TestBed.inject(DemoAccess);
    expect(await access.check()).toBe(true);
    expect(requestLog).toEqual(['GET /api/v1/demo/session']);

    requestLog = [];
    expect(
      await failureStatus(firstValueFrom(TestBed.inject(HttpClient).get(`${BASE_URL}/products`))),
    ).toBe(401);

    requestLog = [];
    expect(await access.check()).toBe(true);
    expect(requestLog).toEqual(['GET /api/v1/demo/session']);
  });

  it("the sign-in call's own 401 stays on the page", async () => {
    server.use(http.post('*/api/v1/demo/session', () => demoAccessRequired()));

    const status = await failureStatus(
      firstValueFrom(
        TestBed.inject(HttpClient).post(`${BASE_URL}/demo/session`, { password: 'x' }),
      ),
    );
    expect(status).toBe(401);

    expect(TestBed.inject(Router).url).toBe('/telefonok?brand=apple');
  });

  it('a 401 on /belepes does not navigate again', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/belepes?vissza=%2F');
    const before = router.url;

    server.use(http.get('*/api/v1/products', () => demoAccessRequired()));
    const status = await failureStatus(
      firstValueFrom(TestBed.inject(HttpClient).get(`${BASE_URL}/products`)),
    );
    expect(status).toBe(401);

    expect(router.url).toBe(before);
  });

  it('a 500 passes through', async () => {
    server.use(http.get('*/api/v1/products', () => serverError()));

    const status = await failureStatus(
      firstValueFrom(TestBed.inject(HttpClient).get(`${BASE_URL}/products`)),
    );
    expect(status).toBe(500);

    expect(TestBed.inject(Router).url).toBe('/telefonok?brand=apple');
  });
});
