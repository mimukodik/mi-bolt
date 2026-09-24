import {
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { resolveApiRoot } from '@mi-bolt/core-api/api-root';
import { provideApiConfiguration } from './api/generated/api-configuration';

import { ifMatchInterceptor } from './core/api/if-match.interceptor';
import { AdminSession } from './core/auth/admin-session';
import { unauthorizedInterceptor } from './core/auth/unauthorized.interceptor';
import { routes } from './app.routes';

/**
 * Providers for the admin application. Zoneless change detection is
 * Angular 22's default, so no provider switches it on
 * (https://angular.dev/guide/zoneless#enabling-zoneless-in-an-application).
 * The admin SDK reaches /api/v1 on the page's own origin (resolveApiRoot)
 * and If-Match travels through ifMatchInterceptor.
 *
 * `LOCALE_ID` gives every pipe Hungarian formatting; the locale data itself
 * is registered by the lazily loaded routes whose screens format dates
 * (`provideHungarianLocaleData`), so it stays out of the initial bundle. The
 * XHR backend replaces the default fetch one, which the file-upload screen
 * needs for `reportProgress` events. Nothing here imports Angular Material,
 * which would put that module into the initial bundle: the lazily loaded
 * login page and shell set the icon font through `applyMaterialSymbolsFont`
 * (MIM-404). The app initializer reads the admin session and primes the
 * `XSRF-TOKEN` cookie before the first route is activated, and
 * `unauthorizedInterceptor` clears the session and returns to the login
 * page on a 401 from any other call.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideApiConfiguration(resolveApiRoot()),
    provideHttpClient(withXhr(), withInterceptors([ifMatchInterceptor, unauthorizedInterceptor])),
    provideAppInitializer(() => inject(AdminSession).refresh()),
    { provide: LOCALE_ID, useValue: 'hu-HU' },
  ],
};
