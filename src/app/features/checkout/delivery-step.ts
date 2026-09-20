/**
 * T21 — DeliveryStep (S4.3).
 *
 * FIX-56: brought back to the signature `docs/spec/components.md:566-576`
 * declares. The component is purely presentational: it renders the
 * delivery options and payment method the `options` input carries, reads
 * and writes the address fields through the `fields` Signal Forms field
 * tree the owning container passes in (the deliberate parent-owned
 * two-way binding exception, `components.md:3`), and reports its
 * `saveState` through `saveState()`. It fetches nothing over the wire,
 * navigates nowhere and holds no error detail of its own — the container
 * (`delivery-page.ts`) owns the `CheckoutOptions` fetch, the two facade
 * saves, the navigation and the save-failure detail (the contract's
 * `saveState` is a plain `AsyncStatus` with no room for a message, so the
 * failure banner is the container's to render, mirroring `FIX-63`'s
 * `ReviewPage` treatment of the identical shape).
 *
 * Wire-level invariants enforced here (so the parent cannot receive
 * a malformed payload):
 *
 *   T21-AC01 — Address fields are required only when the chosen
 *               option is `home_delivery`. The page strips
 *               `address` from the emitted payload when the option
 *               is `demo_pickup`, even if the form still holds a
 *               value from a previous selection.
 *
 *   T21-AC02 — The address is validated by `AddressForm` against the
 *               exact wire rules (`^[1-9][0-9]{3}$` / 2..80 / 3..120
 *               / line2 <=120 / HU only).
 *
 *   T21-AC03 — The visible shipping fee follows the selected option
 *               (`1990` for home, `0` for pickup). The page does NOT
 *               show tariff / installment / insurance / a real card
 *               field / a provider redirect.
 *
 *   T21-AC04 — Selection is announced through a visible "Kiválasztva"
 *               badge plus an `aria-live="polite"` region so it is
 *               never indicated by color alone. Quote/payment-intent
 *               invalidation on change is the container's concern now
 *               that this component holds no `selectionChanged` output.
 *
 *   T21-AC05 — The container renders `ErrorState` with a retry button
 *               when `getCheckoutOptions` fails; this component never
 *               picks a fallback option or fabricates a free-shipping
 *               default.
 */

import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AddressForm } from './address-form';
import { PaymentMethodSelector, type PaymentMethod } from './payment-method-selector';
import type { CheckoutFieldTree } from './checkout-form.model';

import { Button } from '../../shared/ui/button/button';
import { PriceBlock, type Money } from '../../shared/ui/price-block/price-block';
import { StatusMessage } from '../../shared/ui/status-message/status-message';

import type { AsyncStatus } from '../../shared/types/async-status';
import type { Address } from '../../api/generated/models/address';
import type { CheckoutOptions } from '../../api/generated/models/checkout-options';
import type { DeliveryOption } from '../../api/generated/models/delivery-option';
import type { DeliverySelection } from '../../api/generated/models/delivery-selection';

export interface DeliverySelectionChange {
  readonly delivery: DeliverySelection;
  readonly paymentMethod: PaymentMethod;
}

const HOME_DELIVERY_FEE: Money = { amount: 1990, currency: 'HUF' };
const PICKUP_FEE: Money = { amount: 0, currency: 'HUF' };

@Component({
  selector: 'app-delivery-step',
  imports: [AddressForm, Button, PaymentMethodSelector, PriceBlock, RouterLink, StatusMessage],
  templateUrl: './delivery-step.html',
  styleUrl: './delivery-step.scss',
})
export class DeliveryStep {
  readonly options = input.required<CheckoutOptions>();
  readonly fields = input.required<CheckoutFieldTree>();
  readonly saveState = input<AsyncStatus>('idle');

  readonly continueRequested = output();
  readonly retryOptions = output();

  /** Selected delivery option id (null until the user picks one). */
  readonly selectedOptionId = signal<'home_delivery' | 'demo_pickup' | null>(null);

  readonly addressSubmitted = signal<boolean>(false);
  readonly addressSnapshot = signal<Address | null>(null);

  /** Current payment method — defaults to `demo_card`. */
  readonly paymentMethod = signal<PaymentMethod>('demo_card');

  // ---------------------------------------------------------------------------
  // Address field accessors — bound through the deliberate `fields()`
  // parent-owned two-way exception (`components.md:3`).
  // ---------------------------------------------------------------------------

  readonly postalCode = computed(() => this.fields().address.postalCode().value());
  readonly city = computed(() => this.fields().address.city().value());
  readonly line1 = computed(() => this.fields().address.line1().value());
  readonly line2 = computed(() => this.fields().address.line2().value());

  setPostalCode(value: string): void {
    this.fields().address.postalCode().value.set(value);
  }

  setCity(value: string): void {
    this.fields().address.city().value.set(value);
  }

  setLine1(value: string): void {
    this.fields().address.line1().value.set(value);
  }

  setLine2(value: string): void {
    this.fields().address.line2().value.set(value);
  }

  // ---------------------------------------------------------------------------
  // Public computed surface
  // ---------------------------------------------------------------------------

  readonly currentShippingFee = computed<Money>(() => {
    const id = this.selectedOptionId();
    if (id === 'home_delivery') return HOME_DELIVERY_FEE;
    return PICKUP_FEE;
  });

  readonly requiresAddress = computed<boolean>(() => {
    return this.selectedOptionId() === 'home_delivery';
  });

  readonly canConfirm = computed<boolean>(() => {
    if (this.saveState() === 'loading') return false;
    const optionId = this.selectedOptionId();
    if (optionId === null) return false;
    if (optionId === 'home_delivery') {
      return this.isAddressComplete();
    }
    return true;
  });

  readonly confirmLabel = computed<string>(() => 'Tovább az ellenőrzéshez');

  /** Name of the chosen delivery option, for the summary card.
   *  screens.md S4.3: "Any selected method is explicitly visible
   *  before final review." */
  readonly deliveryLabel = computed<string>(() => {
    const id = this.selectedOptionId();
    const option = this.options().deliveryOptions.find((o) => o.id === id);
    return option?.label ?? 'Nincs kiválasztva';
  });

  readonly paymentLabel = computed<string>(() => {
    const id = this.paymentMethod();
    if (id === 'demo_card') return 'Bankkártya (szimulált)';
    return 'Utánvét (demó)';
  });

  /** `saveState:AsyncStatus` carries no payload (`components.md:570-572`), so
   *  this message is a fixed, generic sentence rather than the wire's own
   *  `detail` — the container renders the backend-detail-carrying failure
   *  banner alongside this component, per R15 and FIX-56 item 4. */
  readonly saveErrorMessage = 'A mentés sikertelen. Próbáld újra.';

  // ---------------------------------------------------------------------------
  // User interactions
  // ---------------------------------------------------------------------------

  feeFor(option: DeliveryOption): Money {
    if (option.id === 'home_delivery') return HOME_DELIVERY_FEE;
    return PICKUP_FEE;
  }

  radioId(id: 'home_delivery' | 'demo_pickup'): string {
    return `delivery-option-${id}`;
  }

  optionDescId(id: 'home_delivery' | 'demo_pickup'): string {
    return `delivery-option-desc-${id}`;
  }

  onOptionSelected(id: 'home_delivery' | 'demo_pickup'): void {
    if (this.selectedOptionId() === id) return;
    this.selectedOptionId.set(id);
    // When the user switches to pickup, the address form is no
    // longer rendered. We do not destroy the underlying values
    // (the user can switch back), but the snapshot builder MUST
    // omit the `address` key entirely so the wire payload matches
    // the contract.
    if (id === 'demo_pickup') {
      this.addressSubmitted.set(false);
    }
  }

  onPaymentChanged(method: PaymentMethod | null): void {
    if (method === null) return;
    this.paymentMethod.set(method);
  }

  onConfirm(): void {
    if (!this.canConfirm()) return;
    // Mirror the selection into the shared `fields()` tree the container
    // also holds (`checkoutFacade.form`) so `saveDeliverySection()` /
    // `savePaymentMethod()` see the user's final choice. The address
    // sub-fields are already written there directly by `setPostalCode()`
    // etc.; only the option id and payment method need copying across,
    // since those two stay local signals for the reasons `onOptionSelected`
    // / `onPaymentChanged` are kept "as they are".
    const selection = this.snapshotChange();
    this.fields().deliveryOptionId().value.set(selection.delivery.optionId);
    this.fields().paymentMethod().value.set(selection.paymentMethod);
    this.continueRequested.emit();
  }

  onRetry(): void {
    this.retryOptions.emit();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private isAddressComplete(): boolean {
    return (
      /^[1-9][0-9]{3}$/.test(this.postalCode().trim()) &&
      this.city().trim().length >= 2 &&
      this.city().trim().length <= 80 &&
      this.line1().trim().length >= 3 &&
      this.line1().trim().length <= 120 &&
      this.line2().trim().length <= 120
    );
  }

  private snapshotChange(): DeliverySelectionChange {
    const optionId = this.selectedOptionId();
    if (optionId === null) {
      // Callers gate on `canConfirm()` before reaching here. A null
      // optionId is a contract violation; surface it loudly so the
      // failure is debuggable rather than masked by a type lie that
      // crashes later in the container.
      throw new Error('DeliveryStep.snapshotChange called without a selection');
    }
    const delivery: DeliverySelection =
      optionId === 'home_delivery' ? { optionId, address: this.snapshotAddress() } : { optionId };
    return {
      delivery,
      paymentMethod: this.paymentMethod(),
    };
  }

  private snapshotAddress(): Address {
    const line2 = this.line2().trim();
    return {
      countryCode: 'HU',
      postalCode: this.postalCode().trim(),
      city: this.city().trim(),
      line1: this.line1().trim(),
      ...(line2.length > 0 ? { line2 } : {}),
    };
  }
}
