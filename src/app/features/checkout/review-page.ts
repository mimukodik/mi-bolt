/**
 * FIX-63: `ReviewPage` is the owning container `checkout.routes.ts:231`
 * routes `ellenorzes` to. It owns `CartFacade`, `CheckoutFacade`,
 * `QuoteController`, `OrderSubmission` and the `Router` — the four
 * dependencies `ReviewStep` used to inject itself
 * (`components.md:611-617`) — and renders the `PaymentProgress` /
 * generic-error retry surfaces beside `<app-review-step>`, because the
 * declared `state:ReviewState` input is a plain seven-member string union
 * with no room for the backend `detail` or the `pending`-versus-`declined`
 * distinction those two surfaces need.
 */
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { CartFacade } from '../cart/cart.facade';
import { CheckoutFacade } from './checkout.facade';
import { OrderSubmission } from './order-submission';
import { PaymentProgress, type PaymentProgressTick } from './payment-progress';
import { QuoteController, toReviewState, type ReviewState } from './quote-state';
import { ReviewStep } from './review-step';

import { Button } from '../../shared/ui/button/button';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { StatusMessage } from '../../shared/ui/status-message/status-message';

import type { PaymentStatus } from '../../shared/types/payment-status';

/** Outcome of the last submit attempt that did not produce an order.
 *  Moved up from `ReviewStep` verbatim (FIX-25's shape) — `ReviewState`
 *  cannot carry the backend detail or the `pending`-versus-`declined`
 *  distinction this container's own template still needs. */
type SubmitFailure =
  | { readonly kind: 'declined'; readonly detail: string }
  | { readonly kind: 'pending'; readonly detail: string }
  | { readonly kind: 'error'; readonly detail: string };

@Component({
  selector: 'app-review-page',
  imports: [Button, LoadingState, PaymentProgress, ReviewStep, StatusMessage],
  templateUrl: './review-page.html',
  styleUrl: './review-page.scss',
})
export class ReviewPage {
  /** Not private: the template reads `cartFacade.cart()` /
   *  `checkoutFacade.session()` / `quoteController.quote()` directly. */
  readonly cartFacade = inject(CartFacade);
  readonly checkoutFacade = inject(CheckoutFacade);
  readonly quoteController = inject(QuoteController);
  private readonly router = inject(Router);
  private readonly orderSubmission = inject(OrderSubmission);
  private readonly destroyRef = inject(DestroyRef);

  /** True while a network mutation (quote / payment intent / order)
   *  is in flight. */
  readonly submitting = signal<boolean>(false);

  /** Null until a submit attempt fails; cleared by the next attempt
   *  and by a quote refresh. */
  readonly submitFailure = signal<SubmitFailure | null>(null);

  /** Most recent progress tick from `OrderSubmission.watchProgress()`;
   *  cleared at the start of every submission attempt. This container
   *  is `OrderSubmission`'s orchestrator (`components.md:632`): it
   *  polls the submission service and maps each tick onto
   *  `PaymentProgress`'s declared inputs, so that component never
   *  subscribes to the service itself. */
  private readonly latestTick = signal<PaymentProgressTick | null>(null);

  readonly paymentStatus = computed<PaymentStatus>(() => {
    const tick = this.latestTick();
    if (tick !== null) {
      switch (tick.state) {
        case 'pending':
        case 'attempt':
          return 'pending';
        case 'succeeded':
          return 'succeeded';
        case 'declined':
          return 'declined';
        case 'timeout':
          return 'unknown';
      }
    }
    const failure = this.submitFailure();
    if (failure === null) return 'idle';
    if (failure.kind === 'declined') return 'declined';
    if (failure.kind === 'pending') return 'unknown';
    return 'error';
  });

  readonly pollCount = computed<number>(() => this.latestTick()?.attempt ?? 0);

  readonly reviewState = computed<ReviewState>(() =>
    toReviewState(
      this.quoteController.state(),
      this.submitting(),
      this.submitFailure()?.kind === 'pending',
    ),
  );

  /** Rendered when the last submit attempt did not produce an order.
   *  Moved up from `ReviewStep` verbatim. */
  readonly submitFailureMessage = computed<string>(() => {
    const failure = this.submitFailure();
    if (failure === null) return '';
    const preserved = 'A kosarad és az adataid megmaradtak.';
    switch (failure.kind) {
      case 'declined':
        return `A szimulált fizetés elutasítva. ${preserved} Próbáld újra, vagy módosítsd a fizetési módot.`;
      case 'pending':
        return 'A demórendelés feldolgozás alatt… Az eredmény még nem ismert, ezért nem tekintjük elutasítottnak. Nem küldünk újabb rendelést ismételt kattintásra.';
      case 'error':
        return `${failure.detail} ${preserved} Próbáld újra, vagy módosítsd a fizetési módot.`;
    }
  });

  constructor() {
    // Drop the active quote whenever the user edits an earlier
    // step — the next refresh() must produce a fresh quoteId.
    this.quoteController.syncFromFacade();

    // Trigger a fresh quote whenever the page mounts and there is
    // no quote yet. The guard avoids a duplicate request after the
    // sync above already populated the state.
    effect(() => {
      const state = this.quoteController.state();
      if (state.kind === 'idle') {
        void this.quoteController.refresh();
      }
    });

    const stopWatching = this.orderSubmission.watchProgress((tick) => {
      this.latestTick.set(tick);
    });
    this.destroyRef.onDestroy(stopWatching);
  }

  onEditRequested(): void {
    this.quoteController.invalidate();
  }

  onRefreshQuote(): void {
    this.submitFailure.set(null);
    void this.quoteController.refresh();
  }

  async onSubmitRequested(): Promise<void> {
    await this.runSubmission();
  }

  /** Bound to `PaymentProgress`'s `(retryRequested)` from the
   *  declined / unknown states, and to the generic-error retry
   *  button. Runs the same submission again without `canSubmit()`'s
   *  gate — that gate refuses a retry while the outcome is `pending`,
   *  which is exactly the state this control exists to recover from.
   *  `CheckoutFacade`'s held idempotency key (per-fingerprint) is what
   *  makes this a true replay rather than a new request. */
  async onPaymentRetry(): Promise<void> {
    await this.runSubmission();
  }

  /** Bound to `PaymentProgress`'s `(changeMethodRequested)` and to the
   *  generic-error "Fizetési mód módosítása" button. */
  onPaymentChangeMethod(): void {
    void this.router.navigate(['/penztar/szallitas']);
  }

  /** Orchestrates one submission attempt through `OrderSubmission`
   *  and branches on the five `SubmitOutcome` kinds. */
  private async runSubmission(): Promise<void> {
    this.submitFailure.set(null);
    this.latestTick.set(null);
    this.submitting.set(true);
    try {
      const outcome = await this.orderSubmission.submitOrder();
      switch (outcome.kind) {
        case 'committed':
        case 'recovered':
          await this.router.navigate(['/penztar/siker', outcome.orderId]);
          return;
        case 'declined':
          this.submitFailure.set({ kind: 'declined', detail: outcome.reason });
          return;
        case 'pending-timeout':
          this.submitFailure.set({ kind: 'pending', detail: '' });
          return;
        case 'unknown':
          this.submitFailure.set({ kind: 'error', detail: outcome.reason });
          return;
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
