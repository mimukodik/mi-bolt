/**
 * MIM-212 — success page and receipt cases on the 2.0.0 contract.
 *
 * Cases over the receipt the wire now sends and the page that
 * hydrates it: the presentational `OrderReceiptComponent`, the
 * `SuccessStep` page through its full hydration pipeline
 * (loading → fetch → render, missing, error, malformed-id,
 * 500-then-200 retry, no-second-fetch on a forward navigation,
 * cart reset on receipt, heading copy, new-shopping
 * navigate), and the two arms of `successGuard`. The harness
 * mirrors the 2.0.0 mock spec
 * (catalog fixture in `beforeAll`, fixed clock, deterministic ids,
 * per-test `options` and `server.use(...)`).
 *
 * `ActivatedRoute` is supplied through a structural stub rather than
 * `Router.navigate(...)` because `SuccessStep` is mounted directly via
 * `TestBed.createComponent(SuccessStep)`, with no `<router-outlet>` to
 * rewire `route.paramMap` after a navigation. The stub mirrors the
 * `navigation-reason-banner.spec.ts` pattern: a plain object whose
 * `paramMap` is an observable and whose `snapshot.paramMap` matches.
 */

import '@angular/compiler';

// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpResponse, http, type DefaultBodyType } from 'msw';
import { BehaviorSubject, type Observable } from 'rxjs';
import { server, useMswServer } from '../../../../../../tests/msw-server';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';
import { demoSessionInterceptor } from '@mi-bolt/core-api/demo-session.interceptor';

import { createHandlers } from '@mi-bolt/mocks/create-handlers';
import { Repository } from '@mi-bolt/mocks/repository';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
} from '@mi-bolt/mocks/scenarios';
import { TERMS_VERSION } from '@mi-bolt/mocks/checkout/checkout-store';
import catalogFixture from '../../../../../../docs/api/fixtures/catalog.json';
import { isCatalogFixtureShape, loadCatalogFixture } from '@mi-bolt/mocks/catalog/catalog.handlers';

import '@mi-bolt/mocks/cart/cart.handlers';
import '@mi-bolt/mocks/checkout/checkout.handlers';
import '@mi-bolt/mocks/payment/payment.handlers';
import '@mi-bolt/mocks/orders/order.handlers';

import type { Address } from '@mi-bolt/api/models/address';
import type { BillingDetails } from '@mi-bolt/api/models/billing-details';
import type { Contact } from '@mi-bolt/api/models/contact';
import type { DeliverySelection } from '@mi-bolt/api/models/delivery-selection';
import type { PaymentSelection } from '@mi-bolt/api/models/payment-selection';
import type { OrderReceipt } from '@mi-bolt/api/models/order-receipt';
import type { HomeDeliverySelection } from '@mi-bolt/api/models/home-delivery-selection';

import { CartFacade } from '../../../app/features/cart/cart.facade';
import { CheckoutFacade } from '../../../app/features/checkout/checkout.facade';
import { OrderReceiptComponent } from '../../../app/features/checkout/order-receipt';
import { PriceBlock } from '../../../app/shared/ui/price-block/price-block';
import { SuccessStep } from '../../../app/features/checkout/success-step';
import { successGuard } from '../../../app/features/checkout/checkout.guards';

useMswServer();

const BASE_URL = 'http://localhost/api/v1';
const MOTO = 'motorola-edge-50-fusion--zold--256';
const MOTO_PRODUCT_NAME = 'Motorola Edge 50 Fusion';
const HOME_ADDRESS: Address = {
  countryCode: 'HU',
  postalCode: '1011',
  city: 'Budapest',
  line1: 'Fő utca 1.',
};
const HOME_DELIVERY: HomeDeliverySelection = {
  optionId: 'home_delivery',
  address: HOME_ADDRESS,
};
const PICKUP: DeliverySelection = { optionId: 'pickup_point' };
const VALID_CONTACT: Contact = {
  fullName: 'Teszt Elek',
  email: 'Teszt.Elek@Pelda.hu',
  phone: '+36301234567',
};
const VALID_BILLING: BillingDetails = {
  name: 'Teszt Elek',
  address: HOME_ADDRESS,
};
const COD_PAYMENT: PaymentSelection = { method: 'cash_on_delivery' };

/** Receipt payload that satisfies every value the receipt template binds. */
function makeReceipt(overrides: Partial<OrderReceipt> = {}): OrderReceipt {
  const base: OrderReceipt = {
    id: 'ord-receipt-1',
    orderNumber: 'DEMO-000001',
    status: 'confirmed',
    createdAt: '2026-09-20T10:00:00.000Z',
    contactEmail: 'teszt.elek@pelda.hu',
    notice: 'A demórendelés elkészült. Nem történt valódi fizetés, szimuláció.',
    items: [
      {
        variantId: MOTO,
        productName: MOTO_PRODUCT_NAME,
        colorName: 'Zöld',
        storageGb: 256,
        quantity: 1,
        unitPrice: { amount: 89_990, currency: 'HUF' },
        lineTotal: { amount: 89_990, currency: 'HUF' },
      },
    ],
    subtotal: { amount: 89_990, currency: 'HUF' },
    shippingFee: { amount: 0, currency: 'HUF' },
    paymentFee: { amount: 490, currency: 'HUF' },
    total: { amount: 90_480, currency: 'HUF' },
    paymentMethod: 'cash_on_delivery',
    delivery: HOME_DELIVERY,
    billing: VALID_BILLING,
  };
  return { ...base, ...overrides };
}

/** 500 Problem body used by SP-10/SP-12 to stage a wire failure. */
function fiveHundred(): HttpResponse<DefaultBodyType> {
  return HttpResponse.json(
    {
      type: 'urn:mi-bolt:problem:service-unavailable',
      title: 'Service unavailable',
      status: 500,
      code: 'SERVICE_UNAVAILABLE',
      detail: 'Mocked 500 for SP-10/SP-12.',
      traceId: 'mock-success-spec',
      fieldErrors: [],
      params: {},
    },
    { status: 500, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** Returns the first matching `HTMLElement` or null when none is present. */
function queryHTMLElement(root: ParentNode, selector: string): HTMLElement | null {
  const element = root.querySelector(selector);
  return element instanceof HTMLElement ? element : null;
}

/** Returns every matching `HTMLElement` (filters out non-element nodes
 *  so the cast-free type holds). */
function queryAllHTMLElements(root: ParentNode, selector: string): readonly HTMLElement[] {
  return Array.from(root.querySelectorAll(selector)).filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
}

/** Collapses an element's `textContent` runs (which the Angular
 *  template emits as separate text nodes around `<br>` and `*ngIf`
 *  arms) into a single space-trimmed string. */
function collapsedText(element: HTMLElement | null): string {
  if (element === null) return '';
  return element.textContent.replace(/\s+/g, ' ').trim();
}

/** Stub `ActivatedRoute` shape the page reads from. The `paramMap`
 *  observable is the live signal the page's `toSignal` subscribes to;
 *  the snapshot is what the page reads on first render. The
 *  `snapshot.paramMap` field is intentionally non-readonly so a test
 *  can seed it after `TestBed.createComponent` has captured the
 *  initial value. */
interface ActivatedRouteStub {
  readonly paramMap: Observable<ReturnType<typeof convertToParamMap>>;
  readonly snapshot: { paramMap: ReturnType<typeof convertToParamMap> };
}

/** Shared stub the suite mutates in place. A `BehaviorSubject` lets a
 *  test seed the order id after the TestBed is already instantiated
 *  (the order in the brief, e.g. SP-08, comes from a `submitOrder` that
 *  runs through the real facade); `overrideProvider` would refuse
 *  because the module is already instantiated. */
let currentStub: ActivatedRouteStub;
let paramMapSubject: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

function makeStub(): ActivatedRouteStub {
  paramMapSubject = new BehaviorSubject(convertToParamMap({}));
  const initialSnapshot = convertToParamMap({});
  return {
    paramMap: paramMapSubject.asObservable(),
    snapshot: { paramMap: initialSnapshot },
  };
}

function withOrderId(orderId: string): void {
  const paramMap = convertToParamMap({ orderId });
  // Replace the snapshot for any first-render `toSignal` reader.
  currentStub.snapshot.paramMap = paramMap;
  // Push through the observable so a page already mounted picks up the
  // new value via the subject's synchronous emission to new ones and
  // queued emission to subscribers.
  paramMapSubject.next(paramMap);
}

beforeAll(() => {
  if (!isCatalogFixtureShape(catalogFixture)) {
    throw new Error('[success-page.spec] committed fixture does not match expected shape');
  }
  loadCatalogFixture(catalogFixture);
});

beforeEach((): void => {
  const clock = createFixedClock('2026-09-20T10:00:00.000Z');
  const ids = createDeterministicIds(1);
  const repository = new Repository(DEFAULT_SCENARIO, ids, clock);
  const options = {
    repository,
    clock,
    ids,
    scenario: DEFAULT_SCENARIO,
    apiRoot: '/api/v1',
  };
  server.use(...createHandlers(options));
});

afterEach(() => {
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
  sessionStorage.clear();
});

function configureTestBed(): void {
  currentStub = makeStub();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: currentStub },
    ],
    teardown: { destroyAfterEach: true },
  });
}

/** Records every request the MSW server sees as `"<METHOD> <path>"`,
 *  and returns an unsubscribe function so a case can detach the
 *  listener when its assertions are done. MSW 2's `server.events`
 *  expose `removeListener(eventName, listener)`; storing the
 *  listener in a `const` is what makes the detachment work.
 */
function captureRequests(log: string[]): () => void {
  const listener = ({ request }: { request: Request }): void => {
    const url = new URL(request.url);
    log.push(`${request.method} ${url.pathname}${url.search}`);
  };
  server.events.on('request:start', listener);
  return (): void => {
    server.events.removeListener('request:start', listener);
  };
}

/** Builds the complete cash-on-delivery draft (the path that yields the
 *  89 990 / 0 / 490 / 90 480 totals the brief locks in). */
async function seedCompleteCashDraft(): Promise<void> {
  const cart = TestBed.inject(CartFacade);
  const checkout = TestBed.inject(CheckoutFacade);
  await cart.ensureCart();
  await cart.addItem(MOTO, 1);
  const contact = await checkout.updateContact(VALID_CONTACT);
  expect(contact.ok).toBe(true);
  const billing = await checkout.updateBilling(VALID_BILLING);
  expect(billing.ok).toBe(true);
  const delivery = await checkout.updateDelivery(HOME_DELIVERY);
  expect(delivery.ok).toBe(true);
  const payment = await checkout.updatePayment(COD_PAYMENT);
  expect(payment.ok).toBe(true);
  const optionsResult = await checkout.ensureOptions();
  expect(optionsResult.ok).toBe(true);
}

/** Submits the active draft as a cash-on-delivery order and returns
 *  the wire `id` of the receipt the mock stored. */
async function placeCodOrder(): Promise<{ orderId: string; receipt: OrderReceipt }> {
  const checkout = TestBed.inject(CheckoutFacade);
  const placed = await checkout.submitOrder({
    paymentMethod: 'cash_on_delivery',
    termsVersion: TERMS_VERSION,
    acceptedTerms: true,
  });
  if (!placed.ok) throw new Error(`submitOrder failed: ${placed.error.code}`);
  return { orderId: placed.value.id, receipt: placed.value };
}

/** Mounts `SuccessStep` after `withOrderId(id)` pushes the id into the
 *  shared stub, and waits for the hydration pipeline to settle. Used by
 *  every page case that does not place one first. */
async function mountSuccessPage(orderId: string): Promise<ComponentFixture<SuccessStep>> {
  withOrderId(orderId);
  const fixture = TestBed.createComponent(SuccessStep);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

// ---------------------------------------------------------------------------
// SP-01..SP-05 — the OrderReceiptComponent on the 2.0.0 wire shape
// ---------------------------------------------------------------------------

describe('OrderReceiptComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
      teardown: { destroyAfterEach: true },
    });
  });

  it('SP-01 the receipt renders the order number, the line items and the four totals from the wire payload', () => {
    const fixture: ComponentFixture<OrderReceiptComponent> =
      TestBed.createComponent(OrderReceiptComponent);
    fixture.componentRef.setInput('receipt', makeReceipt());
    fixture.detectChanges();

    const lines = queryAllHTMLElements(document, '[data-testid="receipt-line"]');
    expect(lines).toHaveLength(1);
    const first = lines[0];
    expect(first.textContent).toContain(MOTO_PRODUCT_NAME);
    expect(first.textContent).toContain('1 db');

    const orderNumber = queryHTMLElement(document, '[data-testid="receipt-order-number"]');
    expect(orderNumber?.textContent.trim()).toBe('DEMO-000001');

    expect(
      queryHTMLElement(document, '[data-testid="receipt-row-subtotal"] dd')?.textContent,
    ).toContain(PriceBlock.formatHuf(89_990));
    expect(
      queryHTMLElement(document, '[data-testid="receipt-row-shipping"] dd')?.textContent,
    ).toContain(PriceBlock.formatHuf(0));
    expect(
      queryHTMLElement(document, '[data-testid="receipt-row-payment-fee"] dd')?.textContent,
    ).toContain(PriceBlock.formatHuf(490));
    expect(
      queryHTMLElement(document, '[data-testid="receipt-row-total"] dd')?.textContent,
    ).toContain(PriceBlock.formatHuf(90_480));
  });

  it('SP-01b the receipt prints each total label once and no heading of its own', () => {
    const fixture: ComponentFixture<OrderReceiptComponent> =
      TestBed.createComponent(OrderReceiptComponent);
    fixture.componentRef.setInput('receipt', makeReceipt());
    fixture.detectChanges();

    expect(queryHTMLElement(document, '[data-testid="receipt-heading"]')).toBeNull();
    expect(queryHTMLElement(document, '[data-testid="order-receipt"] h2')).toBeNull();
    const rows: readonly (readonly [string, string])[] = [
      ['receipt-row-subtotal', 'Részösszeg'],
      ['receipt-row-shipping', 'Szállítási díj'],
      ['receipt-row-payment-fee', 'Fizetési díj'],
      ['receipt-row-total', 'Végösszeg'],
    ];
    for (const [testId, label] of rows) {
      const row = queryHTMLElement(document, `[data-testid="${testId}"]`);
      expect(row?.textContent.split(label)).toHaveLength(2);
      expect(queryHTMLElement(document, `[data-testid="${testId}"] dd .label`)).toBeNull();
    }
  });

  it('SP-02 the receipt renders the Hungarian payment and delivery labels the component maps', () => {
    const fixture: ComponentFixture<OrderReceiptComponent> =
      TestBed.createComponent(OrderReceiptComponent);

    fixture.componentRef.setInput(
      'receipt',
      makeReceipt({ paymentMethod: 'cash_on_delivery', delivery: HOME_DELIVERY }),
    );
    fixture.detectChanges();
    expect(
      queryHTMLElement(document, '[data-testid="receipt-row-payment"] dd')?.textContent.trim(),
    ).toBe('Utánvét');
    expect(
      queryHTMLElement(document, '[data-testid="receipt-row-delivery"] dd')?.textContent.trim(),
    ).toBe('Házhoz szállítás');

    fixture.componentRef.setInput(
      'receipt',
      makeReceipt({ paymentMethod: 'card', delivery: PICKUP }),
    );
    fixture.detectChanges();
    expect(
      queryHTMLElement(document, '[data-testid="receipt-row-payment"] dd')?.textContent.trim(),
    ).toBe('Bankkártya');
    expect(
      queryHTMLElement(document, '[data-testid="receipt-row-delivery"] dd')?.textContent.trim(),
    ).toBe('Átvételi pont');
  });

  it('SP-03 the receipt renders the wire notice, and its own sentence only when the wire sends none', () => {
    const fixture: ComponentFixture<OrderReceiptComponent> =
      TestBed.createComponent(OrderReceiptComponent);

    fixture.componentRef.setInput(
      'receipt',
      makeReceipt({ notice: 'A custom wire-supplied simulation notice.' }),
    );
    fixture.detectChanges();
    const noticeWithWire = queryHTMLElement(document, '[data-testid="receipt-simulation-notice"]');
    expect(noticeWithWire?.textContent).toContain('A custom wire-supplied simulation notice.');

    fixture.componentRef.setInput('receipt', makeReceipt({ notice: '' }));
    fixture.detectChanges();
    const noticeWithoutWire = queryHTMLElement(
      document,
      '[data-testid="receipt-simulation-notice"]',
    );
    expect(noticeWithoutWire?.textContent).toContain(
      'Nem történt valódi fizetés, rendelésküldés vagy e-mail-küldés — ez egy demó folyamat.',
    );
  });

  it('SP-03b decision 16: the receipt notice renders through the StatusMessage primitive without being a live region', () => {
    const fixture: ComponentFixture<OrderReceiptComponent> =
      TestBed.createComponent(OrderReceiptComponent);
    fixture.componentRef.setInput('receipt', makeReceipt({ notice: '' }));
    fixture.detectChanges();

    const notice = queryHTMLElement(document, '[data-testid="receipt-simulation-notice"]');
    const inner = notice?.querySelector('[data-testid="status-message"]');
    expect(inner).not.toBeNull();
    expect(inner?.getAttribute('role')).toBeNull();
    expect(inner?.getAttribute('aria-live')).toBeNull();
    expect(inner?.classList.contains('is-info')).toBe(true);
    expect(notice?.querySelector('app-button')).toBeNull();
    expect(notice?.textContent).toContain('Demó figyelmeztetés.');
  });

  it('SP-04 the receipt is presentational: it renders from its input with no facade and no router provided', () => {
    // TestBed was already configured with only `provideZonelessChangeDetection`
    // in the outer `beforeEach`. The component has no constructor dependencies
    // beyond `input.required<OrderReceipt>()`, so the render is the test.
    const fixture: ComponentFixture<OrderReceiptComponent> =
      TestBed.createComponent(OrderReceiptComponent);
    fixture.componentRef.setInput('receipt', makeReceipt());
    fixture.detectChanges();

    const receipt = queryHTMLElement(document, '[data-testid="order-receipt"]');
    expect(receipt).not.toBeNull();
    expect(receipt?.textContent).toContain('DEMO-000001');
    expect(receipt?.textContent).toContain(PriceBlock.formatHuf(90_480));
  });

  it('SP-05 the receipt shows the order status row', () => {
    const fixture: ComponentFixture<OrderReceiptComponent> =
      TestBed.createComponent(OrderReceiptComponent);
    fixture.componentRef.setInput('receipt', makeReceipt());
    fixture.detectChanges();

    const statusRow = queryHTMLElement(document, '[data-testid="receipt-row-status"]');
    expect(statusRow).not.toBeNull();
    expect(statusRow?.textContent).toContain('Státusz');
    expect(statusRow?.textContent).toContain('Demó rendelés visszaigazolva');
  });
});

// ---------------------------------------------------------------------------
// SP-06..SP-15 — the SuccessStep hydration pipeline
// ---------------------------------------------------------------------------

describe('SuccessStep', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('SP-06 the page renders the loading placeholder while the receipt is being fetched', async () => {
    withOrderId('ord-loading');
    const fixture = TestBed.createComponent(SuccessStep);
    fixture.detectChanges();
    // The loading branch is set inside `hydrate()` *before* the
    // `await this.checkout.fetchOrder(...)` suspends. Reading the DOM
    // synchronously here catches the placeholder while the GET is
    // still in flight.
    expect(queryHTMLElement(document, '[data-testid="success-loading"]')).not.toBeNull();
    expect(queryHTMLElement(document, '[data-testid="order-receipt"]')).toBeNull();

    await fixture.whenStable();
  });

  it('SP-07 the page hydrates a reloaded receipt through a GET and never issues an order POST', async () => {
    // First, place a real order so the wire store has a receipt to return.
    await seedCompleteCashDraft();
    const placed = await placeCodOrder();
    const orderId = placed.orderId;

    // Drop the in-memory snapshot, the way a hard reload does.
    TestBed.resetTestingModule();
    configureTestBed();
    const requests: string[] = [];
    const stopCapturing = captureRequests(requests);

    const _fixture = await mountSuccessPage(orderId);

    const gets = requests.filter((entry) => entry.startsWith('GET '));
    expect(gets).toContain(`GET /api/v1/orders/${orderId}`);
    expect(queryHTMLElement(document, '[data-testid="order-receipt"]')).not.toBeNull();

    // The proof the case pins: a POST /orders ever showing here is
    // the regression the brief forbids.
    const posts = requests.filter(
      (entry) => entry.startsWith('POST ') && entry.includes('/orders'),
    );
    expect(posts).toEqual([]);
    stopCapturing();
  });

  it('SP-08 the page renders the receipt already in memory without a second request', async () => {
    await seedCompleteCashDraft();
    const placed = await placeCodOrder();
    const orderId = placed.orderId;

    // The facade now carries the order. Mount the page with that id
    // and watch for any GET /orders/<id>.
    const requests: string[] = [];
    const stopCapturing = captureRequests(requests);

    const _fixture = await mountSuccessPage(orderId);

    const gets = requests.filter(
      (entry) => entry.startsWith('GET ') && entry.includes(`/orders/${orderId}`),
    );
    expect(gets).toEqual([]);
    expect(queryHTMLElement(document, '[data-testid="order-receipt"]')).not.toBeNull();
    stopCapturing();
  });

  it('SP-09 an unknown order id renders the recovery state and never fabricates a success', async () => {
    const requests: string[] = [];
    const stopCapturing = captureRequests(requests);

    const _fixture = await mountSuccessPage('ord-missing');

    expect(queryHTMLElement(document, '[data-testid="success-missing"]')).not.toBeNull();
    expect(queryHTMLElement(document, '[data-testid="order-receipt"]')).toBeNull();
    const missing = queryHTMLElement(document, '[data-testid="success-missing"]');
    expect(missing?.textContent).toContain('ord-missing');
    // A 404 fetch did happen, but no POST ever.
    const posts = requests.filter(
      (entry) => entry.startsWith('POST ') && entry.includes('/orders'),
    );
    expect(posts).toEqual([]);
    stopCapturing();
  });

  it('SP-10 a non-404 failure renders the error state carrying the retry control', async () => {
    server.use(http.get('*/api/v1/orders/:orderId', () => fiveHundred()));

    const _fixture = await mountSuccessPage('ord-500');

    expect(queryHTMLElement(document, '[data-testid="success-error"]')).not.toBeNull();
    expect(queryHTMLElement(document, '[data-testid="success-missing"]')).toBeNull();
  });

  it("SP-10b a failure's wire detail never reaches the error box", async () => {
    server.use(http.get('*/api/v1/orders/:orderId', () => fiveHundred()));

    const _fixture = await mountSuccessPage('ord-500');

    const errorBox = queryHTMLElement(document, '[data-testid="success-error"]');
    expect(errorBox).not.toBeNull();
    expect(errorBox?.textContent).toContain('A rendelés visszatöltése sikertelen.');
    expect(errorBox?.textContent).not.toContain('Mocked 500');
  });

  it('SP-11 a malformed order id is treated as missing without any request', async () => {
    const requests: string[] = [];
    const stopCapturing = captureRequests(requests);

    const _fixture = await mountSuccessPage('nope/../etc');

    expect(queryHTMLElement(document, '[data-testid="success-missing"]')).not.toBeNull();
    const gets = requests.filter((entry) => entry.startsWith('GET ') && entry.includes('/orders'));
    expect(gets).toEqual([]);
    stopCapturing();
  });

  it('SP-12 the retry re-issues the fetch and reaches the receipt on the second attempt', async () => {
    // Place a real order, then drop the in-memory snapshot the way a
    // reload would.
    await seedCompleteCashDraft();
    const placed = await placeCodOrder();
    const orderId = placed.orderId;
    TestBed.resetTestingModule();
    configureTestBed();

    // First GET → 500, second GET → the real handler. We toggle the
    // override off when the first request lands.
    let firstAttempt = true;
    server.use(
      http.get('*/api/v1/orders/:orderId', () => {
        if (firstAttempt) {
          firstAttempt = false;
          return fiveHundred();
        }
        return undefined;
      }),
    );

    const fixture = await mountSuccessPage(orderId);

    // First attempt landed as the error state.
    expect(queryHTMLElement(document, '[data-testid="success-error"]')).not.toBeNull();
    expect(queryHTMLElement(document, '[data-testid="order-receipt"]')).toBeNull();

    // Capture the second attempt onward.
    const captured: string[] = [];
    const stopCapturing = captureRequests(captured);

    // The error state hosts a `Retry` button. Drive it through the
    // `ErrorState` component's `(retryRequested)` output by clicking
    // the rendered button — the page wires that output to `onRetry`.
    const errorButton = queryHTMLElement(
      document,
      '[data-testid="success-error"] app-error-state button',
    );
    expect(errorButton).not.toBeNull();
    if (!(errorButton instanceof HTMLButtonElement)) {
      throw new Error('expected the error-state action to be an HTMLButtonElement');
    }
    errorButton.click();

    await fixture.whenStable();
    fixture.detectChanges();

    const gets = captured.filter(
      (entry) => entry.startsWith('GET ') && entry.includes(`/orders/${orderId}`),
    );
    expect(gets).toHaveLength(1);
    expect(queryHTMLElement(document, '[data-testid="order-receipt"]')).not.toBeNull();

    stopCapturing();
  });

  it('SP-13 the page resets the ordered cart once the receipt is in memory', async () => {
    await seedCompleteCashDraft();
    await placeCodOrder();
    // `submitOrder` leaves the cart alone; the reset is the page's own
    // `hasReceipt` effect calling `resetOrderedCart`. So put a fresh item
    // in first, then mount the page (no second fetch, the receipt is
    // already in memory) and watch `itemCount` drop to zero.
    const cart = TestBed.inject(CartFacade);
    await cart.ensureCart();
    await cart.addItem(MOTO, 1);
    expect(cart.itemCount()).toBe(1);

    const checkout = TestBed.inject(CheckoutFacade);
    const orderId = checkout.order()?.id;
    if (orderId === undefined) throw new Error('expected an order on the facade');

    const _fixture = await mountSuccessPage(orderId);

    expect(queryHTMLElement(document, '[data-testid="order-receipt"]')).not.toBeNull();
    expect(cart.itemCount()).toBe(0);
  });

  it('SP-14 the success heading reads the demo sentence', async () => {
    await seedCompleteCashDraft();
    const placed = await placeCodOrder();

    const _fixture = await mountSuccessPage(placed.orderId);

    const heading = queryHTMLElement(document, '[data-testid="success-heading"]');
    expect(heading?.textContent.trim()).toBe('Elkészült a demórendelésed.');
    expect(heading?.hasAttribute('tabindex')).toBe(false);
  });

  it('SP-15 the new-shopping action ensures a fresh cart, clears the receipt and leaves for the catalogue', async () => {
    await seedCompleteCashDraft();
    await placeCodOrder();
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = TestBed.inject(CartFacade);
    const router = TestBed.inject(Router);

    const orderId = checkout.order()?.id;
    if (orderId === undefined) throw new Error('expected an order on the facade');

    const fixture = await mountSuccessPage(orderId);

    const ensureCartSpy = vi.spyOn(cart, 'ensureCart').mockResolvedValue();
    const startSpy = vi.spyOn(checkout, 'startNewPurchase').mockImplementation(() => undefined);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const actionWrapper = queryHTMLElement(document, '[data-testid="success-new-shopping"]');
    expect(actionWrapper).not.toBeNull();
    expect(actionWrapper?.textContent).toContain('Vissza a telefonokhoz');

    const actionButton = queryHTMLElement(document, '[data-testid="success-new-shopping"] button');
    expect(actionButton).not.toBeNull();
    if (!(actionButton instanceof HTMLButtonElement)) {
      throw new Error('expected the new-shopping action to be an HTMLButtonElement');
    }
    actionButton.click();

    await fixture.whenStable();

    expect(ensureCartSpy).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy.mock.calls[0][0]).toEqual(['/telefonok']);

    // The three calls happened in this order; no other navigation
    // action fired on the page.
    const ensureOrder = ensureCartSpy.mock.invocationCallOrder[0];
    const navOrder = navigateSpy.mock.invocationCallOrder[0];
    const startOrder = startSpy.mock.invocationCallOrder[0];
    expect(ensureOrder).toBeLessThan(navOrder);
    expect(navOrder).toBeLessThan(startOrder);
  });

  it('SP-22 the new-shopping action does not navigate once the page is gone, and still clears the receipt', async () => {
    await seedCompleteCashDraft();
    await placeCodOrder();
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = TestBed.inject(CartFacade);
    const router = TestBed.inject(Router);

    const orderId = checkout.order()?.id;
    if (orderId === undefined) throw new Error('expected an order on the facade');

    const fixture = await mountSuccessPage(orderId);

    let releaseEnsureCart!: () => void;
    const ensureCartSpy = vi.spyOn(cart, 'ensureCart').mockImplementation(
      () =>
        new Promise<void>((r) => {
          releaseEnsureCart = r;
        }),
    );
    const startSpy = vi.spyOn(checkout, 'startNewPurchase').mockImplementation(() => undefined);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const actionButton = queryHTMLElement(document, '[data-testid="success-new-shopping"] button');
    if (!(actionButton instanceof HTMLButtonElement)) {
      throw new Error('expected the new-shopping action to be an HTMLButtonElement');
    }
    actionButton.click();
    fixture.destroy();
    releaseEnsureCart();
    await vi.waitFor(() => {
      expect(ensureCartSpy).toHaveBeenCalledTimes(1);
      expect(startSpy).toHaveBeenCalledTimes(1);
    });

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('SP-23 a failed new-shopping action does not send a page that is gone to the cart', async () => {
    await seedCompleteCashDraft();
    await placeCodOrder();
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = TestBed.inject(CartFacade);
    const router = TestBed.inject(Router);

    const orderId = checkout.order()?.id;
    if (orderId === undefined) throw new Error('expected an order on the facade');

    const fixture = await mountSuccessPage(orderId);

    let releaseEnsureCart!: (reason: unknown) => void;
    const ensureCartSpy = vi.spyOn(cart, 'ensureCart').mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          releaseEnsureCart = reject;
        }),
    );
    const startSpy = vi.spyOn(checkout, 'startNewPurchase').mockImplementation(() => undefined);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const actionButton = queryHTMLElement(document, '[data-testid="success-new-shopping"] button');
    if (!(actionButton instanceof HTMLButtonElement)) {
      throw new Error('expected the new-shopping action to be an HTMLButtonElement');
    }
    actionButton.click();
    fixture.destroy();
    releaseEnsureCart(new Error('down'));
    await vi.waitFor(() => {
      expect(fixture.componentInstance.startingNewCart()).toBe(false);
    });

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(startSpy).not.toHaveBeenCalled();
    expect(ensureCartSpy).toHaveBeenCalledTimes(1);
  });

  it('SP-21 the success mark is yettel check-circle: 32px, two filled paths, no stroke', async () => {
    await seedCompleteCashDraft();
    const placed = await placeCodOrder();

    const _fixture = await mountSuccessPage(placed.orderId);

    const check = document.querySelector('[data-testid="success-check"]');
    expect(check?.getAttribute('viewBox')).toBe('0 0 32 32');
    expect(check?.getAttribute('width')).toBe('32');
    expect(check?.getAttribute('height')).toBe('32');
    const paths = Array.from(check?.querySelectorAll('path') ?? []);
    expect(paths).toHaveLength(2);
    expect(paths.every((p) => p.getAttribute('fill') === 'currentColor')).toBe(true);
    expect(check?.querySelector('[stroke]')).toBeNull();
    expect(check?.parentElement?.classList.contains('success-title')).toBe(true);
  });

  it('SP-18 after the new-shopping action the facade holds no order, so a wizard guard would not redirect to the success URL', async () => {
    await seedCompleteCashDraft();
    await placeCodOrder();
    const checkout = TestBed.inject(CheckoutFacade);
    const cart = TestBed.inject(CartFacade);
    const router = TestBed.inject(Router);

    const orderId = checkout.order()?.id;
    if (orderId === undefined) throw new Error('expected an order on the facade');

    const fixture = await mountSuccessPage(orderId);

    // No spies on the facade here — the assertion is on what the
    // page's handler chain leaves behind on the real facade.
    vi.spyOn(cart, 'ensureCart').mockResolvedValue();
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const actionButton = queryHTMLElement(document, '[data-testid="success-new-shopping"] button');
    if (!(actionButton instanceof HTMLButtonElement)) {
      throw new Error('expected the new-shopping action to be an HTMLButtonElement');
    }
    actionButton.click();

    await fixture.whenStable();

    expect(TestBed.inject(CheckoutFacade).order()).toBeNull();
  });

  // MIM-240b1: the demo notice is `app-status-message` with the primitive's
  // own message string and `[persistent]` true. The data-testid stays on
  // the primitive's host so any existing query keeps working.
  it('SP-19 renders the exact message string the primitive carries (MIM-240b1)', async () => {
    await seedCompleteCashDraft();
    const placed = await placeCodOrder();

    await mountSuccessPage(placed.orderId);

    const demoNotice = queryHTMLElement(document, '[data-testid="success-demo-notice"]');
    expect(demoNotice?.textContent.trim()).toBe(
      'Demó pénztár. A sikeroldal csupán a működést mutatja be — nem történt valódi fizetés, szállítás vagy e-mail-küldés.',
    );
  });

  it('SP-20 renders no "Bezárás" dismiss button because the primitive is persistent (MIM-240b1)', async () => {
    await seedCompleteCashDraft();
    const placed = await placeCodOrder();

    await mountSuccessPage(placed.orderId);

    const demoNotice = queryHTMLElement(document, '[data-testid="success-demo-notice"]');
    expect(demoNotice?.textContent ?? '').not.toContain('Bezárás');
  });
});

// ---------------------------------------------------------------------------
// SP-16, SP-17 — successGuard on the success URL, driven through the router
// ---------------------------------------------------------------------------

describe('successGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
        // The success route with `:orderId` covers SP-16; a sibling route
        // without `:orderId` is needed so SP-17's "no order id" URL
        // matches a guarded path and the guard's empty-paramMap branch
        // runs. A `children: []` route needs no component, so nothing
        // empty is declared and nothing is cast.
        provideRouter([
          {
            path: 'penztar/siker/:orderId',
            canActivate: [successGuard],
            children: [],
          },
          {
            path: 'penztar/siker',
            canActivate: [successGuard],
            children: [],
          },
          { path: 'penztar/kosar', children: [] },
        ]),
      ],
      teardown: { destroyAfterEach: true },
    });
  });

  it('SP-16 the success guard lets a route carrying an order id through, so the page owns the hydration', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/penztar/siker/ord-guard-1');
    expect(TestBed.inject(Router).url).toBe('/penztar/siker/ord-guard-1');
  });

  it('SP-17 the success guard sends a deep link with no order id back to the cart', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/penztar/siker');
    const url = TestBed.inject(Router).url;
    expect(url).toContain('/penztar/kosar');
    expect(url).toContain('navigationReason=deep-link');
  });
});

// ---------------------------------------------------------------------------
// SP-18..SP-20 — additional OrderReceiptComponent cases that the brief pulls
// out of the presentational layer
// ---------------------------------------------------------------------------

describe('OrderReceiptComponent — billing and delivery address', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
      teardown: { destroyAfterEach: true },
    });
  });

  it('SP-18 the receipt shows no name, address or e-mail', () => {
    const fixture: ComponentFixture<OrderReceiptComponent> =
      TestBed.createComponent(OrderReceiptComponent);
    fixture.componentRef.setInput(
      'receipt',
      makeReceipt({
        contactEmail: 'teszt.elek@pelda.hu',
        billing: {
          name: 'Teszt Elek',
          address: {
            countryCode: 'HU',
            postalCode: '1011',
            city: 'Budapest',
            line1: 'Fő utca 1.',
            line2: '2. emelet',
          },
        },
        delivery: {
          optionId: 'home_delivery',
          address: {
            countryCode: 'HU',
            postalCode: '1055',
            city: 'Budapest',
            line1: 'Kossuth tér 2.',
          },
        },
      }),
    );
    fixture.detectChanges();

    const receiptRoot = queryHTMLElement(document, '[data-testid="order-receipt"]');
    if (receiptRoot === null) throw new Error('receipt not in the DOM');
    const text = collapsedText(receiptRoot);
    expect(text).not.toContain('Teszt Elek');
    expect(text).not.toContain('Fő utca 1.');
    expect(text).not.toContain('2. emelet');
    expect(text).not.toContain('Kossuth tér 2.');
    expect(text).not.toContain('teszt.elek@pelda.hu');

    expect(queryHTMLElement(document, '[data-testid="receipt-row-billing"]')).toBeNull();
    expect(queryHTMLElement(document, '[data-testid="receipt-row-delivery-address"]')).toBeNull();
  });

  it('SP-19 the delivery row names the method for home delivery and for pickup', () => {
    const fixture: ComponentFixture<OrderReceiptComponent> =
      TestBed.createComponent(OrderReceiptComponent);

    fixture.componentRef.setInput('receipt', makeReceipt({ delivery: HOME_DELIVERY }));
    fixture.detectChanges();
    const homeDd = queryHTMLElement(document, '[data-testid="receipt-row-delivery"] dd');
    expect(collapsedText(homeDd)).toBe('Házhoz szállítás');

    fixture.componentRef.setInput(
      'receipt',
      makeReceipt({ delivery: { optionId: 'pickup_point' } }),
    );
    fixture.detectChanges();
    const pickupDd = queryHTMLElement(document, '[data-testid="receipt-row-delivery"] dd');
    expect(collapsedText(pickupDd)).toBe('Átvételi pont');
  });

  it('SP-20 the receipt meta rows are payment, delivery and status', () => {
    const fixture: ComponentFixture<OrderReceiptComponent> =
      TestBed.createComponent(OrderReceiptComponent);
    fixture.componentRef.setInput('receipt', makeReceipt());
    fixture.detectChanges();

    const meta = queryHTMLElement(document, '[data-testid="receipt-meta"]');
    if (meta === null) throw new Error('meta block not in the DOM');
    const ids: string[] = [];
    const rows = meta.querySelectorAll('[data-testid^="receipt-row-"]');
    for (const row of Array.from(rows)) {
      ids.push(row.getAttribute('data-testid') ?? '');
    }
    expect(ids).toEqual(['receipt-row-payment', 'receipt-row-delivery', 'receipt-row-status']);
  });
});
