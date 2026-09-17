/**
 * F6 regression pin: `DeliveryStep`'s selection-changed effect does
 * NOT loop forever in Angular v22 when both reading and writing the
 * internal `interactionCounter` signal.
 *
 * Background (Angular v22):
 *   - `effect()` no longer requires `{ allowSignalWrites: true }`
 *     (the option is deprecated; writes are always permitted). See
 *     https://angular.dev/api/core/CreateEffectOptions.
 *   - `untracked()` only suppresses READ-tracking — a write inside
 *     `untracked()` still notifies dependents. See
 *     https://angular.dev/api/core/untracked.
 *   - The docs' canonical pattern for breaking a read/write loop on
 *     the same signal inside one effect is to put the READ inside
 *     `untracked()` so the effect never becomes a dependent.
 *
 * Before the fix, the F6 wrap only isolated the counter WRITE inside
 * `untracked`. The READ at the `if (this.interactionCounter() > 0)`
 * check was still tracked, so every counter write marked the effect
 * dirty and `EffectScheduler.flush()` re-ran the effect — confirmed
 * by a controlled microbench that capped at 51 runs in 50 ms. The
 * production test surfaces for `DeliveryStep` (F1/F2 and the source-
 * pattern suite) did not catch this because they do not await the
 * microtask boundary where the loop manifests.
 *
 * This spec creates the step, drives the same signal mutations a
 * user would (option, payment, address), then waits long enough for
 * the effect scheduler to flush. If the read is ever re-tracked,
 * `interactionCounter` grows without bound and this test fails.
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
} from 'vitest';

import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { provideApiConfiguration } from '../../../app/api/generated/api-configuration';
import { demoSessionInterceptor } from '../../../app/core/api/demo-session.interceptor';

import { CheckoutFacade } from '../../../app/features/checkout/checkout.facade';
import { DeliveryStep } from '../../../app/features/checkout/delivery-step';

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

describe('F6 — DeliveryStep effect does not loop on internal counter', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('interactionCounter stays bounded after a flurry of signal writes', async () => {
    // Pin a ready state so the effect's `selectionChanged.set` branch
    // fires once per change — mirroring the realistic F2 path.
    TestBed.inject(CheckoutFacade);

    const step = TestBed.runInInjectionContext(() => new DeliveryStep());

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

    // Drive the exact signal mix a real user would: option, address,
    // payment. Each write would, in the broken version, re-trigger the
    // effect and let the counter-write loop compound.
    step['selectedOptionId'].set('home_delivery');
    step['postalCode'].set('1111');
    step['city'].set('Budapest');
    step['line1'].set('Példa utca 1.');
    step['line2'].set('');
    step['addressSubmitted'].set(true);
    step['paymentMethod'].set('demo_cod');

    // Wait long enough for any microtask-pumped loop to surface.
    // 50 ms is enough for hundreds of synchronous effect re-runs on
    // a hot path; if the loop is back, the counter will be in the
    // hundreds or thousands.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const counter = step['interactionCounter']();
    // The bound is generous on purpose: each user-visible mutation
    // bumps the counter by exactly one in the fixed version, so a
    // realistic run ends well under 20 even with one initial pass.
    // A loopping effect would land in the hundreds inside the same
    // 50 ms window.
    expect(counter).toBeLessThan(50);
  });
});
