/**
 * T23 — payment intent progress view-model (2.0.0).
 *
 * Renders the pending-payment UX for the review step on the 2.0.0
 * contract: the SPA is destroyed by the redirect (§8.3 of the
 * payment spec), so there is no `pollCount` to display and no clock
 * to drive. The component keeps the five `PaymentStatus` states and
 * the two outputs `payment-progress.spec.ts` cases 4-6 pin; the poll
 * loop, the fake clock and the progress stream are gone with the
 * contract that needed them.
 */

import { Component, computed, input, output, type Signal } from '@angular/core';

import type { PaymentStatus } from '../../shared/types/payment-status';
import { Button } from '../../shared/ui/button/button';

/**
 * Renders the pending-payment UX. `status` is the single signal input;
 * `retryRequested` / `changeMethodRequested` are the two outputs. The
 * orchestrator (the review step) maps `OrderSubmission.lastOutcome()`
 * onto `status` and binds the two outputs to its handlers; this
 * component issues no wire request and holds no reference to the
 * submission service.
 */
@Component({
  selector: 'app-payment-progress',
  imports: [Button],
  templateUrl: './payment-progress.html',
  styleUrl: './payment-progress.scss',
})
export class PaymentProgress {
  readonly status = input.required<PaymentStatus>();

  readonly retryRequested = output();
  readonly changeMethodRequested = output();

  /** Heading copy that follows the current status. */
  readonly heading: Signal<string> = computed(() => {
    switch (this.status()) {
      case 'pending':
        return 'Fizetési szándék ellenőrzése';
      case 'succeeded':
        return 'Fizetés sikeres';
      case 'declined':
        return 'Fizetés elutasítva';
      case 'unknown':
        return 'Időtúllépés';
      case 'error':
        return 'A rendelés leadása nem sikerült';
      default:
        return '';
    }
  });

  onRetry(): void {
    this.retryRequested.emit();
  }

  onChangeMethod(): void {
    this.changeMethodRequested.emit();
  }
}
