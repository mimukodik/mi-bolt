/**
 * Per-endpoint fault scenarios for the shop mock.
 *
 * `?mi-scenario=fail-<operation>` answers one storefront endpoint with
 * a 503 SERVICE_UNAVAILABLE Problem and `?mi-scenario=offline-<operation>`
 * with a network error, so an e2e run can drive a facade's error path
 * from the URL. `parseScenarioFromLocation` carries the name and
 * `resolveScenario` keeps an unregistered scenario's name, so a fault
 * scenario needs no registry entry.
 *
 * Four once-only families sit beside them, for the rows that retry
 * after exactly one failure or race a later request against an earlier
 * one:
 *
 *   - `fail-once-<operation>` and `offline-once-<operation>` answer the
 *     first matching request of a handler list like their sticky
 *     counterparts and serve every later one normally, so the retry
 *     succeeds.
 *   - `slow-once-<operation>` holds the first matching request of a
 *     handler list back for `SLOW_ONCE_DELAY_MS` before its handler
 *     reads or writes the store, and runs every later one at once, so a
 *     caller can let a newer request overtake an older one. The held
 *     request is answered from the store as it stands when the hold
 *     ends, a newer request's write included.
 *   - `lost-once-order` and `lost-once-payment-intent` let the handler
 *     run in full — the store commits and `persist` runs — and then
 *     replace that first committed success with a network error, as a
 *     timeout after commit looks. A later request with the same
 *     `Idempotency-Key` replays the stored result through the existing
 *     idempotency path.
 *
 * "Once" is once per handler list: the browser builds one list per page
 * load, so a `page.goto` that keeps the query arms the fault again while
 * in-app navigation and a retry button do not. The fired state is keyed
 * on the `CreateHandlersOptions` object, so it dies with the list that
 * owns it.
 *
 * This generalises the `cart-mutation-fails` precedent in
 * `cart/cart.handlers.ts` to every endpoint the storefront calls. Each
 * handler consults `faultResponse` before its header checks, so the
 * fault fires whatever the request carries; `faultResponse` answers the
 * two short-circuiting once families and returns `null` for every
 * lost-once name, which the mutating handlers consult after the store
 * has run.
 */

import { delay, HttpResponse, type DefaultBodyType } from 'msw';

import type { Problem } from '@mi-bolt/api/models/problem';
import type { CreateHandlersOptions } from './create-handlers';
import { buildTraceId, problemType } from './cart/cart-store';
import { problemResponse } from './problem-response';

/** The storefront endpoints a fault scenario can break, in table order. */
export const FAULT_OPERATIONS = [
  'products',
  'product',
  'related-products',
  'cart',
  'cart-add',
  'cart-quantity',
  'checkout-options',
  'checkout',
  'checkout-update',
  'order',
  'order-read',
  'payment-intent',
  'payment-intent-read',
] as const;

/** One operation key of `FAULT_OPERATIONS`. */
export type FaultOperation = (typeof FAULT_OPERATIONS)[number];

/**
 * The operations a `lost-once-<operation>` scenario can drop the
 * response of. The set is hand-picked rather than derived from a
 * criterion: an operation belongs here once its handler calls
 * `loseResponseOnce` after the store committed and `persist` ran, so a
 * new committing endpoint joins it when that call site lands.
 */
export const LOST_RESPONSE_OPERATIONS = ['order', 'payment-intent'] as const;

/** One operation key of `LOST_RESPONSE_OPERATIONS`. */
export type LostResponseOperation = (typeof LOST_RESPONSE_OPERATIONS)[number];

/**
 * How long a `slow-once-<operation>` scenario holds its first request
 * back, in milliseconds. The two bounds are measured on the code that
 * sets them, not chosen here:
 *
 *   - longer than the catalogue search debounce,
 *     `SEARCH_DEBOUNCE_MS` (300 ms,
 *     `frontend/projects/storefront/src/app/features/catalog/catalog-query.ts`),
 *     so a second query is dispatched while the first is still held and
 *     the two responses can be raced;
 *   - shorter than the local Playwright expect timeout of 5000 ms
 *     (`frontend/playwright.config.ts`; the `integration-*` projects
 *     override it nowhere), so a spec can wait for the late answer with
 *     an ordinary web-first assertion instead of a raw timeout.
 *
 * `delay` resolves after at least this long, and takes the same path in
 * the browser worker a Playwright run uses.
 */
export const SLOW_ONCE_DELAY_MS = 2000;

/**
 * The scenario names whose once-only fault already fired, per handler
 * list. Keyed on the options object rather than on a module-level flag
 * or counter, so one page load's fault cannot leak into the next list.
 */
const firedOnce = new WeakMap<CreateHandlersOptions, Set<string>>();

/**
 * Records that `scenarioName` fires in this handler list, answering
 * `true` for the first call and `false` for every later one.
 */
function fireOnce(options: CreateHandlersOptions, scenarioName: string): boolean {
  let fired = firedOnce.get(options);
  if (fired === undefined) {
    fired = new Set<string>();
    firedOnce.set(options, fired);
  }
  if (fired.has(scenarioName)) return false;
  fired.add(scenarioName);
  return true;
}

/**
 * Builds the fault response for the scenario the options carry, or
 * `null` when the scenario names no fault for this operation. The
 * `lost-once-*` names always answer `null`: their handler runs in full
 * and consults `loseResponseOnce` once the store has committed. So does
 * every `slow-once-*` name: its handler runs in full and consults
 * `slowOnce` before it reads or writes the store, so the held request
 * is answered from the store as it stands when the hold ends.
 */
export function faultResponse(
  options: CreateHandlersOptions,
  operation: FaultOperation,
): HttpResponse<DefaultBodyType> | null {
  const scenarioName = options.scenario.name;
  if (scenarioName === `fail-${operation}`) return simulatedFailure(options, operation, 'fail');
  if (scenarioName === `offline-${operation}`) return HttpResponse.error();
  if (scenarioName === `fail-once-${operation}` && fireOnce(options, scenarioName)) {
    return simulatedFailure(options, operation, 'fail-once');
  }
  if (scenarioName === `offline-once-${operation}` && fireOnce(options, scenarioName)) {
    return HttpResponse.error();
  }
  return null;
}

/**
 * Holds the first matching request of a `slow-once-<operation>` handler
 * list back for `SLOW_ONCE_DELAY_MS`, and returns at once for every
 * other scenario and for every later request of the operation. Each
 * handler awaits this directly after its `faultResponse` check, before
 * it reads or writes the store, so the held request is answered from
 * the store as it stands when the hold ends, a newer request's write
 * included, and a caller can let a newer request overtake it.
 */
export async function slowOnce(
  options: CreateHandlersOptions,
  operation: FaultOperation,
): Promise<void> {
  const scenarioName = options.scenario.name;
  if (scenarioName !== `slow-once-${operation}`) return;
  if (!fireOnce(options, scenarioName)) return;
  await delay(SLOW_ONCE_DELAY_MS);
}

/**
 * Answers `true` when this handler list has to drop the response of the
 * first committed `operation` under a `lost-once-<operation>` scenario,
 * and `false` for every other scenario and every later request. The
 * mutating handlers call it after the store committed and `persist` ran,
 * and replace their success response with `HttpResponse.error()`.
 */
export function loseResponseOnce(
  options: CreateHandlersOptions,
  operation: LostResponseOperation,
): boolean {
  const scenarioName = options.scenario.name;
  if (scenarioName !== `lost-once-${operation}`) return false;
  return fireOnce(options, scenarioName);
}

/**
 * The 503 Problem a `fail-<operation>` / `fail-once-<operation>`
 * scenario serves; `kind` and `operation` build the scenario name the
 * `detail` names, so a caller cannot hand in a name outside the two
 * families.
 */
function simulatedFailure(
  options: CreateHandlersOptions,
  operation: FaultOperation,
  kind: 'fail' | 'fail-once',
): HttpResponse<DefaultBodyType> {
  const problem: Problem = {
    type: problemType('SERVICE_UNAVAILABLE'),
    title: 'Service unavailable',
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    detail: `Simulated failure (${kind}-${operation} scenario)`,
    traceId: buildTraceId(options),
    fieldErrors: [],
    params: {},
  };
  return problemResponse({ ok: false, problem });
}
