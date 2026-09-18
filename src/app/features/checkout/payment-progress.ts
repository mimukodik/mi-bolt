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
 *     hosts. It reads from the parent-owned `OrderSubmission`
 *     instance via DI; it does NOT issue any wire request itself.
 *
 * Determinism rule: every tick carries the 1-indexed attempt number,
 * so a test can drive the fake clock once per attempt and assert on
 * the emitted tick sequence exactly. The clock API is minimal on
 * purpose: it mirrors `setTimeout` + `clearTimeout` so production can
 * swap the real browser timers in without a wrapper layer.
 */

import {
  ChangeDetectionStrategy,
  Component,
  Service,
  computed,
  inject,
  input,
  signal,
  type OnDestroy,
  type Signal,
  type WritableSignal,
} from '@angular/core';

import { OrderSubmission } from './order-submission';

// ---------------------------------------------------------------------------
// Deterministic clock — injectable so tests advance time without
// burning real wall-clock seconds.
// ---------------------------------------------------------------------------

/** Minimal setTimeout-shaped interface used by `OrderSubmission`. */
export interface FakeClockLike {
  /** Returns the current ISO timestamp; only used for log redaction. */
  nowIso(): string;
  /** Schedules `handler` after `delayMs`. Returns an opaque handle. */
  setTimeoutFn(handler: () => void, delayMs: number): number;
  /** Cancels a scheduled handler. No-op if the handle is unknown. */
  clearTimeoutFn(handle: number): void;
}

/** Test helper: synchronously fire every scheduled callback once. */
export interface FakeClock extends FakeClockLike {
  /** Run every queued handler exactly once, in insertion order. */
  fire(): void;
  /** Number of handlers still queued. */
  pending(): number;
}

/** Production clock backed by `setTimeout` / `clearTimeout`. */
export class RealClock implements FakeClockLike {
  nowIso(): string {
    return new Date().toISOString();
  }
  setTimeoutFn(handler: () => void, delayMs: number): number {
    return window.setTimeout(handler, delayMs);
  }
  clearTimeoutFn(handle: number): void {
    window.clearTimeout(handle);
  }
}

// ---------------------------------------------------------------------------
// Polling constants — the polling interval and attempt cap that drive
// T23-AC02 are pinned here so the spec and the implementation can both
// reference a single source of truth.
// ---------------------------------------------------------------------------

/** Polling interval for `GET /payment-intents/{id}` per T23-AC02. */
export const PAYMENT_POLL_INTERVAL_MS = 1000;

/** Maximum number of polling attempts per T23-AC02 (deterministic cap). */
export const PAYMENT_POLL_MAX_ATTEMPTS = 10;

// ---------------------------------------------------------------------------
// Tick shape — emitted by `OrderSubmission.watchProgress()`.
// ---------------------------------------------------------------------------

/** Discrete payment-intent state changes observed by the UI. */
export type PaymentProgressState =
  /** Service started polling; first attempt scheduled. */
  | 'pending'
  /** Polling attempt N (1-indexed) is about to run. */
  | 'attempt'
  /** Intent became succeeded and the order was committed. */
  | 'succeeded'
  /** Intent became declined; review stays open with retry affordances. */
  | 'declined'
  /** Max attempts reached without a terminal status — recoverable. */
  | 'timeout';

export interface PaymentProgressTick {
  /** Stable kind for the emitted tick. */
  readonly state: PaymentProgressState;
  /** Payment intent id, when known. */
  readonly intentId: string | null;
  /** Current attempt (1-indexed) when the tick was emitted. */
  readonly attempt: number;
  /** Terminal outcome carried by `succeeded` / `declined` ticks. */
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
 * Renders the pending-payment UX while `OrderSubmission` is polling.
 * The component is intentionally tiny: it reads from the service and
 * renders. No side effects, no network, no form binding.
 */
@Component({
  selector: 'app-payment-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payment-progress.html',
  styleUrl: './payment-progress.scss',
})
export class PaymentProgress implements OnDestroy {
  private readonly submission = inject(OrderSubmission);

  /** Optional override for the max attempts; defaults to the constant. */
  readonly maxAttemptsOverride = input<number | null>(null);

  /** The current tick rendered by the template. */
  private readonly currentTick: WritableSignal<PaymentProgressTick | null> = signal(null);
  readonly tick: Signal<PaymentProgressTick | null> = this.currentTick.asReadonly();

  /** Discrete view state derived from the tick. */
  readonly state: Signal<PaymentProgressState | null> = computed(
    () => this.currentTick()?.state ?? null,
  );

  /** 1-indexed attempt number. 0 before the first poll. */
  readonly attempt: Signal<number> = computed(() => this.currentTick()?.attempt ?? 0);

  /** Max attempts, exposed via signal input. */
  readonly maxAttempts: Signal<number> = computed(
    () => this.maxAttemptsOverride() ?? PAYMENT_POLL_MAX_ATTEMPTS,
  );

  /** Heading copy that follows the tick state. */
  readonly heading: Signal<string> = computed(() => {
    switch (this.state()) {
      case 'pending':
        return 'Fizetési szándék ellenőrzése';
      case 'attempt':
        return 'Várakozás a fizetési szolgáltató válaszára';
      case 'succeeded':
        return 'Fizetés sikeres';
      case 'declined':
        return 'Fizetés elutasítva';
      case 'timeout':
        return 'Időtúllépés';
      default:
        return '';
    }
  });

  /** Attempt counter copy, e.g. "3 / 10". */
  readonly attemptLabel: Signal<string> = computed(() => {
    const a = this.attempt();
    const max = this.maxAttempts();
    return `${String(a)} / ${String(max)}`;
  });

  private stopWatching: (() => void) | null = null;

  constructor() {
    this.stopWatching = this.submission.watchProgress((tick) => {
      this.currentTick.set(tick);
    });
  }

  ngOnDestroy(): void {
    this.stopWatching?.();
    this.stopWatching = null;
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
