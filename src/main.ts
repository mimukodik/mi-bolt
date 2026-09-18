import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeHu from '@angular/common/locales/hu';

import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

// Register Hungarian locale data before bootstrap so the DatePipe,
// CurrencyPipe and friends format Hungarian numbers, dates and
// currency values. Locale data is referenced by `hu-HU` everywhere
// in the application; redeclaring here is a no-op for re-imports.
registerLocaleData(localeHu, 'hu-HU');

/**
 * Boot the MSW service worker BEFORE Angular bootstraps so any
 * HTTP call made during application initialisation is already
 * intercepted. The worker is only started when `environment.demo`
 * or `environment.e2e` is true so production builds never ship a
 * mocking surface.
 *
 * The MSW module graph (`./core/bootstrap-demo` -> `./mocks/browser`
 * -> MSW handler factory) is loaded via `import()` so the production
 * bundle's treeshaker can isolate the dependency chain into a chunk
 * that is only fetched when `environment.production === false`. A
 * static `import { prepareMocks }` would force the bundler to keep
 * the module reachable as long as the binding is exported, which
 * would leak MSW, `setupWorker`, `startMockWorker` and the
 * `mockServiceWorker.js` URL into `main-*.js` even though the
 * runtime short-circuits in production. The `bootstrap-demo.ts`
 * module additionally throws `Error('MSW bootstrap called in
 * production')` as a defensive gate so a stray call cannot
 * silently bring the worker up in production.
 *
 * `onUnhandledRequest: 'error'` is the T02 network-isolation
 * gate: a request that escapes the registered handlers fails the
 * surrounding test, both for the unit suite (msw/node setupServer)
 * and for the E2E suite (msw/browser setupWorker).
 *
 * `prepareMocks()` (T05) hydrates the sessionStorage snapshot
 * BEFORE starting the worker so the very first intercepted request
 * can already read the cart/receipt state from the previous tab.
 *
 * A failure to start the worker is logged but does NOT block
 * bootstrap: a service-worker registration rejection, an empty
 * sessionStorage under Safari private mode, or a malformed demo
 * scenario must not prevent the application from rendering. The
 * worker is a development convenience; the app should still boot
 * without it.
 */
const start = async (): Promise<void> => {
  if (environment.production) {
    bootstrapApplication(App, appConfig).catch(showFatal);
    return;
  }
  const { prepareMocks } = await import('./core/bootstrap-demo');
  await prepareMocks().catch((err: unknown) => {
    console.error('[MiBolt] Mock preparation failed; continuing without mocks:', err);
  });
  bootstrapApplication(App, appConfig).catch(showFatal);
};

void start();

function showFatal(err: unknown): void {
  console.error('[MiBolt] Bootstrap failed:', err);
  const fatal = document.querySelector<HTMLElement>('app-fatal');
  if (fatal) {
    fatal.hidden = false;
  }
}
