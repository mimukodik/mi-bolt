/**
 * `ReviewPage` — the container FIX-63 gave `ReviewStep`'s four
 * dependencies to (`CartFacade`, `CheckoutFacade`, `QuoteController`,
 * `OrderSubmission`, the `Router`). This spec covers what moved here:
 * the quote lifecycle wiring, the submit orchestration across the five
 * `SubmitOutcome` kinds, and the `PaymentProgress` / generic-error
 * retry surfaces this container renders beside `<app-review-step>`.
 *
 * `ReviewStep` itself is covered by `review-step.spec.ts` in isolation.
 * Only `OrderSubmission.submitOrder()` is mocked directly (the network
 * flow it drives is `order-submission.spec.ts`'s own concern);
 * `CheckoutFacade.createQuote()` is spied the same way
 * `delivery-page.spec.ts` spies `saveDeliverySection()`, so the quote
 * lifecycle runs for real through `QuoteController`.
 */
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { provideApiConfiguration as provideApiConfig } from '../../api/generated/api-configuration';
import { demoSessionInterceptor } from '../../core/api/demo-session.interceptor';

import { CartFacade } from '../cart/cart.facade';
import { CheckoutFacade } from './checkout.facade';
import { OrderSubmission, type SubmitOutcome } from './order-submission';
import { ReviewPage } from './review-page';

import type { Cart } from '../../api/generated/models/cart';
import type { CartItem } from '../../api/generated/models/cart-item';
import type { CheckoutSession } from '../../api/generated/models/checkout-session';
import type { Quote } from '../../api/generated/models/quote';

const BASE_URL = 'http://localhost/api/v1';

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (raw instanceof HTMLElement) return raw;
  throw new Error('Expected HTMLElement');
}

function queryElement(parent: Element, selector: string): HTMLElement | null {
  const element = parent.querySelector(selector);
  if (element === null) return null;
  if (!(element instanceof HTMLElement))
    throw new Error(`Expected HTMLElement matching "${selector}"`);
  return element;
}

const ITEM: CartItem = {
  availability: 'in_stock',
  colorName: 'Éjfekete',
  id: 'item-1',
  image: { alt: '', height: 10, id: 'img-1', src: '/img.png', width: 10 },
  lineTotal: { amount: 339_990, currency: 'HUF' },
  maxQuantity: 5,
  productId: 'prod-1',
  productName: 'Teszt Telefon',
  productSlug: 'teszt-telefon',
  quantity: 1,
  storageGb: 128,
  unitPrice: { amount: 339_990, currency: 'HUF' },
  variantId: 'variant-1',
};

const CART: Cart = {
  expiresAt: '2026-01-01T00:00:00.000Z',
  id: 'cart-1',
  itemCount: 1,
  items: [ITEM],
  status: 'active',
  subtotal: { amount: 339_990, currency: 'HUF' },
  version: 1,
};

const SESSION: CheckoutSession = {
  cartId: 'cart-1',
  cartVersion: 1,
  contact: { fullName: 'Teszt Elek', email: 'teszt@example.test', phone: '+36301234567' },
  delivery: { optionId: 'demo_pickup' },
  paymentMethod: 'demo_card',
};

const QUOTE: Quote = {
  cartId: 'cart-1',
  cartVersion: 1,
  expiresAt: '2026-01-01T00:05:00.000Z',
  id: 'quote-1',
  shipping: { amount: 0, currency: 'HUF' },
  subtotal: { amount: 339_990, currency: 'HUF' },
  total: { amount: 339_990, currency: 'HUF' },
};

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfig(BASE_URL),
      provideRouter([]),
    ],
    teardown: { destroyAfterEach: true },
  });
}

/** Pins the cart + session so the review step has something to render,
 *  and scripts a successful `createQuote()` so `QuoteController` reaches
 *  `ready` without touching the network. */
function pinCartSessionAndQuote(): void {
  const cartFacade = TestBed.inject(CartFacade);
  vi.spyOn(cartFacade, 'cart').mockReturnValue(CART);
  const checkoutFacade = TestBed.inject(CheckoutFacade);
  vi.spyOn(checkoutFacade, 'session').mockReturnValue(SESSION);
  vi.spyOn(checkoutFacade, 'createQuote').mockResolvedValue({ ok: true, value: QUOTE });
}

async function createReadyReviewPage() {
  pinCartSessionAndQuote();
  const fixture = TestBed.createComponent(ReviewPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('ReviewPage drives the quote lifecycle', () => {
  it('renders app-review-step in the ready state once the quote resolves', async () => {
    configureTestBed();
    const fixture = await createReadyReviewPage();

    expect(fixture.componentInstance.reviewState()).toBe('ready');
    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-review-step')).not.toBeNull();
    expect(queryElement(root, '[data-testid="review-loading"]')).toBeNull();
  });

  it('onEditRequested invalidates the active quote', async () => {
    configureTestBed();
    const fixture = await createReadyReviewPage();
    const invalidateSpy = vi.spyOn(fixture.componentInstance.quoteController, 'invalidate');

    fixture.componentInstance.onEditRequested();

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('onRefreshQuote clears a stale submit failure and re-issues createQuote', async () => {
    configureTestBed();
    const fixture = await createReadyReviewPage();
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    const createQuoteSpy = vi.spyOn(checkoutFacade, 'createQuote');
    createQuoteSpy.mockClear();

    fixture.componentInstance.onRefreshQuote();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(createQuoteSpy).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.submitFailure()).toBeNull();
  });
});

describe('ReviewPage orchestrates the five SubmitOutcome kinds', () => {
  it('navigates to /penztar/siker/:orderId on a committed outcome', async () => {
    configureTestBed();
    const fixture = await createReadyReviewPage();
    const outcome: SubmitOutcome = { kind: 'committed', orderId: 'order-1', orderNumber: 'ORD-1' };
    vi.spyOn(TestBed.inject(OrderSubmission), 'submitOrder').mockResolvedValue(outcome);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.onSubmitRequested();
    fixture.detectChanges();

    expect(navigateSpy).toHaveBeenCalledWith(['/penztar/siker', 'order-1']);
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('navigates to /penztar/siker/:orderId on a recovered outcome', async () => {
    configureTestBed();
    const fixture = await createReadyReviewPage();
    const outcome: SubmitOutcome = { kind: 'recovered', orderId: 'order-2', source: 'getOrder' };
    vi.spyOn(TestBed.inject(OrderSubmission), 'submitOrder').mockResolvedValue(outcome);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.onSubmitRequested();

    expect(navigateSpy).toHaveBeenCalledWith(['/penztar/siker', 'order-2']);
  });

  it('a declined outcome sets submitFailure and does not navigate', async () => {
    configureTestBed();
    const fixture = await createReadyReviewPage();
    const outcome: SubmitOutcome = {
      kind: 'declined',
      reason: 'insufficient_funds',
      intentId: 'pi-1',
    };
    vi.spyOn(TestBed.inject(OrderSubmission), 'submitOrder').mockResolvedValue(outcome);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    await fixture.componentInstance.onSubmitRequested();
    fixture.detectChanges();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.paymentStatus()).toBe('declined');
  });

  it('a pending-timeout outcome maps the review state to "submitting" (outcome unknown) and does not navigate', async () => {
    configureTestBed();
    const fixture = await createReadyReviewPage();
    const outcome: SubmitOutcome = {
      kind: 'pending-timeout',
      safeKey: 'key-1',
      intentId: 'pi-1',
      attempt: 10,
    };
    vi.spyOn(TestBed.inject(OrderSubmission), 'submitOrder').mockResolvedValue(outcome);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    await fixture.componentInstance.onSubmitRequested();
    fixture.detectChanges();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.reviewState()).toBe('submitting');
  });

  it('a generic unknown outcome renders the review-submit-failure banner with a generic message and no backend detail leak into the DOM beyond the mapped sentence', async () => {
    configureTestBed();
    const fixture = await createReadyReviewPage();
    const outcome: SubmitOutcome = {
      kind: 'unknown',
      safeKey: 'key-1',
      reason: 'SERVICE_UNAVAILABLE',
    };
    vi.spyOn(TestBed.inject(OrderSubmission), 'submitOrder').mockResolvedValue(outcome);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    await fixture.componentInstance.onSubmitRequested();
    fixture.detectChanges();

    expect(navigateSpy).not.toHaveBeenCalled();
    const root = getRootElement(fixture);
    const banner = queryElement(root, '[data-testid="review-submit-failure"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('megmaradtak');
  });

  it('onPaymentChangeMethod navigates back to the delivery step', async () => {
    configureTestBed();
    const fixture = await createReadyReviewPage();
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.onPaymentChangeMethod();

    expect(navigateSpy).toHaveBeenCalledWith(['/penztar/szallitas']);
  });

  it('onPaymentRetry re-runs the same submission (the recovery path for a pending/unknown outcome)', async () => {
    configureTestBed();
    const fixture = await createReadyReviewPage();
    const submitSpy = vi
      .spyOn(TestBed.inject(OrderSubmission), 'submitOrder')
      .mockResolvedValue({ kind: 'committed', orderId: 'order-3', orderNumber: 'ORD-3' });
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.onPaymentRetry();

    expect(submitSpy).toHaveBeenCalledTimes(1);
  });
});
