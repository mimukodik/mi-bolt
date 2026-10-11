/**
 * S3-C5 — the review page on the 2.0.0 contract.
 *
 * The page holds the facades, maps the submission outcomes to
 * navigation and renders the step; the payment itself is a full-page
 * redirect the SPA does not survive (design §1 fact d, §5.5).
 *
 * It is the owning container `checkout.routes.ts` routes
 * `/penztar/ellenorzes` to. It hydrates the cart, the options and the
 * session; maps the facade's signals onto the step's
 * `CheckoutViewState`; and turns each of `OrderSubmission`'s eight
 * outcomes into a navigation, a redirect or a rendered state. The
 * step renders; this file decides.
 *
 * The full-page redirect goes through `LOCATION_ASSIGN` rather than
 * through `window` directly, so a unit test can observe the URL the
 * page would have sent the shopper to without leaving the harness.
 */

import {
  Component,
  DestroyRef,
  InjectionToken,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { concatMap, from, repeat, takeWhile, timer } from 'rxjs';

import { Button } from '../../shared/ui/button/button';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { SkeletonLeave } from '../../shared/ui/skeleton-leave/skeleton-leave';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import { CartFacade } from '../cart/cart.facade';
import { checkoutKeys } from './checkout-keys';
import { CheckoutFacade } from './checkout.facade';
import { OrderSubmission } from './order-submission';
import { ReviewStep, type CheckoutViewState, type PaymentPollState } from './review-step';

/**
 * The cadence of the pending-payment poll. `docs/spec/architecture.md`:
 * "Pending GET polling: 1s interval, maximum 10 attempts; surface
 * unknown outcome on timeout."
 */
const PENDING_POLL_INTERVAL_MS = 1000;

/** The read budget of the same poll, from that same line. */
const PENDING_POLL_MAX_READS = 10;

/**
 * Seam for the full-page navigation to the payment application.
 * `Router` cannot express it: the payment page is a different
 * document and the SPA is destroyed by the hop.
 */
export const LOCATION_ASSIGN = new InjectionToken<(url: string) => void>('LOCATION_ASSIGN', {
  providedIn: 'root',
  factory: () => (url: string) => {
    globalThis.location.assign(url);
  },
});

/** The one submit outcome this container renders itself. The `code`
 *  is the server's ProblemCode: it is carried for diagnostics and
 *  never rendered (R15), so the message beside it is fixed copy. */
interface SubmitFailure {
  readonly kind: 'error';
  readonly code: string;
}

@Component({
  selector: 'app-review-page',
  imports: [Button, LoadingState, ReviewStep, SkeletonLeave, StatusMessage],
  templateUrl: './review-page.html',
  styleUrl: './review-page.scss',
})
export class ReviewPage {
  /** Not private: the template reads `cartFacade.cart()` and the
   *  checkout signals directly. */
  readonly cartFacade = inject(CartFacade);
  readonly checkoutFacade = inject(CheckoutFacade);
  private readonly orderSubmission = inject(OrderSubmission);
  private readonly router = inject(Router);
  private readonly locationAssign = inject(LOCATION_ASSIGN);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Whether a payment was started earlier in this browser session.
   * Read once, before anything can clear it, because it is what
   * tells "the intent the payment page sent us back with is gone"
   * (design §5.3's 404 row) apart from "no card payment has been
   * started yet".
   */
  readonly paymentStarted: boolean = checkoutKeys.activeIntentId() !== null;

  /** How far the bounded poll of a pending intent has got. Read by the
   *  step, which shows the poll's progress; the poll itself is
   *  `startPendingPoll`. */
  readonly paymentPoll = signal<PaymentPollState>('idle');

  /** True while the way back to the cart re-reads the cart; the step's
   *  control is disabled meanwhile, so a second press does nothing. */
  readonly backToCartPending = signal(false);

  /** The intent the poll has already run for. A poll runs at most once
   *  per intent id on this page, so a read that changes nothing about
   *  the intent does not start a second one. */
  private polledIntentId: string | null = null;

  /** True between the CTA press and the outcome. `inFlight` covers
   *  the wire call; this one also covers the navigation after it. */
  private readonly submitting = signal<boolean>(false);

  /** Null until a submit or an intent create fails in a way only
   *  this container renders. */
  readonly submitFailure = signal<SubmitFailure | null>(null);

  /** Fixed copy: the server's English `detail` never reaches the
   *  screen, and the sentence that matters is that nothing was lost. */
  readonly submitFailureMessage =
    'A kosarad és az adataid megmaradtak. Próbáld újra, vagy módosítsd a fizetési módot.';

  /** The step's seven states, in the priority design §6.3 sets. */
  readonly viewState = computed<CheckoutViewState>(() => {
    if (this.submitting() || this.orderSubmission.inFlight()) return 'submitting';
    if (this.checkoutFacade.priceChange() !== null) return 'price-changed';
    if (this.checkoutFacade.conflict() !== null) return 'conflict';
    const outcome = this.orderSubmission.lastOutcome();
    if (outcome !== null && outcome.kind === 'unknown' && outcome.code === 'OUT_OF_STOCK') {
      return 'stock-error';
    }
    if (this.submitFailure() !== null) return 'error';
    if (this.checkoutFacade.session() === null || this.checkoutFacade.options() === null) {
      return 'loading';
    }
    return 'ready';
  });

  /**
   * True when the draft pays by card and the facade holds no intent:
   * either the return leg's read came back 404 (design §5.3) or no
   * payment has been started at all. `paymentStarted` tells the step
   * which of the two it is, and the step words its sentence from it.
   */
  readonly paymentIntentMissing = computed<boolean>(() => {
    if (this.checkoutFacade.paymentIntent() !== null) return false;
    return this.checkoutFacade.session()?.payment?.method === 'card';
  });

  constructor() {
    // A stock error from an earlier visit would otherwise come back
    // after the shopper corrected the cart, and in that state the
    // submit control only focuses the banner.
    this.orderSubmission.clearOutcome();
    let cancelled = false;
    this.destroyRef.onDestroy(() => {
      cancelled = true;
    });
    void this.load(() => cancelled);

    // A pending intent is the one the page keeps asking about on its
    // own: the outcome is unknown until the payment application
    // answers. The start goes through `untracked` so the signals it
    // reads are not this effect's dependencies, and a read that lands
    // does not start another poll.
    effect(() => {
      const intent = this.checkoutFacade.paymentIntent();
      if (intent?.status !== 'pending') return;
      if (this.polledIntentId === intent.id) return;
      untracked(() => {
        this.startPendingPoll(intent.id);
      });
    });
  }

  /**
   * Reads `id` one second after the previous answer, at most
   * `PENDING_POLL_MAX_READS` answers. The budget counts answers, not
   * timer ticks: `repeat(count)` re-subscribes to the source
   * (`timer(...).pipe(concatMap(...))`) when it completes, so a slow
   * answer is never overlapped by the next tick (`concatMap` waits for
   * the inner promise), and a read that rejects or answers no longer
   * pending ends the poll through `takeWhile` / the `error` arm.
   * `takeUntilDestroyed` ends it with the page. Ten answers still
   * pending leave the outcome unknown and the step says so, with the
   * manual check as the way to look once more.
   */
  private startPendingPoll(id: string): void {
    this.polledIntentId = id;
    this.paymentPoll.set('polling');
    timer(PENDING_POLL_INTERVAL_MS)
      .pipe(
        concatMap(() => from(this.checkoutFacade.readPaymentIntent(id))),
        repeat(PENDING_POLL_MAX_READS),
        takeWhile(() => this.checkoutFacade.paymentIntent()?.status === 'pending', true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        complete: () => {
          if (this.destroyRef.destroyed) return;
          this.paymentPoll.set(
            this.checkoutFacade.paymentIntent()?.status === 'pending' ? 'exhausted' : 'idle',
          );
        },
        error: () => {
          if (this.destroyRef.destroyed) return;
          this.paymentPoll.set('exhausted');
        },
      });
  }

  /**
   * Hydrates whatever the shopper's route into this page did not.
   * The cart and the options are read only when their signal is empty,
   * the session on every arrival, so a hand-off from
   * `payment-return-page.ts`, which has just loaded the cart and the
   * session, costs one `GET /checkout` and at most one
   * `GET /checkout/options`.
   *
   * The cold return from the payment page does not survive the SPA
   * (`LOCATION_ASSIGN`), so a reload of `/penztar/ellenorzes` while an
   * unpaid card intent is stored (`checkoutKeys.activeIntentId()`)
   * shows the missing-intent branch until the held intent is read
   * here. A pending answer starts the poll through the effect that
   * watches `paymentIntent` for `status === 'pending'`.
   */
  private async load(cancelled: () => boolean): Promise<void> {
    if (this.cartFacade.cart() === null) {
      await this.cartFacade.ensureCart();
      if (cancelled()) return;
    }
    await this.checkoutFacade.ensureOptions();
    if (cancelled()) return;
    // The summary this step shows is computed by the server from the
    // cart, so the session is read fresh on every arrival: a cart
    // corrected after an earlier visit (a stock error sends the shopper
    // back there) would otherwise show the summary the server computed
    // for the old one. The delivery step reads its options fresh for the
    // same reason.
    const session = await this.checkoutFacade.ensureSession(true);
    // A failed read must not strand this page. A 410 CART_EXPIRED drops
    // the session snapshot (`CheckoutFacade.recordFailure`), and the
    // arrival would then sit on the loading skeleton for good: the
    // template renders the step only while `session()` is set, and
    // nothing on this page reads it again. An arrival whose session is
    // gone has no draft to review either, so the shopper restarts where
    // `reviewGuard` sends a session that is not there — the contact step.
    if (!session.ok && this.checkoutFacade.session() === null) {
      if (cancelled()) return;
      await this.router.navigate(['/penztar/adatok'], {
        queryParams: { navigationReason: 'incomplete' },
      });
      return;
    }
    const id = checkoutKeys.activeIntentId();
    if (id !== null && id.length > 0 && this.checkoutFacade.paymentIntent() === null) {
      if (cancelled()) return;
      await this.checkoutFacade.readPaymentIntent(id);
    }
  }

  onEditRequested(section: 'contact' | 'delivery'): void {
    const route = section === 'contact' ? '/penztar/adatok' : '/penztar/szallitas';
    void this.router.navigate([route]);
  }

  /** The stock-error banner's way back: the cart is read again first,
   *  so the cart page shows what the refused order changed (a removed
   *  line and its notice) instead of the cart it already holds. The
   *  checkout draft stays in the facade, so nothing typed is lost. */
  async onBackToCart(): Promise<void> {
    if (this.backToCartPending()) return;
    this.backToCartPending.set(true);
    try {
      await this.cartFacade.refetch();
    } finally {
      if (!this.destroyRef.destroyed) this.backToCartPending.set(false);
    }
    if (this.destroyRef.destroyed) return;
    await this.router.navigate(['/penztar/kosar']);
  }

  /** The eight `SubmitOutcome` kinds, each to its recovery. A shopper who
   *  left the page while the submit was in flight is sent nowhere, except
   *  to the receipt of an order that was placed. */
  async onSubmitRequested(): Promise<void> {
    this.submitFailure.set(null);
    this.submitting.set(true);
    try {
      const outcome = await this.orderSubmission.submitOrder();
      switch (outcome.kind) {
        case 'committed':
          // Even when the shopper has left this page: only the receipt page
          // empties the ordered cart (success-step.ts, `resetOrderedCart`),
          // so without it a placed order would stay out of sight and its
          // cart could be checked out again.
          await this.router.navigate(['/penztar/siker', outcome.orderId]);
          return;
        case 'payment-required':
          // A redirect URL means the intent exists and wants the
          // shopper back on the payment page. No URL means the draft
          // reached submit with no intent at all, which `canSubmit()`
          // already refuses for a card draft: the step's
          // "Fizetés indítása" control is the way forward, so this
          // arm only records that the submit did not land. After the
          // facade dropped the intent (stale or refused), the step's
          // branch is the whole answer.
          if (outcome.redirectUrl !== null) {
            if (this.destroyRef.destroyed) return;
            this.locationAssign(outcome.redirectUrl);
            return;
          }
          // A dropped intent: the step's missing-payment branch says why
          // and offers the new payment, so no failure banner joins it.
          if (this.checkoutFacade.intentDropped() !== null) return;
          this.submitFailure.set({ kind: 'error', code: 'PAYMENT_REQUIRED' });
          return;
        case 'incomplete':
          // The route carries `?navigationReason=incomplete`
          // (`order-submission.ts:93-98`), so it is a URL, not a
          // segment array.
          if (this.destroyRef.destroyed) return;
          await this.router.navigateByUrl(outcome.route);
          return;
        case 'unknown':
          // A stock refusal: the step's stock-error branch says what was
          // lost and offers the way back to the cart, so no failure
          // banner joins it.
          if (outcome.code === 'OUT_OF_STOCK') return;
          this.submitFailure.set({ kind: 'error', code: outcome.code });
          return;
        case 'declined':
        case 'payment-pending':
          // The facade already holds the intent these two read from;
          // the step renders its branch.
          return;
        case 'price-changed':
        case 'conflict':
          // The facade armed `priceChange` / `conflict`; `viewState`
          // picks them up and the step renders the recovery.
          return;
      }
    } finally {
      this.submitting.set(false);
    }
  }

  /** §3.7: the only way to clear `priceChange`, and therefore the
   *  only way to reach the CTA after a 409. */
  onPriceChangeConfirmed(): void {
    this.checkoutFacade.confirmPriceChange();
    this.submitFailure.set(null);
  }

  /** 412: replay the write that conflicted, with the current version. */
  async onRetryRequested(): Promise<void> {
    await this.checkoutFacade.retry();
  }

  /** A declined payment is retried as a new payment, never as a
   *  replay of the declined one. */
  async onPaymentRetry(): Promise<void> {
    await this.startPayment();
  }

  onPaymentChangeMethod(): void {
    void this.router.navigate(['/penztar/szallitas']);
  }

  /** One re-read of the pending intent per press. The automatic poll
   *  above reads it every second at most ten times; after that this
   *  control is the shopper's way to look again. */
  async onPaymentCheck(): Promise<void> {
    const id = this.checkoutFacade.paymentIntent()?.id ?? checkoutKeys.activeIntentId();
    if (id === null || id.length === 0) return;
    await this.checkoutFacade.readPaymentIntent(id);
  }

  /** `requires_action`: back to the payment page the intent names.
   *  Never automatic — an auto-redirect would trap a shopper who
   *  pressed Back (design §5.3). */
  onBackToPayment(): void {
    const intent = this.checkoutFacade.paymentIntent();
    if (intent === null) return;
    this.locationAssign(intent.redirectUrl);
  }

  async onNewPayment(): Promise<void> {
    await this.startPayment();
  }

  /**
   * Creates a payment intent and sends the shopper to it. The key is
   * not rotated here: the facade rotates on every definite outcome, a
   * successful create included, so this press mints a new intent when
   * the previous one was declined (design §5.3, "Újrapróbálom (new
   * intent, new key)") and replays the intent it already created when
   * the previous answer was lost (status 0) or a 5xx.
   * A shopper who left the page meanwhile is not sent to the payment page.
   */
  private async startPayment(): Promise<void> {
    this.submitFailure.set(null);
    const result = await this.checkoutFacade.createPaymentIntent();
    if (result.ok) {
      if (this.destroyRef.destroyed) return;
      this.locationAssign(result.value.redirectUrl);
      return;
    }
    this.submitFailure.set({ kind: 'error', code: result.error.code });
  }
}
