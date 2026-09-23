import type { ApplicationConfig } from '@angular/core';
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';
import { resolveApiRoot } from '@mi-bolt/core-api/api-root';
import { demoSessionInterceptor } from '@mi-bolt/core-api/demo-session.interceptor';

import { routes } from './app.routes';

/** Provider list for `bootstrapApplication(App, appConfig)` in `main.ts`. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([demoSessionInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    provideApiConfiguration(resolveApiRoot()),
  ],
};
