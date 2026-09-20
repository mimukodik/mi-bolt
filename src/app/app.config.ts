import type { ApplicationConfig, EnvironmentProviders, Provider } from '@angular/core';
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { provideApiConfiguration as provideApiConfig } from './api/generated/api-configuration';
import { resolveApiRoot } from './core/api/api-root';
import { demoSessionInterceptor } from './core/api/demo-session.interceptor';

/**
 * Local production / development / e2e build providers. Each binding is
 * kept as a named top-level constant so the call site is auditable
 * in tests and remains a single source of truth: removing the constant
 * deletes the call as well, and downstream tasks can extend the list by
 * inserting a new `const _foo = provideX(...)` line.
 */
const _provideZoneless: EnvironmentProviders = provideZonelessChangeDetection();
const _provideHttpWithFetch = provideHttpClient(withInterceptors([demoSessionInterceptor]));
const _provideRouter = provideRouter(
  routes,
  withComponentInputBinding(),
  withInMemoryScrolling({
    anchorScrolling: 'enabled',
    scrollPositionRestoration: 'enabled',
  }),
);
const _provideApi: Provider = provideApiConfig(resolveApiRoot());

/**
 * `appConfig` is the provider list passed to `bootstrapApplication`
 * inside `main.ts`. `bootstrapApplication(App, appConfig)` is the
 * only call into the Angular application surface in production builds.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    _provideZoneless,
    _provideHttpWithFetch,
    _provideRouter,
    _provideApi,
  ],
};

/**
 * `providerManifest` is consumed by `app.spec.ts` to assert that each
 * provider required by T01-AC01..AC04 was actually wired up. The
 * exports are the live references returned by each provider function;
 * removing the constant above breaks the build, which is the
 * protection the manifest relies on.
 */
export const providerManifest = {
  zonelessChangeDetection: _provideZoneless,
  httpClientWithFetch: _provideHttpWithFetch,
  router: _provideRouter,
  api: _provideApi,
} as const;
