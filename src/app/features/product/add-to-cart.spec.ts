// @vitest-environment jsdom
import '@angular/compiler';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  Component,
  Input,
  Output,
  provideZonelessChangeDetection,
  signal,
  ɵresolveComponentResources,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { readdir, readFile } from 'node:fs/promises';
import { join as pathJoin, resolve as pathResolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { provideApiConfiguration } from '../../api/generated/api-configuration';
import type { Cart } from '../../api/generated/models/cart';
import type { CartItem } from '../../api/generated/models/cart-item';
import { demoSessionInterceptor } from '../../core/api/demo-session.interceptor';
import { Button } from '../../shared/ui/button/button';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import { CartFacade } from '../cart/cart.facade';
import { AddToCart, type AddToCartSelection } from './add-to-cart';

/**
 * T18 - add-to-cart surface on the product page.
 *
 * Acceptance criteria mapped to behavior tests:
 *
 *   T18-AC01 - Adding confirms product, color, storage and quantity
 *              in an accessible status message (StatusMessage from
 *              T10). Cart badge and cart line match the mock response.
 *   T18-AC02 - (cart page owns this; add-to-cart does not duplicate.)
 *   T18-AC03 - (cart page owns the quantity controls.)
 *   T18-AC04 - (cart page owns the Continue gating.)
 *   T18-AC05 - Subtotal/total arithmetic lives in the cart page.
 *
 * The add-to-cart component is the source of truth for the
 * "A termek a kosarban van." confirmation: it must call the
 * CartFacade (addItem(variantId, quantity)), surface a
 * StatusMessage whose text names the product, the color, the storage
 * and the quantity, and never invent numbers or urgency.
 */

const BASE_URL = 'http://localhost/api/v1';

const sampleSelection: AddToCartSelection = {
  variantId: 'demo-one-5g-graphite-256',
  quantity: 2,
  productName: 'Demo One 5G',
  colorName: 'Grafit',
  storageGb: 256,
} satisfies AddToCartSelection;

function makeMockCartItem(variantId: string, quantity: number): CartItem {
  return {
    id: `item-${variantId}`,
    variantId,
    productId: 'demo-one-5g',
    productName: 'Demo One 5G',
    productSlug: 'demo-one-5g',
    colorName: 'Grafit',
    storageGb: 256,
    quantity,
    maxQuantity: 5,
    availability: 'in_stock',
    image: {
      id: 'img-1',
      src: '/assets/products/graphite-front.webp',
      alt: 'Demo One 5G Grafit',
      width: 320,
      height: 400,
    },
    unitPrice: { amount: 339990, currency: 'HUF' },
    lineTotal: { amount: 339990 * quantity, currency: 'HUF' },
  } satisfies CartItem;
}

function makeMockCart(cartId: string, version: number, items: readonly CartItem[]): Cart {
  let count = 0;
  let subtotalAmount = 0;
  for (const item of items) {
    count += item.quantity;
    subtotalAmount += item.lineTotal.amount;
  }
  return {
    id: cartId,
    version,
    status: 'active',
    items: [...items],
    itemCount: count,
    subtotal: { amount: subtotalAmount, currency: 'HUF' },
    expiresAt: '2026-12-31T23:59:59.000Z',
  } satisfies Cart;
}

interface CapturedRequest {
  readonly method: string;
  readonly url: string;
  readonly bodyText: string;
  readonly headers: Record<string, string>;
}

const capturedRequests: CapturedRequest[] = [];
let currentCart: Cart | null = null;
let cartCounter = 0;

function parseJsonRecord(text: string): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw === 'object' && raw !== null) {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        result[k] = v;
      }
      return result;
    }
  } catch {
    // ignore
  }
  return {};
}

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

registerComponentMetadata(AddToCart, {
  inputs: ['selection', 'enabled'],
  outputs: ['added'],
});
registerComponentMetadata(Button, {
  inputs: ['variant', 'size', 'label', 'loadingLabel', 'disabled', 'loading', 'type'],
  outputs: ['pressed'],
});
registerComponentMetadata(StatusMessage, {
  inputs: ['message', 'severity', 'persistent'],
  outputs: ['dismissed'],
});

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

const server = setupServer();

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });

  await ɵresolveComponentResources(resolveWorkspaceFile);
  await TestBed.compileComponents();
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  capturedRequests.length = 0;
  cartCounter = 0;
  currentCart = null;

  server.resetHandlers(
    http.post(`${BASE_URL}/carts`, async ({ request }) => {
      const bodyText = await request.text();
      const headers: Record<string, string> = {};
      request.headers.forEach((v, k) => {
        headers[k] = v;
      });
      capturedRequests.push({ method: 'POST', url: request.url, bodyText, headers });

      cartCounter += 1;
      const cart = makeMockCart(`cart-test-${String(cartCounter)}`, 1, []);
      currentCart = cart;
      return HttpResponse.json(cart, { status: 201 });
    }),

    http.post(`${BASE_URL}/carts/:cartId/items`, async ({ request }) => {
      const bodyText = await request.text();
      const headers: Record<string, string> = {};
      request.headers.forEach((v, k) => {
        headers[k] = v;
      });
      capturedRequests.push({ method: 'POST', url: request.url, bodyText, headers });

      const parsed = parseJsonRecord(bodyText);
      const variantId = typeof parsed['variantId'] === 'string' ? parsed['variantId'] : 'unknown';
      const quantity = typeof parsed['quantity'] === 'number' ? parsed['quantity'] : 1;

      const baseCart = currentCart ?? makeMockCart('cart-test-1', 1, []);
      const newItem = makeMockCartItem(variantId, quantity);
      const updatedCart = makeMockCart(baseCart.id, baseCart.version + 1, [
        ...baseCart.items,
        newItem,
      ]);
      currentCart = updatedCart;
      return HttpResponse.json(updatedCart, { status: 200 });
    }),
  );
});

afterEach(() => {
  server.resetHandlers();
  TestBed.resetTestingModule();
});

@Component({
  imports: [AddToCart],
  template: `
    <app-add-to-cart
      [selection]="selection()"
      [enabled]="enabled()"
      (added)="onAdded($event)"
    ></app-add-to-cart>
  `,
})
class TestHostComponent {
  readonly selection = signal<AddToCartSelection>(sampleSelection);
  readonly enabled = signal<boolean>(true);
  readonly lastAdded = signal<CartItem | null>(null);

  onAdded(item: CartItem): void {
    this.lastAdded.set(item);
  }
}

@Component({
  imports: [AddToCart, Button],
  template: `
    <div class="cta-desktop">
      @if (selection(); as sel) {
        <app-add-to-cart [selection]="sel" [enabled]="enabled()" />
      } @else {
        <app-button
          [variant]="'primary'"
          [size]="'comfortable'"
          [label]="'Kosárba teszem'"
          [loadingLabel]="'Hozzáadás…'"
          [disabled]="true"
        ></app-button>
      }
    </div>
  `,
})
class CtaDesktopTestHostComponent {
  readonly selection = signal<AddToCartSelection | null>(null);
  readonly enabled = signal<boolean>(false);
}

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
  return raw;
}

function queryButton(parent: ParentNode, selector: string): HTMLButtonElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLButtonElement)) {
    throw new Error(`Expected HTMLButtonElement: ${selector}`);
  }
  return el;
}

async function createHarness(): Promise<{
  fixture: ComponentFixture<TestHostComponent>;
  host: TestHostComponent;
  root: HTMLElement;
  facade: CartFacade;
  tick: () => Promise<void>;
}> {
  TestBed.configureTestingModule({
    imports: [TestHostComponent, AddToCart, Button, StatusMessage],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
    ],
    teardown: { destroyAfterEach: true },
  });

  await TestBed.compileComponents();

  const fixture = TestBed.createComponent(TestHostComponent);
  const host = fixture.componentInstance;
  const facade = TestBed.inject(CartFacade);
  fixture.detectChanges();
  await fixture.whenStable();

  const tick = async (): Promise<void> => {
    for (let i = 0; i < 6; i += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      fixture.detectChanges();
    }
  };

  return {
    fixture,
    host,
    root: getRootElement(fixture),
    facade,
    tick,
  };
}

describe('T18-AC01 add-to-cart component behavior tests', () => {
  it('T18-AC01: renders a StatusMessage after a successful add naming product, color, storage, quantity', async () => {
    const { root, tick } = await createHarness();

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    expect(button.textContent).toContain('Kosárba teszem');
    button.click();
    await tick();

    const statusEl = root.querySelector('[data-testid="status-message"]');
    expect(statusEl).not.toBeNull();
    const text = statusEl?.textContent ?? '';
    expect(text).toContain('Demo One 5G');
    expect(text).toContain('Grafit');
    expect(text).toContain('256 GB');
    expect(text).toContain('2 darab a kosárban.');
  });

  it('T18-AC01: passes confirmation through StatusMessage with role status and polite live region', async () => {
    const { root, tick } = await createHarness();

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    button.click();
    await tick();

    const statusEl = root.querySelector('[data-testid="status-message"]');
    expect(statusEl).not.toBeNull();
    expect(statusEl?.getAttribute('role')).toBe('status');
    expect(statusEl?.getAttribute('aria-live')).toBe('polite');
    expect(statusEl?.classList.contains('is-success')).toBe(true);
  });

  it('T18-AC01: calls CartFacade.addItem with selected variant id and quantity', async () => {
    const { root, tick } = await createHarness();

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    button.click();
    await tick();

    const addItemReq = capturedRequests.find((r) => r.url.includes('/items'));
    expect(addItemReq).toBeDefined();
    if (!addItemReq) throw new Error('addItem request not captured');
    expect(addItemReq.method).toBe('POST');
    const parsed = parseJsonRecord(addItemReq.bodyText);
    expect(parsed['variantId']).toBe('demo-one-5g-graphite-256');
    expect(parsed['quantity']).toBe(2);
  });

  it('T18-AC01: creates the cart lazily via CartFacade.ensureCart before the first add', async () => {
    const { root, tick } = await createHarness();

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    button.click();
    await tick();

    expect(capturedRequests.length).toBeGreaterThanOrEqual(2);
    const firstReq = capturedRequests[0];
    const secondReq = capturedRequests[1];
    expect(firstReq.url).toBe(`${BASE_URL}/carts`);
    expect(firstReq.method).toBe('POST');
    expect(secondReq.url).toContain('/items');
    expect(secondReq.method).toBe('POST');
  });

  it('T18-AC01: surfaces the cart line matching the mock response and emits added output', async () => {
    const { host, root, tick } = await createHarness();

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    button.click();
    await tick();

    const emitted = host.lastAdded();
    expect(emitted).not.toBeNull();
    if (!emitted) {
      throw new Error('Expected CartItem');
    }
    expect(emitted.variantId).toBe('demo-one-5g-graphite-256');
    expect(emitted.quantity).toBe(2);
    expect(emitted.unitPrice.amount).toBe(339990);
    expect(emitted.lineTotal.amount).toBe(679980);
  });

  it('T18-AC01: CartFacade cart snapshot and pending count update after item is added', async () => {
    const { facade, root, tick } = await createHarness();

    expect(facade.cart()).toBeNull();
    expect(facade.itemCount()).toBe(0);

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    button.click();
    await tick();

    expect(facade.cart()).not.toBeNull();
    expect(facade.itemCount()).toBe(2);
    expect(facade.subtotal().amount).toBe(679980);
    expect(facade.pending()).toBe(0);
  });

  it('T18-AC01: disables the button when enabled input is false and does not trigger add', async () => {
    const { host, root, tick } = await createHarness();

    host.enabled.set(false);
    await tick();

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');

    button.click();
    await tick();

    expect(capturedRequests.length).toBe(0);
    expect(host.lastAdded()).toBeNull();
    expect(root.querySelector('[data-testid="status-message"]')).toBeNull();
  });

  it('T18-AC01: displays pending loading state on button during in-flight dispatch', async () => {
    let triggerCreate: () => void = () => {
      // initial
    };
    server.use(
      http.post(`${BASE_URL}/carts`, () => {
        return new Promise<Response>((resolve) => {
          triggerCreate = (): void => {
            const cart = makeMockCart('cart-delayed', 1, []);
            currentCart = cart;
            resolve(HttpResponse.json(cart, { status: 201 }));
          };
        });
      }),
    );

    const { root, tick } = await createHarness();
    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');

    button.click();
    // Immediate tick before server responds
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });

    const rootDiv = root.querySelector('[data-testid="add-to-cart"]');
    expect(rootDiv?.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-busy')).toBe('true');

    triggerCreate();
    await tick();

    expect(rootDiv?.getAttribute('aria-busy')).toBeNull();
  });

  it('T18-AC01: dismisses the status message when dismissed output is fired', async () => {
    const { root, tick } = await createHarness();

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    button.click();
    await tick();

    expect(root.querySelector('[data-testid="status-message"]')).not.toBeNull();

    const closeBtn = queryButton(root, '[data-testid="status-message"] button');
    expect(closeBtn.textContent).toContain('Bezárás');
    closeBtn.click();
    await tick();

    expect(root.querySelector('[data-testid="status-message"]')).toBeNull();
  });

  it('T18-AC01: does not invent urgency, numbers or stock counts in confirmation message', async () => {
    const { host, root, tick } = await createHarness();

    host.selection.set({
      variantId: 'custom-phone-gold-128',
      quantity: 1,
      productName: 'Custom Phone',
      colorName: 'Arany',
      storageGb: 128,
    } satisfies AddToCartSelection);
    await tick();

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    button.click();
    await tick();

    const statusEl = root.querySelector('[data-testid="status-message"]');
    const msg = statusEl?.textContent ?? '';
    expect(msg).toContain('Custom Phone, Arany, 128 GB');
    expect(msg).toContain('1 darab a kosárban.');
    expect(msg).not.toContain('sürgős');
    expect(msg).not.toContain('korlátozott');
    expect(msg).not.toContain('akció');
  });

  it('T18-AC01: does not dispatch when already pending to prevent double addition', async () => {
    let triggerComplete: () => void = () => {
      // initial
    };
    server.use(
      http.post(`${BASE_URL}/carts`, async ({ request }) => {
        capturedRequests.push({ method: 'POST', url: request.url, bodyText: '', headers: {} });
        return new Promise<Response>((resolve) => {
          triggerComplete = (): void => {
            const cart = makeMockCart('cart-pending-test', 1, []);
            currentCart = cart;
            resolve(HttpResponse.json(cart, { status: 201 }));
          };
        });
      }),
    );

    const { root, tick } = await createHarness();
    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');

    button.click();
    button.click();

    triggerComplete();
    await tick();

    const cartCalls = capturedRequests.filter((r) => r.url === `${BASE_URL}/carts`);
    expect(cartCalls.length).toBe(1);
  });

  it('T18-AC01 / FIX-16: on a failed add returning a Problem, renders an error StatusMessage and leaves cart unchanged', async () => {
    server.use(
      http.post('*/api/v1/carts/*/items', () =>
        HttpResponse.json(
          { type: 'urn:problem:validation', title: 'Error', status: 422 },
          { status: 422 },
        ),
      ),
    );

    const { facade, root, tick } = await createHarness();
    const origAddItem = facade.addItem.bind(facade);
    const addItemSpy = vi.spyOn(facade, 'addItem').mockImplementation(async (variantId, quantity) => {
      await origAddItem(variantId, quantity);
      if (facade.error() !== null) {
        throw new Error('Failed to add item');
      }
    });

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    button.click();
    await tick();

    const statusEl = root.querySelector('[data-testid="status-message"]');
    expect(statusEl).not.toBeNull();
    expect(statusEl?.classList.contains('is-error')).toBe(true);
    const text = statusEl?.textContent ?? '';
    expect(text).toContain('A termék hozzáadása nem sikerült');
    expect(facade.itemCount()).toBe(0);

    addItemSpy.mockRestore();
  });
});

describe('T18 add-to-cart shared-primitive dependency wiring', () => {
  it('renders Button and StatusMessage shared UI primitives in the template', async () => {
    const { root, tick } = await createHarness();

    const appButton = root.querySelector('app-button');
    expect(appButton).not.toBeNull();

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    button.click();
    await tick();

    const statusMsg = root.querySelector('app-status-message');
    expect(statusMsg).not.toBeNull();
  });

  it('consumes CartFacade and reflects cart state changes', async () => {
    const { facade, root, tick } = await createHarness();

    expect(facade).toBeInstanceOf(CartFacade);
    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    button.click();
    await tick();

    expect(facade.itemCount()).toBe(2);
    expect(facade.cart()?.id).toBe('cart-test-1');
  });
});

describe('FIX-16 ProductPage add-to-cart integration', () => {
  it('FIX-16-AC04: ProductPage template contains app-add-to-cart and onAddToCart calls cartFacade.addItem', async () => {
    const htmlPath = pathResolve(process.cwd(), 'src/app/features/product/product-page.html');
    const tsPath = pathResolve(process.cwd(), 'src/app/features/product/product-page.ts');
    const html = await readFile(htmlPath, 'utf-8');
    const ts = await readFile(tsPath, 'utf-8');

    expect(html).toContain('<app-add-to-cart');
    expect(html).not.toContain('(added)=');
    expect(ts).toContain('cartFacade.addItem');
  });

  it('FIX-16-AC09b: desktop CTA renders disabled button when selection is null and app-add-to-cart when selection is present', async () => {
    TestBed.configureTestingModule({
      imports: [CtaDesktopTestHostComponent, AddToCart, Button, StatusMessage],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
      teardown: { destroyAfterEach: true },
    });

    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(CtaDesktopTestHostComponent);
    const host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    const root = getRootElement(fixture);
    const cta = root.querySelector('.cta-desktop');
    expect(cta).not.toBeNull();

    // Arm 1: Selection is null -> exactly one disabled button, accessible name is "Kosárba teszem", no app-add-to-cart
    expect(cta?.querySelector('app-add-to-cart')).toBeNull();
    const buttons = cta?.querySelectorAll('button') ?? [];
    expect(buttons.length).toBe(1);
    const disabledBtn = buttons[0];
    expect(disabledBtn.disabled).toBe(true);
    expect(disabledBtn.textContent.trim()).toBe('Kosárba teszem');

    // Arm 2: Selection is present -> app-add-to-cart rendered, no bare app-button
    host.selection.set(sampleSelection);
    host.enabled.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const addToCartEl = cta?.querySelector('app-add-to-cart');
    expect(addToCartEl).not.toBeNull();
    const directButtons = Array.from(cta?.children ?? []).filter(
      (el) => el.tagName.toLowerCase() === 'app-button',
    );
    expect(directButtons.length).toBe(0);
  });
});
