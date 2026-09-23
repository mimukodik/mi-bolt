/**
 * MIM-212 — the checkout flow spec across the wizard routes (S3-F2-9).
 *
 * Six cases that drive the wizard as a route sequence, the only ones
 * in the checkout suite that mount every page under `checkoutRoutes`
 * and assert `router.url` after each hop. The other suites use facade
 * spies or a single route; this one uses the real route table so the
 * three guards (`contactGuard`, `deliveryGuard`, `reviewGuard`) and
 * the `successGuard` decide every hop the way the application does.
 *
 * The harness mirrors `checkout-guards.spec.ts` — the MSW handlers, the
 * `useMswServer()` lifecycle, the catalogue load in `beforeAll`, the
 * MSW setup in `beforeEach`, the `configureTestBed()` shape and the
 * `reloadDocument()` helper. The two differences are that
 * `configureTestBed()` here uses `provideRouter(checkoutRoutes)`
 * (the harness passes `provideRouter([])` because the guards under
 * test are called through `TestBed.runInInjectionContext`), and that
 * `seedCartWithItem`, `saveContact`, `saveDelivery`, `savePayment`
 * and `saveBilling` are copied verbatim.
 */

import '@angular/compiler';

// @vitest-environment jsdom
import { HttpResponse, http } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { server, useMswServer } from '../../../../../../tests/msw-server';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter } from '@angular/router';

import { provideApiConfiguration } from '../../../app/api/generated/api-configuration';
import { demoSessionInterceptor } from '../../../app/core/api/demo-session.interceptor';

import { createHandlers } from '../../../mocks/create-handlers';
import { Repository } from '../../../mocks/repository';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
} from '../../../mocks/scenarios';
import { TERMS_VERSION } from '../../../mocks/checkout/checkout-store';
import catalogFixture from '../../../../../../docs/api/fixtures/catalog.json';
import { isCatalogFixtureShape, loadCatalogFixture } from '../../../mocks/catalog/catalog.handlers';

import '../../../mocks/cart/cart.handlers';
import '../../../mocks/checkout/checkout.handlers';
import '../../../mocks/payment/payment.handlers';
import '../../../mocks/orders/order.handlers';

import type { Address } from '../../../app/api/generated/models/address';
import type { BillingDetails } from '../../../app/api/generated/models/billing-details';
import type { Contact } from '../../../app/api/generated/models/contact';
import type { DeliverySelection } from '../../../app/api/generated/models/delivery-selection';
import type { PaymentSelection } from '../../../app/api/generated/models/payment-selection';

import { CartFacade } from '../../../app/features/cart/cart.facade';
import { CheckoutFacade } from '../../../app/features/checkout/checkout.facade';
import { checkoutRoutes } from './checkout.routes';
import { ContactPage } from './contact-page';
import {
  CONTACT_DRAFT_SAVER,
  type ContactDraftSaver,
  type ContactSubmission,
} from './contact-step';
import { DeliveryPage } from './delivery-page';
import { OrderSubmission } from './order-submission';

import type { Routes } from '@angular/router';

/**
 * `checkoutRoutes` is mounted under `path: 'penztar'` in `app.routes.ts`
 * via `loadChildren`. The TestBed only sees the children array, so
 * each step's `path` is relative to `penztar` — the harness here
 * reattaches that parent and strips the `CheckoutLayout` shell
 * component the wizard page needs in the browser but the route
 * matching never instantiates (every step page owns its own H1 and
 * the assertions read the routed page, not the shell).
 */
const ROUTES_UNDER_PENZTAR: Routes = [
  {
    path: 'penztar',
    children: checkoutRoutes.map((route) => {
      const stripped = { ...route };
      delete stripped.component;
      return stripped;
    }),
  },
];

/**
 * The real `CONTACT_DRAFT_SAVER` factory lives in `checkout.routes.ts`
 * where it is provided on the `/adatok` route's `providers` array.
 * That route-scoped binding is invisible to `TestBed.createComponent`
 * (which builds the component in the TestBed's root injector), so the
 * test bed registers the same factory here so the test exercises the
 * real save path through `CheckoutFacade.updateContact`. The other
 * tests do not need it: CF-02 does not save, CF-03 / CF-04 / CF-05 /
 * CF-06 call `checkout.updateContact()` directly and only mount the
 * contact page to read its form tree.
 */
const contactDraftSaverFactory =
  (checkout: CheckoutFacade): ContactDraftSaver =>
  async (submission: ContactSubmission) => {
    const result = await checkout.updateContact(submission);
    return result.ok ? { ok: true } : { ok: false, message: result.error.detail };
  };

useMswServer();

const BASE_URL = 'http://localhost/api/v1';
const MOTO = 'motorola-edge-50-fusion--zold--256';

const VALID_CONTACT: Contact = {
  fullName: 'Teszt Elek',
  email: 'Teszt.Elek@Pelda.hu',
  phone: '+36301234567',
};

/**
 * The form `initialContact` copies field-by-field from `session.contact`,
 * which the server stores with the email lower-cased by
 * `normalizeContactEmail` (`src/mocks/checkout/validate-checkout.ts`).
 * The two values are kept separate so the assertions show the case
 * pins the form-to-session copy rather than a literal re-use of
 * `VALID_CONTACT`.
 */
const STORED_CONTACT: Contact = {
  fullName: 'Teszt Elek',
  email: 'teszt.elek@pelda.hu',
  phone: '+36301234567',
};

const VALID_DELIVERY_ADDRESS: Address = {
  countryCode: 'HU',
  postalCode: '1052',
  city: 'Budapest',
  line1: 'Petőfi utca 1.',
};

const VALID_BILLING: BillingDetails = {
  name: 'Teszt Elek',
  address: VALID_DELIVERY_ADDRESS,
};

const HOME_DELIVERY: DeliverySelection = {
  optionId: 'home_delivery',
  address: VALID_DELIVERY_ADDRESS,
};

const CARD_PAYMENT: PaymentSelection = { method: 'card' };

/**
 * Every request MSW saw since the last `requestLog = []`, as
 * `"<METHOD> <pathname>"`. Recorded synchronously in the
 * `request:start` listener so a case can compare the leading slice to
 * an exact array.
 */
let requestLog: string[] = [];

/** Captured from the `X-Demo-Session` header of the most recent
 *  HttpClient request. The Angular unit-test environment does not
 *  persist sessionStorage between the interceptor (which writes to
 *  it) and `fetch()` (which would read it back), so the spec
 *  captures the id from the outgoing wire instead. */
let capturedDemoSession: string | null = null;

beforeAll(() => {
  if (!isCatalogFixtureShape(catalogFixture)) {
    throw new Error('[checkout-flow.spec] committed fixture does not match expected shape');
  }
  loadCatalogFixture(catalogFixture);
});

beforeEach((): void => {
  requestLog = [];
  capturedDemoSession = null;
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
  // createHandlers() builds its own IdempotencyStore from options.clock,
  // so the clock shared with the cart, checkout and order stores is the
  // same one the idempotency cache uses.
  server.use(...createHandlers(options));
  server.events.on('request:start', ({ request }) => {
    requestLog.push(`${request.method} ${new URL(request.url).pathname}`);
    const session = request.headers.get('X-Demo-Session');
    if (session !== null && capturedDemoSession === null) {
      capturedDemoSession = session;
    }
  });
});

afterEach(() => {
  server.events.removeAllListeners('request:start');
  TestBed.resetTestingModule();
  sessionStorage.clear();
});

/**
 * Stands up the TestBed with the real checkout route table. The guards
 * and `successGuard` therefore decide every `router.navigateByUrl`
 * call exactly as the running application would.
 */
function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
      provideRouter(ROUTES_UNDER_PENZTAR),
      {
        provide: CONTACT_DRAFT_SAVER,
        useFactory: contactDraftSaverFactory,
        deps: [CheckoutFacade],
      },
    ],
    teardown: { destroyAfterEach: true },
  });
}

/**
 * Reproduces a document reload: the injector tree (and with it every
 * facade snapshot) is dropped and rebuilt, while the MSW stores and
 * the `sessionStorage` demo session id survive, so the server still
 * holds the cart and the draft the case seeded. The request log is
 * cleared with it, so a case measures only what the guards and the
 * page constructors issue.
 */
function reloadDocument(): void {
  TestBed.resetTestingModule();
  configureTestBed();
  requestLog = [];
}

async function seedCartWithItem(): Promise<void> {
  const cart = TestBed.inject(CartFacade);
  await cart.ensureCart();
  await cart.addItem(MOTO, 1);
  expect(cart.cart()?.items.length).toBe(1);
}

async function saveContact(): Promise<void> {
  const checkout = TestBed.inject(CheckoutFacade);
  const result = await checkout.updateContact(VALID_CONTACT);
  expect(result.ok).toBe(true);
}

async function saveDelivery(): Promise<void> {
  const checkout = TestBed.inject(CheckoutFacade);
  const result = await checkout.updateDelivery(HOME_DELIVERY);
  expect(result.ok).toBe(true);
}

async function savePayment(selection: PaymentSelection = CARD_PAYMENT): Promise<void> {
  const checkout = TestBed.inject(CheckoutFacade);
  const result = await checkout.updatePayment(selection);
  expect(result.ok).toBe(true);
}

async function saveBilling(): Promise<void> {
  const checkout = TestBed.inject(CheckoutFacade);
  const result = await checkout.updateBilling(VALID_BILLING);
  expect(result.ok).toBe(true);
}

/**
 * Flips a payment intent to a terminal status on the mock store and
 * refetches it on the facade so the next `submitOrder()` sees the new
 * status. The fetch is mandatory because `paymentIntentWritable` is
 * not auto-updated when the mock mutates the intent server-side. The
 * `X-Demo-Session` header is captured from the MSW request stream
 * because the bare `fetch()` API bypasses Angular's
 * `demoSessionInterceptor` and the unit-test runner does not persist
 * the sessionStorage value the interceptor writes.
 */
async function resolveIntentOutcome(
  intentId: string,
  outcome: 'succeeded' | 'declined',
): Promise<void> {
  const sessionId = capturedDemoSession ?? '';
  const res = await fetch(`http://localhost/api/v1/payment-intents/${intentId}/outcome`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Demo-Session': sessionId,
    },
    body: JSON.stringify({ outcome }),
  });
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(
      `resolveIntentOutcome failed (session=${sessionId}): ${String(res.status)} ${body}`,
    );
  }
  const refetched = await TestBed.inject(CheckoutFacade).readPaymentIntent(intentId);
  expect(refetched.ok).toBe(true);
}

// ---------------------------------------------------------------------------
// CF-01 — forward navigation through every step ends at the receipt URL
// ---------------------------------------------------------------------------

describe('CF-01 wizard advances from cart to receipt without a navigationReason', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('the wizard advances from the cart through contact, delivery and review to the receipt', async () => {
    await seedCartWithItem();

    const router = TestBed.inject(Router);

    // Hop 1 — /penztar/adatok. The contactGuard hydrates and the cart
    // has items, so the URL is matched as-is.
    await router.navigateByUrl('/penztar/adatok');
    expect(router.url).toBe('/penztar/adatok');
    expect(router.url).not.toContain('navigationReason');

    // Hop 2 — contact → /penztar/szallitas. The page saves the
    // section through the route's `CONTACT_DRAFT_SAVER` factory and
    // then navigates; the `deliveryGuard` accepts because the contact
    // section now exists.
    const contactFixture = TestBed.createComponent(ContactPage);
    await contactFixture.whenStable();
    contactFixture.componentInstance.contactFields.fullName().value.set(VALID_CONTACT.fullName);
    contactFixture.componentInstance.contactFields.email().value.set(VALID_CONTACT.email);
    contactFixture.componentInstance.contactFields.phone().value.set(VALID_CONTACT.phone);
    await contactFixture.componentInstance.onContinue();
    expect(router.url).toBe('/penztar/szallitas');
    expect(router.url).not.toContain('navigationReason');

    // Hop 3 — delivery + payment + billing → /penztar/ellenorzes.
    // `DeliveryPage.onContinueRequested()` runs the three gated saves
    // in order and then navigates; `reviewGuard` accepts because every
    // section is now present.
    const deliveryFixture = TestBed.createComponent(DeliveryPage);
    await deliveryFixture.whenStable();
    deliveryFixture.detectChanges();
    const { fields } = deliveryFixture.componentInstance;
    fields.deliveryOptionId().value.set('home_delivery');
    fields.address.postalCode().value.set(VALID_DELIVERY_ADDRESS.postalCode);
    fields.address.city().value.set(VALID_DELIVERY_ADDRESS.city);
    fields.address.line1().value.set(VALID_DELIVERY_ADDRESS.line1);
    fields.paymentMethod().value.set('cash_on_delivery');
    fields.billingName().value.set(VALID_BILLING.name);
    fields.billingSameAsDelivery().value.set(true);
    await deliveryFixture.componentInstance.onContinueRequested();
    expect(router.url).toBe('/penztar/ellenorzes');
    expect(router.url).not.toContain('navigationReason');

    // Hop 4 — submit a cash-on-delivery order. COD skips the payment
    // intent leg entirely (`order-submission.ts:199-205`) so no
    // redirect to the payment application stands between submit and
    // navigation; `successGuard` accepts because `order()` is set.
    const checkout = TestBed.inject(CheckoutFacade);
    const options = await checkout.ensureOptions();
    expect(options.ok).toBe(true);
    const placed = await checkout.submitOrder({
      paymentMethod: 'cash_on_delivery',
      termsVersion: TERMS_VERSION,
      acceptedTerms: true,
    });
    if (!placed.ok) throw new Error(`submitOrder failed: ${placed.error.code}`);
    const orderId = placed.value.id;
    await router.navigateByUrl(`/penztar/siker/${orderId}`);
    expect(router.url).toBe(`/penztar/siker/${orderId}`);
    expect(router.url).not.toContain('navigationReason');
  });
});

// ---------------------------------------------------------------------------
// CF-02 — guards refuse to advance past the contact step when nothing is saved
// ---------------------------------------------------------------------------

describe('CF-02 wizard refuses to advance past contact while contact is unsaved', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('the wizard refuses to advance past the contact step while the contact section is unsaved', async () => {
    await seedCartWithItem();

    const router = TestBed.inject(Router);

    // /penztar/szallitas: deliveryGuard rejects because session.contact
    // is undefined and redirects to /penztar/adatok with reason
    // 'incomplete'.
    await router.navigateByUrl('/penztar/szallitas');
    expect(router.url).toContain('/penztar/adatok');
    expect(router.url).toContain('navigationReason=incomplete');

    // /penztar/ellenorzes: reviewGuard rejects on the same missing
    // contact section and lands on /penztar/adatok too.
    await router.navigateByUrl('/penztar/ellenorzes');
    expect(router.url).toContain('/penztar/adatok');
    expect(router.url).toContain('navigationReason=incomplete');
  });
});

// ---------------------------------------------------------------------------
// CF-03 — back navigation from review to delivery keeps the saved sections
// ---------------------------------------------------------------------------

describe('CF-03 going back from review to delivery keeps the saved sections', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('going back from the review step to the delivery step keeps the saved delivery, payment and billing on the form', async () => {
    await seedCartWithItem();
    await saveContact();
    await saveDelivery();
    await savePayment();
    await saveBilling();

    const router = TestBed.inject(Router);

    // Forward to review, then back to delivery.
    await router.navigateByUrl('/penztar/ellenorzes');
    expect(router.url).toBe('/penztar/ellenorzes');
    await router.navigateByUrl('/penztar/szallitas');
    expect(router.url).toBe('/penztar/szallitas');

    // Mount the delivery page; `buildInitialModel()` reads
    // `checkout.session()` synchronously and seeds every field the
    // session already holds.
    const fixture = TestBed.createComponent(DeliveryPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const { fields } = fixture.componentInstance;
    expect(fields.deliveryOptionId().value()).toBe('home_delivery');
    expect(fields.address.countryCode().value()).toBe(VALID_DELIVERY_ADDRESS.countryCode);
    expect(fields.address.postalCode().value()).toBe(VALID_DELIVERY_ADDRESS.postalCode);
    expect(fields.address.city().value()).toBe(VALID_DELIVERY_ADDRESS.city);
    expect(fields.address.line1().value()).toBe(VALID_DELIVERY_ADDRESS.line1);
    expect(fields.paymentMethod().value()).toBe('card');
    expect(fields.billingName().value()).toBe(VALID_BILLING.name);
    expect(fields.billingAddress.countryCode().value()).toBe(VALID_DELIVERY_ADDRESS.countryCode);
    expect(fields.billingAddress.postalCode().value()).toBe(VALID_DELIVERY_ADDRESS.postalCode);
    expect(fields.billingAddress.city().value()).toBe(VALID_DELIVERY_ADDRESS.city);
    expect(fields.billingAddress.line1().value()).toBe(VALID_DELIVERY_ADDRESS.line1);
  });
});

// ---------------------------------------------------------------------------
// CF-04 — a failed save leaves the entered values untouched on the screen
// ---------------------------------------------------------------------------

describe('CF-04 a failed section save leaves the form values untouched', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('a failed section save leaves the form values on the screen untouched', async () => {
    await seedCartWithItem();
    await saveContact();

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/penztar/szallitas');
    const urlBefore = router.url;

    // Stage the 412: any PATCH on /checkout answers CART_VERSION_CONFLICT
    // so the first gated save (delivery) fails and the page sets
    // `saveFailure` without resetting `formModel` (`delivery-page.ts:161-164`).
    server.use(
      http.patch('*/api/v1/checkout', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:version-conflict',
            title: 'Cart version conflict',
            status: 412,
            code: 'CART_VERSION_CONFLICT',
            detail: 'The cart version moved under us.',
            traceId: 'spec-cf-04',
            fieldErrors: [],
          },
          { status: 412, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );

    const fixture = TestBed.createComponent(DeliveryPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const { fields } = fixture.componentInstance;
    fields.deliveryOptionId().value.set('home_delivery');
    fields.address.postalCode().value.set('9999');
    fields.address.city().value.set('Teszt City');
    fields.address.line1().value.set('Próba utca 7.');
    fields.paymentMethod().value.set('card');
    fields.billingName().value.set('Teszt Elek Billing');
    fixture.detectChanges();

    await fixture.componentInstance.onContinueRequested();

    // The page must not have navigated; the form must still hold every
    // value the shopper entered, and `saveFailure` must be armed.
    expect(router.url).toBe(urlBefore);
    expect(fields.deliveryOptionId().value()).toBe('home_delivery');
    expect(fields.address.postalCode().value()).toBe('9999');
    expect(fields.address.city().value()).toBe('Teszt City');
    expect(fields.address.line1().value()).toBe('Próba utca 7.');
    expect(fields.paymentMethod().value()).toBe('card');
    expect(fields.billingName().value()).toBe('Teszt Elek Billing');
    expect(fixture.componentInstance.saveState()).toBe('error');
    expect(fixture.componentInstance.saveFailure()).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CF-05 — a declined payment leaves the four saved sections untouched
// ---------------------------------------------------------------------------

describe('CF-05 a declined payment leaves the saved sections untouched', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('a declined payment leaves the contact, delivery, payment and billing sections on the server session untouched', async () => {
    await seedCartWithItem();
    await saveContact();
    await saveDelivery();
    await savePayment(CARD_PAYMENT);
    await saveBilling();

    const checkout = TestBed.inject(CheckoutFacade);
    const options = await checkout.ensureOptions();
    expect(options.ok).toBe(true);

    const created = await checkout.createPaymentIntent();
    if (!created.ok) throw new Error(`createPaymentIntent failed: ${created.error.code}`);
    await resolveIntentOutcome(created.value.id, 'declined');

    const sessionBefore = checkout.session();
    expect(sessionBefore?.contact).toEqual(STORED_CONTACT);
    expect(sessionBefore?.delivery).toEqual(HOME_DELIVERY);
    expect(sessionBefore?.payment).toEqual(CARD_PAYMENT);
    expect(sessionBefore?.billing).toEqual(VALID_BILLING);
    expect(sessionBefore?.complete).toBe(true);

    const submission = TestBed.inject(OrderSubmission);
    requestLog = [];
    const outcome = await submission.submitOrder();
    expect(outcome.kind).toBe('declined');
    if (outcome.kind !== 'declined') throw new Error('expected declined outcome');

    // A declined intent is refused on the client: no order POST ever leaves the app.
    expect(requestLog.filter((line) => line === 'POST /api/v1/orders')).toEqual([]);

    // The declined outcome is decided on the client (`order-submission.ts:220-222`): the
    // request log holds no order POST, and the session snapshot is the one saved before the submit.
    const sessionAfter = checkout.session();
    expect(sessionAfter?.contact).toEqual(STORED_CONTACT);
    expect(sessionAfter?.delivery).toEqual(HOME_DELIVERY);
    expect(sessionAfter?.payment).toEqual(CARD_PAYMENT);
    expect(sessionAfter?.billing).toEqual(VALID_BILLING);
    expect(sessionAfter?.complete).toBe(true);
    expect(checkout.order()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CF-06 — a reload keeps the step; the guards hydrate and the forms come back seeded
// ---------------------------------------------------------------------------

describe('CF-06 a reload keeps the step and the forms come back seeded', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('a reload keeps the step: the guards hydrate the cart and the session, and the contact and delivery forms are seeded from it', async () => {
    // ---- (a) contact saved, reload, navigate to /penztar/szallitas ----
    await seedCartWithItem();
    await saveContact();

    reloadDocument();

    const router = TestBed.inject(Router);
    await router.navigateByUrl('/penztar/szallitas');

    expect(router.url).toBe('/penztar/szallitas');
    expect(router.url).not.toContain('navigationReason');
    // The first two requests the guard issues are the hydrate pair.
    // The DeliveryPage constructor then asks for /checkout/options,
    // which is what makes the page render; the assertion is only on
    // what comes first.
    expect(requestLog.slice(0, 2)).toEqual(['GET /api/v1/cart', 'GET /api/v1/checkout']);

    // ---- (b) reload, navigate to /penztar/adatok, contact seeded ----
    reloadDocument();
    const routerAfterReload = TestBed.inject(Router);

    await routerAfterReload.navigateByUrl('/penztar/adatok');
    expect(routerAfterReload.url).toBe('/penztar/adatok');

    const contactFixture = TestBed.createComponent(ContactPage);
    await contactFixture.whenStable();
    contactFixture.detectChanges();

    const contactFields = contactFixture.componentInstance.contactFields;
    expect(contactFields.fullName().value()).toBe(STORED_CONTACT.fullName);
    expect(contactFields.email().value()).toBe(STORED_CONTACT.email);
    expect(contactFields.phone().value()).toBe(STORED_CONTACT.phone);

    // ---- (c) save delivery/payment/billing, reload, delivery seeded ----
    await saveDelivery();
    await savePayment(CARD_PAYMENT);
    await saveBilling();

    reloadDocument();
    const routerAfterReload2 = TestBed.inject(Router);

    await routerAfterReload2.navigateByUrl('/penztar/szallitas');
    expect(routerAfterReload2.url).toBe('/penztar/szallitas');

    const deliveryFixture = TestBed.createComponent(DeliveryPage);
    await deliveryFixture.whenStable();
    deliveryFixture.detectChanges();

    const { fields } = deliveryFixture.componentInstance;
    expect(fields.deliveryOptionId().value()).toBe('home_delivery');
    expect(fields.address.postalCode().value()).toBe(VALID_DELIVERY_ADDRESS.postalCode);
    expect(fields.address.city().value()).toBe(VALID_DELIVERY_ADDRESS.city);
    expect(fields.address.line1().value()).toBe(VALID_DELIVERY_ADDRESS.line1);
    expect(fields.paymentMethod().value()).toBe('card');
    expect(fields.billingName().value()).toBe(VALID_BILLING.name);
    expect(fields.billingAddress.postalCode().value()).toBe(VALID_DELIVERY_ADDRESS.postalCode);
    expect(fields.billingAddress.city().value()).toBe(VALID_DELIVERY_ADDRESS.city);
    expect(fields.billingAddress.line1().value()).toBe(VALID_DELIVERY_ADDRESS.line1);
  });
});
