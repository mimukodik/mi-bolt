/**
 * F6 (superseded by FIX-56): this file originally pinned a regression
 * where `DeliveryStep`'s selection-changed `effect()` looped forever in
 * Angular v22 by reading and writing its own `interactionCounter` signal
 * inside the same effect. FIX-56 deleted that effect along with the
 * `selectionChanged` output it fed — the component `DeliveryStep`
 * replaced it with has no output for it to write into and no local
 * "quote/intent must be invalidated" concern of its own left to drive one
 * (`components.md:566-576` gives it none), so the read/write-same-signal
 * shape this pin exists for no longer occurs anywhere in the file.
 *
 * What still needs a regression pin post-FIX-56 is the *new* mechanism
 * this task introduced in its place: `postalCode`/`city`/`line1`/`line2`
 * are now `computed()` signals reading through the `fields()` input
 * (the Signal Forms field tree), and `setPostalCode()` etc. write back
 * into that same tree. A `computed()` that reads a signal sourced from an
 * `input()` and is written back to via a *different* method (never
 * assigning to itself) cannot loop the way the old effect did, but a
 * rapid sequence of writes driven by real user typing exercises the same
 * "many signal writes in a short window" shape the original F6 defect
 * was found under — this test pins that the new mechanism stays stable
 * and converges to the last value written, with no stale reads.
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { buildCheckoutForm, createInitialCheckoutFormModel } from './checkout-form.model';
import { DeliveryStep } from './delivery-step';

import type { CheckoutOptions } from '../../api/generated/models/checkout-options';

const OPTIONS: CheckoutOptions = {
  deliveryOptions: [
    {
      id: 'home_delivery',
      label: 'Házhoz szállítás',
      fee: { amount: 1990, currency: 'HUF' },
      requiresAddress: true,
      description: 'demo',
    },
  ],
  paymentMethods: ['demo_card', 'demo_cod'],
  termsVersion: 'demo-1',
};

describe('F6 (superseded) — DeliveryStep address accessors stay stable under rapid writes', () => {
  it('setPostalCode/setCity/setLine1/setLine2 converge to the last value with no stale reads', () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(DeliveryStep);
    const fields = TestBed.runInInjectionContext(() =>
      buildCheckoutForm(signal(createInitialCheckoutFormModel())),
    );
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('fields', fields);
    fixture.detectChanges();

    const step = fixture.componentInstance;

    // Drive a flurry of writes the way real typing would, well beyond
    // what a single keystroke produces.
    for (let i = 0; i < 50; i++) {
      const n = String(i);
      step.setPostalCode(`10${n}`);
      step.setCity(`Város${n}`);
      step.setLine1(`Utca ${n}.`);
      step.setLine2(i % 2 === 0 ? `Emelet ${n}` : '');
    }
    fixture.detectChanges();

    expect(step.postalCode()).toBe('1049');
    expect(step.city()).toBe('Város49');
    expect(step.line1()).toBe('Utca 49.');
    expect(step.line2()).toBe('');
    // The writes landed on the same shared field tree the container
    // reads from — not on a local copy that could drift.
    expect(fields.address.postalCode().value()).toBe('1049');
  });
});
