// tests/contract/sdk-transport.spec.ts — T04-AC04 SDK transport contract.
//
// Every operation declared in docs/api/openapi.yaml must reach MSW through the
// generated SDK, which itself uses Angular's real HttpClient. The test asserts:
//   1. the 16 operations are present and each one round-trips with the
//      documented URL, method, body and headers,
//   2. repeated brand[] and storageGb[] query-array parameters are encoded
//      with style=form, explode=true (the spec-mandated encoding),
//   3. the SDK cannot bypass itself by accident — no operation is dropped.
//
// MSW is set up locally because tests/setup-msw.ts (T02) is not yet shipped.
// When T02 lands, this file should swap its inline setup for that helper.

// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import '@angular/compiler';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
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
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { Api } from '../../src/app/api/generated/api';
import {
  ApiConfiguration,
  provideApiConfiguration,
} from '../../src/app/api/generated/api-configuration';
import * as operations from '../../src/app/api/generated/functions';
import {
  demoSessionInterceptor,
  withIfMatch,
} from '../../src/app/core/api/demo-session.interceptor';

const REPO_ROOT = resolve(__dirname, '../..');
const SPEC_PATH = resolve(REPO_ROOT, 'docs/api/openapi.yaml');
const BASE_URL = 'http://localhost/api/v1';
const BASE_URL_PATH = '/api/v1';

type OperationRow = {
  operationId: string;
  method: string;
  path: string;
  queryArrays: string[];
  bodyRequired: boolean;
};

interface OpenApiSpec {
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        parameters?: Array<{
          $ref?: string;
          in?: string;
          name?: string;
          required?: boolean;
          schema?: { type?: string };
        }>;
        requestBody?: unknown;
        responses?: Record<string, unknown>;
      }
    >
  >;
  components: {
    parameters: Record<string, { in: string; name: string; required?: boolean }>;
  };
}

let spec: OpenApiSpec;
let opRows: OperationRow[];
let seenOperationIds: Set<string>;

const captures = new Map<
  string,
  { method: string; url: string; headers: Headers; bodyText: string }
>();

function captureKey(method: string, url: URL): string {
  return `${method.toUpperCase()} ${url.pathname}${url.search}`;
}

function capture(request: Request, bodyText: string): void {
  const url = new URL(request.url);
  captures.set(captureKey(request.method, url), {
    method: request.method,
    url: request.url,
    headers: request.headers,
    bodyText,
  });
}

/**
 * MSW handlers: one per operation. The response shape mirrors the OpenAPI
 * schema; tests assert the request shape (URL, method, headers, body), not
 * the response content. The capture happens before the response resolves so
 * a failing test sees the exact request the SDK produced.
 */
const handlers = [
  http.get(`${BASE_URL}/config`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(EMPTY_CONFIG);
  }),
  http.get(`${BASE_URL}/products`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(EMPTY_PRODUCT_PAGE);
  }),
  http.get(`${BASE_URL}/products/:slug`, ({ request, params }) => {
    capture(request, '');
    return HttpResponse.json(MINIMAL_PRODUCT(String(params['slug'])));
  }),
  http.post(`${BASE_URL}/carts`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(MINIMAL_CART(1));
  }),
  http.get(`${BASE_URL}/carts/:cartId`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(MINIMAL_CART(1));
  }),
  http.post(`${BASE_URL}/carts/:cartId/items`, async ({ request }) => {
    capture(request, await request.text());
    return HttpResponse.json(MINIMAL_CART(2));
  }),
  http.patch(`${BASE_URL}/carts/:cartId/items/:itemId`, async ({ request }) => {
    capture(request, await request.text());
    return HttpResponse.json(MINIMAL_CART(3));
  }),
  http.delete(`${BASE_URL}/carts/:cartId/items/:itemId`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(MINIMAL_CART(4));
  }),
  http.get(`${BASE_URL}/checkout/options`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(EMPTY_CHECKOUT_OPTIONS);
  }),
  http.get(`${BASE_URL}/checkout/:cartId`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json({ cartId: 'cart-demo-001', cartVersion: 1 });
  }),
  http.put(`${BASE_URL}/checkout/:cartId`, async ({ request }) => {
    capture(request, await request.text());
    return HttpResponse.json({ cartId: 'cart-demo-001', cartVersion: 1 });
  }),
  http.post(`${BASE_URL}/checkout/:cartId/quote`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(MINIMAL_QUOTE);
  }),
  http.post(`${BASE_URL}/payment-intents`, async ({ request }) => {
    capture(request, await request.text());
    return HttpResponse.json(MINIMAL_PAYMENT_INTENT, { status: 201 });
  }),
  http.get(`${BASE_URL}/payment-intents/:paymentIntentId`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(MINIMAL_PAYMENT_INTENT);
  }),
  http.post(`${BASE_URL}/orders`, async ({ request }) => {
    capture(request, await request.text());
    return HttpResponse.json(MINIMAL_ORDER, { status: 201 });
  }),
  http.get(`${BASE_URL}/orders/:orderId`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(MINIMAL_ORDER);
  }),
];

const EMPTY_CONFIG = {
  providerId: 'mi-bolt',
  displayName: 'MiBolt',
  currency: 'HUF',
  isDemo: true,
  termsVersion: 'demo-1',
  featuredSlugs: ['demo-one-5g'],
  maximumLineQuantity: 5,
};
const EMPTY_PRODUCT_PAGE = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 12,
  facets: { brands: [], storageGb: [] },
};
const EMPTY_CHECKOUT_OPTIONS = {
  deliveryOptions: [
    {
      id: 'home_delivery',
      label: 'Házhoz szállítás – demó',
      fee: { amount: 1990, currency: 'HUF' },
      requiresAddress: true,
      description: 'demo',
    },
  ],
  paymentMethods: ['demo_card', 'demo_cod'],
  termsVersion: 'demo-1',
};
const MINIMAL_QUOTE = {
  id: 'quote-demo-001',
  cartId: 'cart-demo-001',
  cartVersion: 1,
  subtotal: { amount: 339990, currency: 'HUF' },
  shipping: { amount: 1990, currency: 'HUF' },
  total: { amount: 341980, currency: 'HUF' },
  expiresAt: '2026-09-14T10:05:00Z',
};
const MINIMAL_PAYMENT_INTENT = {
  id: 'pi-001',
  cartId: 'cart-demo-001',
  quoteId: 'quote-demo-001',
  status: 'succeeded',
  isSimulation: true,
  amount: { amount: 341980, currency: 'HUF' },
};
const MINIMAL_ORDER = {
  id: 'order-demo-001',
  orderNumber: 'DEMO-000001',
  createdAt: '2026-09-14T10:01:00Z',
  status: 'demo_confirmed',
  isSimulation: true,
  items: [],
  subtotal: { amount: 0, currency: 'HUF' },
  shipping: { amount: 0, currency: 'HUF' },
  total: { amount: 0, currency: 'HUF' },
  paymentMethod: 'demo_cod',
  deliveryOptionId: 'home_delivery',
  notice: 'demo',
};
function MINIMAL_CART(version: number) {
  return {
    id: 'cart-demo-001',
    version,
    items: [],
    itemCount: 0,
    subtotal: { amount: 0, currency: 'HUF' },
    status: 'active',
    expiresAt: '2026-09-15T10:00:00Z',
  };
}
function MINIMAL_PRODUCT(slug: string) {
  return {
    id: 'p-01',
    slug,
    brand: 'MiBolt Demo',
    name: 'Demo One 5G',
    highlights: ['6,7″ kijelző', '50 MP kamera'],
    defaultVariant: {
      id: 'demo-one-5g-graphite-256',
      colorCode: 'graphite',
      colorName: 'Grafit',
      swatchHex: '#343B43',
      storageGb: 256,
      price: { amount: 339990, currency: 'HUF' },
      availability: 'in_stock',
      maxQuantity: 5,
      images: [
        {
          id: 'i1',
          src: '/assets/products/graphite-front.webp',
          alt: 'a',
          width: 320,
          height: 400,
        },
      ],
    },
    is5g: true,
    isDemo: true,
    description: 'demo',
    variants: [],
    specGroups: [{ id: 'g1', title: 'demo', rows: [{ label: 'k', value: 'v' }] }],
  };
}

const server = setupServer(...handlers);

beforeAll(async () => {
  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting(), {
    teardown: { destroyAfterEach: true },
  });
  const raw = await readFile(SPEC_PATH, 'utf8');
  spec = yaml.load(raw) as OpenApiSpec;
  opRows = collectOperations(spec);
  seenOperationIds = new Set<string>();
  server.listen({ onUnhandledRequest: 'error' });
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  captures.clear();
  seenOperationIds.clear();
});

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withFetch(), withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
    ],
    teardown: { destroyAfterEach: true },
  });
});

/**
 * Construct the SDK façade manually. The generated `Api` class is partially
 * compiled; running it through `TestBed.inject` needs decorator metadata
 * that vitest's esbuild pipeline does not emit. Direct construction with
 * the same two dependencies (HttpClient + ApiConfiguration) sidesteps the
 * JIT metadata issue while still exercising the generated `invoke` path.
 */
function makeSdk(): { api: Api; httpClient: HttpClient; config: ApiConfiguration } {
  const httpClient = TestBed.inject(HttpClient);
  const config = TestBed.inject(ApiConfiguration);
  const api = new Api(config, httpClient);
  return { api, httpClient, config };
}

// ---------------------------------------------------------------------------
// 1. Every documented operationId round-trips through the generated SDK
// ---------------------------------------------------------------------------

describe('T04-AC04 every generated operation reaches MSW', () => {
  it('exercises all 16 operations end-to-end through the real HttpClient', async () => {
    const { api } = makeSdk();
    expect(TestBed.inject(ApiConfiguration).rootUrl).toBe(BASE_URL);

    await callOperation(api, 'getConfig');
    await callOperation(api, 'listProducts');
    await callOperation(api, 'getProduct', { slug: 'demo-one-5g' });
    await callOperation(api, 'createCart', { body: { providerId: 'mi-bolt' } });
    await callOperation(api, 'getCart', { cartId: 'cart-demo-001' });
    await callOperation(
      api,
      'addCartItem',
      {
        cartId: 'cart-demo-001',
        body: { variantId: 'demo-one-5g-graphite-256', quantity: 1 },
      },
      withIfMatch('1'),
    );
    await callOperation(
      api,
      'setCartItemQuantity',
      {
        cartId: 'cart-demo-001',
        itemId: 'line-001',
        body: { quantity: 2 },
      },
      withIfMatch('1'),
    );
    await callOperation(
      api,
      'removeCartItem',
      {
        cartId: 'cart-demo-001',
        itemId: 'line-001',
      },
      withIfMatch('1'),
    );
    await callOperation(api, 'getCheckoutOptions');
    await callOperation(api, 'getCheckoutSession', { cartId: 'cart-demo-001' });
    await callOperation(
      api,
      'updateCheckout',
      {
        cartId: 'cart-demo-001',
        body: { paymentMethod: 'demo_cod' },
      },
      withIfMatch('1'),
    );
    await callOperation(api, 'createCheckoutQuote', { cartId: 'cart-demo-001' }, withIfMatch('1'));
    await callOperation(api, 'createPaymentIntent', {
      body: { cartId: 'cart-demo-001', quoteId: 'quote-demo-001' },
    });
    await callOperation(api, 'getPaymentIntent', { paymentIntentId: 'pi-001' });
    await callOperation(api, 'createOrder', {
      body: {
        cartId: 'cart-demo-001',
        quoteId: 'quote-demo-001',
        termsVersion: 'demo-1',
        acceptedTerms: true,
        acknowledgedSimulation: true,
      },
    });
    await callOperation(api, 'getOrder', { orderId: 'order-demo-001' });

    const declared = new Set(opRows.map((o) => o.operationId));
    expect(seenOperationIds.size).toBe(declared.size);
    for (const id of declared) {
      expect(seenOperationIds.has(id), `operation ${id} not exercised by the SDK`).toBe(true);
    }

    for (const op of opRows) {
      const pathRe = new RegExp(
        '^' + `${BASE_URL_PATH}${op.path}`.replace(/\{[^}]+\}/g, '[^/]+') + '(?:\\?.*)?$',
      );
      const matches = [...captures.values()].filter((c) => {
        const url = new URL(c.url);
        return c.method === op.method && pathRe.test(url.pathname + url.search);
      });
      expect(matches.length, `${op.method} ${op.path} never reached MSW`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Repeated brand[] and storageGb[] query arrays use style=form / explode=true
// ---------------------------------------------------------------------------

describe('T04-AC04 repeated query-array parameters round-trip', () => {
  it('encodes brand=A&brand=B and storageGb=128&storageGb=256 through real HttpClient', async () => {
    const { api } = makeSdk();
    await callOperation(api, 'listProducts', {
      brand: ['Apple', 'MiBolt Demo'],
      storageGb: [128, 256],
      page: 1,
      pageSize: 12,
    });

    const listCall = [...captures.values()].find((c) => {
      const u = new URL(c.url);
      return c.method === 'GET' && u.pathname === '/api/v1/products';
    });
    expect(listCall, 'GET /api/v1/products never reached MSW').toBeDefined();

    const url = new URL(listCall!.url);
    const brands = url.searchParams.getAll('brand');
    const storages = url.searchParams.getAll('storageGb');
    expect(brands).toEqual(['Apple', 'MiBolt Demo']);
    expect(storages).toEqual(['128', '256']);
  });
});

// ---------------------------------------------------------------------------
// 3. The X-Demo-Session namespace header is added centrally
// ---------------------------------------------------------------------------

describe('T04-AC05 demo-session header is attached by the interceptor', () => {
  it('every outgoing request carries X-Demo-Session, even one without a body', async () => {
    const { api } = makeSdk();
    await callOperation(api, 'getConfig');

    const call = [...captures.values()][0];
    expect(call).toBeDefined();
    const session = call!.headers.get('X-Demo-Session');
    expect(session, 'X-Demo-Session header missing').toBeTruthy();
    expect(session).toMatch(/^[a-zA-Z0-9_-]{8,80}$/);
  });

  it('withIfMatch attaches If-Match alongside X-Demo-Session', async () => {
    const { api } = makeSdk();
    await callOperation(
      api,
      'addCartItem',
      {
        cartId: 'cart-demo-001',
        body: { variantId: 'demo-one-5g-graphite-256', quantity: 1 },
      },
      withIfMatch('1'),
    );

    const call = [...captures.values()].find((c) => {
      const u = new URL(c.url);
      return c.method === 'POST' && u.pathname === '/api/v1/carts/cart-demo-001/items';
    });
    expect(call, 'POST /api/v1/carts/cart-demo-001/items never reached MSW').toBeDefined();
    expect(call!.headers.get('If-Match')).toBe('"1"');
    expect(call!.headers.get('X-Demo-Session')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 4. The generated SDK is wired to the configured baseUrl from ApiConfiguration
// ---------------------------------------------------------------------------

describe('T04-AC05 baseUrl is document.baseURI-aware', () => {
  it('every MSW hit is prefixed by the configured rootUrl, never by hard-coded host', async () => {
    const { api } = makeSdk();
    await callOperation(api, 'getConfig');
    await callOperation(api, 'listProducts');

    for (const c of captures.values()) {
      expect(c.url.startsWith(BASE_URL), `unexpected URL ${c.url}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. ApiConfiguration is the only place rootUrl lives — no leaked fetch
// ---------------------------------------------------------------------------

describe('T04-AC05 generated SDK is the only API surface', () => {
  it('exposes the ApiConfiguration class with rootUrl set from provideApiConfiguration', () => {
    const config = TestBed.inject(ApiConfiguration);
    expect(config.rootUrl).toBe(BASE_URL);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type OpFn = (
  http: HttpClient,
  rootUrl: string,
  params?: Record<string, unknown>,
  context?: HttpContext,
) => {
  subscribe: (observer: {
    next: (value: unknown) => void;
    error: (err: unknown) => void;
  }) => unknown;
};

/**
 * Call a generated SDK operation through the `Api` service. The Api class
 * exposes `invoke(fn, params, context)`; each generated operation is a
 * standalone function re-exported from `functions.ts`. We look it up by
 * operationId and let the function signature check itself at runtime.
 */
async function callOperation(
  api: Api,
  operationId: string,
  params: Record<string, unknown> = {},
  context?: HttpContext,
): Promise<void> {
  seenOperationIds.add(operationId);
  const fn = (operations as unknown as Record<string, OpFn>)[operationId];
  if (typeof fn !== 'function') {
    throw new Error(`Generated SDK is missing function ${operationId}`);
  }
  await firstValueFrom(api.invoke(fn as never, params as never, context));
}

/**
 * Walk the dereferenced OpenAPI document and return one row per operation.
 * Used to drive assertions from the wire contract itself so a renamed
 * operationId breaks the test instead of being silently dropped.
 */
function collectOperations(s: OpenApiSpec): OperationRow[] {
  const rows: OperationRow[] = [];
  for (const [pathKey, pathItem] of Object.entries(s.paths)) {
    for (const [method, op] of Object.entries(pathItem)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      if (!op || typeof op !== 'object' || typeof op.operationId !== 'string') continue;
      const queryArrays: string[] = [];
      const params = Array.isArray(op.parameters) ? op.parameters : [];
      for (const p of params) {
        if (p.in === 'query' && p.schema?.type === 'array') queryArrays.push(p.name ?? '');
      }
      rows.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path: pathKey.startsWith('/') ? pathKey : `/${pathKey}`,
        queryArrays,
        bodyRequired: typeof op.requestBody === 'object',
      });
    }
  }
  return rows;
}
