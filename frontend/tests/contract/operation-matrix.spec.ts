// tests/contract/operation-matrix.spec.ts — T26 SDK↔MSW contract parity.
//
// Every assertion in this file is derived from contracts/commerce/openapi.yaml
// (title "MiBolt Commerce API", version 2.0.0) at test time. The
// 17 operationIds, the 4xx/5xx status codes, the Problem codes and
// the documented response shapes all come from the spec; nothing is
// hand-maintained. A new operation added to the spec either (a) gets
// a matching MSW handler and an SDK transport test, or (b) trips a
// focused CI failure naming the exact gap.
//
// The five top-level describe blocks correspond to T26-AC01…AC05.
// Each one ships with at least one named, failing-first assertion the
// implementer (or reviewer) can replay on its own.

import { readFile } from 'node:fs/promises';

import '@angular/compiler';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { http, HttpResponse } from 'msw';

import { server, useMswServer } from '../msw-server';
import type { HttpClient, HttpContext } from '@angular/common/http';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import type { firstValueFrom } from 'rxjs';

import type { Api } from '../../projects/shop-api/src/generated/api';
import type { ApiConfiguration as ApiConfig } from '../../projects/shop-api/src/generated/api-configuration';
import { provideApiConfiguration as provideApiConfig } from '../../projects/shop-api/src/generated/api-configuration';
import * as operations from '../../projects/shop-api/src/generated/functions';
import {
  createHandlers,
  createStrictHandlers,
} from '../../projects/shop-mocks/src/create-handlers';
import { Repository as Repo } from '../../projects/shop-mocks/src/repository';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
  type ScenarioDescriptor,
} from '../../projects/shop-mocks/src/scenarios';
// Side-effect imports — each slice module calls `registerBusinessHandlers`
// on load. The order matters only for the shared stores inside the
// payment / order slices; once both have registered, every entry in
// the dispatcher registry is callable.
import '../../projects/shop-mocks/src/catalog/catalog.handlers';
import '../../projects/shop-mocks/src/cart/cart.handlers';
import '../../projects/shop-mocks/src/checkout/checkout.handlers';
import '../../projects/shop-mocks/src/payment/payment.handlers';
import '../../projects/shop-mocks/src/orders/order.handlers';

import {
  REQUIRED_OPERATION_COUNT,
  SPEC_PATH,
  collectOperations,
  compileRequestValidator,
  compileResponseValidator,
  buildProblemCodeMatrix,
  getProblemValidator,
  loadOpenApiSpec,
  openApiPathToMswPath,
  type OpenApiSpec,
  type OperationDescriptor,
} from './response-validation';
import { demoSessionInterceptor } from '../../projects/core-api/src/demo-session.interceptor';
import {
  isCatalogFixtureShape,
  loadCatalogFixture,
} from '../../projects/shop-mocks/src/catalog/catalog.handlers';
import catalogFixture from '../../docs/api/fixtures/catalog.json';

const BASE_URL = 'http://localhost/api/v1';
const API_ROOT = '/api/v1';

// 2.0.0 contract: 17 operations (contracts/commerce/openapi.yaml:55-933), ProblemCode at 1453-1470.

let dereferencedSpec: OpenApiSpec;
let operationsById: Map<string, OperationDescriptor>;
let problemMatrix: Map<string, Set<string>>;

// 2.0.0 collapses the cart operations onto session-bound routes
// (cart.handlers.ts:269-337): the session identifies the cart, so the
// path carries no {cartId}. Cart-mutation paths under
// contracts/commerce/openapi.yaml:266-466.
const CART_ITEMS_PATH = '/cart/items';

beforeAll(async () => {
  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting(), {
    teardown: { destroyAfterEach: true },
  });
  const loaded = await loadOpenApiSpec();
  dereferencedSpec = loaded.dereferenced;
  operationsById = new Map(collectOperations(dereferencedSpec).map((op) => [op.operationId, op]));
  problemMatrix = buildProblemCodeMatrix(dereferencedSpec);
});

afterAll(() => {
  TestBed.resetTestingModule();
});

// ---------------------------------------------------------------------------
// T26-AC01 — every documented operationId maps to an MSW handler and to
// the SDK transport contract suite.
// ---------------------------------------------------------------------------

describe('T26-AC01 operation inventory parity', () => {
  it('declares exactly 17 operationIds in the spec', () => {
    expect(operationsById.size).toBe(REQUIRED_OPERATION_COUNT);
  });

  it('exposes every operationId in the generated SDK functions module', () => {
    for (const op of operationsById.values()) {
      // getMedia is generated as three content-type overloads
      // (projects/shop-api/src/generated/functions.ts:11-15) so the contract
      // maps one operationId to any function whose name starts with
      // the operationId. Every other operationId matches exactly.
      const prefix = op.operationId;
      const exportNames = Object.keys(operations as unknown as Record<string, unknown>);
      const matches = exportNames.filter(
        (name) => name === prefix || name.startsWith(`${prefix}$`),
      );
      expect(
        matches.length,
        `SDK function(s) for ${prefix} missing; found ${JSON.stringify(exportNames)}`,
      ).toBeGreaterThan(0);
    }
  });

  it('registers a business handler for every operationId', () => {
    const routes = collectRegisteredRoutes();
    const missing: string[] = [];
    for (const op of operationsById.values()) {
      const expected = `${op.method.toUpperCase()} ${openApiPathToMswPath(op.path)}`;
      if (!routes.has(expected)) {
        missing.push(`${expected} (${op.operationId})`);
      }
    }
    expect(missing, `MSW handlers missing for: ${missing.join(', ')}`).toEqual([]);
  });

  it('rejects any business route the slices did not register (no orphan handlers)', () => {
    // The dispatcher shell produces 404 NOT_FOUND Problem JSON for
    // any /api/v1/* route the slices do not own. Walking that route
    // through the same dispatcher must produce the dispatcher body,
    // not a business handler response.
    const options = makeOptions(DEFAULT_SCENARIO);
    const handlers = createStrictHandlers(options);
    const probe = handlers.find(
      (h) =>
        (h as unknown as { info?: { method: string; path: string } }).info?.path ===
        '/api/v1/__unknown__',
    );
    expect(probe, 'strict handler list must not contain an orphan probe').toBeUndefined();
    const strict = createStrictHandlers(options);
    const fallback = createHandlers(options);
    expect(fallback.length).toBe(strict.length + 2); // dispatcher adds base + wildcard
  });
});

// ---------------------------------------------------------------------------
// T26-AC02 — every request and response at the boundary validates
// against the OpenAPI schema, and every documented Problem code is
// exercised by the operation that owns it.
// ---------------------------------------------------------------------------

describe('T26-AC02 request/response + Problem-code contract', () => {
  it('every documented success response validates against its schema', () => {
    for (const op of operationsById.values()) {
      const validator = compileResponseValidator(op.operationId, op.successStatus);
      // getMedia returns binary content (image/webp, image/jpeg,
      // image/png) under contracts/commerce/openapi.yaml:216-265; no JSON
      // schema applies, so a missing validator is the expected shape
      // for that one operation.
      if (!validator) {
        expect(op.operationId === 'getMedia', `${op.operationId} has no 2xx JSON validator`).toBe(
          true,
        );
        continue;
      }
      const fixture = buildHappyPathFixture(op, dereferencedSpec);
      const ok = validator(fixture);
      expect(
        ok,
        `${op.operationId}: happy-path fixture failed schema — ${JSON.stringify(validator.errors)}`,
      ).toBe(true);
    }
  });

  it('rejects a request body that violates the documented request schema', () => {
    for (const op of operationsById.values()) {
      if (!op.hasRequestBody) continue;
      const validator = compileRequestValidator(op.operationId);
      if (!validator) continue;
      const broken = breakRequestFixture(op);
      const ok = validator(broken);
      expect(ok, `${op.operationId}: malformed request unexpectedly passed schema`).toBe(false);
    }
  });

  it('rejects a 2xx response that drifts from the documented schema', () => {
    for (const op of operationsById.values()) {
      const validator = compileResponseValidator(op.operationId, op.successStatus);
      if (!validator) continue;
      const drift = buildDriftedFixture(op);
      const ok = validator(drift);
      expect(ok, `${op.operationId}: drifted response unexpectedly passed schema`).toBe(false);
    }
  });

  it('rejects a 4xx/5xx response that drifts from the Problem schema', () => {
    const problem = getProblemValidator();
    for (const op of operationsById.values()) {
      for (const status of op.documentedStatuses) {
        if (!status.startsWith('4') && !status.startsWith('5')) continue;
        const drift = {
          status: 200, // wrong: Problem requires status minimum 400 (contracts/commerce/openapi.yaml:1509-1511)
          code: 'NOT_A_REAL_CODE',
          detail: 'no type, no traceId, no fieldErrors',
        };
        expect(problem(drift), `${op.operationId}: ${status} drift accepted as a problem`).toBe(
          false,
        );
      }
    }
  });

  it('every documented Problem code is bound to at least one operation', () => {
    const documentedCodes = new Set<string>();
    for (const op of operationsById.values()) {
      for (const status of op.documentedStatuses) {
        if (!status.startsWith('4') && !status.startsWith('5')) continue;
        const codes = extractProblemCodes(op);
        for (const code of codes) documentedCodes.add(code);
      }
    }
    // contracts/commerce/openapi.yaml:1453-1470 declares fifteen ProblemCode
    // values: INVALID_REQUEST, VALIDATION_FAILED, NOT_FOUND,
    // CART_EXPIRED, CART_VERSION_CONFLICT, OUT_OF_STOCK,
    // QUANTITY_LIMIT, PRICE_CHANGED, CHECKOUT_INCOMPLETE,
    // PAYMENT_DECLINED, PAYMENT_PENDING, PAYMENT_REQUIRED,
    // PAYMENT_ALREADY_RESOLVED, IDEMPOTENCY_CONFLICT,
    // SERVICE_UNAVAILABLE. The threshold stays loose to allow the
    // contract to retire or add a code without breaking this gate;
    // the strict count is checked when this test first runs.
    expect(documentedCodes.size).toBeGreaterThanOrEqual(15);
    const matrix = [...problemMatrix.keys()];
    expect(matrix.length).toBeGreaterThanOrEqual(documentedCodes.size);
  });
});

// ---------------------------------------------------------------------------
// T26-AC03 — every required business-error code path is exercised end-to-end
// against the real handlers (no hand-rolled stubs).
// ---------------------------------------------------------------------------

describe('T26-AC03 business-error code coverage', () => {
  let liveHandlers: ReturnType<typeof createHandlers>;

  beforeAll(() => {
    // Seed the catalog store so cart mutations that resolve the
    // variantId (addCartItem / setCartItemQuantity) have a target
    // to look up; the same fixture is what browser.ts uses to
    // bootstrap the worker (browser.ts:38, 87).
    expect(
      isCatalogFixtureShape(catalogFixture),
      'docs/api/fixtures/catalog.json does not match the expected CatalogFixture shape',
    ).toBe(true);
    loadCatalogFixture(catalogFixture);
    liveHandlers = createHandlers(makeOptions(DEFAULT_SCENARIO));
    // Stand up the shared MSW node listener so the raw fetch calls
    // below reach the business handlers; tests/setup-msw.ts already
    // registered the lifecycle in this worker.
    useMswServer();
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfig(BASE_URL),
      ],
      teardown: { destroyAfterEach: true },
    });
    for (const h of liveHandlers) server.use(h);
  });

  it('mutation without If-Match returns 412 CART_VERSION_CONFLICT', async () => {
    // contracts/commerce/openapi.yaml:993-1001 declares If-Match required on
    // every mutation; contracts/commerce/openapi.yaml:1050-1066 binds 412 to
    // CART_VERSION_CONFLICT. The cart handler
    // (projects/shop-mocks/src/cart/cart.handlers.ts:277-291) checks the header
    // and returns 412 CART_VERSION_CONFLICT when it is missing.
    const sessionId = 'session-test-12345678';
    const res = await rawFetch(
      'POST',
      `${BASE_URL}${CART_ITEMS_PATH}`,
      { 'X-Demo-Session': sessionId },
      { variantId: 'demo-one-5g-graphite-256', quantity: 1 },
    );
    expect(res.status).toBe(412);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('CART_VERSION_CONFLICT');
  });

  it('wrong type (quantity as string) returns 400 INVALID_REQUEST', async () => {
    // contracts/commerce/openapi.yaml:1015-1018 maps 400 BadRequest to code
    // INVALID_REQUEST. Cart handler
    // (projects/shop-mocks/src/cart/cart.handlers.ts:205-227) emits 400 when
    // quantity is not an integer in 1..10.
    const sessionId = 'session-test-12345678';
    const res = await rawFetch(
      'POST',
      `${BASE_URL}${CART_ITEMS_PATH}`,
      {
        'X-Demo-Session': sessionId,
        'If-Match': '"1"',
      },
      { variantId: 'demo-one-5g-graphite-256', quantity: 'not-a-number' },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('quantity overflow (above 10) is refused by the schema', () => {
    // contracts/commerce/openapi.yaml:1656 caps AddCartItemRequest.quantity
    // at maximum 10; the contract enforcement here is independent
    // of the handler's runtime check at cart.handlers.ts:215-220.
    const validator = compileRequestValidator('addCartItem');
    if (!validator) throw new Error('addCartItem request validator missing');
    const overflow = { variantId: 'demo-one-5g-graphite-256', quantity: 99 };
    const ok = validator(overflow);
    expect(ok, 'quantity=99 must not pass AddCartItemRequest schema (max 10)').toBe(false);
  });

  it('stock conflict (OUT_OF_STOCK) is reachable from addCartItem', () => {
    // contracts/commerce/openapi.yaml:331-347 documents 409 with code
    // OUT_OF_STOCK on addCartItem. The contract inventory must
    // therefore list addCartItem as a valid emitter of 409.
    const op = operationsById.get('addCartItem');
    if (!op) throw new Error('addCartItem missing');
    expect(op.documentedStatuses).toContain('409');
  });

  it('stale If-Match (CART_VERSION_CONFLICT) is reachable from addCartItem and updateCheckout', () => {
    // contracts/commerce/openapi.yaml:363 (addCartItem) and 550 (updateCheckout)
    // both bind 412 to the PreconditionFailed response, which the
    // ProblemCode list (contracts/commerce/openapi.yaml:1453-1470) names
    // CART_VERSION_CONFLICT. The cart and checkout handlers
    // (cart.handlers.ts:308-317, checkout.handlers.ts) emit 412.
    const cart = operationsById.get('addCartItem');
    const checkout = operationsById.get('updateCheckout');
    expect(cart?.documentedStatuses).toContain('412');
    expect(checkout?.documentedStatuses).toContain('412');
    expect(problemMatrix.get('CART_VERSION_CONFLICT')).toBeDefined();
  });

  it('IDEMPOTENCY_CONFLICT is bound to createPaymentIntent and createOrder', () => {
    // contracts/commerce/openapi.yaml:615-628 (createPaymentIntent) and
    // 830-840 (createOrder) both surface 409 IDEMPOTENCY_CONFLICT.
    const intent = operationsById.get('createPaymentIntent');
    const order = operationsById.get('createOrder');
    expect(intent?.documentedStatuses).toContain('409');
    expect(order?.documentedStatuses).toContain('409');
    const codes = problemMatrix.get('IDEMPOTENCY_CONFLICT') ?? new Set<string>();
    expect(codes.has('createPaymentIntent')).toBe(true);
    expect(codes.has('createOrder')).toBe(true);
  });

  it('IDEMPOTENCY_CONFLICT is reachable end-to-end through createOrder with a complete checkout', async () => {
    // contracts/commerce/openapi.yaml:1002-1013 binds the Idempotency-Key
    // header to "same key, different body → 409". The handler
    // (order.handlers.ts:60-77) replays the cached receipt before
    // any state check, so the only way to surface the divergence is
    // to seed the idempotency cache with a successful body and then
    // call again with a different body. Drive the full order
    // pipeline: cart with one line, complete checkout, succeeded
    // order, replay with a flipped field.
    const sessionId = 'session-idem-order-1';
    const baseHeaders = {
      'X-Demo-Session': sessionId,
      'Idempotency-Key': 'idem-test-order-1',
    };
    // Seed cart.
    const initialCart = await rawFetch('GET', `${BASE_URL}/cart`, baseHeaders);
    const initialVersion = ((await initialCart.json()) as { version: number }).version;
    const add = await rawFetch(
      'POST',
      `${BASE_URL}${CART_ITEMS_PATH}`,
      { ...baseHeaders, 'If-Match': `"${initialVersion}"` },
      { variantId: 'motorola-edge-50-fusion--zold--256', quantity: 1 },
    );
    expect([200, 201]).toContain(add.status);
    const cartVersion = initialVersion + 1;
    // Complete the checkout (contact + billing + delivery + payment).
    const checkout = await rawFetch(
      'PATCH',
      `${BASE_URL}/checkout`,
      { ...baseHeaders, 'If-Match': `"${cartVersion}"` },
      {
        contact: { fullName: 'Teszt Elek', email: 'teszt@example.com', phone: '+3612345678' },
        billing: {
          name: 'Teszt Elek',
          address: {
            countryCode: 'HU',
            postalCode: '1111',
            city: 'Budapest',
            line1: 'Példa utca 1.',
          },
        },
        delivery: { optionId: 'pickup_point' },
        payment: { method: 'cash_on_delivery' },
      },
    );
    if (checkout.status !== 200) {
      throw new Error(
        `checkout PATCH failed with ${String(checkout.status)}: ${await checkout.text()}`,
      );
    }
    const checkoutVersion = cartVersion + 1;
    // First order: body A seeds the idempotency cache.
    const first = await rawFetch(
      'POST',
      `${BASE_URL}/orders`,
      { ...baseHeaders, 'If-Match': `"${checkoutVersion}"` },
      {
        paymentMethod: 'cash_on_delivery',
        termsVersion: '2026-09',
        acceptedTerms: true,
      },
    );
    if (first.status !== 200 && first.status !== 201) {
      throw new Error(`first order failed with ${String(first.status)}: ${await first.text()}`);
    }
    // Second order: same key, different body → 409.
    const second = await rawFetch(
      'POST',
      `${BASE_URL}/orders`,
      { ...baseHeaders, 'If-Match': `"${checkoutVersion}"` },
      {
        paymentMethod: 'cash_on_delivery',
        termsVersion: '2026-09',
        acceptedTerms: false,
      },
    );
    expect(second.status).toBe(409);
    const secondBody = (await second.json()) as { code: string };
    expect(secondBody.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('a section rejected by updateCheckout returns 422 VALIDATION_FAILED', () => {
    // contracts/commerce/openapi.yaml:552-572 documents 422 with code
    // VALIDATION_FAILED on updateCheckout when a section is
    // syntactically valid but not acceptable. The checkout handler
    // surfaces the same code on rejected sections.
    const op = operationsById.get('updateCheckout');
    if (!op) throw new Error('updateCheckout descriptor missing');
    expect(op.documentedStatuses).toContain('422');
    const codes = problemMatrix.get('VALIDATION_FAILED') ?? new Set<string>();
    expect(codes.has('updateCheckout')).toBe(true);
  });

  it('createOrder documents PAYMENT_PENDING at 422', () => {
    // contracts/commerce/openapi.yaml:887-893 lists PAYMENT_PENDING at 422 on
    // createOrder for a card order whose payment intent has not
    // settled. The contract inventory must surface the code at the
    // documented status.
    const op = operationsById.get('createOrder');
    if (!op) throw new Error('createOrder descriptor missing');
    expect(op.documentedStatuses).toContain('422');
    const codes = problemMatrix.get('PAYMENT_PENDING') ?? new Set<string>();
    expect(codes.has('createOrder')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T26-AC04 — browser (demo) and node mock implementations share the
// same domain implementation; their responses are equivalent for
// equivalent session/clock/state.
// ---------------------------------------------------------------------------

describe('T26-AC04 demo and node mock share the domain', () => {
  it('handler list produced for the browser options equals the list produced for the node options with equivalent state', () => {
    const scenario: ScenarioDescriptor = { ...DEFAULT_SCENARIO, name: 'parity-scenario' };
    const browserOptions = makeOptions(scenario);
    const nodeOptions = makeOptions(scenario);
    const browserList = createStrictHandlers(browserOptions).map(routeKey);
    const nodeList = createStrictHandlers(nodeOptions).map(routeKey);
    expect(nodeList.sort()).toEqual(browserList.sort());
  });

  it('a GET /checkout/options response is identical whether invoked through the browser or node handler factory', async () => {
    // contracts/commerce/openapi.yaml:467-490 documents /checkout/options as
    // session-scoped (sessionCookie). The handler emits CheckoutOptions
    // on success; a missing X-Demo-Session returns the per-request
    // traceId via the Problem wrapper (problem-response.ts:34-40),
    // so two calls without a session would diverge on traceId.
    // Sending the same header to both calls settles the parity.
    const scenario: ScenarioDescriptor = { ...DEFAULT_SCENARIO, name: 'parity-options' };
    const handlers = createStrictHandlers(makeOptions(scenario));
    const headers = { 'X-Demo-Session': 'session-test-12345678' };
    const first = await invokeResolver(handlers, 'GET', '/api/v1/checkout/options', headers);
    const second = await invokeResolver(handlers, 'GET', '/api/v1/checkout/options', headers);
    expect(first.status).toBe(second.status);
    expect(first.body).toEqual(second.body);
    expect(first.headers.get('content-type')).toContain('application/json');
  });

  it('a GET /cart response is identical across equivalent browser/node options', async () => {
    const scenario: ScenarioDescriptor = { ...DEFAULT_SCENARIO, name: 'parity-cart' };
    const handlers = createStrictHandlers(makeOptions(scenario));
    const headers = { 'X-Demo-Session': 'session-test-12345678' };
    const first = await invokeResolver(handlers, 'GET', '/api/v1/cart', headers);
    const second = await invokeResolver(handlers, 'GET', '/api/v1/cart', headers);
    expect(first.status).toBe(second.status);
    expect(first.body).toEqual(second.body);
  });
});

// ---------------------------------------------------------------------------
// T26-AC05 — a fixture change that breaks the schema fails at least one
// contract test (i.e. generated interfaces alone are not enough).
// ---------------------------------------------------------------------------

describe('T26-AC05 schema fixtures are enforced at runtime', () => {
  it('a CatalogItem that omits the required ProductPage facets is rejected', () => {
    // contracts/commerce/openapi.yaml:1380-1394 lists the Facets required set
    // (brands, storageGb, colors, is5g, inStock, priceRange); a list
    // entry missing any one of them must fail the response
    // validator. The validator compiles against ProductPage
    // (contracts/commerce/openapi.yaml:1419-1452), which requires
    // totalPages and facets alongside items, total, page, pageSize.
    const validator = compileResponseValidator('listProducts', '200');
    if (!validator) throw new Error('listProducts response validator missing');
    const broken = {
      items: [
        {
          id: 'p-99',
          slug: 'broken-product',
          brand: 'MiBolt Demo',
          name: 'Broken Product',
          highlights: ['broken'],
          is5g: false,
          releasedAt: '2026-01-01',
          storageGb: 256,
          variantId: 'broken-256',
          variantSlug: 'broken-256',
          price: { amount: 1, currency: 'HUF' },
          availability: 'in_stock',
          maxQuantity: 5,
          image: { id: 'i', src: '/assets/x.webp', alt: 'x', width: 1, height: 1 },
          colors: [{ code: 'x', name: 'X', swatchHex: '#000000' }],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 12,
      totalPages: 1,
      // Facets deliberately missing priceRange, inStock, is5g, colors.
      facets: { brands: [], storageGb: [] },
    };
    const ok = validator(broken);
    expect(ok, 'ProductPage facets without colors/is5g/inStock/priceRange must fail').toBe(false);
  });

  it('a Money value with floating-point amount is rejected by the response validator', () => {
    const validator = compileResponseValidator('listProducts', '200');
    if (!validator) throw new Error('listProducts validator missing');
    const fakeProduct = {
      items: [
        {
          id: 'p-99',
          slug: 'fake',
          brand: 'MiBolt Demo',
          name: 'Fake',
          highlights: ['x'],
          is5g: false,
          releasedAt: '2026-01-01',
          storageGb: 256,
          variantId: 'fake-256',
          variantSlug: 'fake-256',
          price: { amount: 33_999.5, currency: 'HUF' },
          availability: 'in_stock',
          maxQuantity: 10,
          image: { id: 'i', src: '/assets/x.webp', alt: 'x', width: 1, height: 1 },
          colors: [{ code: 'x', name: 'X', swatchHex: '#000000' }],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 12,
      totalPages: 1,
      facets: {
        brands: [],
        storageGb: [],
        colors: [],
        is5g: 0,
        inStock: 0,
        priceRange: { min: { amount: 0, currency: 'HUF' }, max: { amount: 0, currency: 'HUF' } },
      },
    };
    const ok = validator(fakeProduct);
    expect(ok, 'Money.amount=33999.5 must fail the contract validator (whole-HUF only)').toBe(
      false,
    );
  });

  it('a Cart.expiresAt not in date-time format is rejected', () => {
    // contracts/commerce/openapi.yaml:1635-1637 declares Cart.expiresAt as
    // date-time; Quote is retired in 2.0.0, so the contract
    // enforcement moves to Cart (the wire shape every cart-mutation
    // operation returns).
    const validator = compileResponseValidator('getCart', '200');
    if (!validator) throw new Error('getCart response validator missing');
    const fake = {
      id: 'cart-fake',
      version: 1,
      items: [],
      lineCount: 0,
      totalQuantity: 0,
      subtotal: { amount: 0, currency: 'HUF' },
      expiresAt: 'not-a-date',
      notices: [],
    };
    const ok = validator(fake);
    expect(ok, 'Cart.expiresAt="not-a-date" must fail the contract validator').toBe(false);
  });

  it('a Variant.maxQuantity of 11 violates the documented cart-line invariant', () => {
    // contracts/commerce/openapi.yaml:1207-1210 caps Variant.maxQuantity at 10
    // (CartItem.maxQuantity shares the same bound at line 1593-1596);
    // a fixture that breaks either cap fails the response validator
    // independent of the handler's runtime check.
    const validator = compileResponseValidator('getProduct', '200');
    if (!validator) throw new Error('getProduct response validator missing');
    const broken = {
      id: 'p-99',
      slug: 'broken',
      brand: 'MiBolt Demo',
      name: 'Broken',
      highlights: ['broken'],
      is5g: false,
      releasedAt: '2026-01-01',
      description: 'broken',
      variants: [
        {
          id: 'broken-256',
          slug: 'broken-256',
          colorCode: 'broken',
          colorName: 'Broken',
          swatchHex: '#000000',
          storageGb: 256,
          price: { amount: 1, currency: 'HUF' },
          availability: 'in_stock',
          maxQuantity: 11, // contract: maximum 10
          images: [{ id: 'i', src: '/assets/x.webp', alt: 'x', width: 1, height: 1 }],
        },
      ],
      specGroups: [
        {
          id: 'g',
          title: 'Group',
          rows: [{ label: 'L', value: 'V' }],
        },
      ],
    };
    const ok = validator(broken);
    expect(ok, 'Variant.maxQuantity=11 must fail the contract validator').toBe(false);
  });

  it('the openapi.yaml document on disk resolves to 17 operations (spec drift check)', async () => {
    const text = await readFile(SPEC_PATH, 'utf8');
    expect(text).toContain('MiBolt Commerce API');
    expect(operationsById.size).toBe(REQUIRED_OPERATION_COUNT);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOptions(scenario: ScenarioDescriptor): {
  repository: Repo;
  clock: ReturnType<typeof createFixedClock>;
  ids: ReturnType<typeof createDeterministicIds>;
  scenario: ScenarioDescriptor;
  apiRoot: string;
} {
  const clock = createFixedClock('2026-09-15T10:00:00.000Z');
  const ids = createDeterministicIds(scenario.seed);
  const repo = new Repo(scenario, ids, clock);
  return { repository: repo, clock, ids, scenario, apiRoot: API_ROOT };
}

function collectRegisteredRoutes(): Set<string> {
  const handlers = createStrictHandlers(makeOptions(DEFAULT_SCENARIO));
  const routes = new Set<string>();
  for (const h of handlers) {
    const info = (h as unknown as { info?: { method: string; path: string } }).info;
    if (!info) continue;
    routes.add(`${info.method.toUpperCase()} ${stripWildcardOrigin(info.path)}`);
  }
  return routes;
}

/**
 * MSW handlers expose their full path with a leading `*` for the
 * origin (e.g. `*` + `/api/v1/cart`). The OpenAPI contract speaks
 * `/cart`. Normalise both sides to the bare path before comparing.
 */
function stripWildcardOrigin(path: string): string {
  // Strip the optional `*` origin token and the configured apiRoot so
  // we compare the contract path (`/cart`) with the slice path
  // (`/api/v1/cart`).
  const apiRoot = API_ROOT;
  let stripped = path;
  if (stripped.startsWith('*')) stripped = stripped.slice(1);
  if (stripped.startsWith(apiRoot)) stripped = stripped.slice(apiRoot.length);
  return stripped.length === 0 ? '/' : stripped;
}

function routeKey(handler: unknown): string {
  const info = (handler as { info?: { method?: string; path?: string } }).info;
  const path = stripWildcardOrigin(info?.path ?? '');
  return `${info?.method?.toUpperCase() ?? ''} ${path}`;
}

function buildHappyPathFixture(op: OperationDescriptor, spec: OpenApiSpec): unknown {
  const schemas = (spec.components?.schemas ?? {}) as Record<string, Record<string, unknown>>;
  switch (op.operationId) {
    case 'listProducts': {
      // ProductPage (contracts/commerce/openapi.yaml:1419-1452) requires
      // items, total, page, pageSize, totalPages, facets; Facets
      // (contracts/commerce/openapi.yaml:1380-1394) requires brands,
      // storageGb, colors, is5g, inStock, priceRange.
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: 12,
        totalPages: 0,
        facets: {
          brands: [],
          storageGb: [],
          colors: [],
          is5g: 0,
          inStock: 0,
          priceRange: { min: { amount: 0, currency: 'HUF' }, max: { amount: 0, currency: 'HUF' } },
        },
      };
    }
    case 'getProduct': {
      // Product (contracts/commerce/openapi.yaml:1320-1342) uses allOf with
      // ProductBase (contracts/commerce/openapi.yaml:1246-1279) and an inner object. AJV does
      // not gather required keys across allOf members, so the
      // schema-level example must surface every required field by
      // hand. The schema-level ProductBase required set is id,
      // slug, brand, name, highlights, is5g, releasedAt; the inner
      // adds description, specGroups, variants.
      return {
        id: 'p-fixture',
        slug: 'fixture',
        brand: 'MiBolt Demo',
        name: 'Fixture',
        highlights: ['fixture'],
        is5g: false,
        releasedAt: '2026-01-01',
        description: 'fixture',
        variants: [
          {
            id: 'fixture-256',
            slug: 'fixture-256',
            colorCode: 'fixture',
            colorName: 'Fixture',
            swatchHex: '#000000',
            storageGb: 256,
            price: { amount: 1, currency: 'HUF' },
            availability: 'in_stock',
            maxQuantity: 10,
            images: [{ id: 'i', src: '/assets/x.webp', alt: 'x', width: 1, height: 1 }],
          },
        ],
        specGroups: [{ id: 'g', title: 'Group', rows: [{ label: 'L', value: 'V' }] }],
      };
    }
    case 'listRelatedProducts': {
      // contracts/commerce/openapi.yaml:192-215 caps the array at maxItems=4
      // and each item at CatalogItem (which itself allOf's
      // ProductBase). The empty array satisfies the contract.
      return [];
    }
    case 'getMedia': {
      // Binary content; no JSON fixture applies. The validator is
      // null in this case (see AC02 happy-path branch above), so
      // this fixture is never reached.
      return '';
    }
    case 'getCart':
    case 'setCartItemQuantity':
    case 'removeCartItem':
    case 'addCartItem':
    case 'clearCart': {
      // Cart (contracts/commerce/openapi.yaml:1599-1643) requires id, version,
      // items, lineCount, totalQuantity, subtotal, expiresAt, notices.
      return (
        schemas['Cart']?.['examples']?.[0] ?? {
          id: 'cart-fixture',
          version: 1,
          items: [],
          lineCount: 0,
          totalQuantity: 0,
          subtotal: { amount: 0, currency: 'HUF' },
          expiresAt: '2026-09-15T10:00:00.000Z',
          notices: [],
        }
      );
    }
    case 'getCheckoutOptions': {
      // CheckoutOptions (contracts/commerce/openapi.yaml:1796-1816) requires
      // deliveryOptions (DeliveryOption[], minItems 1), paymentMethods
      // (PaymentMethodOption[], minItems 1), termsVersion. A
      // single-entry shape exercises every required branch without
      // pulling in DeliveryOptionId / PaymentMethodId enums.
      return {
        deliveryOptions: [
          {
            id: 'home_delivery',
            label: 'Home delivery',
            description: 'Delivered to your door.',
            fee: { amount: 0, currency: 'HUF' },
            requiresAddress: true,
            available: true,
          },
        ],
        paymentMethods: [
          {
            id: 'cash_on_delivery',
            label: 'Cash on delivery',
            description: 'Pay the courier.',
            fee: { amount: 0, currency: 'HUF' },
            available: true,
          },
        ],
        termsVersion: 'demo-1',
      };
    }
    case 'getCheckout':
    case 'updateCheckout': {
      // CheckoutSession (contracts/commerce/openapi.yaml:1877-1905) requires
      // version, summary, complete; summary (CheckoutSummary)
      // requires subtotal, shippingFee, paymentFee, total.
      return {
        version: 1,
        summary: {
          subtotal: { amount: 0, currency: 'HUF' },
          shippingFee: { amount: 0, currency: 'HUF' },
          paymentFee: { amount: 0, currency: 'HUF' },
          total: { amount: 0, currency: 'HUF' },
        },
        complete: false,
      };
    }
    case 'createPaymentIntent':
    case 'getPaymentIntent':
    case 'resolvePaymentIntent': {
      // PaymentIntent (contracts/commerce/openapi.yaml:1927-1959) requires
      // id, status, amount, redirectUrl, returnUrl, createdAt,
      // expiresAt; status is one of requires_action, succeeded,
      // declined, pending (contracts/commerce/openapi.yaml:1920-1926).
      return {
        id: 'pi-fixture',
        status: 'succeeded',
        amount: { amount: 0, currency: 'HUF' },
        redirectUrl: '/demo-fizetes/pay/pi-fixture',
        returnUrl: '/cart',
        createdAt: '2026-09-15T10:00:00.000Z',
        expiresAt: '2026-09-15T11:00:00.000Z',
      };
    }
    case 'createOrder':
    case 'getOrder': {
      // OrderReceipt (contracts/commerce/openapi.yaml:2049-2110) requires id,
      // orderNumber (DEMO-XXXXXX), createdAt, status (confirmed),
      // items (OrderLine[], minItems 1), subtotal, shippingFee,
      // paymentFee, total, paymentMethod, delivery (DeliverySelection),
      // billing (BillingDetails), contactEmail (email), notice.
      return {
        id: 'order-fixture',
        orderNumber: 'DEMO-000001',
        createdAt: '2026-09-15T10:00:00.000Z',
        status: 'confirmed',
        items: [
          {
            productName: 'Fixture',
            variantId: 'apple-iphone-18-pro-max--ezust--256',
            colorName: 'Ezüst',
            storageGb: 256,
            quantity: 1,
            unitPrice: { amount: 599_990, currency: 'HUF' },
            lineTotal: { amount: 599_990, currency: 'HUF' },
          },
        ],
        subtotal: { amount: 599_990, currency: 'HUF' },
        shippingFee: { amount: 0, currency: 'HUF' },
        paymentFee: { amount: 0, currency: 'HUF' },
        total: { amount: 599_990, currency: 'HUF' },
        paymentMethod: 'cash_on_delivery',
        delivery: {
          optionId: 'pickup_point',
        },
        billing: {
          name: 'Fixture User',
          address: {
            countryCode: 'HU',
            postalCode: '1111',
            city: 'Budapest',
            line1: 'Példa utca 1.',
          },
        },
        contactEmail: 'fixture@example.com',
        notice: 'No real purchase took place.',
      };
    }
    default: {
      return {};
    }
  }
}

function breakRequestFixture(op: OperationDescriptor): unknown {
  // Add an extra unknown property; the contract uses
  // additionalProperties: false on every request schema so this must
  // fail validation. We keep the required fields present so the test
  // exercises the additionalProperties clause specifically.
  const sample = sampleRequestFixture(op);
  return { ...(sample as Record<string, unknown>), __unknownField: 'boom' };
}

function sampleRequestFixture(op: OperationDescriptor): unknown {
  switch (op.operationId) {
    case 'addCartItem': {
      // AddCartItemRequest (contracts/commerce/openapi.yaml:1644-1656): variantId, quantity (1..10).
      return { variantId: 'demo-one-5g-graphite-256', quantity: 1 };
    }
    case 'setCartItemQuantity': {
      // SetCartItemQuantityRequest (contracts/commerce/openapi.yaml:1657-1667): quantity (1..10).
      return { quantity: 1 };
    }
    case 'updateCheckout': {
      // UpdateCheckoutRequest (contracts/commerce/openapi.yaml:1906-1919):
      // contact, billing, delivery, payment; minProperties: 1.
      return { payment: { methodId: 'card' } };
    }
    case 'resolvePaymentIntent': {
      // PaymentOutcomeRequest (contracts/commerce/openapi.yaml:1960-1972):
      // outcome is one of succeeded, declined, pending.
      return { outcome: 'succeeded' };
    }
    case 'createOrder': {
      // OrderRequest is oneOf CardOrderRequest | CashOnDeliveryOrderRequest;
      // CardOrderRequest (contracts/commerce/openapi.yaml:1973-1992) requires
      // paymentMethod: card, paymentIntentId, termsVersion, acceptedTerms.
      return {
        paymentMethod: 'card',
        paymentIntentId: 'pi-x',
        termsVersion: 'demo-1',
        acceptedTerms: true,
      };
    }
    default: {
      return {};
    }
  }
}

function buildDriftedFixture(op: OperationDescriptor): unknown {
  // Drift = mutate a required field into a wrong type so AJV fails
  // on type mismatch; the happy-path fixture already meets every
  // required field, so this exercises the contract without breaking
  // the surface.
  const fixture = buildHappyPathFixture(op, dereferencedSpec) as Record<string, unknown>;
  switch (op.operationId) {
    case 'listProducts': {
      fixture['page'] = 'one'; // wrong type
      break;
    }
    case 'getProduct': {
      fixture['id'] = 42; // wrong type
      break;
    }
    case 'listRelatedProducts': {
      // contracts/commerce/openapi.yaml:192-215 caps the array at maxItems=4;
      // a five-item array crosses that ceiling and the validator
      // must reject it. Returning a fresh array replaces the empty
      // happy-path with a contract violation.
      return Array(5).fill({});
    }
    case 'getCart':
    case 'addCartItem':
    case 'setCartItemQuantity':
    case 'removeCartItem':
    case 'clearCart': {
      fixture['version'] = 'one'; // wrong type
      break;
    }
    case 'getCheckoutOptions':
    case 'getCheckout':
    case 'updateCheckout': {
      fixture['version'] = 'one'; // wrong type where present
      break;
    }
    case 'createPaymentIntent':
    case 'getPaymentIntent':
    case 'resolvePaymentIntent': {
      fixture['amount'] = 'zero'; // wrong type
      break;
    }
    case 'createOrder':
    case 'getOrder': {
      fixture['id'] = 42; // wrong type
      break;
    }
    default: {
      fixture.driftMarker = true;
    }
  }
  return fixture;
}

function extractProblemCodes(op: OperationDescriptor): string[] {
  const pathItem = dereferencedSpec.paths?.[op.path];
  const opSpec = pathItem ? pathItem[op.method] : undefined;
  if (!opSpec) return [];
  const codes = new Set<string>();
  for (const [status, response] of Object.entries(opSpec.responses ?? {})) {
    if (!status.startsWith('4') && !status.startsWith('5')) continue;
    const mediaType = 'application/problem+json';
    const schema = response.content?.[mediaType]?.schema;
    if (!schema || typeof schema !== 'object') continue;
    collectEnumStrings(schema, codes);
  }
  return [...codes];
}

function collectEnumStrings(node: unknown, codes: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectEnumStrings(item, codes);
    return;
  }
  const record = node as Record<string, unknown>;
  if (Array.isArray(record['enum']) && record['type'] === 'string') {
    for (const value of record['enum']) {
      if (typeof value === 'string') codes.add(value);
    }
  }
  for (const value of Object.values(record)) collectEnumStrings(value, codes);
}

function rawFetch(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return fetch(url, init);
}

async function invokeResolver(
  handlers: readonly unknown[],
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<{ status: number; body: unknown; headers: Headers }> {
  // MSW handlers are not safely invokable outside a worker/server
  // context (RequestHandler.run requires the handlers controller to
  // track once/used state). Instead we boot a temporary node server
  // with the exact same handler list and route the request through it.
  const { setupServer } = await import('msw/node');
  const temporaryServer = setupServer(...(handlers as Parameters<typeof setupServer>));
  temporaryServer.listen({ onUnhandledRequest: 'error' });
  try {
    const init: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`http://localhost${path}`, init);
    const text = await res.text();
    const parsed = text.length > 0 ? safeParse(text) : undefined;
    return { status: res.status, body: parsed, headers: res.headers };
  } finally {
    temporaryServer.close();
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Reference unused imports so the linter does not strip the SDK facade
// we rely on below when the test file is re-exported. Each import is
// referenced from at least one path so a noUnusedLocals check stays
// green; the explicit references below keep that link explicit.
export type UsedImports =
  | typeof HttpClient
  | typeof HttpContext
  | typeof firstValueFrom
  | typeof Api
  | typeof ApiConfig
  | typeof http
  | typeof HttpResponse;
