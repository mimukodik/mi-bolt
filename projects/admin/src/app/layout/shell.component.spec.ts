import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { ANIMATION_MODULE_TYPE, Component } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { MOCK_PLATFORM_LOCATION_CONFIG } from '@angular/common/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import type { Observable } from 'rxjs';
import type { BreakpointState } from '@angular/cdk/layout';
import { HttpResponse, http } from 'msw';
import { of } from 'rxjs';
import { MatSidenav } from '@angular/material/sidenav';
import type { MockResult } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveApiRoot } from '@mi-bolt/core-api/api-root';

import { provideApiConfiguration } from '../api/generated/api-configuration';
import { authHandlers } from '../../mocks/auth.handlers';
import { createDb } from '../../mocks/db';
import { SEED_ADMIN, SEED_ADMIN_PASSWORD } from '../../mocks/seed';
import { server, useMswServer } from '../../testing/msw-server';
import { AdminSession } from '../core/auth/admin-session';
import { unauthorizedInterceptor } from '../core/auth/unauthorized.interceptor';

import { ShellComponent } from './shell.component';

useMswServer();

/** See `confirm-dialog.spec.ts` (shared/confirm-dialog) for why NoopAnimations is required in jsdom. */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

@Component({ selector: 'adm-stub', template: '' })
class StubComponent {}

function breakpointStub(matches: boolean): Partial<BreakpointObserver> {
  return {
    observe: (): Observable<BreakpointState> => of({ matches, breakpoints: {} }),
  };
}

function sidenavOf(fixture: ComponentFixture<ShellComponent>): MatSidenav {
  const instance: unknown = fixture.debugElement.query(By.directive(MatSidenav)).componentInstance;
  if (!(instance instanceof MatSidenav)) {
    throw new Error('Expected a mat-sidenav in the shell');
  }
  return instance;
}

function hostOf(fixture: ComponentFixture<ShellComponent>): HTMLElement {
  const element: unknown = fixture.nativeElement;
  if (!(element instanceof HTMLElement)) {
    throw new Error('Expected the host element');
  }
  return element;
}

/** Providers every shell test needs: `ShellComponent` injects `AdminSession`, which needs `HttpClient`. */
function baseProviders(): unknown[] {
  return [
    provideHttpClient(withXhr(), withInterceptors([unauthorizedInterceptor])),
    provideApiConfiguration(resolveApiRoot()),
    { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: document.baseURI } },
    NOOP_ANIMATIONS,
  ];
}

/** Signs in the seeded admin directly on the mock db, then syncs `AdminSession`. */
async function signIn(db: ReturnType<typeof createDb>): Promise<void> {
  db.sessionAdminId = SEED_ADMIN.id;
  await TestBed.inject(AdminSession).refresh();
}

function accountTrigger(native: HTMLElement): HTMLButtonElement | null {
  const found = Array.from(native.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.getAttribute('aria-label') === 'Fiók menü',
  );
  return found ?? null;
}

function overlay(): HTMLElement {
  const found = document.querySelector('.cdk-overlay-container');
  if (!(found instanceof HTMLElement)) {
    throw new Error('Expected the overlay container');
  }
  return found;
}

/** Each menu item's label, read from its `<span>` so the icon's ligature text is excluded. */
function menuItemLabels(): string[] {
  return Array.from(overlay().querySelectorAll('.mat-mdc-menu-item')).map(
    (item) => item.querySelector('span')?.textContent.trim() ?? '',
  );
}

function snackBarText(): string {
  const found = document.querySelector('.mat-mdc-snack-bar-label');
  return found === null ? '' : found.textContent.trim();
}

/** Narrows a spy's recorded result so the caller can await the promise `openPasswordChange` returned. */
function returnedPromise(result: MockResult<Promise<void>>): Promise<void> {
  if (result.type === 'return') {
    return result.value;
  }
  throw new Error('openPasswordChange did not return');
}

describe('ShellComponent', () => {
  let fixture: ComponentFixture<ShellComponent>;
  let native: HTMLElement;

  afterEach(() => {
    // The XSRF cookie is a real `document.cookie` entry, not TestBed state,
    // so it survives a test module reset; a stale value from a previous
    // test's token would fail the next test's CSRF check.
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/';
  });

  describe('with empty router', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({
        imports: [ShellComponent],
        providers: [
          provideRouter([]),
          { provide: APP_BASE_HREF, useValue: '/admin/' },
          { provide: BreakpointObserver, useValue: breakpointStub(false) },
          ...baseProviders(),
        ],
      });
      fixture = TestBed.createComponent(ShellComponent);
      native = hostOf(fixture);
      fixture.detectChanges();
    });

    it('renders the three nav links with the expected hrefs', () => {
      const links: Element[] = Array.from(native.querySelectorAll('a.mat-mdc-list-item'));
      const hrefs = links.map((a) => a.getAttribute('href'));
      expect(hrefs).toEqual(['/admin/attekintes', '/admin/termekek', '/admin/adminok']);
    });

    it('labels the three nav links in Hungarian', () => {
      const labels: string[] = Array.from(native.querySelectorAll('a.mat-mdc-list-item')).map(
        (a) => a.textContent,
      );
      expect(labels).toEqual(['Áttekintés', 'Termékek', 'Adminok']);
    });

    it('shows the brand text in the top toolbar', () => {
      const toolbars: Element[] = Array.from(native.querySelectorAll('mat-toolbar'));
      // First toolbar is the sidenav ("Menü"); second is the brand bar.
      const brandBar = toolbars[1];
      const text = brandBar.textContent;
      expect(text).toContain('MiBolt Admin');
    });
  });

  describe('layout and drawer behaviour', () => {
    it('keeps the sidenav open in side mode on desktop', () => {
      TestBed.configureTestingModule({
        imports: [ShellComponent],
        providers: [
          provideRouter([{ path: 'x', component: StubComponent }]),
          { provide: APP_BASE_HREF, useValue: '/admin/' },
          { provide: BreakpointObserver, useValue: breakpointStub(false) },
          ...baseProviders(),
        ],
      });
      fixture = TestBed.createComponent(ShellComponent);
      fixture.detectChanges();
      const sidenav = sidenavOf(fixture);
      expect(sidenav.opened).toBe(true);
      expect(sidenav.mode).toBe('side');
    });

    it('closes the drawer after a navigation on handset', async () => {
      TestBed.configureTestingModule({
        imports: [ShellComponent],
        providers: [
          provideRouter([{ path: 'x', component: StubComponent }]),
          { provide: APP_BASE_HREF, useValue: '/admin/' },
          { provide: BreakpointObserver, useValue: breakpointStub(true) },
          ...baseProviders(),
        ],
      });
      fixture = TestBed.createComponent(ShellComponent);
      fixture.detectChanges();
      const sidenav = sidenavOf(fixture);
      expect(sidenav.mode).toBe('over');
      // Force the sidenav open so we can prove the navigation handler closes it.
      await sidenav.open();
      expect(sidenav.opened).toBe(true);
      await TestBed.inject(Router).navigateByUrl('/x');
      await fixture.whenStable();
      expect(sidenav.opened).toBe(false);
    });
  });

  describe('the account menu (MIM-339)', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({
        imports: [ShellComponent],
        providers: [
          provideRouter([
            { path: 'x', component: StubComponent },
            { path: 'bejelentkezes', component: StubComponent },
          ]),
          { provide: APP_BASE_HREF, useValue: '/admin/' },
          { provide: BreakpointObserver, useValue: breakpointStub(false) },
          ...baseProviders(),
        ],
      });
    });

    it("shows the signed-in admin's username, and the menu lists exactly Jelszó módosítása and Kijelentkezés", async () => {
      const db = createDb();
      server?.use(...authHandlers(db));
      fixture = TestBed.createComponent(ShellComponent);
      native = hostOf(fixture);
      fixture.detectChanges();
      await signIn(db);
      await fixture.whenStable();

      const trigger = accountTrigger(native);
      expect(trigger).not.toBeNull();
      expect(trigger?.textContent).toContain(SEED_ADMIN.username);

      trigger?.click();
      await fixture.whenStable();

      expect(menuItemLabels()).toEqual(['Jelszó módosítása', 'Kijelentkezés']);
    });

    it('Kijelentkezés sends the logout POST and navigates to /bejelentkezes', async () => {
      const db = createDb();
      server?.use(...authHandlers(db));
      fixture = TestBed.createComponent(ShellComponent);
      native = hostOf(fixture);
      fixture.detectChanges();
      await signIn(db);
      await fixture.whenStable();

      let logoutRequests = 0;
      const listener = ({ request }: { request: Request }): void => {
        if (request.method === 'POST' && request.url.includes('/admin/auth/logout')) {
          logoutRequests += 1;
        }
      };
      server?.events.on('request:start', listener);

      accountTrigger(native)?.click();
      await fixture.whenStable();
      const kijelentkezes = menuItemLabels().indexOf('Kijelentkezés');
      const items = Array.from(overlay().querySelectorAll<HTMLElement>('.mat-mdc-menu-item'));
      items[kijelentkezes].click();
      await fixture.whenStable();

      server?.events.removeListener('request:start', listener);
      expect(logoutRequests).toBe(1);
      expect(TestBed.inject(Router).url).toBe('/bejelentkezes');
    });

    it('shows a snack-bar and does not navigate when logout fails once', async () => {
      const db = createDb();
      server?.use(...authHandlers(db));
      server?.use(
        http.post('*/api/v1/admin/auth/logout', () => HttpResponse.json({}, { status: 503 }), {
          once: true,
        }),
      );
      fixture = TestBed.createComponent(ShellComponent);
      native = hostOf(fixture);
      fixture.detectChanges();
      await signIn(db);
      await fixture.whenStable();

      const startUrl = TestBed.inject(Router).url;

      accountTrigger(native)?.click();
      await fixture.whenStable();
      const items = Array.from(overlay().querySelectorAll<HTMLElement>('.mat-mdc-menu-item'));
      items[menuItemLabels().indexOf('Kijelentkezés')].click();
      await fixture.whenStable();

      expect(snackBarText()).toBe('A kijelentkezés nem sikerült. Próbáld újra.');
      expect(TestBed.inject(Router).url).toBe(startUrl);
    });

    it('Jelszó módosítása opens the dialog, and closing it with true shows Jelszó módosítva', async () => {
      const db = createDb();
      server?.use(...authHandlers(db));
      fixture = TestBed.createComponent(ShellComponent);
      native = hostOf(fixture);
      fixture.detectChanges();
      await signIn(db);
      await fixture.whenStable();

      accountTrigger(native)?.click();
      await fixture.whenStable();
      const opening = vi.spyOn(fixture.componentInstance, 'openPasswordChange');
      const items = Array.from(overlay().querySelectorAll<HTMLElement>('.mat-mdc-menu-item'));
      items[menuItemLabels().indexOf('Jelszó módosítása')].click();
      await fixture.whenStable();

      expect(opening).toHaveBeenCalledTimes(1);
      await returnedPromise(opening.mock.results[0]);
      await fixture.whenStable();

      expect(overlay().querySelector('h2[mat-dialog-title]')?.textContent).toBe(
        'Jelszó módosítása',
      );

      const inputs = Array.from(overlay().querySelectorAll<HTMLInputElement>('input'));
      inputs[0].value = SEED_ADMIN_PASSWORD;
      inputs[0].dispatchEvent(new Event('input'));
      inputs[1].value = 'a-brand-new-password';
      inputs[1].dispatchEvent(new Event('input'));
      inputs[2].value = 'a-brand-new-password';
      inputs[2].dispatchEvent(new Event('input'));
      const submit = Array.from(overlay().querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.type === 'submit',
      );
      submit?.click();
      await fixture.whenStable();

      expect(snackBarText()).toBe('Jelszó módosítva.');
    });

    it('shows no account trigger when signed out', () => {
      fixture = TestBed.createComponent(ShellComponent);
      native = hostOf(fixture);
      fixture.detectChanges();

      expect(accountTrigger(native)).toBeNull();
    });
  });
});
