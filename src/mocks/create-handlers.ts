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
 * worker. The browser entry (`mocks/browser.ts`) and the node entry
 * (`mocks/node.ts`) own the worker lifecycle.
 */

import { http, HttpResponse, type RequestHandler } from 'msw';

import { Repository } from './repository';
import type { Clock, Ids, ScenarioDescriptor } from './scenarios';

/** Inputs passed by both `setupWorker` and `setupServer` paths. */
export type CreateHandlersOptions = {
  repository: Repository;
  clock: Clock;
  ids: Ids;
  scenario: ScenarioDescriptor;
  apiRoot: string;
};

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
 * appended last so any registered business handler claims its path
 * first; the shell only fires for routes no slice has wired up.
 */
export function createHandlers(options: CreateHandlersOptions): RequestHandler[] {
  const handlers = createStrictHandlers(options);
  handlers.push(createDispatcherShell(options));
  return handlers;
}

/**
 * Returns a catch-all handler that produces a `404 NOT_FOUND`
 * Problem JSON for any `/api/v1/*` route the business slices did not
 * register. The dispatcher also matches the bare `/api/v1` root so a
 * misrouted curl cannot bypass the apiRoot prefix.
 */
function createDispatcherShell(options: CreateHandlersOptions): RequestHandler {
  const base = options.apiRoot.endsWith('/')
    ? options.apiRoot.slice(0, -1)
    : options.apiRoot;
  const prefix = `${base}/`;
  return http.all(`${prefix}*`, () =>
    HttpResponse.json(
      {
        type: 'urn:mi-bolt:problem:not-found',
        title: 'A kért végpont nem található',
        status: 404,
        code: 'NOT_FOUND',
        detail: 'A mock dispatcher nem talált kezelőt ehhez az útvonalhoz.',
        traceId: `mock-trace-${options.scenario.name}`,
        fieldErrors: [],
      },
      {
        status: 404,
        headers: { 'content-type': 'application/problem+json' },
      },
    ),
  );
}
