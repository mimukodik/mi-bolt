/**
 * `DeliveryPage` — the container FIX-56 gave `DeliveryStep`'s options
 * fetch, its two facade saves and its navigation to (`components.md:566-576`
 * closed the gap `FIX-56` found: the component itself now knows neither
 * the SDK nor the router). This spec covers what moved here:
 *
 *   T21-AC05 (relocated) — options-load error has retry and never
 *     invents a free-shipping default; the loading skeleton renders
 *     until the options land.
 *   FIX-44 (relocated) — a failed `saveDeliverySection()` /
 *     `savePaymentMethod()` renders a visible failure banner instead of
 *     returning silently, and does not navigate.
 *
 * `Api.prototype.invoke` is spied directly rather than standing up MSW,
 * isolating the fetch from the network layer the same way
 * `checkout-f2.spec.ts` isolates the two facade saves.
 */
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Api } from '../../api/generated/api';
import { provideApiConfiguration as provideApiConfig } from '../../api/generated/api-configuration';
import * as operations from '../../api/generated/functions';
import { demoSessionInterceptor } from '../../core/api/demo-session.interceptor';

import { CartFacade } from '../cart/cart.facade';
import { CheckoutFacade } from './checkout.facade';
import { DeliveryPage } from './delivery-page';

import type { CheckoutOptions } from '../../api/generated/models/checkout-options';

const BASE_URL = 'http://localhost/api/v1';

const OPTIONS: CheckoutOptions = {
  deliveryOptions: [
    {
      id: 'home_delivery',
      label: 'Házhoz szállítás',
      fee: { amount: 1990, currency: 'HUF' },
      requiresAddress: true,
      description: 'demo',
    },
    {
      id: 'demo_pickup',
      label: 'Virtuális átvétel',
      fee: { amount: 0, currency: 'HUF' },
      requiresAddress: false,
      description: 'demo',
    },
  ],
  paymentMethods: ['demo_card', 'demo_cod'],
  termsVersion: 'demo-1',
};

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (raw instanceof HTMLElement) return raw;
  throw new Error('Expected HTMLElement');
}

function getElement(parent: Element, selector: string): HTMLElement {
  const element = parent.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new TypeError(`Expected HTMLElement matching "${selector}"`);
  }
  return element;
}

function queryElement(parent: Element, selector: string): HTMLElement | null {
  const element = parent.querySelector(selector);
  if (element === null) return null;
  if (!(element instanceof HTMLElement)) {
    throw new TypeError(`Expected HTMLElement matching "${selector}"`);
  }
  return element;
}

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

/** Seeds a cart + checkout session so `saveDeliverySection()` /
 *  `savePaymentMethod()` don't bail on the NO_CART branch. */
function pinCartAndSession(): void {
  const cartFacade = TestBed.inject(CartFacade);
  vi.spyOn(cartFacade, 'cart').mockReturnValue({
    id: 'cart-delivery-page-test',
    version: 1,
    items: [],
    itemCount: 0,
    subtotal: { amount: 0, currency: 'HUF' },
    status: 'active',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
}

// ---------------------------------------------------------------------------
// T21-AC05 (relocated) - options-load error has retry and never invents a
// free-shipping default; loading renders a skeleton until options land.
// ---------------------------------------------------------------------------
describe('T21-AC05 (relocated to DeliveryPage) options-load error has retry, no fabricated default', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('renders the loading skeleton until the options land', () => {
    vi.spyOn(Api.prototype, 'invoke').mockReturnValue(of(OPTIONS));
    const fixture = TestBed.createComponent(DeliveryPage);
    fixture.detectChanges();

    expect(fixture.componentInstance.state().kind).toBe('loading');
    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-loading-state')).not.toBeNull();
  });

  it('renders ErrorState (with retry) when the options load fails, and never picks a fallback option', async () => {
    vi.spyOn(Api.prototype, 'invoke').mockReturnValue(
      throwError(() => new Error('Service unavailable')),
    );
    const fixture = TestBed.createComponent(DeliveryPage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.state().kind).toBe('error');
    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-error-state')).not.toBeNull();
    expect(queryElement(root, 'app-delivery-step')).toBeNull();
    expect(fixture.componentInstance.readyOptions()).toBeNull();
  });

  it('retry re-issues the options fetch and reaches the ready state on success', async () => {
    // Filtered by operation: `CartFacade`'s own constructor eagerly calls
    // `ensureCart()` through the same `Api.prototype.invoke`, so a blanket
    // sequential mock would miscount. Only `getCheckoutOptions` calls are
    // scripted to fail-then-succeed; anything else (the cart creation)
    // gets an inert success so it does not throw inside the cart queue.
    let optionsCallCount = 0;
    const invokeSpy = vi.spyOn(Api.prototype, 'invoke').mockImplementation((function_: unknown) => {
      if (function_ === operations.getCheckoutOptions) {
        optionsCallCount++;
        return optionsCallCount === 1
          ? throwError(() => new Error('Service unavailable'))
          : of(OPTIONS);
      }
      return of(OPTIONS);
    });
    const fixture = TestBed.createComponent(DeliveryPage);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.state().kind).toBe('error');

    fixture.componentInstance.onRetry();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(optionsCallCount).toBe(2);
    expect(fixture.componentInstance.state().kind).toBe('ready');
    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-delivery-step')).not.toBeNull();
    invokeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// FIX-44 (relocated to DeliveryPage) - onContinueRequested surfaces a
// failed save instead of returning silently.
// ---------------------------------------------------------------------------
describe('FIX-44 (relocated to DeliveryPage) onContinueRequested surfaces a failed save', () => {
  beforeEach(() => {
    configureTestBed();
    vi.spyOn(Api.prototype, 'invoke').mockReturnValue(of(OPTIONS));
  });

  it('renders the failure banner when saveDeliverySection fails, and does not navigate', async () => {
    pinCartAndSession();
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    vi.spyOn(checkoutFacade, 'saveDeliverySection').mockResolvedValue({
      ok: false,
      error: { code: 'FAIL', status: 500, detail: 'A mentés sikertelen.', fieldErrors: [] },
    });
    const savePaymentSpy = vi.spyOn(checkoutFacade, 'savePaymentMethod');
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const fixture = TestBed.createComponent(DeliveryPage);
    await fixture.whenStable();
    fixture.detectChanges();

    await fixture.componentInstance.onContinueRequested();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const banner = getElement(root, '[data-testid="delivery-save-failure-detail"]');
    expect(banner.textContent).toContain('A mentés sikertelen.');
    expect(banner.textContent).toContain('megmaradtak');
    expect(fixture.componentInstance.saveState()).toBe('error');
    expect(savePaymentSpy).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('renders the failure banner when only savePaymentMethod fails (the second call)', async () => {
    pinCartAndSession();
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    vi.spyOn(checkoutFacade, 'saveDeliverySection').mockResolvedValue({
      ok: true,
      value: { cartId: 'x', cartVersion: 1 },
    });
    vi.spyOn(checkoutFacade, 'savePaymentMethod').mockResolvedValue({
      ok: false,
      error: {
        code: 'FAIL',
        status: 500,
        detail: 'A fizetési mód mentése sikertelen.',
        fieldErrors: [],
      },
    });
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const fixture = TestBed.createComponent(DeliveryPage);
    await fixture.whenStable();
    fixture.detectChanges();

    await fixture.componentInstance.onContinueRequested();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const banner = getElement(root, '[data-testid="delivery-save-failure-detail"]');
    expect(banner.textContent).toContain('A fizetési mód mentése sikertelen.');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('renders no failure banner and navigates when both saves succeed', async () => {
    pinCartAndSession();
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    vi.spyOn(checkoutFacade, 'saveDeliverySection').mockResolvedValue({
      ok: true,
      value: { cartId: 'x', cartVersion: 1 },
    });
    vi.spyOn(checkoutFacade, 'savePaymentMethod').mockResolvedValue({
      ok: true,
      value: { cartId: 'x', cartVersion: 1 },
    });
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(DeliveryPage);
    await fixture.whenStable();
    fixture.detectChanges();

    await fixture.componentInstance.onContinueRequested();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(queryElement(root, '[data-testid="delivery-save-failure-detail"]')).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(['/penztar/ellenorzes']);
    expect(fixture.componentInstance.saveState()).toBe('idle');
  });

  it('retryOptions from the child clears a stale save failure and re-fetches options', async () => {
    pinCartAndSession();
    const checkoutFacade = TestBed.inject(CheckoutFacade);
    vi.spyOn(checkoutFacade, 'saveDeliverySection').mockResolvedValue({
      ok: false,
      error: { code: 'FAIL', status: 500, detail: 'A mentés sikertelen.', fieldErrors: [] },
    });

    const fixture = TestBed.createComponent(DeliveryPage);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.componentInstance.onContinueRequested();
    fixture.detectChanges();
    expect(fixture.componentInstance.saveState()).toBe('error');

    fixture.componentInstance.onRetryOptions();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.saveState()).toBe('idle');
    expect(fixture.componentInstance.saveFailure()).toBeNull();
  });
});
