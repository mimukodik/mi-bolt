import { registerLocaleData } from '@angular/common';
import localeHu from '@angular/common/locales/hu';
import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { SPLASH_ID } from '@mi-bolt/core-api/splash';

import { appConfig } from './app/app.config';
import { App } from './app/app';

// Register Hungarian locale data before bootstrap so `CurrencyPipe`
// formats the amount as `129 990 Ft`, exactly as the shop's `src/main.ts`
// does for its own surfaces.
registerLocaleData(localeHu, 'hu-HU');

/**
 * Boot MSW before Angular so the page's first read is already intercepted.
 *
 * `isDevMode()` is the production gate: it is false whenever the Angular
 * CLI builds with `optimization` on, which every configuration but
 * `development` does. The mock module graph is behind `import()` so the
 * production bundle keeps MSW out of the initial chunk.
 *
 * The lines below follow the storefront's `startMocks`
 * (`src/core/bootstrap-demo.ts`) rather than importing it: that wrapper also
 * carries `PERSISTENCE_MODE` plumbing for the shop's `DemoNotice`, which this
 * application has no use for. The page is reached by a redirect from the shop,
 * so its URL carries no `?mi-scenario=`: it hydrates the snapshot of the
 * scenario the shop's tab remembered (`readActiveScenarioName`), falling back
 * to its own URL's scenario when none is stored, and writes the outcome back
 * under that same name (`startMockWorker`'s second argument), while its
 * handlers keep its own URL's scenario. It never writes the remembered name
 * itself.
 */
const start = async (): Promise<void> => {
  if (isDevMode()) {
    const [{ startMockWorker }, { createBrowserPersistence }, scenarios] = await Promise.all([
      import('@mi-bolt/mocks/browser'),
      import('@mi-bolt/mocks/persistence'),
      import('@mi-bolt/mocks/scenarios'),
    ]);
    const name = scenarios.readActiveScenarioName(scenarios.browserSessionStorage());
    const scenario =
      name === null ? scenarios.parseScenarioFromLocation() : scenarios.resolveScenario(name);
    const clock = scenarios.createRealClock(scenario.clockOffsetMs);
    const persistence = createBrowserPersistence({ nowMs: () => Date.parse(clock.now()) });
    const snapshot = persistence.hydrate(scenario.name);
    await startMockWorker(snapshot, scenario.name);
  }
  await bootstrapApplication(App, appConfig);
};

void start().catch((err: unknown) => {
  console.error(err);
  // A failed start never reaches the payment page, so the cover screen goes here.
  document.getElementById(SPLASH_ID)?.remove();
});
