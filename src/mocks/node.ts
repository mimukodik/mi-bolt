/**
 * T05 — node-side MSW server factory.
 *
 * `createNodeServer` is the entry point used by the canary unit
 * suite (`tests/setup-msw.ts`). It wires the same handler factory
 * the browser worker uses so a Node test and a Playwright run share
 * one implementation.
 *
 * Importing this module pulls `msw/node` (and the
 * `@mswjs/interceptors` `node:http` reference) into the bundle.
 * Callers must guard the import behind a `typeof window ===
 * 'undefined'` check, exactly as `tests/setup-msw.ts` does for the
 * canary server, so the module never ends up in a shipped page.
 */

import { setupServer, type SetupServer } from 'msw/node';

import { createHandlers, type CreateHandlersOptions } from './create-handlers';
import { Repository } from './repository';
import { createDeterministicIds, createFixedClock } from './scenarios';

export type NodeServerHandle = {
  readonly server: SetupServer;
  rerun(options: CreateHandlersOptions): void;
  listen(): void;
  close(): Promise<void>;
};

/**
 * Bootstraps a node server bound to the supplied handler options.
 * Defaults match the unit-test fixture: a fixed clock and
 * deterministic ids keep cross-test state stable.
 */
export function createNodeServer(
  baseOptions: Partial<CreateHandlersOptions> & Pick<CreateHandlersOptions, 'apiRoot'>,
): NodeServerHandle {
  const options = resolveOptions(baseOptions);
  let handlers = createHandlers(options);
  const server = setupServer(...handlers);

  return {
    server,
    rerun(nextOptions: CreateHandlersOptions): void {
      handlers = createHandlers(nextOptions);
      server.resetHandlers(...handlers);
    },
    listen(): void {
      server.listen({ onUnhandledRequest: 'error' });
    },
    async close(): Promise<void> {
      server.close();
    },
  };
}

/**
 * Resolves missing options with deterministic defaults. The Node
 * path never reads `globalThis.location` or `globalThis.sessionStorage`
 * — every dependency is supplied explicitly to keep the path
 * identical between Node and the browser.
 */
function resolveOptions(
  base: Partial<CreateHandlersOptions> & Pick<CreateHandlersOptions, 'apiRoot'>,
): CreateHandlersOptions {
  const scenario = base.scenario ?? {
    name: 'node-default',
    seed: 0,
    clockOffsetMs: 0,
    isolated: false,
  };
  const ids = base.ids ?? createDeterministicIds(scenario.seed);
  const clock = base.clock ?? createFixedClock(new Date(0).toISOString());
  const repository = base.repository ?? new Repository(scenario, ids);
  return {
    repository,
    clock,
    ids,
    scenario,
    apiRoot: base.apiRoot,
  };
}
