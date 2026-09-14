import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeHu from '@angular/common/locales/hu';

import { appConfig } from './app/app.config';
import { App } from './app/app';

// Register Hungarian locale data before bootstrap so the DatePipe,
// CurrencyPipe and friends format Hungarian numbers, dates and
// currency values. Locale data is referenced by `hu-HU` everywhere
// in the application; redeclaring here is a no-op for re-imports.
registerLocaleData(localeHu, 'hu-HU');

/**
 * Bootstrap the MiBolt standalone zoneless CSR application. If
 * bootstrap throws — usually because a critical provider is missing
 * or the home route component failed to load — render the fatal
 * surface that lives in `app.html` instead of leaving a blank page.
 */
bootstrapApplication(App, appConfig).catch((err) => {
  showFatal(err);
});

function showFatal(err: unknown): void {
  console.error('[MiBolt] Bootstrap failed:', err);
  const fatal = document.querySelector<HTMLElement>('app-fatal');
  if (fatal) {
    fatal.hidden = false;
  }
}
