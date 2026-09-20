/**
 * T22 — final review step (S4.4).
 *
 * FIX-63 gave `ReviewStep` the signature `docs/spec/components.md:611-617`
 * declares: `quote`/`cart`/`draft`/`state` inputs, `editRequested`/
 * `refreshQuote`/`submitRequested` outputs. The component is purely
 * presentational: it renders the cart lines, the contact/delivery/payment
 * snapshot from `draft()`, the live quote total from `quote()`, and the
 * seven-member `ReviewState` the owning container (`review-page.ts`)
 * computes. It injects nothing, fetches nothing, and commits no order —
 * the container owns `QuoteController`, `OrderSubmission`, `CartFacade`,
 * `CheckoutFacade` and the `Router`, and renders `PaymentProgress` plus
 * the generic-error retry banner itself, because `ReviewState` is a
 * plain string union with no room for the backend `detail` or the
 * `pending`-versus-`declined` distinction those two surfaces need.
 *
 * Responsibilities kept here:
 *   - render the cart items, contact snapshot, delivery choice and
 *     payment method so the user can verify the order (T22-AC01);
 *   - render two unchecked consents (demo purchase + simulation
 *     acknowledgement) as local presentation state — nothing outside
 *     this screen reads them (`components.md:615` declares no
 *     field-tree input for `ReviewStep`), and the wire commit already
 *     sends `acceptedTerms`/`acknowledgedSimulation` as the literal
 *     `true` the domain requires (`checkout.facade.ts:677-678`). The
 *     first consent opens `TermsDialog`, built on `AccessibleDialog`
 *     for R23 compliance (T22-AC02);
 *   - expose the "Demórendelés véglegesítése" CTA only when `state()`
 *     is `'ready'` and both consents are checked (T22-AC04);
 *   - emit `submitRequested`, `refreshQuote` and `editRequested` for
 *     the container to act on;
 *   - render every state its own presentation covers — quoting, ready,
 *     expired, price-changed, stock-error, submitting, error — without
 *     erasing the order summary (T22-AC05).
 *
 * Edit affordances (T22-AC01): the contact and delivery sections each
 * carry a `Módosítás` link that emits `editRequested`; the in-memory
 * session survives the round trip.
 */

import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button } from '../../shared/ui/button/button';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PriceBlock, type Money } from '../../shared/ui/price-block/price-block';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import { OrderSummary } from '../cart/order-summary';
import { TermsDialog } from './terms-dialog';

import type { Cart } from '../../api/generated/models/cart';
import type { CartItem } from '../../api/generated/models/cart-item';
import type { Quote } from '../../api/generated/models/quote';
import type { CheckoutDraft } from './checkout-form.model';
import type { ReviewState } from './quote-state';

interface ReviewLineDisplay {
  readonly id: string;
  readonly productName: string;
  readonly variantLabel: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
}

@Component({
  selector: 'app-review-step',
  imports: [RouterLink, Button, LoadingState, PriceBlock, StatusMessage, OrderSummary, TermsDialog],
  templateUrl: './review-step.html',
  styleUrl: './review-step.scss',
})
export class ReviewStep {
  readonly quote = input<Quote | null>(null);
  readonly cart = input.required<Cart>();
  readonly draft = input.required<CheckoutDraft>();
  readonly state = input.required<ReviewState>();

  readonly editRequested = output<'contact' | 'delivery'>();
  readonly refreshQuote = output();
  readonly submitRequested = output();

  /** Whether the user has tried to submit at least once — used to
   *  flip the per-consent error state from "default" to
   *  "submitted-invalid". */
  readonly submitted = signal<boolean>(false);

  /** Local presentation state: nothing outside this screen reads
   *  either consent (`components.md:615`), and the wire commit already
   *  sends the literal `true` the domain requires once the container
   *  is allowed to submit at all. */
  readonly acceptedTerms = signal<boolean>(false);
  readonly acknowledgedSimulation = signal<boolean>(false);
  private readonly termsTouched = signal<boolean>(false);
  private readonly simulationTouched = signal<boolean>(false);

  /** Whether the demo terms dialog is open. */
  readonly termsOpened = signal<boolean>(false);

  /** Snapshot of the cart's items, mapped into the wire shape the
   *  template needs. */
  readonly items = computed<CartItem[]>(() => this.cart().items);

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

  // ---------------------------------------------------------------------------
  // Contact / delivery / payment snapshot, read from the server-confirmed
  // `draft` input rather than a live form the user may not have saved yet.
  // ---------------------------------------------------------------------------

  readonly contactName = computed<string>(() => (this.draft().contact?.fullName ?? '').trim());
  readonly contactEmail = computed<string>(() => (this.draft().contact?.email ?? '').trim());
  readonly contactPhone = computed<string>(() => (this.draft().contact?.phone ?? '').trim());

  readonly deliveryOptionId = computed<'home_delivery' | 'demo_pickup' | null>(
    () => this.draft().delivery?.optionId ?? null,
  );

  readonly deliveryAddress = computed<{
    line1: string;
    line2: string;
    postalCode: string;
    city: string;
  } | null>(() => {
    if (this.deliveryOptionId() !== 'home_delivery') return null;
    const address = this.draft().delivery?.address;
    if (address === undefined) return null;
    return {
      line1: address.line1.trim(),
      line2: (address.line2 ?? '').trim(),
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

  readonly paymentMethod = computed<'demo_card' | 'demo_cod' | null>(
    () => this.draft().paymentMethod ?? null,
  );

  readonly paymentLabel = computed<string>(() => {
    const m = this.paymentMethod();
    if (m === 'demo_card') return 'Bankkártya (szimulált)';
    if (m === 'demo_cod') return 'Utánvét (demó)';
    return 'Nincs kiválasztva';
  });

  // ---------------------------------------------------------------------------
  // Quote / state-driven summary
  // ---------------------------------------------------------------------------

  readonly busy = computed<boolean>(
    () => this.state() === 'quoting' || this.state() === 'submitting',
  );

  readonly readySummary = computed<{
    readonly subtotal: Money;
    readonly shipping: Money;
  } | null>(() => {
    const quote = this.quote();
    if (quote === null) return null;
    return { subtotal: quote.subtotal, shipping: quote.shipping };
  });

  readonly summaryFootnote = computed<string | null>(() => {
    const s = this.state();
    if (s === 'expired') {
      return 'Az árajánlat lejárt; frissítsd a „Árajánlat frissítése” gombra kattintva.';
    }
    if (s === 'price-changed') {
      return 'A katalógus ára megváltozott; a kosár frissítésre került, az új végösszeg fent látható.';
    }
    if (s === 'ready') {
      return 'Az árajánlat a mock munkamenetben 5 percig érvényes.';
    }
    return null;
  });

  // ---------------------------------------------------------------------------
  // Per-state banner copy. `ReviewState` carries no payload — the backend
  // `detail` string is not rendered (R15) — so these are fixed sentences.
  // ---------------------------------------------------------------------------

  readonly priceChangedMessage =
    'A katalógus ára megváltozott. Erősítsd meg az új végösszeget a „Árajánlat frissítése” gombra kattintva.';
  readonly quoteExpiredMessage =
    'Az árajánlat lejárt. Kattints a „Árajánlat frissítése” gombra az új végösszegért.';
  readonly outOfStockMessage =
    'Egy vagy több változat elfogyott. Visszavonulhatsz a kosárhoz a cikk korrigálásához.';
  readonly errorMessage = 'A rendelés leadása nem sikerült.';

  // ---------------------------------------------------------------------------
  // Consent gating
  // ---------------------------------------------------------------------------

  readonly termsConsentState = computed<string>(() => {
    if (!this.acceptedTerms() && this.termsTouched()) return 'touched-invalid';
    if (this.submitted() && !this.acceptedTerms()) return 'submitted-invalid';
    return 'default';
  });

  readonly simulationConsentState = computed<string>(() => {
    if (!this.acknowledgedSimulation() && this.simulationTouched()) return 'touched-invalid';
    if (this.submitted() && !this.acknowledgedSimulation()) return 'submitted-invalid';
    return 'default';
  });

  readonly termsConsentMessage = computed<string | null>(() => {
    if (this.termsConsentState() === 'default') return null;
    return 'A demó feltételek elfogadása kötelező.';
  });

  readonly simulationConsentMessage = computed<string | null>(() => {
    if (this.simulationConsentState() === 'default') return null;
    return 'A szimuláció tudomásulvétele kötelező.';
  });

  /** True when the CTA may be pressed: a fresh quote, both consents
   *  checked, and a complete draft (payment method + delivery chosen). */
  readonly canSubmit = computed<boolean>(() => {
    if (this.state() !== 'ready') return false;
    if (!this.acceptedTerms() || !this.acknowledgedSimulation()) return false;
    if (this.draft().paymentMethod === undefined) return false;
    if (this.draft().delivery === undefined) return false;
    return true;
  });

  /** Human-readable reason the CTA is disabled, rendered below the button. */
  readonly ctaExplanation = computed<string | null>(() => {
    if (this.canSubmit()) return null;
    const s = this.state();
    if (s === 'submitting') {
      return 'A véglegesítés folyamatban van; kérlek várj.';
    }
    if (s !== 'ready') {
      return 'Az árajánlat még nem áll készen; a frissítés gombra kattintva új árajánlatot kérhetsz.';
    }
    if (!this.acceptedTerms()) {
      return 'A demó feltételek elfogadása szükséges a leadáshoz.';
    }
    if (!this.acknowledgedSimulation()) {
      return 'A szimuláció tudomásulvétele szükséges a leadáshoz.';
    }
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

  onRefresh(): void {
    this.refreshQuote.emit();
  }

  openTerms(): void {
    this.termsOpened.set(true);
  }

  closeTerms(): void {
    this.termsOpened.set(false);
  }

  onAcceptedTermsChange(event: Event): void {
    this.acceptedTerms.set((event.target as HTMLInputElement).checked);
  }

  onAcceptedTermsBlur(): void {
    this.termsTouched.set(true);
  }

  onAcknowledgedSimulationChange(event: Event): void {
    this.acknowledgedSimulation.set((event.target as HTMLInputElement).checked);
  }

  onAcknowledgedSimulationBlur(): void {
    this.simulationTouched.set(true);
  }

  onSubmit(): void {
    this.submitted.set(true);
    if (!this.canSubmit()) return;
    this.submitRequested.emit();
  }
}
