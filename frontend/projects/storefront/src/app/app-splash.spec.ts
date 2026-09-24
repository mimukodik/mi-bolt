/**
 * MIM-404: the index.html cover screen leaves once the router's first
 * navigation has settled, and not at a redirect's cancellation.
 */

// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { inject, provideZonelessChangeDetection } from '@angular/core';
import { NavigationCancel, Router, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SPLASH_ID, SPLASH_LEAVING_CLASS } from '@mi-bolt/core-api/splash';

import { App } from './app';

describe('MIM-404 App splash', () => {
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
      providers: [provideRouter([{ path: '', children: [] }]), provideZonelessChangeDetection()],
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
        provideZonelessChangeDetection(),
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
        provideZonelessChangeDetection(),
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
