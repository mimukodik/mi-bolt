/**
 * FIX-56: `DeliveryPage` is the owning container `checkout.routes.ts:220`
 * routes `szallitas` to. It fetches `CheckoutOptions`, owns the load and
 * save state machines, and performs the two facade saves plus the
 * navigation `DeliveryStep.onConfirm()` used to do itself before this
 * task moved that responsibility up here (`components.md:566-576`).
 *
 * The failure detail from a rejected save is rendered here rather than
 * in `DeliveryStep`, because the contract's `saveState` is a plain
 * `AsyncStatus` with no room for a message — the same shape `FIX-63`
 * resolves for `ReviewPage`'s `SubmitFailure`.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../api/generated/api';
import { ApiConfiguration as ApiConfig } from '../../api/generated/api-configuration';
import * as operations from '../../api/generated/functions';

import { CheckoutFacade, type CheckoutError } from './checkout.facade';
import { DeliveryStep } from './delivery-step';

import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { StatusMessage } from '../../shared/ui/status-message/status-message';

import type { AsyncStatus } from '../../shared/types/async-status';
import type { CheckoutOptions } from '../../api/generated/models/checkout-options';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; detail: string }
  | { kind: 'ready'; options: CheckoutOptions };

@Component({
  selector: 'app-delivery-page',
  imports: [DeliveryStep, ErrorState, LoadingState, StatusMessage],
  templateUrl: './delivery-page.html',
  styleUrl: './delivery-page.scss',
})
export class DeliveryPage {
  private readonly http = inject(HttpClient);
  /**
  Not private: the template binds `[fields]="checkoutFacade.form"`.
  */
  readonly checkoutFacade = inject(CheckoutFacade);
  private readonly router = inject(Router);
  private readonly api: Api;

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
   *  FIX-25/FIX-44 use for the identical situation, so the two
   *  checkout screens do not speak differently. */
  readonly saveFailureMessage = computed<string>(() => {
    const failure = this.saveFailure();
    if (failure === null) return '';
    return failure.detail === ''
      ? 'A kosarad és az adataid megmaradtak. Próbáld újra.'
      : `${failure.detail} A kosarad és az adataid megmaradtak. Próbáld újra.`;
  });

  constructor() {
    // The generated `Api` class relies on Angular decorator metadata
    // for constructor injection. The vitest esbuild pipeline strips
    // that metadata, so we wire it manually from `HttpClient` and
    // `ApiConfiguration`. The same `new Api(...)` call sees the live
    // HttpClient in the browser.
    this.api = new Api(inject(ApiConfig), this.http);
    void this.loadOptions();
  }

  async loadOptions(): Promise<void> {
    try {
      const response = await firstValueFrom(this.api.invoke(operations.getCheckoutOptions, {}));
      // Never silently pick a default option: the radio list iterates
      // over the wire response so the user sees ONLY what the server
      // told them is available.
      this.state.set({ kind: 'ready', options: response });
    } catch {
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
    void this.loadOptions().finally(() => {
      this.retrying.set(false);
    });
  }

  /** Handles `DeliveryStep`'s `(retryOptions)`: re-runs the options
   *  fetch, and clears a stale save failure so the user returns to a
   *  clean ready state to try again. */
  onRetryOptions(): void {
    this.saveState.set('idle');
    this.saveFailure.set(null);
    void this.loadOptions();
  }

  /** Handles `DeliveryStep`'s `(continueRequested)`: the two facade
   *  saves and the navigation `onConfirm()`'s tail used to do itself. */
  async onContinueRequested(): Promise<void> {
    this.saveState.set('loading');
    this.saveFailure.set(null);
    try {
      const deliveryResult = await this.checkoutFacade.saveDeliverySection();
      if (!deliveryResult.ok) {
        this.saveFailure.set(deliveryResult.error);
        this.saveState.set('error');
        return;
      }
      const paymentResult = await this.checkoutFacade.savePaymentMethod();
      if (!paymentResult.ok) {
        this.saveFailure.set(paymentResult.error);
        this.saveState.set('error');
        return;
      }
      await this.router.navigate(['/penztar/ellenorzes']);
    } finally {
      if (this.saveFailure() === null) {
        this.saveState.set('idle');
      }
    }
  }
}
