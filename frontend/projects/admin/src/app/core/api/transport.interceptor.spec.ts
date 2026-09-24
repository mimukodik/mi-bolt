// projects/admin/src/app/core/api/transport.interceptor.spec.ts — MIM-404.
//
// `transportInterceptor` hands a request marked with USE_XHR to
// HttpXhrBackend, after the interceptors listed before it, and passes every
// other request on to the default backend.

import {
  HttpClient,
  HttpResponse,
  HttpXhrBackend,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import type { HttpBackend, HttpEvent, HttpRequest } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import type { Observable } from 'rxjs';

import { ifMatchInterceptor, withIfMatch } from './if-match.interceptor';
import { USE_XHR, transportInterceptor } from './transport.interceptor';

describe('transportInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let xhrRequests: HttpRequest<unknown>[];

  beforeEach(() => {
    xhrRequests = [];
    const xhrBackend = {
      handle: (request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> => {
        xhrRequests.push(request);
        return of(new HttpResponse({ status: 200, body: { via: 'xhr' } }));
      },
    } satisfies HttpBackend;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([ifMatchInterceptor, transportInterceptor])),
        provideHttpClientTesting(),
        { provide: HttpXhrBackend, useValue: xhrBackend },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
    TestBed.resetTestingModule();
  });

  it('passes a request without USE_XHR on to the default backend', () => {
    http.get('/api/v1/admin/products').subscribe();

    controller.expectOne('/api/v1/admin/products').flush({});
    expect(xhrRequests).toEqual([]);
  });

  it('hands a request marked USE_XHR to HttpXhrBackend after the interceptors before it', () => {
    let body: unknown;
    http
      .get('/api/v1/admin/media', { context: withIfMatch('"3"').set(USE_XHR, true) })
      .subscribe((received) => {
        body = received;
      });

    controller.expectNone('/api/v1/admin/media');
    expect(xhrRequests.map((request) => request.url)).toEqual(['/api/v1/admin/media']);
    expect(xhrRequests[0]?.headers.get('If-Match')).toBe('"3"');
    expect(body).toEqual({ via: 'xhr' });
  });
});
