import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  FetchBackend,
  HttpBackend,
  HttpClient,
  HttpContext,
  HttpResponse,
  HttpXhrBackend,
} from '@angular/common/http';
import type { HttpEvent, HttpRequest } from '@angular/common/http';
import { of } from 'rxjs';
import type { Observable } from 'rxjs';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';

import { App } from './app';
import { appConfig } from './app.config';
import { USE_XHR } from './core/api/transport.interceptor';

/**
 * The root component is an empty shell: the admin's own screens arrive in
 * later units, so what this suite protects is the wiring `app.config.ts`
 * sets up, one assertion per provider.
 */
describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [...appConfig.providers],
    });
  });

  it('renders a router-outlet element', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    expect(raw.querySelector('router-outlet')).not.toBeNull();
  });

  it('provides the Hungarian locale id', () => {
    expect(TestBed.inject(LOCALE_ID)).toBe('hu-HU');
  });

  it('backs HttpClient with the default fetch backend', () => {
    expect(TestBed.inject(HttpBackend)).toBeInstanceOf(FetchBackend);
  });

  it('hands a request marked USE_XHR to the XHR backend (transportInterceptor)', () => {
    const urls: string[] = [];
    TestBed.overrideProvider(HttpXhrBackend, {
      useValue: {
        handle: (request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> => {
          urls.push(request.url);
          return of(new HttpResponse({ status: 200 }));
        },
      } satisfies HttpBackend,
    });

    TestBed.inject(HttpClient)
      .get('/api/v1/admin/media', { context: new HttpContext().set(USE_XHR, true) })
      .subscribe();

    expect(urls).toEqual(['/api/v1/admin/media']);
  });

  it('provides no mat-icon default options, so Angular Material stays out of the initial bundle (MIM-404)', () => {
    expect(TestBed.inject(MAT_ICON_DEFAULT_OPTIONS, null)).toBeNull();
  });
});
