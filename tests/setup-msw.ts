/**
 * MSW unit setup - boots the Node service worker for the
 * contract-layer test runs.
 *
 * Lifecycle:
 *   beforeAll - start the server with `onUnhandledRequest: 'error'`
 *               so any request that escapes the registered handlers
 *               fails the surrounding test.
 *   afterEach - verify no handlers were left registered by a test
 *               and reset the request journal.
 *   afterAll  - close the server cleanly.
 *
 * The handlers list starts empty on purpose: T02 owns the gate that
 * proves unhandled requests fail the suite; each test registers the
 * exact handlers it needs via `server.use(...)` so the absence of a
 * handler is a deliberate signal.
 *
 * jsdom is a DOM inside a Node process, where msw/node works as expected.
 * Direct vitest runs load this file in Node. Only a real browser runner
 * has no process.
 */
import { afterAll, afterEach, beforeAll } from 'vitest';

const isNodeProcess =
  typeof process !== 'undefined' && Boolean(process.versions?.node);

let server!: ReturnType<typeof import('msw/node').setupServer>;

if (isNodeProcess) {
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