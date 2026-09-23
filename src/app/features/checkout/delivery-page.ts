/**
 * `DeliveryPage` is the owning container `checkout.routes.ts` routes `szallitas` to.
 * It fetches `CheckoutOptions` through `CheckoutFacade.ensureOptions()` / `.options()`,
 * owns the load and save state machines and the Signal Forms `CheckoutFieldTree`, and
 * on `onContinueRequested` runs the three section writes the delivery step's billing
 * block and options require, `updateDelivery`, `updatePayment`, `updateBilling`, in that
 * order, each gated on the previous one succeeding. The failure detail of a rejected
 * save is rendered here rather than in `DeliveryStep`, because the contract's
 * `saveState` is a plain `AsyncStatus` with no room for a message.
 */
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import {
  buildCheckoutForm,
  createInitialCheckoutFormModel,
  type CheckoutFieldTree,
  type CheckoutFormAddress,
  type CheckoutFormModel,
} from './checkout-form.model';
import { CheckoutFacade, type CheckoutError } from './checkout.facade';
import { DeliveryStep } from './delivery-step';
import { NavigationReasonBanner } from './navigation-reason-banner';

import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { StatusMessage } from '../../shared/ui/status-message/status-message';

import type { AsyncStatus } from '../../shared/types/async-status';
import type { Address } from '../../api/generated/models/address';
import type { BillingDetails } from '../../api/generated/models/billing-details';
import type { CheckoutOptions } from '../../api/generated/models/checkout-options';
import type { DeliverySelection } from '../../api/generated/models/delivery-selection';
import type { PaymentSelection } from '../../api/generated/models/payment-selection';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; detail: string }
  | { kind: 'ready'; options: CheckoutOptions };

@Component({
  selector: 'app-delivery-page',
  imports: [DeliveryStep, ErrorState, LoadingState, NavigationReasonBanner, StatusMessage],
  templateUrl: './delivery-page.html',
  styleUrl: './delivery-page.scss',
})
export class DeliveryPage {
  private readonly checkoutFacade = inject(CheckoutFacade);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** The Signal Forms field tree the delivery step binds to. The facade
   *  no longer owns a form (MIM-212 S3-C1); this container builds it
   *  once, seeded from whatever the session already has saved, so a
   *  returning visitor sees their earlier delivery/billing choices
   *  instead of a blank form. */
  private readonly formModel = signal<CheckoutFormModel>(this.buildInitialModel());
  readonly fields: CheckoutFieldTree = buildCheckoutForm(this.formModel);

  /** Current load state for the `CheckoutOptions` fetch. `loading`
   *  until the first fetch resolves, `error` when MSW or the wire
   *  rejected the request, `ready` once the payload is in memory. */
  readonly state = signal<LoadState>({ kind: 'loading' });
  readonly retrying = signal<boolean>(false);

  /** Async status of the confirm-time save, passed down as
   *  `DeliveryStep`'s declared `saveState` input. */
  readonly saveState = signal<AsyncStatus>('idle');

  /** Detail of the last save attempt that failed. Null until a save
   *  fails; cleared at the start of the next attempt. */
  readonly saveFailure = signal<CheckoutError | null>(null);

  readonly errorMessage = computed<string>(() => {
    const s = this.state();
    return s.kind === 'error' ? s.detail : '';
  });

  /** Convenience accessor so the template does not need to narrow
   *  `state()`'s union itself inside the `@case ('ready')` block. */
  readonly readyOptions = computed<CheckoutOptions | null>(() => {
    const s = this.state();
    return s.kind === 'ready' ? s.options : null;
  });

  /** Rendered when the confirm action's save fails. Takes the
   *  wire's own detail and adds the same "nothing was lost" sentence
   *  the other checkout screens use for the identical situation, so
   *  they do not speak differently. */
  readonly saveFailureMessage = computed<string>(() => {
    const failure = this.saveFailure();
    if (failure === null) return '';
    if (failure.detail === '') {
      return 'A kosarad és az adataid megmaradtak. Próbáld újra.';
    }
    return `${failure.detail} A kosarad és az adataid megmaradtak. Próbáld újra.`;
  });

  constructor() {
    void this.loadOptions(false);
  }

  async loadOptions(force: boolean): Promise<void> {
    const result = await this.checkoutFacade.ensureOptions(force);
    if (result.ok) {
      // Never silently pick a default option: the radio list iterates
      // over the wire response so the user sees ONLY what the server
      // told them is available.
      this.state.set({ kind: 'ready', options: result.value });
    } else {
      // The exact cause is surfaced through the network console; the
      // user-visible message stays generic on purpose so we never
      // leak backend detail (R15).
      this.state.set({
        kind: 'error',
        detail: 'A szállítási és fizetési opciók betöltése sikertelen.',
      });
    }
  }

  onRetry(): void {
    this.retrying.set(true);
    void this.loadOptions(true).finally(() => {
      this.retrying.set(false);
    });
  }

  /** Handles `DeliveryStep`'s `(retryOptions)`: re-runs the options
   *  fetch (forced, since the retry is meant to fetch fresh
   *  availability rather than replay a cached snapshot), and clears a
   *  stale save failure so the user returns to a clean ready state to
   *  try again. */
  onRetryOptions(): void {
    this.saveState.set('idle');
    this.saveFailure.set(null);
    void this.loadOptions(true);
  }

  /** Handles `DeliveryStep`'s `(continueRequested)`: the three facade
   *  saves plus the post-save navigation, in sequence and gated. A
   *  failure at any of the three stops the sequence, renders the
   *  failure banner and does not navigate. */
  async onContinueRequested(): Promise<void> {
    this.saveState.set('loading');
    this.saveFailure.set(null);
    try {
      const model = this.formModel();

      const delivery = toDeliverySelection(model);
      const deliveryResult = await this.checkoutFacade.updateDelivery(delivery);
      if (!deliveryResult.ok) {
        this.saveFailure.set(deliveryResult.error);
        this.saveState.set('error');
        return;
      }

      const payment = toPaymentSelection(model);
      const paymentResult = await this.checkoutFacade.updatePayment(payment);
      if (!paymentResult.ok) {
        this.saveFailure.set(paymentResult.error);
        this.saveState.set('error');
        return;
      }

      const billing = toBillingDetails(model, delivery);
      const billingResult = await this.checkoutFacade.updateBilling(billing);
      if (!billingResult.ok) {
        this.saveFailure.set(billingResult.error);
        this.saveState.set('error');
        return;
      }

      // The three sections are saved; a shopper who left the step while
      // they were in flight is not pulled back into the wizard.
      if (this.destroyRef.destroyed) return;
      await this.router.navigate(['/penztar/ellenorzes']);
    } finally {
      if (this.saveFailure() === null) {
        this.saveState.set('idle');
      }
    }
  }

  /** Seeds the form model from whatever the session already carries.
   *  `deliveryGuard` (`checkout.guards.ts`) only lets this page match
   *  once `session().contact` exists, so `session()` is safe to read
   *  synchronously here. The billing name defaults to the contact
   *  step's `fullName` when nothing was saved yet (§6.2's "prefilled,
   *  editable"); once a billing section exists, its own saved values
   *  win, and the "same as delivery" checkbox is ticked exactly when
   *  the saved delivery is home delivery and the saved billing address
   *  equals it field by field (owner, 2026-09-22: the tick is restored
   *  from the saved data). */
  private buildInitialModel(): CheckoutFormModel {
    const model = createInitialCheckoutFormModel();
    const session = this.checkoutFacade.session();
    const contact = session?.contact;
    if (contact !== undefined) {
      model.fullName = contact.fullName;
      model.email = contact.email;
      model.phone = contact.phone;
      model.billingName = contact.fullName;
    }

    const delivery = session?.delivery;
    if (delivery !== undefined) {
      model.deliveryOptionId = delivery.optionId;
      if (delivery.optionId === 'home_delivery') {
        model.address = mergeAddress(model.address, delivery.address);
      }
    }

    const payment = session?.payment;
    if (payment !== undefined) {
      model.paymentMethod = payment.method;
    }

    const billing = session?.billing;
    if (billing !== undefined) {
      model.billingName = billing.name;
      model.billingAddress = mergeAddress(model.billingAddress, billing.address);
      const homeAddress = delivery?.optionId === 'home_delivery' ? delivery.address : undefined;
      model.billingSameAsDelivery =
        homeAddress !== undefined && sameAddress(billing.address, homeAddress);
    }

    return model;
  }
}

function mergeAddress(base: CheckoutFormAddress, wire: Address): CheckoutFormAddress {
  return {
    countryCode: 'HU',
    postalCode: wire.postalCode,
    city: wire.city,
    line1: wire.line1,
    line2: wire.line2 ?? base.line2,
  };
}

/** Whether two wire addresses name the same place, field by field; a
 *  missing `line2` equals an empty one. */
function sameAddress(a: Address, b: Address): boolean {
  return (
    a.postalCode === b.postalCode &&
    a.city === b.city &&
    a.line1 === b.line1 &&
    (a.line2 ?? '') === (b.line2 ?? '')
  );
}

function toWireAddress(address: CheckoutFormAddress): Address {
  const line2 = address.line2.trim();
  return {
    countryCode: 'HU',
    postalCode: address.postalCode.trim(),
    city: address.city.trim(),
    line1: address.line1.trim(),
    ...(line2.length > 0 ? { line2 } : {}),
  };
}

function toDeliverySelection(model: CheckoutFormModel): DeliverySelection {
  if (model.deliveryOptionId === 'pickup_point') {
    return { optionId: 'pickup_point' };
  }
  if (model.deliveryOptionId === 'home_delivery') {
    return { optionId: 'home_delivery', address: toWireAddress(model.address) };
  }
  // DeliveryStep.canConfirm() gates the confirm button on a selection
  // being made; a reachable empty deliveryOptionId here is a contract
  // violation, so this fails loudly rather than sending a malformed
  // payload (mirrors `DeliveryStep.snapshotChange`'s own guard).
  throw new Error('DeliveryPage.onContinueRequested called without a delivery option selected');
}

function toPaymentSelection(model: CheckoutFormModel): PaymentSelection {
  if (model.paymentMethod === '') {
    throw new Error('DeliveryPage.onContinueRequested called without a payment method selected');
  }
  return { method: model.paymentMethod };
}

function toBillingDetails(model: CheckoutFormModel, delivery: DeliverySelection): BillingDetails {
  const name = model.billingName.trim();
  if (name.length === 0) {
    throw new Error('DeliveryPage.onContinueRequested called without a billing name');
  }
  if (model.billingSameAsDelivery && delivery.optionId === 'home_delivery') {
    return { name, address: delivery.address };
  }
  return { name, address: toWireAddress(model.billingAddress) };
}
