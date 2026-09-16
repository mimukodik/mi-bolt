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
  template: `
    <section class="delivery" data-testid="delivery-step">
      <header class="heading">
        <nav class="breadcrumbs" aria-label="Navigáció">
          <a href="/" class="breadcrumb">Főoldal</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <a href="/penztar/kosar" class="breadcrumb">Kosár</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <a href="/penztar/adatok" class="breadcrumb">Adatok</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <span class="breadcrumb is-current" aria-current="page">Szállítás</span>
        </nav>
        <h1 class="title">Szállítás és fizetés</h1>
      </header>

      @switch (state().kind) {
        @case ('loading') {
          <div class="loading" data-testid="delivery-loading">
            <app-loading-state
              variant="lines"
              label="Szállítási és fizetési opciók betöltése"
            ></app-loading-state>
          </div>
        }
        @case ('error') {
          <app-error-state
            [title]="'Az opciók nem érhetők el'"
            [message]="errorMessage()"
            [retryLabel]="'Újrapróbálom'"
            [pending]="retrying()"
            (retryRequested)="onRetry()"
          ></app-error-state>
        }
        @case ('ready') {
          <div class="layout" data-testid="delivery-layout">
            <div class="column">
              <fieldset class="options" data-testid="delivery-options">
                <legend class="legend">Szállítási mód</legend>

                <ul class="option-list" role="radiogroup" aria-label="Szállítási mód">
                  @for (option of readyOptions()?.deliveryOptions ?? []; track option.id) {
                    <li
                      class="option"
                      [class.is-active]="option.id === selectedOptionId()"
                      data-testid="delivery-option"
                    >
                      <label class="option-label" [attr.for]="radioId(option.id)">
                        <input
                          type="radio"
                          class="radio"
                          [id]="radioId(option.id)"
                          name="deliveryOption"
                          [value]="option.id"
                          [checked]="option.id === selectedOptionId()"
                          [attr.aria-checked]="option.id === selectedOptionId() ? 'true' : 'false'"
                          [attr.aria-describedby]="optionDescId(option.id)"
                          (change)="onOptionSelected(option.id)"
                          data-testid="delivery-radio"
                        />
                        <span class="option-body">
                          <span class="option-row">
                            <span class="option-title">{{ option.label }}</span>
                            <span class="option-fee">
                              <app-price-block
                                [money]="feeFor(option)"
                                [label]="'Szállítási díj'"
                                [status]="'success'"
                              ></app-price-block>
                            </span>
                          </span>
                          <span class="option-description" [id]="optionDescId(option.id)">
                            {{ option.description }}
                          </span>
                          @if (option.id === selectedOptionId()) {
                            <span
                              class="option-badge"
                              aria-live="polite"
                              data-testid="delivery-selected-badge"
                            >
                              Kiválasztva
                            </span>
                          }
                        </span>
                      </label>
                    </li>
                  }
                </ul>
              </fieldset>

              @if (requiresAddress()) {
                <app-address-form
                  [(postalCode)]="postalCode"
                  [(city)]="city"
                  [(line1)]="line1"
                  [(line2)]="line2"
                  [(submitted)]="addressSubmitted"
                  [(addressChanged)]="addressSnapshot"
                ></app-address-form>
              } @else {
                <p class="pickup-notice" role="note" data-testid="pickup-notice">
                  A virtuális átvétel egy demó szállítási opció: nincs valós
                  üzletcím, a rendelés a pénztár demófolyamatán belül készül,
                  valós átvételi pont nélkül.
                </p>
              }

              <app-payment-method-selector
                [value]="paymentMethod()"
                (valueChange)="onPaymentChanged($event)"
                [pending]="confirmPending()"
                [ready]="canConfirm()"
                (paymentChanged)="onPaymentChanged($event)"
              ></app-payment-method-selector>
            </div>

            <aside class="summary" aria-label="Szállítási és fizetési összegzés" data-testid="delivery-summary">
              <h2 class="summary-title">Szállítás és fizetés összesítése</h2>
              <dl class="summary-rows">
                <div class="summary-row" data-testid="summary-row-fee">
                  <dt>Szállítási díj</dt>
                  <dd>
                    <app-price-block
                      [money]="currentShippingFee()"
                      [label]="'Szállítási díj'"
                      [status]="'success'"
                    ></app-price-block>
                  </dd>
                </div>
                <div class="summary-row" data-testid="summary-row-payment">
                  <dt>Fizetési mód</dt>
                  <dd class="payment-value">{{ paymentLabel() }}</dd>
                </div>
                <div class="summary-row" data-testid="summary-row-fresh">
                  <dt>Új áttekintés szükséges</dt>
                  <dd class="fresh-value">
                    @if (requiresFreshReview()) {
                      <span class="fresh-flag" data-testid="fresh-flag">Igen</span>
                      <span class="fresh-hint">A korábbi ajánlat és fizetési szándék elavult.</span>
                    } @else {
                      <span class="fresh-ok">Nem</span>
                    }
                  </dd>
                </div>
              </dl>

              <div class="actions">
                <app-button
                  variant="secondary"
                  size="comfortable"
                  label="Vissza az adatokhoz"
                  (pressed)="onBack()"
                  data-testid="delivery-back"
                ></app-button>
                <app-button
                  variant="primary"
                  size="comfortable"
                  [label]="confirmLabel()"
                  [loadingLabel]="'Mentés…'"
                  [loading]="confirmPending()"
                  [disabled]="!canConfirm()"
                  (pressed)="onConfirm()"
                  data-testid="delivery-confirm"
                ></app-button>
              </div>
            </aside>
          </div>
        }
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .delivery {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
        color: var(--color-text-primary);
      }

      .heading {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .breadcrumbs {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .breadcrumb {
        color: var(--color-text-secondary);
        text-decoration: none;
      }

      .breadcrumb:hover,
      .breadcrumb:focus-visible {
        text-decoration: underline;
      }

      .breadcrumb.is-current {
        color: var(--color-text-primary);
        font-weight: var(--weight-medium);
      }

      .breadcrumb__sep {
        margin: 0 var(--space-1);
      }

      .title {
        margin: 0;
        font-size: var(--type-page-title-mobile);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      @media (min-width: 640px) {
        .title {
          font-size: var(--type-page-title);
        }
      }

      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 16rem;
      }

      .layout {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }

      .column {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
        min-width: 0;
      }

      .options {
        margin: 0;
        padding: var(--space-5);
        background: var(--color-surface-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
      }

      .legend {
        padding: 0 var(--space-2);
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
      }

      .option-list {
        list-style: none;
        margin: var(--space-3) 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .option {
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
        background: var(--color-surface-section);
        transition: border-color var(--motion-fast) ease, background-color var(--motion-fast) ease;
      }

      .option.is-active {
        border-color: var(--color-brand-ink);
        background: var(--color-brand-accent-soft);
      }

      .option-label {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        padding: var(--space-4);
        cursor: pointer;
        min-height: var(--size-control);
      }

      .radio {
        margin-top: var(--space-1);
        width: 20px;
        height: 20px;
        accent-color: var(--color-brand-ink);
      }

      .radio:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .option-body {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        min-width: 0;
      }

      .option-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }

      .option-title {
        font-size: var(--type-body);
        font-weight: var(--weight-medium);
        color: var(--color-text-primary);
      }

      .option-description {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        line-height: var(--line-height-body);
      }

      .option-badge {
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-badge);
        background: var(--color-brand-accent);
        color: var(--color-text-primary);
        font-size: var(--type-meta);
        font-weight: var(--weight-bold);
      }

      .pickup-notice {
        margin: 0;
        padding: var(--space-4);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
        background: var(--color-surface-section);
        color: var(--color-text-secondary);
        font-size: var(--type-helper);
        line-height: var(--line-height-body);
      }

      .summary {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-5);
        background: var(--color-surface-section);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
      }

      .summary-title {
        margin: 0;
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      .summary-rows {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        margin: 0;
      }

      .summary-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: var(--space-3);
        align-items: baseline;
      }

      .summary-row dt {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .summary-row dd {
        margin: 0;
        font-size: var(--type-body);
        color: var(--color-text-primary);
      }

      .payment-value {
        font-weight: var(--weight-medium);
      }

      .fresh-value {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: var(--space-1);
      }

      .fresh-flag {
        display: inline-flex;
        align-items: center;
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-badge);
        background: var(--color-status-warning);
        color: var(--color-text-inverse);
        font-size: var(--type-meta);
        font-weight: var(--weight-bold);
      }

      .fresh-ok {
        font-size: var(--type-meta);
        color: var(--color-text-secondary);
      }

      .fresh-hint {
        font-size: var(--type-meta);
        color: var(--color-text-secondary);
        max-width: 22ch;
        text-align: right;
      }

      .actions {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      @media (min-width: 640px) {
        .options,
        .summary {
          padding: var(--space-6);
        }

        .actions {
          flex-direction: row;
          justify-content: space-between;
        }
      }

      @media (min-width: 1024px) {
        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: var(--space-6);
          align-items: start;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .option,
        .summary {
          transition: none;
        }
      }
    `,
  ],
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
    if (!optionId) {
      // Pre-existing T19 guard: do not push a snapshot when no selection exists.
      return null as unknown as DeliverySelectionChange;
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
