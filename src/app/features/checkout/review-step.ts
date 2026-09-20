/**
 * T22 — final review step (S4.4).
 *
 * Replaces the T11 stub. Owns the order-review screen that sits
 * between the delivery / payment step and the success page. The
 * component is purely presentational; every signal it reads comes
 * from `CheckoutFacade` (state machine + Signal Forms FieldTree)
 * and `CartFacade` (cart line items). The page is also a thin
 * shell around `QuoteController`, the local state machine that
 * branches on `PRICE_CHANGED` / `QUOTE_EXPIRED` / `OUT_OF_STOCK`
 * (T22-AC03) without erasing the order summary (T22-AC05).
 *
 * Responsibilities:
 *   - On mount, create a fresh quote so the subtotal / shipping /
 *     total the user sees reflects the current cart version
 *     (T22-AC01);
 *   - render the cart items, contact snapshot, delivery choice,
 *     payment method and the live quote summary so the user can
 *     verify the order (T22-AC01);
 *   - render two unchecked consents (demo purchase + simulation
 *     acknowledgement). The first one opens `TermsDialog`, which
 *     is built on top of `AccessibleDialog` for R23 compliance
 *     (T22-AC02);
 *   - expose the "Demórendelés véglegesítése" CTA only when:
 *       * the quote is fresh (`QuoteController.ready()`);
 *       * both consents are checked;
 *       * the facade is not busy.
 *     When any of these is false, the CTA is disabled with an
 *     explanation (T22-AC04);
 *   - call `CheckoutFacade.createPaymentIntent()` (for `demo_card`)
 *     then `CheckoutFacade.commitOrder()` when the user clicks the
 *     CTA. A failure surfaces the appropriate error state and
 *     leaves the cart + draft + contact intact (T19-AC03 / R24);
 *   - render every documented state — loading, ready,
 *     quote-expired, price-change, field-error — without erasing
 *     the order summary (T22-AC05).
 *
 * Visual state contract (mirrors T10-AC05):
 *   default            → ready, both consents unchecked, CTA
 *                        disabled with explanation.
 *   touched-invalid    → a consent checkbox has been touched but
 *                        left unchecked; the inline message lists
 *                        the missing checkbox.
 *   loading            → the CTA shows "Véglegesítés…" with a
 *                        spinner; a second click is blocked.
 *   server-error       → a non-blocking `StatusMessage` banner above
 *     (price-changed    the order summary explains the failure and
 *      quote-expired    suggests the next action. The order summary
 *      out-of-stock     stays visible across every branch.
 *      field-error)
 *   submitting         → covered by the `loading` branch.
 *
 * Edit affordances (T22-AC01): the contact and delivery sections
 * each carry a `Módosítás` link that navigates back to the
 * matching step. The in-memory form survives the round trip, so the
 * user does not have to re-type anything.
 *
 * The page does NOT own the draft save. It delegates to the
 * `CheckoutFacade` (T19) the same way `ContactStep` and
 * `DeliveryStep` do.
 */

import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormField, type FieldTree } from '@angular/forms/signals';

import { CheckoutFacade } from './checkout.facade';
import { CartFacade } from '../cart/cart.facade';
import { QuoteController, type QuoteState } from './quote-state';
import { OrderSubmission } from './order-submission';
import { PaymentProgress, type PaymentProgressTick } from './payment-progress';

import { Button } from '../../shared/ui/button/button';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PriceBlock, type Money } from '../../shared/ui/price-block/price-block';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import { OrderSummary } from '../cart/order-summary';

import type { CartItem } from '../../api/generated/models/cart-item';
import type { CheckoutFormModel } from './checkout-form.model';
import type { PaymentStatus } from '../../shared/types/payment-status';

import { TermsDialog } from './terms-dialog';

interface ReviewLineDisplay {
  readonly id: string;
  readonly productName: string;
  readonly variantLabel: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
}

/** Outcome of the last submit attempt that did not produce an order. */
type SubmitFailure =
  | { readonly kind: 'declined'; readonly detail: string }
  | { readonly kind: 'pending'; readonly detail: string }
  | { readonly kind: 'error'; readonly detail: string };

@Component({
  selector: 'app-review-step',
  imports: [
    RouterLink,
    FormField,
    Button,
    LoadingState,
    PaymentProgress,
    PriceBlock,
    StatusMessage,
    OrderSummary,
    TermsDialog,
  ],
  templateUrl: './review-step.html',
  styleUrl: './review-step.scss',
})
export class ReviewStep {
  private readonly cartFacade = inject(CartFacade);
  private readonly checkoutFacade = inject(CheckoutFacade);
  private readonly quoteController = inject(QuoteController);
  private readonly router = inject(Router);
  private readonly orderSubmission = inject(OrderSubmission);
  private readonly destroyRef = inject(DestroyRef);

  /** True while a network mutation (quote / payment intent / order)
   *  is in flight. */
  readonly submitting = signal<boolean>(false);

  /** Whether the user has tried to submit at least once — used to
   *  flip the per-consent error state from "default" to
   *  "submitted-invalid". */
  readonly submitted = signal<boolean>(false);

  /** Null until a submit attempt fails; cleared by the next attempt
   *  and by a quote refresh. */
  readonly submitFailure = signal<SubmitFailure | null>(null);

  /** Most recent progress tick from `OrderSubmission.watchProgress()`;
   *  cleared at the start of every submission attempt. This
   *  component — the orchestrator, per `components.md:632` — is what
   *  polls the submission service; `PaymentProgress` never does. */
  private readonly latestTick = signal<PaymentProgressTick | null>(null);

  /** `PaymentProgress`'s `status` input, mapped from the live tick
   *  while a submission is running and from `submitFailure` once it
   *  has settled — several of `OrderSubmission`'s failure branches
   *  (a missing quote, a rejected `demo_cod` commit) never emit a
   *  tick at all, so `submitFailure` is the fallback that still
   *  reaches this computed. */
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

  /** `PaymentProgress`'s `pollCount` input. */
  readonly pollCount = computed<number>(() => this.latestTick()?.attempt ?? 0);

  /** Whether the demo terms dialog is open. */
  readonly termsOpened = signal<boolean>(false);

  /** Snapshot of the cart's items, mapped into the wire shape the
   *  template needs. */
  readonly items = computed<CartItem[]>(() => this.cartFacade.cart()?.items ?? []);

  /** Each line as the template renders it: human-readable variant
   *  label and the line subtotal already aggregated. */
  readonly lines = computed<readonly ReviewLineDisplay[]>(() =>
    this.items().map((item) => ({
      id: item.id,
      productName: item.productName,
      variantLabel: `${item.colorName} · ${String(item.storageGb)} GB`,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  );

  /** Facade form snapshot for the contact / delivery / payment
   *  surfaces. The Signal Form `FieldTree` is built once off the
   *  facade's writable model, exactly like the wizard steps. */
  readonly reviewForm: FieldTree<CheckoutFormModel> = this.checkoutFacade.form;

  /** Convenience getters for the template — name / email / phone
   *  pulled from the form model so the rendered labels follow
   *  whatever the user last typed (the form survives a back-nav). */
  readonly contactName = computed<string>(() => {
    const value = this.reviewForm().value();
    return value.fullName.trim();
  });

  readonly contactEmail = computed<string>(() => {
    const value = this.reviewForm().value();
    return value.email.trim();
  });

  readonly contactPhone = computed<string>(() => {
    const value = this.reviewForm().value();
    return value.phone.trim();
  });

  readonly deliveryOptionId = computed<'home_delivery' | 'demo_pickup' | null>(() => {
    const id = this.reviewForm().value().deliveryOptionId;
    if (id === 'home_delivery' || id === 'demo_pickup') return id;
    return null;
  });

  readonly deliveryAddress = computed<{
    line1: string;
    line2: string;
    postalCode: string;
    city: string;
  } | null>(() => {
    const value = this.reviewForm().value();
    if (value.deliveryOptionId !== 'home_delivery') return null;
    const address = value.address;
    if (
      address.postalCode.trim().length === 0 ||
      address.city.trim().length === 0 ||
      address.line1.trim().length === 0
    ) {
      return null;
    }
    return {
      line1: address.line1.trim(),
      line2: address.line2.trim(),
      postalCode: address.postalCode.trim(),
      city: address.city.trim(),
    };
  });

  readonly deliveryLabel = computed<string>(() => {
    const id = this.deliveryOptionId();
    if (id === 'home_delivery') return 'Házhoz szállítás (1990 Ft)';
    if (id === 'demo_pickup') return 'Virtuális átvétel (0 Ft)';
    return 'Nincs kiválasztva';
  });

  readonly paymentMethod = computed<'demo_card' | 'demo_cod' | null>(() => {
    const m = this.reviewForm().value().paymentMethod;
    if (m === 'demo_card' || m === 'demo_cod') return m;
    return null;
  });

  readonly paymentLabel = computed<string>(() => {
    const m = this.paymentMethod();
    if (m === 'demo_card') return 'Bankkártya (szimulált)';
    if (m === 'demo_cod') return 'Utánvét (demó)';
    return 'Nincs kiválasztva';
  });

  /** Live quote controller — the page branches on `state().kind`. */
  readonly state = computed<QuoteState | null>(() => {
    const s = this.quoteController.state();
    return s.kind === 'idle' ? null : s;
  });

  readonly stateKind = computed<string>(() => {
    const s = this.quoteController.state();
    if (s.kind === 'idle') return 'idle';
    if (s.kind === 'loading') return 'loading';
    return s.kind;
  });

  readonly busy = computed<boolean>(
    () => this.quoteController.busy() || this.submitting() || this.checkoutFacade.busy(),
  );

  /** Total-driven summary inputs. The OrderSummary primitive
   *  formats the amounts; the page only forwards the Money objects
   *  from the active quote. */
  readonly readySummary = computed<{
    readonly subtotal: Money;
    readonly shipping: Money;
  } | null>(() => {
    const quote = this.quoteController.quote();
    if (quote === null) return null;
    return { subtotal: quote.subtotal, shipping: quote.shipping };
  });

  /** Footnote the OrderSummary renders below the totals. */
  readonly summaryFootnote = computed<string | null>(() => {
    const state = this.state();
    if (state === null) {
      return 'Az árajánlat a mock munkamenetben 5 percig érvényes.';
    }
    if (state.kind === 'quote-expired') {
      return 'Az árajánlat lejárt; frissítsd a „Árajánlat frissítése” gombra kattintva.';
    }
    if (state.kind === 'price-changed') {
      return 'A katalógus ára megváltozott; a kosár frissítésre került, az új végösszeg fent látható.';
    }
    return null;
  });

  // ---------------------------------------------------------------------------
  // Per-state banner copy
  // ---------------------------------------------------------------------------

  readonly priceChangedMessage = computed<string>(() => {
    const state = this.state();
    if (state?.kind !== 'price-changed') {
      return 'A katalógus ára megváltozott.';
    }
    return `${state.detail} Erősítsd meg az új végösszeget a „Árajánlat frissítése” gombra kattintva.`;
  });

  readonly quoteExpiredMessage = computed<string>(() => {
    const state = this.state();
    if (state?.kind !== 'quote-expired') {
      return 'Az árajánlat lejárt.';
    }
    return `${state.detail} Kattints a „Árajánlat frissítése” gombra az új végösszegért.`;
  });

  readonly outOfStockMessage = computed<string>(() => {
    const state = this.state();
    if (state?.kind !== 'out-of-stock') {
      return 'Egy vagy több változat elfogyott.';
    }
    return `${state.detail} Visszavonulhatsz a kosárhoz a cikk korrigálásához.`;
  });

  readonly fieldErrorMessage = computed<string>(() => {
    const state = this.state();
    if (state?.kind !== 'field-error') {
      return 'A rendelés leadása nem sikerült.';
    }
    return state.detail;
  });

  // ---------------------------------------------------------------------------
  // Consent gating
  // ---------------------------------------------------------------------------

  readonly termsConsentState = computed<string>(() => {
    const value = this.reviewForm.acceptedTerms();
    if (value.invalid() && value.touched()) return 'touched-invalid';
    if (this.submitted() && value.invalid()) return 'submitted-invalid';
    return 'default';
  });

  readonly simulationConsentState = computed<string>(() => {
    const value = this.reviewForm.acknowledgedSimulation();
    if (value.invalid() && value.touched()) return 'touched-invalid';
    if (this.submitted() && value.invalid()) return 'submitted-invalid';
    return 'default';
  });

  readonly termsConsentMessage = computed<string | null>(() => {
    const errors = this.reviewForm.acceptedTerms().errors();
    if (errors.length === 0) return null;
    if (this.termsConsentState() === 'default') return null;
    return errors[0]?.message ?? 'A demó feltételek elfogadása kötelező.';
  });

  readonly simulationConsentMessage = computed<string | null>(() => {
    const errors = this.reviewForm.acknowledgedSimulation().errors();
    if (errors.length === 0) return null;
    if (this.simulationConsentState() === 'default') return null;
    return errors[0]?.message ?? 'A szimuláció tudomásulvétele kötelező.';
  });

  /** True when the CTA may be pressed. Combines:
   *  - a fresh quote (so we submit the right total),
   *  - both consents checked,
   *  - no in-flight network mutation,
   *  - the payment method is set. */
  readonly canSubmit = computed<boolean>(() => {
    if (this.submitFailure()?.kind === 'pending') return false;
    if (!this.quoteController.ready()) return false;
    if (!this.reviewForm().valid()) return false;
    if (this.busy()) return false;
    if (this.reviewForm().value().paymentMethod === '') return false;
    if (this.reviewForm().value().deliveryOptionId === '') return false;
    return true;
  });

  /** Human-readable reason the CTA is disabled. Rendered below the
   // button so the user understands the gate. */
  readonly ctaExplanation = computed<string | null>(() => {
    if (this.canSubmit()) return null;
    if (this.busy() && !this.quoteController.busy()) {
      return 'A véglegesítés folyamatban van; kérlek várj.';
    }
    if (!this.quoteController.ready()) {
      const state = this.quoteController.state();
      if (state.kind === 'loading') {
        return 'Árajánlat frissítése folyamatban…';
      }
      return 'Az árajánlat még nem áll készen; a frissítés gombra kattintva új árajánlatot kérhetsz.';
    }
    const value = this.reviewForm().value();
    if (!value.acceptedTerms) {
      return 'A demó feltételek elfogadása szükséges a leadáshoz.';
    }
    if (!value.acknowledgedSimulation) {
      return 'A szimuláció tudomásulvétele szükséges a leadáshoz.';
    }
    return null;
  });

  /** Rendered when the last submit attempt did not produce an
   *  order: a declined or failed commit, or an outcome that is not
   *  yet known. screens.md S4.4: "Failed payment offers Retry/change
   *  method… An uncertain response says processing outcome not
   *  known, not definitive rejection." */
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

    // This component is `OrderSubmission`'s orchestrator
    // (`components.md:632`): it polls the submission service and
    // maps each tick onto `PaymentProgress`'s declared inputs, so
    // that component never subscribes to the service itself.
    const stopWatching = this.orderSubmission.watchProgress((tick) => {
      this.latestTick.set(tick);
    });
    this.destroyRef.onDestroy(stopWatching);
  }

  // ---------------------------------------------------------------------------
  // User interactions
  // ---------------------------------------------------------------------------

  onBack(): void {
    void this.router.navigate(['/penztar/szallitas']);
  }

  onEditContact(): void {
    this.quoteController.invalidate();
  }

  onEditDelivery(): void {
    this.quoteController.invalidate();
  }

  onRefresh(): void {
    if (this.busy()) return;
    this.submitFailure.set(null);
    void this.quoteController.refresh();
  }

  openTerms(): void {
    this.termsOpened.set(true);
  }

  closeTerms(): void {
    this.termsOpened.set(false);
  }

  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      this.submitted.set(true);
      return;
    }
    this.submitted.set(true);
    await this.runSubmission();
  }

  /** Bound to `PaymentProgress`'s `(retryRequested)` from the
   *  declined / unknown states. Runs the same submission again
   *  without the CTA's `canSubmit()` gate — that gate refuses a
   *  retry while the outcome is `pending`, which is exactly the
   *  state this control exists to recover from. `CheckoutFacade`'s
   *  held idempotency key (per-fingerprint) is what makes this a
   *  true replay rather than a new request. */
  async onPaymentRetry(): Promise<void> {
    await this.runSubmission();
  }

  /** Bound to `PaymentProgress`'s `(changeMethodRequested)`. */
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
