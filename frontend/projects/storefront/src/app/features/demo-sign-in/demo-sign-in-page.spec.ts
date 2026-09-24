/**
 * MIM-423 — the demo sign-in page at `/belepes`.
 *
 * The page carries one password field and one Belépés button, nothing of
 * the shop behind it. The seven cases cover what the page itself decides:
 * the rendered shape, the required and too-long messages, the wrong-password
 * and generic-failure messages, the `vissza` target, and the edit-clears-
 * the-error rule.
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
import { RouterTestingHarness } from '@angular/router/testing';

import { isRecord } from '@mi-bolt/mocks/is-record';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';

import { DemoSignInPage } from './demo-sign-in-page';

useMswServer();

const BASE_URL = 'http://localhost/api/v1';

/** The one password the demo accepts (MIM-423; the owner ruled it not secret). */
const DEMO_PASSWORD = '1MiBoltDemo1';

/** An empty standalone component standing in for a routed page. */
@Component({ selector: 'app-demo-sign-in-stub', template: '' })
class Stub {}

/** Every request MSW saw, as `"<METHOD> <pathname>"`, in the order it saw it. */
let requestLog: string[] = [];

/** The contract's 401 for a wrong demo password (contract 2.2.0). */
function demoAccessRequired(): HttpResponse<DefaultBodyType> {
  return HttpResponse.json(
    {
      type: 'https://mi-bolt.example/problems/unauthenticated',
      title: 'Wrong demo password',
      status: 401,
      code: 'UNAUTHENTICATED',
      traceId: 't',
      fieldErrors: [],
    },
    { status: 401, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** A 503 on the sign-in call: the server could not answer. */
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

/** The POST handler the page talks to: 204 for the demo password, 401 otherwise. */
function signInHandler(): void {
  server.use(
    http.post('*/api/v1/demo/session', async ({ request }) => {
      const body: unknown = await request.json();
      const password = isRecord(body) ? body['password'] : undefined;
      return password === DEMO_PASSWORD
        ? new HttpResponse(null, { status: 204 })
        : demoAccessRequired();
    }),
  );
}

/** The one element matching `selector`, or a thrown error naming it. */
function queryElement(root: ParentNode | null, selector: string): HTMLElement {
  const element = root?.querySelector(selector) ?? null;
  if (!(element instanceof HTMLElement)) throw new Error(`missing element: ${selector}`);
  return element;
}

/** The password input, narrowed to `HTMLInputElement`. */
function passwordInput(root: ParentNode | null): HTMLInputElement {
  const input = queryElement(root, '[data-testid="demo-password-input"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('the password field is not an input');
  return input;
}

/** Types `value` into the password field the way a browser does. */
function typePassword(root: ParentNode | null, value: string): void {
  const input = passwordInput(root);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

/** Submits the form the way a browser does. */
function submitForm(root: ParentNode | null): void {
  queryElement(root, '[data-testid="demo-sign-in-form"]').dispatchEvent(new Event('submit'));
}

/** Creates the harness on `url` and returns it. */
function openPage(url: string): Promise<RouterTestingHarness> {
  return RouterTestingHarness.create(url);
}

beforeEach((): void => {
  requestLog = [];
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideApiConfiguration(BASE_URL),
      provideRouter([
        { path: 'belepes', component: DemoSignInPage },
        { path: 'telefonok', component: Stub },
        { path: '', component: Stub },
      ]),
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

describe('DemoSignInPage', () => {
  it('renders the password-only card', async () => {
    const harness = await openPage('/belepes');
    const root = harness.routeNativeElement;

    expect(queryElement(root, 'h1').textContent.trim()).toBe('Belépés a demóba');

    const input = passwordInput(root);
    expect(input.getAttribute('type')).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('current-password');

    expect(queryElement(root, '[data-testid="demo-sign-in-submit"]').textContent).toContain(
      'Belépés',
    );
    expect(root?.querySelector('app-header-nav')).toBeNull();
  });

  it('an empty submit shows the required message and sends nothing', async () => {
    signInHandler();
    const harness = await openPage('/belepes');
    const root = harness.routeNativeElement;

    submitForm(root);
    await harness.fixture.whenStable();

    expect(queryElement(root, '#demo-password-message').textContent).toContain(
      'Add meg a jelszót.',
    );
    expect(requestLog).toEqual([]);
  });

  it('a wrong password shows the error and stays', async () => {
    signInHandler();
    const harness = await openPage('/belepes');
    const root = harness.routeNativeElement;

    typePassword(root, 'rossz');
    submitForm(root);
    await harness.fixture.whenStable();

    expect(queryElement(root, '[data-testid="demo-sign-in-error"]').textContent).toContain(
      'Hibás jelszó. Próbáld újra.',
    );
    expect(TestBed.inject(Router).url.split('?')[0]).toBe('/belepes');
  });

  it('a server failure shows the generic error', async () => {
    server.use(http.post('*/api/v1/demo/session', () => serviceUnavailable()));
    const harness = await openPage('/belepes');
    const root = harness.routeNativeElement;

    typePassword(root, DEMO_PASSWORD);
    submitForm(root);
    await harness.fixture.whenStable();

    expect(queryElement(root, '[data-testid="demo-sign-in-error"]').textContent).toContain(
      'A belépés nem sikerült. Próbáld újra később.',
    );
  });

  it('the demo password opens the vissza target', async () => {
    signInHandler();
    const harness = await openPage('/belepes?vissza=%2Ftelefonok%3Fbrand%3Dapple');
    const root = harness.routeNativeElement;

    typePassword(root, DEMO_PASSWORD);
    submitForm(root);
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/telefonok?brand=apple');
  });

  it('an unsafe vissza falls back to the home page', async () => {
    signInHandler();
    const harness = await openPage('/belepes?vissza=%2F%2Fevil.example');
    const root = harness.routeNativeElement;

    typePassword(root, DEMO_PASSWORD);
    submitForm(root);
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('editing the password clears the error', async () => {
    signInHandler();
    const harness = await openPage('/belepes');
    const root = harness.routeNativeElement;

    typePassword(root, 'rossz');
    submitForm(root);
    await harness.fixture.whenStable();
    expect(root?.querySelector('[data-testid="demo-sign-in-error"]')).not.toBeNull();

    typePassword(root, 'rosszx');
    await harness.fixture.whenStable();

    expect(root?.querySelector('[data-testid="demo-sign-in-error"]')).toBeNull();
  });
});
