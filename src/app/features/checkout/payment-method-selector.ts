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
 * T10 Button primitive drives the confirm action so the visual
 * vocabulary matches the rest of the checkout flow.
 */

import { Component, computed, model, output } from '@angular/core';

import { Button } from '../../shared/ui/button/button';

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
  imports: [Button],
  templateUrl: './payment-method-selector.html',
  styleUrl: './payment-method-selector.scss',
})
export class PaymentMethodSelector {
  readonly value = model<PaymentMethod>('demo_card');
  readonly pending = model<boolean>(false);
  /** When false, the confirm button is disabled even though an option is selected. */
  readonly ready = model<boolean>(false);

  readonly selectionChanged = model<PaymentMethod | null>(null);
  readonly paymentChanged = output<PaymentMethod>();

  readonly options: readonly PaymentOption[] = PAYMENT_OPTIONS;

  readonly canConfirm = computed<boolean>(() => this.value() !== null && this.ready() && !this.pending());

  readonly confirmLabel = computed<string>(() => 'Tovább az ellenőrzéshez');

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

  onConfirm(): void {
    if (!this.canConfirm()) return;
    // The actual navigation is the parent's responsibility. We only
    // emit the chosen method through the model — the parent listens
    // for the confirm via `(pressed)` on the bound button.
  }
}
