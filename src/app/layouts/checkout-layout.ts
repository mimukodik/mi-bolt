import { Component, computed, input } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AppShell } from '../shared/shell/app-shell';

/**
 * `CheckoutLayout` is the shell for the purchase-flow routes
 * (S4.1–S4.5): Cart, Contact, Delivery, Review and Success.
 *
 * Differences from the marketing / shop shells:
 * - Compact dark header with brand left, "Demó pénztár" label center
 *   and a single "Vissza a shopba" link on the right. No search bar.
 * - A four-step numbered indicator (Kosár / Adatok / Szállítás /
 *   Ellenőrzés) sits below the header so the user always knows
 *   which step they are on.
 * - The standard footer is suppressed — the demo terms dialog inside
 *   the review step carries the legal copy.
 *
 * `step` (`docs/spec/components.md:60`) is a required signal input:
 * each of the five step routes in `checkout.routes.ts` resolves this
 * component as its own `component` entry with `data: { step }` on
 * that same route, which `withComponentInputBinding()` can bind
 * because the input and the data live on the same route. The lazy
 * step page does NOT render an H1 of its own at this level: the H1
 * lives in each step page.
 */
export type CheckoutStep = 'cart' | 'contact' | 'delivery' | 'review' | 'success';

@Component({
  selector: 'app-checkout-layout',
  imports: [AppShell, RouterOutlet],
  templateUrl: './checkout-layout.html',
  styleUrl: './checkout-layout.scss',
})
export class CheckoutLayout {
  /** Active step in the flow, declared on the route itself (see above). */
  readonly step = input.required<CheckoutStep>();

  /** Ordered step labels for the indicator. */
  readonly steps: readonly { key: CheckoutStep; label: string }[] = [
    { key: 'cart', label: 'Kosár' },
    { key: 'contact', label: 'Adatok' },
    { key: 'delivery', label: 'Szállítás' },
    { key: 'review', label: 'Ellenőrzés' },
  ];

  /**
   * Index of the active step inside `steps`. `'success'` is not one
   * of the four entries, so `findIndex` yields `-1` for it — treated
   * as "every step is behind us" by `isStepComplete` below, which is
   * what the success page's step indicator shows (FIX-35).
   */
  private readonly currentIndex = computed<number>(() =>
    this.steps.findIndex((item) => item.key === this.step()),
  );

  /** True when the step at `index` is behind the active one. */
  isStepComplete(index: number): boolean {
    const current = this.currentIndex();
    if (current === -1) return true;
    return index < current;
  }
}
