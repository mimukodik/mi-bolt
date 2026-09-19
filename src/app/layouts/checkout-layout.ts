import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';

import { AppShell } from '../shared/shell/app-shell';
import { RouteFocusService } from '../core/navigation/route-focus';

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
 * The current step is derived from the URL through the route data set
 * by `app.routes.ts`. The lazy step page does NOT render an H1 of its
 * own at this level: the H1 lives in each step page.
 */
export type CheckoutStep = 'cart' | 'contact' | 'delivery' | 'review' | 'success';

@Component({
  selector: 'app-checkout-layout',
  imports: [AppShell, RouterOutlet],
  templateUrl: './checkout-layout.html',
  styleUrl: './checkout-layout.scss',
})
export class CheckoutLayout {
  private readonly routeFocus = inject(RouteFocusService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * URL signal — `Router.url` is a plain getter, not a signal, so the
   * indicator must subscribe to navigation events explicitly to stay
   * in sync as the user moves between cart / contact / delivery /
   * review / success without remounting the layout.
   */
  private readonly urlSignal = signal<string>(this.router.url);

  /**
   * Active step in the flow. Derived from the current URL rather than
   * a `data` input: the `data: { step }` is attached to each child
   * route, but withComponentInputBinding() cannot reach the parent
   * component from child routes, and the key name would not match the
   * `currentStep` input. Walking the URL is robust to both.
   */
  readonly currentStep = computed<CheckoutStep>(() => {
    const url = this.urlSignal();
    if (url.includes('/penztar/adatok')) return 'contact';
    if (url.includes('/penztar/szallitas')) return 'delivery';
    if (url.includes('/penztar/ellenorzes')) return 'review';
    if (url.includes('/penztar/siker')) return 'success';
    return 'cart';
  });

  /** Ordered step labels for the indicator. */
  readonly steps: readonly { key: CheckoutStep; label: string }[] = [
    { key: 'cart', label: 'Kosár' },
    { key: 'contact', label: 'Adatok' },
    { key: 'delivery', label: 'Szállítás' },
    { key: 'review', label: 'Ellenőrzés' },
  ];

  constructor() {
    this.routeFocus
      .pathChangeNavigationEnd$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.routeFocus.scheduleFocus();
        this.urlSignal.set(this.router.url);
      });
  }
}
