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
 * The server instance itself lives in `./msw-server` — see that file's
 * doc comment for why. No spec file imports this module; only
 * `angular.json` and `vitest.contract.config.ts` name it as a setup file,
 * which keeps this body in the setup entry chunk so it re-runs per file.
 */
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw-server';

beforeAll(() => {
  server?.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server?.resetHandlers();
});

afterAll(() => {
  server?.close();
});
