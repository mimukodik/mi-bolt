import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeHu from '@angular/common/locales/hu';

import { appConfig } from './app/app.config';
import { App } from './app/app';
import { prepareMocks } from './core/bootstrap-demo';

// Register Hungarian locale data before bootstrap so the DatePipe,
// CurrencyPipe and friends format Hungarian numbers, dates and
// currency values. Locale data is referenced by `hu-HU` everywhere
// in the application; redeclaring here is a no-op for re-imports.
registerLocaleData(localeHu, 'hu-HU');

// Re-export `prepareMocks` so E2E specs that bind handlers via the
// global Playwright `page.exposeBinding` indirection can detect that
// the demo is ready before continuing.
export { prepareMocks };

// Re-export the browser worker so E2E specs that bind handlers via
// `page.exposeBinding` can reach the same MSW instance that the
// service worker uses.
export { worker } from './mocks/browser';

/**
 * Boot the MSW service worker BEFORE Angular bootstraps so any
 * HTTP call made during application initialisation is already
 * intercepted. The worker is only started when `environment.demo`
 * or `environment.e2e` is true so production builds never ship a
 * mocking surface.
 *
 * `onUnhandledRequest: 'error'` is the T02 network-isolation
 * gate: a request that escapes the registered handlers fails the
 * surrounding test, both for the unit suite (msw/node setupServer)
 * and for the E2E suite (msw/browser setupWorker).
 *
 * `prepareMocks()` (T05) hydrates the sessionStorage snapshot
 * BEFORE starting the worker so the very first intercepted request
 * can already read the cart/receipt state from the previous tab.
 * If registration or startup throws, `showFatal` renders the
 * fatal-startup surface defined in `app.html`.
 */
prepareMocks()
  .then(() => bootstrapApplication(App, appConfig))
  .catch((err) => {
    showFatal(err);
  });

function showFatal(err: unknown): void {
  console.error('[MiBolt] Bootstrap failed:', err);
  const fatal = document.querySelector<HTMLElement>('app-fatal');
  if (fatal) {
    fatal.hidden = false;
  }
}
