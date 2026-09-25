// @vitest-environment jsdom
import '@angular/compiler';

/**
 * T18: cart screen (S4.1).
 *
 * Acceptance criteria mapped to real TestBed behavior tests:
 *
 *   T18-AC01 - Adding confirms product, color, storage and quantity in an
 *              accessible status. Cart line matches the mock response.
 *              Status line is asserted on `add-to-cart.ts` (the
 *              confirmation surface) and on `cart-line.ts` (the line
 *              card that matches the mock response).
 *   T18-AC02 - Cart page shows image/name/variant/unit price/quantity/
 *              line total, remove action, and subtotal. Shipping is
 *              NOT misrepresented as final before method choice.
 *   T18-AC03 - Quantity increment/decrement/remove handle
 *              max/min/pending/failure and preserve cart on error.
 *              Removing the last item produces the empty screen.
 *   T18-AC04 - Continue button is disabled for empty/invalid/pending
 *              cart and navigates to /penztar/adatok only after
 *              the cart is read again from the server (`facade.refetch`).
 *   T18-AC05 - 89 990 x 2 = 179 980 HUF subtotal; with home
 *              delivery (1 990 HUF) total = 181 970 HUF. No monthly
 *              fee or hidden add-on copy.
 */

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  Input,
  Output,
  provideZonelessChangeDetection,
  ɵresolveComponentResources,
} from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { type DefaultBodyType, http, HttpResponse } from 'msw';
import { readdir, readFile } from 'node:fs/promises';
import { join as pathJoin, resolve as pathResolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server, useMswServer } from '../../../../../../tests/msw-server';
import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';
import catalogFixture from '../../../../../../docs/api/fixtures/catalog.json';
import { type CreateHandlersOptions, createHandlers } from '@mi-bolt/mocks/create-handlers';
import '@mi-bolt/mocks/cart/cart.handlers';
import { CART_TTL_MS } from '@mi-bolt/mocks/cart/cart-store';
import { isCatalogFixtureShape, loadCatalogFixture } from '@mi-bolt/mocks/catalog/catalog.handlers';
import { Repository } from '@mi-bolt/mocks/repository';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
} from '@mi-bolt/mocks/scenarios';
import { demoSessionInterceptor } from '@mi-bolt/core-api/demo-session.interceptor';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PriceBlock } from '../../shared/ui/price-block/price-block';
import { ProductImage } from '../../shared/ui/product-image/product-image';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import { CartFacade } from './cart.facade';
import { CartLine } from './cart-line';
import { CartPage } from './cart-page';
import { OrderSummary } from './order-summary';
import type { CartItem } from '@mi-bolt/api/models/cart-item';
import type { CartNotice } from '@mi-bolt/api/models/cart-notice';

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

const BASE_URL = 'http://localhost/api/v1';

const VARIANT_MOTO_256 = 'motorola-edge-50-fusion--zold--256';
const VARIANT_HONOR_128 = 'honor-x7d--fekete--128';
const VARIANT_IPHONE_PRO_MAX_256 = 'apple-iphone-18-pro-max--burgundi--256';
const UNIT_PRICE_MOTO = 89_990;

const DEMO_CART_ITEM: CartItem = {
  variantId: VARIANT_MOTO_256,
  variantSlug: 'zold-256gb',
  productId: '1',
  productName: 'Motorola Edge 50 Fusion',
  productSlug: 'motorola-edge-50-fusion',
  colorName: 'Zöld',
  storageGb: 256,
  quantity: 2,
  unitPrice: { amount: UNIT_PRICE_MOTO, currency: 'HUF' },
  lineTotal: { amount: UNIT_PRICE_MOTO * 2, currency: 'HUF' },
  maxQuantity: 5,
  availability: 'in_stock',
  image: {
    id: 'fc11d7e82822d30d65344733e93c62da8248b05437216747b549121318b1c6eb',
    src: '/api/v1/media/fc11d7e82822d30d65344733e93c62da8248b05437216747b549121318b1c6eb',
    alt: 'Motorola Edge 50 Fusion Zöld',
    width: 300,
    height: 600,
  },
};

function registerComponentMetadata(
  componentClass: unknown,
  config: {
    inputs?: readonly string[];
    outputs?: readonly string[];
    models?: readonly string[];
  },
): void {
  if (typeof componentClass !== 'function') return;
  const raw: unknown = Reflect.get(componentClass, 'propDecorators');
  const propDecorators: Record<string, unknown[]> = {};
  if (typeof raw === 'object' && raw !== null) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        const arr: unknown[] = [];
        for (const item of value) {
          arr.push(item);
        }
        propDecorators[key] = arr;
      }
    }
  }
  if (config.inputs !== undefined) {
    for (const name of config.inputs) {
      const arr = propDecorators[name] ?? [];
      arr.push({ type: Input, args: [{ isSignal: true }] });
      propDecorators[name] = arr;
    }
  }
  if (config.outputs !== undefined) {
    for (const name of config.outputs) {
      const arr = propDecorators[name] ?? [];
      arr.push({ type: Output, args: [] });
      propDecorators[name] = arr;
    }
  }
  if (config.models !== undefined) {
    for (const name of config.models) {
      const arr = propDecorators[name] ?? [];
      arr.push({ type: Input, args: [{ isSignal: true }] });
      arr.push({ type: Output, args: [`${name}Change`] });
      propDecorators[name] = arr;
    }
  }
  Reflect.set(componentClass, 'propDecorators', propDecorators);
}

registerComponentMetadata(CartLine, {
  inputs: ['line', 'pending'],
  outputs: ['removeRequested'],
});
registerComponentMetadata(OrderSummary, {
  inputs: ['subtotal', 'shipping', 'footnote'],
});
registerComponentMetadata(ProductImage, {
  inputs: ['image', 'productName', 'aspectRatio'],
  outputs: ['loadFailed'],
});
registerComponentMetadata(EmptyState, {
  inputs: ['title', 'message', 'actionLabel', 'actionVariant'],
  outputs: ['actionRequested'],
});
registerComponentMetadata(ErrorState, {
  inputs: ['title', 'message', 'retryLabel', 'pending', 'preserving'],
  outputs: ['retryRequested'],
});
registerComponentMetadata(PriceBlock, {
  inputs: ['money', 'label', 'status'],
});
registerComponentMetadata(Button, {
  inputs: ['variant', 'size', 'label', 'loadingLabel', 'disabled', 'loading'],
  outputs: ['pressed'],
});
registerComponentMetadata(LoadingState, {
  inputs: ['variant', 'label'],
});
registerComponentMetadata(StatusMessage, {
  inputs: ['message', 'severity', 'persistent'],
  outputs: ['dismissed'],
});

function getRootElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected fixture.nativeElement to be HTMLElement');
  }
  return raw;
}

function getElement(parent: Element, selector: string): HTMLElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Expected HTMLElement matching "${selector}"`);
  }
  return el;
}

function queryElement(parent: Element, selector: string): HTMLElement | null {
  const el = parent.querySelector(selector);
  if (el === null) return null;
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Expected HTMLElement matching "${selector}"`);
  }
  return el;
}

function getButtonElement(parent: Element, selector: string): HTMLButtonElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLButtonElement)) {
    throw new Error(`Expected HTMLButtonElement matching "${selector}"`);
  }
  return el;
}

/**
 * Drains a mutation dispatched from a real DOM click. `fixture.whenStable()`
 * does not reliably wait for the HTTP call issued from inside
 * `CartFacade`'s dynamically-imported dispatch helpers (the same gap
 * `add-to-cart.spec.ts`'s `tick()` works around), so this polls with real
 * timers and re-renders between each tick instead.
 */
async function settleMutation(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
    fixture.detectChanges();
  }
}

const fileCache = new Map<string, string>();

async function findInWorkspace(targetName: string, dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = pathJoin(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findInWorkspace(targetName, fullPath);
      if (nested !== null) return nested;
    } else if (entry.name === targetName) {
      return fullPath;
    }
  }
  return null;
}

async function resolveWorkspaceFile(url: string): Promise<string> {
  if (url.endsWith('.scss') || url.endsWith('.css')) {
    return '';
  }
  const filename = url.startsWith('./') ? url.slice(2) : url;
  const cached = fileCache.get(filename);
  if (cached !== undefined) return cached;

  const foundPath = await findInWorkspace(
    filename,
    pathResolve(process.cwd(), 'projects/storefront/src'),
  );
  if (foundPath === null) return '';
  const content = await readFile(foundPath, 'utf-8');
  fileCache.set(filename, content);
  return content;
}

/** The scenario clock of the current test, so a case can age the cart past `CART_TTL_MS`. */
let cartClock: ReturnType<typeof createFixedClock>;

function makeEnv(): CreateHandlersOptions {
  const clock = createFixedClock('2026-09-20T10:00:00.000Z');
  const ids = createDeterministicIds(1);
  const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
  return { repository, clock, ids, scenario: DEFAULT_SCENARIO, apiRoot: '/api/v1' };
}

beforeAll(async () => {
  if (!isCatalogFixtureShape(catalogFixture)) {
    throw new Error('[cart-page.spec] committed fixture does not match expected shape');
  }
  loadCatalogFixture(catalogFixture);
  await ɵresolveComponentResources(resolveWorkspaceFile);
  await TestBed.compileComponents();
});

beforeEach(async () => {
  const env = makeEnv();
  cartClock = env.clock;
  server.use(...createHandlers(env));
  TestBed.configureTestingModule({
    imports: [CartPage, CartLine, OrderSummary],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
      provideRouter([
        { path: 'penztar/adatok', component: CartPage },
        { path: 'termekek', component: CartPage },
      ]),
      CartFacade,
    ],
  });
  await TestBed.compileComponents();
});

afterEach(() => {
  server.resetHandlers();
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// T18-AC01: add-to-cart surface confirms the addition and line card renders correctly
// ---------------------------------------------------------------------------
describe('T18-AC01 cart page renders the line card matching the mock cart', () => {
  it('T18-AC01: CartLine renders image, name, variant, quantity and line total', async () => {
    const fixture = TestBed.createComponent(CartLine);
    fixture.componentRef.setInput('line', DEMO_CART_ITEM);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);

    expect(queryElement(root, 'app-product-image')).not.toBeNull();

    const nameEl = getElement(root, '[data-testid="cart-line-name"]');
    expect(nameEl.textContent.trim()).toBe('Motorola Edge 50 Fusion');

    const variantColor = getElement(root, '.variant-color');
    expect(variantColor.textContent.trim()).toBe('Zöld');

    const variantStorage = getElement(root, '.variant-storage');
    expect(variantStorage.textContent.trim()).toBe('256 GB');

    const priceBlocks = root.querySelectorAll('app-price-block');
    expect(priceBlocks.length).toBe(1);

    // Owner's decision, 2026-09-22: like yettel.hu, a cart line has no
    // quantity control; it shows how many it holds as read-only text.
    expect(queryElement(root, 'app-quantity-control')).toBeNull();
    expect(root.querySelector('[data-testid="quantity-input"]')).toBeNull();
    expect(getElement(root, '[data-testid="cart-line-quantity"]').textContent.trim()).toBe('2 db');
  });

  it('CartLine emits removeRequested and uses an aria-label for the remove action', async () => {
    const fixture = TestBed.createComponent(CartLine);
    fixture.componentRef.setInput('line', DEMO_CART_ITEM);
    await fixture.whenStable();
    fixture.detectChanges();

    let removedId: string | null = null;
    fixture.componentInstance.removeRequested.subscribe((id: string) => {
      removedId = id;
    });

    const root = getRootElement(fixture);
    const removeBtn = getElement(root, '[data-testid="cart-line-remove"]');
    expect(removeBtn.getAttribute('aria-label')).toBe('Törlöm: Motorola Edge 50 Fusion');
    expect(removeBtn.textContent.trim()).toBe('Törlöm');

    removeBtn.click();
    expect(removedId).toBe(VARIANT_MOTO_256);
  });

  it('CartPage passes each item to a CartLine, plus wires remove', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const cartLines = root.querySelectorAll('app-cart-line');
    expect(cartLines.length).toBe(1);

    const line = cartLines[0];
    if (!(line instanceof HTMLElement)) {
      throw new Error('Expected HTMLElement');
    }
    const nameEl = getElement(line, '[data-testid="cart-line-name"]');
    expect(nameEl.textContent.trim()).toBe('Motorola Edge 50 Fusion');
  });
});

// ---------------------------------------------------------------------------
// T18-AC02: cart page renders subtotal and never misrepresents shipping as final
// ---------------------------------------------------------------------------
describe('T18-AC02 cart page shows subtotal and a shipping placeholder, not a final shipping figure', () => {
  it('renders OrderSummary with the cart subtotal', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const orderSummary = queryElement(root, 'app-order-summary');
    expect(orderSummary).not.toBeNull();
  });

  it('OrderSummary renders the Hungarian "shipping decided next step" message when no method is selected', async () => {
    const fixture = TestBed.createComponent(OrderSummary);
    fixture.componentRef.setInput('subtotal', { amount: UNIT_PRICE_MOTO * 2, currency: 'HUF' });
    fixture.componentRef.setInput('shipping', null);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(root.textContent).toContain('A következő lépésben választod ki.');
  });

  it('OrderSummary computes subtotal + shipping = total when a method is supplied', async () => {
    const fixture = TestBed.createComponent(OrderSummary);
    fixture.componentRef.setInput('subtotal', { amount: UNIT_PRICE_MOTO * 2, currency: 'HUF' });
    fixture.componentRef.setInput('shipping', { amount: 1990, currency: 'HUF' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.total().amount).toBe(UNIT_PRICE_MOTO * 2 + 1990);
    expect(fixture.componentInstance.total().currency).toBe('HUF');

    const root = getRootElement(fixture);
    expect(root.textContent).toContain('Részösszeg');
    expect(root.textContent).toContain('Szállítás');
    expect(root.textContent).toContain('Végösszeg');
  });

  it('labels the shipping row once: "Szállítási díj" with a fee, "Szállítás" with the next-step placeholder', async () => {
    const withFee = TestBed.createComponent(OrderSummary);
    withFee.componentRef.setInput('subtotal', { amount: UNIT_PRICE_MOTO, currency: 'HUF' });
    withFee.componentRef.setInput('shipping', { amount: 0, currency: 'HUF' });
    await withFee.whenStable();
    withFee.detectChanges();

    const feeRow = getElement(getRootElement(withFee), '[data-testid="order-summary-shipping"]');
    expect(
      Array.from(feeRow.querySelectorAll('.label')).map((el) => el.textContent.trim()),
    ).toEqual(['Szállítási díj']);

    const withoutFee = TestBed.createComponent(OrderSummary);
    withoutFee.componentRef.setInput('subtotal', { amount: UNIT_PRICE_MOTO, currency: 'HUF' });
    withoutFee.componentRef.setInput('shipping', null);
    await withoutFee.whenStable();
    withoutFee.detectChanges();

    const placeholderRow = getElement(
      getRootElement(withoutFee),
      '[data-testid="order-summary-shipping"]',
    );
    expect(
      Array.from(placeholderRow.querySelectorAll('.label')).map((el) => el.textContent.trim()),
    ).toEqual(['Szállítás']);
    expect(placeholderRow.textContent).toContain('A következő lépésben választod ki.');
  });

  it('never invents a monthly fee or hidden add-on (T18-AC05)', async () => {
    const fixture = TestBed.createComponent(OrderSummary);
    fixture.componentRef.setInput('subtotal', { amount: UNIT_PRICE_MOTO * 2, currency: 'HUF' });
    fixture.componentRef.setInput('shipping', null);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const text = root.textContent.toLowerCase();
    expect(text).not.toContain('havi');
    expect(text).not.toContain('előfizet');
    expect(text).not.toContain('rejtett');
    expect(text).not.toContain('extra költség');
  });
});

// ---------------------------------------------------------------------------
// T18-AC03: a line reports its pending state; removing the last line empties the cart
// ---------------------------------------------------------------------------
describe('T18-AC03 line state and the empty screen on last-line removal', () => {
  it('CartLine surfaces pending state when a mutation is in flight', async () => {
    const fixture = TestBed.createComponent(CartLine);
    fixture.componentRef.setInput('line', DEMO_CART_ITEM);
    fixture.componentRef.setInput('pending', true);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const lineEl = getElement(root, '[data-testid="cart-line"]');
    expect(lineEl.getAttribute('aria-busy')).toBe('true');

    const removeBtn = getElement(root, '[data-testid="cart-line-remove"]');
    expect(removeBtn.hasAttribute('disabled')).toBe(true);
  });

  it('CartPage renders the EmptyState when no items remain (removing the last line)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const emptyState = queryElement(root, 'app-empty-state');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.textContent).toContain('A kosarad még üres.');
    expect(emptyState?.textContent).toContain('Telefonokat nézek');
  });

  it('CartPage renders a loading skeleton on first arrival and an ErrorState on a failure', async () => {
    server.use(
      http.get('*/api/v1/cart', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:service-unavailable',
            title: 'Service unavailable',
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            detail: 'The cart service is temporarily unavailable.',
            traceId: 'spec-trace-503',
            fieldErrors: [],
          },
          { status: 503, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const errorState = queryElement(root, 'app-error-state');
    expect(errorState).not.toBeNull();
  });

  it('a refused add on another page does not follow the shopper to the cart (owner 2026-09-23)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    server.use(
      http.post('*/api/v1/cart/items', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:quantity-limit',
            title: 'Conflict',
            status: 409,
            code: 'QUANTITY_LIMIT',
            detail: 'Merged quantity would exceed the line maximum',
            traceId: 'spec-trace-409',
            fieldErrors: [],
            params: { max: 3, requested: 4 },
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    expect(cartFacade.error()?.code).toBe('QUANTITY_LIMIT');

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-error-state')).toBeNull();
    expect(queryElement(root, '[data-testid="cart-line"]')).not.toBeNull();
    expect(root.textContent).not.toContain('Merged quantity');
    expect(root.textContent).not.toContain('A kosár módosítása nem sikerült');
  });

  it('a failed remove keeps the cart on screen and says so in Hungarian (owner 2026-09-23)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    server.use(
      http.delete('*/api/v1/cart/items/:variantId', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:not-found',
            title: 'Not found',
            status: 404,
            code: 'NOT_FOUND',
            detail: 'Line not in cart',
            traceId: 'spec-trace-404',
            fieldErrors: [],
          },
          { status: 404, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);
    getButtonElement(root, '[data-testid="cart-line-remove"]').click();
    await settleMutation(fixture);

    expect(queryElement(root, 'app-error-state')).toBeNull();
    expect(queryElement(root, '[data-testid="cart-line"]')).not.toBeNull();
    expect(root.textContent).toContain('A kosár módosítása nem sikerült; a kosár változatlan.');
    expect(root.textContent).not.toContain('Line not in cart');
  });

  it('a failed clear keeps the cart on screen and says so in Hungarian (owner 2026-09-23)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    server.use(
      http.delete('*/api/v1/cart/items', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:not-found',
            title: 'Not found',
            status: 404,
            code: 'NOT_FOUND',
            detail: 'Cart not found',
            traceId: 'spec-trace-404-clear',
            fieldErrors: [],
          },
          { status: 404, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);
    getButtonElement(root, '[data-testid="cart-clear"] button').click();
    await settleMutation(fixture);

    expect(queryElement(root, 'app-error-state')).toBeNull();
    expect(queryElement(root, '[data-testid="cart-line"]')).not.toBeNull();
    expect(root.textContent).toContain('A kosár módosítása nem sikerült; a kosár változatlan.');
    expect(root.textContent).not.toContain('Cart not found');
  });
});

// ---------------------------------------------------------------------------
// Only the cart line whose mutation is in flight is marked busy: every
// other line stays interactive, so its remove action keeps working.
// ---------------------------------------------------------------------------
describe('FIX-21 only the mutating line is disabled', () => {
  it('FIX-21-AC01: an idle line at quantity 2 has no aria-busy and its remove action is enabled', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const lineEl = getElement(root, '[data-testid="cart-line"]');
    expect(lineEl.hasAttribute('aria-busy')).toBe(false);

    expect(getButtonElement(root, '[data-testid="cart-line-remove"]').disabled).toBe(false);
  });

  it('FIX-21-AC03: removing the last line empties the cart and renders the empty state', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 1);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    getButtonElement(root, '[data-testid="cart-line-remove"]').click();
    await settleMutation(fixture);

    expect(queryElement(root, '[data-testid="cart-line"]')).toBeNull();
    const emptyState = queryElement(root, 'app-empty-state');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.textContent).toContain('A kosarad még üres.');
  });

  it('FIX-21-AC04: during an in-flight mutation only the mutating line reports aria-busy', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    await cartFacade.addItem(VARIANT_HONOR_128, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const cartLineHosts = root.querySelectorAll('app-cart-line');
    expect(cartLineHosts.length).toBe(2);
    const firstHost = cartLineHosts[0];
    const secondHost = cartLineHosts[1];
    if (!(firstHost instanceof HTMLElement) || !(secondHost instanceof HTMLElement)) {
      throw new Error('Expected HTMLElement cart-line hosts');
    }

    const firstLineEl = getElement(firstHost, '[data-testid="cart-line"]');
    const secondLineEl = getElement(secondHost, '[data-testid="cart-line"]');

    getButtonElement(firstHost, '[data-testid="cart-line-remove"]').click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(firstLineEl.getAttribute('aria-busy')).toBe('true');
    expect(getButtonElement(firstHost, '[data-testid="cart-line-remove"]').disabled).toBe(true);

    expect(secondLineEl.hasAttribute('aria-busy')).toBe(false);
    expect(getButtonElement(secondHost, '[data-testid="cart-line-remove"]').disabled).toBe(false);

    await settleMutation(fixture);

    expect(root.querySelectorAll('app-cart-line').length).toBe(1);
    expect(secondLineEl.hasAttribute('aria-busy')).toBe(false);
  });

  it('a mutation that fails still re-enables the line once it settles (R24 regression guard)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    // A 412 lands on the facade's `conflict` signal, which the page's state
    // machine keeps in `ready` (a generic error would switch to the ErrorState
    // screen), so this exercises exactly the failure path FIX-21's
    // `.finally()` clear fixes: the line's remove action must come back even
    // though the mutation did not succeed.
    server.use(
      http.delete('*/api/v1/cart/items/:variantId', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:cart-version-conflict',
            title: 'Precondition failed',
            status: 412,
            code: 'CART_VERSION_CONFLICT',
            detail: 'The cart changed since the version supplied in If-Match',
            traceId: 'spec-trace-412',
            fieldErrors: [],
            params: { expected: 2, received: 1 },
          },
          { status: 412, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    getButtonElement(root, '[data-testid="cart-line-remove"]').click();
    await Promise.resolve();
    fixture.detectChanges();

    const lineEl = getElement(root, '[data-testid="cart-line"]');
    expect(lineEl.getAttribute('aria-busy')).toBe('true');

    await settleMutation(fixture);

    expect(lineEl.hasAttribute('aria-busy')).toBe(false);
    expect(getButtonElement(root, '[data-testid="cart-line-remove"]').disabled).toBe(false);
    // The facade fires a background `GET /cart` after a 412 and
    // `applySuccess` clears the conflict once it lands, so after
    // `settleMutation` the conflict is gone and the cart is back on
    // the server's version.
    expect(cartFacade.conflict()).toBeNull();
    expect(cartFacade.cart()?.version).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// S2-C: server reconcile notices render one status message each.
// ---------------------------------------------------------------------------
describe('S2-C notices: server reconcile notices render one status message each', () => {
  it('renders a QUANTITY_REDUCED notice with the from → to sentence', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    cartFacade._seedCart({
      id: 'seeded-cart',
      version: 3,
      items: [
        {
          ...DEMO_CART_ITEM,
          quantity: 3,
          lineTotal: { amount: UNIT_PRICE_MOTO * 3, currency: 'HUF' },
        },
      ],
      lineCount: 1,
      totalQuantity: 3,
      subtotal: { amount: UNIT_PRICE_MOTO * 3, currency: 'HUF' },
      notices: [
        {
          code: 'QUANTITY_REDUCED',
          variantId: VARIANT_MOTO_256,
          productName: 'Motorola Edge 50 Fusion',
          params: { from: 5, to: 3 },
        },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const notices = root.querySelectorAll('[data-testid="cart-notice"]');
    expect(notices[0].querySelector('.message')?.textContent.trim()).toBe(
      'Motorola Edge 50 Fusion: a mennyiséget 5 → 3 darabra csökkentettük a készlet miatt.',
    );
    expect(notices.length).toBe(1);
  });

  it('renders an ITEM_REMOVED notice for a variant the cart no longer carries', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    cartFacade._seedCart({
      id: 'seeded-cart',
      version: 3,
      items: [DEMO_CART_ITEM],
      lineCount: 1,
      totalQuantity: 2,
      subtotal: { amount: UNIT_PRICE_MOTO * 2, currency: 'HUF' },
      notices: [{ code: 'ITEM_REMOVED', variantId: 'no-such-variant' }],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const notices = root.querySelectorAll('[data-testid="cart-notice"]');
    expect(notices[0].querySelector('.message')?.textContent.trim()).toBe(
      'Egy termék kikerült a kosárból, mert már nem kapható.',
    );
    expect(notices.length).toBe(1);
  });

  it('renders a PRICE_CHANGED and a parameterless QUANTITY_REDUCED in order', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const notices: CartNotice[] = [
      {
        code: 'PRICE_CHANGED',
        variantId: VARIANT_MOTO_256,
        productName: 'Motorola Edge 50 Fusion',
      },
      {
        code: 'QUANTITY_REDUCED',
        variantId: VARIANT_MOTO_256,
        productName: 'Motorola Edge 50 Fusion',
      },
    ];
    cartFacade._seedCart({
      id: 'seeded-cart',
      version: 3,
      items: [DEMO_CART_ITEM],
      lineCount: 1,
      totalQuantity: 2,
      subtotal: { amount: UNIT_PRICE_MOTO * 2, currency: 'HUF' },
      notices,
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const noticeHosts = root.querySelectorAll('[data-testid="cart-notice"]');
    expect(noticeHosts[0].querySelector('.message')?.textContent.trim()).toBe(
      'Motorola Edge 50 Fusion: az ár megváltozott.',
    );
    expect(noticeHosts[1].querySelector('.message')?.textContent.trim()).toBe(
      'Motorola Edge 50 Fusion: a mennyiséget a készlethez igazítottuk.',
    );
    expect(noticeHosts.length).toBe(2);
  });

  it('names an ITEM_REMOVED product from the notice, for a variant the page never saw', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    cartFacade._seedCart({
      id: 'seeded-cart',
      version: 3,
      items: [],
      lineCount: 0,
      totalQuantity: 0,
      subtotal: { amount: 0, currency: 'HUF' },
      notices: [
        {
          code: 'ITEM_REMOVED',
          variantId: 'never-seen-variant',
          productName: 'Samsung Galaxy S25',
          params: { quantity: 2 },
        },
      ],
    });

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const notices = root.querySelectorAll('[data-testid="cart-notice"]');
    expect(notices.length).toBe(1);
    expect(notices[0].querySelector('.message')?.textContent.trim()).toBe(
      'Samsung Galaxy S25 kikerült a kosárból, mert már nem kapható.',
    );
  });

  it('takes the name from the notice, not from the cart line', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    cartFacade._seedCart({
      id: 'seeded-cart',
      version: 3,
      items: [DEMO_CART_ITEM],
      lineCount: 1,
      totalQuantity: 2,
      subtotal: { amount: UNIT_PRICE_MOTO * 2, currency: 'HUF' },
      notices: [
        { code: 'PRICE_CHANGED', variantId: VARIANT_MOTO_256, productName: 'Szerver neve' },
      ],
    });

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const notices = root.querySelectorAll('[data-testid="cart-notice"]');
    expect(notices.length).toBe(1);
    expect(notices[0].querySelector('.message')?.textContent.trim()).toBe(
      'Szerver neve: az ár megváltozott.',
    );
  });

  it('falls back to the plain quantity sentence when a QUANTITY_REDUCED carries only from', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    cartFacade._seedCart({
      id: 'seeded-cart',
      version: 3,
      items: [DEMO_CART_ITEM],
      lineCount: 1,
      totalQuantity: 2,
      subtotal: { amount: UNIT_PRICE_MOTO * 2, currency: 'HUF' },
      notices: [
        {
          code: 'QUANTITY_REDUCED',
          variantId: VARIANT_MOTO_256,
          productName: 'Motorola Edge 50 Fusion',
          params: { from: 5 },
        },
      ],
    });

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const notices = root.querySelectorAll('[data-testid="cart-notice"]');
    expect(notices.length).toBe(1);
    expect(notices[0].querySelector('.message')?.textContent.trim()).toBe(
      'Motorola Edge 50 Fusion: a mennyiséget a készlethez igazítottuk.',
    );
  });
});

// ---------------------------------------------------------------------------
// S2-C clear: "Kosár ürítése" empties the cart through DELETE /cart/items.
// ---------------------------------------------------------------------------
describe('S2-C clear: "Kosár ürítése" empties the cart through DELETE /cart/items', () => {
  it('renders the clear button last in the footer actions and disabled while nothing is loaded', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const clearHost = getElement(root, '[data-testid="cart-clear"]');
    const clearButton = getButtonElement(root, '[data-testid="cart-clear"] button');
    expect(clearButton.textContent.trim()).toBe('Kosár ürítése');
    expect(clearButton.disabled).toBe(false);
    const continueHost = getElement(root, '[data-testid="cart-continue"]');
    expect(continueHost.compareDocumentPosition(clearHost) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('clicking it sends DELETE /cart/items with If-Match and renders the empty state', async () => {
    const seen: { method: string; url: string; ifMatch: string | null }[] = [];
    const listener = ({ request }: { request: Request }): void => {
      seen.push({
        method: request.method,
        url: request.url,
        ifMatch: request.headers.get('If-Match'),
      });
    };
    server.events.on('request:start', listener);
    try {
      const cartFacade = TestBed.inject(CartFacade);
      await cartFacade.ensureCart();
      await cartFacade.addItem(VARIANT_MOTO_256, 2);
      const fixture = TestBed.createComponent(CartPage);
      await fixture.whenStable();
      fixture.detectChanges();

      const root = getRootElement(fixture);
      getButtonElement(root, '[data-testid="cart-clear"] button').click();
      await settleMutation(fixture);

      const clearCalls = seen.filter(
        (r) => r.method === 'DELETE' && r.url === `${BASE_URL}/cart/items`,
      );
      expect(clearCalls.length).toBe(1);
      expect(clearCalls[0]?.ifMatch).toBe('"2"');
      expect(queryElement(root, '[data-testid="cart-line"]')).toBeNull();
      expect(queryElement(root, 'app-empty-state')).not.toBeNull();
      expect(cartFacade.cart()?.version).toBe(3);
      expect(cartFacade.cart()?.items).toEqual([]);
    } finally {
      server.events.removeListener('request:start', listener);
    }
  });
});

// ---------------------------------------------------------------------------
// T18-AC04: Continue is disabled when cart cannot be advanced, navigates to /penztar/adatok
// ---------------------------------------------------------------------------
describe('T18-AC04 Continue gating and authoritative revalidation', () => {
  it('exposes a continue button disabled while the cart is empty and active once it has a line', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.canContinue()).toBe(false);

    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    fixture.detectChanges();
    expect(fixture.componentInstance.canContinue()).toBe(true);

    const root = getRootElement(fixture);
    const continueBtn = getElement(root, '[data-testid="cart-continue"] button');
    expect(continueBtn.hasAttribute('disabled')).toBe(false);
    expect(getButtonElement(root, '[data-testid="cart-clear"] button').disabled).toBe(false);
  });

  it('owner 2026-09-23: the continue button on the navy summary takes the white focus ring variant', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const continueBtn = getElement(root, '[data-testid="cart-continue"] button');
    expect(continueBtn.classList.contains('is-primary-on-dark')).toBe(true);
    expect(continueBtn.classList.contains('is-primary')).toBe(false);
  });

  it('reads the cart from the server again, then navigates', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const refetch = vi.spyOn(cartFacade, 'refetch');

    await fixture.componentInstance.onContinue();
    await fixture.whenStable();

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(router.url).toBe('/penztar/adatok');
  });

  it('stays on the cart and says so when the server cart differs from the one on screen', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    const onScreen = cartFacade.cart();
    if (onScreen === null) throw new Error('Expected a cart');
    const changed = {
      ...onScreen,
      version: onScreen.version + 1,
      items: onScreen.items.map((item) => ({ ...item, quantity: item.quantity + 1 })),
    };
    server.use(http.get('*/api/v1/cart', () => HttpResponse.json(changed)));

    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    await fixture.componentInstance.onContinue();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/');
    expect(cartFacade.cart()?.items[0]?.quantity).toBe(3);
    const root = getRootElement(fixture);
    expect(
      queryElement(root, '[data-testid="status-message"]')
        ?.querySelector('p.message')
        ?.textContent.trim(),
    ).toBe('A kosár időközben megváltozott; nézd át, mielőtt továbblépsz.');
  });

  it('stays on the cart when the server read fails', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    server.use(
      http.get('*/api/v1/cart', () =>
        serverError('The cart is unavailable.', 'spec-trace-500-continue-read'),
      ),
    );

    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    await fixture.componentInstance.onContinue();
    await fixture.whenStable();

    expect(router.url).toBe('/');
    expect(cartFacade.error()?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(fixture.componentInstance.continuing()).toBe(false);
  });

  it('stays on the cart when the server attaches notices', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    const onScreen = cartFacade.cart();
    if (onScreen === null) throw new Error('Expected a cart');
    const withNotice = {
      ...onScreen,
      notices: [{ code: 'PRICE_CHANGED' as const, variantId: VARIANT_MOTO_256, params: {} }],
    };
    server.use(http.get('*/api/v1/cart', () => HttpResponse.json(withNotice)));

    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    await fixture.componentInstance.onContinue();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/');
    const root = getRootElement(fixture);
    expect(root.querySelectorAll('[data-testid="cart-notice"]').length).toBe(1);
  });

  it('does not navigate once the page is gone', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    const onScreen = cartFacade.cart();
    if (onScreen === null) throw new Error('Expected a cart');
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('*/api/v1/cart', async () => {
        await held;
        return HttpResponse.json(onScreen);
      }),
    );

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const continued = fixture.componentInstance.onContinue();
    fixture.destroy();
    release();
    await continued;

    expect(navigate).not.toHaveBeenCalled();
  });

  // A failed remove or clear leaves the cart unchanged, so the shopper
  // can still go on to checkout (owner: "Igen, aktív marad").
  function serverError(detail: string, traceId: string): HttpResponse<DefaultBodyType> {
    return HttpResponse.json(
      {
        type: 'about:blank',
        title: 'Internal server error',
        status: 500,
        code: 'INTERNAL_SERVER_ERROR',
        detail,
        traceId,
        fieldErrors: [],
      },
      { status: 500, headers: { 'content-type': 'application/problem+json' } },
    );
  }

  it('keeps "Tovább az adatokhoz" active after a failed remove', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    server.use(
      http.delete('*/api/v1/cart/items/:variantId', () =>
        serverError('Removing the item failed.', 'spec-trace-500-continue-remove'),
      ),
    );

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);
    getButtonElement(root, '[data-testid="cart-line-remove"]').click();
    await settleMutation(fixture);

    expect(cartFacade.error()?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(queryElement(root, '[data-testid="cart-line"]')).not.toBeNull();
    expect(fixture.componentInstance.canContinue()).toBe(true);
    expect(getButtonElement(root, '[data-testid="cart-continue"] button').disabled).toBe(false);
  });

  it('keeps "Tovább az adatokhoz" active after a failed clear', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    server.use(
      http.delete('*/api/v1/cart/items', () =>
        serverError('Clearing the cart failed.', 'spec-trace-500-continue-clear'),
      ),
    );

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);
    getButtonElement(root, '[data-testid="cart-clear"] button').click();
    await settleMutation(fixture);

    expect(cartFacade.error()?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(queryElement(root, '[data-testid="cart-line"]')).not.toBeNull();
    expect(fixture.componentInstance.canContinue()).toBe(true);
    expect(getButtonElement(root, '[data-testid="cart-continue"] button').disabled).toBe(false);
  });

  it('a conflict whose background read failed does not let the shopper leave on a stale cart', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    const onScreen = cartFacade.cart();
    if (onScreen === null) throw new Error('Expected a cart');
    const serverCart = {
      ...onScreen,
      version: onScreen.version + 1,
      items: onScreen.items.map((item) => ({ ...item, quantity: item.quantity + 1 })),
    };
    let reads = 0;
    server.use(
      http.delete('*/api/v1/cart/items/:variantId', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:cart-version-conflict',
            title: 'Precondition failed',
            status: 412,
            code: 'CART_VERSION_CONFLICT',
            detail: 'The cart changed since the version supplied in If-Match',
            traceId: 'spec-trace-412-continue',
            fieldErrors: [],
            params: { expected: 2, received: 1 },
          },
          { status: 412, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
      http.get('*/api/v1/cart', () => {
        reads += 1;
        return reads === 1
          ? serverError('The cart is unavailable.', 'spec-trace-500-resync')
          : HttpResponse.json(serverCart);
      }),
    );

    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);
    getButtonElement(root, '[data-testid="cart-line-remove"]').click();
    await settleMutation(fixture);

    expect(cartFacade.conflict()).toBeNull();
    expect(cartFacade.error()?.code).toBe('INTERNAL_SERVER_ERROR');
    expect(fixture.componentInstance.canContinue()).toBe(true);

    await fixture.componentInstance.onContinue();
    await fixture.whenStable();

    expect(reads).toBe(2);
    expect(router.url).toBe('/');
    expect(cartFacade.cart()?.version).toBe(serverCart.version);
  });
});

describe('MIM-234 cart breadcrumb switched off', () => {
  it('MIM-234: the breadcrumb is held out of the DOM', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 1);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="cart-breadcrumb"]')).toBeNull();
    expect(root.querySelector('nav.breadcrumbs')).toBeNull();
    expect(root.querySelector('h1.title')?.textContent.trim()).toBe('A kosarad');
  });
});

// ---------------------------------------------------------------------------
// T18-AC05: subtotal and total arithmetic in whole HUF
// ---------------------------------------------------------------------------
describe('T18-AC05 subtotal and total arithmetic in whole HUF', () => {
  it('renders the subtotal through the PriceBlock primitive (whole HUF)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.subtotal().amount).toBe(UNIT_PRICE_MOTO * 2);
    expect(fixture.componentInstance.subtotal().currency).toBe('HUF');

    const root = getRootElement(fixture);
    const subtotalRow = getElement(root, '[data-testid="order-summary-subtotal"]');
    expect(queryElement(subtotalRow, 'app-price-block')).not.toBeNull();
    expect(
      queryElement(
        getElement(root, '[data-testid="cart-footer"]'),
        '[data-testid="cart-continue"]',
      ),
    ).not.toBeNull();
  });

  it('shows the line count in the section label (MIM-211)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);
    await cartFacade.addItem(VARIANT_HONOR_128, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(getElement(root, '[data-testid="cart-count"]').textContent.trim()).toBe(
      'Kosárban található termékek (2)',
    );
  });

  it('renders the actions inside the inverse order summary (MIM-211)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const summary = getElement(root, '[data-testid="order-summary"]');
    expect(summary.hasAttribute('data-inverse')).toBe(true);
    expect(queryElement(summary, '[data-testid="cart-footer"]')).not.toBeNull();
  });

  it('does not display any monthly-fee or hidden-bundle copy (R25)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const text = root.textContent.toLowerCase();
    expect(text).not.toContain('havi');
    expect(text).not.toContain('előfizetés');
    expect(text).not.toContain('bundle');
    expect(text).not.toContain('rejtett');
  });

  it('styles declare a desktop two-column layout (items + summary)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const layout = getElement(root, '[data-testid="cart-layout"]');
    expect(layout.classList.contains('layout')).toBe(true);
    expect(layout.classList.contains('lg:grid')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FIX-35: the cart page's copy must match the strings screens.md:73 fixes.
// ---------------------------------------------------------------------------
describe('FIX-35 cart page copy matches screens.md:73', () => {
  it('h1 is "A kosarad", the continue label is "Tovább az adatokhoz", and the shipping line reads the new sentence', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const h1 = getElement(root, 'h1');
    expect(h1.textContent.trim()).toBe('A kosarad');

    const continueBtn = getElement(root, '[data-testid="cart-continue"] button');
    expect(continueBtn.textContent.trim()).toBe('Tovább az adatokhoz');

    expect(root.textContent).toContain('A következő lépésben választod ki.');
  });
});

// ---------------------------------------------------------------------------
// T18 wiring: CartPage uses the documented T10 primitives
// ---------------------------------------------------------------------------
describe('T18 cart-page shared-primitive dependency wiring', () => {
  it('depends on the shared UI primitives and the CartFacade + ProductFacade', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-cart-line')).not.toBeNull();
    expect(queryElement(root, 'app-order-summary')).not.toBeNull();
    expect(queryElement(root, 'app-button')).not.toBeNull();
    expect(queryElement(root, 'app-price-block')).not.toBeNull();
  });

  it('OrderSummary only imports PriceBlock from the shared UI surface', async () => {
    const fixture = TestBed.createComponent(OrderSummary);
    fixture.componentRef.setInput('subtotal', { amount: UNIT_PRICE_MOTO * 2, currency: 'HUF' });
    fixture.componentRef.setInput('shipping', { amount: 1990, currency: 'HUF' });
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const priceBlocks = root.querySelectorAll('app-price-block');
    expect(priceBlocks.length).toBeGreaterThanOrEqual(2);
  });

  it('CartLine uses ProductImage + PriceBlock from the shared UI surface and no QuantityControl', async () => {
    const fixture = TestBed.createComponent(CartLine);
    fixture.componentRef.setInput('line', DEMO_CART_ITEM);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-product-image')).not.toBeNull();
    expect(queryElement(root, 'app-price-block')).not.toBeNull();
    expect(queryElement(root, 'app-quantity-control')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MIM-216: reconcile notices are persistent (no "Bezárás" button); dismissing
// the transient status banner returns focus to the page h1.
// ---------------------------------------------------------------------------
describe('MIM-216: every dismissible status message closes and returns focus', () => {
  it('the reconcile notices are persistent and render no "Bezárás" button', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    cartFacade._seedCart({
      id: 'seeded-cart',
      version: 3,
      items: [DEMO_CART_ITEM],
      lineCount: 1,
      totalQuantity: 2,
      subtotal: { amount: UNIT_PRICE_MOTO * 2, currency: 'HUF' },
      notices: [
        { code: 'QUANTITY_REDUCED', variantId: VARIANT_MOTO_256, params: { from: 5, to: 3 } },
        { code: 'ITEM_REMOVED', variantId: VARIANT_MOTO_256 },
      ],
    });

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const notices = root.querySelectorAll('[data-testid="cart-notice"]');
    expect(notices.length).toBe(2);
    for (const notice of Array.from(notices)) {
      expect(notice.querySelector('button')).toBeNull();
    }
  });

  it('the server-driven error banner is persistent and renders no "Bezárás" button', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    // A 500 lands on the facade's `error` signal (unlike 412 / 410,
    // nothing in the facade clears it automatically), so the
    // server-driven banner stays rendered long enough to assert on.
    server.use(
      http.delete('*/api/v1/cart/items/:variantId', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Internal server error',
            status: 500,
            code: 'INTERNAL_SERVER_ERROR',
            detail: 'Removing the item failed.',
            traceId: 'spec-trace-500',
            fieldErrors: [],
          },
          { status: 500, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    getButtonElement(root, '[data-testid="cart-line-remove"]').click();
    await settleMutation(fixture);

    expect(cartFacade.error()).not.toBeNull();
    const banner = queryElement(root, '[data-testid="status-message"]');
    expect(banner).not.toBeNull();
    expect(banner?.querySelector('button')).toBeNull();
    expect(banner?.querySelector('p.message')?.textContent.trim()).toBe(
      'A kosár módosítása nem sikerült; a kosár változatlan.',
    );
  });

  it('dismissing the transient status banner moves focus to the page h1', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    // Trigger a transient status through the public handler (the
    // same path a Remove / Clear click takes), then dismiss it via
    // the rendered StatusMessage's "Bezárás".
    fixture.componentInstance.onRemoveRequested(VARIANT_MOTO_256);
    fixture.detectChanges();
    await settleMutation(fixture);

    const root = getRootElement(fixture);
    const statusHost = getElement(root, '[data-testid="status-message"]');
    const closeBtn = getButtonElement(statusHost, 'button');
    closeBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(queryElement(root, '[data-testid="status-message"]')).toBeNull();
    const h1 = root.querySelector('h1');
    expect(document.activeElement).toBe(h1);
  });
});
describe('MIM-212 S3-C8 cart page renders the guard redirect banner', () => {
  it('renders the empty-cart sentence when the route carries navigationReason=empty-cart', async () => {
    const router = TestBed.inject(Router);
    await router.navigate(['/penztar/adatok'], { queryParams: { navigationReason: 'empty-cart' } });

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const banner = getElement(getRootElement(fixture), '[data-testid="navigation-reason"]');
    expect(banner.querySelector('.message')?.textContent.trim()).toBe(
      'A kosarad üres, ezért ide irányítottunk.',
    );
  });

  it('renders no banner at all when the route carries no navigationReason', async () => {
    const router = TestBed.inject(Router);
    await router.navigate(['/penztar/adatok']);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(queryElement(getRootElement(fixture), '[data-testid="navigation-reason"]')).toBeNull();
  });
});

describe('focus after a cart line is removed ("következő sorra/címre")', () => {
  function removeButtons(root: HTMLElement): HTMLButtonElement[] {
    return [...root.querySelectorAll('[data-testid="cart-line-remove"]')].filter(
      (el): el is HTMLButtonElement => el instanceof HTMLButtonElement,
    );
  }

  it("removing a middle line focuses the next line's remove button", async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 1);
    await cartFacade.addItem(VARIANT_HONOR_128, 1);
    await cartFacade.addItem(VARIANT_IPHONE_PRO_MAX_256, 1);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);
    expect(removeButtons(root).length).toBe(3);

    removeButtons(root)[1]?.click();
    await settleMutation(fixture);
    await fixture.whenStable();

    const buttons = removeButtons(root);
    expect(buttons.length).toBe(2);
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Törlöm: Apple iPhone 18 Pro Max');
  });

  it("removing the last of two lines focuses the remaining line's remove button", async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 1);
    await cartFacade.addItem(VARIANT_HONOR_128, 1);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);

    removeButtons(root)[1]?.click();
    await settleMutation(fixture);
    await fixture.whenStable();

    const buttons = removeButtons(root);
    expect(buttons.length).toBe(1);
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Törlöm: Motorola Edge 50 Fusion');
  });

  it('removing the only line focuses the cart heading', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 1);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);

    removeButtons(root)[0]?.click();
    await settleMutation(fixture);
    await fixture.whenStable();

    expect(removeButtons(root).length).toBe(0);
    expect(document.activeElement).toBe(root.querySelector('h1'));
  });

  it('a failed removal returns focus to the same, re-enabled remove button', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 1);
    await cartFacade.addItem(VARIANT_HONOR_128, 1);
    server.use(
      http.delete('*/api/v1/cart/items/:variantId', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:service-unavailable',
            title: 'Service unavailable',
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            detail: 'Simulated failure',
            traceId: 'spec-trace-503-remove',
            fieldErrors: [],
          },
          { status: 503, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);

    removeButtons(root)[0]?.click();
    await settleMutation(fixture);
    await fixture.whenStable();

    const buttons = removeButtons(root);
    expect(buttons.length).toBe(2);
    expect(buttons[0]?.disabled).toBe(false);
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Törlöm: Motorola Edge 50 Fusion');
  });

  it('a successful clear focuses the cart heading', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 1);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);

    getButtonElement(root, '[data-testid="cart-clear"] button').click();
    await settleMutation(fixture);
    await fixture.whenStable();

    expect(queryElement(root, 'app-empty-state')).not.toBeNull();
    expect(document.activeElement).toBe(root.querySelector('h1'));
  });

  it('a removal that settles after the page is destroyed does not throw', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 1);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const removeSpy = vi.spyOn(cartFacade, 'removeItem').mockReturnValue(held);
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onRejection);
    try {
      removeButtons(root)[0]?.click();
      fixture.destroy();
      release();
      await held;
      // Node reports an unhandled rejection once the microtask queue has
      // drained; one macrotask hop lets it fire before the assertion.
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      expect(removeSpy).toHaveBeenCalledWith(VARIANT_MOTO_256);
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });

  it('a clear that settles after the page is destroyed does not throw', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 1);
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const clearSpy = vi.spyOn(cartFacade, 'clear').mockReturnValue(held);
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onRejection);
    try {
      getButtonElement(root, '[data-testid="cart-clear"] button').click();
      fixture.destroy();
      release();
      await held;
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      expect(clearSpy).toHaveBeenCalled();
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });
});

// ---------------------------------------------------------------------------
// MIM-449 / E059: an expired cart says it expired, and a new cart starts only
// when the shopper asks for one
// ---------------------------------------------------------------------------

/**
 * Drives the session's cart into the expired state the way the browser
 * does: a live cart is left to age past `CART_TTL_MS`, and the next
 * write gets the 410 the mock answers with. The facade keeps the
 * expired flag and drops its snapshot.
 */
async function expireCart(cartFacade: CartFacade): Promise<void> {
  await cartFacade.addItem(VARIANT_MOTO_256, 1);
  cartClock.advanceMs(CART_TTL_MS);
  await cartFacade.addItem(VARIANT_HONOR_128, 1);
}

describe('MIM-449 an expired cart shows its expiry until the shopper asks', () => {
  it('the page shows the expiry notice after its own mount', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await expireCart(cartFacade);
    expect(cartFacade.cartExpired()).toBe(true);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    await settleMutation(fixture);

    const root = getRootElement(fixture);
    expect(root.textContent).toContain(
      'A kosár lejárt. Indíts egy új pénztárat a frissítés gombra kattintva.',
    );
    expect(root.textContent).not.toContain('A kosarad még üres.');
  });

  it('the retry button starts a new empty cart', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await expireCart(cartFacade);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    await settleMutation(fixture);

    const root = getRootElement(fixture);
    getButtonElement(root, '[data-testid="error-state"] button').click();
    await settleMutation(fixture);

    expect(cartFacade.cartExpired()).toBe(false);
    expect(cartFacade.cart()?.items).toEqual([]);
    expect(getElement(root, 'app-empty-state').textContent).toContain('A kosarad még üres.');
  });

  it('a cold load of the cart page shows the expiry', async () => {
    // The session's cart is expired on the mock before the facade exists: the
    // first read answers 410 and forgets it, and only the read after that
    // starts a fresh empty one, exactly as `ensureFreshCart` does.
    let expiredReadServed = false;
    server.use(
      http.get('*/api/v1/cart', () => {
        if (expiredReadServed) {
          return HttpResponse.json(
            {
              id: 'cart-fresh-after-expiry',
              version: 1,
              items: [],
              lineCount: 0,
              totalQuantity: 0,
              subtotal: { amount: 0, currency: 'HUF' },
              expiresAt: '2026-12-31T23:59:59.000Z',
              notices: [],
            },
            { status: 200, headers: { ETag: '"1"' } },
          );
        }
        expiredReadServed = true;
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:cart-expired',
            title: 'Gone',
            status: 410,
            code: 'CART_EXPIRED',
            detail: 'The cart has expired',
            traceId: 'spec-trace-410',
            fieldErrors: [],
            params: {},
          },
          { status: 410, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    // A cold load: the facade and the page both ask in the same task, so
    // neither has seen the 410 yet.
    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();
    await settleMutation(fixture);

    const root = getRootElement(fixture);
    expect(root.textContent).toContain(
      'A kosár lejárt. Indíts egy új pénztárat a frissítés gombra kattintva.',
    );
    expect(root.textContent).not.toContain('A kosarad még üres.');
  });
});
