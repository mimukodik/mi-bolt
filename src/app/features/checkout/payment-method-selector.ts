/**
 * T21 — PaymentMethodSelector (S4.3).
 *
 * Renders the two demo-only payment choices:
 *
 *   - `demo_card` — simulated card flow; the user picks the radio
 *                   and the parent confirms the order. No actual
 *                   card field, no provider redirect, no input for
 *                   a real PAN / expiry / CVC.
 *   - `demo_cod`  — cash on delivery in the simulated order; no
 *                   payment-intent call at all.
 *
 * The radio group is driven by `model('demo_card' | 'demo_cod')`
 * so the parent can read the current selection through a single
 * binding. Selection is not indicated by color alone: every option
 * carries a visible label and a "(Demó)" / "(Szimulált)" suffix,
 * and the selected state is announced through `aria-checked` plus
 * a "Kiválasztva" badge the assistive tech reads as live region.
 *
 * The confirm action lives on the parent screen's own CTA
 * (`delivery-step.html`'s `[data-testid="delivery-confirm"]`); this
 * component only reports the selection.
 */

import { Component, model, output } from '@angular/core';

export type PaymentMethod = 'demo_card' | 'demo_cod';

interface PaymentOption {
  readonly id: PaymentMethod;
  readonly label: string;
  readonly helper: string;
  readonly demoTag: string;
}

const PAYMENT_OPTIONS: readonly PaymentOption[] = [
  {
    id: 'demo_card',
    label: 'Bankkártya (szimulált)',
    helper: 'A fizetés demó környezetben, valós kártyaadatok megadása nélkül zajlik.',
    demoTag: 'Demó',
  },
  {
    id: 'demo_cod',
    label: 'Utánvét (demó)',
    helper: 'A demó rendelés átvételkor fizetendő; nincs valódi pénzmozgás.',
    demoTag: 'Demó',
  },
];

@Component({
  selector: 'app-payment-method-selector',
  templateUrl: './payment-method-selector.html',
  styleUrl: './payment-method-selector.scss',
})
export class PaymentMethodSelector {
  readonly value = model<PaymentMethod>('demo_card');

  readonly selectionChanged = model<PaymentMethod | null>(null);
  readonly paymentChanged = output<PaymentMethod>();

  readonly options: readonly PaymentOption[] = PAYMENT_OPTIONS;

  isSelected(id: PaymentMethod): boolean {
    return this.value() === id;
  }

  optionId(id: PaymentMethod): string {
    return `payment-option-${id}`;
  }

  helperId(id: PaymentMethod): string {
    return `payment-helper-${id}`;
  }

  onSelected(id: PaymentMethod): void {
    if (this.value() === id) return;
    this.value.set(id);
    this.selectionChanged.set(id);
    this.paymentChanged.emit(id);
  }
}
