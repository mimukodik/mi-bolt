/**
 * S3-C3 — order submission on the 2.0.0 contract.
 *
 * A thin mapper over `CheckoutFacade.submitOrder`: pick the arm of
 * `OrderRequest` (the discriminated union on `paymentMethod`), call
 * `submitOrder(body)` and map the result. The submission itself never
 * polls: the SPA is destroyed by the payment redirect, the outcome is
 * read on return, and a pending outcome is re-read by `ReviewPage`'s
 * bounded poll, not here. `SafeLogger` whitelists the context a log
 * line may carry.
 */

import { Service, computed, inject, signal, type Signal } from '@angular/core';

import type { CardOrderRequest } from '@mi-bolt/api/models/card-order-request';
import type { CashOnDeliveryOrderRequest } from '@mi-bolt/api/models/cash-on-delivery-order-request';
import type { CheckoutSession } from '@mi-bolt/api/models/checkout-session';
import type { FieldError } from '@mi-bolt/api/models/field-error';
import type { Money } from '@mi-bolt/api/models/money';
import type { OrderRequest } from '@mi-bolt/api/models/order-request';

import { CheckoutFacade } from './checkout.facade';

// ---------------------------------------------------------------------------
// Public outcome — eight kinds, every recovery the UI can offer on its
// own: committed, declined, payment-required, payment-pending,
// price-changed, incomplete, conflict, unknown.
// ---------------------------------------------------------------------------

export type SubmitOutcome =
  | { readonly kind: 'committed'; readonly orderId: string; readonly orderNumber: string }
  | { readonly kind: 'declined'; readonly intentId: string | null }
  | {
      /** `null` means no payment has been started yet, so the surface
       *  offers "start a payment" rather than "back to the payment page". */
      readonly kind: 'payment-required';
      readonly intentId: string | null;
      readonly redirectUrl: string | null;
    }
  | { readonly kind: 'payment-pending'; readonly intentId: string | null }
  | { readonly kind: 'price-changed' }
  | { readonly kind: 'incomplete'; readonly route: string }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'unknown'; readonly code: string };

/** Whitelist-only context the safe logger emits; nothing here can be
 *  replayed from a log line. */
export interface SafeLogContext {
  readonly paymentIntentId?: string;
  readonly orderId?: string;
  readonly scenario?: string;
  readonly step?: string;
  readonly attempt?: number;
  readonly outcome?: string;
  readonly amount?: Money;
}

/** Safe-logger sink — receives one batch of redacted entries per call. */
export type SafeLogger = (entries: readonly SafeLogContext[]) => void;

/** Static helper that strips everything except the whitelist fields.
 *  Exposed for tests that assert no PII ever leaves the boundary. */
export const SafeLogger = {
  redact(input: SafeLogContext): Readonly<Record<string, unknown>> {
    const safe: Record<string, unknown> = {};
    if (input.paymentIntentId !== undefined) safe['paymentIntentId'] = input.paymentIntentId;
    if (input.orderId !== undefined) safe['orderId'] = input.orderId;
    if (input.scenario !== undefined) safe['scenario'] = input.scenario;
    if (input.step !== undefined) safe['step'] = input.step;
    if (input.attempt !== undefined) safe['attempt'] = input.attempt;
    if (input.outcome !== undefined) safe['outcome'] = input.outcome;
    if (input.amount !== undefined) {
      safe['amount'] = Object.freeze({
        amount: input.amount.amount,
        currency: input.amount.currency,
      });
    }
    return Object.freeze(safe);
  },
} as const;

// ---------------------------------------------------------------------------
// 2.0.0 contract: `acceptedTerms` is always literal `true` because the
// review step's CTA is disabled until the box is checked (design §7.3).
// `termsVersion` comes from the options signal, never a string literal
// here, so the contract sees whatever version is currently in force.
// ---------------------------------------------------------------------------

const FIRST_MISSING_ROUTE = {
  '/contact': '/penztar/adatok?navigationReason=incomplete',
  '/billing': '/penztar/szallitas?navigationReason=incomplete',
  '/delivery': '/penztar/szallitas?navigationReason=incomplete',
  '/payment': '/penztar/szallitas?navigationReason=incomplete',
} as const satisfies Readonly<Record<string, string>>;

/** First missing session section → route, in the contract's own order
 *  (contact, billing, delivery, payment). The runSubmit step 2 guard
 *  uses this on a client-side snapshot, where no FieldError is
 *  available yet. */
function firstMissingSessionRoute(session: CheckoutSession): string {
  if (session.contact === undefined) return FIRST_MISSING_ROUTE['/contact'];
  if (session.billing === undefined) return FIRST_MISSING_ROUTE['/billing'];
  if (session.delivery === undefined) return FIRST_MISSING_ROUTE['/delivery'];
  if (session.payment === undefined) return FIRST_MISSING_ROUTE['/payment'];
  return '/penztar/szallitas?navigationReason=incomplete';
}

/** First missing section → route, in the contract's own order
 *  (contact, billing, delivery, payment — design §6.5). */
function routeForFirstMissing(fieldErrors: readonly FieldError[]): string {
  for (const path of ['/contact', '/billing', '/delivery', '/payment'] as const) {
    if (fieldErrors.some((fe) => fe.path === path || fe.path.startsWith(`${path}/`))) {
      return FIRST_MISSING_ROUTE[path];
    }
  }
  return '/penztar/szallitas?navigationReason=incomplete';
}

const noopLogger: SafeLogger = () => undefined;

// ---------------------------------------------------------------------------
// OrderSubmission — the orchestration root. Holds the in-flight mutex
// (a second `submitOrder()` returns the same promise), the safe-logger
// seam, and the read-only signals the page binds. All wire calls go
// through the facade; this service has no `HttpClient` of its own
// (design §7.1).
// ---------------------------------------------------------------------------

@Service()
export class OrderSubmission {
  private readonly checkout = inject(CheckoutFacade);

  /** In-flight submit mutex. The reference is held in a closure so a
   *  second `submitOrder()` observes the same promise as the first;
   *  null when no submit is running. */
  private inFlightPromise: Promise<SubmitOutcome> | null = null;

  private readonly inFlightWritable = signal(false);
  private readonly lastOutcomeWritable = signal<SubmitOutcome | null>(null);

  /** Active safe-logger sink — overridable in tests via `bindSafeLogger`. */
  private logger: SafeLogger = noopLogger;

  /** `true` while a submit is executing. */
  readonly inFlight: Signal<boolean> = this.inFlightWritable.asReadonly();

  /** Most recent `SubmitOutcome`. */
  readonly lastOutcome: Signal<SubmitOutcome | null> = this.lastOutcomeWritable.asReadonly();

  /** True on a declined / unknown / conflict with a complete draft. */
  readonly canRetry: Signal<boolean> = computed(() => {
    const o = this.lastOutcomeWritable();
    if (o === null) return false;
    if (o.kind !== 'declined' && o.kind !== 'unknown' && o.kind !== 'conflict') return false;
    return this.checkout.complete();
  });

  /** True on a declined or payment-required outcome. */
  readonly canChangeMethod: Signal<boolean> = computed(() => {
    const o = this.lastOutcomeWritable();
    return o !== null && (o.kind === 'declined' || o.kind === 'payment-required');
  });

  /** Replaces the safe-logger sink; entries are already redacted. */
  bindSafeLogger(logger: SafeLogger): void {
    this.logger = logger;
  }

  /**
   * Drives the review step forward. Mirrors the `runSubmit` steps of
   * design §7.3 verbatim: pick the arm of `OrderRequest`, call
   * `checkout.submitOrder(body)`, map the result.
   */
  submitOrder(): Promise<SubmitOutcome> {
    if (this.inFlightPromise !== null) {
      return this.inFlightPromise;
    }
    this.inFlightWritable.set(true);
    const promise = this.runSubmit();
    this.inFlightPromise = promise;
    return promise.finally(() => {
      this.inFlightPromise = null;
      this.inFlightWritable.set(false);
    });
  }

  private runSubmit(): Promise<SubmitOutcome> {
    // 1. session must be loaded; options are only required when there
    // is something to commit, so the incomplete check runs first.
    const session = this.checkout.session();
    if (session === null) {
      return this.setOutcome({ kind: 'unknown', code: 'NO_SESSION' });
    }
    // 2. incomplete draft → navigate to the first missing step.
    if (!session.complete) {
      return this.setOutcome({ kind: 'incomplete', route: firstMissingSessionRoute(session) });
    }
    const options = this.checkout.options();
    if (options === null) {
      return this.setOutcome({ kind: 'unknown', code: 'NO_OPTIONS' });
    }

    const method = session.payment?.method;
    if (method === 'cash_on_delivery') {
      return this.commit({
        paymentMethod: 'cash_on_delivery',
        acceptedTerms: true,
        termsVersion: options.termsVersion,
      } satisfies CashOnDeliveryOrderRequest);
    }

    // 3. card: the intent must already be on the facade from the
    //    review page's "Fizetés indítása" action; null here means the
    //    shopper reached submit without redirecting first.
    const intent = this.checkout.paymentIntent();
    if (intent === null) {
      return this.setOutcome({
        kind: 'payment-required',
        intentId: null,
        redirectUrl: null,
      });
    }
    // 4. a non-succeeded intent must yield an outcome before submitOrder
    //    is even called — a poll there would contradict the redirect.
    if (intent.status === 'declined') {
      return this.setOutcome({ kind: 'declined', intentId: intent.id });
    }
    if (intent.status === 'pending') {
      return this.setOutcome({ kind: 'payment-pending', intentId: intent.id });
    }
    if (intent.status === 'requires_action') {
      return this.setOutcome({
        kind: 'payment-required',
        intentId: intent.id,
        redirectUrl: intent.redirectUrl,
      });
    }
    return this.commit({
      paymentMethod: 'card',
      paymentIntentId: intent.id,
      acceptedTerms: true,
      termsVersion: options.termsVersion,
    } satisfies CardOrderRequest);
  }

  /** Records `outcome` on `lastOutcomeWritable` and returns it. Every
   *  pre-commit return path in `runSubmit` and `commit` goes through
   *  this so the page's `canRetry` / `canChangeMethod` signals always
   *  reflect the most recent terminal state. */
  private setOutcome(outcome: SubmitOutcome): Promise<SubmitOutcome> {
    this.lastOutcomeWritable.set(outcome);
    return Promise.resolve(outcome);
  }

  private async commit(body: OrderRequest): Promise<SubmitOutcome> {
    const intent = this.checkout.paymentIntent();
    const result = await this.checkout.submitOrder(body);
    if (result.ok) {
      const outcome: SubmitOutcome = {
        kind: 'committed',
        orderId: result.value.id,
        orderNumber: result.value.orderNumber,
      };
      this.lastOutcomeWritable.set(outcome);
      this.logger([{ orderId: result.value.id, step: 'commit', outcome: 'committed' }]);
      return outcome;
    }
    // The facade may have dropped the intent this call was refused for (a
    // 422 PAYMENT_REQUIRED on an intent that already backs an order), so
    // the outcome is built from the intent it holds now: a dropped intent
    // yields no redirect back to its payment page.
    const outcome = this.mapFailure(
      result.error.code,
      result.error.fieldErrors,
      this.checkout.paymentIntent(),
    );
    this.lastOutcomeWritable.set(outcome);
    this.logger([
      {
        paymentIntentId: intent?.id,
        step: 'commit',
        outcome: result.error.code,
      },
    ]);
    return outcome;
  }

  private mapFailure(
    code: string,
    fieldErrors: readonly FieldError[],
    intent: ReturnType<CheckoutFacade['paymentIntent']>,
  ): SubmitOutcome {
    switch (code) {
      case 'PAYMENT_REQUIRED':
        return {
          kind: 'payment-required',
          intentId: intent?.id ?? null,
          redirectUrl: intent?.redirectUrl ?? null,
        };
      case 'PAYMENT_PENDING':
        return { kind: 'payment-pending', intentId: intent?.id ?? null };
      case 'PAYMENT_DECLINED':
        return { kind: 'declined', intentId: intent?.id ?? null };
      case 'PRICE_CHANGED':
        return { kind: 'price-changed' };
      case 'CHECKOUT_INCOMPLETE':
        return { kind: 'incomplete', route: routeForFirstMissing(fieldErrors) };
      case 'CART_VERSION_CONFLICT':
        return { kind: 'conflict' };
      default:
        return { kind: 'unknown', code };
    }
  }
}
