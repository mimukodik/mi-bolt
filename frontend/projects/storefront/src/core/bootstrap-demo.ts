/**
 * T05 — bootstrap-demo entry point.
 *
 * `startMocks()` is the single public hook the rest of the
 * application calls before `bootstrapApplication`. It:
 *
 *   1. Resolves the active scenario from `?mi-scenario=`.
 *   2. Hydrates the sessionStorage snapshot via the persistence
 *      adapter so the handler factory can read cart/receipt state
 *      from a cold reload.
 *   3. Starts the MSW service worker so any HTTP call made during
 *      application initialisation is intercepted.
 *
 * Steps 2 and 3 run sequentially; if either fails the function
 * throws so the caller (`src/main.ts`) can render the fatal-startup
 * surface defined in `app.html`.
 */

import { environment } from '../environments/environment';
import { startMockWorker } from '../mocks/browser';
import { createBrowserPersistence } from '../mocks/persistence';
import { createRealClock, parseScenarioFromLocation } from '../mocks/scenarios';

/** Tracks the last prepared scenario for diagnostics. */
let preparedScenario: string | null = null;

/**
 * Tracks whether the most recent `startMocks()` hydrate found
 * `sessionStorage` denied. `main.ts` reads this once, after
 * `startMocks()` resolves, and supplies it to Angular's DI as the
 * `PERSISTENCE_MODE` token so `AppShell` can drive `DemoNotice`'s
 * `'memory'` state (FIX-70-AC05).
 */
let preparedPersistenceMode: 'durable' | 'memory' = 'durable';

/**
 * Prepares the demo: hydrates the persistence snapshot and starts the
 * MSW worker. Throws when either step fails; production builds
 * short-circuit and return without starting anything. The active
 * scenario name is recorded in `preparedScenario` and reachable
 * through `getPreparedScenario()`.
 */
export async function startMocks(): Promise<void> {
  if (environment.production) {
    // Defensive production gate. `src/main.ts` is supposed to skip
    // this module entirely via dynamic import, but if a stray call
    // reaches us we want a loud failure rather than a silently
    // bootstrapped MSW worker in production. The throw also gives
    // the production treeshake an explicit unreachable call site
    // for the `startMockWorker(...)` below, so the MSW graph can be
    // dropped from the production chunk.
    throw new Error('MSW bootstrap called in production');
  }
  if (!environment.demo) {
    preparedScenario = 'production';
    return;
  }
  const scenario = parseScenarioFromLocation();
  const clock = createRealClock(scenario.clockOffsetMs);
  const persistence = createBrowserPersistence({
    nowMs: () => Date.parse(clock.now()),
  });
  // Hydrate BEFORE the worker starts so the very first intercepted
  // request can already read the cart/receipt state. The returned
  // snapshot is forwarded into the worker so the in-memory
  // Repository is seeded with the persisted cart; without this the
  // cart is silently lost across reloads even though the snapshot
  // survived.
  const snapshot = persistence.hydrate(scenario.name);
  preparedPersistenceMode = persistence.isDenied() ? 'memory' : 'durable';
  await startMockWorker(snapshot);
  preparedScenario = scenario.name;
}

/** Returns the scenario name resolved by the most recent `startMocks` call. */
export function getPreparedScenario(): string | null {
  return preparedScenario;
}

/** Returns the persistence mode determined by the most recent `startMocks` call. */
export function getPreparedPersistenceMode(): 'durable' | 'memory' {
  return preparedPersistenceMode;
}

/** Test-only escape hatch that clears the cached scenario name. */
export function resetPreparedScenarioForTests(): void {
  preparedScenario = null;
}
