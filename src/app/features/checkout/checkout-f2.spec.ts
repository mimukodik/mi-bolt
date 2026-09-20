/**
 * F2 regression pin: on `(continueRequested)`, `DeliveryPage` calls
 * `saveDeliverySection()` and `savePaymentMethod()` in order, then
 * navigates to `/penztar/ellenorzes`. Without that call the wizard
 * dead-ends on the delivery step (the selection never reaches the
 * session, the user can never reach /penztar/ellenorzes).
 *
 * FIX-56 moved this responsibility out of `DeliveryStep.onConfirm()`
 * (which now only emits `continueRequested`) and into `DeliveryPage`,
 * the owning container — this pin moves with it.
 */
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { provideApiConfiguration } from '../../api/generated/api-configuration';
import { demoSessionInterceptor } from '../../core/api/demo-session.interceptor';

import { CartFacade } from '../cart/cart.facade';
import { CheckoutFacade } from './checkout.facade';
import { DeliveryPage } from './delivery-page';

const BASE_URL = 'http://localhost/api/v1';

afterEach(() => {
  TestBed.resetTestingModule();
});

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

describe('F2 — DeliveryPage.onContinueRequested persists the selection and navigates', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('calls saveDeliverySection + savePaymentMethod and navigates to /penztar/ellenorzes', async () => {
    const navigated: string[] = [];
    const routerStub = {
      navigate: (commands: readonly unknown[]) => {
        const flat = commands.flatMap((c) =>
          typeof c === 'string'
            ? [c]
            : Array.isArray(c)
              ? (c as readonly unknown[]).map(String)
              : [String(c)],
        );
        navigated.push('/' + flat.join('/'));
        return Promise.resolve(true);
      },
    };

    // Override Router BEFORE any inject() calls.
    TestBed.overrideProvider(Router, { useValue: routerStub });

    const checkout = TestBed.inject(CheckoutFacade);
    const session = {
      cartId: 'cart-f2-test',
      cartVersion: 1,
      contact: { fullName: 'X', email: 'x@example.test', phone: '+36201234567' },
    };
    const saveDeliverySpy = vi
      .spyOn(checkout, 'saveDeliverySection')
      .mockResolvedValue({ ok: true, value: session });
    const savePaymentSpy = vi
      .spyOn(checkout, 'savePaymentMethod')
      .mockResolvedValue({ ok: true, value: session });

    // Pin the cart + cartId so `saveDeliverySection()` /
    // `savePaymentMethod()` don't bail on the NO_CART branch.
    const cartFacade = TestBed.inject(CartFacade);
    vi.spyOn(cartFacade, 'cart').mockReturnValue({
      id: 'cart-f2-test',
      version: 1,
      items: [],
      itemCount: 0,
      subtotal: { amount: 0, currency: 'HUF' },
      status: 'active',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const page = TestBed.runInInjectionContext(() => new DeliveryPage());

    await page.onContinueRequested();

    expect(saveDeliverySpy).toHaveBeenCalledTimes(1);
    expect(savePaymentSpy).toHaveBeenCalledTimes(1);
    expect(navigated.length).toBe(1);
    expect(navigated[0]).toMatch(/\/penztar\/ellenorzes$/);
    expect(page.saveState()).toBe('idle');
    expect(page.saveFailure()).toBeNull();
  });
});
