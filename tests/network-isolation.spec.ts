/**
 * Unit network-isolation proof — T02-AC05.
 *
 * The unit setup uses MSW's `setupServer` with
 * `onUnhandledRequest: 'error'`. A request that escapes the
 * registered handlers throws inside the server and fails the
 * surrounding test.
 *
 * The spec deliberately issues an unhandled `/api/v1/...` request
 * and an external `fetch('https://example.com/x')` from inside the
 * Node process. Both calls MUST fail, proving the gate rejects
 * business and external traffic.
 */
import { describe, expect, it } from 'vitest';

import { server } from './setup-msw';

describe('T02-AC05 unit network isolation', () => {
  it('rejects an unhandled /api/v1 business route', async () => {
    // `server` may be null in the browser runner; the setup helper
    // gates the MSW boot on a Node-only check. The Node-only test
    // path still asserts the rejection.
    expect(server !== null).toBe(true);
    await expect(
      fetch('http://127.0.0.1/api/v1/this-route-does-not-exist'),
    ).rejects.toThrow();
  });

  it('rejects an external fetch', async () => {
    expect(server !== null).toBe(true);
    await expect(
      fetch('https://example.com/x'),
    ).rejects.toThrow();
  });
});