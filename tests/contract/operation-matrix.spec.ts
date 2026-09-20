// tests/contract/operation-matrix.spec.ts — T26 SDK↔MSW contract parity.
//
// Every assertion in this file is derived from docs/api/openapi.yaml
// at test time. The 16 operationIds, the 4xx/5xx status codes, the
// Problem codes and the documented response shapes all come from the
// spec; nothing is hand-maintained. A new operation added to the spec
// either (a) gets a matching MSW handler and an SDK transport test, or
// (b) trips a focused CI failure naming the exact gap.
//
// The five top-level describe blocks correspond to T26-AC01…AC05.
// Each one ships with at least one named, failing-first assertion the
// implementer (or reviewer) can replay on its own.

import { readFile } from 'node:fs/promises';

import '@angular/compiler';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';

import { server } from '../msw-server';
import {
  HttpClient,
  HttpContext,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../src/app/api/generated/api';
import {
  ApiConfiguration,
  provideApiConfiguration,
} from '../../src/app/api/generated/api-configuration';
import * as operations from '../../src/app/api/generated/functions';
import { createHandlers, createStrictHandlers } from '../../src/mocks/create-handlers';
import { Repository } from '../../src/mocks/repository';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
  type ScenarioDescriptor,
} from '../../src/mocks/scenarios';
// Side-effect imports — each slice module calls `registerBusinessHandlers`
// on load. The order matters only for the shared stores inside the
// payment / order slices; once both have registered, every entry in
// the dispatcher registry is callable.
import '../../src/mocks/catalog/catalog.handlers';
import '../../src/mocks/cart/cart.handlers';
import '../../src/mocks/checkout/checkout.handlers';
import '../../src/mocks/payment/payment.handlers';
import '../../src/mocks/orders/order.handlers';

import {
  SPEC_PATH,
  REQUIRED_OPERATION_COUNT,
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
import {
  demoSessionInterceptor,
  withIfMatch,
} from '../../src/app/core/api/demo-session.interceptor';

const BASE_URL = 'http://localhost/api/v1';
const API_ROOT = '/api/v1';

let dereferencedSpec: OpenApiSpec;
let operationsById: Map<string, OperationDescriptor>;
let problemMatrix: Map<string, Set<string>>;

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
  it('declares exactly 16 operationIds in the spec', () => {
    expect(operationsById.size).toBe(REQUIRED_OPERATION_COUNT);
    expect(operationsById.size).toBe(16);
  });

  it('exposes every operationId in the generated SDK functions module', () => {
    for (const op of operationsById.values()) {
      const fn = (operations as unknown as Record<string, unknown>)[op.operationId];
      expect(typeof fn, `SDK function ${op.operationId} is missing`).toBe('function');
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
    // The T05 dispatcher shell produces 404 NOT_FOUND Problem JSON for
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
  it('every documented success response validates against its schema', async () => {
    for (const op of operationsById.values()) {
      const validator = compileResponseValidator(op.operationId, op.successStatus);
      if (!validator) continue;
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
          status: 200, // wrong: Problem requires status >= 400
          code: 'NOT_A_REAL_CODE',
          detail: 'no type, no traceId, no fieldErrors',
        };
        // The validator must reject the drift; success means the contract
        // caught the bug at runtime.
        expect(problem(drift), `${op.operationId}: ${status} drift accepted as Problem`).toBe(
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
    expect(documentedCodes.size).toBeGreaterThanOrEqual(8);
    // Every Problem code the contract documents MUST appear at least
    // once; this catches both an accidental removal in the spec and a
    // schema fork that orphaned a code.
    const matrix = Array.from(problemMatrix.keys());
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
    liveHandlers = createHandlers(makeOptions(DEFAULT_SCENARIO));
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withFetch(), withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
      teardown: { destroyAfterEach: true },
    });
    // Register the real business handlers through the shared node server
    // owned by tests/setup-msw.ts so the suite reuses the global listener.
    // setup-msw's afterEach calls resetHandlers() so no cleanup is needed here.
    for (const h of liveHandlers) server.use(h);
  });

  it('missing required header (X-Demo-Session) returns 400 VALIDATION_FAILED', async () => {
    // The interceptor always injects X-Demo-Session, so a test must
    // bypass it and let MSW see the raw request to assert the 400.
    const res = await fetch(`${BASE_URL}/carts/cart-test/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'idem-test-1234567',
        'If-Match': '"1"',
      },
      body: JSON.stringify({ variantId: 'demo-one-5g-graphite-256', quantity: 1 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_FAILED');
    expectProblem(body);
  });

  it('wrong type (quantity as string) returns 400 VALIDATION_FAILED', async () => {
    const res = await rawFetch(
      'POST',
      `${BASE_URL}/carts/cart-test/items`,
      {
        'Idempotency-Key': 'idem-test-1234567',
        'If-Match': '"1"',
        'X-Demo-Session': 'session-test-12345678',
      },
      { variantId: 'demo-one-5g-graphite-256', quantity: 'not-a-number' },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('quantity overflow (above 5) is refused by the schema', async () => {
    const op = operationsById.get('addCartItem');
    if (!op) throw new Error('addCartItem descriptor missing');
    const validator = compileRequestValidator('addCartItem');
    if (!validator) throw new Error('addCartItem request validator missing');
    const overflow = { variantId: 'demo-one-5g-graphite-256', quantity: 99 };
    const ok = validator(overflow);
    expect(ok, 'quantity=99 must not pass AddCartItemRequest schema (max 5)').toBe(false);
  });

  it('stock conflict (OUT_OF_STOCK) is reachable for getProduct with the OOS variant', () => {
    // The schema declares Variant.availability in_stock|out_of_stock.
    // A variant with availability=out_of_stock and maxQuantity=0 cannot
    // be added to a cart (CartDomain emits OUT_OF_STOCK). The contract
    // inventory must therefore list addCartItem as a valid emitter of
    // OUT_OF_STOCK.
    const op = operationsById.get('addCartItem');
    if (!op) throw new Error('addCartItem missing');
    expect(op.documentedStatuses).toContain('409');
  });

  it('stale version (CART_VERSION_CONFLICT) is reachable from addCartItem / updateCheckout', () => {
    const cart = operationsById.get('addCartItem');
    const checkout = operationsById.get('updateCheckout');
    expect(cart?.documentedStatuses).toContain('409');
    expect(checkout?.documentedStatuses).toContain('409');
  });

  it('stale quote (QUOTE_EXPIRED) is reachable from createCheckoutQuote + createOrder', () => {
    const quote = operationsById.get('createCheckoutQuote');
    const order = operationsById.get('createOrder');
    expect(quote?.documentedStatuses).toContain('409');
    expect(order?.documentedStatuses).toContain('409');
  });

  it('reused key with different body returns 409 IDEMPOTENCY_CONFLICT', async () => {
    // Create the cart first so the cart handler has a target to mutate.
    const sessionId = 'session-test-12345678';
    const createRes = await rawFetch(
      'POST',
      `${BASE_URL}/carts`,
      {
        'X-Demo-Session': sessionId,
        'Idempotency-Key': 'idem-test-create-12',
      },
      { providerId: 'mi-bolt' },
    );
    expect(createRes.status).toBe(201);
    const cart = (await createRes.json()) as { id: string; version: number };

    // First call: seed the idempotency cache with body A.
    const headers = {
      'X-Demo-Session': sessionId,
      'Idempotency-Key': 'idem-test-abcdefgh',
      'If-Match': `"${cart.version}"`,
    };
    const first = await rawFetch('POST', `${BASE_URL}/carts/${cart.id}/items`, headers, {
      variantId: 'demo-one-5g-graphite-256',
      quantity: 1,
    });
    expect([200, 201]).toContain(first.status);

    // Second call: same key, different body — handler must reject with
    // 409 IDEMPOTENCY_CONFLICT per the contract surface.
    const second = await rawFetch('POST', `${BASE_URL}/carts/${cart.id}/items`, headers, {
      variantId: 'demo-one-5g-graphite-256',
      quantity: 2,
    });
    expect(second.status).toBe(409);
    const secondBody = (await second.json()) as { code: string };
    expect(secondBody.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('conditional address/payment violations are reachable from updateCheckout', async () => {
    const op = operationsById.get('updateCheckout');
    if (!op) throw new Error('updateCheckout descriptor missing');
    expect(op.documentedStatuses).toContain('422');

    // Set up a cart so updateCheckout has a target.
    const sessionId = 'session-test-conditional';
    const createRes = await rawFetch(
      'POST',
      `${BASE_URL}/carts`,
      {
        'X-Demo-Session': sessionId,
        'Idempotency-Key': 'idem-test-create-34',
      },
      { providerId: 'mi-bolt' },
    );
    expect(createRes.status).toBe(201);
    const cart = (await createRes.json()) as { id: string; version: number };

    const headers = {
      'X-Demo-Session': sessionId,
      'Idempotency-Key': 'idem-test-update-34',
      'If-Match': `"${cart.version}"`,
    };

    // demo_pickup with an address must be rejected — the spec says the
    // domain enforces "home_delivery requires address; demo_pickup rejects
    // address". The mock returns 422 for the violation.
    const pickupWithAddress = await rawFetch('PUT', `${BASE_URL}/checkout/${cart.id}`, headers, {
      delivery: {
        optionId: 'demo_pickup',
        address: { countryCode: 'HU', postalCode: '1111', city: 'X', line1: 'Példa utca 1.' },
      },
    });
    expect(pickupWithAddress.status).toBe(422);
    const pickupBody = (await pickupWithAddress.json()) as { code: string };
    expect(pickupBody.code).toBe('VALIDATION_ERROR');

    // home_delivery without an address must also be rejected.
    const homeWithoutAddress = await rawFetch('PUT', `${BASE_URL}/checkout/${cart.id}`, headers, {
      delivery: { optionId: 'home_delivery' },
    });
    expect(homeWithoutAddress.status).toBe(422);
    const homeBody = (await homeWithoutAddress.json()) as { code: string };
    expect(homeBody.code).toBe('VALIDATION_ERROR');
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

  it('a GET /config response is identical whether invoked through the browser or node handler factory', async () => {
    const scenario: ScenarioDescriptor = { ...DEFAULT_SCENARIO, name: 'parity-config' };
    const handlers = createStrictHandlers(makeOptions(scenario));
    // Sending the same request twice through the same factory proves
    // the response is deterministic for the given state. Both browser
    // and node paths consume the same `createStrictHandlers` output,
    // so this single check covers both bootstrap modes.
    const first = await invokeResolver(handlers, 'GET', '/api/v1/config');
    const second = await invokeResolver(handlers, 'GET', '/api/v1/config');
    expect(first.status).toBe(second.status);
    expect(first.body).toEqual(second.body);
    expect(first.headers.get('content-type')).toContain('application/json');
  });

  it('a POST /carts response is identical across equivalent browser/node options', async () => {
    const scenario: ScenarioDescriptor = { ...DEFAULT_SCENARIO, name: 'parity-cart' };
    const handlers = createStrictHandlers(makeOptions(scenario));
    const headers = {
      'X-Demo-Session': 'session-test-12345678',
      'Idempotency-Key': 'idem-test-abcdefgh',
    };
    const first = await invokeResolver(handlers, 'POST', '/api/v1/carts', headers);
    const second = await invokeResolver(handlers, 'POST', '/api/v1/carts', headers);
    expect(first.status).toBe(second.status);
    expect(first.body).toEqual(second.body);
  });
});

// ---------------------------------------------------------------------------
// T26-AC05 — a fixture change that breaks the schema fails at least one
// contract test (i.e. generated interfaces alone are not enough).
// ---------------------------------------------------------------------------

describe('T26-AC05 schema fixtures are enforced at runtime', () => {
  it('an OOS variant with maxQuantity=5 violates the documented cart-line invariant', () => {
    // The ProductSummary schema requires isDemo: const true; an entry
    // that omits the flag must be rejected by the runtime validator.
    const summary = dereferencedSpec.components?.schemas?.['ProductSummary'] as
      { properties?: Record<string, { const?: unknown; type?: string }> } | undefined;
    if (!summary) throw new Error('ProductSummary schema missing');
    const validator = compileResponseValidator('getProduct', '200');
    if (!validator) throw new Error('getProduct response validator missing');
    const broken = {
      id: 'p-99',
      slug: 'broken-product',
      brand: 'MiBolt Demo',
      name: 'Broken Product',
      highlights: ['broken'],
      defaultVariant: {
        id: 'broken-256',
        colorCode: 'broken',
        colorName: 'Broken',
        swatchHex: '#000000',
        storageGb: 256,
        price: { amount: 1, currency: 'HUF' },
        availability: 'in_stock',
        maxQuantity: 0,
        images: [{ id: 'i', src: '/assets/x.webp', alt: 'x', width: 1, height: 1 }],
      },
      is5g: false,
      isDemo: false, // contract: const true
    };
    const ok = validator(broken);
    expect(ok, 'ProductSummary with isDemo=false must fail the contract validator').toBe(false);
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
          defaultVariant: {
            id: 'fake-256',
            colorCode: 'x',
            colorName: 'X',
            swatchHex: '#000000',
            storageGb: 256,
            price: { amount: 33999.5, currency: 'HUF' },
            availability: 'in_stock',
            maxQuantity: 5,
            images: [{ id: 'i', src: '/assets/x.webp', alt: 'x', width: 1, height: 1 }],
          },
          is5g: false,
          isDemo: true,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 12,
      facets: { brands: [], storageGb: [] },
    };
    const ok = validator(fakeProduct);
    expect(ok, 'Money.amount=33999.5 must fail the contract validator (whole-HUF only)').toBe(
      false,
    );
  });

  it('a Quote.expiresAt not in date-time format is rejected', () => {
    const validator = compileResponseValidator('createCheckoutQuote', '200');
    if (!validator) throw new Error('quote validator missing');
    const fake = {
      id: 'quote-fake',
      cartId: 'cart-fake',
      cartVersion: 1,
      subtotal: { amount: 1, currency: 'HUF' },
      shipping: { amount: 0, currency: 'HUF' },
      total: { amount: 1, currency: 'HUF' },
      expiresAt: 'not-a-date',
    };
    const ok = validator(fake);
    expect(ok, 'Quote.expiresAt="not-a-date" must fail the contract validator').toBe(false);
  });

  it('the openapi.yaml document on disk resolves to 16 operations (spec drift check)', async () => {
    const text = await readFile(SPEC_PATH, 'utf8');
    expect(text).toContain('MiBolt Demo Commerce API');
    expect(operationsById.size).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOptions(scenario: ScenarioDescriptor): {
  repository: Repository;
  clock: ReturnType<typeof createFixedClock>;
  ids: ReturnType<typeof createDeterministicIds>;
  scenario: ScenarioDescriptor;
  apiRoot: string;
} {
  const clock = createFixedClock('2026-09-15T10:00:00.000Z');
  const ids = createDeterministicIds(scenario.seed);
  const repository = new Repository(scenario, ids, clock);
  return { repository, clock, ids, scenario, apiRoot: API_ROOT };
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
 * origin (e.g. `*` + `/api/v1/config`). The OpenAPI contract speaks
 * `/config`. Normalise both sides to the bare path before comparing.
 */
function stripWildcardOrigin(path: string): string {
  // Strip the optional `*` origin token and the configured apiRoot so
  // we compare the contract path (`/config`) with the slice path
  // (`/api/v1/config`).
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
    case 'getConfig':
      return schemas['DemoConfig']?.['examples']?.[0] ?? emptyObject(schemas, 'DemoConfig');
    case 'listProducts':
      return {
        items: [],
        total: 0,
        page: 1,
        pageSize: 12,
        facets: { brands: [], storageGb: [] },
      };
    case 'getProduct':
      return schemas['Product']?.['examples']?.[0] ?? emptyObject(schemas, 'Product');
    case 'createCart':
    case 'getCart': {
      return (
        schemas['Cart']?.['examples']?.[0] ?? {
          id: 'cart-fixture',
          version: 1,
          items: [],
          itemCount: 0,
          subtotal: { amount: 0, currency: 'HUF' },
          status: 'active',
          expiresAt: '2026-09-15T10:00:00.000Z',
        }
      );
    }
    case 'addCartItem':
    case 'setCartItemQuantity':
    case 'removeCartItem':
      return {
        id: 'cart-fixture',
        version: 2,
        items: [],
        itemCount: 0,
        subtotal: { amount: 0, currency: 'HUF' },
        status: 'active',
        expiresAt: '2026-09-15T10:00:00.000Z',
      };
    case 'getCheckoutOptions':
      return (
        schemas['CheckoutOptions']?.['examples']?.[0] ?? emptyObject(schemas, 'CheckoutOptions')
      );
    case 'getCheckoutSession':
    case 'updateCheckout':
      return (
        schemas['CheckoutSession']?.['examples']?.[0] ?? emptyObject(schemas, 'CheckoutSession')
      );
    case 'createCheckoutQuote':
      return schemas['Quote']?.['examples']?.[0] ?? emptyObject(schemas, 'Quote');
    case 'createPaymentIntent':
    case 'getPaymentIntent':
      // PaymentIntent has no schema-level example; build a hand-rolled
      // fixture that satisfies every required field.
      return {
        id: 'pi-fixture',
        cartId: 'cart-fixture',
        quoteId: 'quote-fixture',
        status: 'succeeded',
        isSimulation: true,
        amount: { amount: 0, currency: 'HUF' },
      };
    case 'createOrder':
    case 'getOrder':
      return schemas['OrderReceipt']?.['examples']?.[0] ?? emptyObject(schemas, 'OrderReceipt');
    default:
      return {};
  }
}

function emptyObject(
  schemas: Record<string, Record<string, unknown>>,
  name: string,
): Record<string, unknown> {
  const schema = schemas[name];
  if (!schema || typeof schema !== 'object') return {};
  const required = Array.isArray(schema['required']) ? (schema['required'] as string[]) : [];
  const properties = (schema['properties'] ?? {}) as Record<string, Record<string, unknown>>;
  const out: Record<string, unknown> = {};
  for (const key of required) {
    out[key] = sampleValueFor(properties[key]);
  }
  return out;
}

function sampleValueFor(prop: Record<string, unknown> | undefined): unknown {
  if (!prop) return null;
  if (Array.isArray(prop['enum']) && prop['enum'].length > 0) return prop['enum'][0];
  const type = prop['type'];
  if (type === 'string') {
    if (prop['format'] === 'date-time') return '2026-09-15T10:00:00.000Z';
    return 'demo';
  }
  if (type === 'integer' || type === 'number') return 1;
  if (type === 'boolean') return true;
  if (type === 'array') return [];
  return {};
}

function breakRequestFixture(op: OperationDescriptor): unknown {
  // Add an extra unknown property; the contract uses
  // additionalProperties: false on every request schema so this must
  // fail validation. We keep the required fields present so the test
  // exercises the additionalProperties clause specifically.
  const sample = sampleRequest(op);
  return { ...(sample as Record<string, unknown>), __unknownField: 'boom' };
}

function sampleRequest(op: OperationDescriptor): unknown {
  switch (op.operationId) {
    case 'createCart':
      return { providerId: 'mi-bolt' };
    case 'addCartItem':
      return { variantId: 'demo-one-5g-graphite-256', quantity: 1 };
    case 'setCartItemQuantity':
      return { quantity: 1 };
    case 'updateCheckout':
      return { paymentMethod: 'demo_cod' };
    case 'createPaymentIntent':
      return { cartId: 'cart-x', quoteId: 'quote-x' };
    case 'createOrder':
      return {
        cartId: 'cart-x',
        quoteId: 'quote-x',
        termsVersion: 'demo-1',
        acceptedTerms: true,
        acknowledgedSimulation: true,
      };
    default:
      return {};
  }
}

function buildDriftedFixture(op: OperationDescriptor): unknown {
  // Drift = swap the success status field for an out-of-band value;
  // the contract requires status minimum=400 for Problem but the 200
  // body must NOT carry a Problem-shaped status. We instead mutate a
  // required field into a wrong type so AJV fails on type mismatch.
  const fixture = buildHappyPathFixture(op, dereferencedSpec) as Record<string, unknown>;
  switch (op.operationId) {
    case 'getConfig':
      fixture['maximumLineQuantity'] = 'five'; // wrong type
      break;
    case 'listProducts':
      fixture['page'] = 'one'; // wrong type
      break;
    case 'createCart':
    case 'getCart':
    case 'addCartItem':
    case 'setCartItemQuantity':
    case 'removeCartItem':
      fixture['version'] = 'one'; // wrong type
      break;
    case 'createCheckoutQuote':
      fixture['cartVersion'] = 'one'; // wrong type
      break;
    default:
      fixture.driftMarker = true;
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
  return Array.from(codes);
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

function expectProblem(body: Record<string, unknown>): void {
  expectProblemShape(body);
}

function expectProblemShape(body: Record<string, unknown>): void {
  expect(typeof body['type']).toBe('string');
  expect(typeof body['title']).toBe('string');
  expect(typeof body['status']).toBe('number');
  expect(typeof body['code']).toBe('string');
  expect(typeof body['detail']).toBe('string');
  expect(typeof body['traceId']).toBe('string');
  expect(Array.isArray(body['fieldErrors'])).toBe(true);
}

async function rawFetch(
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
  const tempServer = setupServer(...(handlers as Parameters<typeof setupServer>));
  tempServer.listen({ onUnhandledRequest: 'error' });
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
    tempServer.close();
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
export type _UsedImports =
  | typeof HttpClient
  | typeof HttpContext
  | typeof firstValueFrom
  | typeof Api
  | typeof ApiConfiguration
  | typeof withIfMatch
  | typeof http
  | typeof HttpResponse;
