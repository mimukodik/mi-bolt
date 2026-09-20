/**
 * T09 — payment-intent MSW handlers.
 *
 * Wires the two payment operationIds declared in docs/api/openapi.yaml:
 *
 *   - `createPaymentIntent` → POST /api/v1/payment-intents
 *   - `getPaymentIntent`    → GET  /api/v1/payment-intents/{paymentIntentId}
 *
 * Only `demo_card` and `demo_cod` are accepted. The mock NEVER
 * accepts card numbers, CVV, expiry, bank redirect or any external
 * payment request. A payment intent is created from a current
 * unexpired quote and a known cart; the scenario descriptor picks
 * the deterministic `succeeded` / `declined` / `pending` status.
 *
 * The handlers register themselves through the T05 dispatcher
 * registry so they appear in `createStrictHandlers(...)` for tests
 * and in `createHandlers(...)` for the browser/node workers. The
 * shared `PaymentIntentStore` lives in `commit-order.ts` so the
 * `OrderDomain` can validate the matching intent without a separate
 * module.
 */

import { http, HttpResponse, type RequestHandler } from 'msw';

import {
  registerBusinessHandlers,
  type BusinessHandlerEntry,
  type CreateHandlersOptions,
} from '../create-handlers';
import { IdempotencyStore, deriveIdempotencyKey, hashPayload } from '../idempotency';
import { isRecord } from '../is-record';
import { type Money } from '../repository';

import type { PaymentIntentStore } from '../orders/commit-order';
import {
  type PaymentIntentRecord,
  type PaymentIntentStatus,
  getSharedStores,
} from '../orders/commit-order';

import type { QuoteDomain } from '../checkout/quote-domain';

// ---------------------------------------------------------------------------
// Header validation rules — mirror the cart / checkout layers.
// ---------------------------------------------------------------------------

const SESSION_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const IDEMPOTENCY_MIN = 8;
const IDEMPOTENCY_MAX = 100;

interface PaymentProblemLike {
  status: number;
  code: string;
  detail: string;
  fieldErrors: { path: string; message: string }[];
}

const PROBLEM_CONTENT_TYPE = 'application/problem+json' as const;

function problemResponse(
  problem: PaymentProblemLike,
  traceId: string,
): HttpResponse<Record<string, unknown>> {
  const code = problem.code.toLowerCase().replaceAll('_', '-');
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

function badRequest(
  detail: string,
  traceId: string,
  fieldErrors: { path: string; message: string }[] = [],
): HttpResponse<Record<string, unknown>> {
  return problemResponse({ status: 400, code: 'VALIDATION_FAILED', detail, fieldErrors }, traceId);
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

// ---------------------------------------------------------------------------
// Scenario → initial payment intent status mapping.
//
// `default`, `happy-path`, `order-timeout-after-commit`,
// `idempotency-conflict`, `checkout-ready` and any unknown name
// produce a succeeded intent so the rest of the demo flow can
// commit an order. Explicit `payment-declined` / `payment-pending-*`
// scenarios produce the matching state for the deterministic test
// paths.
// ---------------------------------------------------------------------------

function initialStatusFor(scenarioName: string): PaymentIntentStatus {
  if (scenarioName === 'payment-declined') return 'declined';
  return scenarioName === 'payment-pending-resolves' || scenarioName === 'payment-pending-timeout'
    ? 'pending'
    : 'succeeded';
}

// ---------------------------------------------------------------------------
// Wire serializer — strips internal fields (cartVersion, sessionId)
// before returning to the client. The internal fields remain in the
// store so `OrderDomain` can validate the matching intent.
// ---------------------------------------------------------------------------

interface PaymentIntentWire {
  id: string;
  cartId: string;
  quoteId: string;
  status: PaymentIntentStatus;
  isSimulation: true;
  amount: Money;
}

function serializeIntent(intent: PaymentIntentRecord): PaymentIntentWire {
  return {
    id: intent.id,
    cartId: intent.cartId,
    quoteId: intent.quoteId,
    status: intent.status,
    isSimulation: true,
    amount: intent.amount,
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateSession(
  value: string | null,
  traceId: string,
): { ok: true; value: string } | { ok: false; response: HttpResponse<Record<string, unknown>> } {
  if (value === null) {
    return {
      ok: false,
      response: badRequest('Hiányzó X-Demo-Session fejléc.', traceId),
    };
  }
  if (!SESSION_PATTERN.test(value)) {
    return {
      ok: false,
      response: badRequest('Érvénytelen X-Demo-Session fejléc.', traceId),
    };
  }
  return { ok: true, value };
}

function validateIdempotencyKey(
  value: string | null,
  traceId: string,
): { ok: true; value: string } | { ok: false; response: HttpResponse<Record<string, unknown>> } {
  if (value === null) {
    return {
      ok: false,
      response: badRequest('Hiányzó Idempotency-Key fejléc.', traceId),
    };
  }
  if (value.length < IDEMPOTENCY_MIN || value.length > IDEMPOTENCY_MAX) {
    return {
      ok: false,
      response: badRequest('Érvénytelen Idempotency-Key hossz.', traceId),
    };
  }
  return { ok: true, value };
}

function readBody(
  body: unknown,
): { ok: true; value: { cartId: string; quoteId: string } } | { ok: false; detail: string } {
  if (!isRecord(body)) {
    return { ok: false, detail: 'A kérés törzse érvénytelen JSON.' };
  }
  const cartId = body['cartId'];
  const quoteId = body['quoteId'];
  if (typeof cartId !== 'string' || cartId.length === 0) {
    return { ok: false, detail: 'A cartId mező kötelező szöveg.' };
  }
  return typeof quoteId !== 'string' || quoteId.length === 0
    ? { ok: false, detail: 'A quoteId mező kötelező szöveg.' }
    : { ok: true, value: { cartId, quoteId } };
}

// ---------------------------------------------------------------------------
// Handler factory — built per worker so each scenario owns its own
// PaymentIntentStore + IdempotencyStore. The OrderDomain reads from
// the same PaymentIntentStore so the cross-handler lookup works.
// ---------------------------------------------------------------------------

export function buildPaymentHandlers(
  options: CreateHandlersOptions,
  paymentIntents: PaymentIntentStore,
  quoteDomain: QuoteDomain,
): readonly RequestHandler[] {
  const { repository, clock, ids, scenario } = options;
  const traceId = traceIdFor(options);
  const idempotency = new IdempotencyStore(clock);

  const createPaymentIntent: RequestHandler = http.post(
    '*/api/v1/payment-intents',
    async ({ request }) => {
      const session = validateSession(request.headers.get('X-Demo-Session'), traceId);
      if (!session.ok) return session.response;
      const idem = validateIdempotencyKey(request.headers.get('Idempotency-Key'), traceId);
      if (!idem.ok) return idem.response;
      const body = await readJsonBody(request);
      const parsed = readBody(body);
      if (!parsed.ok) {
        return badRequest(parsed.detail, traceId);
      }
      // demo_cod never creates a payment intent; the request is rejected as
      // 400 VALIDATION_FAILED so the client does not silently accept a
      // payment intent it never intended to create.
      const draft = quoteDomain.getDraft(parsed.value.cartId);
      if (draft.paymentMethod === 'demo_cod') {
        return badRequest('A demo_cod fizetési mód nem igényel fizetési szándékot.', traceId);
      }

      // Replay / conflict for createPaymentIntent is keyed by method+path+session+key.
      const idemKey = deriveIdempotencyKey('POST', '/payment-intents', session.value, idem.value);
      const payloadHash = hashPayload(parsed.value);
      const replay = idempotency.find(idemKey, payloadHash);
      if (replay) {
        // The replay body is stored verbatim by `idempotency.record(...)`
        // and is always an object today: the only call site that records
        // one passes `serializeIntent(intent)`. The guard is what lets
        // `HttpResponse.json` receive a narrowed record; its false branch
        // cannot be reached with the current call sites.
        if (!isRecord(replay.body)) {
          return HttpResponse.json<Record<string, unknown>>(
            {},
            {
              status: replay.status,
              headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
            },
          );
        }
        return HttpResponse.json(replay.body, {
          status: replay.status,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        });
      }
      if (idempotency.hasConflictingPayload(idemKey, payloadHash)) {
        return problemResponse(
          {
            status: 409,
            code: 'IDEMPOTENCY_CONFLICT',
            detail: 'Az idempotencia kulcs már más kéréssel lett rögzítve.',
            fieldErrors: [],
          },
          traceId,
        );
      }

      // Validate cart
      const cart = repository.getCart(parsed.value.cartId);
      if (cart?.sessionId !== session.value) {
        return problemResponse(
          { status: 404, code: 'NOT_FOUND', detail: 'A kosár nem található.', fieldErrors: [] },
          traceId,
        );
      }
      if (quoteDomain.isExpired(cart)) {
        return problemResponse(
          { status: 410, code: 'CART_EXPIRED', detail: 'A kosár lejárt.', fieldErrors: [] },
          traceId,
        );
      }
      if (cart.status !== 'active') {
        return problemResponse(
          { status: 404, code: 'NOT_FOUND', detail: 'A kosár már lezárult.', fieldErrors: [] },
          traceId,
        );
      }

      // Validate quote
      const quote = quoteDomain.getActiveQuote(parsed.value.cartId, cart.version);
      if (quote?.id !== parsed.value.quoteId) {
        return problemResponse(
          {
            status: 409,
            code: 'QUOTE_EXPIRED',
            detail: 'Az árajánlat lejárt vagy érvénytelen.',
            fieldErrors: [],
          },
          traceId,
        );
      }

      const status = initialStatusFor(scenario.name);
      const intent = paymentIntents.create({
        id: ids.uuid(),
        cartId: parsed.value.cartId,
        cartVersion: cart.version,
        quoteId: parsed.value.quoteId,
        amount: quote.total,
        sessionId: session.value,
        status,
        isSimulation: true,
      });
      const body_ = serializeIntent(intent);
      idempotency.record(idemKey, payloadHash, { status: 201, body: body_ });
      return HttpResponse.json(body_, {
        status: 201,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    },
  );

  const getPaymentIntent: RequestHandler = http.get(
    '*/api/v1/payment-intents/:paymentIntentId',
    ({ request, params }) => {
      const session = validateSession(request.headers.get('X-Demo-Session'), traceId);
      if (!session.ok) return session.response;
      const id = String(params['paymentIntentId']);
      const intent = paymentIntents.findById(id, scenario.name);
      if (!intent) {
        return problemResponse(
          {
            status: 404,
            code: 'NOT_FOUND',
            detail: 'A fizetési szándék nem található.',
            fieldErrors: [],
          },
          traceId,
        );
      }
      // Cross-session access is rejected so an attacker with one
      // session id cannot probe another session's intents.
      if (intent.sessionId !== session.value) {
        return problemResponse(
          {
            status: 404,
            code: 'NOT_FOUND',
            detail: 'A fizetési szándék nem található.',
            fieldErrors: [],
          },
          traceId,
        );
      }
      return HttpResponse.json(serializeIntent(intent), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    },
  );

  return [createPaymentIntent, getPaymentIntent];
}

// ---------------------------------------------------------------------------
// Public entry — registered with the T05 dispatcher. The shared
// `PaymentIntentStore` + `QuoteDomain` + `StockTracker` instances are
// resolved lazily via `getSharedStores` keyed by Repository identity so
// payment + order handlers see the same map regardless of registry order.
// ---------------------------------------------------------------------------

export const paymentHandlersEntry: BusinessHandlerEntry = (options) => {
  const shared = getSharedStores(
    options.repository,
    options.clock,
    options.ids,
    new IdempotencyStore(options.clock),
  );
  return buildPaymentHandlers(options, shared.paymentIntents, shared.quoteDomain);
};

registerBusinessHandlers(paymentHandlersEntry);

// ---------------------------------------------------------------------------
// Shared types re-exported for downstream test fixtures.
// ---------------------------------------------------------------------------

export { type PaymentMethod, type PaymentIntentRecord } from '../orders/commit-order';
export { type Problem, type QuoteSnapshot } from '../checkout/quote-domain';
