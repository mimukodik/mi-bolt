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
 * This generalises the `cart-mutation-fails` precedent in
 * `cart/cart.handlers.ts` to every endpoint the storefront calls. Each
 * handler consults `faultResponse` before its header checks, so the
 * fault fires whatever the request carries.
 */

import { HttpResponse, type DefaultBodyType } from 'msw';

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
 * Builds the fault response for the scenario the options carry, or
 * `null` when the scenario names no fault for this operation.
 */
export function faultResponse(
  options: CreateHandlersOptions,
  operation: FaultOperation,
): HttpResponse<DefaultBodyType> | null {
  const scenarioName = options.scenario.name;
  if (scenarioName === `fail-${operation}`) return simulatedFailure(options, operation);
  if (scenarioName === `offline-${operation}`) return HttpResponse.error();
  return null;
}

/** The 503 Problem a `fail-<operation>` scenario serves. */
function simulatedFailure(
  options: CreateHandlersOptions,
  operation: FaultOperation,
): HttpResponse<DefaultBodyType> {
  const problem: Problem = {
    type: problemType('SERVICE_UNAVAILABLE'),
    title: 'Service unavailable',
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    detail: `Simulated failure (fail-${operation} scenario)`,
    traceId: buildTraceId(options),
    fieldErrors: [],
    params: {},
  };
  return problemResponse({ ok: false, problem });
}
