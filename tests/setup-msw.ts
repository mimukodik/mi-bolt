/**
 * MSW unit setup — boots the Node service worker for the canary and
 * contract-layer test runs.
 *
 * Lifecycle:
 *   beforeAll — start the server with `onUnhandledRequest: 'error'`
 *               so any request that escapes the registered handlers
 *               fails the surrounding test.
 *   afterEach — verify no handlers were left registered by a test
 *               and reset the request journal.
 *   afterAll  — close the server cleanly.
 *
 * The handlers list starts empty on purpose: T02 owns the gate that
 * proves unhandled requests fail the suite; each test registers the
 * exact handlers it needs via `server.use(...)` so the absence of a
 * handler is a deliberate signal.
 *
 * The MSW Node setup is a no-op when the file is loaded by the
 * Angular unit-test browser runner, which would otherwise try to
 * import `node:http` through `@mswjs/interceptors` and fail. Direct
 * vitest runs (`npx vitest run`) load this file in a Node process.
 */
import { afterAll, afterEach, beforeAll } from 'vitest';

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

let server: ReturnType<typeof import('msw/node').setupServer> | null = null;

if (!isBrowser) {
  // Dynamic import keeps `msw/node` (and the @mswjs/interceptors
  // `node:http` references) out of the browser bundle entirely.
  const { setupServer } = await import('msw/node');
  server = setupServer();

  beforeAll(() => {
    server?.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server?.resetHandlers();
  });

  afterAll(() => {
    server?.close();
  });
}

export { server };