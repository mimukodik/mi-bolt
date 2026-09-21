/**
 * T21 — DeliveryStep (S4.3), ported to the 2.0.0 contract (MIM-212, S3-C4).
 *
 * FIX-56: brought back to the signature `docs/spec/components.md:566-576`
 * declares. The component is purely presentational: it renders the
 * delivery options, the payment method and the billing block the
 * `options` and `fields` inputs carry, reads and writes the address /
 * billing fields through the `fields` Signal Forms field tree the
 * owning container passes in (the deliberate parent-owned two-way
 * binding exception, `components.md:3`), and reports its `saveState`
 * through `saveState()`. It fetches nothing over the wire, navigates
 * nowhere and holds no error detail of its own — the container
 * (`delivery-page.ts`) owns the `CheckoutOptions` fetch, the three
 * facade saves, the navigation and the save-failure detail (the
 * contract's `saveState` is a plain `AsyncStatus` with no room for a
 * message, so the failure banner is the container's to render,
 * mirroring `FIX-63`'s `ReviewPage` treatment of the identical shape).
 *
 * 2.0.0 changes (design `s3-c-design.md` §6.1, §6.2):
 *
 *   - every fee is read from the wire (`option.fee`); the client no
 *     longer hard-codes `HOME_DELIVERY_FEE` / `PICKUP_FEE`;
 *   - the pickup option's id is the contract's own `pickup_point`;
 *   - an `available === false` option renders as a disabled radio
 *     carrying its `unavailableReason` as a readable sentence;
 *   - `paymentLabel` reads the wire label rather than a hard-coded
 *     Hungarian string;
 *   - the billing block (§6.2): a name field prefilled from the
 *     contact step's `fullName`, a "same as delivery address"
 *     checkbox (default checked, forced unchecked and hidden for
 *     `pickup_point`, since there is no delivery address to copy),
 *     and the delivery address fields reused for the billing address
 *     when the checkbox is unchecked or the option is `pickup_point`.
 *
 * Wire-level invariants enforced here (so the parent cannot receive
 * a malformed payload):
 *
 *   T21-AC01 — Address fields are required only when the chosen
 *               option is `home_delivery`. The container strips
 *               `address` from the emitted payload when the option
 *               is `pickup_point`, even if the form still holds a
 *               value from a previous selection.
 *
 *   T21-AC02 — The address is validated by `AddressForm` against the
 *               exact wire rules (`^[1-9][0-9]{3}$` / 2..80 / 3..120
 *               / line2 <=120 / HU only). The billing address reuses
 *               the same component and the same rules.
 *
 *   T21-AC03 — The visible shipping fee follows the selected option,
 *               read straight from `option.fee`. The page does NOT
 *               show tariff / installment / insurance / a real card
 *               field / a provider redirect.
 *
 *   T21-AC04 — Selection is announced through a visible "Kiválasztva"
 *               badge plus an `aria-live="polite"` region so it is
 *               never indicated by color alone.
 *
 *   T21-AC05 — The container renders `ErrorState` with a retry button
 *               when `ensureOptions()` fails; this component never
 *               picks a fallback option or fabricates a free-shipping
 *               default.
 */

import { Component, computed, effect, input, output, signal } from '@angular/core';

import { AddressForm } from './address-form';
import { CheckoutStepHeader, type CheckoutCrumb } from './checkout-step-header';
import { PaymentMethodSelector } from './payment-method-selector';
import type { CheckoutFieldTree } from './checkout-form.model';

import { Button } from '../../shared/ui/button/button';
import { PriceBlock, type Money } from '../../shared/ui/price-block/price-block';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import {
  FormFieldMessage,
  type FieldError,
} from '../../shared/ui/form-field-message/form-field-message';
import { isHTMLInputElement } from '../../shared/utils/event-target';

import type { AsyncStatus } from '../../shared/types/async-status';
import type { Address } from '../../api/generated/models/address';
import type { CheckoutOptions } from '../../api/generated/models/checkout-options';
import type { DeliveryOption } from '../../api/generated/models/delivery-option';
import type { DeliveryOptionId } from '../../api/generated/models/delivery-option-id';
import type { DeliverySelection } from '../../api/generated/models/delivery-selection';
import type { PaymentMethodId } from '../../api/generated/models/payment-method-id';
import type { UnavailableReason } from '../../api/generated/models/unavailable-reason';

export interface DeliverySelectionChange {
  readonly delivery: DeliverySelection;
  readonly paymentMethod: PaymentMethodId;
}

@Component({
  selector: 'app-delivery-step',
  imports: [
    AddressForm,
    Button,
    CheckoutStepHeader,
    FormFieldMessage,
    PaymentMethodSelector,
    PriceBlock,
    StatusMessage,
  ],
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
  readonly selectedOptionId = signal<DeliveryOptionId | null>(null);

  readonly addressSubmitted = signal<boolean>(false);
  readonly addressSnapshot = signal<Address | null>(null);

  /** Current payment method — no default (screens.md:79: "Defaults must
   *  not represent a paid addon"; a 2.0.0 payment method can carry a fee). */
  readonly paymentMethod = signal<PaymentMethodId | null>(null);

  private readonly billingNameTouchedInternal = signal<boolean>(false);

  /** Breadcrumb trail for the shared `CheckoutStepHeader`. Order matches
   *  the existing template: Főoldal → Kosár → Adatok, with this step
   *  (`Szállítás`) as the trailing non-link. */
  protected readonly crumbs: readonly CheckoutCrumb[] = [
    { label: 'Főoldal', link: '/' },
    { label: 'Kosár', link: '/penztar/kosar' },
    { label: 'Adatok', link: '/penztar/adatok' },
  ];

  constructor() {
    // §6.2: there is no delivery address to copy for pickup_point, so
    // the "same as delivery" checkbox is forced off the moment the
    // shopper picks that option. Forcing the underlying field (not just
    // the template) keeps the billing address fields required and the
    // billing payload correct even if the checkbox was left checked
    // from an earlier home_delivery selection.
    effect(() => {
      if (
        this.selectedOptionId() === 'pickup_point' &&
        this.fields().billingSameAsDelivery().value()
      ) {
        this.fields().billingSameAsDelivery().value.set(false);
      }
    });
  }

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
  // Billing field accessors — same `fields()` two-way exception. Unlike
  // `selectedOptionId()` / `paymentMethod()` (local, mirrored into
  // `fields()` at confirm time), these write straight through on every
  // change: there is no radio-group "current choice" to hold locally.
  // ---------------------------------------------------------------------------

  readonly billingName = computed(() => this.fields().billingName().value());
  readonly billingSameAsDelivery = computed(() => this.fields().billingSameAsDelivery().value());
  readonly billingPostalCode = computed(() => this.fields().billingAddress.postalCode().value());
  readonly billingCity = computed(() => this.fields().billingAddress.city().value());
  readonly billingLine1 = computed(() => this.fields().billingAddress.line1().value());
  readonly billingLine2 = computed(() => this.fields().billingAddress.line2().value());

  setBillingPostalCode(value: string): void {
    this.fields().billingAddress.postalCode().value.set(value);
  }

  setBillingCity(value: string): void {
    this.fields().billingAddress.city().value.set(value);
  }

  setBillingLine1(value: string): void {
    this.fields().billingAddress.line1().value.set(value);
  }

  setBillingLine2(value: string): void {
    this.fields().billingAddress.line2().value.set(value);
  }

  /** Whether the "same as delivery" checkbox itself is shown. §6.2:
   *  forced unchecked AND hidden for pickup_point, since there is no
   *  delivery address to offer copying. */
  readonly showBillingCheckbox = computed<boolean>(
    () => this.selectedOptionId() !== 'pickup_point',
  );

  /** Whether the five billing address fields are shown: whenever the
   *  checkbox is unchecked, or unconditionally for pickup_point (belt
   *  and suspenders alongside the constructor effect that forces the
   *  checkbox field itself to false). */
  readonly showBillingAddressFields = computed<boolean>(
    () => this.selectedOptionId() === 'pickup_point' || !this.billingSameAsDelivery(),
  );

  onBillingSameAsDeliveryChanged(event: Event): void {
    if (!isHTMLInputElement(event.target)) return;
    this.fields().billingSameAsDelivery().value.set(event.target.checked);
  }

  onBillingNameInput(event: Event): void {
    if (!isHTMLInputElement(event.target)) return;
    this.fields().billingName().value.set(event.target.value);
  }

  markBillingNameTouched(): void {
    this.billingNameTouchedInternal.set(true);
  }

  readonly billingNameTouched = computed(() => this.billingNameTouchedInternal());

  readonly billingNameInvalid = computed<boolean>(() => this.billingName().trim().length === 0);

  readonly billingNameErrors = computed<readonly FieldError[]>(() => {
    if (!this.billingNameInvalid()) return [];
    return [{ code: 'required', message: 'A számlázási név megadása kötelező.' }];
  });

  // ---------------------------------------------------------------------------
  // Public computed surface
  // ---------------------------------------------------------------------------

  readonly currentShippingFee = computed<Money | null>(() => {
    const id = this.selectedOptionId();
    const option = this.options().deliveryOptions.find((o) => o.id === id);
    return option?.fee ?? null;
  });

  readonly requiresAddress = computed<boolean>(() => {
    return this.selectedOptionId() === 'home_delivery';
  });

  readonly canConfirm = computed<boolean>(() => {
    if (this.saveState() === 'loading') return false;
    const optionId = this.selectedOptionId();
    if (optionId === null) return false;
    if (optionId === 'home_delivery' && !this.isAddressComplete()) return false;
    if (this.paymentMethod() === null) return false;
    if (this.billingNameInvalid()) return false;
    if (this.showBillingAddressFields() && !this.isBillingAddressComplete()) return false;
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

  /** Reads the label straight off the wire — the client no longer
   *  hard-codes the Hungarian payment-method names. */
  readonly paymentLabel = computed<string>(() => {
    const id = this.paymentMethod();
    const option = this.options().paymentMethods.find((o) => o.id === id);
    return option?.label ?? 'Nincs kiválasztva';
  });

  /** `saveState:AsyncStatus` carries no payload (`components.md:570-572`), so
   *  this message is a fixed, generic sentence rather than the wire's own
   *  `detail` — the container renders the backend-detail-carrying failure
   *  banner alongside this component, per R15 and FIX-56 item 4. */
  readonly saveErrorMessage = 'A mentés sikertelen. Próbáld újra.';

  // ---------------------------------------------------------------------------
  // User interactions
  // ---------------------------------------------------------------------------

  radioId(id: DeliveryOptionId): string {
    return `delivery-option-${id}`;
  }

  optionDescId(id: DeliveryOptionId): string {
    return `delivery-option-desc-${id}`;
  }

  /** Human-readable sentence for an unavailable option — shared shape
   *  with `PaymentMethodSelector.unavailableSentence`. The mock only
   *  ever emits `CART_EMPTY` / `CART_VALUE_TOO_HIGH`. */
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

  onOptionSelected(option: DeliveryOption): void {
    if (!option.available) return;
    if (this.selectedOptionId() === option.id) return;
    this.selectedOptionId.set(option.id);
    // When the user switches to pickup, the address form is no
    // longer rendered. We do not destroy the underlying values
    // (the user can switch back), but the snapshot builder MUST
    // omit the `address` key entirely so the wire payload matches
    // the contract.
    if (option.id === 'pickup_point') {
      this.addressSubmitted.set(false);
    }
  }

  onPaymentChanged(method: PaymentMethodId | null): void {
    if (method === null) return;
    this.paymentMethod.set(method);
  }

  onConfirm(): void {
    if (!this.canConfirm()) return;
    // Mirror the selection into the shared `fields()` tree the container
    // also holds so the two facade saves see the user's final choice.
    // The address / billing sub-fields are already written there
    // directly by the setters above; only the option id and payment
    // method need copying across, since those two stay local signals
    // for the reasons `onOptionSelected` / `onPaymentChanged` are kept
    // "as they are".
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
    return isAddressFieldsComplete(this.postalCode(), this.city(), this.line1(), this.line2());
  }

  private isBillingAddressComplete(): boolean {
    return isAddressFieldsComplete(
      this.billingPostalCode(),
      this.billingCity(),
      this.billingLine1(),
      this.billingLine2(),
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
    const paymentMethod = this.paymentMethod();
    if (paymentMethod === null) {
      throw new Error('DeliveryStep.snapshotChange called without a payment method');
    }
    const delivery: DeliverySelection =
      optionId === 'home_delivery' ? { optionId, address: this.snapshotAddress() } : { optionId };
    return { delivery, paymentMethod };
  }

  private snapshotAddress(): Address {
    return toWireAddress(this.postalCode(), this.city(), this.line1(), this.line2());
  }
}

/** Shared wire-rule completeness check for the delivery and billing
 *  address field groups (`checkout-form.model.ts`'s `applyAddressRules`
 *  mirrors the same wire constraints). */
function isAddressFieldsComplete(
  postalCode: string,
  city: string,
  line1: string,
  line2: string,
): boolean {
  return (
    /^[1-9][0-9]{3}$/.test(postalCode.trim()) &&
    city.trim().length >= 2 &&
    city.trim().length <= 80 &&
    line1.trim().length >= 3 &&
    line1.trim().length <= 120 &&
    line2.trim().length <= 120
  );
}

function toWireAddress(postalCode: string, city: string, line1: string, line2: string): Address {
  const trimmedLine2 = line2.trim();
  return {
    countryCode: 'HU',
    postalCode: postalCode.trim(),
    city: city.trim(),
    line1: line1.trim(),
    ...(trimmedLine2.length > 0 ? { line2: trimmedLine2 } : {}),
  };
}
