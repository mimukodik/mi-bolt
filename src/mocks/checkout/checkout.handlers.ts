/**
 * T08 — checkout MSW handlers.
 *
 * Wires the four checkout operationIds declared in docs/api/openapi.yaml:
 *
 *   - `getCheckoutOptions`   → GET   /api/v1/checkout/options
 *   - `getCheckoutSession`   → GET   /api/v1/checkout/{cartId}
 *   - `updateCheckout`       → PUT   /api/v1/checkout/{cartId}
 *   - `createCheckoutQuote`  → POST  /api/v1/checkout/{cartId}/quote
 *
 * The handlers register themselves with the T05 factory via
 * `registerBusinessHandlers`. Each handler:
 *
 *   1. Reads the `X-Demo-Session`, `Idempotency-Key` and `If-Match`
 *      headers and forwards a typed input to the `QuoteDomain`.
 *   2. Maps the domain `Result<T>` back to an `HttpResponse` —
 *      success becomes a 200 with the canonical JSON body, failure
 *      becomes the matching Problem JSON status code.
 *   3. Never throws so the surrounding MSW worker returns the
 *      response rather than a 500 transport error.
 *
 * The `QuoteDomain` instance is constructed per-handler-list so two
 * MSW contexts (browser worker + Node tests) cannot leak checkout
 * draft state. The volatile map is also deliberately keyed by cart
 * id (not by session) — the cross-session 404 is enforced by the
 * domain's cart lookup, not by the map.
 */

import { http, HttpResponse, type RequestHandler } from 'msw';

import {
  registerBusinessHandlers,
  type BusinessHandlerEntry,
  type CreateHandlersOptions,
} from '../create-handlers';
import { IdempotencyStore } from '../idempotency';
import { getSharedStores } from '../orders/commit-order';

import {
  QuoteDomain,
  type CheckoutSessionSnapshot,
  type Problem,
  type QuoteSnapshot,
} from './quote-domain';

// ---------------------------------------------------------------------------
// Static checkout options — mirrored from `docs/api/fixtures/checkout-options.json`
// so the handlers have no filesystem dependency. Updated in lockstep
// with the fixture file.
// ---------------------------------------------------------------------------

export const CHECKOUT_OPTIONS = {
  deliveryOptions: [
    {
      id: 'home_delivery',
      label: 'Házhoz szállítás – demó',
      fee: { amount: 1990, currency: 'HUF' as const },
      requiresAddress: true,
      description: 'Fiktív szállítási díj; nem indul valódi kézbesítés.',
    },
    {
      id: 'demo_pickup',
      label: 'Demó átvételi pont',
      fee: { amount: 0, currency: 'HUF' as const },
      requiresAddress: false,
      description: 'Virtuális átvételi lehetőség; nincs valós üzletcím.',
    },
  ],
  paymentMethods: ['demo_card', 'demo_cod'],
  termsVersion: 'demo-1',
} as const;

// ---------------------------------------------------------------------------
// Problem response helper.
// ---------------------------------------------------------------------------

const PROBLEM_CONTENT_TYPE = 'application/problem+json' as const;

function problemResponse(problem: Problem, traceId: string): HttpResponse<Record<string, unknown>> {
  const code = problem.code.toLowerCase().replace(/_/g, '-');
  const body = {
    type: `urn:mi-bolt:problem:${code}`,
    title: problem.detail,
    status: problem.status,
    code: problem.code,
    detail: problem.detail,
    traceId,
    fieldErrors: problem.fieldErrors,
  };
  return HttpResponse.json(body, {
    status: problem.status,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  });
}

function traceIdFor(options: CreateHandlersOptions): string {
  return `mock-trace-${options.scenario.name}`;
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

function parseIfMatch(header: string | null): number | null {
  if (header === null) return null;
  if (!/^"[0-9]+"$/.test(header)) return null;
  const inner = header.slice(1, -1);
  const value = Number.parseInt(inner, 10);
  if (!Number.isFinite(value) || value < 1) return null;
  return value;
}

function sessionOf(request: Request): string | null {
  return request.headers.get('X-Demo-Session');
}

function idempotencyKeyOf(request: Request): string | null {
  return request.headers.get('Idempotency-Key');
}

/**
 * Mirrors `CartDomain.HeaderRules.sessionPattern` so the checkout
 * mock rejects the same malformed session ids the cart mock rejects.
 * Without this, an id with the right length but wrong characters
 * (e.g. spaces) would pass the handler and only fail later in the
 * domain with a less specific error.
 */
const SESSION_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

function isValidSession(value: string): boolean {
  return SESSION_PATTERN.test(value);
}

function badRequest(detail: string, traceId: string): HttpResponse<Record<string, unknown>> {
  return problemResponse(
    { status: 400, code: 'VALIDATION_FAILED', detail, fieldErrors: [] },
    traceId,
  );
}

// ---------------------------------------------------------------------------
// Handler factory — built once per `setupWorker` / `setupServer` call so
// each scenario owns its own draft + quote state.
// ---------------------------------------------------------------------------

export function buildCheckoutHandlers(
  options: CreateHandlersOptions,
): readonly RequestHandler[] {
  const { repository, clock, ids, scenario, apiRoot } = options;
  const traceId = traceIdFor(options);
  const base = apiRoot.endsWith('/') ? apiRoot.slice(0, -1) : apiRoot;
  // MSW 2.x matches paths against the request's origin. We anchor every
  // checkout handler to both the configured origin AND `127.0.0.1` so the
  // Node MSW server (which defaults to `http://127.0.0.1`) and the
  // browser worker (which uses `location.origin`) both intercept.
  const wildcard = `*${base}`;
  // The QuoteDomain is shared with the payment + order handlers so the
  // draft / quote state is observable across slices. The IdempotencyStore
  // is owned by the shared store — checkout writes are visible to
  // payment + order replays too.
  const shared = getSharedStores(repository, clock, ids, new IdempotencyStore(clock));
  const domain: QuoteDomain = shared.quoteDomain;

  const getCheckoutOptions: RequestHandler = http.get(
    `${wildcard}/checkout/options`,
    () =>
      HttpResponse.json(CHECKOUT_OPTIONS, {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      }),
  );

  const getCheckoutSession: RequestHandler = http.get(
    `${wildcard}/checkout/:cartId`,
    ({ request, params }) => {
      const sessionId = sessionOf(request);
      if (sessionId === null) return badRequest('Hiányzó X-Demo-Session fejléc.', traceId);
      if (!isValidSession(sessionId)) {
        return badRequest('Érvénytelen X-Demo-Session fejléc.', traceId);
      }
      const cartId = String(params['cartId']);
      const cart = repository.getCart(cartId);
      if (!cart || cart.sessionId !== sessionId) {
        return problemResponse(
          { status: 404, code: 'NOT_FOUND', detail: 'A kosár nem található.', fieldErrors: [] },
          traceId,
        );
      }
      if (domain.isExpired(cart)) {
        return problemResponse(
          { status: 410, code: 'CART_EXPIRED', detail: 'A kosár lejárt.', fieldErrors: [] },
          traceId,
        );
      }
      const session = domain.getSession(cartId, cart.version);
      const body = serializeSession(session, cart.version);
      return HttpResponse.json(body, {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    },
  );

  const updateCheckout: RequestHandler = http.put(
    `${wildcard}/checkout/:cartId`,
    async ({ request, params }) => {
      const sessionId = sessionOf(request);
      if (sessionId === null) return badRequest('Hiányzó X-Demo-Session fejléc.', traceId);
      if (!isValidSession(sessionId)) {
        return badRequest('Érvénytelen X-Demo-Session fejléc.', traceId);
      }
      const idempotencyKey = idempotencyKeyOf(request);
      if (idempotencyKey === null) return badRequest('Hiányzó Idempotency-Key fejléc.', traceId);
      if (idempotencyKey.length < 8 || idempotencyKey.length > 100) {
        return badRequest('Érvénytelen Idempotency-Key hossz.', traceId);
      }
      const ifMatchHeader = request.headers.get('If-Match');
      if (ifMatchHeader === null) return badRequest('Hiányzó If-Match fejléc.', traceId);
      const cartVersion = parseIfMatch(ifMatchHeader);
      if (cartVersion === null) return badRequest('Érvénytelen If-Match formátum.', traceId);
      const body = await readJsonBody(request);
      if (body === null || typeof body !== 'object') {
        return badRequest('A kérés törzse érvénytelen JSON.', traceId);
      }
      const result = domain.updateDraft({
        sessionId,
        cartId: String(params['cartId']),
        cartVersion,
        idempotencyKey,
        body: body as { contact?: unknown; delivery?: unknown; paymentMethod?: unknown },
      });
      if (!result.ok) return problemResponse(result.problem, traceId);
      const cart = repository.getCart(result.value.cartId);
      const cartVersionOut = cart ? cart.version : result.value.cartVersion;
      return HttpResponse.json(serializeSession(result.value, cartVersionOut), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    },
  );

  const createCheckoutQuote: RequestHandler = http.post(
    `${wildcard}/checkout/:cartId/quote`,
    ({ request, params }) => {
      const sessionId = sessionOf(request);
      if (sessionId === null) return badRequest('Hiányzó X-Demo-Session fejléc.', traceId);
      if (!isValidSession(sessionId)) {
        return badRequest('Érvénytelen X-Demo-Session fejléc.', traceId);
      }
      const idempotencyKey = idempotencyKeyOf(request);
      if (idempotencyKey === null) return badRequest('Hiányzó Idempotency-Key fejléc.', traceId);
      if (idempotencyKey.length < 8 || idempotencyKey.length > 100) {
        return badRequest('Érvénytelen Idempotency-Key hossz.', traceId);
      }
      const ifMatchHeader = request.headers.get('If-Match');
      if (ifMatchHeader === null) return badRequest('Hiányzó If-Match fejléc.', traceId);
      const cartVersion = parseIfMatch(ifMatchHeader);
      if (cartVersion === null) return badRequest('Érvénytelen If-Match formátum.', traceId);
      const result = domain.createQuote({
        sessionId,
        cartId: String(params['cartId']),
        cartVersion,
        idempotencyKey,
      });
      if (!result.ok) return problemResponse(result.problem, traceId);
      return HttpResponse.json(serializeQuote(result.value.quote), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    },
  );

  return [getCheckoutOptions, getCheckoutSession, updateCheckout, createCheckoutQuote];
}

/** Public registration entry — wired by `registerBusinessHandlers`. */
export const checkoutHandlersEntry: BusinessHandlerEntry = (options) => buildCheckoutHandlers(options);

registerBusinessHandlers(checkoutHandlersEntry);

// ---------------------------------------------------------------------------
// Wire serializers — strip helper-only fields so the JSON matches the
// OpenAPI `CheckoutSession` / `Quote` schemas exactly.
// ---------------------------------------------------------------------------

function serializeSession(
  snapshot: CheckoutSessionSnapshot,
  cartVersion: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    cartId: snapshot.cartId,
    cartVersion,
  };
  if (snapshot.draft.contact) out['contact'] = snapshot.draft.contact;
  if (snapshot.draft.delivery) out['delivery'] = snapshot.draft.delivery;
  if (snapshot.draft.paymentMethod) out['paymentMethod'] = snapshot.draft.paymentMethod;
  if (snapshot.quote) out['quote'] = serializeQuote(snapshot.quote);
  return out;
}

function serializeQuote(quote: QuoteSnapshot): Record<string, unknown> {
  return {
    id: quote.id,
    cartId: quote.cartId,
    cartVersion: quote.cartVersion,
    subtotal: quote.subtotal,
    shipping: quote.shipping,
    total: quote.total,
    expiresAt: quote.expiresAt,
  };
}
