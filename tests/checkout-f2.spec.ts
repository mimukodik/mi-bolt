/**
 * F2 regression pin: `DeliveryStep.onConfirm()` writes the user's
 * selection to the `CheckoutFacade` form model, calls
 * `saveDeliverySection()` and `savePaymentMethod()` in order, then
 * navigates to `/penztar/ellenorzes`. Without the in-method router
 * call the wizard dead-ends on the delivery step (selection never
 * reaches the session, the user can never reach /penztar/ellenorzes).
 */
import '@angular/compiler';
// @vitest-environment jsdom
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { Router } from '@angular/router';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { provideApiConfiguration } from '../src/app/api/generated/api-configuration';
import { demoSessionInterceptor } from '../src/app/core/api/demo-session.interceptor';

import { CartFacade } from '../src/app/features/cart/cart.facade';
import { CheckoutFacade } from '../src/app/features/checkout/checkout.facade';
import { DeliveryStep } from '../src/app/features/checkout/delivery-step';

const BASE_URL = 'http://localhost/api/v1';

beforeAll(() => {
  TestBed.initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting(),
    { teardown: { destroyAfterEach: true } },
  );
});

afterEach(() => {
  TestBed.resetTestingModule();
});

function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withFetch(), withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
      provideRouter([]),
    ],
    teardown: { destroyAfterEach: true },
  });
}

describe('F2 — DeliveryStep.onConfirm persists selection and navigates', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('calls saveDeliverySection + savePaymentMethod and navigates to /penztar/ellenorzes', async () => {
    const navigated: string[] = [];
    const routerStub = {
      navigate: (commands: readonly unknown[]) => {
        const flat = (commands as readonly unknown[]).flatMap((c) =>
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
        provider: 'mi-bolt',
        status: 'active',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });

      const step = TestBed.runInInjectionContext(() => new DeliveryStep());

      // Drive state into a canConfirm()=true configuration.
      step['confirmPending'].set(false);
      step['selectedOptionId'].set('home_delivery');
      step['postalCode'].set('1111');
      step['city'].set('Budapest');
      step['line1'].set('Példa utca 1.');
      step['line2'].set('');
      step['addressSubmitted'].set(true);
      step['paymentMethod'].set('demo_cod');
      step['state'].set({
        kind: 'ready',
        options: {
          deliveryOptions: [
            {
              id: 'home_delivery',
              label: 'Házhoz szállítás',
              fee: { amount: 1990, currency: 'HUF' as const },
              requiresAddress: true,
              description: 'demo',
            },
          ],
          paymentMethods: ['demo_card', 'demo_cod'],
          termsVersion: 'demo-1',
        },
      });

      await step.onConfirm();

      expect(saveDeliverySpy).toHaveBeenCalledTimes(1);
      expect(savePaymentSpy).toHaveBeenCalledTimes(1);
      expect(navigated.length).toBe(1);
      expect(navigated[0]).toMatch(/\/penztar\/ellenorzes$/);
  });
});
