/**
 * T05 — handler factory shared by the browser (setupWorker) and node
 * (setupServer) sides.
 *
 * The factory builds an MSW `RequestHandler[]` from the injected
 * repository, clock, ids, scenario descriptor and api root. T05
 * provides the dispatcher shell that returns a 404 Problem JSON for
 * any `/api/v1/*` route no business handler claims. T06–T09 register
 * the actual catalog/cart/checkout/payment/order handlers by calling
 * `registerBusinessHandlers(entry)`.
 *
 * The factory is deliberately side-effect-free: it never touches
 * `globalThis`, never reads from `sessionStorage`, never starts the
 * worker. The browser entry (`mocks/browser.ts`) owns the worker
 * lifecycle.
 */

import { http, HttpResponse, type RequestHandler } from 'msw';

import { Repository } from './repository';
import type { Clock, Ids, ScenarioDescriptor } from './scenarios';

/** Inputs passed by both `setupWorker` and `setupServer` paths. */
export interface CreateHandlersOptions {
  repository: Repository;
  clock: Clock;
  ids: Ids;
  scenario: ScenarioDescriptor;
  apiRoot: string;
  /**
   * Called by a handler after a successful mutating response so the
   * browser worker can write the sessionStorage snapshot. Absent in the
   * Node and unit paths, which keeps this factory side-effect-free as
   * the module header promises.
   */
  persist?: (sessionId: string) => void;
}

/**
 * A business handler entry. T06–T09 each export one or more entries
 * and call `registerBusinessHandlers(...)` from their slice. T05 owns
 * the dispatcher shell and the registration plumbing only.
 */
export type BusinessHandlerEntry = (options: CreateHandlersOptions) => readonly RequestHandler[];

/** Module-local registry; append-only, ordered by registration time. */
const registry: BusinessHandlerEntry[] = [];

/** Append a business handler entry. Called by T06–T09 slice files. */
export function registerBusinessHandlers(entry: BusinessHandlerEntry): void {
  registry.push(entry);
}

/**
 * Test-only escape hatch. `createStrictHandlers` builds a handler
 * list WITHOUT the dispatcher shell so a unit test can prove the
 * surrounding worker/suite rejects unknown `/api/v1/*` routes
 * instead of returning the shell's 404.
 */
export function createStrictHandlers(options: CreateHandlersOptions): RequestHandler[] {
  const handlers: RequestHandler[] = [];
  for (const entry of registry) {
    handlers.push(...entry(options));
  }
  return handlers;
}

/**
 * Builds the production handler list. The dispatcher shell is
 * placed FIRST in the returned array. MSW's experimental
 * `worker.use()` prepends, so when `browser.ts` registers the
 * returned handlers one-by-one in array order the business
 * handlers land at the front of the worker queue and the shell
 * stays at the back as the `/api/v1/...` 404 fallback.
 */
export function createHandlers(options: CreateHandlersOptions): RequestHandler[] {
  return [...createDispatcherShell(options), ...createStrictHandlers(options)];
}

function notFoundBody(options: CreateHandlersOptions) {
  return {
    type: 'urn:mi-bolt:problem:not-found',
    title: 'A kért végpont nem található',
    status: 404,
    code: 'NOT_FOUND',
    detail: 'A mock dispatcher nem talált kezelőt ehhez az útvonalhoz.',
    traceId: `mock-trace-${options.scenario.name}`,
    fieldErrors: [],
  };
}

/**
 * Returns catch-all handlers that produce a `404 NOT_FOUND` Problem
 * JSON for any `/api/v1/*` route the business slices did not register.
 * The shell also matches the bare `/api/v1` root (with no trailing
 * slash) so a misrouted curl cannot bypass the apiRoot prefix — the
 * wildcard alone would not claim the empty-path case.
 */
function createDispatcherShell(options: CreateHandlersOptions): readonly RequestHandler[] {
  const base = options.apiRoot.endsWith('/') ? options.apiRoot.slice(0, -1) : options.apiRoot;
  const prefix = `${base}/`;
  const responseInit = {
    status: 404,
    headers: { 'content-type': 'application/problem+json' },
  } as const;
  return [
    http.all(base, () => HttpResponse.json(notFoundBody(options), responseInit)),
    http.all(`${prefix}*`, () => HttpResponse.json(notFoundBody(options), responseInit)),
  ];
}
