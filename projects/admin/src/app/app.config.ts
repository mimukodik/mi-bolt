import { LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';

import { routes } from './app.routes';

/**
 * Providers for the admin application. Zoneless change detection is
 * Angular 22's default, so no provider switches it on
 * (https://angular.dev/guide/zoneless#enabling-zoneless-in-an-application).
 *
 * The XHR backend replaces the default fetch one, which the file-upload
 * screen needs for `reportProgress` events; `LOCALE_ID` plus the locale
 * registration in `main.ts` gives every pipe Hungarian formatting;
 * `MAT_ICON_DEFAULT_OPTIONS` points `mat-icon` at the self-hosted
 * Material Symbols font loaded from npm.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withXhr()),
    { provide: LOCALE_ID, useValue: 'hu-HU' },
    {
      provide: MAT_ICON_DEFAULT_OPTIONS,
      useValue: { fontSet: 'material-symbols-outlined' },
    },
  ],
};
