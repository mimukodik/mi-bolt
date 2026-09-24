/**
 * S3-C5 — the review step on the 2.0.0 contract.
 *
 * Renders the review step of the 2.0.0 checkout (design §5.5, §6.3):
 *
 *   - the cart lines, the contact / delivery / payment snapshot read
 *     from the server-confirmed `draft`, and the four-row summary
 *     (subtotal, shipping fee, payment fee, total) the server
 *     recomputes on every read (`CheckoutSummary`);
 *   - the delivery and payment labels taken from the wire
 *     (`CheckoutOptions`), never a hard-coded Hungarian option name
 *     (`contracts/commerce/kommunikacio.md` §6);
 *   - the payment-return branches: a succeeded, declined, pending,
 *     unfinished or missing intent, each with the control that
 *     recovers it and no polling loop of any kind (design §5.3);
 *   - the 409 PRICE_CHANGED confirmation: both totals side by side
 *     and one control whose visible label names the new amount, so
 *     the new total can never be accepted silently (design §3.7);
 *   - the terms consent and the final CTA.
 *
 * It is purely presentational: it injects nothing and calls no
 * network. `review-page.ts` owns the facades, the submission and
 * every navigation, and drives this component through inputs.
 */

import {
  afterNextRender,
  Component,
  computed,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';

import type { ElementRef } from '@angular/core';

import { Button } from '../../shared/ui/button/button';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PriceBlock } from '../../shared/ui/price-block/price-block';
import { SkeletonLeave } from '../../shared/ui/skeleton-leave/skeleton-leave';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import { isHTMLInputElement } from '../../shared/utils/event-target';
import { OrderSummary } from '../cart/order-summary';
import { cartLinesKey, checkoutKeys } from './checkout-keys';
import { CheckoutStepHeader, type CheckoutCrumb } from './checkout-step-header';
import { TermsDialog } from './terms-dialog';

import type { Address } from '@mi-bolt/api/models/address';
import type { Cart } from '@mi-bolt/api/models/cart';
import type { CheckoutOptions } from '@mi-bolt/api/models/checkout-options';
import type { CheckoutSession } from '@mi-bolt/api/models/checkout-session';
import type { CheckoutSummary } from '@mi-bolt/api/models/checkout-summary';
import type { Money } from '@mi-bolt/api/models/money';
import type { PaymentIntent } from '@mi-bolt/api/models/payment-intent';
import type { IntentDropReason, PriceChange } from './checkout.facade';

/**
 * The seven states the review surface can be in (design §6.3).
 * `conflict` follows the shared version counter of the cart and the
 * checkout session.
 */
export type CheckoutViewState =
  'loading' | 'ready' | 'price-changed' | 'stock-error' | 'conflict' | 'submitting' | 'error';

/** One cart line as this template renders it. Keyed by `variantId`:
 *  the 2.0.0 `CartItem` has no `id` member. */
interface ReviewLineDisplay {
  readonly variantId: string;
  readonly productName: string;
  readonly variantLabel: string;
  readonly quantity: number;
  readonly unitPriceText: string;
  readonly lineTotal: Money;
}

/** Rendered when an option id has no matching entry on the wire. */
const UNKNOWN_LABEL = '—';

@Component({
  selector: 'app-review-step',
  imports: [
    Button,
    CheckoutStepHeader,
    LoadingState,
    OrderSummary,
    PriceBlock,
    SkeletonLeave,
    StatusMessage,
    TermsDialog,
  ],
  templateUrl: './review-step.html',
  styleUrl: './review-step.scss',
})
export class ReviewStep {
  /** The server's recomputed summary. Null only while it loads. */
  readonly summary = input<CheckoutSummary | null>(null);
  readonly cart = input.required<Cart>();
  readonly draft = input.required<CheckoutSession>();
  /** Source of every delivery and payment label on this screen. */
  readonly options = input<CheckoutOptions | null>(null);
  readonly state = input.required<CheckoutViewState>();
  /** The active payment intent, or null when none has been read. */
  readonly paymentIntent = input<PaymentIntent | null>(null);
  /** Non-null while a 409 PRICE_CHANGED awaits confirmation. */
  readonly priceChange = input<PriceChange | null>(null);
  /** True when the draft pays by card and no intent is on the facade. */
  readonly paymentIntentMissing = input<boolean>(false);
  /** True when a payment was started earlier in this session, which
   *  is what tells "the intent is gone" apart from "no payment has
   *  been started yet" (design §5.3's 404 row). */
  readonly paymentStarted = input<boolean>(false);
  /** Why the facade dropped the card intent this draft held, when it
   *  did; the missing-payment sentence names it. */
  readonly intentDropped = input<IntentDropReason | null>(null);

  readonly editRequested = output<'contact' | 'delivery'>();
  readonly submitRequested = output();
  /** 412: the shopper asks the facade to replay the failed write. */
  readonly retryRequested = output();
  /** 409 PRICE_CHANGED: the new total is accepted explicitly. */
  readonly priceChangeConfirmed = output();
  readonly paymentRetryRequested = output();
  readonly paymentChangeMethodRequested = output();
  /** pending: exactly one re-read, never a loop. */
  readonly paymentCheckRequested = output();
  /** requires_action: back to the payment page's redirect URL. */
  readonly backToPaymentRequested = output();
  /** No intent: start one. */
  readonly newPaymentRequested = output();

  /** The cart's lines as the key the terms tick is stored under. */
  private readonly cartLines = computed<string>(() => cartLinesKey(this.cart()));

  /** Local presentation state. The wire body sends `acceptedTerms`
   *  as the literal `true` (`order-submission.ts:208`) because
   *  `onSubmit` never emits until this is checked. It starts from
   *  the tick kept in sessionStorage for these cart lines, because
   *  the card payment returns by a full page load that rebuilds this
   *  step, and it clears when the lines change (owner, 2026-09-23:
   *  "Kosárváltozáskor törlődjön";
   *  https://angular.dev/guide/signals/linked-signal). */
  readonly acceptedTerms = linkedSignal<string, boolean>({
    source: this.cartLines,
    computation: (lines) => checkoutKeys.termsAccepted(lines),
  });
  /** Whether the shopper left the terms checkbox. It resets with the
   *  cart lines, like the tick, so a tick cleared by a cart change is
   *  not flagged as an error the shopper never made on these lines. */
  private readonly termsTouched = linkedSignal<string, boolean>({
    source: this.cartLines,
    computation: () => false,
  });
  /** Whether the shopper has pressed the CTA on these cart lines —
   *  flips the consent from "default" to "submitted-invalid". It
   *  resets with the cart lines, like the tick, so a click on the old
   *  lines does not flag a tick the cart change cleared. */
  readonly submitted = linkedSignal<string, boolean>({
    source: this.cartLines,
    computation: () => false,
  });

  /** Whether the demo terms dialog is open. */
  readonly termsOpened = signal<boolean>(false);

  private readonly termsInput = viewChild<ElementRef<HTMLInputElement>>('termsInput');
  private readonly stateBanner = viewChild<ElementRef<HTMLElement>>('stateBanner');
  private readonly ctaExplanationEl = viewChild<ElementRef<HTMLElement>>('ctaExplanation');
  private readonly injector = inject(Injector);

  protected readonly crumbs: readonly CheckoutCrumb[] = [
    { label: 'Főoldal', link: '/' },
    { label: 'Kosár', link: '/penztar/kosar' },
    { label: 'Adatok', link: '/penztar/adatok' },
    { label: 'Szállítás', link: '/penztar/szallitas' },
  ];

  readonly items = computed(() => this.cart().items);

  readonly lines = computed<readonly ReviewLineDisplay[]>(() =>
    this.items().map((item) => ({
      variantId: item.variantId,
      productName: item.productName,
      variantLabel: `${item.colorName} · ${String(item.storageGb)} GB`,
      quantity: item.quantity,
      unitPriceText: PriceBlock.formatHuf(item.unitPrice.amount),
      lineTotal: item.lineTotal,
    })),
  );

  // ---------------------------------------------------------------------------
  // Contact / delivery / payment snapshot, read from the server-confirmed
  // draft rather than from a form the shopper may not have saved.
  // ---------------------------------------------------------------------------

  readonly contactName = computed<string>(() => (this.draft().contact?.fullName ?? '').trim());
  readonly contactEmail = computed<string>(() => (this.draft().contact?.email ?? '').trim());
  readonly contactPhone = computed<string>(() => (this.draft().contact?.phone ?? '').trim());

  /** The delivery address, or null for pickup: the pickup arm of
   *  `DeliverySelection` has no address member at all, so the
   *  narrowing on `optionId` is what reaches `address` without a cast. */
  readonly deliveryAddress = computed<Address | null>(() => {
    const delivery = this.draft().delivery;
    if (delivery?.optionId !== 'home_delivery') return null;
    return delivery.address;
  });

  /** The invoice name and address. Required for every order, pickup
   *  included, but absent from the draft until the delivery step has
   *  been saved. */
  readonly billingName = computed<string>(() => this.draft().billing?.name ?? UNKNOWN_LABEL);
  readonly billingAddress = computed<Address | null>(() => this.draft().billing?.address ?? null);

  /** The template's own missing-value placeholder, so the glyph has
   *  one definition on this screen. */
  protected readonly unknownLabel = UNKNOWN_LABEL;

  readonly deliveryLabel = computed<string>(() => {
    const id = this.draft().delivery?.optionId;
    const options = this.options();
    if (id === undefined || options === null) return UNKNOWN_LABEL;
    return options.deliveryOptions.find((option) => option.id === id)?.label ?? UNKNOWN_LABEL;
  });

  readonly paymentLabel = computed<string>(() => {
    const method = this.draft().payment?.method;
    const options = this.options();
    if (method === undefined || options === null) return UNKNOWN_LABEL;
    return options.paymentMethods.find((option) => option.id === method)?.label ?? UNKNOWN_LABEL;
  });

  // ---------------------------------------------------------------------------
  // The payment-return branch table (design §5.3). Every sentence is
  // fixed copy; the server's English `detail` never reaches the screen.
  // ---------------------------------------------------------------------------

  readonly paymentStatusMessage = computed<string | null>(() => {
    const intent = this.paymentIntent();
    if (intent === null) {
      if (!this.paymentIntentMissing()) return null;
      switch (this.intentDropped()) {
        case 'stale':
          return 'A korábbi kártyás fizetés már nem érvényes, mert közben megváltozott a rendelés. Indíts új fizetést.';
        case 'refused':
          return 'Ez a fizetés már egy leadott rendeléshez tartozik. Indíts új fizetést.';
        case null:
          return this.paymentStarted()
            ? 'A fizetési szándék nem található.'
            : 'A kártyás fizetéshez indítsd el a fizetést.';
      }
    }
    switch (intent.status) {
      case 'succeeded':
        return 'A fizetés jóváhagyva.';
      case 'declined':
        return 'A szimulált fizetés elutasítva.';
      case 'pending':
        return 'Az eredmény még nem ismert, ezért nem tekintjük elutasítottnak.';
      case 'requires_action':
        return 'A fizetés nem fejeződött be.';
    }
  });

  /** Label of the control that starts a payment. Names what the press
   *  does in each of the missing-intent cases. */
  readonly newPaymentLabel = computed<string>(() =>
    this.paymentStarted() || this.intentDropped() !== null
      ? 'Új fizetés indítása'
      : 'Fizetés indítása',
  );

  // ---------------------------------------------------------------------------
  // The price-change confirmation (design §3.7).
  // ---------------------------------------------------------------------------

  /** The confirm control names the new total, so pressing it is the
   *  shopper's explicit acceptance of that amount and nothing else. */
  readonly priceChangeConfirmLabel = computed<string>(() => {
    const change = this.priceChange();
    if (change === null) return '';
    return `Elfogadom az új végösszeget: ${PriceBlock.formatHuf(change.currentTotal.amount)} Ft`;
  });

  // ---------------------------------------------------------------------------
  // Per-state banner copy. `CheckoutViewState` carries no payload —
  // the backend `detail` is never rendered (R15) — so these are fixed.
  // ---------------------------------------------------------------------------

  readonly priceChangedMessage = 'A végösszeg időközben megváltozott.';
  readonly conflictMessage = 'Az adatok időközben megváltoztak. Ellenőrizd és próbáld újra.';
  readonly outOfStockMessage =
    'Egy vagy több változat elfogyott. Visszavonulhatsz a kosárhoz a cikk korrigálásához.';
  readonly errorMessage = 'A rendelés leadása nem sikerült.';

  /** Standing "this is a demo" notice rendered as `app-status-message` on
   *  this screen. Persistent: the primitive hides its dismiss button
   *  when `[persistent]` is true (MIM-240b1). */
  readonly demoNoticeMessage =
    'Demó pénztár. A rendelés leadása nem küld valódi megrendelést, nem indít valódi fizetést, és nem küld e-mailt. Az adatok a böngésző memóriájában maradnak.';

  // ---------------------------------------------------------------------------
  // Consent gating
  // ---------------------------------------------------------------------------

  readonly termsConsentState = computed<string>(() => {
    if (!this.acceptedTerms() && this.termsTouched()) return 'touched-invalid';
    if (this.submitted() && !this.acceptedTerms()) return 'submitted-invalid';
    return 'default';
  });

  readonly termsConsentMessage = computed<string | null>(() => {
    if (this.termsConsentState() === 'default') return null;
    return 'A demó feltételek elfogadása kötelező.';
  });

  /**
   * The CTA is live when the state is `ready`, or `error` after a
   * failed submit, where a click resubmits the order (the owner's
   * decision: the error banner's try-again is not a dead end). Beside
   * the state, the server must call the draft complete, the terms must
   * be accepted, no price change may be awaiting confirmation (§3.7),
   * and — for a card draft — the payment must already have succeeded.
   * A card order is never placed on an unauthorised intent.
   */
  readonly canSubmit = computed<boolean>(() => {
    const state = this.state();
    if (state !== 'ready' && state !== 'error') return false;
    if (!this.draft().complete) return false;
    if (!this.acceptedTerms()) return false;
    if (this.priceChange() !== null) return false;
    if (this.draft().payment?.method === 'card') {
      return this.paymentIntent()?.status === 'succeeded';
    }
    return true;
  });

  /** A card draft whose intent has not succeeded. The CTA is natively
   *  disabled while this holds, because a card order is never placed
   *  without a payment (owner's decision); cash on delivery keeps the
   *  always-active CTA. */
  readonly cardPaymentMissing = computed<boolean>(
    () => this.draft().payment?.method === 'card' && this.paymentIntent()?.status !== 'succeeded',
  );

  /** The first unmet condition, in price change, missing data, card
   *  payment, terms, in that order. Null when the CTA is live, and null
   *  for the three failure states whose banner already says what
   *  happened. */
  readonly ctaExplanation = computed<string | null>(() => {
    if (this.canSubmit()) return null;
    const state = this.state();
    if (state === 'submitting') return 'A véglegesítés folyamatban van; kérlek várj.';
    if (state === 'loading') return 'A rendelés adatai még betöltés alatt vannak.';
    if (state === 'conflict' || state === 'stock-error' || state === 'error') return null;
    if (this.priceChange() !== null) {
      return 'Erősítsd meg az új végösszeget a rendelés leadásához.';
    }
    if (!this.draft().complete) {
      return 'Hiányzó adatok: egészítsd ki a korábbi lépéseket a rendelés leadásához.';
    }
    if (this.cardPaymentMissing()) {
      return 'A kártyás fizetés jóváhagyása szükséges a rendelés leadásához.';
    }
    if (!this.acceptedTerms()) return 'A demó feltételek elfogadása szükséges a leadáshoz.';
    return null;
  });

  // ---------------------------------------------------------------------------
  // User interactions
  // ---------------------------------------------------------------------------

  onEditContact(): void {
    this.editRequested.emit('contact');
  }

  onEditDelivery(): void {
    this.editRequested.emit('delivery');
  }

  /** Billing is entered on the delivery step (design §6.2), so its
   *  edit control asks for that step rather than one of its own. */
  onEditBilling(): void {
    this.editRequested.emit('delivery');
  }

  openTerms(): void {
    this.termsOpened.set(true);
  }

  closeTerms(): void {
    this.termsOpened.set(false);
  }

  onAcceptedTermsChange(event: Event): void {
    if (!isHTMLInputElement(event.target)) return;
    this.acceptedTerms.set(event.target.checked);
    checkoutKeys.setTermsAccepted(event.target.checked ? this.cartLines() : null);
  }

  onAcceptedTermsBlur(): void {
    this.termsTouched.set(true);
  }

  /** The CTA is never disabled for an unmet condition except an unpaid
   *  card draft (`cardPaymentMissing`) (owner, 2026-09-22: "Mindig
   *  aktív, kattintásra hibák"): a click that
   *  cannot submit marks the terms and, in the conflict, stock-error
   *  and error states moves focus to that state's banner (its
   *  explanation), otherwise to the unticked terms, and with the
   *  terms ticked to the explanation under the button. Disabled while
   *  submitting and for an unpaid card draft. In the error state a
   *  click that can submit resubmits. */
  onSubmit(): void {
    if (this.state() === 'submitting') return;
    this.submitted.set(true);
    if (this.canSubmit()) {
      this.submitRequested.emit();
      return;
    }
    const state = this.state();
    if (state === 'conflict' || state === 'stock-error' || state === 'error') {
      this.focusAfterRender(() => this.stateBanner()?.nativeElement.focus());
      return;
    }
    if (!this.acceptedTerms()) {
      this.focusAfterRender(() => this.termsInput()?.nativeElement.focus({ focusVisible: true }));
      return;
    }
    this.focusAfterRender(() => this.ctaExplanationEl()?.nativeElement.focus());
  }

  /** Runs `focus` after the next render, once the marking the click
   *  caused is on the page (WAI forms tutorial: move focus to the
   *  first thing to fix). */
  private focusAfterRender(focus: () => void): void {
    afterNextRender(focus, { injector: this.injector });
  }
}
