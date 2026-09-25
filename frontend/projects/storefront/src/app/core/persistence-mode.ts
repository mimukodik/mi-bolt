import { InjectionToken } from '@angular/core';

import type { SnapshotDiscard } from '@mi-bolt/mocks/persistence';

/**
 * DI token for the demo's persistence mode: whether the mock
 * bootstrap's last `sessionStorage` hydrate could read the browser's
 * storage (`'durable'`) or found it denied — private browsing,
 * blocked site data, a security error — and fell back to an
 * in-memory cache (`'memory'`). `AppShell` reads this and forwards it
 * to `DemoNotice`, which renders a visibly distinct warning for the
 * latter, since denied browser storage otherwise loses the cart silently on reload.
 *
 * The value is computed once, in `main.ts`, from
 * `getPreparedPersistenceMode()` (`src/core/bootstrap-demo.ts`) after
 * `startMocks()` resolves, and supplied as a provider override before
 * `bootstrapApplication` runs. `AppShell` reads this token rather than
 * importing `bootstrap-demo.ts` directly so the MSW module graph
 * stays out of the eagerly-loaded shell bundle — see the comment
 * above `start()` in `main.ts`. A build that never runs `startMocks()`
 * (a genuine production build) never overrides the token, so the
 * factory default below is what it renders.
 */
export const PERSISTENCE_MODE = new InjectionToken<'durable' | 'memory'>('PERSISTENCE_MODE', {
  providedIn: 'root',
  factory: () => 'durable',
});

/**
 * DI token for why the mock bootstrap's last `sessionStorage` hydrate
 * dropped the stored snapshot, if it did (`'corrupt'`, `'version'` or
 * `'stale'`, MIM-448). `AppShell` reads this and forwards it to
 * `DemoNotice`, which renders the reset strip so a cart the user
 * expected is not simply missing without a word.
 *
 * The value is computed once, in `main.ts`, from
 * `getPreparedSnapshotDiscard()` (`src/core/bootstrap-demo.ts`) after
 * `startMocks()` resolves, and supplied as a provider override before
 * `bootstrapApplication` runs. `AppShell` reads this token rather than
 * importing `bootstrap-demo.ts` directly so the MSW module graph stays
 * out of the eagerly-loaded shell bundle — see the comment above
 * `start()` in `main.ts`. A build that never runs `startMocks()` (a
 * genuine production build) never overrides the token, so the factory
 * default below is what it renders.
 */
export const SNAPSHOT_DISCARD = new InjectionToken<SnapshotDiscard | null>('SNAPSHOT_DISCARD', {
  providedIn: 'root',
  factory: () => null,
});
