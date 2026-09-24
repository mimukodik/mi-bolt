import { setupWorker } from 'msw/browser';

import { createDb } from './db';
import { adminHandlers } from './handlers';
import { parseScenario } from './scenario';
import { SEED_ADMIN, SEED_ADMIN_PASSWORD } from './seed';
import { waitForController } from './wait-for-controller';

/**
 * Starts the admin mock worker: builds the db from the `?mi-scenario=` query
 * parameter, registers every admin handler over it, and starts MSW so
 * `npm run start:admin` answers every call inside the page. Resolves the
 * worker script against `document.baseURI` so it is found under the admin
 * app's `/admin/` base path, bypasses anything MSW does not have a handler
 * for (the Material font links and the seed media must pass through), waits
 * until the worker controls this page (`waitForController`), and prints the
 * development sign-in once the worker is up.
 *
 * Called from `main.ts` before `bootstrapApplication`, only in a
 * non-production demo build.
 */
export async function startAdminMocks(): Promise<void> {
  const db = createDb(parseScenario(location.search));
  const worker = setupWorker(...adminHandlers(db));
  await worker.start({
    serviceWorker: {
      url: new URL('mockServiceWorker.js', document.baseURI).href,
    },
    onUnhandledRequest: 'bypass',
    quiet: true,
  });
  await waitForController(navigator.serviceWorker);
  console.info(
    `Admin mock: sign in as ${SEED_ADMIN.username} / ${SEED_ADMIN_PASSWORD} (scenario ${db.scenario})`,
  );
}
