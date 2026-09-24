// @vitest-environment jsdom
import '@angular/compiler';

import { registerLocaleData } from '@angular/common';
import localeHu from '@angular/common/locales/hu';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';

import { server, useMswServer } from '../../../../tests/msw-server';
import { demoSessionInterceptor } from '@mi-bolt/core-api/demo-session.interceptor';

import { PaymentPage, LOCATION_ASSIGN } from './payment-page';
import type { PaymentIntent } from '@mi-bolt/api/models/payment-intent';

registerLocaleData(localeHu, 'hu-HU');

useMswServer();

const BASE_URL = 'http://localhost/api/v1';

const NBSP = String.fromCharCode(0x00a0);

const intentOpen: PaymentIntent = {
  id: 'pi_test_1',
  amount: { amount: 129990, currency: 'HUF' },
  createdAt: '2026-09-21T10:00:00.000Z',
  expiresAt: '2026-09-21T10:30:00.000Z',
  redirectUrl: 'http://localhost/demo-fizetes/pi_test_1',
  returnUrl: 'http://localhost/penztar?paymentIntentId=pi_test_1',
  status: 'requires_action',
} satisfies PaymentIntent;

/** A status the server can return after it has resolved the intent. */
type ClosedStatus = Exclude<PaymentIntent['status'], 'requires_action'>;

function closedWith(status: ClosedStatus): PaymentIntent {
  return {
    ...intentOpen,
    status,
  };
}

interface Captured {
  readonly method: string;
  readonly pathname: string;
  readonly body: string;
}

const captured: Captured[] = [];
const assigned: string[] = [];

function hostElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected fixture.nativeElement to be HTMLElement');
  }
  return raw;
}

function text(fixture: ComponentFixture<unknown>, selector: string): string {
  const el = hostElement(fixture).querySelector(selector);
  const content = el === null ? '' : el.textContent;
  return content.trim();
}

function nbsp(s: string): string {
  return s.split(NBSP).join(' ');
}

async function render(id: string | null): Promise<ComponentFixture<PaymentPage>> {
  const fixture = TestBed.createComponent(PaymentPage);
  if (id !== null) {
    fixture.componentRef.setInput('paymentIntentId', id);
  }
  await fixture.whenStable();
  return fixture;
}

async function flush(): Promise<void> {
  await Promise.resolve();
}

function click(fixture: ComponentFixture<PaymentPage>, selector: string): void {
  const el = hostElement(fixture).querySelector(selector);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Expected clickable element: ${selector}`);
  }
  el.click();
}

function fill(fixture: ComponentFixture<PaymentPage>, selector: string, value: string): void {
  const el = hostElement(fixture).querySelector(selector);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Expected input element: ${selector}`);
  }
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

/**
 * The 401 the contract answers every shop operation with when the visitor has
 * not signed in to the demo and the `mibolt_demo_access` cookie is missing.
 */
function demoAccessRequired(): Response {
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

/**
 * The one rendering a 401 must produce, whichever call it came from: the
 * alert asks for the demo password, the shop's sign-in is the only way out,
 * and nothing offers a retry that could never succeed (MIM-423).
 */
function expectSignInPrompt(fixture: ComponentFixture<PaymentPage>): void {
  expect(text(fixture, '[role="alert"]')).toBe(
    'A demó bolt jelszóval érhető el. Előbb lépj be a boltba.',
  );
  expect(text(fixture, '[data-testid="pay-sign-in"]')).toBe('Belépés a boltba');
  const signIn = hostElement(fixture).querySelector('[data-testid="pay-sign-in"]');
  expect(signIn?.getAttribute('href')).toBe('/belepes');
  expect(hostElement(fixture).querySelector('[data-testid="pay-retry"]')).toBeNull();
  expect(hostElement(fixture).querySelector('[data-testid="pay-back"]')).toBeNull();
  expect(hostElement(fixture).querySelector('h1')).toBeNull();
  expect(document.activeElement).toBe(hostElement(fixture).querySelector('[role="alert"]'));
}

beforeEach(() => {
  captured.length = 0;
  assigned.length = 0;
  void server.events.on('request:start', ({ request }) => {
    void (async (): Promise<void> => {
      const body = await request.clone().text();
      captured.push({
        method: request.method,
        pathname: new URL(request.url).pathname,
        body,
      });
    })();
  });
});

afterEach(() => {
  server.events.removeAllListeners('request:start');
  sessionStorage.clear();
  TestBed.resetTestingModule();
});

async function configureTestBed(): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [PaymentPage],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
      provideRouter([]),
      {
        provide: LOCATION_ASSIGN,
        useValue: (url: string): void => {
          assigned.push(url);
        },
      },
    ],
  }).compileComponents();
}

describe('PaymentPage', () => {
  it('P-01: renders the amount and the reference of an open intent', async () => {
    await configureTestBed();
    server.use(http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(intentOpen)));
    const fixture = await render('pi_test_1');
    await flush();

    expect(nbsp(text(fixture, '[data-testid="pay-amount"]'))).toBe('129 990 Ft');
    expect(text(fixture, '[data-testid="pay-ref"]')).toBe('pi_test_1');
    expect(text(fixture, 'h1')).toBe('Fizetés jóváhagyása');
    expect(hostElement(fixture).querySelector('h1')?.getAttribute('tabindex')).toBeNull();

    const gets = captured.filter((c) => c.method === 'GET');
    expect(gets).toHaveLength(1);
    expect(gets[0]?.pathname).toBe('/api/v1/payment-intents/pi_test_1');
  });

  it('MIM-259: the card heading is not focusable and never takes focus', async () => {
    await configureTestBed();
    server.use(http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(intentOpen)));
    const fixture = await render('pi_test_1');
    await flush();

    const heading = hostElement(fixture).querySelector('#pay-title');
    expect(heading?.getAttribute('tabindex')).toBeNull();
    expect(document.activeElement).not.toBe(heading);
  });

  it('P-02: Sikeres fizetés posts { outcome: "succeeded" }', async () => {
    await configureTestBed();
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(intentOpen)),
      http.post(`${BASE_URL}/payment-intents/:id/outcome`, () =>
        HttpResponse.json(closedWith('succeeded')),
      ),
    );
    const fixture = await render('pi_test_1');
    click(fixture, '[data-testid="pay-succeeded"]');
    await fixture.whenStable();
    await flush();

    const posts = captured.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.pathname).toBe('/api/v1/payment-intents/pi_test_1/outcome');
    expect(posts[0]?.body).toBe('{"outcome":"succeeded"}');
  });

  it('P-03: Elutasított fizetés posts { outcome: "declined" }', async () => {
    await configureTestBed();
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(intentOpen)),
      http.post(`${BASE_URL}/payment-intents/:id/outcome`, () =>
        HttpResponse.json(closedWith('declined')),
      ),
    );
    const fixture = await render('pi_test_1');
    click(fixture, '[data-testid="pay-declined"]');
    await fixture.whenStable();
    await flush();

    const posts = captured.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toBe('{"outcome":"declined"}');
  });

  it('P-04: Függőben marad posts { outcome: "pending" }', async () => {
    await configureTestBed();
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(intentOpen)),
      http.post(`${BASE_URL}/payment-intents/:id/outcome`, () =>
        HttpResponse.json(closedWith('pending')),
      ),
    );
    const fixture = await render('pi_test_1');
    click(fixture, '[data-testid="pay-pending"]');
    await fixture.whenStable();
    await flush();

    const posts = captured.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toBe('{"outcome":"pending"}');
  });

  it('P-05: a booked outcome returns to the shop through the intent returnUrl', async () => {
    await configureTestBed();
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(intentOpen)),
      http.post(`${BASE_URL}/payment-intents/:id/outcome`, () =>
        HttpResponse.json(closedWith('succeeded')),
      ),
    );
    const fixture = await render('pi_test_1');
    click(fixture, '[data-testid="pay-succeeded"]');
    await fixture.whenStable();
    await flush();

    expect(assigned).toEqual(['http://localhost/penztar?paymentIntentId=pi_test_1']);
    expect(text(fixture, '[role="status"]')).toBe('Visszairányítás a boltba…');
  });

  it('P-06: a 404 on load shows the not-found copy and no buttons', async () => {
    await configureTestBed();
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Not found', status: 404 },
          { status: 404, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    const fixture = await render('pi_test_1');
    await flush();

    expect(text(fixture, '[role="alert"]')).toBe('Ez a fizetési kérés nem található vagy lejárt.');
    expect(hostElement(fixture).querySelector('[data-testid="pay-succeeded"]')).toBeNull();
    expect(hostElement(fixture).querySelector('[data-testid="pay-back"]')).toBeNull();
    expect(hostElement(fixture).querySelector('[data-testid="pay-retry"]')).toBeNull();
    expect(hostElement(fixture).querySelector('h1')).toBeNull();
    expect(document.activeElement).toBe(hostElement(fixture).querySelector('[role="alert"]'));
  });

  it('P-07: an intent already closed on load shows the booked outcome and the back link', async () => {
    await configureTestBed();
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(closedWith('succeeded'))),
    );
    const fixture = await render('pi_test_1');
    await flush();

    expect(text(fixture, '[role="alert"]')).toBe('Ez a fizetés már lezárult.');
    expect(nbsp(text(fixture, '.pay-outcome'))).toBe('Eredmény: Sikeres fizetés');
    const back = hostElement(fixture).querySelector('[data-testid="pay-back"]');
    expect(back?.getAttribute('href')).toBe(intentOpen.returnUrl);
    expect(hostElement(fixture).querySelector('[data-testid="pay-succeeded"]')).toBeNull();
    expect(captured.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('P-08: a 409 on the post re-reads the intent and shows the server outcome', async () => {
    await configureTestBed();
    let getCalls = 0;
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () => {
        getCalls += 1;
        return HttpResponse.json(getCalls === 1 ? intentOpen : closedWith('declined'));
      }),
      http.post(`${BASE_URL}/payment-intents/:id/outcome`, () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409 },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    const fixture = await render('pi_test_1');
    click(fixture, '[data-testid="pay-succeeded"]');
    await fixture.whenStable();
    await flush();

    expect(text(fixture, '[role="alert"]')).toBe('Ez a fizetés már lezárult.');
    expect(nbsp(text(fixture, '.pay-outcome'))).toBe('Eredmény: Elutasított fizetés');
    expect(captured.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(captured.filter((c) => c.method === 'GET')).toHaveLength(2);
    expect(assigned).toEqual([]);
  });

  it('P-09: no id in the route shows the missing-id copy and calls nothing', async () => {
    await configureTestBed();
    const fixture = await render(null);
    await flush();

    expect(text(fixture, '[role="alert"]')).toBe('Hiányzó fizetési azonosító.');
    expect(captured).toEqual([]);
    expect(hostElement(fixture).querySelector('h1')).toBeNull();
    expect(hostElement(fixture).querySelector('[data-testid="pay-back"]')).toBeNull();
    expect(hostElement(fixture).querySelector('[data-testid="pay-retry"]')).toBeNull();
  });

  it('P-10: a failed load offers a retry that re-reads', async () => {
    await configureTestBed();
    let getCalls = 0;
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () => {
        getCalls += 1;
        if (getCalls === 1) {
          return HttpResponse.json(
            { type: 'about:blank', title: 'Server error', status: 500 },
            { status: 500 },
          );
        }
        return HttpResponse.json(intentOpen);
      }),
    );
    const fixture = await render('pi_test_1');
    await flush();

    expect(text(fixture, '[role="alert"]')).toBe('A fizetés jóváhagyása nem sikerült.');
    expect(hostElement(fixture).querySelector('[data-testid="pay-retry"]')).not.toBeNull();

    click(fixture, '[data-testid="pay-retry"]');
    await fixture.whenStable();
    await flush();

    expect(text(fixture, 'h1')).toBe('Fizetés jóváhagyása');
    expect(captured.filter((c) => c.method === 'GET')).toHaveLength(2);
    expect(document.activeElement).not.toBe(hostElement(fixture).querySelector('h1'));
  });

  it('P-11: a failed post offers a retry that re-posts the same outcome', async () => {
    await configureTestBed();
    let postCalls = 0;
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(intentOpen)),
      http.post(`${BASE_URL}/payment-intents/:id/outcome`, () => {
        postCalls += 1;
        if (postCalls === 1) {
          return HttpResponse.json(
            { type: 'about:blank', title: 'Server error', status: 500 },
            { status: 500 },
          );
        }
        return HttpResponse.json(closedWith('pending'));
      }),
    );
    const fixture = await render('pi_test_1');
    click(fixture, '[data-testid="pay-pending"]');
    await fixture.whenStable();
    await flush();

    expect(text(fixture, '[role="alert"]')).toBe('A fizetés jóváhagyása nem sikerült.');
    expect(hostElement(fixture).querySelector('[data-testid="pay-retry"]')).not.toBeNull();

    click(fixture, '[data-testid="pay-retry"]');
    await fixture.whenStable();
    await flush();

    const posts = captured.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[0]?.body).toBe('{"outcome":"pending"}');
    expect(posts[1]?.body).toBe('{"outcome":"pending"}');
    expect(assigned).toEqual([intentOpen.returnUrl]);
  });

  it('P-12: a click on a button is ignored while a post is in flight', async () => {
    await configureTestBed();
    let resolvePost: () => void = (): void => {
      throw new Error('resolvePost called before Promise executor');
    };
    const deferred = new Promise<void>((resolve) => {
      resolvePost = resolve;
    });
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(intentOpen)),
      http.post(`${BASE_URL}/payment-intents/:id/outcome`, async () => {
        await deferred;
        return HttpResponse.json(closedWith('succeeded'));
      }),
    );
    const fixture = await render('pi_test_1');
    click(fixture, '[data-testid="pay-succeeded"]');
    fixture.detectChanges();
    await flush();

    expect(hostElement(fixture).querySelector('section.pay-card')?.getAttribute('aria-busy')).toBe(
      'true',
    );

    click(fixture, '[data-testid="pay-declined"]');
    await flush();

    resolvePost();
    fixture.detectChanges();
    await flush();
    await flush();
    await flush();

    const posts = captured.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toBe('{"outcome":"succeeded"}');
  });

  it('P-13: a 401 on load asks the visitor to sign in to the shop', async () => {
    await configureTestBed();
    server.use(http.get(`${BASE_URL}/payment-intents/:id`, () => demoAccessRequired()));
    const fixture = await render('pi_test_1');
    await flush();

    expectSignInPrompt(fixture);
    expect(captured.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('P-14: a 401 on the post asks the visitor to sign in to the shop', async () => {
    await configureTestBed();
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(intentOpen)),
      http.post(`${BASE_URL}/payment-intents/:id/outcome`, () => demoAccessRequired()),
    );
    const fixture = await render('pi_test_1');
    click(fixture, '[data-testid="pay-succeeded"]');
    await fixture.whenStable();
    await flush();

    expectSignInPrompt(fixture);
    expect(captured.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(assigned).toEqual([]);
  });

  it('P-15: a 401 on the re-read after a 409 asks the visitor to sign in', async () => {
    await configureTestBed();
    let getCalls = 0;
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () => {
        getCalls += 1;
        return getCalls === 1 ? HttpResponse.json(intentOpen) : demoAccessRequired();
      }),
      http.post(`${BASE_URL}/payment-intents/:id/outcome`, () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409 },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    const fixture = await render('pi_test_1');
    click(fixture, '[data-testid="pay-succeeded"]');
    await fixture.whenStable();
    await flush();

    expectSignInPrompt(fixture);
    expect(captured.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(captured.filter((c) => c.method === 'GET')).toHaveLength(2);
  });

  it('MIM-260: the card fields never reach the posted body', async () => {
    await configureTestBed();
    server.use(
      http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(intentOpen)),
      http.post(`${BASE_URL}/payment-intents/:id/outcome`, () =>
        HttpResponse.json(closedWith('succeeded')),
      ),
    );
    const fixture = await render('pi_test_1');
    await flush();

    fill(fixture, '[data-testid="pay-card-number"]', '1234 5678 9012 3456');
    fill(fixture, '[data-testid="pay-card-holder"]', 'JOHN DOE');
    fill(fixture, '[data-testid="pay-card-expiry"]', '12/25');
    fill(fixture, '[data-testid="pay-card-cvc"]', '123');

    click(fixture, '[data-testid="pay-succeeded"]');
    await fixture.whenStable();
    await flush();

    const posts = captured.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toBe('{"outcome":"succeeded"}');
  });

  it('MIM-260: no field offers a stored card to the browser', async () => {
    await configureTestBed();
    server.use(http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(intentOpen)));
    const fixture = await render('pi_test_1');
    const root = hostElement(fixture);
    await flush();

    const number = root.querySelector<HTMLElement>('[data-testid="pay-card-number"]');
    const holder = root.querySelector<HTMLElement>('[data-testid="pay-card-holder"]');
    const expiry = root.querySelector<HTMLElement>('[data-testid="pay-card-expiry"]');
    const cvc = root.querySelector<HTMLElement>('[data-testid="pay-card-cvc"]');

    expect(number?.getAttribute('autocomplete')).toBe('off');
    expect(number?.getAttribute('type')).toBe('text');
    expect(holder?.getAttribute('autocomplete')).toBe('off');
    expect(holder?.getAttribute('type')).toBe('text');
    expect(expiry?.getAttribute('autocomplete')).toBe('off');
    expect(expiry?.getAttribute('type')).toBe('text');
    expect(cvc?.getAttribute('autocomplete')).toBe('off');
    expect(cvc?.getAttribute('type')).toBe('text');
  });

  it('MIM-260: every card field starts empty when the router binds the inputs', async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
        provideRouter(
          [{ path: ':paymentIntentId', component: PaymentPage }],
          withComponentInputBinding(),
        ),
        {
          provide: LOCATION_ASSIGN,
          useValue: (url: string): void => {
            assigned.push(url);
          },
        },
      ],
    }).compileComponents();
    server.use(http.get(`${BASE_URL}/payment-intents/:id`, () => HttpResponse.json(intentOpen)));

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/pi_test_1', PaymentPage);
    await harness.fixture.whenStable();
    await flush();
    await harness.fixture.whenStable();

    const root = harness.routeNativeElement;
    const values = ['pay-card-number', 'pay-card-holder', 'pay-card-expiry', 'pay-card-cvc'].map(
      (id) => root?.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)?.value,
    );
    expect(values).toEqual(['', '', '', '']);
  });
});
