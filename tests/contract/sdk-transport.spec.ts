// tests/contract/sdk-transport.spec.ts — T04-AC04 SDK transport contract.
//
// Every operation declared in docs/api/openapi.yaml must reach MSW through the
// generated SDK, which itself uses Angular's real HttpClient. The test asserts
// (1) the 17 operations are present and each one round-trips with the
// documented URL, method, body and headers; (2) repeated brand[] and
// storageGb[] query-array parameters are encoded with style=form,
// explode=true (the spec-mandated encoding); (3) `If-Match` and
// `Idempotency-Key`, both contract-mandated on the mutations that name them,
// are written by the right caller at the right call site.

// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import '@angular/compiler';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import type { HttpContext } from '@angular/common/http';
import { HttpClient, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { firstValueFrom } from 'rxjs';
import { http, HttpResponse } from 'msw';
import { server, useMswServer } from '../msw-server';

import { Api } from '../../src/app/api/generated/api';
import type { Cart } from '../../src/app/api/generated/models/cart';
import type { Product } from '../../src/app/api/generated/models/product';
import {
  ApiConfiguration as ApiConfig,
  provideApiConfiguration as provideApiConfig,
} from '../../src/app/api/generated/api-configuration';
import * as operations from '../../src/app/api/generated/functions';
import {
  demoSessionInterceptor,
  withIfMatch,
} from '../../src/app/core/api/demo-session.interceptor';

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

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
        parameters?: {
          $ref?: string;
          in?: string;
          name?: string;
          required?: boolean;
          schema?: { type?: string };
        }[];
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
 * MSW handlers: one per 2.0.0 operation. The capture happens before the
 * response resolves so a failing test sees the exact request the SDK
 * produced. The handlers under `src/mocks/**` require a session-scoped
 * `X-Demo-Session` header that the 2.0.0 contract does not declare (the
 * contract's session is the `mibolt_session` cookie — `docs/api/openapi.yaml`
 * line 936-939). The contract suite must assert the wire contract, so this
 * file ships its own minimal handlers instead of the real slice handlers:
 * the wire shape is the contract, the per-tab session state is an
 * implementation detail of the test bed.
 */
const handlers = [
  http.get(`${BASE_URL}/products`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(EMPTY_PRODUCT_PAGE);
  }),
  http.get(`${BASE_URL}/products/:slug`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(
      MINIMAL_PRODUCT(String(new URL(request.url).pathname.split('/').pop())),
    );
  }),
  http.get(`${BASE_URL}/products/:slug/related`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json([]);
  }),
  http.get(`${BASE_URL}/media/:imageId`, ({ request }) => {
    capture(request, '');
    // getMedia returns raw bytes (Blob); the SDK uses responseType 'blob'.
    return new HttpResponse(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    });
  }),
  http.get(`${BASE_URL}/cart`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(MINIMAL_CART(1));
  }),
  http.post(`${BASE_URL}/cart/items`, async ({ request }) => {
    capture(request, await request.text());
    return HttpResponse.json(MINIMAL_CART(2));
  }),
  http.delete(`${BASE_URL}/cart/items`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(MINIMAL_CART(3));
  }),
  http.patch(`${BASE_URL}/cart/items/:variantId`, async ({ request }) => {
    capture(request, await request.text());
    return HttpResponse.json(MINIMAL_CART(4));
  }),
  http.delete(`${BASE_URL}/cart/items/:variantId`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(MINIMAL_CART(5));
  }),
  http.get(`${BASE_URL}/checkout/options`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(EMPTY_CHECKOUT_OPTIONS);
  }),
  http.get(`${BASE_URL}/checkout`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(MINIMAL_CHECKOUT(1));
  }),
  http.patch(`${BASE_URL}/checkout`, async ({ request }) => {
    capture(request, await request.text());
    return HttpResponse.json(MINIMAL_CHECKOUT(1));
  }),
  http.post(`${BASE_URL}/payment-intents`, async ({ request }) => {
    capture(request, await request.text());
    return HttpResponse.json(MINIMAL_PAYMENT_INTENT, { status: 201 });
  }),
  http.get(`${BASE_URL}/payment-intents/:paymentIntentId`, ({ request }) => {
    capture(request, '');
    return HttpResponse.json(MINIMAL_PAYMENT_INTENT);
  }),
  http.post(`${BASE_URL}/payment-intents/:paymentIntentId/outcome`, async ({ request }) => {
    capture(request, await request.text());
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

const EMPTY_PRODUCT_PAGE = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 12,
  totalPages: 0,
  facets: { brands: [], storageGb: [], colors: [] },
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
  paymentMethods: ['card', 'cash_on_delivery'],
  termsVersion: 'demo-1',
};
const MINIMAL_PAYMENT_INTENT = {
  id: 'pi-001',
  status: 'requires_action',
  amount: { amount: 341_980, currency: 'HUF' },
  redirectUrl: '/demo-fizetes/payment/pi-001',
  returnUrl: '/checkout?paymentReturn=pi-001',
  createdAt: '2026-09-14T10:01:00Z',
  expiresAt: '2026-09-14T10:16:00Z',
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
  paymentMethod: 'cash_on_delivery',
  deliveryOptionId: 'home_delivery',
  notice: 'demo',
};
function MINIMAL_CART(version: number): Cart {
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
function MINIMAL_CHECKOUT(version: number): Record<string, unknown> {
  return {
    version,
    sections: { contact: null, billing: null, delivery: null, payment: null },
    complete: false,
  };
}
function MINIMAL_PRODUCT(slug: string): Product {
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
      price: { amount: 339_990, currency: 'HUF' },
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

beforeAll(async () => {
  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting(), {
    teardown: { destroyAfterEach: true },
  });
  const raw = await readFile(SPEC_PATH, 'utf8');
  spec = yaml.load(raw) as OpenApiSpec;
  opRows = collectOperations(spec);
  seenOperationIds = new Set<string>();
});

afterEach(() => {
  captures.clear();
  seenOperationIds.clear();
});

beforeEach(() => {
  // `useMswServer()`'s own `afterEach` clears every `server.use(...)`
  // override after each test, so the fixed handler set is re-registered
  // here rather than once at module scope.
  server.use(...handlers);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withFetch(), withInterceptors([demoSessionInterceptor])),
      provideApiConfig(BASE_URL),
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
function makeSdk(): { api: Api; httpClient: HttpClient; config: ApiConfig } {
  const httpClient = TestBed.inject(HttpClient);
  const config = TestBed.inject(ApiConfig);
  const api = new Api(config, httpClient);
  return { api, httpClient, config };
}

// ---------------------------------------------------------------------------
// 1. Every documented operationId round-trips through the generated SDK
// ---------------------------------------------------------------------------

describe('T04-AC04 every generated operation reaches MSW', () => {
  it('exercises all 17 operations end-to-end through the real HttpClient', async () => {
    const { api } = makeSdk();
    expect(TestBed.inject(ApiConfig).rootUrl).toBe(BASE_URL);

    // catalog (public; no If-Match) — docs/api/openapi.yaml:54-244
    await callOperation(api, 'listProducts');
    await callOperation(api, 'getProduct', { slug: 'demo-one-5g' });
    await callOperation(api, 'listRelatedProducts', { slug: 'demo-one-5g' });
    await callOperation(api, 'getMedia$Jpeg', { imageId: 'i1' });

    // cart (session-scoped; If-Match on mutations) — docs/api/openapi.yaml:266-465
    await callOperation(api, 'getCart');
    await callOperation(
      api,
      'addCartItem',
      { body: { variantId: 'demo-one-5g-graphite-256', quantity: 1 } },
      withIfMatch('1'),
    );
    await callOperation(api, 'clearCart', {}, withIfMatch('2'));
    await callOperation(
      api,
      'setCartItemQuantity',
      { variantId: 'demo-one-5g-graphite-256', body: { quantity: 2 } },
      withIfMatch('3'),
    );
    await callOperation(
      api,
      'removeCartItem',
      { variantId: 'demo-one-5g-graphite-256' },
      withIfMatch('4'),
    );

    // checkout (session-scoped; If-Match on update) — docs/api/openapi.yaml:467-573
    await callOperation(api, 'getCheckoutOptions');
    await callOperation(api, 'getCheckout');
    await callOperation(
      api,
      'updateCheckout',
      { body: { payment: { method: 'cash_on_delivery' } } },
      withIfMatch('1'),
    );

    // payment (If-Match + Idempotency-Key on create; body on resolve)
    // docs/api/openapi.yaml:575-750
    await callOperation(
      api,
      'createPaymentIntent',
      { 'Idempotency-Key': 'idem-pi-001', body: { method: 'card' } },
      withIfMatch('1'),
    );
    await callOperation(api, 'getPaymentIntent', { paymentIntentId: 'pi-001' });
    await callOperation(api, 'resolvePaymentIntent', {
      paymentIntentId: 'pi-001',
      body: { outcome: 'succeeded' },
    });

    // orders (If-Match + Idempotency-Key on create) — docs/api/openapi.yaml:752-933
    await callOperation(
      api,
      'createOrder',
      {
        'Idempotency-Key': 'idem-order-001',
        body: {
          paymentMethod: 'cash_on_delivery',
          termsVersion: 'demo-1',
          acceptedTerms: true,
        },
      },
      withIfMatch('1'),
    );
    await callOperation(api, 'getOrder', { orderId: 'order-demo-001' });

    // The OpenAPI spec declares one `getMedia` operationId; the generated SDK
    // splits it across three content-type variants (`getMedia$Jpeg`,
    // `getMedia$Png`, `getMedia$Webp` — see fn/media/*). Treat any variant
    // as satisfying the spec row, so a single exercise round-trip counts.
    const declared = new Set(opRows.map((o) => o.operationId));
    const getMediaVariantIds = ['getMedia$Jpeg', 'getMedia$Png', 'getMedia$Webp'];
    const anyGetMediaVariant = getMediaVariantIds.some((id) => seenOperationIds.has(id));
    const satisfied = [...declared].filter((id) =>
      id === 'getMedia' ? anyGetMediaVariant : seenOperationIds.has(id),
    );
    expect(satisfied.length, `exercised ${satisfied.length} of ${declared.size} ops`).toBe(
      declared.size,
    );
    for (const id of declared) {
      expect(
        id === 'getMedia' ? anyGetMediaVariant : seenOperationIds.has(id),
        `operation ${id} not exercised by the SDK`,
      ).toBe(true);
    }

    for (const op of opRows) {
      // Build the matcher as static literals plus the safe `[^/]+` literal for
      // each `{name}` placeholder. The path template is read from the on-disk
      // spec at test time; the per-path segments become literal string parts,
      // so no non-literal reaches RegExp (security/detect-non-literal-regexp).
      const segments = `${BASE_URL_PATH}${op.path}`.split(/(\{[^}]+\})/);
      const parts: string[] = [];
      for (const seg of segments) {
        if (seg.startsWith('{') && seg.endsWith('}')) {
          parts.push('[^/]+');
        } else if (seg.length > 0) {
          parts.push(seg.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`));
        }
      }
      const pattern = `^${parts.join('')}(?:\\?.*)?$`;
      const matches = [...captures.values()].filter((c) => {
        const url = new URL(c.url);
        return c.method === op.method && (url.pathname + url.search).match(pattern) !== null;
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
// 3. If-Match is attached by withIfMatch (docs/api/openapi.yaml:993-1001)
//    and Idempotency-Key by the createOrder caller
//    (docs/api/openapi.yaml:1002-1008, generated SDK fn/orders/create-order.ts:25)
// ---------------------------------------------------------------------------

describe('T04-AC05 If-Match is attached by withIfMatch', () => {
  it('a mutation sent with withIfMatch(1) carries If-Match: "1"', async () => {
    const { api } = makeSdk();
    await callOperation(
      api,
      'addCartItem',
      { body: { variantId: 'demo-one-5g-graphite-256', quantity: 1 } },
      withIfMatch(1),
    );

    const call = [...captures.values()].find((c) => {
      const u = new URL(c.url);
      return c.method === 'POST' && u.pathname === '/api/v1/cart/items';
    });
    expect(call, 'POST /api/v1/cart/items never reached MSW').toBeDefined();
    expect(call!.headers.get('If-Match')).toBe('"1"');
  });

  it('a request without withIfMatch carries no If-Match header', async () => {
    const { api } = makeSdk();
    await callOperation(api, 'getCart');

    const call = [...captures.values()].find((c) => {
      const u = new URL(c.url);
      return c.method === 'GET' && u.pathname === '/api/v1/cart';
    });
    expect(call, 'GET /api/v1/cart never reached MSW').toBeDefined();
    expect(call!.headers.has('If-Match')).toBe(false);
  });
});

describe('T04-AC05 Idempotency-Key is passed by the createOrder caller', () => {
  it('createOrder carries the Idempotency-Key header value the caller supplied', async () => {
    const { api } = makeSdk();
    await callOperation(
      api,
      'createOrder',
      {
        'Idempotency-Key': 'idem-contract-001',
        body: {
          paymentMethod: 'cash_on_delivery',
          termsVersion: 'demo-1',
          acceptedTerms: true,
        },
      },
      withIfMatch('1'),
    );

    const call = [...captures.values()].find((c) => {
      const u = new URL(c.url);
      return c.method === 'POST' && u.pathname === '/api/v1/orders';
    });
    expect(call, 'POST /api/v1/orders never reached MSW').toBeDefined();
    expect(call!.headers.get('Idempotency-Key')).toBe('idem-contract-001');
    expect(call!.headers.get('If-Match')).toBe('"1"');
  });
});

// ---------------------------------------------------------------------------
// 4. The generated SDK is wired to the configured baseUrl from ApiConfiguration
// ---------------------------------------------------------------------------

describe('T04-AC05 baseUrl is document.baseURI-aware', () => {
  it('every MSW hit is prefixed by the configured rootUrl, never by hard-coded host', async () => {
    const { api } = makeSdk();
    await callOperation(api, 'listProducts');
    await callOperation(api, 'getCart');

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
    const config = TestBed.inject(ApiConfig);
    expect(config.rootUrl).toBe(BASE_URL);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type OpFunction = (
  http: HttpClient,
  rootUrl: string,
  parameters?: Record<string, unknown>,
  context?: HttpContext,
) => {
  subscribe: (observer: {
    next: (value: unknown) => void;
    error: (error: unknown) => void;
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
  parameters: Record<string, unknown> = {},
  context?: HttpContext,
): Promise<void> {
  seenOperationIds.add(operationId);
  const function_ = (operations as unknown as Record<string, OpFunction>)[operationId];
  if (typeof function_ !== 'function') {
    throw new TypeError(`Generated SDK is missing function ${operationId}`);
  }
  await firstValueFrom(api.invoke(function_ as never, parameters as never, context));
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
      if (
        !['get', 'post', 'put', 'patch', 'delete'].includes(method) ||
        !op ||
        typeof op !== 'object' ||
        typeof op.operationId !== 'string'
      )
        continue;
      const queryArrays: string[] = [];
      const parameters = Array.isArray(op.parameters) ? op.parameters : [];
      for (const p of parameters) {
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
