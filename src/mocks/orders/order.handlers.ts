/**
 * T09 — order MSW handlers.
 *
 * Wires the two order operationIds declared in docs/api/openapi.yaml:
 *
 *   - `createOrder` → POST /api/v1/orders
 *   - `getOrder`    → GET  /api/v1/orders/{orderId}
 *
 * The handlers delegate the validation + atomic commit to
 * `OrderDomain`. The privacy-minimized `OrderReceipt` is the only
 * payload ever returned; contact, address and card data are stripped
 * at the domain boundary and never reach the wire.
 *
 * The shared `PaymentIntentStore` + `StockTracker` + `QuoteDomain`
 * are constructed here so the payment handlers can resolve them
 * through `registerSharedStores`. This keeps the two slices in
 * lockstep without enlarging the create-handlers API.
 */

import { http, HttpResponse, type RequestHandler } from 'msw';

import {
  registerBusinessHandlers,
  type BusinessHandlerEntry,
  type CreateHandlersOptions,
} from '../create-handlers';
import { IdempotencyStore } from '../idempotency';
import { isRecord } from '../is-record';

import type { PaymentIntentStore, StockTracker } from './commit-order';
import { OrderDomain, getSharedStores, type OrderProblem, type OrderReceipt } from './commit-order';
import type { QuoteDomain } from '../checkout/quote-domain';

// ---------------------------------------------------------------------------
// Header validation rules — mirror the cart / checkout / payment layers.
// ---------------------------------------------------------------------------

const SESSION_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const IDEMPOTENCY_MIN = 8;
const IDEMPOTENCY_MAX = 100;

const PROBLEM_CONTENT_TYPE = 'application/problem+json' as const;

function problemResponse(
  problem: OrderProblem,
  traceId: string,
): HttpResponse<Record<string, unknown>> {
  const code = problem.code.toLowerCase().replaceAll('_', '-');
  const body: Record<string, unknown> = {
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

interface OrderRequestBody {
  cartId?: unknown;
  quoteId?: unknown;
  paymentIntentId?: unknown;
  termsVersion?: unknown;
  acceptedTerms?: unknown;
  acknowledgedSimulation?: unknown;
}

/**
True when `value` is a JSON object the field-level checks below can read.
*/
function isOrderRequestBody(value: unknown): value is OrderRequestBody {
  return isRecord(value);
}

function readOrderBody(
  body: unknown,
  traceId: string,
):
  | {
      ok: true;
      value: {
        cartId: string;
        quoteId: string;
        paymentIntentId: string | null;
        termsVersion: string;
        acceptedTerms: boolean;
        acknowledgedSimulation: boolean;
      };
    }
  | { ok: false; response: HttpResponse<Record<string, unknown>> } {
  if (!isOrderRequestBody(body)) {
    return {
      ok: false,
      response: badRequest('A kérés törzse érvénytelen JSON.', traceId),
    };
  }
  const record = body;
  const fieldErrors: { path: string; message: string }[] = [];
  const cartId = typeof record.cartId === 'string' ? record.cartId : '';
  if (cartId.length === 0) {
    fieldErrors.push({ path: '/cartId', message: 'A cartId mező kötelező szöveg.' });
  }
  const quoteId = typeof record.quoteId === 'string' ? record.quoteId : '';
  if (quoteId.length === 0) {
    fieldErrors.push({ path: '/quoteId', message: 'A quoteId mező kötelező szöveg.' });
  }
  const paymentIntentIdRaw = record.paymentIntentId;
  let paymentIntentId: string | null = null;
  if (paymentIntentIdRaw !== undefined && paymentIntentIdRaw !== null) {
    if (typeof paymentIntentIdRaw !== 'string' || paymentIntentIdRaw.length === 0) {
      fieldErrors.push({
        path: '/paymentIntentId',
        message: 'A paymentIntentId mező szöveg kell legyen, ha meg van adva.',
      });
    } else {
      paymentIntentId = paymentIntentIdRaw;
    }
  }
  const termsVersion = typeof record.termsVersion === 'string' ? record.termsVersion : '';
  if (termsVersion.length === 0) {
    fieldErrors.push({ path: '/termsVersion', message: 'A termsVersion mező kötelező.' });
  }
  const isAcceptedTerms: boolean = record.acceptedTerms === true;
  if (!isAcceptedTerms) {
    fieldErrors.push({
      path: '/acceptedTerms',
      message: 'Az acceptedTerms mező kötelező és értéke true kell legyen.',
    });
  }
  const isAcknowledgedSimulation: boolean = record.acknowledgedSimulation === true;
  if (!isAcknowledgedSimulation) {
    fieldErrors.push({
      path: '/acknowledgedSimulation',
      message: 'Az acknowledgedSimulation mező kötelező és értéke true kell legyen.',
    });
  }
  if (fieldErrors.length > 0) {
    return {
      ok: false,
      response: badRequest('A kérés törzse hibás.', traceId, fieldErrors),
    };
  }
  return {
    ok: true,
    value: {
      cartId,
      quoteId,
      paymentIntentId,
      termsVersion,
      acceptedTerms: isAcceptedTerms,
      acknowledgedSimulation: isAcknowledgedSimulation,
    },
  };
}

// ---------------------------------------------------------------------------
// Wire serializer — privacy-minimized receipt. The internal sessionId
// added at commit time is dropped here so the wire payload matches
// the OpenAPI `OrderReceipt` schema exactly.
// ---------------------------------------------------------------------------

function serializeReceipt(receipt: OrderReceipt): Record<string, unknown> {
  return {
    id: receipt.id,
    orderNumber: receipt.orderNumber,
    createdAt: receipt.createdAt,
    status: receipt.status,
    isSimulation: receipt.isSimulation,
    items: receipt.items.map((line) => ({ ...line })),
    subtotal: receipt.subtotal,
    shipping: receipt.shipping,
    total: receipt.total,
    paymentMethod: receipt.paymentMethod,
    deliveryOptionId: receipt.deliveryOptionId,
    notice: receipt.notice,
  };
}

// ---------------------------------------------------------------------------
// Handler factory — built per worker so each scenario owns its own
// OrderDomain + shared stores. The shared stores are also exposed to
// the payment handlers via `registerSharedStores`.
// ---------------------------------------------------------------------------

export function buildOrderHandlers(
  options: CreateHandlersOptions,
  shared: {
    paymentIntents: PaymentIntentStore;
    quoteDomain: QuoteDomain;
    stocks: StockTracker;
  },
): readonly RequestHandler[] {
  const { repository, clock, ids, scenario, persist } = options;
  const traceId = traceIdFor(options);
  const idempotency = new IdempotencyStore(clock);
  const domain = new OrderDomain(
    repository,
    clock,
    ids,
    idempotency,
    shared.paymentIntents,
    shared.stocks,
    shared.quoteDomain,
    scenario.name,
  );

  const createOrder: RequestHandler = http.post('*/api/v1/orders', async ({ request }) => {
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) return badRequest('Hiányzó X-Demo-Session fejléc.', traceId);
    if (!SESSION_PATTERN.test(sessionId)) {
      return badRequest('Érvénytelen X-Demo-Session fejléc.', traceId);
    }
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey === null) return badRequest('Hiányzó Idempotency-Key fejléc.', traceId);
    if (idempotencyKey.length < IDEMPOTENCY_MIN || idempotencyKey.length > IDEMPOTENCY_MAX) {
      return badRequest('Érvénytelen Idempotency-Key hossz.', traceId);
    }
    const body = await readJsonBody(request);
    const parsed = readOrderBody(body, traceId);
    if (!parsed.ok) return parsed.response;
    const result = domain.createOrder({
      sessionId,
      idempotencyKey,
      cartId: parsed.value.cartId,
      quoteId: parsed.value.quoteId,
      paymentIntentId: parsed.value.paymentIntentId,
      termsVersion: parsed.value.termsVersion,
      acceptedTerms: parsed.value.acceptedTerms,
      acknowledgedSimulation: parsed.value.acknowledgedSimulation,
    });
    if (!result.ok) return problemResponse(result.problem, traceId);
    persist?.(sessionId);
    return HttpResponse.json(serializeReceipt(result.value), {
      status: 201,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  });

  const getOrder: RequestHandler = http.get('*/api/v1/orders/:orderId', ({ request, params }) => {
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) return badRequest('Hiányzó X-Demo-Session fejléc.', traceId);
    if (!SESSION_PATTERN.test(sessionId)) {
      return badRequest('Érvénytelen X-Demo-Session fejléc.', traceId);
    }
    const result = domain.getOrder({
      sessionId,
      orderId: String(params['orderId']),
    });
    if (!result.ok) return problemResponse(result.problem, traceId);
    return HttpResponse.json(serializeReceipt(result.value), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  });

  return [createOrder, getOrder];
}

// ---------------------------------------------------------------------------
// Public entry — registered with the T05 dispatcher. Owns the shared
// stores so the payment handlers can resolve them via
// `registerSharedStores`.
// ---------------------------------------------------------------------------

export const orderHandlersEntry: BusinessHandlerEntry = (options) => {
  const idempotencyForQuotes = new IdempotencyStore(options.clock);
  const shared = getSharedStores(
    options.repository,
    options.clock,
    options.ids,
    idempotencyForQuotes,
  );
  return buildOrderHandlers(options, shared);
};

registerBusinessHandlers(orderHandlersEntry);
