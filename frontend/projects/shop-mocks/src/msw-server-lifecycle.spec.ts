/**
 * Regression guard for the shared MSW server's per-test-file lifecycle.
 *
 * The bug this file pins: `tests/setup-msw.ts` is an `angular.json`
 * `setupFiles` entry, and with coverage enabled the unit-test builder serves
 * that path as a one-line shim in front of a built chunk, so Vitest's per-file
 * setup re-run never re-executes the hook registrations. They ran once per
 * worker process and belonged to that worker's first spec file; every later
 * file in the worker ran with no `server.listen()` and its requests left for
 * the real network as `connect ECONNREFUSED ::1:80`. The repair is
 * `useMswServer()`, called from the spec module - which Vitest does evaluate
 * once per file - so the hooks land in this file's own suite.
 *
 * Both assertions below would have failed in any spec file that was not its
 * worker's first: the first because nothing was intercepting, the second
 * because a second `listen()` taken while the first is open makes `msw`
 * dispatch every request twice through its shared interceptor source.
 */
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { server, useMswServer } from '../../../tests/msw-server';

useMswServer();

const PROBE_URL = 'http://127.0.0.1/api/v1/__msw-lifecycle-probe';

interface ProbeBody {
  readonly hits: number;
}

function isProbeBody(value: unknown): value is ProbeBody {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'hits') === 'number'
  );
}

describe('shared MSW server lifecycle', () => {
  it('intercepts a request handled by a handler this file registered', async () => {
    server.use(http.get(PROBE_URL, () => HttpResponse.json({ hits: 1 })));

    const response = await fetch(PROBE_URL);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isProbeBody(body)).toBe(true);
  });

  it('dispatches a request to the handler exactly once', async () => {
    let hits = 0;
    server.use(
      http.get(PROBE_URL, () => {
        hits += 1;
        return HttpResponse.json({ hits });
      }),
    );

    await fetch(PROBE_URL);

    expect(hits).toBe(1);
  });
});
