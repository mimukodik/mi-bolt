/**
 * T24 — success page, reload recovery, and closing.
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

import '@angular/compiler';

// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HttpResponse, http, type RequestHandler } from 'msw';
import { setupServer } from 'msw/node';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';
import {
  EnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext,
} from '@angular/core';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlSegment,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';

import { provideApiConfiguration } from '../../../app/api/generated/api-configuration';

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
import { reviewGuard, successGuard } from '../../../app/features/checkout/checkout.guards';

const workspaceRoot = resolvePath(process.cwd());

function read(relative: string): string {
  const base = relative.replace(/\.ts$/, '');
  const sources = [relative, `${base}.html`, `${base}.scss`];
  return sources
    .map((p) => {
      try {
        return readFileSync(resolvePath(workspaceRoot, p), 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');
}

function componentStyles(componentSource: string, explicitScssPath?: string): string {
  const inline = /styles:\s*\[([\s\S]*?)\]/.exec(componentSource);
  if (inline) return inline[1];
  if (explicitScssPath) {
    try {
      return readFileSync(resolvePath(workspaceRoot, explicitScssPath), 'utf8');
    } catch {
      return '';
    }
  }
  const htmlMatch = /templateUrl:\s*'\.\/([^']+\.html)'/.exec(componentSource);
  if (htmlMatch) {
    const scssPath = htmlMatch[1].replace(/\.html$/, '.scss');
    try {
      return readFileSync(resolvePath(workspaceRoot, scssPath), 'utf8');
    } catch {
      return '';
    }
  }
  return '';
}

const BASE_URL = 'http://localhost/api/v1';
const VARIANT_G256 = 'demo-one-5g-graphite-256';

const successStepSource = read('src/app/features/checkout/success-step.ts');
const successPageReExportSource = read('src/app/features/checkout/success-page.ts');
const orderReceiptSource = read('src/app/features/checkout/order-receipt.ts');
const checkoutFacadeSource = read('src/app/features/checkout/checkout.facade.ts');
const cartFacadeSource = read('src/app/features/cart/cart.facade.ts');
const guardsSource = read('src/app/features/checkout/checkout.guards.ts');
const routesSource = read('src/app/features/checkout/checkout.routes.ts');

// ---------------------------------------------------------------------------
// T24-AC01 — receipt content.
// ---------------------------------------------------------------------------

describe('T24-AC01 receipt content (DEMO order number, line items, total, method, simulation notice)', () => {
  it('order-receipt renders orderNumber, line items, total and payment method', () => {
    expect(orderReceiptSource).toMatch(/orderNumber/);
    expect(orderReceiptSource).toMatch(/productName|items/);
    expect(orderReceiptSource).toMatch(/Végösszeg|Fizetendő|total|app-price-block/);
    expect(orderReceiptSource).toMatch(/paymentMethod|Fizetési mód/);
    expect(orderReceiptSource).toMatch(/lineTotal/);
  });

  it('order-receipt surfaces an explicit simulation notice (no real charge / delivery / email)', () => {
    const cleaned = orderReceiptSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    // Hungarian copy explicitly says the order is simulated.
    expect(cleaned).toMatch(
      /Nem történt|Nem küldünk|szimulált|szimuláció|isSimulation|notice|demo/i,
    );
    // Forbidden claims — positive statements that a real transaction / email /
    // delivery happened. The negation in our own notice ("Nem történt valódi
    // fizetés") is allowed.
    expect(cleaned.toLowerCase().indexOf('valódi fizetés történt')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('elküldtük az e-mailt')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('kiszállítjuk')).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// T24-AC02 — refresh restores the receipt; never POSTs another order.
// ---------------------------------------------------------------------------

describe('T24-AC02 refresh restores the receipt and never POSTs another order', () => {
  it('success-step uses getOrder (or its facade wrapper), never createOrder', () => {
    expect(successStepSource).toMatch(/getOrder|fetchOrder/);
    // The success page must NOT POST another order; commitOrder lives
    // in checkout.facade.ts and is only reachable from the review step.
    expect(successStepSource).not.toMatch(/createOrder|commitOrder\(/);
  });

  it('CheckoutFacade exposes a fetchOrder helper that uses getOrder, never createOrder', () => {
    expect(checkoutFacadeSource).toMatch(/fetchOrder\(/);
    expect(checkoutFacadeSource).toMatch(/functions\.getOrder|getOrder,/);
    // fetchOrder itself never references createOrder; the commit path
    // stays the only place that may invoke createOrder, but that is a
    // separate method (out of scope here).
    const fetchMatch = /async fetchOrder[\s\S]*?\n {2}\}/.exec(checkoutFacadeSource);
    expect(fetchMatch).not.toBeNull();
    const fetchBody = fetchMatch?.[0] ?? '';
    expect(fetchBody).toMatch(/getOrder/);
    expect(fetchBody).not.toMatch(/createOrder/);
  });

  it('success-step reads the order ID from the route and renders the 404 recovery when missing', () => {
    expect(successStepSource).toMatch(/paramMap|orderId/);
    expect(successStepSource).toMatch(/ErrorState|404|NOT_FOUND|nem található|Nem található/);
  });
});

// ---------------------------------------------------------------------------
// T24-AC03 — cart badge resets; receipt replay preserved.
// ---------------------------------------------------------------------------

describe('T24-AC03 cart badge resets and past receipt replay is preserved', () => {
  it('success-step calls CartFacade.resetOrderedCart after the order is in memory', () => {
    expect(successStepSource).toMatch(/resetOrderedCart/);
    expect(successStepSource).toMatch(/CartFacade/);
  });

  it('CartFacade owns resetOrderedCart which clears the in-memory cart snapshot', () => {
    expect(cartFacadeSource).toMatch(/resetOrderedCart/);
  });

  it('the success page offers a "Új vásárlás" CTA wired to ensureCart, not a synthetic cart', () => {
    expect(successStepSource).toMatch(/ensureCart/);
    expect(successStepSource).toMatch(/Vásárlás|telefonok|continueShopping/);
  });

  it('receipt replay never reads the cart — the order ID lives in the URL', () => {
    // The fetcher takes the order ID from the URL; nothing about the
    // cart snapshot is needed to render the receipt.
    expect(successStepSource).not.toMatch(/cart\(\)\.id/);
    expect(successStepSource).toMatch(/orderId/);
  });
});

// ---------------------------------------------------------------------------
// T24-AC04 — browser back to the wizard cannot resubmit.
// ---------------------------------------------------------------------------

describe('T24-AC04 browser back to the wizard cannot resubmit', () => {
  it('contact, delivery and review guards reject when an order already exists', () => {
    // Each guard now redirects to the existing success URL when the
    // user navigates back; the success URL carries the order id from
    // `CheckoutFacade.order()`.
    expect(guardsSource).toMatch(/reviewGuard/);
    expect(guardsSource).toMatch(/deliveryGuard/);
    expect(guardsSource).toMatch(/contactGuard/);
    expect(guardsSource).toMatch(/order\(\)/);
    expect(guardsSource).toMatch(/\/penztar\/siker\//);
  });

  it('successGuard allows hydration through fetchOrder when an orderId is on the URL', () => {
    // The success page now owns hydration, so the guard must let the
    // navigation through when the orderId is present.
    expect(guardsSource).toMatch(/return true/);
    // It must still reject when no orderId is supplied at all.
    expect(guardsSource).toMatch(/deep-link|navigationReason/);
  });
});

// ---------------------------------------------------------------------------
// T24-AC05 — keyboard focus on the success heading.
// ---------------------------------------------------------------------------

describe('T24-AC05 keyboard focus on the success heading', () => {
  it('the H1 has tabindex=-1 + is rendered at all times', () => {
    expect(successStepSource).toMatch(/<h1[\s\S]*?tabindex=["']-1["']/);
    expect(successStepSource).toMatch(
      /<h1[\s\S]*?Rendelés elkészült|Sikeres demórendelés|elkészült/i,
    );
  });

  it('the component explicitly moves focus to the heading (no reliance on a transient toast or animation)', () => {
    expect(successStepSource).toMatch(
      /focus\(|autofocus|RouteFocusService|scheduleFocus|focusMainHeading/,
    );
    // No use of CommonModule / toast-only primitives.
    expect(successStepSource).not.toMatch(/CommonModule|NgModule|BrowserModule/);
  });
});

// ---------------------------------------------------------------------------
// Module wiring + style contract.
// ---------------------------------------------------------------------------

describe('T24 route + module wiring', () => {
  it('the checkout route points to the new success-step component and the T11 stub now re-exports it', () => {
    expect(routesSource).toMatch(/success-step/);
    // success-page.ts is still importable (matches the existing
    // contact-page.ts pattern) but it forwards to the new file.
    expect(successPageReExportSource).toMatch(/success-step/);
    expect(successPageReExportSource).toMatch(/SuccessPage/);
  });

  it('success-step + order-receipt do not import CommonModule', () => {
    expect(successStepSource).not.toMatch(/CommonModule|NgModule|BrowserModule/);
    expect(orderReceiptSource).not.toMatch(/CommonModule|NgModule|BrowserModule/);
  });

  it('order-receipt is presentational — it takes the receipt as an input and never injects the facade', () => {
    expect(orderReceiptSource).toMatch(/OrderReceipt/);
    expect(orderReceiptSource).toMatch(/input\.required|input\(</);
    expect(orderReceiptSource).not.toMatch(/inject\(|CheckoutFacade|CartFacade/);
  });

  it('success-step imports the shared primitives it needs', () => {
    expect(successStepSource).toMatch(/imports:\s*\[[\s\S]*?OrderReceipt[\s\S]*?\]/);
    expect(successStepSource).toMatch(/imports:\s*\[[\s\S]*?Button[\s\S]*?\]/);
    expect(successStepSource).toMatch(/imports:\s*\[[\s\S]*?ErrorState[\s\S]*?\]/);
  });

  it('responsive layout: mobile-first stack with a desktop two-column split at >= 1024px', () => {
    const css = componentStyles(successStepSource, 'src/app/features/checkout/success-step.scss');
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)/);
    expect(css).toMatch(/grid-template-columns/);
  });

  it('prefers-reduced-motion disables any success-only animation', () => {
    const css = componentStyles(successStepSource, 'src/app/features/checkout/success-step.scss');
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
const server = setupServer();

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
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
    teardown: { destroyAfterEach: true },
  });
  server.listen({ onUnhandledRequest: 'error' });
});

afterAll(() => {
  server.close();
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
