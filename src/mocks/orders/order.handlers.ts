/**
 * MIM-212 — order MSW handlers on the 2.0.0 contract.
 *
 * Thin dispatch only. Each endpoint:
 *
 *   1. Reads `X-Demo-Session`, `If-Match` (create) and `Idempotency-Key`
 *      (create only). A missing `Idempotency-Key` is a 400
 *      `INVALID_REQUEST` at this layer — the store would crash on
 *      `null.length`, so the handler short-circuits first.
 *   2. Forwards to `OrderStore` and maps the outcome — success on
 *      create becomes 201 with `Location`, success on read becomes 200,
 *      failure becomes a Problem JSON with the matching status code.
 *      Replay returns the same receipt and the same Location.
 *
 * The `OrderStore` instance is published from `checkout.handlers.ts`,
 * which runs first in the registration order; the lookup stays a thunk
 * so a request that arrives before registration surfaces a clear error.
 */

import { http, HttpResponse, type DefaultBodyType, type RequestHandler } from 'msw';

import {
  registerBusinessHandlers,
  type BusinessHandlerEntry,
  type CreateHandlersOptions,
} from '../create-handlers';
import { buildTraceId, problemType } from '../cart/cart-store';
import type { Problem } from '../../app/api/generated/models/problem';

import { orderStore } from '../checkout/checkout.handlers';

function requireOrderStore(): NonNullable<typeof orderStore.current> {
  if (!orderStore.current) {
    throw new Error('[order.handlers] order store has not been loaded');
  }
  return orderStore.current;
}

const PROBLEM_CONTENT_TYPE = 'application/problem+json' as const;

/** 400 Problem for a missing or malformed handler-level input. */
function invalidRequest(
  options: CreateHandlersOptions,
  detail: string,
  params: Record<string, unknown>,
): HttpResponse<DefaultBodyType> {
  const body: Problem = {
    type: problemType('INVALID_REQUEST'),
    title: 'Invalid request',
    status: 400,
    code: 'INVALID_REQUEST',
    detail,
    traceId: buildTraceId(options),
    fieldErrors: [],
    params,
  };
  return HttpResponse.json(body, {
    status: 400,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  });
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

function problemResponse(outcome: { ok: false; problem: Problem }): HttpResponse<DefaultBodyType> {
  return HttpResponse.json(outcome.problem, {
    status: outcome.problem.status,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  });
}

export const orderHandlersEntry: BusinessHandlerEntry = (
  options: CreateHandlersOptions,
): readonly RequestHandler[] => {
  const createOrder: RequestHandler = http.post('*/api/v1/orders', async ({ request }) => {
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) {
      return invalidRequest(options, 'Missing X-Demo-Session header', {});
    }
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey === null) {
      return invalidRequest(options, 'Missing Idempotency-Key header', { received: null });
    }
    const ifMatch = request.headers.get('If-Match');
    const body = await readJsonBody(request);
    const outcome = requireOrderStore().createOrder(sessionId, idempotencyKey, ifMatch, body);
    if (!outcome.ok) return problemResponse(outcome);
    return HttpResponse.json(outcome.receipt, {
      status: 201,
      headers: { Location: `${options.apiRoot}/orders/${outcome.receipt.id}` },
    });
  });

  const getOrder: RequestHandler = http.get('*/api/v1/orders/:orderId', ({ request, params }) => {
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) {
      return invalidRequest(options, 'Missing X-Demo-Session header', {});
    }
    const orderId = String(params['orderId']);
    const outcome = requireOrderStore().getOrder(sessionId, orderId);
    if (!outcome.ok) return problemResponse(outcome);
    return HttpResponse.json(outcome.receipt, { status: 200 });
  });

  return [createOrder, getOrder];
};

registerBusinessHandlers(orderHandlersEntry);
