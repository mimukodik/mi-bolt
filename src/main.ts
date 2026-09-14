import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeHu from '@angular/common/locales/hu';

import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';
import { startMockWorker, worker } from './mocks/browser';

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
 * `onUnhandledRequest: 'error'` is the T02 network-isolation
 * gate: a request that escapes the registered handlers fails the
 * surrounding test, both for the unit suite (msw/node setupServer)
 * and for the E2E suite (msw/browser setupWorker).
 */
async function prepareMocks(): Promise<void> {
  if (!environment.demo && !environment.e2e) return;
  try {
    await startMockWorker();
  } catch (err) {
    console.error('[MiBolt] MSW worker failed to start:', err);
  }
}

/**
 * Bootstrap the MiBolt standalone zoneless CSR application. If
 * bootstrap throws — usually because a critical provider is missing
 * or the home route component failed to load — render the fatal
 * surface that lives in `app.html` instead of leaving a blank page.
 */
prepareMocks()
  .catch((err) => {
    console.error('[MiBolt] Mock preparation failed:', err);
  })
  .finally(() => {
    bootstrapApplication(App, appConfig).catch((err) => {
      showFatal(err);
    });
  });

function showFatal(err: unknown): void {
  console.error('[MiBolt] Bootstrap failed:', err);
  const fatal = document.querySelector<HTMLElement>('app-fatal');
  if (fatal) {
    fatal.hidden = false;
  }
}

// Re-export `worker` for E2E specs that bind handlers via the
// global Playwright `page.exposeBinding` indirection. The bundler
// keeps the export alive even when unused at runtime.
export { worker };
