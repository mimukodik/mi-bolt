/**
 * MIM-212 — checkout MSW handlers on the 2.0.0 contract.
 *
 * Thin dispatch only. Every endpoint:
 *
 *   1. Reads `X-Demo-Session` (and, on writes, `If-Match`) and returns a
 *      local 400 `INVALID_REQUEST` when the header is missing.
 *   2. Forwards to `CheckoutStore` and maps the outcome back to an
 *      `HttpResponse` — success becomes a 200 with `ETag: "<version>"`
 *      (options carries no ETag, per the contract at
 *      `openapi.yaml:481-487`), failure becomes a Problem JSON with the
 *      matching status code.
 *
 * This file also owns the singletons for `CheckoutStore` and
 * `OrderStore`: a single `createHandlers(options)` call must reach the
 * same instance the order handlers will read through `orderStore`. The
 * cart lookup stays a thunk evaluated per request so the order is
 * order-safe even outside `browser.ts`'s explicit registration list.
 */

import { http, HttpResponse, type DefaultBodyType, type RequestHandler } from 'msw';

import {
  registerBusinessHandlers,
  type BusinessHandlerEntry,
  type CreateHandlersOptions,
} from '../create-handlers';
import { cartStore } from '../cart/cart.handlers';
import { IdempotencyStore } from '../idempotency';
import { invalidRequest, problemResponse } from '../problem-response';

import { OrderStore } from '../orders/order-store';
import { CheckoutStore } from './checkout-store';

/**
 * Cross-handler references. `payment.handlers.ts` and `order.handlers.ts`
 * read `orderStore.current` lazily so they cannot answer a request
 * before this entry has run.
 */
export const checkoutStore: { current: CheckoutStore | null } = { current: null };
export const orderStore: { current: OrderStore | null } = { current: null };

function requireCartStore(): NonNullable<typeof cartStore.current> {
  if (!cartStore.current) {
    throw new Error('[checkout.handlers] cart handlers not initialised');
  }
  return cartStore.current;
}

function requireCheckoutStore(): NonNullable<typeof checkoutStore.current> {
  if (!checkoutStore.current) {
    throw new Error('[checkout.handlers] checkout store has not been loaded');
  }
  return checkoutStore.current;
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

/**
 * Map a `CheckoutOutcome` onto a response. `etag` is `null` when the
 * endpoint carries no ETag header (problem responses, GET options);
 * otherwise it is the wrapped version the store reported.
 */
function outcomeResponse(
  outcome: ReturnType<CheckoutStore['get']>,
  etag: string | null,
): HttpResponse<DefaultBodyType> {
  if (outcome.ok) {
    const headers: Record<string, string> = {};
    if (etag !== null) headers['ETag'] = etag;
    return HttpResponse.json(outcome.session, { status: 200, headers });
  }
  return problemResponse(outcome);
}

/** `GET /checkout/options` — no ETag, success or problem. */
function optionsResponse(
  outcome: ReturnType<CheckoutStore['options']>,
): HttpResponse<DefaultBodyType> {
  if (outcome.ok) {
    return HttpResponse.json(outcome.options, { status: 200 });
  }
  return problemResponse(outcome);
}

/**
 * Checkout business handler entry — registers itself on module load.
 * Constructs the `CheckoutStore`, an `IdempotencyStore` shared with the
 * order store, and the `OrderStore` itself; publishes both singletons
 * for the payment and order handlers to read.
 */
export const checkoutHandlersEntry: BusinessHandlerEntry = (
  options: CreateHandlersOptions,
): readonly RequestHandler[] => {
  const checkout = new CheckoutStore(options, () => requireCartStore());
  const idempotency = new IdempotencyStore(options.clock);
  const order = new OrderStore(options, checkout, idempotency, () => requireCartStore());
  checkoutStore.current = checkout;
  orderStore.current = order;

  if (options.snapshot) {
    if (options.snapshot.checkoutDraft) {
      checkout.seedFromSnapshot(
        options.snapshot.simulatedSessionId,
        options.snapshot.checkoutDraft,
      );
    }
    order.seedFromSnapshot(options.snapshot.simulatedSessionId, {
      intents: options.snapshot.paymentIntents,
      receipts: options.snapshot.receipts,
    });
    order.seedIdempotency(options.snapshot.idempotency);
  }

  const getOptions: RequestHandler = http.get('*/api/v1/checkout/options', ({ request }) => {
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) {
      return invalidRequest(options, 'Missing X-Demo-Session header', {});
    }
    return optionsResponse(requireCheckoutStore().options(sessionId));
  });

  const getCheckout: RequestHandler = http.get('*/api/v1/checkout', ({ request }) => {
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) {
      return invalidRequest(options, 'Missing X-Demo-Session header', {});
    }
    const outcome = requireCheckoutStore().get(sessionId);
    const etag = outcome.ok ? `"${String(outcome.session.version)}"` : null;
    return outcomeResponse(outcome, etag);
  });

  const patchCheckout: RequestHandler = http.patch('*/api/v1/checkout', async ({ request }) => {
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) {
      return invalidRequest(options, 'Missing X-Demo-Session header', {});
    }
    const ifMatch = request.headers.get('If-Match');
    const body = await readJsonBody(request);
    const outcome = requireCheckoutStore().update(sessionId, ifMatch, body);
    if (outcome.ok) options.persist?.(sessionId);
    const etag = outcome.ok ? `"${String(outcome.session.version)}"` : null;
    return outcomeResponse(outcome, etag);
  });

  return [getOptions, getCheckout, patchCheckout];
};

registerBusinessHandlers(checkoutHandlersEntry);
