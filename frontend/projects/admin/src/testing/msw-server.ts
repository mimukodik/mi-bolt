/**
 * MSW Node server instance and the per-test-file lifecycle that drives it
 * — the admin project's copy of `tests/msw-server.ts` (MIM-332).
 *
 * The lifecycle is a function a spec file calls, instead of three
 * top-level hook registrations in `./setup-msw.ts`:
 *
 * `angular.json` names `projects/admin/src/testing/setup-msw.ts` as a
 * `setupFiles` entry for the admin project, and with `"coverage": true`
 * the unit-test builder replaces every entry-point module with a
 * one-line shim — `import "./setup-tests-setup-msw.js";` — so the real
 * body ends up in a separate built chunk
 * (`node_modules/@angular/build/src/builders/unit-test/runners/vitest/plugins.js:298-308`).
 * Vitest re-runs a setup file per test file by invalidating that one
 * module node (`node_modules/vitest/dist/chunks/test.DNmyFkvJ.js:4287-4289`)
 * and invalidation does not reach the modules it imports, so the chunk
 * holding the hook registrations is evaluated once per worker process
 * and never again. Hooks registered there belong to whichever spec
 * file its worker collected first; every later file in that worker
 * runs with no `listen()` at all and its requests leave for the real
 * network.
 *
 * `useMswServer()` is called from the spec module itself, which
 * Vitest does evaluate once per file, so the hooks land in that
 * file's own suite. A spec that needs the shared server registers
 * the lifecycle the same way the shop's specs do.
 *
 * The `listening` guard is not belt and braces. `msw` builds every
 * `setupServer()` on one module-level `InterceptorSource`
 * (`node_modules/msw/lib/node/index.mjs:122-147`), and that source's
 * `enable()` adds a further `request` listener to the same
 * `BatchInterceptor` on every call
 * (`node_modules/msw/lib/core/experimental/sources/interceptor-source.mjs:19-22`),
 * so a second `listen()` taken while the first is still open makes
 * every request dispatch twice. `./setup-msw.ts` also calls
 * `useMswServer()`, so in a worker's first file the registration
 * happens twice; the flag keeps the `listen()` single.
 */
import { afterAll, afterEach, beforeAll } from 'vitest';
import type { setupServer as SetupServerFn } from 'msw/node';

const isNodeProcess = typeof process !== 'undefined' && Boolean(process.versions.node);

let server: ReturnType<typeof SetupServerFn> | undefined;

if (isNodeProcess) {
  // Dynamic import keeps `msw/node` (and the @mswjs/interceptors
  // `node:http` references) out of the browser bundle entirely.
  const { setupServer } = await import('msw/node');
  server = setupServer();
}

/**
True between the `listen()` and the `close()` of the shared server.
*/
let isListening = false;

/**
 * Registers the shared server's lifecycle in the calling file's suite:
 *
 *   beforeAll - start the server with `onUnhandledRequest: 'error'` so any
 *               request that escapes the registered handlers fails the
 *               surrounding test.
 *   afterEach - reset the handler list a test registered with `server.use(...)`.
 *   afterAll  - close the server cleanly.
 *
 * The handler list starts empty on purpose: each test registers the
 * exact handlers it needs via `server.use(...)` so the absence of a
 * handler is a deliberate signal.
 *
 * Call it once at module scope in every spec that imports `server`.
 */
export function useMswServer(): void {
  beforeAll(() => {
    if (isListening || server === undefined) return;
    server.listen({ onUnhandledRequest: 'error' });
    isListening = true;
  });

  afterEach(() => {
    server?.resetHandlers();
  });

  afterAll(() => {
    if (!isListening || server === undefined) return;
    server.close();
    isListening = false;
  });
}

export { server };
