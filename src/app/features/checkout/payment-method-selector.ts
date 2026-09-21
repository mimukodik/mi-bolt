/**
 * T21 — PaymentMethodSelector (S4.3), rewritten on the 2.0.0 contract.
 *
 * Renders whatever `PaymentMethodOption[]` the server sends: `label`,
 * `description` and `fee` are wire data, not hard-coded Hungarian
 * strings, because a payment method can now carry a real surcharge
 * (`screens.md:79` — "Defaults must not represent a paid addon"). There
 * is no default selection: `value` starts `null` and stays that way
 * until the shopper picks a radio.
 *
 * An `available === false` option renders as a disabled radio carrying
 * its `unavailableReason` as a readable sentence, the same treatment
 * `DeliveryStep` gives an unavailable delivery option.
 *
 * The confirm action lives on the parent screen's own CTA
 * (`delivery-step.html`'s `[data-testid="delivery-confirm"]`); this
 * component only reports the selection.
 */

import { Component, model, output, input } from '@angular/core';

import { PriceBlock } from '../../shared/ui/price-block/price-block';

import type { PaymentMethodId } from '../../api/generated/models/payment-method-id';
import type { PaymentMethodOption } from '../../api/generated/models/payment-method-option';
import type { UnavailableReason } from '../../api/generated/models/unavailable-reason';

@Component({
  selector: 'app-payment-method-selector',
  imports: [PriceBlock],
  templateUrl: './payment-method-selector.html',
  styleUrl: './payment-method-selector.scss',
})
export class PaymentMethodSelector {
  readonly options = input.required<readonly PaymentMethodOption[]>();

  readonly value = model<PaymentMethodId | null>(null);
  readonly paymentChanged = output<PaymentMethodId>();

  isSelected(id: PaymentMethodId): boolean {
    return this.value() === id;
  }

  optionId(id: PaymentMethodId): string {
    return `payment-option-${id}`;
  }

  helperId(id: PaymentMethodId): string {
    return `payment-helper-${id}`;
  }

  /** Human-readable sentence for an unavailable option. The mock only
   *  ever emits `CART_EMPTY` / `CART_VALUE_TOO_HIGH`; the third union
   *  member and an absent reason both fall back to a generic sentence
   *  so the radio is never disabled with no explanation at all. */
  unavailableSentence(reason: UnavailableReason | undefined): string {
    switch (reason) {
      case 'CART_EMPTY':
        return 'A kosarad jelenleg üres.';
      case 'CART_VALUE_TOO_HIGH':
        return 'A kosár értéke meghaladja az ennél az opciónál megengedett összeget.';
      case 'NOT_AVAILABLE_FOR_ITEMS':
        return 'A kosaradban lévő termékekhez ez az opció nem elérhető.';
      default:
        return 'Ez az opció jelenleg nem elérhető.';
    }
  }

  onSelected(id: PaymentMethodId): void {
    if (this.value() === id) return;
    this.value.set(id);
    this.paymentChanged.emit(id);
  }
}
