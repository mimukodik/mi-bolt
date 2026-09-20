import { Component, computed, input } from '@angular/core';
import type { AsyncStatus } from '../../types/async-status';

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
  templateUrl: './price-block.html',
  styleUrl: './price-block.scss',
})
export class PriceBlock {
  readonly money = input<Money | null>(null);
  readonly label = input.required<string>();
  readonly status = input<AsyncStatus>('idle');

  readonly amountText = computed<string | null>(() => {
    const m = this.money();
    if (m === null) return null;
    const currency: unknown = m.currency;
    return currency !== 'HUF' ||
      !Number.isFinite(m.amount) ||
      !Number.isInteger(m.amount) ||
      m.amount < 0
      ? null
      : PriceBlock.formatHuf(m.amount);
  });

  /**
  Hungarian integer HUF formatter. Non-breaking space U+00A0 separators.
  */
  static formatHuf(amount: number): string {
    const value = Math.trunc(Math.abs(amount));
    const isNegative = amount < 0;
    const grouped = value.toString().replaceAll(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${isNegative ? '−' : ''}${grouped}`;
  }
}
