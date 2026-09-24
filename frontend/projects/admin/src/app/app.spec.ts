import { LOCALE_ID, inject } from '@angular/core';
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
import { NavigationCancel, Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { SPLASH_ID, SPLASH_LEAVING_CLASS } from '@mi-bolt/core-api/splash';

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

/**
 * MIM-404: the index.html cover screen leaves once the router's first
 * navigation has settled, and not at a redirect's or a superseded navigation's cancellation.
 */
describe('App splash', () => {
  function addSplash(): HTMLElement {
    const splash = document.createElement('div');
    splash.id = SPLASH_ID;
    // jsdom has no Web Animations API: no animation runs, so the element goes once dismissed.
    Object.defineProperty(splash, 'getAnimations', { value: () => [] });
    document.body.append(splash);
    return splash;
  }

  afterEach(() => {
    document.getElementById(SPLASH_ID)?.remove();
  });

  it('keeps the cover until the first navigation ends, then removes it', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([{ path: '', children: [] }])],
    });
    const splash = addSplash();
    TestBed.createComponent(App);
    expect(splash.isConnected).toBe(true);

    await TestBed.inject(Router).navigateByUrl('/');

    await vi.waitFor(() => {
      expect(splash.isConnected).toBe(false);
    });
  });

  it('waits past a guard redirect and leaves after the redirected navigation ends', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', canActivate: [() => inject(Router).parseUrl('/belepes')], children: [] },
          { path: 'belepes', children: [] },
        ]),
      ],
    });
    const splash = addSplash();
    TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const leavingAtRedirect: boolean[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationCancel) {
        leavingAtRedirect.push(splash.classList.contains(SPLASH_LEAVING_CLASS));
      }
    });

    await router.navigateByUrl('/');

    expect(leavingAtRedirect).toEqual([false]);
    expect(router.url).toBe('/belepes');
    await vi.waitFor(() => {
      expect(splash.isConnected).toBe(false);
    });
  });

  it('waits past a superseded first navigation and leaves after the newer one ends', async () => {
    const guardCalls: number[] = [];
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          {
            path: '',
            canActivate: [
              () => {
                guardCalls.push(1);
                return new Promise<boolean>(() => {
                  void 0;
                });
              },
            ],
            children: [],
          },
          { path: 'masik', children: [] },
        ]),
      ],
    });
    const splash = addSplash();
    TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    const leavingAtCancel: boolean[] = [];
    router.events.subscribe((event) => {
      if (event instanceof NavigationCancel) {
        leavingAtCancel.push(splash.classList.contains(SPLASH_LEAVING_CLASS));
      }
    });

    const firstNavigation = router.navigateByUrl('/');
    await vi.waitFor(() => {
      expect(guardCalls).toHaveLength(1);
    });
    await router.navigateByUrl('/masik');

    await expect(firstNavigation).resolves.toBe(false);
    expect(leavingAtCancel).toEqual([false]);
    expect(router.url).toBe('/masik');
    await vi.waitFor(() => {
      expect(splash.isConnected).toBe(false);
    });
  });

  it('removes the cover when the first navigation fails', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          {
            path: '',
            canActivate: [
              () => {
                throw new Error('guard failed');
              },
            ],
            children: [],
          },
        ]),
      ],
    });
    const splash = addSplash();
    TestBed.createComponent(App);

    await expect(TestBed.inject(Router).navigateByUrl('/')).rejects.toThrow('guard failed');

    await vi.waitFor(() => {
      expect(splash.isConnected).toBe(false);
    });
  });
});
