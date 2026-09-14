/**
 * T07 — cart MSW handlers.
 *
 * Five atomic operations wired through MSW: createCart, getCart,
 * addCartItem, setCartItemQuantity, removeCartItem. Each handler:
 *
 *   1. Reads the X-Demo-Session / Idempotency-Key / If-Match headers
 *      and forwards a typed input to the cart-domain.
 *   2. Maps the `CartResult` back to an `HttpResponse` — success
 *      becomes a 200/201 with the cart JSON body, failure becomes a
 *      Problem JSON with the matching status code.
 *   3. Never throws so the surrounding MSW worker returns the
 *      response rather than a 500 transport error.
 *
 * The handlers register themselves through the T05 dispatcher
 * registry so they appear in `createStrictHandlers(...)` for tests
 * and in `createHandlers(...)` for the browser/node workers. The
 * demo device fixture is loaded by the entry on first invocation
 * so cart operations have at least one variant to attach; T06's
 * catalog handlers will overwrite the fixture with the full 16-product
 * catalog on a later wave.
 */

import { http, HttpResponse, type RequestHandler } from 'msw';

import {
  registerBusinessHandlers,
  type BusinessHandlerEntry,
  type CreateHandlersOptions,
} from '../create-handlers';
import { IdempotencyStore } from '../idempotency';
import { type Money, type Product, Repository } from '../repository';

import { CartDomain } from './cart-domain';

const VARIANTS: Product['variants'] = [
  {
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
        id: 'demo-one-5g-graphite-256-front',
        src: '/assets/products/graphite-front.webp',
        alt: 'Demo One 5G, Grafit, 256 GB, elölnézet',
        width: 320,
        height: 400,
      },
    ],
  },
  {
    id: 'demo-one-5g-graphite-512',
    colorCode: 'graphite',
    colorName: 'Grafit',
    swatchHex: '#343B43',
    storageGb: 512,
    price: { amount: 378_390, currency: 'HUF' },
    availability: 'in_stock',
    maxQuantity: 5,
    images: [
      {
        id: 'demo-one-5g-graphite-512-front',
        src: '/assets/products/graphite-front.webp',
        alt: 'Demo One 5G, Grafit, 512 GB, elölnézet',
        width: 320,
        height: 400,
      },
    ],
  },
  {
    id: 'demo-one-5g-silver-256',
    colorCode: 'silver',
    colorName: 'Ezüst',
    swatchHex: '#C6C9CB',
    storageGb: 256,
    price: { amount: 344_990, currency: 'HUF' },
    availability: 'in_stock',
    maxQuantity: 5,
    images: [
      {
        id: 'demo-one-5g-silver-256-front',
        src: '/assets/products/silver-front.webp',
        alt: 'Demo One 5G, Ezüst, 256 GB, elölnézet',
        width: 320,
        height: 400,
      },
    ],
  },
  {
    id: 'demo-one-5g-silver-512',
    colorCode: 'silver',
    colorName: 'Ezüst',
    swatchHex: '#C6C9CB',
    storageGb: 512,
    price: { amount: 383_390, currency: 'HUF' },
    availability: 'in_stock',
    maxQuantity: 5,
    images: [
      {
        id: 'demo-one-5g-silver-512-front',
        src: '/assets/products/silver-front.webp',
        alt: 'Demo One 5G, Ezüst, 512 GB, elölnézet',
        width: 320,
        height: 400,
      },
    ],
  },
];

/**
 * Demo device fixture. Mirrors the openapi.yaml Product example so
 * cart unit tests can rely on the four variant ids (`graphite-256`,
 * `graphite-512`, `silver-256`, `silver-512`). T06 will replace this
 * load with the full 16-product catalog.
 */
export const DEMO_PRODUCT: Product = {
  id: 'p-01',
  slug: 'demo-one-5g',
  brand: 'MiBolt Demo',
  name: 'Demo One 5G',
  highlights: ['6,7″ kijelző', '50 MP kamera'],
  is5g: true,
  isDemo: true,
  description:
    'Fiktív készülék a MiBolt webshop működésének bemutatásához. A kép illusztráció, az ár demóadat.',
  specGroups: [
    {
      id: 'display',
      title: 'Kijelző és kialakítás',
      rows: [
        { label: 'Kijelző', value: '6,7″ • demóadat' },
        { label: 'Képfrissítés', value: '120 Hz • demóadat' },
      ],
    },
    {
      id: 'connection',
      title: 'Kapcsolat és memória',
      rows: [
        { label: 'Kapcsolat', value: '5G / Wi-Fi / Bluetooth • demóadat' },
        { label: 'Tárhely', value: 'Változattól függő • demóadat' },
      ],
    },
  ],
  variants: VARIANTS,
  defaultVariant: VARIANTS[0],
};

/**
 * Loads the demo fixture into a repository unless another slice has
 * already populated the catalogue. Tests rely on the fixture being
 * present; T06 will overwrite with the full catalog.
 */
function ensureFixture(repository: Repository): void {
  if (repository.listProducts().length === 0) {
    repository.loadProducts([DEMO_PRODUCT]);
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

type ProblemLike = {
  status: number;
  code: string;
  detail: string;
  fieldErrors: { path: string; message: string }[];
};

/**
 * Builds the wire-shaped Cart JSON from the in-memory Cart. The
 * wire contract requires `itemCount` and `subtotal` derivations the
 * repository does not maintain.
 */
function serializeCart(cart: ReturnType<Repository['createCart']>): Record<string, unknown> {
  const itemCount = cart.items.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal: Money = {
    amount: cart.items.reduce((sum, line) => sum + line.lineTotal.amount, 0),
    currency: 'HUF',
  };
  return {
    id: cart.id,
    version: cart.version,
    items: cart.items.map((line) => ({ ...line })),
    itemCount,
    subtotal,
    status: cart.status,
    expiresAt: cart.expiresAt,
  };
}

/**
 * Maps a `Problem` into an `HttpResponse` with the correct status,
 * `application/problem+json` content type, and a stable trace id so
 * log readers can correlate failures to scenarios.
 */
function problemResponse(problem: ProblemLike, traceId: string): HttpResponse<Record<string, unknown>> {
  const body = {
    type: `urn:mi-bolt:problem:${problem.code.toLowerCase().replace(/_/g, '-')}`,
    title: problem.detail,
    status: problem.status,
    code: problem.code,
    detail: problem.detail,
    traceId,
    fieldErrors: problem.fieldErrors,
  };
  return HttpResponse.json(body, {
    status: problem.status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

function badRequest(detail: string, traceId: string): HttpResponse<Record<string, unknown>> {
  return problemResponse(
    { status: 400, code: 'VALIDATION_FAILED', detail, fieldErrors: [] },
    traceId,
  );
}

function readVariantId(body: unknown): { ok: true; value: string } | { ok: false; detail: string } {
  if (!body || typeof body !== 'object') return { ok: false, detail: 'A kérés törzse érvénytelen JSON.' };
  const record = body as Record<string, unknown>;
  const variantId = record['variantId'];
  if (typeof variantId !== 'string' || variantId.length === 0) {
    return { ok: false, detail: 'A variantId mező kötelező szöveg.' };
  }
  return { ok: true, value: variantId };
}

function readQuantity(body: unknown): { ok: true; value: number } | { ok: false; detail: string } {
  if (!body || typeof body !== 'object') return { ok: false, detail: 'A kérés törzse érvénytelen JSON.' };
  const record = body as Record<string, unknown>;
  const quantity = record['quantity'];
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || !Number.isInteger(quantity)) {
    return { ok: false, detail: 'A quantity mező kötelező egész szám.' };
  }
  return { ok: true, value: quantity };
}

/**
 * Cart business handler entry — registers itself on module load.
 * Each MSW worker (browser / node) builds its handler list from this
 * entry plus the T06 catalog entry, in registry order.
 */
export const cartHandlersEntry: BusinessHandlerEntry = (options: CreateHandlersOptions): readonly RequestHandler[] => {
  const { repository, clock, ids, scenario, apiRoot } = options;
  ensureFixture(repository);

  const base = apiRoot.endsWith('/') ? apiRoot.slice(0, -1) : apiRoot;
  const idempotency = new IdempotencyStore(clock);
  const domain = new CartDomain(repository, clock, ids, idempotency);
  const traceId = `mock-trace-${scenario.name}`;
  // MSW 2.x matches paths against the request's origin. In Node the
  // origin defaults to `http://127.0.0.1` (or localhost), so a plain
  // `/api/v1/carts` pattern misses; the leading `*` wildcard anchors
  // the path while leaving the origin open.
  const wildcard = `*${base}`;

  const createCart: RequestHandler = http.post(`${wildcard}/carts`, ({ request }) => {
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) return badRequest('Hiányzó X-Demo-Session fejléc.', traceId);
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (idempotencyKey === null) return badRequest('Hiányzó Idempotency-Key fejléc.', traceId);
    const result = domain.createCart({ sessionId, idempotencyKey });
    if (!result.ok) return problemResponse(result.problem, traceId);
    return HttpResponse.json(serializeCart(result.value), {
      status: 201,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  });

  const getCart: RequestHandler = http.get(`${wildcard}/carts/:cartId`, ({ request, params }) => {
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) return badRequest('Hiányzó X-Demo-Session fejléc.', traceId);
    const result = domain.getCart({ sessionId, cartId: String(params['cartId']) });
    if (!result.ok) return problemResponse(result.problem, traceId);
    return HttpResponse.json(serializeCart(result.value), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  });

  const addCartItem: RequestHandler = http.post(
    `${wildcard}/carts/:cartId/items`,
    async ({ request, params }) => {
      const sessionId = request.headers.get('X-Demo-Session');
      if (sessionId === null) return badRequest('Hiányzó X-Demo-Session fejléc.', traceId);
      const idempotencyKey = request.headers.get('Idempotency-Key');
      if (idempotencyKey === null) return badRequest('Hiányzó Idempotency-Key fejléc.', traceId);
      const ifMatch = request.headers.get('If-Match');
      if (ifMatch === null) return badRequest('Hiányzó If-Match fejléc.', traceId);
      const body = await readJsonBody(request);
      const variantRead = readVariantId(body);
      if (!variantRead.ok) return badRequest(variantRead.detail, traceId);
      const quantityRead = readQuantity(body);
      if (!quantityRead.ok) return badRequest(quantityRead.detail, traceId);
      const result = domain.addCartItem({
        sessionId,
        cartId: String(params['cartId']),
        ifMatch,
        idempotencyKey,
        variantId: variantRead.value,
        quantity: quantityRead.value,
      });
      if (!result.ok) return problemResponse(result.problem, traceId);
      return HttpResponse.json(serializeCart(result.value), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    },
  );

  const setCartItemQuantity: RequestHandler = http.patch(
    `${wildcard}/carts/:cartId/items/:itemId`,
    async ({ request, params }) => {
      const sessionId = request.headers.get('X-Demo-Session');
      if (sessionId === null) return badRequest('Hiányzó X-Demo-Session fejléc.', traceId);
      const idempotencyKey = request.headers.get('Idempotency-Key');
      if (idempotencyKey === null) return badRequest('Hiányzó Idempotency-Key fejléc.', traceId);
      const ifMatch = request.headers.get('If-Match');
      if (ifMatch === null) return badRequest('Hiányzó If-Match fejléc.', traceId);
      const body = await readJsonBody(request);
      const quantityRead = readQuantity(body);
      if (!quantityRead.ok) return badRequest(quantityRead.detail, traceId);
      const result = domain.setCartItemQuantity({
        sessionId,
        cartId: String(params['cartId']),
        itemId: String(params['itemId']),
        ifMatch,
        idempotencyKey,
        quantity: quantityRead.value,
      });
      if (!result.ok) return problemResponse(result.problem, traceId);
      return HttpResponse.json(serializeCart(result.value), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    },
  );

  const removeCartItem: RequestHandler = http.delete(
    `${wildcard}/carts/:cartId/items/:itemId`,
    ({ request, params }) => {
      const sessionId = request.headers.get('X-Demo-Session');
      if (sessionId === null) return badRequest('Hiányzó X-Demo-Session fejléc.', traceId);
      const idempotencyKey = request.headers.get('Idempotency-Key');
      if (idempotencyKey === null) return badRequest('Hiányzó Idempotency-Key fejléc.', traceId);
      const ifMatch = request.headers.get('If-Match');
      if (ifMatch === null) return badRequest('Hiányzó If-Match fejléc.', traceId);
      const result = domain.removeCartItem({
        sessionId,
        cartId: String(params['cartId']),
        itemId: String(params['itemId']),
        ifMatch,
        idempotencyKey,
      });
      if (!result.ok) return problemResponse(result.problem, traceId);
      return HttpResponse.json(serializeCart(result.value), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    },
  );

  return [createCart, getCart, addCartItem, setCartItemQuantity, removeCartItem];
};

// Re-export types and helpers so tests and downstream slices can use them.
export const __testing = { serializeCart, problemResponse, readVariantId, readQuantity };
export type { Money } from '../repository';

registerBusinessHandlers(cartHandlersEntry);