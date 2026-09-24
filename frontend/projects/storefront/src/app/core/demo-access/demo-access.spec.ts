/**
 * MIM-423 — the DemoAccess service.
 *
 * `DemoAccess` is the page-lifetime memory of the demo gate: a `yes` from
 * `GET /demo/session` is kept, a `no` is asked again on the next
 * navigation, and any failure other than the contract's 401 lets the page
 * through without remembering anything (the pages show their own error
 * states and the backend enforces the gate anyway).
 *
 * The six cases below pin the three shapes of the answer — 204, 401, and
 * a non-401 failure — plus the `signIn` write path, so a change that
 * collapses "no" and "could not ask" fails here.
 */

// @vitest-environment jsdom
import '@angular/compiler';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse, http, type DefaultBodyType } from 'msw';
import { server, useMswServer } from '../../../../../../tests/msw-server';

import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { DEMO_PASSWORD } from '@mi-bolt/mocks/demo/demo.handlers';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';

import { DemoAccess } from './demo-access';

useMswServer();

const BASE_URL = 'http://localhost/api/v1';

/** Every request MSW saw, as `"<METHOD> <pathname>"`, in the order it saw it. */
let requestLog: string[] = [];

/**
 * The contract's 401 `DemoAccessRequired` (contract 2.2.0), in the
 * seven-field Problem shape.
 */
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

/** A 204 with no body, the contract's success answer for both operations. */
function noContent(): HttpResponse<null> {
  return new HttpResponse(null, { status: 204 });
}

beforeEach((): void => {
  requestLog = [];
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideApiConfiguration(BASE_URL),
    ],
    teardown: { destroyAfterEach: true },
  });
  server.events.on('request:start', ({ request }) => {
    requestLog.push(`${request.method} ${new URL(request.url).pathname}`);
  });
});

afterEach((): void => {
  server.events.removeAllListeners('request:start');
  TestBed.resetTestingModule();
});

describe('DemoAccess.check', () => {
  it('check() is true on 204 and asks the server once', async () => {
    server.use(http.get('*/api/v1/demo/session', () => noContent()));

    const access = TestBed.inject(DemoAccess);
    expect(await access.check()).toBe(true);
    expect(await access.check()).toBe(true);

    expect(requestLog).toEqual(['GET /api/v1/demo/session']);
  });

  it('check() is false on 401 and asks again next time', async () => {
    server.use(http.get('*/api/v1/demo/session', () => demoAccessRequired()));

    const access = TestBed.inject(DemoAccess);
    expect(await access.check()).toBe(false);

    server.use(http.get('*/api/v1/demo/session', () => noContent()));
    expect(await access.check()).toBe(true);

    expect(requestLog).toEqual(['GET /api/v1/demo/session', 'GET /api/v1/demo/session']);
  });

  it('check() lets the page through on 503 without remembering it', async () => {
    server.use(http.get('*/api/v1/demo/session', () => serviceUnavailable()));

    const access = TestBed.inject(DemoAccess);
    expect(await access.check()).toBe(true);
    expect(await access.check()).toBe(true);

    expect(requestLog).toEqual(['GET /api/v1/demo/session', 'GET /api/v1/demo/session']);
  });
});

describe('DemoAccess.signIn', () => {
  it('signIn() posts the password and remembers the yes', async () => {
    let posted: unknown = null;
    server.use(
      http.post('*/api/v1/demo/session', async ({ request }) => {
        posted = await request.json();
        return noContent();
      }),
    );

    const access = TestBed.inject(DemoAccess);
    await access.signIn(DEMO_PASSWORD);

    expect(posted).toEqual({ password: DEMO_PASSWORD });

    requestLog = [];
    expect(await access.check()).toBe(true);
    expect(requestLog).toEqual([]);
  });

  it('signIn() rejects with the 401 on a wrong password', async () => {
    server.use(http.post('*/api/v1/demo/session', () => demoAccessRequired()));
    server.use(http.get('*/api/v1/demo/session', () => demoAccessRequired()));

    const access = TestBed.inject(DemoAccess);
    let caught: unknown = null;
    try {
      await access.signIn('rossz');
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HttpErrorResponse);
    if (!(caught instanceof HttpErrorResponse)) throw new Error('expected HttpErrorResponse');
    expect(caught.status).toBe(401);

    requestLog = [];
    expect(await access.check()).toBe(false);
    expect(requestLog).toEqual(['GET /api/v1/demo/session']);
  });
});

describe('DemoAccess.markSignedOut', () => {
  it('markSignedOut() forgets the yes', async () => {
    server.use(http.get('*/api/v1/demo/session', () => noContent()));

    const access = TestBed.inject(DemoAccess);
    expect(await access.check()).toBe(true);

    access.markSignedOut();
    server.use(http.get('*/api/v1/demo/session', () => demoAccessRequired()));

    expect(await access.check()).toBe(false);
    expect(requestLog).toEqual(['GET /api/v1/demo/session', 'GET /api/v1/demo/session']);
  });
});
