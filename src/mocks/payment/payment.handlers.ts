/**
 * MIM-212 — payment intent MSW handlers on the 2.0.0 contract.
 *
 * Thin dispatch only. Each endpoint:
 *
 *   1. Reads `X-Demo-Session`, `If-Match` (create) and `Idempotency-Key`
 *      (create only). A missing `Idempotency-Key` is a 400
 *      `INVALID_REQUEST` at this layer — the store would crash on
 *      `null.length`, so the handler short-circuits first.
 *   2. Forwards to `OrderStore` and maps the outcome — success on
 *      create becomes 201 with `Location`, success on read or resolve
 *      becomes 200, failure becomes a Problem JSON with the matching
 *      status code. Replays return the same shape so the Location
 *      header is identical on a retry.
 *
 * The `OrderStore` instance is published from `checkout.handlers.ts`,
 * which runs first in the registration order (`browser.ts:50-54`,
 * `create-handlers.ts:61-65`); the lookup stays a thunk so a request
 * that arrives before registration still surfaces a clear error.
 */

import { http, HttpResponse, type DefaultBodyType, type RequestHandler } from 'msw';

import {
  registerBusinessHandlers,
  type BusinessHandlerEntry,
  type CreateHandlersOptions,
} from '../create-handlers';
import { buildTraceId, problemType } from '../cart/cart-store';
import type { Problem } from '../../app/api/generated/models/problem';
import { PROBLEM_CONTENT_TYPE, problemResponse } from '../problem-response';

import { orderStore } from '../checkout/checkout.handlers';

function requireOrderStore(): NonNullable<typeof orderStore.current> {
  if (!orderStore.current) {
    throw new Error('[payment.handlers] order store has not been loaded');
  }
  return orderStore.current;
}

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

export const paymentHandlersEntry: BusinessHandlerEntry = (
  options: CreateHandlersOptions,
): readonly RequestHandler[] => {
  const createIntent: RequestHandler = http.post('*/api/v1/payment-intents', ({ request }) => {
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) {
      return invalidRequest(options, 'Missing X-Demo-Session header', {});
    }
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey === null) {
      return invalidRequest(options, 'Missing Idempotency-Key header', { received: null });
    }
    const ifMatch = request.headers.get('If-Match');
    const outcome = requireOrderStore().createPaymentIntent(sessionId, idempotencyKey, ifMatch);
    if (!outcome.ok) return problemResponse(outcome);
    options.persist?.(sessionId);
    return HttpResponse.json(outcome.intent, {
      status: 201,
      headers: { Location: `${options.apiRoot}/payment-intents/${outcome.intent.id}` },
    });
  });

  const getIntent: RequestHandler = http.get(
    '*/api/v1/payment-intents/:paymentIntentId',
    ({ request, params }) => {
      const sessionId = request.headers.get('X-Demo-Session');
      if (sessionId === null) {
        return invalidRequest(options, 'Missing X-Demo-Session header', {});
      }
      const paymentIntentId = String(params['paymentIntentId']);
      const outcome = requireOrderStore().getPaymentIntent(sessionId, paymentIntentId);
      if (!outcome.ok) return problemResponse(outcome);
      return HttpResponse.json(outcome.intent, { status: 200 });
    },
  );

  const resolveIntent: RequestHandler = http.post(
    '*/api/v1/payment-intents/:paymentIntentId/outcome',
    async ({ request, params }) => {
      const sessionId = request.headers.get('X-Demo-Session');
      if (sessionId === null) {
        return invalidRequest(options, 'Missing X-Demo-Session header', {});
      }
      const paymentIntentId = String(params['paymentIntentId']);
      const body = await readJsonBody(request);
      const outcome = requireOrderStore().resolvePaymentIntentOutcome(
        sessionId,
        paymentIntentId,
        body,
      );
      if (!outcome.ok) return problemResponse(outcome);
      options.persist?.(sessionId);
      return HttpResponse.json(outcome.intent, { status: 200 });
    },
  );

  return [createIntent, getIntent, resolveIntent];
};

registerBusinessHandlers(paymentHandlersEntry);
