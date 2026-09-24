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
 * Snapshot key prefix, mirrored from `projects/shop-mocks/src/persistence.ts:35`. The
 * constant is module-private there, so it is repeated rather than
 * imported; the two must stay in step, and the scan below is the only
 * reader of it in this application.
 */
const SNAPSHOT_KEY_PREFIX = 'mi-bolt.snapshot.';

/**
 * Scenario resolution, reader side (the S3-P0 addendum's decision).
 *
 * The payment page is reached by a redirect from the shop, so its URL
 * carries no `?mi-scenario=`. The shop's snapshot key namespaces the
 * scenario name, so when exactly one `mi-bolt.snapshot.*` key is in
 * sessionStorage its suffix names the scenario the shop is running and
 * both applications read the same snapshot. No key, or more than one,
 * is ambiguous and falls back to the URL.
 */
function readScenarioNameFromSnapshotKeys(): string | null {
  let found: string | null = null;
  try {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key === null) continue;
      if (!key.startsWith(SNAPSHOT_KEY_PREFIX)) continue;
      if (found !== null) return null;
      found = key.slice(SNAPSHOT_KEY_PREFIX.length);
    }
  } catch {
    // Private browsing denies sessionStorage outright; the persistence
    // adapter handles the same denial on its own side.
    return null;
  }
  return found;
}

/**
 * Boot MSW before Angular so the page's first read is already intercepted.
 *
 * `isDevMode()` is the production gate: it is false whenever the Angular
 * CLI builds with `optimization` on, which every configuration but
 * `development` does. The mock module graph is behind `import()` so the
 * production bundle keeps MSW out of the initial chunk.
 *
 * The six lines below are `startMocks`'s body (`src/core/bootstrap-demo.ts:58-72`)
 * inlined rather than imported: that wrapper also carries `PERSISTENCE_MODE`
 * plumbing for the shop's `DemoNotice`, which this application has no use for.
 */
const start = async (): Promise<void> => {
  if (isDevMode()) {
    const [{ startMockWorker }, { createBrowserPersistence }, scenarios] = await Promise.all([
      import('@mi-bolt/mocks/browser'),
      import('@mi-bolt/mocks/persistence'),
      import('@mi-bolt/mocks/scenarios'),
    ]);
    const name = readScenarioNameFromSnapshotKeys();
    const scenario =
      name === null ? scenarios.parseScenarioFromLocation() : scenarios.resolveScenario(name);
    const clock = scenarios.createRealClock(scenario.clockOffsetMs);
    const persistence = createBrowserPersistence({ nowMs: () => Date.parse(clock.now()) });
    const snapshot = persistence.hydrate(scenario.name);
    await startMockWorker(snapshot);
  }
  await bootstrapApplication(App, appConfig);
};

void start().catch((err: unknown) => {
  console.error(err);
  // A failed start never reaches the payment page, so the cover screen goes here.
  document.getElementById(SPLASH_ID)?.remove();
});
