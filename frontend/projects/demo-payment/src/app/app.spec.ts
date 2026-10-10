import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';

import { App } from './app';
import { appConfig } from './app.config';
import { routes } from './app.routes';
import { PaymentPage } from './payment-page';

function hostElement(raw: unknown): HTMLElement {
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected fixture.nativeElement to be HTMLElement');
  }
  return raw;
}

describe('demo-payment App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, PaymentPage],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiConfiguration('http://localhost/api/v1'),
      ],
    }).compileComponents();
  });

  it('creates the shell', () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(HttpTestingController)
      .expectOne('http://localhost/api/v1/shop-appearance')
      .flush({ halloweenActive: false, serverTime: '2026-10-30T12:00:00Z' });
    expect(fixture.componentInstance).toBeInstanceOf(App);
    fixture.destroy();
  });

  it('wires the five application providers', () => {
    expect(appConfig.providers).toHaveLength(5);
  });

  it('renders the missing-id alert when the route has no id', async () => {
    const fixture = TestBed.createComponent(PaymentPage);
    await fixture.whenStable();
    const raw: unknown = fixture.nativeElement;
    const alertEl = hostElement(raw).querySelector('[role="alert"]');
    const alertText = alertEl === null ? '' : alertEl.textContent;
    expect(alertText.trim()).toBe('Hiányzó fizetési azonosító.');
    expect(hostElement(raw).querySelector('h1')).toBeNull();
  });
});

describe('demo-payment Halloween appearance', () => {
  const appearanceUrl = 'http://localhost/api/v1/shop-appearance';
  let originalUrl: string;

  beforeEach(async () => {
    originalUrl = window.location.href;
    sessionStorage.removeItem('mi-bolt.halloween-preview');
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiConfiguration('http://localhost/api/v1'),
      ],
    }).compileComponents();
    vi.useFakeTimers();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
    window.history.replaceState(null, '', originalUrl);
    sessionStorage.removeItem('mi-bolt.halloween-preview');
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('uses the server boundary to remove an expired theme despite a different browser clock', () => {
    vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(appearanceUrl).flush({
      halloweenActive: true,
      serverTime: '2026-10-30T12:00:00Z',
      nextChangeAt: '2026-10-30T12:00:02Z',
    });
    fixture.detectChanges();
    expect(hostElement(fixture.nativeElement).classList.contains('halloween')).toBe(true);
    vi.advanceTimersByTime(2049);
    http.expectNone(appearanceUrl);
    vi.advanceTimersByTime(1);
    http.expectOne(appearanceUrl).flush({
      halloweenActive: false,
      serverTime: '2026-10-30T12:00:02Z',
    });
    fixture.detectChanges();
    expect(hostElement(fixture.nativeElement).classList.contains('halloween')).toBe(false);
    fixture.destroy();
    vi.advanceTimersByTime(30_000);
    http.expectNone(appearanceUrl);
  });

  it('fails closed after an appearance refresh fails and retries after 30 seconds', () => {
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(appearanceUrl).flush({
      halloweenActive: true,
      serverTime: '2026-10-30T12:00:00Z',
    });
    fixture.detectChanges();
    expect(hostElement(fixture.nativeElement).classList.contains('halloween')).toBe(true);
    vi.advanceTimersByTime(30_000);
    http.expectOne(appearanceUrl).flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(hostElement(fixture.nativeElement).classList.contains('halloween')).toBe(false);
    vi.advanceTimersByTime(30_000);
    http.expectOne(appearanceUrl).flush({
      halloweenActive: false,
      serverTime: '2026-10-30T12:01:00Z',
    });
  });

  it('ignores the retired preview parameter when the server disables decoration', () => {
    window.history.replaceState(null, '', '/demo-fizetes/?halloweenPreview=1');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage denied');
    });
    const fixture = TestBed.createComponent(App);
    TestBed.inject(HttpTestingController)
      .expectOne(appearanceUrl)
      .flush({ halloweenActive: false, serverTime: '2026-10-30T12:00:00Z' });
    fixture.detectChanges();
    expect(hostElement(fixture.nativeElement).classList.contains('halloween')).toBe(false);
  });

  it('ignores retired preview storage when the appearance request fails', () => {
    sessionStorage.setItem('mi-bolt.halloween-preview', '1');
    const fixture = TestBed.createComponent(App);
    TestBed.inject(HttpTestingController)
      .expectOne(appearanceUrl)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(hostElement(fixture.nativeElement).classList.contains('halloween')).toBe(false);
  });
});
