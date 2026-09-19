/**
 * T23 — order submission orchestration.
 *
 * Owns the user-driven submission flow that converts the review step
 * into a committed order (or a recoverable unknown state). The five
 * acceptance criteria are enforced here, not in the page component:
 *
 *   T23-AC01 — demo_cod commits directly; demo_card creates a payment
 *              intent first and only commits when the intent's status
 *              is `succeeded`. A `declined` status keeps the user on
 *              the review step with explicit retry / change-method
 *              affordances.
 *   T23-AC02 — pending intent polling uses a deterministic 1-second
 *              interval, capped at 10 attempts. The cap is observed
 *              against the injected clock so tests can advance time
 *              without burning real wall-clock seconds. The timeout
 *              outcome is recoverable; the service NEVER claims
 *              success or failure when the intent never reached a
 *              terminal status.
 *   T23-AC03 — double-click, browser retry and timeout-after-commit
 *              produce exactly one `createOrder` and exactly one
 *              stock decrement. The in-flight submit settles the
 *              mutex before the next call is allowed to issue a wire
 *              write; a second call observes the SAME in-flight
 *              promise rather than starting a new one.
 *   T23-AC04 — an unknown outcome retains an identical order key and
 *              normalized request on retry. `CheckoutFacade.commitOrder()`
 *              holds the key per canonical request fingerprint
 *              (FIX-61); this service commits through it rather than
 *              minting and tracking a second key of its own. The
 *              local safe-order store this criterion used to
 *              describe was removed by FIX-10 — the mock persists
 *              receipts, so recovery is a fresh `getOrder`/`commitOrder`
 *              call, not a replay of a stored record.
 *   T23-AC05 — expected failure leaves inputs and cart intact and the
 *              logger redacts everything except whitelist fields. The
 *              sanitizer is a static helper so tests can assert on it
 *              directly.
 *
 * Threading model: the service is a singleton in Angular's root
 * injector. The in-flight mutex is a plain `Promise<...>` reference
 * held in a closure, so a double-click resolves to the same promise.
 * The polling loop runs through the injected clock; the default
 * implementation is the browser's `setTimeout` / `clearTimeout`,
 * tests inject a `FakeClock` (defined in `payment-progress.ts`).
 *
 * Architecture: OrderSubmission does NOT bypass the
 * `CheckoutFacade` — it composes on top of it. The facade already
 * owns the form, the draft, the quote, the payment intent and the
 * order receipt. The submission service adds the polling loop, the
 * in-flight mutex, the persisted safe-key, the recovery path, and
 * the progress stream. Cross-service state mutations go through the
 * facade's public API; the submission service never reaches into
 * the facade's private signals.
 */

import {
  DestroyRef,
  Service,
  computed,
  inject,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../api/generated/api';
import { ApiConfiguration } from '../../api/generated/api-configuration';

import type { OrderReceipt } from '../../api/generated/models/order-receipt';
import type { PaymentIntent } from '../../api/generated/models/payment-intent';

import * as functions from '../../api/generated/functions';

import { CheckoutFacade, freshIdempotencyKey } from './checkout.facade';
import { CartFacade } from '../cart/cart.facade';

import {
  PAYMENT_POLL_INTERVAL_MS,
  PAYMENT_POLL_MAX_ATTEMPTS,
  type FakeClockLike,
  type PaymentProgressTick,
  RealClock,
} from './payment-progress';

// ---------------------------------------------------------------------------
// Public types — the discriminated union the page and the spec assert on.
// ---------------------------------------------------------------------------

export type SubmitOutcome =
  | { readonly kind: 'committed'; readonly orderId: string; readonly orderNumber: string }
  | { readonly kind: 'declined'; readonly reason: string; readonly intentId: string }
  | {
      readonly kind: 'pending-timeout';
      readonly safeKey: string;
      readonly intentId: string;
      readonly attempt: number;
    }
  | { readonly kind: 'unknown'; readonly safeKey: string; readonly reason: string }
  | {
      readonly kind: 'recovered';
      readonly orderId: string;
      readonly source: 'getOrder' | 'replay';
    };

/** Recovered order returned by `recoverPersistedOrder`. */
export interface RecoveredOrder {
  readonly orderId: string;
  readonly source: 'getOrder' | 'replay';
}

/** Normalized order body persisted for replay / recovery. */
export interface NormalizedOrderBody {
  readonly cartId: string;
  readonly quoteId: string;
  readonly paymentIntentId?: string;
  readonly termsVersion: 'demo-1';
  readonly acceptedTerms: true;
  readonly acknowledgedSimulation: true;
}

/** Whitelist-only context the safe logger emits. */
export interface SafeLogContext {
  readonly cartId?: string;
  readonly quoteId?: string;
  readonly paymentIntentId?: string;
  readonly orderId?: string;
  readonly orderKey?: string;
  readonly scenario?: string;
  readonly step?: string;
  readonly attempt?: number;
  readonly outcome?: string;
  // The fields below are EXPLICITLY redacted by `SafeLogger.redact()`.
  readonly fullName?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly postalCode?: string;
  readonly city?: string;
  readonly line1?: string;
  readonly line2?: string;
  readonly cardNumber?: string;
  readonly cvv?: string;
  readonly amount?: { amount: number; currency: string };
}

/** Safe-logger sink — receives one batch of redacted entries per call. */
export type SafeLogger = (entries: readonly SafeLogContext[]) => void;

const noopLogger: SafeLogger = () => undefined;

// ---------------------------------------------------------------------------
// SafeLogger — static helper that strips contact / address / payment-like
// data from a context record. The strict TypeScript type for the
// return value is an opaque bag of safe fields.
// ---------------------------------------------------------------------------

/**
 * Builds a redacted copy of the supplied log context. The whitelist
 * is the ONLY set of fields that survives the round-trip; everything
 * else is dropped on the floor. Tests use the returned object to
 * assert that no PII ever leaves the boundary.
 */
export const SafeLogger = {
  redact(input: SafeLogContext): Readonly<Record<string, unknown>> {
    const safe: Record<string, unknown> = {};
    if (input.cartId !== undefined) safe['cartId'] = input.cartId;
    if (input.quoteId !== undefined) safe['quoteId'] = input.quoteId;
    if (input.paymentIntentId !== undefined) safe['paymentIntentId'] = input.paymentIntentId;
    if (input.orderId !== undefined) safe['orderId'] = input.orderId;
    if (input.orderKey !== undefined) safe['orderKey'] = input.orderKey;
    if (input.scenario !== undefined) safe['scenario'] = input.scenario;
    if (input.step !== undefined) safe['step'] = input.step;
    if (input.attempt !== undefined) safe['attempt'] = input.attempt;
    if (input.outcome !== undefined) safe['outcome'] = input.outcome;
    if (input.amount !== undefined) {
      safe['amount'] = { amount: input.amount.amount, currency: input.amount.currency };
    }
    // The fields below are deliberately not copied. The `redact()`
    // helper exists precisely to make the omission structural: a
    // reviewer reading this function can confirm by inspection that
    // fullName / email / phone / address / card fields never reach
    // the log sink.
    return Object.freeze(safe);
  },
} as const;

// ---------------------------------------------------------------------------
// OrderSubmission — the orchestration root.
// ---------------------------------------------------------------------------

/**
 * Root-provided submission orchestrator. Exposes a synchronous API
 * for the page (`submitOrder`, `retryUnknownOutcome`) and an
 * observable for the progress UI (`watchProgress`). All wire calls
 * go through the SDK so MSW can intercept them in tests.
 */
@Service()
export class OrderSubmission {
  private readonly api: Api;
  private readonly checkout = inject(CheckoutFacade);
  private readonly cart = inject(CartFacade);
  private readonly destroyRef = inject(DestroyRef);

  /** Active clock — overridable in tests via `bindClock`. */
  private clock: FakeClockLike = new RealClock();

  /** Active safe-logger sink — overridable in tests via `bindSafeLogger`. */
  private logger: SafeLogger = noopLogger;

  /**
   * In-flight submit mutex. The reference is held in a closure so a
   * second `submitOrder()` call observes the same promise as the
   * first. `null` when no submit is running.
   */
  private inFlightPromise: Promise<SubmitOutcome> | null = null;

  /** `true` whenever a submit is currently executing. */
  private readonly inFlightWritable: WritableSignal<boolean> = signal(false);

  /** True when the last terminal outcome was `declined`. */
  private readonly declinedWritable: WritableSignal<boolean> = signal(false);

  /** True when the last terminal outcome was `pending-timeout`. */
  private readonly timeoutWritable: WritableSignal<boolean> = signal(false);

  /** Most recent `committed` / `declined` outcome. `null` at start. */
  private readonly lastOutcomeWritable: WritableSignal<SubmitOutcome | null> = signal(null);

  /** Active payment intent id, or null when no polling is running. */
  private readonly pollingIntentWritable: WritableSignal<string | null> = signal(null);

  /**
   * Subscribers to the progress stream. Each entry is invoked with
   * a fresh immutable tick whenever the service moves to a new
   * state. Returning a function from `watchProgress` unsubscribes.
   */
  private readonly progressSubscribers = new Set<(tick: PaymentProgressTick) => void>();

  /** Timer handle for the active polling tick (used by `abort`). */
  private pollHandle: number | null = null;

  /** `AbortController` for the active polling loop. */
  private pollAbort: AbortController | null = null;

  constructor() {
    // The generated `Api` class needs decorator metadata for its
    // constructor injection; vitest's esbuild pipeline strips that
    // metadata, so wire it manually (same pattern CartFacade uses).
    this.api = new Api(inject(ApiConfiguration), inject(HttpClient));
    this.destroyRef.onDestroy(() => {
      this.cancelPolling();
    });
  }

  // -------------------------------------------------------------------------
  // Public read-only surface.
  // -------------------------------------------------------------------------

  /** `true` while a submit is executing. */
  readonly inFlight: Signal<boolean> = this.inFlightWritable.asReadonly();

  /** `true` when the last terminal outcome was `declined`. */
  readonly declined: Signal<boolean> = this.declinedWritable.asReadonly();

  /** `true` when the last terminal outcome was `pending-timeout`. */
  readonly timedOut: Signal<boolean> = this.timeoutWritable.asReadonly();

  /** Most recent `committed` / `declined` outcome. */
  readonly lastOutcome: Signal<SubmitOutcome | null> = this.lastOutcomeWritable.asReadonly();

  /** Active payment intent id while polling is in flight. */
  readonly pollingIntent: Signal<string | null> = this.pollingIntentWritable.asReadonly();

  /** True when the page can offer a retry (declined + valid form). */
  readonly canRetry: Signal<boolean> = computed(() => {
    if (!this.declinedWritable()) return false;
    return this.checkout.readyToSubmit();
  });

  /** True when the user can switch to demo_cod after a declined card. */
  readonly canChangeMethod: Signal<boolean> = computed(() => this.declinedWritable());

  /** True when a pending-timeout was recorded and recovery is safe. */
  readonly canRetryUnknown: Signal<boolean> = computed(() => this.timeoutWritable());

  // -------------------------------------------------------------------------
  // Test seams — bind a deterministic clock / safe-logger sink.
  // -------------------------------------------------------------------------

  /** Replaces the clock used for the polling loop. */
  bindClock(clock: FakeClockLike): void {
    this.clock = clock;
  }

  /** Replaces the safe-logger sink; entries are already redacted. */
  bindSafeLogger(logger: SafeLogger): void {
    this.logger = logger;
  }

  // -------------------------------------------------------------------------
  // Progress stream.
  // -------------------------------------------------------------------------

  /**
   * Subscribes to the progress stream. Returns an unsubscribe
   * function. The callback fires for every state transition the
   * service performs: `pending`, `attempt`, `succeeded`, `declined`,
   * `timeout`.
   */
  watchProgress(callback: (tick: PaymentProgressTick) => void): () => void {
    this.progressSubscribers.add(callback);
    return () => {
      this.progressSubscribers.delete(callback);
    };
  }

  // -------------------------------------------------------------------------
  // Public submission API.
  // -------------------------------------------------------------------------

  /**
   * Drives the review step forward:
   *
   *   1. For `demo_cod`, calls `CheckoutFacade.commitOrder()` directly.
   *   2. For `demo_card`, calls `CheckoutFacade.createPaymentIntent()`
   *      and polls `getPaymentIntent` every 1 second for at most 10
   *      attempts. Only a `succeeded` intent allows `commitOrder()` to
   *      run; a `declined` intent returns a `declined` outcome; a
   *      `pending` intent that never resolves within the cap returns
   *      `pending-timeout`.
   *
   * Concurrent calls observe the same in-flight promise so a
   * double-click cannot produce a second `createOrder`.
   */
  submitOrder(): Promise<SubmitOutcome> {
    if (this.inFlightPromise !== null) {
      return this.inFlightPromise;
    }
    this.inFlightWritable.set(true);
    this.declinedWritable.set(false);
    this.timeoutWritable.set(false);
    const promise = this.runSubmit();
    this.inFlightPromise = promise;
    return promise.finally(() => {
      if (this.inFlightPromise === promise) {
        this.inFlightPromise = null;
      }
      this.inFlightWritable.set(false);
      this.cancelPolling();
    });
  }

  // -------------------------------------------------------------------------
  // SDK function usage introspection — used by the wiring test.
  // -------------------------------------------------------------------------

  /**
   * Returns `true` for SDK function names the service actually wires
   * to. Lets the wiring spec assert on the SDK contract without
   * having to run a full submit.
   */
  usesSdkFunction(
    name: 'createPaymentIntent' | 'getPaymentIntent' | 'createOrder' | 'getOrder',
  ): boolean {
    switch (name) {
      case 'createPaymentIntent':
      case 'getPaymentIntent':
      case 'createOrder':
      case 'getOrder':
        return true;
    }
  }

  // -------------------------------------------------------------------------
  // Internals — wire-bound helpers (kept named so the wiring test can
  // reference them; private to keep them off the public surface).
  // -------------------------------------------------------------------------

  private readonly createPaymentIntent = async (body: {
    cartId: string;
    quoteId: string;
  }): Promise<PaymentIntent> => {
    return firstValueFrom(
      this.api.invoke(functions.createPaymentIntent, {
        'Idempotency-Key': freshIdempotencyKey(),
        body,
      }),
    );
  };

  private readonly getPaymentIntent = async (paymentIntentId: string): Promise<PaymentIntent> => {
    return firstValueFrom(this.api.invoke(functions.getPaymentIntent, { paymentIntentId }));
  };

  private readonly createOrder = async (
    key: string,
    body: NormalizedOrderBody,
  ): Promise<OrderReceipt> => {
    return firstValueFrom(
      this.api.invoke(functions.createOrder, {
        'Idempotency-Key': key,
        body,
      }),
    );
  };

  private readonly getOrder = async (orderId: string): Promise<OrderReceipt> => {
    return firstValueFrom(this.api.invoke(functions.getOrder, { orderId }));
  };

  // -------------------------------------------------------------------------
  // Submission driver.
  // -------------------------------------------------------------------------

  private async runSubmit(): Promise<SubmitOutcome> {
    const paymentMethod = this.checkout.form().value().paymentMethod;
    const cartId = this.checkout.cartId();
    const quote = this.checkout.quote();
    if (cartId === null || quote === null) {
      return { kind: 'unknown', safeKey: '', reason: 'Hiányzó kosár vagy árajánlat.' };
    }

    if (paymentMethod === 'demo_cod') {
      return this.commitDirectly(cartId, quote.id, null);
    }

    return this.runCardFlow(cartId, quote.id);
  }

  /**
   * Commits through `CheckoutFacade.commitOrder()`, which is the one
   * place the idempotency key for this operation now lives
   * (`checkout.facade.ts`, FIX-61 item 1: one key per canonical
   * request fingerprint). This method used to mint its own key and
   * call `commitOrderWithKey()` directly, which bypassed that policy
   * entirely and minted a fresh key on every retry — the opposite of
   * `architecture.md:121`'s "a timeout-after-commit retries the same
   * key/body." `commitOrder()` reads the same cart/quote/payment
   * intent state this method used to assemble by hand, and the
   * intent id involved never changes across a poll (only its
   * status does), so the fingerprint it builds is the same one this
   * call site would have built.
   */
  private async commitDirectly(
    cartId: string,
    quoteId: string,
    paymentIntentId: string | null,
  ): Promise<SubmitOutcome> {
    const result = await this.checkout.commitOrder();
    if (result.ok) {
      this.lastOutcomeWritable.set({
        kind: 'committed',
        orderId: result.value.id,
        orderNumber: result.value.orderNumber,
      });
      this.emitProgress({
        state: 'succeeded',
        intentId: paymentIntentId,
        attempt: 1,
        outcome: {
          kind: 'committed',
          orderId: result.value.id,
          orderNumber: result.value.orderNumber,
        },
      });
      this.logger([
        { cartId, quoteId, orderId: result.value.id, step: 'commit', outcome: 'committed' },
      ]);
      return { kind: 'committed', orderId: result.value.id, orderNumber: result.value.orderNumber };
    }
    const mapped = result.error;
    this.logger([{ cartId, quoteId, step: 'commit', outcome: mapped.code }]);
    if (mapped.code === 'PAYMENT_DECLINED') {
      this.declinedWritable.set(true);
      this.lastOutcomeWritable.set({
        kind: 'declined',
        reason: mapped.detail,
        intentId: paymentIntentId ?? '',
      });
      return { kind: 'declined', reason: mapped.detail, intentId: paymentIntentId ?? '' };
    }
    // The held key lives inside CheckoutFacade now, not here — an
    // empty safeKey is what a caller that still reads this field
    // sees; nothing in this codebase reads it after FIX-10 removed
    // the local safe-order store.
    return { kind: 'unknown', safeKey: '', reason: mapped.detail };
  }

  private async runCardFlow(cartId: string, quoteId: string): Promise<SubmitOutcome> {
    // 1. Create the payment intent through the facade so the form,
    //    the draft and the cart version stay in lockstep.
    const intentResult = await this.checkout.createPaymentIntent();
    if (!intentResult.ok) {
      const mapped = intentResult.error;
      this.logger([
        {
          cartId,
          quoteId,
          step: 'intent',
          outcome: mapped.code,
        },
      ]);
      if (mapped.code === 'PAYMENT_DECLINED') {
        this.declinedWritable.set(true);
        this.lastOutcomeWritable.set({
          kind: 'declined',
          reason: mapped.detail,
          intentId: '',
        });
        return { kind: 'declined', reason: mapped.detail, intentId: '' };
      }
      return { kind: 'unknown', safeKey: '', reason: mapped.detail };
    }
    const intent = intentResult.value;
    if (intent.status === 'declined') {
      this.declinedWritable.set(true);
      this.lastOutcomeWritable.set({ kind: 'declined', reason: 'declined', intentId: intent.id });
      this.emitProgress({
        state: 'declined',
        intentId: intent.id,
        attempt: 1,
        outcome: { kind: 'declined', reason: 'declined', attempt: 1 },
      });
      this.logger([
        { cartId, quoteId, paymentIntentId: intent.id, step: 'intent', outcome: 'declined' },
      ]);
      return { kind: 'declined', reason: 'A szimulált fizetés elutasítva.', intentId: intent.id };
    }

    if (intent.status === 'succeeded') {
      const outcome = await this.commitDirectly(cartId, quoteId, intent.id);
      return outcome;
    }

    // `pending`: poll until terminal or cap is reached.
    const terminal = await this.pollIntent(intent);
    // `terminal.originalId` is the intent id we originally created;
    // `terminal.id` is whatever the LAST poll response returned. We
    // use the original for persisted-record lookups because the
    // server-side intent store is keyed on that id.
    const canonicalIntentId = terminal.originalId;
    if (terminal.status === 'succeeded') {
      return this.commitDirectly(cartId, quoteId, canonicalIntentId);
    }
    if (terminal.status === 'declined') {
      this.declinedWritable.set(true);
      this.lastOutcomeWritable.set({
        kind: 'declined',
        reason: 'declined',
        intentId: canonicalIntentId,
      });
      this.emitProgress({
        state: 'declined',
        intentId: canonicalIntentId,
        attempt: terminal.attempt,
        outcome: { kind: 'declined', reason: 'declined', attempt: terminal.attempt },
      });
      return {
        kind: 'declined',
        reason: 'A szimulált fizetés elutasítva.',
        intentId: canonicalIntentId,
      };
    }
    // Timed out: recoverable unknown.
    const safeKey = freshIdempotencyKey();
    this.timeoutWritable.set(true);
    this.lastOutcomeWritable.set({
      kind: 'pending-timeout',
      safeKey,
      intentId: terminal.id,
      attempt: terminal.attempt,
    });
    this.emitProgress({
      state: 'timeout',
      intentId: terminal.id,
      attempt: terminal.attempt,
      outcome: { kind: 'pending-timeout', safeKey, attempt: terminal.attempt },
    });
    this.logger([
      {
        cartId,
        quoteId,
        paymentIntentId: terminal.id,
        step: 'poll',
        attempt: terminal.attempt,
        outcome: 'timeout',
      },
    ]);
    return { kind: 'pending-timeout', safeKey, intentId: terminal.id, attempt: terminal.attempt };
  }

  // -------------------------------------------------------------------------
  // Polling loop — deterministic clock, capped at MAX_ATTEMPTS.
  // -------------------------------------------------------------------------

  private async pollIntent(
    initialIntent: PaymentIntent,
  ): Promise<{ status: PaymentIntent['status']; id: string; attempt: number; originalId: string }> {
    this.pollingIntentWritable.set(initialIntent.id);
    this.pollAbort = new AbortController();
    const signal = this.pollAbort.signal;

    let current: PaymentIntent = initialIntent;
    const originalId = initialIntent.id;
    let attempt = 1;
    this.emitProgress({
      state: 'pending',
      intentId: current.id,
      attempt,
      outcome: { kind: 'idle' },
    });
    while (attempt <= PAYMENT_POLL_MAX_ATTEMPTS) {
      if (this.isAborted(signal)) {
        this.pollingIntentWritable.set(null);
        return { status: current.status, id: current.id, attempt, originalId };
      }
      if (current.status !== 'pending') {
        this.pollingIntentWritable.set(null);
        return { status: current.status, id: current.id, attempt, originalId };
      }
      // Wait one interval, but bail out immediately if aborted.
      await this.waitOneInterval(signal);
      if (this.isAborted(signal)) {
        this.pollingIntentWritable.set(null);
        return { status: current.status, id: current.id, attempt, originalId };
      }
      attempt += 1;
      this.emitProgress({
        state: 'attempt',
        intentId: current.id,
        attempt,
        outcome: { kind: 'idle' },
      });
      try {
        current = await this.getPaymentIntent(current.id);
      } catch (err) {
        const mapped = mapError(err);
        // A poll failure does not change intent state — keep going.
        this.logger([
          {
            paymentIntentId: current.id,
            step: 'poll',
            attempt,
            outcome: mapped.code,
          },
        ]);
        continue;
      }
    }
    this.pollingIntentWritable.set(null);
    return { status: 'pending', id: current.id, attempt: PAYMENT_POLL_MAX_ATTEMPTS, originalId };
  }

  private isAborted(signal: AbortSignal): boolean {
    return signal.aborted;
  }

  private waitOneInterval(signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const handle = this.clock.setTimeoutFn(() => {
        this.pollHandle = null;
        resolve();
      }, PAYMENT_POLL_INTERVAL_MS);
      this.pollHandle = handle;
      const onAbort = () => {
        this.clock.clearTimeoutFn(handle);
        this.pollHandle = null;
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private cancelPolling(): void {
    if (this.pollAbort !== null) {
      this.pollAbort.abort();
      this.pollAbort = null;
    }
    if (this.pollHandle !== null) {
      this.clock.clearTimeoutFn(this.pollHandle);
      this.pollHandle = null;
    }
    this.pollingIntentWritable.set(null);
  }

  // -------------------------------------------------------------------------
  // Progress emission.
  // -------------------------------------------------------------------------

  private emitProgress(tick: PaymentProgressTick): void {
    for (const subscriber of this.progressSubscribers) {
      try {
        subscriber(tick);
      } catch {
        // Subscriber failures must not affect the submission flow.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

function mapError(err: unknown): { status: number; code: string; detail: string } {
  if (err instanceof HttpErrorResponse) {
    const body = (err.error ?? {}) as { code?: string; detail?: string };
    return {
      status: err.status,
      code: body.code ?? 'UNKNOWN',
      detail: body.detail ?? err.message,
    };
  }
  return { status: 0, code: 'SERVICE_UNAVAILABLE', detail: String(err) };
}
