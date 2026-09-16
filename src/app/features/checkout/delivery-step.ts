/**
 * T21 — DeliveryStep (S4.3).
 *
 * Replaces the T11 stub. Owns the delivery + payment method form on
 * the second checkout step. The component is purely presentational:
 * it loads `CheckoutOptions` from the wire, renders one radio per
 * delivery option, conditionally renders the `AddressForm` when the
 * chosen option requires an address, and emits a `selectionChanged`
 * event whenever ANY field changes — including the payment method.
 *
 * The page is intentionally NOT a facade: it owns local signals for
 * `optionId`, `paymentMethod`, the address values and the error /
 * loading / ready state machine. The parent (the future
 * `CheckoutFacade`) reads the snapshot through `(selectionChanged)`
 * and decides whether to call `updateCheckout`. Keeping the page
 * facade-free means the same signals can be replayed into the
 * facade once it lands without a rewrite of this template.
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
 *   T21-AC04 — Any change to the option, the address OR the payment
 *               method invalidates the previous quote + payment intent.
 *               The `selectionChanged` event carries a
 *               `requiresFreshReview` flag the parent can read.
 *               Selection is announced through a visible "Kiválasztva"
 *               badge plus an `aria-live="polite"` region so it is
 *               never indicated by color alone.
 *
 *   T21-AC05 — When `getCheckoutOptions` fails the page renders
 *               `ErrorState` with a retry button. It NEVER picks a
 *               fallback option or fabricates a free-shipping default.
 */

import {
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../api/generated/api';
import { ApiConfiguration } from '../../api/generated/api-configuration';
import * as operations from '../../api/generated/functions';

import { CheckoutFacade } from './checkout.facade';

import { Button } from '../../shared/ui/button/button';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PriceBlock, type Money } from '../../shared/ui/price-block/price-block';

import type { Address } from '../../api/generated/models/address';
import type { CheckoutOptions } from '../../api/generated/models/checkout-options';
import type { DeliveryOption } from '../../api/generated/models/delivery-option';
import type { DeliverySelection } from '../../api/generated/models/delivery-selection';

import { AddressForm } from './address-form';
import {
  PaymentMethodSelector,
  type PaymentMethod,
} from './payment-method-selector';

export interface DeliverySelectionChange {
  readonly delivery: DeliverySelection;
  readonly paymentMethod: PaymentMethod;
  readonly requiresFreshReview: boolean;
}

const HOME_DELIVERY_FEE: Money = { amount: 1990, currency: 'HUF' };
const PICKUP_FEE: Money = { amount: 0, currency: 'HUF' };

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; detail: string }
  | { kind: 'ready'; options: CheckoutOptions };

@Component({
  selector: 'app-delivery-step',
  imports: [
    AddressForm,
    Button,
    ErrorState,
    LoadingState,
    PaymentMethodSelector,
    PriceBlock,
  ],
  templateUrl: './delivery-step.html',
  styleUrl: './delivery-step.scss',
})
export class DeliveryStep {
  private readonly http = inject(HttpClient);
  private readonly checkoutFacade = inject(CheckoutFacade);
  private readonly router = inject(Router);
  private readonly api: Api;

  /** Current load state. `loading` until the first fetch resolves,
   *  `error` when MSW or the wire rejected the request, `ready`
   *  once the static CheckoutOptions payload is in memory. */
  readonly state = signal<LoadState>({ kind: 'loading' });

  readonly retrying = signal<boolean>(false);
  readonly confirmPending = signal<boolean>(false);

  /** Selected delivery option id (null until the user picks one). */
  readonly selectedOptionId = signal<'home_delivery' | 'demo_pickup' | null>(null);

  /** Two-way bound address values from the `AddressForm`. */
  readonly postalCode = signal<string>('');
  readonly city = signal<string>('');
  readonly line1 = signal<string>('');
  readonly line2 = signal<string>('');
  readonly addressSubmitted = signal<boolean>(false);
  readonly addressSnapshot = signal<Address | null>(null);

  /** Current payment method — defaults to `demo_card`. */
  readonly paymentMethod = signal<PaymentMethod>('demo_card');

  /** Snapshot the parent reads through the `(selectionChanged)` event. */
  readonly selectionChanged = signal<DeliverySelectionChange | null>(null);

  /** Internal counter so the change-effect can ignore its first run. */
  private readonly interactionCounter = signal<number>(0);

  /** Convenience accessor so the template does not need to switch
   *  on `state().kind` itself. */
  readonly readyOptions = computed<CheckoutOptions | null>(() => {
    const s = this.state();
    return s.kind === 'ready' ? s.options : null;
  });

  constructor() {
    // The generated `Api` class relies on Angular decorator metadata
    // for constructor injection. The vitest esbuild pipeline strips
    // that metadata, so we wire it manually from `HttpClient` and
    // `ApiConfiguration`. The same `new Api(...)` call sees the live
    // HttpClient in the browser.
    this.api = new Api(inject(ApiConfiguration), this.http);

    // Any change to option / payment / address values must invalidate
    // the previous quote + payment intent. The effect fires AFTER
    // the initial signal priming so the first interaction is what
    // arms the flag.
    //
    // F6 (Angular v22 effect-loop fix): `interactionCounter` is read
    // and written inside the SAME effect. In v22, signal writes are
    // permitted inside `effect()` (`allowSignalWrites` is deprecated,
    // see https://angular.dev/api/core/CreateEffectOptions), so the
    // earlier write-only `untracked` wrap did NOT break the loop —
    // `untracked` only suppresses read-tracking (see
    // https://angular.dev/api/core/untracked), it does NOT suppress
    // write-triggered notifications. The effect still subscribed to
    // the counter, every write marked it dirty, and the scheduler's
    // `flush()` loop re-ran it forever. The fix per the v22 docs
    // ("Wrap the read portion in untracked()…") is to move the READ
    // of `interactionCounter` into `untracked` so the effect never
    // becomes a dependent of the counter in the first place.
    effect(() => {
      this.selectedOptionId();
      this.paymentMethod();
      this.postalCode();
      this.city();
      this.line1();
      this.line2();
      untracked(() => {
        if (this.interactionCounter() > 0) {
          this.selectionChanged.set(this.snapshotChange(true));
        }
        this.interactionCounter.update((count) => count + 1);
      });
    });

    void this.loadOptions();
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

  readonly requiresFreshReview = computed<boolean>(() => {
    const change = this.selectionChanged();
    if (change === null) return false;
    return change.requiresFreshReview;
  });

  readonly canProceedReady = computed<boolean>(() => {
    return this.canConfirm();
  });

  readonly canConfirm = computed<boolean>(() => {
    if (this.confirmPending()) return false;
    if (this.state().kind !== 'ready') return false;
    const optionId = this.selectedOptionId();
    if (optionId === null) return false;
    if (optionId === 'home_delivery') {
      return this.isAddressComplete();
    }
    return true;
  });

  readonly confirmLabel = computed<string>(() => 'Tovább az ellenőrzéshez');

  readonly paymentLabel = computed<string>(() => {
    const id = this.paymentMethod();
    if (id === 'demo_card') return 'Bankkártya (szimulált)';
    return 'Utánvét (demó)';
  });

  readonly errorMessage = computed<string>(() => {
    const state = this.state();
    if (state.kind !== 'error') return '';
    return state.detail;
  });

  // ---------------------------------------------------------------------------
  // Loading + retry
  // ---------------------------------------------------------------------------

  feeFor(option: DeliveryOption): Money {
    if (option.id === 'home_delivery') return HOME_DELIVERY_FEE;
    return PICKUP_FEE;
  }

  async loadOptions(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.api.invoke(operations.getCheckoutOptions, {}),
      );
      // The page never silently picks a default option. The radio
      // list iterates over the wire response so the user sees ONLY
      // what the server told them is available.
      this.state.set({ kind: 'ready', options: response });
    } catch (err) {
      // The exact cause is surfaced through the network console; the
      // user-visible message stays generic on purpose so we never
      // leak backend detail (R15).
      void err;
      this.state.set({
        kind: 'error',
        detail: 'A szállítási és fizetési opciók betöltése sikertelen.',
      });
    }
  }

  onRetry(): void {
    this.retrying.set(true);
    void this.loadOptions().finally(() => {
      this.retrying.set(false);
    });
  }

  // ---------------------------------------------------------------------------
  // User interactions
  // ---------------------------------------------------------------------------

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

  async onConfirm(): Promise<void> {
    if (!this.canConfirm()) return;
    const selection = this.snapshotChange(false);
    this.confirmPending.set(true);
    // Emit the final selection once more, WITHOUT the
    // `requiresFreshReview` flag — the parent will use this as the
    // green light to advance to /penztar/ellenorzes.
    this.selectionChanged.set(selection);

    // Mirror the user's selection into the wizard facade's
    // Signal Form model so the review step, the review guard,
    // and any future checkout summary read the same source of
    // truth. The facade then issues two PUTs against
    // `/api/v1/checkout/{cartId}` to persist the delivery and
    // paymentMethod sections; on success the route advances to
    // `/penztar/ellenorzes` where the cart summary and the
    // fresh-quote / consents flow take over.
    try {
      this.syncFacadeForm(selection);
      const deliveryResult = await this.checkoutFacade.saveDeliverySection();
      if (!deliveryResult.ok) {
        this.confirmPending.set(false);
        return;
      }
      const paymentResult = await this.checkoutFacade.savePaymentMethod();
      if (!paymentResult.ok) {
        this.confirmPending.set(false);
        return;
      }
      await this.router.navigate(['/penztar/ellenorzes']);
    } finally {
      this.confirmPending.set(false);
    }
  }

  /**
   * Copies this step's local selection onto the
   * `CheckoutFacade.form` FieldTree so the wizard as a whole sees
   * the user's choice. Only the fields the user touched are
   * updated — other sections (contact, consents) keep whatever
   * hydrate brought in. The demo `address` is reset to an empty
   * but valid shape when the user picked `demo_pickup` so a
   * later round trip back to home_delivery does not surface
   * stale city/line values.
   */
  private syncFacadeForm(selection: DeliverySelectionChange): void {
    const form = this.checkoutFacade.form;
    const optionId = selection.delivery.optionId;
    form.deliveryOptionId().value.set(optionId);
    form.paymentMethod().value.set(selection.paymentMethod);
    const addressFields = {
      postalCode: form.address.postalCode,
      city: form.address.city,
      line1: form.address.line1,
      line2: form.address.line2,
    };
    if (optionId === 'home_delivery') {
      const address = selection.delivery.address;
      if (address !== undefined) {
        addressFields.postalCode().value.set(address.postalCode);
        addressFields.city().value.set(address.city);
        addressFields.line1().value.set(address.line1);
        addressFields.line2().value.set(address.line2 ?? '');
      }
    } else {
      // Pickup path: zero the address fields so a future
      // home_delivery round trip does not auto-fill with the
      // previous selection. Country stays 'HU' — the only value
      // the schema accepts.
      addressFields.postalCode().value.set('');
      addressFields.city().value.set('');
      addressFields.line1().value.set('');
      addressFields.line2().value.set('');
    }
  }

  onBack(): void {
    // Routing is owned by the parent facade in a future task. The
    // page exposes the intent through `selectionChanged = null` so
    // a future subscriber can navigate back to /penztar/adatok.
    this.selectionChanged.set(null);
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

  private snapshotChange(requiresFreshReview: boolean): DeliverySelectionChange {
    const optionId = this.selectedOptionId();
    if (optionId === null) {
      // Callers (the selection-changed effect and `onConfirm`) gate on
      // `canConfirm()` or `interactionCounter > 0` before reaching here.
      // A null optionId is a contract violation; surface it loudly so
      // the failure is debuggable rather than masked by a type lie that
      // crashes later in `syncFacadeForm(selection)` with "cannot read
      // delivery of null".
      throw new Error('DeliveryStep.snapshotChange called without a selection');
    }
    const delivery: DeliverySelection =
      optionId === 'home_delivery'
        ? { optionId, address: this.snapshotAddress() }
        : { optionId };
    return {
      delivery,
      paymentMethod: this.paymentMethod(),
      requiresFreshReview,
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
