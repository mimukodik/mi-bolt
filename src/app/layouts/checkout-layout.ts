import { Component, DestroyRef, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';

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
 *   Ellenőrzés) sits between the demo notice and the page content so
 *   the user always knows which step they are on.
 * - The standard footer is suppressed — the demo terms dialog inside
 *   the review step carries the legal copy.
 *
 * The current step is derived from the URL through the route data set
 * by `app.routes.ts`. The lazy step page does NOT render an H1 of its
 * own at this level: the H1 lives in each step page.
 */
export type CheckoutStep = 'cart' | 'contact' | 'delivery' | 'review' | 'success';

const STEP_ORDER: ReadonlyArray<CheckoutStep> = ['cart', 'contact', 'delivery', 'review'];

@Component({
  selector: 'app-checkout-layout',
  imports: [AppShell, RouterOutlet],
  template: `
    <app-app-shell variant="checkout" [showFooter]="false">
      <main id="main-content" tabindex="-1" class="layout-main">
        <ol class="steps" aria-label="Pénztár lépései" data-testid="checkout-steps">
          @for (step of steps; track step.key) {
            <li
              class="steps__item"
              [class.is-current]="step.key === currentStep()"
              [attr.aria-current]="step.key === currentStep() ? 'step' : null"
            >
              <span class="steps__index">{{ $index + 1 }}</span>
              <span class="steps__label">{{ step.label }}</span>
            </li>
          }
        </ol>
        <router-outlet />
      </main>
    </app-app-shell>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .layout-main {
        display: block;
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        padding: var(--space-6) var(--layout-gutter-mobile) var(--space-7);
        max-width: var(--layout-container-max);
        margin: 0 auto;
        scroll-margin-top: 80px;
      }

      .steps {
        list-style: none;
        padding: 0;
        margin: 0 0 var(--space-6);
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3);
        counter-reset: step;
      }

      .steps__item {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        background: var(--color-surface-section);
        border-radius: var(--radius-control);
        color: var(--color-text-secondary);
        font-size: var(--type-helper);
        min-height: var(--size-control);
      }

      .steps__item.is-current {
        background: var(--color-brand-accent);
        color: var(--color-text-primary);
        font-weight: var(--weight-bold);
      }

      .steps__index {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.08);
        font-weight: var(--weight-bold);
        font-size: var(--type-meta);
      }

      .steps__item.is-current .steps__index {
        background: var(--color-text-primary);
        color: var(--color-text-inverse);
      }

      .steps__label {
        white-space: nowrap;
      }

      @media (min-width: 768px) {
        .layout-main {
          padding: var(--space-7) var(--layout-gutter-desktop) var(--space-8);
        }

        .steps {
          gap: var(--space-4);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .steps__item {
          transition: none;
        }
      }
    `,
  ],
})
export class CheckoutLayout {
  private readonly routeFocus = inject(RouteFocusService);
  private readonly destroyRef = inject(DestroyRef);

  /** Active step in the flow. Default is cart. */
  readonly currentStep = input<CheckoutStep>('cart');

  /** Ordered step labels for the indicator. */
  readonly steps: ReadonlyArray<{ key: CheckoutStep; label: string }> = [
    { key: 'cart', label: 'Kosár' },
    { key: 'contact', label: 'Adatok' },
    { key: 'delivery', label: 'Szállítás' },
    { key: 'review', label: 'Ellenőrzés' },
  ];

  constructor() {
    this.routeFocus.navigationEnd$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        queueMicrotask(() => this.routeFocus.focusMainHeading());
      });
  }
}
