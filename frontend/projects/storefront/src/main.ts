import { bootstrapApplication } from '@angular/platform-browser';

import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';
import { PERSISTENCE_MODE, SNAPSHOT_DISCARD } from './app/core/persistence-mode';
import { SPLASH_ID } from '@mi-bolt/core-api/splash';

/**
 * Boot the MSW service worker BEFORE Angular bootstraps so any
 * HTTP call made during application initialisation is already
 * intercepted. The worker is only started when `environment.demo`
 * is true so production builds never ship a mocking surface.
 *
 * The MSW module graph (`./core/bootstrap-demo` -> `projects/shop-mocks/src/browser`
 * -> MSW handler factory) is loaded via `import()` so the production
 * bundle's treeshaker can isolate the dependency chain into a chunk
 * that is only fetched when `environment.production === false`. A
 * static `import { startMocks }` would force the bundler to keep
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
 * and for the browser worker (msw/browser setupWorker).
 *
 * `startMocks()` (T05) hydrates the sessionStorage snapshot
 * BEFORE starting the worker so the very first intercepted request
 * can already read the cart/receipt state from the previous tab.
 *
 * A failure to start the worker renders the retryable fatal state
 * and does not bootstrap, satisfying T05-AC01.
 */
const start = async (): Promise<void> => {
  if (environment.production) {
    bootstrapApplication(App, appConfig).catch(showFatal);
    return;
  }
  const { startMocks, getPreparedPersistenceMode, getPreparedSnapshotDiscard } =
    await import('./core/bootstrap-demo');
  try {
    await startMocks();
  } catch (err: unknown) {
    // MSW is the application's entire data layer, not a development
    // convenience: every screen would render an error or an empty
    // state with no explanation. T05-AC01 requires an explicit,
    // retryable fatal state instead of a half-booted application.
    showFatal(err);
    return;
  }
  bootstrapApplication(App, {
    ...appConfig,
    providers: [
      ...appConfig.providers,
      { provide: PERSISTENCE_MODE, useValue: getPreparedPersistenceMode() },
      { provide: SNAPSHOT_DISCARD, useValue: getPreparedSnapshotDiscard() },
    ],
  }).catch(showFatal);
};

void start().catch(showFatal);

function showFatal(err: unknown): void {
  console.error('[MiBolt] Bootstrap failed:', err);
  // A failed start never reaches the first navigation, so the cover screen goes here.
  document.getElementById(SPLASH_ID)?.remove();
  const template = document.querySelector<HTMLTemplateElement>('#mi-bolt-fatal');
  if (template === null) {
    throw new Error(
      '[MiBolt] fatal surface template #mi-bolt-fatal is missing from src/index.html',
    );
  }
  const fragment = template.content.cloneNode(true);
  document.body.appendChild(fragment);
  document
    .querySelector<HTMLButtonElement>('[data-testid="fatal-retry"]')
    ?.addEventListener('click', () => {
      globalThis.location.reload();
    });
}
