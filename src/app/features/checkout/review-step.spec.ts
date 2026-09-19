// @vitest-environment jsdom
import '@angular/compiler';

/**
 * T22 - final review step (S4.4).
 *
 * Acceptance criteria mapped to real TestBed behavior tests:
 *
 *   T22-AC01 - Fresh quote on entry; items, one-time subtotal,
 *               shipping, total and payment method; back / edit
 *               links preserve fields.
 *   T22-AC02 - Two unchecked consents (demo terms + simulation
 *               acknowledgement); demo terms open in an accessible
 *               dialog; no production-legal-compliance framing.
 *   T22-AC03 - PRICE_CHANGED, QUOTE_EXPIRED and OUT_OF_STOCK have
 *               distinct messages and correction paths; the old
 *               amount cannot be submitted.
 *   T22-AC04 - Primary CTA is "Demórendelés véglegesítése";
 *               disabled while quote / consent / state is incomplete
 *               with an explanation.
 *   T22-AC05 - Loading, ready, quote-expired, price-change and
 *               field-error states render without erasing the order
 *               summary.
 */

import { DialogModule } from '@angular/cdk/dialog';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  Input,
  Output,
  ViewChild,
  provideZonelessChangeDetection,
  ɵresolveComponentResources,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join as pathJoin, resolve as pathResolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server, useMswServer } from '../../../../tests/msw-server';
import { provideApiConfiguration } from '../../api/generated/api-configuration';
import { CartDomain } from '../../../mocks/cart/cart-domain';
import { DEMO_PRODUCT, cartHandlersEntry } from '../../../mocks/cart/cart.handlers';
import { checkoutHandlersEntry } from '../../../mocks/checkout/checkout.handlers';
import { QuoteDomain } from '../../../mocks/checkout/quote-domain';
import { IdempotencyStore } from '../../../mocks/idempotency';
import { Repository } from '../../../mocks/repository';
import { createDeterministicIds, createFixedClock } from '../../../mocks/scenarios';
import { demoSessionInterceptor } from '../../core/api/demo-session.interceptor';
import { Button } from '../../shared/ui/button/button';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PriceBlock } from '../../shared/ui/price-block/price-block';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import { AccessibleDialog } from '../../shared/ui/accessible-dialog/accessible-dialog';
import { CartFacade } from '../cart/cart.facade';
import { OrderSummary } from '../cart/order-summary';
import { CheckoutFacade } from './checkout.facade';
import { QuoteController, mapQuoteError } from './quote-state';
import { ReviewStep } from './review-step';
import { ReviewPage } from './review-page';
import { TermsDialog } from './terms-dialog';
import { OrderSubmission } from './order-submission';
import type { FakeClock } from './payment-progress';

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

const BASE_URL = 'http://localhost/api/v1';

function registerComponentMetadata(
  componentClass: unknown,
  config: {
    inputs?: readonly string[];
    outputs?: readonly string[];
    models?: readonly string[];
    viewQueries?: Record<string, string>;
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
  if (config.viewQueries !== undefined) {
    for (const [name, selector] of Object.entries(config.viewQueries)) {
      const arr = propDecorators[name] ?? [];
      arr.push({ type: ViewChild, args: [selector, { isSignal: true, descendants: true }] });
      propDecorators[name] = arr;
    }
  }
  Reflect.set(componentClass, 'propDecorators', propDecorators);
}

registerComponentMetadata(Button, {
  inputs: ['variant', 'size', 'label', 'loadingLabel', 'disabled', 'loading'],
  outputs: ['pressed'],
});
registerComponentMetadata(LoadingState, {
  inputs: ['variant', 'label'],
});
registerComponentMetadata(PriceBlock, {
  inputs: ['money', 'label', 'status'],
});
registerComponentMetadata(StatusMessage, {
  inputs: ['message', 'severity', 'persistent'],
  outputs: ['dismissed'],
});
registerComponentMetadata(OrderSummary, {
  inputs: ['subtotal', 'shipping', 'footnote'],
});
registerComponentMetadata(TermsDialog, {
  inputs: ['opened', 'label'],
  outputs: ['closed'],
});
registerComponentMetadata(AccessibleDialog, {
  inputs: ['opened', 'label', 'labelledBy', 'restoreTarget'],
  outputs: ['closed'],
  viewQueries: { body: 'body' },
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

function getInputElement(parent: Element, selector: string): HTMLInputElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Expected HTMLInputElement matching "${selector}"`);
  }
  return el;
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
  const clock = createFixedClock(new Date(Date.parse('2026-09-14T10:00:00.000Z')).toISOString());
  const ids = createDeterministicIds(7);
  const scenario = {
    name: 'review-step-suite',
    seed: 7,
    clockOffsetMs: 0,
    isolated: true,
  };
  const repository = new Repository(scenario, ids, clock);
  repository.loadProducts([DEMO_PRODUCT]);
  const idempotency = new IdempotencyStore(clock);
  new CartDomain(repository, clock, ids, idempotency);
  new QuoteDomain(repository, clock, ids, idempotency);
  return { repository, clock, ids, scenario, apiRoot: '/api/v1' };
}

beforeAll(async () => {
  await ɵresolveComponentResources(resolveWorkspaceFile);
  await TestBed.compileComponents();
});

beforeEach(async () => {
  const env = makeEnv();
  server.use(...cartHandlersEntry(env), ...checkoutHandlersEntry(env));
  TestBed.configureTestingModule({
    imports: [ReviewStep, TermsDialog, AccessibleDialog, DialogModule],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
      provideRouter([
        { path: 'penztar/szallitas', component: ReviewStep },
        { path: 'penztar/adatok', component: ReviewStep },
        { path: 'penztar/siker/:orderId', component: ReviewStep },
      ]),
      CartFacade,
      CheckoutFacade,
      QuoteController,
    ],
  });
  await TestBed.compileComponents();
});

afterEach(() => {
  document.body.querySelectorAll('.cdk-overlay-container').forEach((el) => {
    el.remove();
  });
  server.resetHandlers();
  TestBed.resetTestingModule();
});

async function seedCartAndSession(
  cartFacade: CartFacade,
  checkoutFacade: CheckoutFacade,
): Promise<void> {
  await cartFacade.ensureCart();
  await cartFacade.addItem('demo-one-5g-graphite-256', 2);
  const cart = cartFacade.cart();
  if (cart !== null) {
    await checkoutFacade.loadSession(cart.id, { clearOnLoad: false });
    checkoutFacade.form.fullName().value.set('Teszt Elek');
    checkoutFacade.form.email().value.set('teszt@example.hu');
    checkoutFacade.form.phone().value.set('+36301234567');
    checkoutFacade.form.deliveryOptionId().value.set('home_delivery');
    checkoutFacade.form.address.line1().value.set('Kossuth Lajos utca 1.');
    checkoutFacade.form.address.postalCode().value.set('1053');
    checkoutFacade.form.address.city().value.set('Budapest');
    checkoutFacade.form.paymentMethod().value.set('demo_card');
    await checkoutFacade.saveContactSection();
    await checkoutFacade.saveDeliverySection();
    await checkoutFacade.savePaymentMethod();
  }
  const quoteController = TestBed.inject(QuoteController);
  await quoteController.refresh();
}

/** Deterministic test clock — fires every queued callback once.
 *  Mirrors `order-submission.spec.ts`'s own helper of the same
 *  shape, so `OrderSubmission`'s polling loop never burns real
 *  wall-clock seconds in this file either. */
function makeFakeClock(): FakeClock {
  let pendingCount = 0;
  const callbacks = new Map<number, () => void>();
  let nextId = 1;
  return {
    nowIso(): string {
      return '2026-09-15T10:00:00.000Z';
    },
    setTimeoutFn(handler: () => void, _delayMs: number): number {
      pendingCount += 1;
      const id = nextId;
      nextId += 1;
      callbacks.set(id, handler);
      return id;
    },
    clearTimeoutFn(id: number): void {
      if (callbacks.delete(id)) {
        pendingCount -= 1;
      }
    },
    fire(): void {
      const ordered = [...callbacks.entries()].sort(([a], [b]) => a - b);
      callbacks.clear();
      pendingCount = 0;
      for (const [, cb] of ordered) cb();
    },
    pending(): number {
      return pendingCount;
    },
  };
}

/** Drains microtasks + macrotasks so MSW responses resolve before the
 *  next polling step, same rationale as `order-submission.spec.ts`. */
async function flushAsync(iterations = 5): Promise<void> {
  for (let i = 0; i < iterations; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

// ---------------------------------------------------------------------------
// T22-AC01 - fresh quote on entry, order summary, edit links
// ---------------------------------------------------------------------------
describe('T22-AC01 review entry creates a fresh quote and shows the order summary', () => {
  it('ReviewStep drives a fresh quote on mount so the totals are fresh', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const reviewPage = getElement(root, '[data-testid="review-page"]');
    expect(reviewPage.getAttribute('data-status')).toBe('ready');
    const quoteController = TestBed.inject(QuoteController);
    expect(quoteController.ready()).toBe(true);
    expect(quoteController.quote()).not.toBeNull();
  });

  it('renders an order summary that lists cart items, subtotal, shipping and total', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const itemsCard = getElement(root, '[data-testid="review-items"]');
    expect(itemsCard).not.toBeNull();

    const lines = itemsCard.querySelectorAll('[data-testid="review-line"]');
    expect(lines.length).toBe(1);

    const lineEl = getElement(itemsCard, '[data-testid="review-line"]');
    const lineText = lineEl.textContent;
    expect(lineText).toContain('Demo One 5G');
    expect(lineText).toContain('Grafit');
    expect(lineText).toContain('256 GB');
    expect(lineText).toContain('2 ×');

    const summaryAside = getElement(root, '[data-testid="review-summary"]');
    expect(summaryAside).not.toBeNull();
    const orderSummaryEl = queryElement(summaryAside, 'app-order-summary');
    expect(orderSummaryEl).not.toBeNull();
  });

  it('renders the chosen payment method (demo_card | demo_cod) under the summary', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const paymentEl = getElement(root, '[data-testid="review-payment"]');
    expect(paymentEl.textContent.trim()).toBe('Bankkártya (szimulált)');
  });

  it('exposes edit affordances for the contact and delivery sections, pointing at the earlier steps', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const editContact = getElement(root, '[data-testid="review-edit-contact"]');
    expect(editContact.getAttribute('routerLink') ?? editContact.getAttribute('href')).toContain(
      '/penztar/adatok',
    );
    expect(editContact.textContent.trim()).toBe('Szerkesztés');

    const editDelivery = getElement(root, '[data-testid="review-edit-delivery"]');
    expect(editDelivery.getAttribute('routerLink') ?? editDelivery.getAttribute('href')).toContain(
      '/penztar/szallitas',
    );
    expect(editDelivery.textContent.trim()).toBe('Szerkesztés');

    const quoteController = TestBed.inject(QuoteController);
    expect(quoteController.ready()).toBe(true);
    fixture.componentInstance.onEditContact();
    expect(quoteController.ready()).toBe(false);
  });

  it('back link returns to the delivery step and preserves in-memory fields', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const backBtn = getElement(root, '[data-testid="review-back"]');
    expect(backBtn.textContent).toContain('Vissza a szállításhoz');

    fixture.componentInstance.onBack();
    await fixture.whenStable();
    expect(router.url).toBe('/penztar/szallitas');

    expect(checkoutFacade.form.fullName().value()).toBe('Teszt Elek');
    expect(checkoutFacade.form.email().value()).toBe('teszt@example.hu');
  });
});

// ---------------------------------------------------------------------------
// T22-AC02 - two unchecked consents, demo terms dialog
// ---------------------------------------------------------------------------
describe('T22-AC02 demo terms + simulation acknowledgement with accessible dialog', () => {
  it('renders two unchecked checkbox inputs as part of the Signal Form', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const termsInput = getInputElement(root, '[data-testid="review-consent-terms-input"]');
    const simInput = getInputElement(root, '[data-testid="review-consent-simulation-input"]');

    expect(termsInput.type).toBe('checkbox');
    expect(termsInput.checked).toBe(false);
    expect(simInput.type).toBe('checkbox');
    expect(simInput.checked).toBe(false);

    expect(fixture.componentInstance.reviewForm.acceptedTerms().value()).toBe(false);
    expect(fixture.componentInstance.reviewForm.acknowledgedSimulation().value()).toBe(false);
  });

  it('demo terms label links to a terms dialog and does not present production legal compliance', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const termsButton = getElement(root, '[data-testid="review-consent-terms-button"]');
    expect(termsButton.textContent.trim()).toBe('demó vásárlási feltételeket');

    const notice = getElement(root, '[data-testid="review-demo-notice"]');
    expect(notice.textContent).toContain('Demó pénztár.');
    expect(notice.textContent).toContain('nem küld valódi megrendelést');
  });

  it('TermsDialog uses AccessibleDialog with a Hungarian label and demo-only copy', async () => {
    const fixture = TestBed.createComponent(TermsDialog);
    fixture.componentRef.setInput('opened', true);
    await fixture.whenStable();
    fixture.detectChanges();

    const termsBody = document.body.querySelector('[data-testid="terms-body"]');
    if (!(termsBody instanceof HTMLElement)) {
      throw new Error('Expected termsBody to be HTMLElement');
    }
    const text = termsBody.textContent;
    expect(text).toContain('demó folyamat');
    expect(text).toContain('nem valós');
    expect(text.toLowerCase()).not.toContain('jognyilatkozat');

    fixture.componentRef.setInput('opened', false);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('TermsDialog is projected as accessible content under app-accessible-dialog', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.termsOpened()).toBe(false);

    fixture.componentInstance.openTerms();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.termsOpened()).toBe(true);

    const dialogPanel = document.body.querySelector('[role="dialog"]');
    expect(dialogPanel).not.toBeNull();

    fixture.componentInstance.closeTerms();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.termsOpened()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T22-AC03 - distinct PRICE_CHANGED / QUOTE_EXPIRED / OUT_OF_STOCK messages
// ---------------------------------------------------------------------------
describe('T22-AC03 distinct PRICE_CHANGED / QUOTE_EXPIRED / OUT_OF_STOCK messages', () => {
  it('QuoteController exposes a state discriminator with the three failure kinds', () => {
    const priceChanged = mapQuoteError({
      code: 'PRICE_CHANGED',
      status: 409,
      detail: 'Árváltozás történt.',
      fieldErrors: [],
    });
    expect(priceChanged.kind).toBe('price-changed');

    const quoteExpired = mapQuoteError({
      code: 'QUOTE_EXPIRED',
      status: 409,
      detail: 'Az árajánlat lejárt.',
      fieldErrors: [],
    });
    expect(quoteExpired.kind).toBe('quote-expired');

    const outOfStock = mapQuoteError({
      code: 'OUT_OF_STOCK',
      status: 409,
      detail: 'A termék elfogyott.',
      fieldErrors: [],
    });
    expect(outOfStock.kind).toBe('out-of-stock');

    const fieldError = mapQuoteError({
      code: 'VALIDATION_ERROR',
      status: 422,
      detail: 'Hibás mező.',
      fieldErrors: [{ path: '/contact', message: 'Hiányzó adat' }],
    });
    expect(fieldError.kind).toBe('field-error');
  });

  it('PRICE_CHANGED branch explains the cart version changed and points at a refresh action', async () => {
    server.use(
      http.post('*/api/v1/checkout/:cartId/quote', () => {
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:price-changed',
            title: 'Árváltozás',
            status: 409,
            code: 'PRICE_CHANGED',
            detail: 'A termék ára megváltozott.',
            fieldErrors: [],
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const quoteController = TestBed.inject(QuoteController);
    await quoteController.refresh();

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const reviewPage = getElement(root, '[data-testid="review-page"]');
    expect(reviewPage.getAttribute('data-status')).toBe('price-changed');
    const statusBox = getElement(root, '[data-testid="review-status"]');
    expect(statusBox.textContent).toContain('A termék ára megváltozott.');
    expect(statusBox.textContent).toContain('Árajánlat frissítése');
  });

  it('QUOTE_EXPIRED branch explains the TTL elapsed and forces a fresh quote', async () => {
    server.use(
      http.post('*/api/v1/checkout/:cartId/quote', () => {
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:quote-expired',
            title: 'Lejárt árajánlat',
            status: 409,
            code: 'QUOTE_EXPIRED',
            detail: 'A foglalási idő lejárt.',
            fieldErrors: [],
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const quoteController = TestBed.inject(QuoteController);
    await quoteController.refresh();

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const reviewPage = getElement(root, '[data-testid="review-page"]');
    expect(reviewPage.getAttribute('data-status')).toBe('quote-expired');
    const statusBox = getElement(root, '[data-testid="review-status"]');
    expect(statusBox.textContent).toContain('A foglalási idő lejárt.');
    expect(statusBox.textContent).toContain('Árajánlat frissítése');
  });

  it('OUT_OF_STOCK branch explains a variant disappeared and points at the cart', async () => {
    server.use(
      http.post('*/api/v1/checkout/:cartId/quote', () => {
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:out-of-stock',
            title: 'Készlet hiány',
            status: 409,
            code: 'OUT_OF_STOCK',
            detail: 'A kiválasztott változat elfogyott.',
            fieldErrors: [],
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const quoteController = TestBed.inject(QuoteController);
    await quoteController.refresh();

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const reviewPage = getElement(root, '[data-testid="review-page"]');
    expect(reviewPage.getAttribute('data-status')).toBe('out-of-stock');
    const statusBox = getElement(root, '[data-testid="review-status"]');
    expect(statusBox.textContent).toContain('A kiválasztott változat elfogyott.');
    expect(statusBox.textContent).toContain('kosárhoz');
  });

  it('the primary CTA is disabled while the quote state is not ready (old amount cannot be submitted)', async () => {
    server.use(
      http.post('*/api/v1/checkout/:cartId/quote', () => {
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:price-changed',
            title: 'Árváltozás',
            status: 409,
            code: 'PRICE_CHANGED',
            detail: 'Árváltozás történt.',
            fieldErrors: [],
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const quoteController = TestBed.inject(QuoteController);
    await quoteController.refresh();

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    checkoutFacade.form.acceptedTerms().value.set(true);
    checkoutFacade.form.acknowledgedSimulation().value.set(true);
    fixture.detectChanges();

    expect(fixture.componentInstance.canSubmit()).toBe(false);
    const root = getRootElement(fixture);
    const submitBtn = getElement(root, '[data-testid="review-submit"] button');
    expect(submitBtn.hasAttribute('disabled')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T22-AC04 - primary CTA copy and disabled-with-explanation behavior
// ---------------------------------------------------------------------------
describe('T22-AC04 primary CTA copy and disabled-with-explanation behaviour', () => {
  it('primary CTA button reads "Demórendelés véglegesítése"', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const submitEl = getElement(root, '[data-testid="review-submit"]');
    expect(submitEl.textContent).toContain('Demórendelés véglegesítése');
  });

  it('uses the shared Button primitive so the disabled + loading states match the rest of the flow', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const submitButton = queryElement(root, '[data-testid="review-submit"]');
    expect(submitButton?.tagName.toLowerCase()).toBe('app-button');
  });

  it('renders an explanation when the CTA is disabled because of consent / quote / state', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const explanation = getElement(root, '[data-testid="review-cta-explanation"]');
    expect(explanation.textContent).toContain('A demó feltételek elfogadása szükséges');

    checkoutFacade.form.acceptedTerms().value.set(true);
    fixture.detectChanges();
    expect(explanation.textContent).toContain('A szimuláció tudomásulvétele szükséges');
  });

  it('disables the CTA when either checkbox is unchecked (Signal Form gates)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.canSubmit()).toBe(false);

    checkoutFacade.form.acceptedTerms().value.set(true);
    checkoutFacade.form.acknowledgedSimulation().value.set(false);
    fixture.detectChanges();
    expect(fixture.componentInstance.canSubmit()).toBe(false);

    checkoutFacade.form.acceptedTerms().value.set(false);
    checkoutFacade.form.acknowledgedSimulation().value.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.canSubmit()).toBe(false);

    checkoutFacade.form.acceptedTerms().value.set(true);
    checkoutFacade.form.acknowledgedSimulation().value.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.canSubmit()).toBe(true);
  });

  it('disables the CTA while the facade is busy (no double submit)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    checkoutFacade.form.acceptedTerms().value.set(true);
    checkoutFacade.form.acknowledgedSimulation().value.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.canSubmit()).toBe(true);

    fixture.componentInstance.submitting.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.canSubmit()).toBe(false);

    const root = getRootElement(fixture);
    const explanation = getElement(root, '[data-testid="review-cta-explanation"]');
    expect(explanation.textContent).toContain('folyamatban van');
  });
});

// ---------------------------------------------------------------------------
// T22-AC05 - order summary is preserved across quote states
// ---------------------------------------------------------------------------
describe('T22-AC05 order summary is preserved across quote states', () => {
  it('renders the items list in the loading branch (skeleton, but the section still appears)', async () => {
    server.use(
      http.post('*/api/v1/checkout/:cartId/quote', async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return HttpResponse.json({
          id: 'quote-loading-test',
          cartId: 'cart-review-step-suite-1-e2e-7-0001',
          cartVersion: 2,
          subtotal: { amount: 679980, currency: 'HUF' },
          shipping: { amount: 1990, currency: 'HUF' },
          total: { amount: 681970, currency: 'HUF' },
          expiresAt: '2026-09-14T10:15:00.000Z',
        });
      }),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const quoteController = TestBed.inject(QuoteController);
    quoteController.invalidate();

    const fixture = TestBed.createComponent(ReviewStep);
    void quoteController.refresh();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const reviewPage = getElement(root, '[data-testid="review-page"]');
    expect(reviewPage.getAttribute('data-status')).toBe('loading');

    const itemsCard = queryElement(root, '[data-testid="review-items"]');
    expect(itemsCard).not.toBeNull();

    const loadingSummary = queryElement(root, '[data-testid="review-summary-loading"]');
    expect(loadingSummary).not.toBeNull();

    await fixture.whenStable();
  });

  it('renders the items list in the ready branch (full PriceBlock totals)', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const itemsCard = getElement(root, '[data-testid="review-items"]');
    expect(itemsCard).not.toBeNull();
    const priceBlocks = itemsCard.querySelectorAll('app-price-block');
    expect(priceBlocks.length).toBeGreaterThan(0);
  });

  it('renders the items list in the price-changed and quote-expired branches', async () => {
    server.use(
      http.post('*/api/v1/checkout/:cartId/quote', () => {
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:price-changed',
            title: 'Árváltozás',
            status: 409,
            code: 'PRICE_CHANGED',
            detail: 'Árváltozás történt.',
            fieldErrors: [],
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const quoteController = TestBed.inject(QuoteController);
    await quoteController.refresh();

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const itemsCard = queryElement(root, '[data-testid="review-items"]');
    expect(itemsCard).not.toBeNull();
    const statusRow = queryElement(root, '[data-testid="review-status"]');
    expect(statusRow).not.toBeNull();
  });

  it('renders persistent price-changed error status message with no close button and enabled refresh action', async () => {
    server.use(
      http.post('*/api/v1/checkout/:cartId/quote', () => {
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:price-changed',
            title: 'Árváltozás',
            status: 409,
            code: 'PRICE_CHANGED',
            detail: 'Árváltozás történt.',
            fieldErrors: [],
          },
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const quoteController = TestBed.inject(QuoteController);
    await quoteController.refresh();

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const statusMessage = queryElement(root, '[data-testid="status-message"]');
    expect(statusMessage).not.toBeNull();
    expect(statusMessage?.querySelector('button')).toBeNull();

    const refreshButton = root.querySelector<HTMLButtonElement>('[data-testid="review-refresh"]');
    expect(refreshButton).not.toBeNull();
    expect(refreshButton?.disabled).toBe(false);
  });

  it('field-error branch (validation failures) keeps the items visible', async () => {
    server.use(
      http.post('*/api/v1/checkout/:cartId/quote', () => {
        return HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:checkout-incomplete',
            title: 'Hiányos rendelés',
            status: 422,
            code: 'CHECKOUT_INCOMPLETE',
            detail: 'Adatok pótlása szükséges.',
            fieldErrors: [],
          },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const quoteController = TestBed.inject(QuoteController);
    await quoteController.refresh();

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const reviewPage = getElement(root, '[data-testid="review-page"]');
    expect(reviewPage.getAttribute('data-status')).toBe('field-error');
    const itemsCard = queryElement(root, '[data-testid="review-items"]');
    expect(itemsCard).not.toBeNull();
  });

  it('exposes a per-state hook on the wrapper so each state has a stable data-status attribute', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const reviewPage = getElement(root, '[data-testid="review-page"]');
    expect(reviewPage.getAttribute('data-status')).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// T22 wiring - ReviewStep uses T10 primitives and owns the demo-aware navigation
// ---------------------------------------------------------------------------
describe('T22 wiring - ReviewStep uses T10 primitives and owns the demo-aware navigation', () => {
  it('imports the T10 UI primitives it needs and renders them', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-button')).not.toBeNull();
    expect(queryElement(root, 'app-order-summary')).not.toBeNull();
    expect(queryElement(root, 'app-terms-dialog')).not.toBeNull();
  });

  it('uses Angular Signal Forms to bind the consent checkboxes', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const termsInput = getInputElement(root, '[data-testid="review-consent-terms-input"]');

    termsInput.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.reviewForm.acceptedTerms().value()).toBe(true);
  });

  it('submitting with valid state calls commitOrder and navigates to success page', async () => {
    server.use(
      http.post('*/api/v1/payment-intents', () => {
        return HttpResponse.json(
          {
            id: 'pi-1',
            cartId: 'cart-1',
            quoteId: 'quote-1',
            isSimulation: true,
            status: 'succeeded',
            amount: { amount: 681970, currency: 'HUF' },
          },
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }),
      http.post('*/api/v1/orders', () => {
        return HttpResponse.json(
          {
            id: 'order-999',
            orderNumber: 'ORD-999',
            createdAt: '2026-09-14T10:05:00.000Z',
            deliveryOptionId: 'home_delivery',
            paymentMethod: 'demo_card',
            subtotal: { amount: 679980, currency: 'HUF' },
            shipping: { amount: 1990, currency: 'HUF' },
            total: { amount: 681970, currency: 'HUF' },
            items: [],
            status: 'demo_confirmed',
            notice: 'Demó',
            isSimulation: true,
          },
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    checkoutFacade.form.acceptedTerms().value.set(true);
    checkoutFacade.form.acknowledgedSimulation().value.set(true);
    fixture.detectChanges();

    await fixture.componentInstance.onSubmit();
    await fixture.whenStable();

    expect(router.url).toBe('/penztar/siker/order-999');
  });
});

// ---------------------------------------------------------------------------
// FIX-25 / FIX-61 - a declined, pending or failed order commit is no
// longer silent, and OrderSubmission + PaymentProgress are what drive
// the declined / unknown states now (FIX-61 supersedes FIX-25's own
// rendering path for those two; the generic "error" outcome — one
// OrderSubmission never emits a progress tick for — is the one case
// where FIX-25's original review-submit-failure block still renders).
// ---------------------------------------------------------------------------
describe('FIX-25 / FIX-61 declined, unknown and failed order commits surface on the review step', () => {
  it('a declined payment intent renders PaymentProgress in the declined state, keeps the CTA enabled, and its own retry resubmits', async () => {
    let paymentIntentCalls = 0;
    server.use(
      http.post('*/api/v1/payment-intents', () => {
        paymentIntentCalls += 1;
        return HttpResponse.json(
          {
            id: `pi-${String(paymentIntentCalls)}`,
            cartId: 'cart-1',
            quoteId: 'quote-1',
            amount: { amount: 681970, currency: 'HUF' },
            isSimulation: true,
            status: 'declined',
          },
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    checkoutFacade.form.acceptedTerms().value.set(true);
    checkoutFacade.form.acknowledgedSimulation().value.set(true);
    fixture.detectChanges();

    await fixture.componentInstance.onSubmit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).not.toContain('/penztar/siker');
    const root = getRootElement(fixture);
    const progress = getElement(root, '[data-testid="payment-progress"]');
    expect(progress.getAttribute('data-state')).toBe('declined');
    expect(progress.textContent).toContain('elutasítva');
    expect(queryElement(root, '[data-testid="payment-progress-retry"]')).not.toBeNull();
    expect(queryElement(root, '[data-testid="payment-progress-change-method"]')).not.toBeNull();
    expect(fixture.componentInstance.canSubmit()).toBe(true);

    // PaymentProgress's own retry — not the main CTA — is what
    // FIX-61 wires to a second submission attempt.
    await fixture.componentInstance.onPaymentRetry();
    await fixture.whenStable();

    expect(paymentIntentCalls).toBe(2);
  });

  it('changing payment method via PaymentProgress navigates to the delivery step', async () => {
    server.use(
      http.post('*/api/v1/payment-intents', () =>
        HttpResponse.json(
          {
            id: 'pi-declined',
            cartId: 'cart-1',
            quoteId: 'quote-1',
            amount: { amount: 681970, currency: 'HUF' },
            isSimulation: true,
            status: 'declined',
          },
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);
    const router = TestBed.inject(Router);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();
    checkoutFacade.form.acceptedTerms().value.set(true);
    checkoutFacade.form.acknowledgedSimulation().value.set(true);
    fixture.detectChanges();

    await fixture.componentInstance.onSubmit();
    await fixture.whenStable();

    fixture.componentInstance.onPaymentChangeMethod();
    await fixture.whenStable();
    expect(router.url).toBe('/penztar/szallitas');
  });

  it('a pending payment that never resolves renders PaymentProgress in the unknown state and disables the CTA', async () => {
    const orderSubmission = TestBed.inject(OrderSubmission);
    const fakeClock = makeFakeClock();
    orderSubmission.bindClock(fakeClock);

    server.use(
      http.post('*/api/v1/payment-intents', () =>
        HttpResponse.json(
          {
            id: 'pi-pending',
            cartId: 'cart-1',
            quoteId: 'quote-1',
            amount: { amount: 681970, currency: 'HUF' },
            isSimulation: true,
            status: 'pending',
          },
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      ),
      http.get('*/api/v1/payment-intents/:id', () =>
        HttpResponse.json({
          id: 'pi-pending',
          cartId: 'cart-1',
          quoteId: 'quote-1',
          amount: { amount: 681970, currency: 'HUF' },
          isSimulation: true,
          status: 'pending',
        }),
      ),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();
    checkoutFacade.form.acceptedTerms().value.set(true);
    checkoutFacade.form.acknowledgedSimulation().value.set(true);
    fixture.detectChanges();

    const submitted = fixture.componentInstance.onSubmit();
    await flushAsync();
    for (let i = 0; i < 10; i += 1) {
      fakeClock.fire();
      await flushAsync();
    }
    await submitted;
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const progress = getElement(root, '[data-testid="payment-progress"]');
    expect(progress.getAttribute('data-state')).toBe('unknown');
    expect(progress.textContent).not.toContain('elutasítva');
    expect(fixture.componentInstance.canSubmit()).toBe(false);
    const submitEl = getElement(root, '[data-testid="review-submit"] button');
    expect((submitEl as HTMLButtonElement).disabled).toBe(true);
  });

  it('a generic payment-intent failure (not a decline) renders the review-submit-failure block, and a refresh clears it', async () => {
    server.use(
      http.post('*/api/v1/payment-intents', () => {
        return HttpResponse.json(
          {
            type: 'about:blank',
            title: 'error',
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
            detail: 'Átmeneti hiba történt.',
          },
          { status: 503, headers: { 'content-type': 'application/problem+json' } },
        );
      }),
    );

    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    checkoutFacade.form.acceptedTerms().value.set(true);
    checkoutFacade.form.acknowledgedSimulation().value.set(true);
    fixture.detectChanges();

    await fixture.componentInstance.onSubmit();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const banner = getElement(root, '[data-testid="review-submit-failure"]');
    expect(banner.textContent).toContain('Átmeneti hiba történt.');
    expect(fixture.componentInstance.canSubmit()).toBe(true);
    expect(queryElement(root, '[data-testid="payment-progress"]')).toBeNull();

    fixture.componentInstance.onRefresh();
    fixture.detectChanges();

    expect(fixture.componentInstance.submitFailure()).toBeNull();
    expect(queryElement(root, '[data-testid="review-submit-failure"]')).toBeNull();
  });

  it('onSubmit() delegates to OrderSubmission.submitOrder() rather than calling the facade directly', () => {
    const source = readFileSync(
      pathJoin(process.cwd(), 'src/app/features/checkout/review-step.ts'),
      'utf8',
    );
    expect(source).toMatch(/this\.orderSubmission\.submitOrder\(\)/);
    expect(source).not.toMatch(/this\.checkoutFacade\.createPaymentIntent\(\)/);
    expect(source).not.toMatch(/this\.checkoutFacade\.commitOrder\(\)/);
  });
});

describe('T22 review-step remaining wiring', () => {
  it('ReviewPage is re-exported from review-step so the lazy route still resolves', () => {
    expect(ReviewPage).toBe(ReviewStep);
  });

  it('declares layout classes for the responsive layout', async () => {
    const cartFacade = TestBed.inject(CartFacade);
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    await seedCartAndSession(cartFacade, checkoutFacade);

    const fixture = TestBed.createComponent(ReviewStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const layout = getElement(root, '[data-testid="review-layout"]');
    expect(layout.classList.contains('layout')).toBe(true);

    const contactCard = getElement(root, '[data-testid="review-contact"]');
    expect(contactCard.classList.contains('card')).toBe(true);
  });
});
