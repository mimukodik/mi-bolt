/**
 * MIM-211 — cart MSW handlers on the 2.0.0 contract.
 *
 * Five operations wired through MSW: getCart, addCartItem,
 * setCartItemQuantity, removeCartItem, clearCart. Each handler:
 *
 *   1. Reads the `X-Demo-Session` (and, on writes, `If-Match`) headers
 *      and forwards a typed input to `CartStore`.
 *   2. Maps the `CartOutcome` back to an `HttpResponse` — success
 *      becomes a 200 with the cart JSON body and an `ETag: "<version>"`
 *      header, failure becomes a Problem JSON with the matching status
 *      code.
 *   3. Never throws so the surrounding MSW worker returns the
 *      response rather than a 500 transport error.
 *
 * The handlers register themselves through the T05 dispatcher
 * registry so they appear in `createStrictHandlers(...)` for tests
 * and in `createHandlers(...)` for the browser/node workers.
 *
 * `options.persist` fires after every successful mutation so the browser
 * worker can write the sessionStorage snapshot, and `options.snapshot`
 * seeds the store at construction (MIM-212, S3-P0).
 */

import { http, HttpResponse, type DefaultBodyType, type RequestHandler } from 'msw';

import {
  registerBusinessHandlers,
  type BusinessHandlerEntry,
  type CreateHandlersOptions,
} from '../create-handlers';
import { faultResponse } from '../faults';
import { isRecord } from '../is-record';

import { buildTraceId, CartStore, problemType } from './cart-store';
import { catalogStore } from '../catalog/catalog.handlers';
import { invalidRequest, problemResponse } from '../problem-response';

/** Cross-handler reference to the cart store; consumed by the checkout and order mocks. */
export const cartStore: { current: CartStore | null } = { current: null };

/** `?mi-scenario=cart-mutation-fails`: removing a line and clearing the
 *  cart answer 503 and leave the cart as it was, so a browser pass can
 *  drive the cart page's failed-mutation path. Quantity updates (PATCH)
 *  and additions (POST) still succeed in this scenario. */
export const CART_MUTATION_FAILS_SCENARIO = 'cart-mutation-fails';

function simulatedMutationFailure(options: CreateHandlersOptions): HttpResponse<DefaultBodyType> {
  return problemResponse({
    ok: false,
    problem: {
      type: problemType('SERVICE_UNAVAILABLE'),
      title: 'Service unavailable',
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      detail: 'Simulated cart failure (cart-mutation-fails scenario)',
      traceId: buildTraceId(options),
      fieldErrors: [],
      params: {},
    },
  });
}

/**
 * Resolve the loaded catalogue store; throw when no fixture was
 * loaded. The cart handlers cannot answer a request without it.
 */
function requireCatalog(): NonNullable<typeof catalogStore.current> {
  if (catalogStore.current === null) {
    throw new Error('[cart.handlers] catalog store has not been loaded');
  }
  return catalogStore.current;
}

/** Map an outcome onto the matching `HttpResponse`. */
function outcomeResponse(outcome: ReturnType<CartStore['get']>): HttpResponse<DefaultBodyType> {
  if (outcome.ok) {
    return HttpResponse.json(outcome.cart, {
      status: 200,
      headers: { ETag: `"${String(outcome.cart.version)}"` },
    });
  }
  return problemResponse(outcome);
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

/** `quantity` must be an integer in 1..10; else returns a 400 detail. */
function readQuantity(
  options: CreateHandlersOptions,
  body: unknown,
): { ok: true; value: number } | { ok: false; response: HttpResponse<DefaultBodyType> } {
  if (!isRecord(body)) {
    return {
      ok: false,
      response: invalidRequest(options, 'quantity must be an integer between 1 and 10', {}),
    };
  }
  const quantity = body['quantity'];
  if (
    typeof quantity !== 'number' ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10
  ) {
    return {
      ok: false,
      response: invalidRequest(options, 'quantity must be an integer between 1 and 10', {}),
    };
  }
  return { ok: true, value: quantity };
}

/** `variantId` must be a non-empty string; else returns a 400 detail. */
function readVariantId(
  options: CreateHandlersOptions,
  body: unknown,
): { ok: true; value: string } | { ok: false; response: HttpResponse<DefaultBodyType> } {
  if (!isRecord(body)) {
    return {
      ok: false,
      response: invalidRequest(options, 'variantId is required', {}),
    };
  }
  const variantId = body['variantId'];
  if (typeof variantId !== 'string' || variantId.length === 0) {
    return {
      ok: false,
      response: invalidRequest(options, 'variantId is required', {}),
    };
  }
  return { ok: true, value: variantId };
}

/**
 * Cart business handler entry — registers itself on module load.
 * Each MSW worker (browser / node) builds its handler list from this
 * entry plus the catalogue entry, in registry order.
 */
export const cartHandlersEntry: BusinessHandlerEntry = (
  options: CreateHandlersOptions,
): readonly RequestHandler[] => {
  const store = new CartStore(options, (id) => requireCatalog().getVariant(id));
  cartStore.current = store;

  if (options.snapshot?.cart !== undefined) {
    store.seedFromSnapshot(options.snapshot.simulatedSessionId, options.snapshot.cart);
  }

  const getCart: RequestHandler = http.get('*/api/v1/cart', ({ request }) => {
    const fault = faultResponse(options, 'cart');
    if (fault !== null) return fault;
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) {
      return invalidRequest(options, 'Missing X-Demo-Session header', {});
    }
    return outcomeResponse(store.get(sessionId));
  });

  const addCartItem: RequestHandler = http.post('*/api/v1/cart/items', async ({ request }) => {
    const fault = faultResponse(options, 'cart-add');
    if (fault !== null) return fault;
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) {
      return invalidRequest(options, 'Missing X-Demo-Session header', {});
    }
    const ifMatch = request.headers.get('If-Match');
    const body = await readJsonBody(request);
    const variantRead = readVariantId(options, body);
    if (!variantRead.ok) return variantRead.response;
    const quantityRead = readQuantity(options, body);
    if (!quantityRead.ok) return quantityRead.response;
    const outcome = store.add(sessionId, ifMatch, variantRead.value, quantityRead.value);
    if (outcome.ok) options.persist?.(sessionId);
    return outcomeResponse(outcome);
  });

  const clearCart: RequestHandler = http.delete('*/api/v1/cart/items', ({ request }) => {
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) {
      return invalidRequest(options, 'Missing X-Demo-Session header', {});
    }
    if (options.scenario.name === CART_MUTATION_FAILS_SCENARIO)
      return simulatedMutationFailure(options);
    const ifMatch = request.headers.get('If-Match');
    const outcome = store.clear(sessionId, ifMatch);
    if (outcome.ok) options.persist?.(sessionId);
    return outcomeResponse(outcome);
  });

  const setCartItemQuantity: RequestHandler = http.patch(
    '*/api/v1/cart/items/:variantId',
    async ({ request, params }) => {
      const fault = faultResponse(options, 'cart-quantity');
      if (fault !== null) return fault;
      const sessionId = request.headers.get('X-Demo-Session');
      if (sessionId === null) {
        return invalidRequest(options, 'Missing X-Demo-Session header', {});
      }
      const ifMatch = request.headers.get('If-Match');
      const body = await readJsonBody(request);
      const quantityRead = readQuantity(options, body);
      if (!quantityRead.ok) return quantityRead.response;
      const variantId = String(params['variantId']);
      const outcome = store.setQuantity(sessionId, ifMatch, variantId, quantityRead.value);
      if (outcome.ok) options.persist?.(sessionId);
      return outcomeResponse(outcome);
    },
  );

  const removeCartItem: RequestHandler = http.delete(
    '*/api/v1/cart/items/:variantId',
    ({ request, params }) => {
      const sessionId = request.headers.get('X-Demo-Session');
      if (sessionId === null) {
        return invalidRequest(options, 'Missing X-Demo-Session header', {});
      }
      if (options.scenario.name === CART_MUTATION_FAILS_SCENARIO)
        return simulatedMutationFailure(options);
      const ifMatch = request.headers.get('If-Match');
      const variantId = String(params['variantId']);
      const outcome = store.remove(sessionId, ifMatch, variantId);
      if (outcome.ok) options.persist?.(sessionId);
      return outcomeResponse(outcome);
    },
  );

  return [getCart, addCartItem, clearCart, setCartItemQuantity, removeCartItem];
};

registerBusinessHandlers(cartHandlersEntry);
