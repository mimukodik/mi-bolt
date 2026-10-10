import { Component, computed, input } from '@angular/core';
import type { AsyncStatus } from '../../types/async-status';
import { SkeletonLeave } from '../skeleton-leave/skeleton-leave';

/**
 * Wire-shaped Money object used by the OpenAPI-generated SDK.
 * Kept local so this primitive has zero dependency on the SDK build.
 */
export interface Money {
  readonly amount: number;
  readonly currency: 'HUF';
}

/**
 * MiBolt PriceBlock primitive.
 *
 * Renders a single amount with an explicit one-time meaning in Hungarian
 * (`Ft`). Uses Hungarian thousand-separator formatting with non-breaking
 * spaces (`339 990 Ft`, never `339,990` or `339990 Ft`).
 *
 * The contract is explicit about what each `status` means:
 * - `idle`     — read-only display before any data; renders the label only.
 * - `loading`  — the body is replaced by a skeleton of the same height; the
 *                label is preserved so the screen does not jump.
 * - `success`  — the body shows `amount` formatted as HUF; a non-HUF value
 *                is treated as an error and surfaces `status="error"`.
 * - `error`    — the body shows a short "—" with no invented figure.
 * - `empty`    — the body shows a short "—" with no invented figure.
 *
 * The component never substitutes 0 or any placeholder digit for an unknown
 * value: a missing/invalid amount does not become `0 Ft`. A value that is
 * known to be zero (a real, quoted zero-HUF fee) is not "unknown" and does
 * render as `0 Ft`; only `null`, a non-HUF currency, a non-finite amount, a
 * non-integer amount or a negative amount are treated as unknown/invalid.
 */
@Component({
  selector: 'app-price-block',
  imports: [SkeletonLeave],
  templateUrl: './price-block.html',
  styleUrl: './price-block.scss',
})
export class PriceBlock {
  readonly money = input<Money | null>(null);
  readonly referencePrice = input<Money | null>(null);
  readonly promotionText = input<string | null>(null);
  readonly referenceText = computed(() => {
    const reference = this.referencePrice();
    const currency: unknown = reference?.currency;
    return reference !== null &&
      currency === 'HUF' &&
      Number.isInteger(reference.amount) &&
      reference.amount > 0
      ? PriceBlock.formatHuf(reference.amount)
      : null;
  });
  readonly label = input.required<string>();
  readonly status = input<AsyncStatus>('idle');
  /** Amount size: `lg` is the product page's 28 px, `md` the 20 px list-card amount. */
  readonly size = input<'md' | 'lg'>('lg');
  /** Row puts the label left and the amount right on one line. */
  readonly layout = input<'stack' | 'row'>('stack');
  /** Inverse colours for a navy card: white label, lime amount. */
  readonly inverse = input(false);
  /** False where the row already names the amount (a `<dt>` or an option
   *  title beside it), so the label is not printed twice. */
  readonly showLabel = input(true);

  readonly amountText = computed<string | null>(() => {
    const m = this.money();
    if (m === null) return null;
    const currency: unknown = m.currency;
    if (currency !== 'HUF') return null;
    if (!Number.isFinite(m.amount)) return null;
    if (!Number.isInteger(m.amount)) return null;
    if (m.amount < 0) return null;
    return PriceBlock.formatHuf(m.amount);
  });

  /** Hungarian integer HUF formatter. Non-breaking space U+00A0 separators. */
  static formatHuf(amount: number): string {
    const value = Math.trunc(Math.abs(amount));
    const negative = amount < 0;
    const digits = value.toString();
    const chunks: string[] = [];
    let head = digits;
    while (head.length > 3) {
      chunks.unshift(head.slice(-3));
      head = head.slice(0, -3);
    }
    chunks.unshift(head);
    const grouped = chunks.join(' ');
    return `${negative ? '−' : ''}${grouped}`;
  }
}
