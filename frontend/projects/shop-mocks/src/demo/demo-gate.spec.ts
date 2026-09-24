/**
 * MIM-423 — demo access gate focused unit suite.
 *
 * Ten cases covering the gate's whole surface: the 401 that a gated read,
 * a gated write and GET /demo/session answer while signed out; the gated
 * /media/... route; a wrong password; the demo password signing in and
 * opening the shop; the signed-in default of every other scenario; the
 * injected storage keeping a sign-in; `isOpenPath`'s table; and the
 * browser handler list ending with the gate.
 *
 * Every case installs its own handlers, with the gate FIRST: a Node
 * request runs the handler list in array order, so the gate has to
 * precede the business handlers to be consulted at all.
 */

import { describe, expect, it } from 'vitest';

import { createHandlers, type CreateHandlersOptions } from '../create-handlers';
import { Repository } from '../repository';
import { isRecord } from '../is-record';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
  resolveScenario,
  type ScenarioDescriptor,
} from '../scenarios';
import { server, useMswServer } from '../../../../tests/msw-server';
import { buildBrowserHandlers } from '../browser';
import {
  createDemoGateHandler,
  demoAccessStateFor,
  DEMO_SIGNED_OUT_SCENARIO,
  isOpenPath,
} from './demo-access';
import { DEMO_PASSWORD } from './demo.handlers';

useMswServer();

const API = 'http://localhost/api/v1';

/** A seeded image id; `GET /media/{imageId}` is gated like every other shop operation. */
const MEDIA_IMAGE_ID = '0494688791f55f77852d95d4aff487aa89ffd0d6c300a64c56ed4ff08c3be5b8';

/** The gate's key for the one scenario that starts signed out. */
const SIGNED_OUT_STORAGE_KEY = 'mi-bolt.demo-access.demo-signed-out';

/**
 * A fresh repository, clock and id factory per call, so no two cases share
 * handler state. The storage is injected only when a case passes one.
 */
function optionsFor(
  scenario: ScenarioDescriptor,
  demoAccessStorage?: Pick<Storage, 'getItem' | 'setItem'>,
): CreateHandlersOptions {
  const ids = createDeterministicIds(1);
  const clock = createFixedClock('2026-09-20T10:00:00.000Z');
  return {
    repository: new Repository(scenario, ids, clock),
    clock,
    ids,
    scenario,
    apiRoot: '/api/v1',
    demoAccessStorage,
  };
}

/** The options of the scenario under test, with the gate installed ahead of the list. */
function useSignedOut(): CreateHandlersOptions {
  const options = optionsFor(resolveScenario(DEMO_SIGNED_OUT_SCENARIO));
  server.use(createDemoGateHandler(options), ...createHandlers(options));
  return options;
}

function postSession(body: string): Promise<Response> {
  return fetch(`${API}/demo/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

/** Reads a Problem body, asserting the media type every Problem is served with. */
async function readProblem(res: Response): Promise<Record<string, unknown>> {
  expect(res.headers.get('content-type')).toBe('application/problem+json');
  const body: unknown = await res.json();
  expect(isRecord(body)).toBe(true);
  if (!isRecord(body)) throw new Error('[demo-gate.spec] problem body is not a record');
  return body;
}

describe('demo access gate', () => {
  it('signed out: a gated read answers 401 DemoAccessRequired', async () => {
    // Fails if the gate resolver in `createDemoGateHandler` stops returning
    // `demoAccessRequired(options)` for an unsigned-in visitor.
    useSignedOut();

    const res = await fetch(`${API}/products`);

    expect(res.status).toBe(401);
    const body = await readProblem(res);
    expect(body['code']).toBe('UNAUTHENTICATED');
    expect(body['title']).toBe('Demo access required');
  });

  it('signed out: a gated write answers 401', async () => {
    // Same gate-resolver line as the read case: the gate matches every
    // method, so removing the 401 branch turns this write into a 201/400.
    useSignedOut();

    const res = await fetch(`${API}/cart/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId: 'variant-abcdefgh', quantity: 1 }),
    });

    expect(res.status).toBe(401);
  });

  it('signed out: GET /demo/session answers 401', async () => {
    // Fails if `getSession` in `demo.handlers.ts` stops returning
    // `demoAccessRequired(options)` when the visitor is not signed in.
    useSignedOut();

    const res = await fetch(`${API}/demo/session`);

    expect(res.status).toBe(401);
  });

  it('signed out: media is gated', async () => {
    // Fails if `isOpenPath` regains a `/media/` prefix arm: contract 2.3.0
    // puts catalogue images behind the gate like every other shop path.
    useSignedOut();

    const res = await fetch(`${API}/media/${MEDIA_IMAGE_ID}`);

    expect(res.status).toBe(401);
    const body = await readProblem(res);
    expect(body['code']).toBe('UNAUTHENTICATED');
  });

  it('a wrong password keeps the visitor signed out', async () => {
    // Fails if `createSession` calls `signIn()` before the password check, so
    // a wrong password would open the shop.
    useSignedOut();

    const rejected = await postSession(JSON.stringify({ password: 'not-the-demo-password' }));
    expect(rejected.status).toBe(401);

    const session = await fetch(`${API}/demo/session`);
    expect(session.status).toBe(401);
  });

  it('the demo password signs in and opens the shop', async () => {
    // Fails if `createSession` drops its `demoAccessStateFor(options).signIn()`
    // call, which is what flips the shared state the gate and the session
    // handler both read.
    useSignedOut();

    const signedIn = await postSession(JSON.stringify({ password: DEMO_PASSWORD }));
    expect(signedIn.status).toBe(204);

    const session = await fetch(`${API}/demo/session`);
    expect(session.status).toBe(204);

    const gated = await fetch(`${API}/products`);
    expect(gated.status).not.toBe(401);
  });

  it('the default scenario starts signed in', async () => {
    // Fails if `readSignedIn` drops its `options.scenario.name !==
    // DEMO_SIGNED_OUT_SCENARIO` default, which is what keeps the dev server,
    // the e2e runs and every existing unit spec unchanged.
    const options = optionsFor(DEFAULT_SCENARIO);
    server.use(createDemoGateHandler(options), ...createHandlers(options));

    const session = await fetch(`${API}/demo/session`);
    expect(session.status).toBe(204);

    const gated = await fetch(`${API}/products`);
    expect(gated.status).not.toBe(401);
  });

  it('sign-in is kept in the injected storage', async () => {
    // Fails if `signIn` loses its `options.demoAccessStorage?.setItem(key,
    // SIGNED_IN_VALUE)` write or `readSignedIn` loses its matching read, which
    // together are what keeps a signed-in visitor signed in across a reload.
    const values = new Map<string, string>();
    const storage: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    };
    const scenario = resolveScenario(DEMO_SIGNED_OUT_SCENARIO);
    const first = optionsFor(scenario, storage);
    server.use(createDemoGateHandler(first), ...createHandlers(first));

    const signedIn = await postSession(JSON.stringify({ password: DEMO_PASSWORD }));
    expect(signedIn.status).toBe(204);
    expect(values.get(SIGNED_OUT_STORAGE_KEY)).toBe('signed-in');

    const second = optionsFor(scenario, storage);
    expect(demoAccessStateFor(second).isSignedIn()).toBe(true);
  });

  it('isOpenPath', () => {
    // Fails if `isOpenPath` stops stripping the `/api/v1` prefix or loses any
    // of its open arms (or gains a too-broad one, which `/media/abc`,
    // `/mediafoo` and `/administrator` catch).
    expect(isOpenPath('/api/v1/demo/session')).toBe(true);
    expect(isOpenPath('/api/v1/admin/products')).toBe(true);
    expect(isOpenPath('/api/v1/actuator/health')).toBe(true);

    expect(isOpenPath('/api/v1/products')).toBe(false);
    expect(isOpenPath('/api/v1/media/abc')).toBe(false);
    expect(isOpenPath('/api/v1/demo/sessions')).toBe(false);
    expect(isOpenPath('/api/v1/mediafoo')).toBe(false);
    expect(isOpenPath('/api/v1/administrator')).toBe(false);
  });

  it('the browser handler list ends with the gate', () => {
    // Fails if `buildBrowserHandlers` stops appending
    // `createDemoGateHandler(options)` as the last element, which is the
    // position the browser's reversed registration order needs.
    const handlers = buildBrowserHandlers();
    const options = optionsFor(resolveScenario(DEMO_SIGNED_OUT_SCENARIO));

    expect(handlers.at(-1)?.info.header).toBe(createDemoGateHandler(options).info.header);
  });
});
