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
 * `VARIANTS` / `DEMO_PRODUCT` / `ensureFixture(repository)` are kept
 * because the checkout, payment and order mocks and their specs
 * still read the seeded `Repository` product. S3 migrates those.
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
import { isRecord } from '../is-record';
import { type Product, Repository } from '../repository';

import type { Problem } from '../../app/api/generated/models/problem';
import { buildTraceId, CartStore } from './cart-store';
import { catalogStore } from '../catalog/catalog.handlers';

/** Cross-handler reference to the cart store; consumed by the checkout and order mocks. */
export const cartStore: { current: CartStore | null } = { current: null };

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

/**
 * Resolve the loaded catalogue store; throw when no fixture was
 * loaded. The cart handlers cannot answer a request without it.
 */
function requireCatalog(): NonNullable<typeof catalogStore.current> {
  if (!catalogStore.current) {
    throw new Error('[cart.handlers] catalog store has not been loaded');
  }
  return catalogStore.current;
}

const PROBLEM_CONTENT_TYPE = 'application/problem+json' as const;

/** Map an outcome onto the matching `HttpResponse`. */
function outcomeResponse(outcome: ReturnType<CartStore['get']>): HttpResponse<DefaultBodyType> {
  if (outcome.ok) {
    return HttpResponse.json(outcome.cart, {
      status: 200,
      headers: { ETag: `"${String(outcome.cart.version)}"` },
    });
  }
  return HttpResponse.json(outcome.problem, {
    status: outcome.problem.status,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  });
}

/** 400 problem for a missing or malformed input. */
function invalidRequest(
  options: CreateHandlersOptions,
  detail: string,
  params: Record<string, unknown>,
): HttpResponse<DefaultBodyType> {
  const body: Problem = {
    type: 'urn:mi-bolt:problem:invalid-request',
    title: 'Invalid request',
    status: 400,
    code: 'INVALID_REQUEST',
    detail,
    traceId: buildTraceId(options),
    fieldErrors: [],
    params,
  };
  return HttpResponse.json(body, {
    status: 400,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  });
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
  const { repository } = options;
  ensureFixture(repository);

  const store = new CartStore(options, (id) => requireCatalog().getVariant(id));
  cartStore.current = store;

  if (options.snapshot?.cart) {
    store.seedFromSnapshot(options.snapshot.simulatedSessionId, options.snapshot.cart);
  }

  const getCart: RequestHandler = http.get('*/api/v1/cart', ({ request }) => {
    const sessionId = request.headers.get('X-Demo-Session');
    if (sessionId === null) {
      return invalidRequest(options, 'Missing X-Demo-Session header', {});
    }
    return outcomeResponse(store.get(sessionId));
  });

  const addCartItem: RequestHandler = http.post('*/api/v1/cart/items', async ({ request }) => {
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
    const ifMatch = request.headers.get('If-Match');
    const outcome = store.clear(sessionId, ifMatch);
    if (outcome.ok) options.persist?.(sessionId);
    return outcomeResponse(outcome);
  });

  const setCartItemQuantity: RequestHandler = http.patch(
    '*/api/v1/cart/items/:variantId',
    async ({ request, params }) => {
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
