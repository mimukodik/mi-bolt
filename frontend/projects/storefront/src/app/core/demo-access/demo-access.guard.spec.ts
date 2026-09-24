/**
 * MIM-423 — `demoAccessGuard` on a real router.
 *
 * The guard asks `DemoAccess.check()` and sends a signed-out visitor to
 * `/belepes` with the page they wanted in `vissza`. Only the contract's
 * 401 is a refusal; a check that could not be answered lets the page
 * through, because the backend enforces the gate anyway.
 */

// @vitest-environment jsdom
import '@angular/compiler';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Component } from '@angular/core';
import { HttpResponse, http, type DefaultBodyType } from 'msw';
import { server, useMswServer } from '../../../../../../tests/msw-server';

import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter } from '@angular/router';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';

import { demoAccessGuard } from './demo-access.guard';

useMswServer();

const BASE_URL = 'http://localhost/api/v1';

/** An empty standalone component standing in for a routed page. */
@Component({ selector: 'app-demo-access-guard-stub', template: '' })
class Stub {}

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

/** A non-401 failure: the check could not be answered, which is not a refusal. */
function serviceUnavailable(): HttpResponse<DefaultBodyType> {
  return HttpResponse.json(
    {
      type: 'https://mi-bolt.example/problems/service-unavailable',
      title: 'Service unavailable',
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      traceId: 't',
      fieldErrors: [],
    },
    { status: 503, headers: { 'content-type': 'application/problem+json' } },
  );
}

beforeEach((): void => {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideApiConfiguration(BASE_URL),
      provideRouter([
        { path: 'belepes', component: Stub },
        { path: 'telefonok', canActivate: [demoAccessGuard], component: Stub },
      ]),
    ],
    teardown: { destroyAfterEach: true },
  });
});

afterEach((): void => {
  TestBed.resetTestingModule();
});

describe('demoAccessGuard', () => {
  it('a signed-in visitor reaches the page', async () => {
    server.use(http.get('*/api/v1/demo/session', () => new HttpResponse(null, { status: 204 })));

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/telefonok?brand=apple');

    expect(router.url).toBe('/telefonok?brand=apple');
  });

  it('a signed-out visitor lands on /belepes with vissza', async () => {
    server.use(http.get('*/api/v1/demo/session', () => demoAccessRequired()));

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/telefonok?brand=apple');

    expect(router.url.split('?')[0]).toBe('/belepes');
    expect(router.parseUrl(router.url).queryParamMap.get('vissza')).toBe('/telefonok?brand=apple');
  });

  it('a failing check does not block the page', async () => {
    server.use(http.get('*/api/v1/demo/session', () => serviceUnavailable()));

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/telefonok?brand=apple');

    expect(router.url).toBe('/telefonok?brand=apple');
  });
});
