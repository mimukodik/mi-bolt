// projects/admin/src/app/core/api/if-match.interceptor.spec.ts — MIM-331, plan F4 D14.
//
// `ifMatchInterceptor` writes the value set through `withIfMatch(...)`
// into the outgoing `If-Match` header verbatim, and writes no header
// at all when the request has no context.

import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ifMatchInterceptor, withIfMatch } from './if-match.interceptor';

describe('ifMatchInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([ifMatchInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
    TestBed.resetTestingModule();
  });

  it('writes If-Match: "3" verbatim when withIfMatch("3") is passed', () => {
    http.get('/api/v1/admin/products', { context: withIfMatch('"3"') }).subscribe();
    const request = controller.expectOne('/api/v1/admin/products');
    expect(request.request.headers.get('If-Match')).toBe('"3"');
    request.flush({});
  });

  it('writes If-Match: W/"x" verbatim when withIfMatch("x") is passed', () => {
    http.get('/api/v1/admin/products/abc', { context: withIfMatch('W/"x"') }).subscribe();
    const request = controller.expectOne('/api/v1/admin/products/abc');
    expect(request.request.headers.get('If-Match')).toBe('W/"x"');
    request.flush({});
  });

  it('omits the If-Match header when no context is supplied', () => {
    http.get('/api/v1/admin/products').subscribe();
    const request = controller.expectOne('/api/v1/admin/products');
    expect(request.request.headers.has('If-Match')).toBe(false);
    request.flush({});
  });
});
