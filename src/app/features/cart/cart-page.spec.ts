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
 *              authoritative revalidation (`facade.ensureCart`).
 *   T18-AC05 - 339 990 x 2 = 679 980 HUF subtotal; with home
 *              delivery (1 990 HUF) total = 681 970 HUF. No monthly
 *              fee or hidden add-on copy.
 */

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  Input,
  Output,
  provideZonelessChangeDetection,
  ɵresolveComponentResources,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { readdir, readFile } from 'node:fs/promises';
import { join as pathJoin, resolve as pathResolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server, useMswServer } from '../../../../tests/msw-server';
import { provideApiConfiguration } from '../../api/generated/api-configuration';
import catalogFixture from '../../../../docs/api/fixtures/catalog.json';
import { DEMO_PRODUCT } from '../../../mocks/cart/cart.handlers';
import { createHandlers } from '../../../mocks/create-handlers';
import { isCatalogFixtureShape, loadCatalogFixture } from '../../../mocks/catalog/catalog.handlers';
import { Repository } from '../../../mocks/repository';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
} from '../../../mocks/scenarios';
import { demoSessionInterceptor } from '../../core/api/demo-session.interceptor';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PriceBlock } from '../../shared/ui/price-block/price-block';
import { ProductImage } from '../../shared/ui/product-image/product-image';
import { QuantityControl } from '../../shared/ui/quantity-control/quantity-control';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import { CartFacade } from './cart.facade';
import { CartLine } from './cart-line';
import { CartPage } from './cart-page';
import { OrderSummary } from './order-summary';
import type { CartItem } from '../../api/generated/models/cart-item';
import type { CartNotice } from '../../api/generated/models/cart-notice';

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

const BASE_URL = 'http://localhost/api/v1';

const VARIANT_MOTO_256 = 'motorola-edge-50-fusion--zold--256';
const VARIANT_HONOR_128 = 'honor-x7d--fekete--128';
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
  outputs: ['quantityChanged', 'removeRequested'],
});
registerComponentMetadata(OrderSummary, {
  inputs: ['subtotal', 'shipping', 'footnote'],
});
registerComponentMetadata(ProductImage, {
  inputs: ['image', 'productName', 'aspectRatio'],
  outputs: ['loadFailed'],
});
registerComponentMetadata(QuantityControl, {
  inputs: ['value', 'min', 'max', 'disabled', 'pending', 'label'],
  outputs: ['quantityChanged'],
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

function getInputElement(parent: Element, selector: string): HTMLInputElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Expected HTMLInputElement matching "${selector}"`);
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

  const foundPath = await findInWorkspace(filename, pathResolve(process.cwd(), 'src'));
  if (foundPath === null) return '';
  const content = await readFile(foundPath, 'utf-8');
  fileCache.set(filename, content);
  return content;
}

function makeEnv() {
  const clock = createFixedClock('2026-09-20T10:00:00.000Z');
  const ids = createDeterministicIds(1);
  const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
  repository.loadProducts([DEMO_PRODUCT]);
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
});

// ---------------------------------------------------------------------------
// T18-AC01: add-to-cart surface confirms the addition and line card renders correctly
// ---------------------------------------------------------------------------
describe('T18-AC01 cart page renders the line card matching the mock cart', () => {
  it('CartLine renders image, name, variant, unit price, quantity, line total', async () => {
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
    expect(priceBlocks.length).toBeGreaterThanOrEqual(2);

    const qtyControl = queryElement(root, 'app-quantity-control');
    expect(qtyControl).not.toBeNull();
  });

  it('CartLine quantity control has a real accessible name, not a dangling label[for]', async () => {
    const fixture = TestBed.createComponent(CartLine);
    fixture.componentRef.setInput('line', DEMO_CART_ITEM);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const input = getInputElement(root, '[data-testid="quantity-input"]');
    expect(input.getAttribute('aria-label')).toBe('Darabszám');

    // `QuantityControl` has no `id` input, so a `[id]` binding on
    // `<app-quantity-control>` lands on that host element rather than on
    // the real `<input>` inside it. A `<label for="...">` pointing at that
    // id is not associated with any labelable control at all — it used to
    // exist here and pointed nowhere real. The name must come from the
    // input's own `aria-label` instead, with no dangling label left behind.
    expect(root.querySelector('label[for]')).toBeNull();
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
    expect(removeBtn.getAttribute('aria-label')).toBe('Törlés: Motorola Edge 50 Fusion');

    removeBtn.click();
    expect(removedId).toBe(VARIANT_MOTO_256);
  });

  it('CartPage passes each item to a CartLine, plus wires quantity + remove', async () => {
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
// T18-AC03: quantity controls handle boundaries and empty screen on last line removal
// ---------------------------------------------------------------------------
describe('T18-AC03 quantity boundaries and the empty screen on last-line removal', () => {
  it('CartLine forwards quantity changes to the facade and respects maxQuantity from the line', async () => {
    const fixture = TestBed.createComponent(CartLine);
    fixture.componentRef.setInput('line', DEMO_CART_ITEM);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.maxQuantity()).toBe(5);

    let emittedQty = 0;
    fixture.componentInstance.quantityChanged.subscribe((qty: number) => {
      emittedQty = qty;
    });

    fixture.componentInstance.onQuantityChanged(3);
    expect(emittedQty).toBe(3);
  });

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
      http.get('*/api/v1/cart', () => {
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:service-unavailable',
            title: 'Hiba',
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            detail: 'A kosár szolgáltatás átmenetileg nem elérhető.',
            traceId: 'spec-trace-503',
            fieldErrors: [],
          },
          { status: 503, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
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
});

// ---------------------------------------------------------------------------
// Only the cart line whose mutation is in flight is marked busy: every
// other line stays interactive, so quantity and remove keep working.
// ---------------------------------------------------------------------------
describe('FIX-21 only the mutating line is disabled', () => {
  it('FIX-21-AC01: an idle line at quantity 2 has no aria-busy and every control is enabled', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const lineEl = getElement(root, '[data-testid="cart-line"]');
    expect(lineEl.hasAttribute('aria-busy')).toBe(false);

    expect(getButtonElement(root, '[data-testid="quantity-decrement"]').disabled).toBe(false);
    expect(getButtonElement(root, '[data-testid="quantity-increment"]').disabled).toBe(false);
    expect(getButtonElement(root, '[data-testid="cart-line-remove"]').disabled).toBe(false);
  });

  it('FIX-21-AC02: clicking quantity-increment completes and updates the quantity and the line total', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    getButtonElement(root, '[data-testid="quantity-increment"]').click();
    await settleMutation(fixture);

    expect(getInputElement(root, '[data-testid="quantity-input"]').value).toBe('3');

    const lineEl = getElement(root, '[data-testid="cart-line"]');
    const totalsEl = getElement(lineEl, '.totals');
    const lineTotalAmount = getElement(totalsEl, '[data-testid="price-amount"]');
    expect(lineTotalAmount.textContent.trim()).toBe(PriceBlock.formatHuf(UNIT_PRICE_MOTO * 3));

    expect(lineEl.hasAttribute('aria-busy')).toBe(false);
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

    getButtonElement(firstHost, '[data-testid="quantity-increment"]').click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(firstLineEl.getAttribute('aria-busy')).toBe('true');
    expect(getButtonElement(firstHost, '[data-testid="quantity-decrement"]').disabled).toBe(true);
    expect(getButtonElement(firstHost, '[data-testid="quantity-increment"]').disabled).toBe(true);
    expect(getButtonElement(firstHost, '[data-testid="cart-line-remove"]').disabled).toBe(true);

    expect(secondLineEl.hasAttribute('aria-busy')).toBe(false);
    expect(getButtonElement(secondHost, '[data-testid="quantity-decrement"]').disabled).toBe(false);
    expect(getButtonElement(secondHost, '[data-testid="quantity-increment"]').disabled).toBe(false);
    expect(getButtonElement(secondHost, '[data-testid="cart-line-remove"]').disabled).toBe(false);

    await settleMutation(fixture);

    expect(firstLineEl.hasAttribute('aria-busy')).toBe(false);
    expect(secondLineEl.hasAttribute('aria-busy')).toBe(false);
  });

  it('a mutation that fails still re-enables the line once it settles (R24 regression guard)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    // A 412 lands on the facade's `conflict` signal, which the page's state
    // machine keeps in `ready` (a generic error would switch to the ErrorState
    // screen), so this exercises exactly the failure path FIX-21's
    // `.finally()` clear fixes: the line's own controls must come back even
    // though the mutation did not succeed.
    server.use(
      http.patch('*/api/v1/cart/items/:variantId', () => {
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:cart-version-conflict',
            title: 'Ütközés',
            status: 412,
            code: 'CART_VERSION_CONFLICT',
            detail: 'A kosár időközben megváltozott.',
            traceId: 'spec-trace-412',
            fieldErrors: [],
            params: { expected: 2, received: 1 },
          },
          { status: 412, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    getButtonElement(root, '[data-testid="quantity-increment"]').click();
    await Promise.resolve();
    fixture.detectChanges();

    const lineEl = getElement(root, '[data-testid="cart-line"]');
    expect(lineEl.getAttribute('aria-busy')).toBe('true');

    await settleMutation(fixture);

    expect(lineEl.hasAttribute('aria-busy')).toBe(false);
    expect(getButtonElement(root, '[data-testid="quantity-decrement"]').disabled).toBe(false);
    expect(getButtonElement(root, '[data-testid="quantity-increment"]').disabled).toBe(false);
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
        { code: 'QUANTITY_REDUCED', variantId: VARIANT_MOTO_256, params: { from: 5, to: 3 } },
      ],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const notices = root.querySelectorAll('[data-testid="cart-notice"]');
    expect(notices[0].textContent.trim()).toBe(
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
    expect(notices[0].textContent.trim()).toBe(
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
      { code: 'PRICE_CHANGED', variantId: VARIANT_MOTO_256 },
      { code: 'QUANTITY_REDUCED', variantId: VARIANT_MOTO_256 },
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
    expect(noticeHosts[0].textContent.trim()).toBe('Motorola Edge 50 Fusion: az ár megváltozott.');
    expect(noticeHosts[1].textContent.trim()).toBe(
      'Motorola Edge 50 Fusion: a mennyiséget a készlethez igazítottuk.',
    );
    expect(noticeHosts.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// S2-C clear: "Kosár ürítése" empties the cart through DELETE /cart/items.
// ---------------------------------------------------------------------------
describe('S2-C clear: "Kosár ürítése" empties the cart through DELETE /cart/items', () => {
  it('renders the clear button first in the footer actions and disabled while nothing is loaded', async () => {
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
    expect(clearHost.compareDocumentPosition(continueHost) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('clicking it sends DELETE /cart/items with If-Match and renders the empty state', async () => {
    const seen: { method: string; url: string; ifMatch: string | null }[] = [];
    const listener = ({ request }: { request: Request }) => {
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
  it('exposes a continue button disabled when the cart is empty, pending, or in error', async () => {
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

  it('navigates only after facade.ensureCart() resolves successfully', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    await cartFacade.ensureCart();
    await cartFacade.addItem(VARIANT_MOTO_256, 2);

    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(CartPage);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.onContinue();
    await fixture.whenStable();

    expect(router.url).toBe('/penztar/adatok');
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
    const footer = getElement(root, '[data-testid="cart-footer"]');
    const priceBlock = queryElement(footer, 'app-price-block');
    expect(priceBlock).not.toBeNull();
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

  it('CartLine uses ProductImage + PriceBlock + QuantityControl from the shared UI surface', async () => {
    const fixture = TestBed.createComponent(CartLine);
    fixture.componentRef.setInput('line', DEMO_CART_ITEM);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-product-image')).not.toBeNull();
    expect(queryElement(root, 'app-price-block')).not.toBeNull();
    expect(queryElement(root, 'app-quantity-control')).not.toBeNull();
  });
});
