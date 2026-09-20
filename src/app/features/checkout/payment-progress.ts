/**
 * T23 — payment intent polling progress + deterministic clock.
 *
 * Owns the view-model that the review page renders while the order
 * submission polls `GET /payment-intents/{id}` for a terminal status.
 *
 *   - `FakeClock` is a deterministic clock used by tests AND by the
 *     service so the polling interval (`1000 ms`) and the max attempt
 *     count (`10`) are both reproducible. Production code does not
 *     bind it; the default `RealClock` is used.
 *   - `PaymentProgressTick` is the immutable record the service emits
 *     for every state change (`pending`, `attempt`, `succeeded`,
 *     `declined`, `timeout`).
 *   - `PaymentProgress` is the standalone component the review page
 *     hosts. It declares the `status`/`pollCount` inputs and the
 *     `retryRequested`/`changeMethodRequested` outputs
 *     `docs/spec/components.md:626-635` fixes; it does NOT inject
 *     `OrderSubmission` or issue any wire request itself — the
 *     orchestrator (the review step) polls the submission service and
 *     maps each tick onto the two inputs (`components.md:632`:
 *     "limit polling in orchestrator, never in template").
 *
 * Determinism rule: every tick carries the 1-indexed attempt number,
 * so a test can drive the fake clock once per attempt and assert on
 * the emitted tick sequence exactly. The clock API is minimal on
 * purpose: it mirrors `setTimeout` + `clearTimeout` so production can
 * swap the real browser timers in without a wrapper layer.
 */

import { Component, Service, computed, input, output, type Signal } from '@angular/core';

import type { PaymentStatus } from '../../shared/types/payment-status';
import { Button } from '../../shared/ui/button/button';

// ---------------------------------------------------------------------------
// Deterministic clock — injectable so tests advance time without
// burning real wall-clock seconds.
// ---------------------------------------------------------------------------

/**
Minimal setTimeout-shaped interface used by `OrderSubmission`.
*/
export interface FakeClockLike {
  /**
  Returns the current ISO timestamp; only used for log redaction.
  */
  nowIso(): string;
  /**
  Schedules `handler` after `delayMs`. Returns an opaque handle.
  */
  setTimeoutFn(handler: () => void, delayMs: number): number;
  /**
  Cancels a scheduled handler. No-op if the handle is unknown.
  */
  clearTimeoutFn(handle: number): void;
}

/**
Test helper: synchronously fire every scheduled callback once.
*/
export interface FakeClock extends FakeClockLike {
  /**
  Run every queued handler exactly once, in insertion order.
  */
  fire(): void;
  /**
  Number of handlers still queued.
  */
  pending(): number;
}

/**
Production clock backed by `setTimeout` / `clearTimeout`.
*/
export class RealClock implements FakeClockLike {
  nowIso(): string {
    return new Date().toISOString();
  }
  setTimeoutFn(handler: () => void, delayMs: number): number {
    return window.setTimeout(handler, delayMs);
  }
  clearTimeoutFn(handle: number): void {
    globalThis.clearTimeout(handle);
  }
}

// ---------------------------------------------------------------------------
// Polling constants — the polling interval and attempt cap that drive
// T23-AC02 are pinned here so the spec and the implementation can both
// reference a single source of truth.
// ---------------------------------------------------------------------------

/**
Polling interval for `GET /payment-intents/{id}` per T23-AC02.
*/
export const PAYMENT_POLL_INTERVAL_MS = 1000;

/**
Maximum number of polling attempts per T23-AC02 (deterministic cap).
*/
export const PAYMENT_POLL_MAX_ATTEMPTS = 10;

// ---------------------------------------------------------------------------
// Tick shape — emitted by `OrderSubmission.watchProgress()`.
// ---------------------------------------------------------------------------

/**
Discrete payment-intent state changes observed by the UI.
*/
export type PaymentProgressState =
  /**
  Service started polling; first attempt scheduled.
  */
  | 'pending'
  /**
  Polling attempt N (1-indexed) is about to run.
  */
  | 'attempt'
  /**
  Intent became succeeded and the order was committed.
  */
  | 'succeeded'
  /**
  Intent became declined; review stays open with retry affordances.
  */
  | 'declined'
  /**
  Max attempts reached without a terminal status — recoverable.
  */
  | 'timeout';

export interface PaymentProgressTick {
  /**
  Stable kind for the emitted tick.
  */
  readonly state: PaymentProgressState;
  /**
  Payment intent id, when known.
  */
  readonly intentId: string | null;
  /**
  Current attempt (1-indexed) when the tick was emitted.
  */
  readonly attempt: number;
  /**
  Terminal outcome carried by `succeeded` / `declined` ticks.
  */
  readonly outcome: SubmitOutcomeSnapshot;
}

/**
 * Frozen view of the latest `SubmitOutcome` the service produced.
 * Kept separate from the `OrderSubmission` module so the view layer
 * can import the tick type without dragging in the service surface.
 */
export interface SubmitOutcomeSnapshot {
  readonly kind: 'committed' | 'declined' | 'pending-timeout' | 'unknown' | 'recovered' | 'idle';
  readonly orderId?: string;
  readonly orderNumber?: string;
  readonly safeKey?: string;
  readonly reason?: string;
  readonly attempt?: number;
}

// ---------------------------------------------------------------------------
// PaymentProgress — standalone component that observes the submission
// service and renders the spinner + attempt counter.
// ---------------------------------------------------------------------------

/**
 * Renders the pending-payment UX. `components.md:626-635`'s declared
 * surface: `status` and `pollCount` are the two signal inputs;
 * `retryRequested` / `changeMethodRequested` are the two outputs. The
 * orchestrator (the review step) owns polling `OrderSubmission` and
 * mapping each tick onto these two inputs — this component issues no
 * wire request and holds no reference to the submission service.
 */
@Component({
  selector: 'app-payment-progress',
  imports: [Button],
  templateUrl: './payment-progress.html',
  styleUrl: './payment-progress.scss',
})
export class PaymentProgress {
  readonly status = input.required<PaymentStatus>();
  readonly pollCount = input.required<number>();

  readonly retryRequested = output();
  readonly changeMethodRequested = output();

  readonly maxAttempts: Signal<number> = computed(() => PAYMENT_POLL_MAX_ATTEMPTS);

  /**
  Heading copy that follows the current status.
  */
  readonly heading: Signal<string> = computed(() => {
    switch (this.status()) {
      case 'pending': {
        return 'Fizetési szándék ellenőrzése';
      }
      case 'succeeded': {
        return 'Fizetés sikeres';
      }
      case 'declined': {
        return 'Fizetés elutasítva';
      }
      case 'unknown': {
        return 'Időtúllépés';
      }
      case 'error': {
        return 'A rendelés leadása nem sikerült';
      }
      default: {
        return '';
      }
    }
  });

  /**
  Attempt counter copy, e.g. "3 / 10".
  */
  readonly attemptLabel: Signal<string> = computed(() => {
    const a = this.pollCount();
    const max = this.maxAttempts();
    return `${String(a)} / ${String(max)}`;
  });

  onRetry(): void {
    this.retryRequested.emit();
  }

  onChangeMethod(): void {
    this.changeMethodRequested.emit();
  }
}

// ---------------------------------------------------------------------------
// Service token — exposes the small surface that production code AND
// tests both need from `payment-progress.ts` without re-importing the
// service module just to read these constants.
// ---------------------------------------------------------------------------

/**
 * Service token exported for tests that need to assert on the polling
 * constants without re-importing the constant surface. Production
 * code never reads these directly; it reads through `OrderSubmission`.
 */
@Service()
export class PaymentProgressConfig {
  readonly intervalMs = PAYMENT_POLL_INTERVAL_MS;
  readonly maxAttempts = PAYMENT_POLL_MAX_ATTEMPTS;
}
