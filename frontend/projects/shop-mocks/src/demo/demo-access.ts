/**
 * MIM-423 — the demo access gate of the shop mock.
 *
 * Contract 2.2.0 puts every shop operation except `GET /media/{imageId}`
 * and `/demo/session` behind the `mibolt_demo_access` cookie; without it
 * they answer 401 with the `DemoAccessRequired` response, a Problem whose
 * code is `UNAUTHENTICATED` (`contracts/commerce/openapi.yaml:1885`). The
 * mock keeps that flag in one state object per `CreateHandlersOptions`,
 * shared by every handler built from those options, and one `http.all`
 * gate handler answers 401 for a gated request while the visitor is
 * signed out.
 *
 * The mock starts signed in on every scenario except `demo-signed-out`, so
 * the dev server, the MSW end-to-end runs and every existing unit spec are
 * unchanged, and `?mi-scenario=demo-signed-out` is the one way to reach the
 * signed-out state. In the browser the flag is kept per scenario in
 * `sessionStorage` under `mi-bolt.demo-access.<scenario>`, so a reload
 * after signing in stays signed in; the Node and unit paths inject no
 * storage and the flag then lives in memory for the handler list's
 * lifetime.
 *
 * `buildBrowserHandlers` appends the gate as the LAST element of the list.
 * The browser registers the list one handler at a time with
 * `worker.use(handler)`, which prepends, so the last array element is the
 * first one consulted (`browser.ts`, "Registration order is evaluation
 * order reversed"). A Node spec that wants the gate therefore passes it
 * FIRST, since `server.use(...handlers)` keeps array order:
 * `server.use(createDemoGateHandler(options), ...createHandlers(options))`.
 */

import { http, type DefaultBodyType, type HttpResponse, type RequestHandler } from 'msw';

import { buildTraceId, problemType } from '../cart/cart-store';
import type { CreateHandlersOptions } from '../create-handlers';
import { problemResponse } from '../problem-response';

/**
 * The one built-in scenario that starts signed out (`scenarios.ts`).
 * Every other scenario starts signed in, so no existing caller changes.
 */
export const DEMO_SIGNED_OUT_SCENARIO = 'demo-signed-out';

/** The value `signIn()` writes; any other stored value leaves the visitor signed out. */
const SIGNED_IN_VALUE = 'signed-in';

/** The api prefix the mock's handlers are mounted under. */
const API_PREFIX = '/api/v1';

/**
 * Path prefixes the backend leaves outside the demo gate, after the
 * `/api/v1` prefix is removed. `/media/` also covers the contract's one
 * open shop operation, `GET /media/{imageId}`.
 */
const OPEN_PREFIXES = ['/media/', '/admin/', '/actuator/'] as const;

/** Paths that are open as a bare segment, with nothing after them. */
const OPEN_BARE_PATHS = ['/admin', '/actuator'] as const;

/** Read/write face of the demo access gate's signed-in flag. */
export interface DemoAccessState {
  isSignedIn(): boolean;
  signIn(): void;
}

/**
 * One state per options object, so the gate handler and the
 * `/demo/session` handlers built from the same options share it.
 */
const states = new WeakMap<CreateHandlersOptions, DemoAccessState>();

/** Per-scenario storage key, so two scenarios never share a sign-in. */
function storageKey(scenarioName: string): string {
  return `mi-bolt.demo-access.${scenarioName}`;
}

/**
 * The starting value: a stored `signed-in` flag wins, otherwise the
 * scenario decides. `demo-signed-out` is the only scenario that starts
 * signed out. A denied storage read falls through to the same scenario
 * default, the tolerance `persistence.ts` applies to its own reads.
 */
function readSignedIn(options: CreateHandlersOptions, key: string): boolean {
  try {
    if (options.demoAccessStorage?.getItem(key) === SIGNED_IN_VALUE) return true;
  } catch {
    // Storage denied (private browsing, security error): the scenario default decides.
  }
  return options.scenario.name !== DEMO_SIGNED_OUT_SCENARIO;
}

function createDemoAccessState(options: CreateHandlersOptions): DemoAccessState {
  const key = storageKey(options.scenario.name);
  let signedIn = readSignedIn(options, key);
  return {
    isSignedIn: () => signedIn,
    signIn: () => {
      signedIn = true;
      try {
        options.demoAccessStorage?.setItem(key, SIGNED_IN_VALUE);
      } catch {
        // Storage denied (private browsing, quota): the flag stays in memory.
      }
    },
  };
}

/**
 * The state for one options object, created on first use and reused
 * afterwards. A second options object built on the same scenario and the
 * same storage starts signed in when that storage already holds
 * `signed-in`.
 */
export function demoAccessStateFor(options: CreateHandlersOptions): DemoAccessState {
  const existing = states.get(options);
  if (existing !== undefined) return existing;
  const state = createDemoAccessState(options);
  states.set(options, state);
  return state;
}

/** The contract's 401 for a gated operation reached without demo access. */
export function demoAccessRequired(options: CreateHandlersOptions): HttpResponse<DefaultBodyType> {
  return problemResponse({
    ok: false,
    problem: {
      type: problemType('UNAUTHENTICATED'),
      title: 'Demo access required',
      status: 401,
      code: 'UNAUTHENTICATED',
      detail: 'Sign in with the demo password first.',
      traceId: buildTraceId(options),
      fieldErrors: [],
    },
  });
}

/**
 * True when a request path is outside the demo gate. The path is taken
 * with everything up to and including `/api/v1` removed, so the decision
 * matches the backend's open list (`/admin`, `/demo/session`, `/media`,
 * `/actuator`) whatever host and origin the request came from.
 */
export function isOpenPath(pathname: string): boolean {
  const marker = pathname.indexOf(API_PREFIX);
  const path = marker === -1 ? pathname : pathname.slice(marker + API_PREFIX.length);
  if (path === '/demo/session') return true;
  if (OPEN_BARE_PATHS.some((bare) => path === bare)) return true;
  return OPEN_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * The gate itself: one `http.all` handler over every `/api/v1` route. It
 * answers the 401 for a gated request while the visitor is signed out and
 * returns nothing otherwise, which MSW reads as "let the next matching
 * handler run" — the fall-through is `undefined`, never `passthrough()`,
 * which would send the request to the network.
 */
export function createDemoGateHandler(options: CreateHandlersOptions): RequestHandler {
  return http.all(`*${API_PREFIX}/*`, ({ request }) => {
    if (isOpenPath(new URL(request.url).pathname)) return undefined;
    if (demoAccessStateFor(options).isSignedIn()) return undefined;
    return demoAccessRequired(options);
  });
}
