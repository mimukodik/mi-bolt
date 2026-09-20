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
 *     message "A következő lépésben választod ki."
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
  templateUrl: './order-summary.html',
  styleUrl: './order-summary.scss',
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
    const amount = subtotal.amount + shipping.amount;
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
