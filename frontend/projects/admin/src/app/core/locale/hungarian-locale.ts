import { registerLocaleData } from '@angular/common';
import localeHu from '@angular/common/locales/hu';
import { provideEnvironmentInitializer } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';

/**
 * Registers the Hungarian locale data that `DatePipe` needs for the `hu-HU`
 * `LOCALE_ID` (app.config.ts). Only the lazily loaded routes whose screens
 * format dates provide it, so the locale data ships with those chunks rather
 * than in the initial bundle (MIM-404). The router creates such a route's
 * environment injector, which runs this initializer, before the route's
 * component renders. Registering the same data again is harmless.
 */
export function provideHungarianLocaleData(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    registerLocaleData(localeHu, 'hu-HU');
  });
}
