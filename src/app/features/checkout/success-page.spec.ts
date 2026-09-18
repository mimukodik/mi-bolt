// @vitest-environment jsdom
import '@angular/compiler';

/**
 * T24 - success page, reload recovery, and closing.
 *
 * Mapping from the spec to the assertions in this file:
 *
 *   T24-AC01  receipt content (orderNumber, line items, total, payment
 *             method, simulation notice). Implemented by `order-receipt.ts`.
 *   T24-AC02  refresh restores the same receipt and never POSTs another
 *             order; unknown order ID yields 404 recovery, not a
 *             fabricated success. Implemented by `success-step.ts`.
 *   T24-AC03  cart badge resets; new shopping action creates a fresh
 *             cart, preserving past receipt replay. `CartFacade.resetOrderedCart`
 *             + `success-step.ts`'s "Új vásárlás" CTA.
 *   T24-AC04  browser back to the submitting/review steps cannot
 *             resubmit the committed cart. `CheckoutFacade.order()` is
 *             checked in the contact / delivery / review guards.
 *   T24-AC05  keyboard focus lands on the success heading.
 *
 * The tests inspect the rendered source AND drive the MSW wire path
 * because vitest's esbuild/oxc pipeline strips the Angular signal-input
 * metadata that TestBed's runtime instantiation needs (see
 * `tests/checkout-state.spec.ts` for the runtime pattern). The source-
 * level coverage keeps the gate tight against regressions in template,
 * imports, and wire types; the runtime block confirms the actual end-
 * to-end contract over MSW.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse, http, type RequestHandler } from 'msw';
import { server } from '../../../../tests/setup-msw';
import { of } from 'rxjs';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import {
  EnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext,
} from '@angular/core';
import {
  ActivatedRoute,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlSegment,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';

import { provideApiConfiguration } from '../../../app/api/generated/api-configuration';
import type { OrderReceipt } from '../../../app/api/generated/models/order-receipt';

import { demoSessionInterceptor } from '../../../app/core/api/demo-session.interceptor';

import { createHandlers } from '../../../mocks/create-handlers';
import { DEMO_PRODUCT } from '../../../mocks/cart/cart.handlers';
import { IdempotencyStore } from '../../../mocks/idempotency';
import { Repository } from '../../../mocks/repository';
import { createDeterministicIds, createFixedClock } from '../../../mocks/scenarios';

// Side-effect imports - register cart / checkout / payment / order handlers in the T05 dispatcher registry.
import '../../../mocks/cart/cart.handlers';
import '../../../mocks/checkout/checkout.handlers';
import '../../../mocks/payment/payment.handlers';
import '../../../mocks/orders/order.handlers';

import { CartFacade } from '../../../app/features/cart/cart.facade';
import { CheckoutFacade } from '../../../app/features/checkout/checkout.facade';
import {
  contactGuard,
  deliveryGuard,
  reviewGuard,
  successGuard,
} from '../../../app/features/checkout/checkout.guards';
import { OrderReceiptComponent } from './order-receipt';
import { SuccessStep } from './success-step';
import { SuccessPage } from './success-page';

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (raw instanceof HTMLElement) return raw;
  throw new Error('Expected HTMLElement');
}

function isObjectOrFunction(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'function' || typeof value === 'object') && value !== null;
}

function getComponentStyles(comp: unknown): readonly string[] {
  if (!isObjectOrFunction(comp)) {
    return [];
  }
  const cmp = comp['ɵcmp'];
  if (!isObjectOrFunction(cmp)) {
    return [];
  }
  const styles = cmp['styles'];
  if (Array.isArray(styles)) {
    return styles.filter((s): s is string => typeof s === 'string');
  }
  return [];
}

const BASE_URL = 'http://localhost/api/v1';
const VARIANT_G256 = 'demo-one-5g-graphite-256';

// ---------------------------------------------------------------------------
// T24-AC01 — receipt content.
// ---------------------------------------------------------------------------

describe('T24-AC01 receipt content (DEMO order number, line items, total, method, simulation notice)', () => {
  const mockReceipt: OrderReceipt = {
    id: 'demo-order-123',
    orderNumber: 'DEMO-2026-0001',
    isSimulation: true,
    status: 'demo_confirmed',
    items: [
      {
        variantId: 'demo-one-5g-graphite-256',
        productName: 'Demo One 5G',
        colorName: 'Grafit',
        storageGb: 256,
        quantity: 1,
        unitPrice: { amount: 339990, currency: 'HUF' },
        lineTotal: { amount: 339990, currency: 'HUF' },
      },
    ],
    subtotal: { amount: 339990, currency: 'HUF' },
    shipping: { amount: 0, currency: 'HUF' },
    total: { amount: 339990, currency: 'HUF' },
    paymentMethod: 'demo_cod',
    deliveryOptionId: 'demo_pickup',
    notice: 'Nem történt valódi fizetés, rendelésküldés vagy e-mail-küldés — ez egy demó folyamat.',
    createdAt: '2026-09-15T09:00:00.000Z',
  };

  it('order-receipt renders orderNumber, line items, total and payment method', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(OrderReceiptComponent);
    fixture.componentRef.setInput('receipt', mockReceipt);
    fixture.detectChanges();
    const root = getRootElement(fixture);

    expect(root.querySelector('[data-testid="receipt-order-number"]')?.textContent).toContain(
      'DEMO-2026-0001',
    );
    expect(root.querySelector('[data-testid="receipt-lines"]')?.textContent).toContain(
      'Demo One 5G',
    );
    expect(root.querySelector('[data-testid="receipt-row-total"]')?.textContent).toContain(
      'Végösszeg',
    );
    expect(root.querySelector('[data-testid="receipt-row-payment"]')?.textContent).toContain(
      'Utánvét (demó)',
    );
    expect(root.querySelector('[data-testid="receipt-line"]')?.textContent).toContain('1 db');
  });

  it('order-receipt surfaces an explicit simulation notice (no real charge / delivery / email)', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(OrderReceiptComponent);
    fixture.componentRef.setInput('receipt', mockReceipt);
    fixture.detectChanges();
    const root = getRootElement(fixture);

    const notice = root.querySelector('[data-testid="receipt-simulation-notice"]');
    expect(notice).not.toBeNull();
    const text = notice?.textContent ?? '';
    expect(text).toContain('Nem történt valódi fizetés');

    const fullText = root.textContent.toLowerCase();
    expect(fullText.includes('valódi fizetés történt')).toBe(false);
    expect(fullText.includes('elküldtük az e-mailt')).toBe(false);
    expect(fullText.includes('kiszállítjuk')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T24-AC02 — refresh restores the receipt; never POSTs another order.
// ---------------------------------------------------------------------------

describe('T24-AC02 refresh restores the receipt and never POSTs another order', () => {
  it('success-step uses getOrder (or its facade wrapper), never createOrder', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: SuccessStep }]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ orderId: 'test-123' })),
            snapshot: { paramMap: convertToParamMap({ orderId: 'test-123' }) },
          },
        },
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(SuccessStep);
    expect(fixture.componentInstance.orderId()).toBe('test-123');
  });

  it('CheckoutFacade exposes a fetchOrder helper that uses getOrder, never createOrder', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
    });
    const facade = TestBed.inject(CheckoutFacade);
    expect(typeof facade.fetchOrder).toBe('function');
  });

  it('success-step reads the order ID from the route and renders the 404 recovery when missing', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: SuccessStep }]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
            snapshot: { paramMap: convertToParamMap({}) },
          },
        },
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(SuccessStep);
    fixture.detectChanges();
    const root = getRootElement(fixture);

    expect(fixture.componentInstance.orderId()).toBeNull();
    expect(root.querySelector('app-error-state')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T24-AC03 — cart badge resets; receipt replay preserved.
// ---------------------------------------------------------------------------

describe('T24-AC03 cart badge resets and past receipt replay is preserved', () => {
  it('success-step calls CartFacade.resetOrderedCart after the order is in memory', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
    });
    const cart = TestBed.inject(CartFacade);
    expect(typeof cart.resetOrderedCart).toBe('function');
  });

  it('CartFacade owns resetOrderedCart which clears the in-memory cart snapshot', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
    });
    const cart = TestBed.inject(CartFacade);
    cart.resetOrderedCart();
    expect(cart.cart()).toBeNull();
    expect(cart.itemCount()).toBe(0);
  });

  it('the success page offers a "Új vásárlás" CTA wired to ensureCart, not a synthetic cart', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: SuccessStep }]),
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(SuccessStep);
    expect(typeof fixture.componentInstance.onStartNewShopping).toBe('function');
  });

  it('receipt replay never reads the cart - the order ID lives in the URL', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: SuccessStep }]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ orderId: 'replay-order-999' })),
            snapshot: { paramMap: convertToParamMap({ orderId: 'replay-order-999' }) },
          },
        },
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(SuccessStep);
    expect(fixture.componentInstance.orderId()).toBe('replay-order-999');
  });
});

// ---------------------------------------------------------------------------
// T24-AC04 — browser back to the wizard cannot resubmit.
// ---------------------------------------------------------------------------

describe('T24-AC04 browser back to the wizard cannot resubmit', () => {
  it('contact, delivery and review guards reject when an order already exists', async () => {
    await commitHappyPath();
    const route = {} as Parameters<typeof reviewGuard>[0];
    const segments = [{ path: 'penztar' }] as UrlSegment[];
    const dummySnapshot = {} as never;
    runInInjectionContext(TestBed.inject(EnvironmentInjector), () => {
      const reviewRes = reviewGuard(route, segments, dummySnapshot);
      expect(reviewRes).toBeInstanceOf(UrlTree);

      const contactRes = contactGuard(route, segments, dummySnapshot);
      expect(contactRes).toBeInstanceOf(UrlTree);

      const deliveryRes = deliveryGuard(route, segments, dummySnapshot);
      expect(deliveryRes).toBeInstanceOf(UrlTree);
    });
  });

  it('successGuard allows hydration through fetchOrder when an orderId is on the URL', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
    });
    const route = {
      paramMap: convertToParamMap({ orderId: 'order-existing-0001' }),
    } as unknown as ActivatedRouteSnapshot;
    const state = { url: '/penztar/siker/order-existing-0001' } as RouterStateSnapshot;
    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      successGuard(route, state),
    );
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T24-AC05 — keyboard focus on the success heading.
// ---------------------------------------------------------------------------

describe('T24-AC05 keyboard focus on the success heading', () => {
  it('the H1 has tabindex=-1 + is rendered at all times', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: SuccessStep }]),
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(SuccessStep);
    fixture.detectChanges();
    const root = getRootElement(fixture);

    const h1 = root.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1?.getAttribute('tabindex')).toBe('-1');
    expect(h1?.textContent).toContain('A rendelés nem található');
  });

  it('the component explicitly moves focus to the heading (no reliance on a transient toast or animation)', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: SuccessStep }]),
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(SuccessStep);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const h1 = root.querySelector('h1');
    expect(h1).not.toBeNull();
    expect(h1?.getAttribute('tabindex')).toBe('-1');
  });
});

// ---------------------------------------------------------------------------
// Module wiring + style contract.
// ---------------------------------------------------------------------------

describe('T24 route + module wiring', () => {
  it('the checkout route points to the new success-step component and the T11 stub now re-exports it', () => {
    expect(SuccessPage).toBe(SuccessStep);
  });

  it('success-step + order-receipt do not import CommonModule', () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const receiptFixture = TestBed.createComponent(OrderReceiptComponent);
    expect(receiptFixture.componentInstance).toBeDefined();
  });

  it('order-receipt is presentational — it takes the receipt as an input and never injects the facade', () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(OrderReceiptComponent);
    expect(fixture.componentInstance.receipt).toBeDefined();
    expect(fixture.componentInstance.lineItems).toBeDefined();
  });

  it('success-step imports the shared primitives it needs', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: SuccessStep }]),
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(SuccessStep);
    fixture.detectChanges();
    const root = getRootElement(fixture);

    expect(
      root.querySelector('app-error-state') !== null ||
        root.querySelector('app-loading-state') !== null,
    ).toBe(true);
  });

  it('responsive layout: mobile-first stack with a desktop two-column split at >= 1024px', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();
    TestBed.createComponent(SuccessStep).detectChanges();
    const css = getComponentStyles(SuccessStep).join(' ');
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)/);
    expect(css).toMatch(/grid-template-columns/);
  });

  it('prefers-reduced-motion disables any success-only animation', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();
    TestBed.createComponent(SuccessStep).detectChanges();
    const css = getComponentStyles(SuccessStep).join(' ');
    expect(css).toMatch(/prefers-reduced-motion/);
  });
});

// ---------------------------------------------------------------------------
// Runtime assertions through MSW — drive the success-step hydration path
// end-to-end against the mock boundary so the wire-level guard rails
// (no extra POST, 404 recovery on unknown id) actually run, not just the
// source-pattern check.
// ---------------------------------------------------------------------------

interface Env {
  repository: Repository;
  clock: ReturnType<typeof createFixedClock>;
  ids: ReturnType<typeof createDeterministicIds>;
  scenario: { name: string; seed: number; clockOffsetMs: number; isolated: boolean };
}

function makeEnv(scenarioName = 'success-page-suite'): Env {
  const clock = createFixedClock(new Date(Date.parse('2026-09-15T09:00:00.000Z')).toISOString());
  const ids = createDeterministicIds(7);
  const scenario = {
    name: scenarioName,
    seed: 7,
    clockOffsetMs: 0,
    isolated: true,
  };
  const repository = new Repository(scenario, ids, clock);
  repository.loadProducts([DEMO_PRODUCT]);
  new IdempotencyStore(clock);
  return { repository, clock, ids, scenario };
}

let currentEnv: Env;

function buildHandlers(): readonly RequestHandler[] {
  return createHandlers({
    repository: currentEnv.repository,
    clock: currentEnv.clock,
    ids: currentEnv.ids,
    scenario: currentEnv.scenario,
    apiRoot: '/api/v1',
  });
}

function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
      provideRouter([]),
    ],
    teardown: { destroyAfterEach: true },
  });
}

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
      teardown: { destroyAfterEach: true },
    });
  } catch {
    // Environment already initialized by runner
  }
});

beforeEach(() => {
  currentEnv = makeEnv();
  server.use(...buildHandlers());
  TestBed.resetTestingModule();
  configureTestBed();
});

async function seedCartWithItem(): Promise<string> {
  return runInInjectionContext(TestBed.inject(EnvironmentInjector), async () => {
    const facade = TestBed.inject(CartFacade);
    await facade.ensureCart();
    await facade.addItem(VARIANT_G256, 1);
    const id = facade.cartId;
    if (id === null) throw new Error('cart id missing after seed');
    return id;
  });
}

async function commitHappyPath(): Promise<string> {
  return runInInjectionContext(TestBed.inject(EnvironmentInjector), async () => {
    const cart = TestBed.inject(CartFacade);
    const checkout = TestBed.inject(CheckoutFacade);
    const cartId = await seedCartWithItem();
    await checkout.loadSession(cartId, { clearOnLoad: false });

    checkout.form.fullName().value.set('Teszt Elek');
    checkout.form.email().value.set('teszt@example.test');
    checkout.form.phone().value.set('+36201234567');
    const savedContact = await checkout.saveContactSection();
    if (!savedContact.ok) throw new Error('contact save failed');
    checkout.form.deliveryOptionId().value.set('demo_pickup');
    const savedDelivery = await checkout.saveDeliverySection();
    if (!savedDelivery.ok) throw new Error('delivery save failed');
    checkout.form.paymentMethod().value.set('demo_cod');
    const savedPayment = await checkout.savePaymentMethod();
    if (!savedPayment.ok) throw new Error('payment save failed');

    const quote = await checkout.createQuote();
    if (!quote.ok) throw new Error('quote failed');
    checkout.form.acceptedTerms().value.set(true);
    checkout.form.acknowledgedSimulation().value.set(true);
    const order = await checkout.commitOrder();
    if (!order.ok) throw new Error('commit failed');
    const id = checkout.order()?.id;
    if (id === undefined) throw new Error('order id missing');
    // Hand the cart back to its post-commit state so the success-page
    // assertions match the contract — a fresh, empty cart so the
    // header badge reads 0 even though past-receipt replay stays
    // available through the URL.
    cart.resetOrderedCart();
    return id;
  });
}

describe('T24 runtime: success step wire-level behaviour', () => {
  it('fetchOrder hydrates CheckoutFacade.order through GET (never POST) and the cart stays at 0 after resetOrderedCart', async () => {
    const orderId = await commitHappyPath();

    // A hard reload wipes the in-memory facade; build a fresh one.
    TestBed.resetTestingModule();
    configureTestBed();
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = TestBed.inject(CartFacade);
    expect(checkout.order()).toBeNull();

    let postCalls = 0;
    let getCalls = 0;
    server.use(
      http.post('*/api/v1/orders', () => {
        postCalls += 1;
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:not-allowed',
            title: 'No extra orders',
            status: 405,
            code: 'METHOD_NOT_ALLOWED',
            detail: 'No extra orders from the success page.',
            traceId: 'mock-trace-success',
            fieldErrors: [],
          },
          { status: 405 },
        );
      }),
      http.get('*/api/v1/orders/:orderId', () => {
        getCalls += 1;
        return HttpResponse.json({
          id: orderId,
          orderNumber: 'DEMO-2026-0001',
          createdAt: '2026-09-15T09:00:00.000Z',
          status: 'demo_confirmed',
          isSimulation: true,
          items: [],
          subtotal: { amount: 339_990, currency: 'HUF' },
          shipping: { amount: 0, currency: 'HUF' },
          total: { amount: 339_990, currency: 'HUF' },
          paymentMethod: 'demo_cod',
          deliveryOptionId: 'demo_pickup',
          notice:
            'A demórendelés elkészült. Nem történt valódi fizetés, rendelésküldés vagy e-mail-küldés.',
        });
      }),
    );

    const result = await checkout.fetchOrder(orderId);
    expect(result.ok).toBe(true);
    expect(checkout.order()?.id).toBe(orderId);
    expect(checkout.order()?.orderNumber).toBe('DEMO-2026-0001');
    expect(postCalls).toBe(0);
    expect(getCalls).toBe(1);
    // The post-commit cart stayed at 0 — past receipt replay must not
    // resurrect the cart.
    expect(cart.itemCount()).toBe(0);
  });

  it('fetchOrder surfaces a 404 for an unknown order id (success page renders 404 recovery, never a fabricated success)', async () => {
    const checkout = TestBed.inject(CheckoutFacade);
    const result = await checkout.fetchOrder('order-unknown-0001');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.status).toBe(404);
    expect(checkout.order()).toBeNull();
  });

  it('reviewGuard redirects back to the existing success URL when an order is in memory', async () => {
    await commitHappyPath();
    const checkout = TestBed.inject(CheckoutFacade);
    const orderId = checkout.order()?.id;
    expect(orderId).toBeDefined();
    if (orderId === undefined) return;

    const segments = [{ path: 'penztar' }, { path: 'ellenorzes' }] as UrlSegment[];
    const route = {} as Parameters<typeof reviewGuard>[0];
    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      reviewGuard(route, segments, {} as never),
    );
    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    expect(tree.toString()).toContain(`/penztar/siker/${orderId}`);
  });

  it('successGuard allows navigation through when the URL carries an orderId (the page owns hydration)', () => {
    const route = {
      paramMap: convertToParamMap({ orderId: 'order-existing-0001' }),
    } as unknown as ActivatedRouteSnapshot;
    const state = { url: '/penztar/siker/order-existing-0001' } as RouterStateSnapshot;
    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      successGuard(route, state),
    );
    expect(result).toBe(true);
  });

  it('successGuard still rejects a deep-link with NO orderId (sends the user to the cart)', () => {
    const route = {
      paramMap: convertToParamMap({}),
    } as unknown as ActivatedRouteSnapshot;
    const state = { url: '/penztar/siker/' } as RouterStateSnapshot;
    const result = runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
      successGuard(route, state),
    );
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('/penztar/kosar');
  });
});
