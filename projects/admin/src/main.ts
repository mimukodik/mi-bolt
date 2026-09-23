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
 * Starts the in-page mock worker before bootstrap, in a non-production demo
 * build only. `isDevMode()` is not usable here: the `local-backend`
 * configuration is a dev build too, and it must not start the worker. The
 * dynamic `import()` keeps `setupWorker` out of the initial bundle: the
 * production build still emits the worker as a lazy chunk, which this guard
 * never fetches.
 */
async function bootstrap(): Promise<void> {
  if (!environment.production && environment.demo) {
    const { startAdminMocks } = await import('./mocks/browser');
    await startAdminMocks();
  }
  await bootstrapApplication(App, appConfig);
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  const message = document.createElement('p');
  message.setAttribute('role', 'alert');
  message.textContent = 'Az admin nem tudott elindulni. A részletek a böngésző konzoljában vannak.';
  document.body.replaceChildren(message);
});
