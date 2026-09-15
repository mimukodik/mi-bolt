/**
 * T18 — order summary (S4.1).
 *
 * Renders the subtotal / shipping / total stack on the right rail
 * of the cart page. The component is purely presentational: the
 * cart page computes the values and forwards them as inputs so the
 * summary stays free of CartFacade coupling.
 *
 * Three states:
 *
 *   - shipping unknown (the default on the cart page): the
 *     component shows the subtotal and the explicit Hungarian
 *     message "A szállítási díj a pénztárban kerül kiszámításra"
 *     instead of a final shipping figure. The total is rendered as
 *     "—" with no invented amount (R14 / R19).
 *   - shipping known: the component adds the shipping leg and
 *     computes the total (subtotal + shipping) in whole HUF.
 *
 * No monthly fee, no hidden add-on, no "limited offer" copy (R25).
 * The visual structure mirrors the subtotal block the page renders
 * for each line so the user can connect the numbers.
 */

import { Component, computed, input } from '@angular/core';

import { PriceBlock, type Money } from '../../shared/ui/price-block/price-block';

const ZERO_TOTAL: Money = { amount: 0, currency: 'HUF' };

@Component({
  selector: 'app-order-summary',
  imports: [PriceBlock],
  template: `
    <aside class="summary" aria-label="Rendelés összesítése" data-testid="order-summary">
      <h2 class="title">Rendelés összesítése</h2>

      <div class="rows">
        <div class="row row--subtotal" data-testid="order-summary-subtotal">
          <app-price-block
            [money]="subtotal()"
            [label]="'Részösszeg'"
            [status]="subtotalStatus()"
          ></app-price-block>
        </div>

        <div class="row row--shipping" data-testid="order-summary-shipping">
          <span class="label">Szállítás</span>
          @if (shipping()) {
            <app-price-block
              [money]="shipping()!"
              [label]="'Szállítási díj'"
              [status]="'success'"
            ></app-price-block>
          } @else {
            <span class="placeholder" data-testid="shipping-placeholder">
              A szállítási díj a pénztárban kerül kiszámításra
            </span>
          }
        </div>

        <div class="row row--total" data-testid="order-summary-total">
          <app-price-block
            [money]="total()"
            [label]="'Végösszeg'"
            [status]="totalStatus()"
          ></app-price-block>
        </div>
      </div>

      @if (footnote()) {
        <p class="footnote" data-testid="order-summary-footnote">{{ footnote() }}</p>
      }
    </aside>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .summary {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-5);
        background: var(--color-surface-section);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
        color: var(--color-text-primary);
      }

      .title {
        margin: 0;
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      .rows {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .row {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .row--subtotal,
      .row--total {
        gap: 0;
      }

      .row--total app-price-block {
        --price-size: var(--type-price-mobile);
      }

      .row--shipping .label {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .placeholder {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        line-height: var(--line-height-body);
      }

      .footnote {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        line-height: var(--line-height-body);
      }

      @media (min-width: 640px) {
        .summary {
          padding: var(--space-6);
        }
      }
    `,
  ],
})
export class OrderSummary {
  readonly subtotal = input.required<Money>();
  readonly shipping = input<Money | null>(null);
  readonly footnote = input<string | null>(null);

  /**
   * Final total. When shipping is not yet known, the total is a
   * zero Money so `PriceBlock` does NOT invent an amount (it shows
   * "—" for non-positive amounts per its contract). The cart page
   * disables the Continue button while shipping is unknown.
   */
  readonly total = computed<Money>(() => {
    const shipping = this.shipping();
    if (shipping === null) return ZERO_TOTAL;
    const subtotal = this.subtotal();
    const amount = (subtotal?.amount ?? 0) + shipping.amount;
    return { amount, currency: 'HUF' };
  });

  readonly subtotalStatus = computed<'success' | 'empty'>(() => {
    const subtotal = this.subtotal();
    return subtotal.amount > 0 ? 'success' : 'empty';
  });

  readonly totalStatus = computed<'success' | 'empty'>(() => {
    const shipping = this.shipping();
    if (shipping === null) return 'empty';
    return 'success';
  });
}