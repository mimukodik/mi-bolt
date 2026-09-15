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
 * each carry a `Szerkesztés` link that navigates back to the
 * matching step. The in-memory form survives the round trip, so the
 * user does not have to re-type anything.
 *
 * The page does NOT own the draft save. It delegates to the
 * `CheckoutFacade` (T19) the same way `ContactStep` and
 * `DeliveryStep` do.
 */

import {
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  FormField,
  type FieldTree,
} from '@angular/forms/signals';

import { CheckoutFacade } from './checkout.facade';
import { CartFacade } from '../cart/cart.facade';
import {
  QuoteController,
  type QuoteState,
} from './quote-state';

import { Button } from '../../shared/ui/button/button';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PriceBlock, type Money } from '../../shared/ui/price-block/price-block';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import { OrderSummary } from '../cart/order-summary';

import type { CartItem } from '../../api/generated/models/cart-item';
import type { CheckoutFormModel } from './checkout-form.model';

import { TermsDialog } from './terms-dialog';

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
  imports: [
    RouterLink,
    FormField,
    Button,
    LoadingState,
    PriceBlock,
    StatusMessage,
    OrderSummary,
    TermsDialog,
  ],
  template: `
    <section
      class="review"
      [attr.data-status]="stateKind()"
      data-testid="review-page"
    >
      <header class="heading">
        <nav class="breadcrumbs" aria-label="Navigáció">
          <a routerLink="/" class="breadcrumb">Főoldal</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <a routerLink="/penztar/kosar" class="breadcrumb">Kosár</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <a routerLink="/penztar/adatok" class="breadcrumb">Adatok</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <a routerLink="/penztar/szallitas" class="breadcrumb">Szállítás</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <span class="breadcrumb is-current" aria-current="page">
            Ellenőrzés
          </span>
        </nav>
        <h1 class="title">Rendelés véglegesítése</h1>
        <p class="demo-notice" data-testid="review-demo-notice" role="note">
          <strong>Demó pénztár.</strong>
          A rendelés leadása nem küld valódi megrendelést, nem
          indít valódi fizetést, és nem küld e-mailt. Az adatok a
          böngésző memóriájában maradnak.
        </p>
      </header>

      <div class="layout" data-testid="review-layout">
        <div class="column">
          <article class="card" data-testid="review-contact">
            <header class="card-header">
              <h2 class="card-title">Kapcsolattartási adatok</h2>
              <a
                routerLink="/penztar/adatok"
                class="edit-link"
                data-testid="review-edit-contact"
                (click)="onEditContact()"
              >
                Szerkesztés
              </a>
            </header>
            <dl class="data-list">
              <div class="row">
                <dt>Név</dt>
                <dd>{{ contactName() }}</dd>
              </div>
              <div class="row">
                <dt>E-mail</dt>
                <dd>{{ contactEmail() }}</dd>
              </div>
              <div class="row">
                <dt>Telefon</dt>
                <dd>{{ contactPhone() }}</dd>
              </div>
            </dl>
          </article>

          <article class="card" data-testid="review-delivery">
            <header class="card-header">
              <h2 class="card-title">Szállítási és fizetési mód</h2>
              <a
                routerLink="/penztar/szallitas"
                class="edit-link"
                data-testid="review-edit-delivery"
                (click)="onEditDelivery()"
              >
                Szerkesztés
              </a>
            </header>
            <dl class="data-list">
              <div class="row">
                <dt>Szállítási mód</dt>
                <dd>{{ deliveryLabel() }}</dd>
              </div>
              @if (deliveryAddress() !== null) {
                <div class="row" data-testid="review-delivery-address">
                  <dt>Cím</dt>
                  <dd>
                    {{ deliveryAddress()!.line1 }}<br />
                    @if (deliveryAddress()!.line2) {
                      {{ deliveryAddress()!.line2 }}<br />
                    }
                    {{ deliveryAddress()!.postalCode }}
                    {{ deliveryAddress()!.city }}
                  </dd>
                </div>
              }
              <div class="row">
                <dt>Fizetési mód</dt>
                <dd>{{ paymentLabel() }}</dd>
              </div>
            </dl>
          </article>

          <article class="card" data-testid="review-items">
            <header class="card-header">
              <h2 class="card-title">Kosár tartalma</h2>
              <span class="card-hint">{{ items().length }} tétel</span>
            </header>
            @if (items().length === 0) {
              <p class="empty" data-testid="review-items-empty">
                A kosár jelenleg üres.
              </p>
            } @else {
              <ul class="line-list">
                @for (line of lines(); track line.id) {
                  <li class="line" data-testid="review-line">
                    <div class="line-body">
                      <p class="line-name">{{ line.productName }}</p>
                      <p class="line-variant">{{ line.variantLabel }}</p>
                      <p class="line-quantity">
                        {{ line.quantity }} ×
                        <app-price-block
                          [money]="line.unitPrice"
                          [label]="'Egységár'"
                          [status]="'success'"
                        ></app-price-block>
                      </p>
                    </div>
                    <div class="line-total">
                      <app-price-block
                        [money]="line.lineTotal"
                        [label]="'Sor végösszeg'"
                        [status]="'success'"
                      ></app-price-block>
                    </div>
                  </li>
                }
              </ul>
            }
          </article>

          @if (state() !== null) {
            <div class="status-row" data-testid="review-status">
              @switch (state()!.kind) {
                @case ('loading') {
                  <app-loading-state
                    variant="lines"
                    label="Árajánlat frissítése"
                  ></app-loading-state>
                }
                @case ('price-changed') {
                  <app-status-message
                    [message]="priceChangedMessage()"
                    severity="error"
                    [persistent]="true"
                    (dismissed)="onDismissStatus()"
                  ></app-status-message>
                }
                @case ('quote-expired') {
                  <app-status-message
                    [message]="quoteExpiredMessage()"
                    severity="error"
                    [persistent]="true"
                    (dismissed)="onDismissStatus()"
                  ></app-status-message>
                }
                @case ('out-of-stock') {
                  <app-status-message
                    [message]="outOfStockMessage()"
                    severity="error"
                    [persistent]="true"
                    (dismissed)="onDismissStatus()"
                  ></app-status-message>
                }
                @case ('field-error') {
                  <app-status-message
                    [message]="fieldErrorMessage()"
                    severity="error"
                    [persistent]="true"
                    (dismissed)="onDismissStatus()"
                  ></app-status-message>
                }
              }
            </div>
          }

          <article class="card" data-testid="review-consents">
            <h2 class="card-title">Demó feltételek</h2>
            <p class="hint">
              Mindkét jelölőnégyzet elfogadása kötelező a
              demórendelés leadásához.
            </p>

            <div
              class="consent"
              [attr.data-state]="termsConsentState()"
              data-testid="review-consent-terms"
            >
              <label class="consent-label" for="review-consent-terms-input">
                <input
                  id="review-consent-terms-input"
                  type="checkbox"
                  class="checkbox"
                  [formField]="reviewForm.acceptedTerms"
                  data-testid="review-consent-terms-input"
                />
                <span class="consent-text">
                  Elfogadom a
                  <button
                    type="button"
                    class="terms-link"
                    (click)="openTerms()"
                    data-testid="review-consent-terms-button"
                  >
                    demó vásárlási feltételeket
                  </button>
                  (szimulált folyamat, nem valós szerződés).
                </span>
              </label>
              @if (termsConsentMessage() !== null) {
                <p
                  class="consent-message"
                  id="review-consent-terms-message"
                  data-testid="review-consent-terms-message"
                  role="alert"
                >
                  {{ termsConsentMessage() }}
                </p>
              }
            </div>

            <div
              class="consent"
              [attr.data-state]="simulationConsentState()"
              data-testid="review-consent-simulation"
            >
              <label
                class="consent-label"
                for="review-consent-simulation-input"
              >
                <input
                  id="review-consent-simulation-input"
                  type="checkbox"
                  class="checkbox"
                  [formField]="reviewForm.acknowledgedSimulation"
                  data-testid="review-consent-simulation-input"
                />
                <span class="consent-text">
                  Tudomásul veszem, hogy ez egy szimuláció: nem
                  történik valódi rendelés, fizetés vagy e-mail
                  küldés.
                </span>
              </label>
              @if (simulationConsentMessage() !== null) {
                <p
                  class="consent-message"
                  id="review-consent-simulation-message"
                  data-testid="review-consent-simulation-message"
                  role="alert"
                >
                  {{ simulationConsentMessage() }}
                </p>
              }
            </div>
          </article>

          <div class="actions" data-testid="review-actions">
            <app-button
              variant="secondary"
              size="comfortable"
              label="Vissza a szállításhoz"
              (pressed)="onBack()"
              data-testid="review-back"
            ></app-button>
            <app-button
              variant="primary"
              size="comfortable"
              [label]="'Demórendelés véglegesítése'"
              [loadingLabel]="'Véglegesítés…'"
              [loading]="submitting()"
              [disabled]="!canSubmit()"
              (pressed)="onSubmit()"
              data-testid="review-submit"
            ></app-button>
          </div>

          @if (ctaExplanation() !== null) {
            <p
              class="cta-explanation"
              data-testid="review-cta-explanation"
              role="note"
            >
              {{ ctaExplanation() }}
            </p>
          }
        </div>

        <aside class="summary" aria-label="Rendelés végösszege" data-testid="review-summary">
          <h2 class="summary-title">Rendelés végösszege</h2>

          @if (readySummary() !== null) {
            <app-order-summary
              [subtotal]="readySummary()!.subtotal"
              [shipping]="readySummary()!.shipping"
              [footnote]="summaryFootnote()"
            ></app-order-summary>
          } @else {
            <div class="summary-loading" data-testid="review-summary-loading">
              <app-loading-state
                variant="lines"
                label="Árajánlat betöltése"
              ></app-loading-state>
            </div>
          }

          <dl class="summary-rows">
            <div class="row">
              <dt>Fizetési mód</dt>
              <dd data-testid="review-payment">{{ paymentLabel() }}</dd>
            </div>
            <div class="row">
              <dt>Szállítási mód</dt>
              <dd>{{ deliveryLabel() }}</dd>
            </div>
            <div class="row">
              <dt>Demórendelés státusza</dt>
              <dd>
                <span
                  class="badge badge--demo"
                  data-testid="review-demo-badge"
                >
                  Demó
                </span>
              </dd>
            </div>
          </dl>

          <button
            type="button"
            class="refresh"
            (click)="onRefresh()"
            [disabled]="busy()"
            data-testid="review-refresh"
          >
            Árajánlat frissítése
          </button>
        </aside>
      </div>

      <app-terms-dialog
        [opened]="termsOpened()"
        (closed)="closeTerms()"
      ></app-terms-dialog>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .review {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
      }

      .heading {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .breadcrumbs {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .breadcrumb {
        color: var(--color-text-secondary);
        text-decoration: none;
      }

      .breadcrumb:hover,
      .breadcrumb:focus-visible {
        text-decoration: underline;
      }

      .breadcrumb.is-current {
        color: var(--color-text-primary);
        font-weight: var(--weight-medium);
      }

      .breadcrumb__sep {
        margin: 0 var(--space-1);
      }

      .title {
        margin: 0;
        font-size: var(--type-page-title-mobile);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      @media (min-width: 640px) {
        .title {
          font-size: var(--type-page-title);
        }
      }

      .demo-notice {
        margin: 0;
        padding: var(--space-3) var(--space-4);
        background: var(--color-brand-accent-soft);
        border: 1px solid var(--color-brand-accent);
        border-radius: var(--radius-card);
        color: var(--color-text-primary);
        font-size: var(--type-helper);
        line-height: var(--line-height-body);
      }

      .demo-notice strong {
        font-weight: var(--weight-bold);
        color: var(--color-brand-ink);
        margin-right: var(--space-1);
      }

      .layout {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }

      .column {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
        min-width: 0;
      }

      .card {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-5);
        background: var(--color-surface-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
      }

      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }

      .card-title {
        margin: 0;
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      .card-hint,
      .edit-link {
        font-size: var(--type-helper);
      }

      .card-hint {
        color: var(--color-text-secondary);
      }

      .edit-link {
        color: var(--color-brand-ink);
        text-decoration: underline;
      }

      .edit-link:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .data-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin: 0;
      }

      .row {
        display: grid;
        grid-template-columns: minmax(7rem, auto) 1fr;
        gap: var(--space-3);
        align-items: baseline;
      }

      .row dt {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .row dd {
        margin: 0;
        font-size: var(--type-body);
        color: var(--color-text-primary);
      }

      .line-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .line {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: var(--space-4);
        align-items: center;
        padding: var(--space-3) 0;
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .line:last-child {
        border-bottom: 0;
      }

      .line-name {
        margin: 0;
        font-weight: var(--weight-medium);
        color: var(--color-text-primary);
      }

      .line-variant,
      .empty,
      .hint {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .line-quantity {
        margin: var(--space-1) 0 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
      }

      .cta-explanation {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        text-align: center;
      }

      .consent-message {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-status-error);
      }

      .status-row {
        display: block;
      }

      .consent {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: var(--space-3);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-control);
      }

      .consent[data-state='touched-invalid'],
      .consent[data-state='submitted-invalid'] {
        border-color: var(--color-status-error);
        background: var(--color-brand-accent-soft);
      }

      .consent-label {
        display: inline-flex;
        align-items: flex-start;
        gap: var(--space-3);
        cursor: pointer;
        font-size: var(--type-body);
        color: var(--color-text-primary);
        line-height: var(--line-height-body);
      }

      .checkbox,
      .terms-link {
        font-family: inherit;
      }

      .checkbox {
        margin-top: var(--space-1);
        width: 20px;
        height: 20px;
        accent-color: var(--color-brand-ink);
      }

      .checkbox:focus-visible,
      .terms-link:focus-visible,
      .refresh:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .terms-link {
        background: none;
        border: 0;
        padding: 0;
        font-size: inherit;
        color: var(--color-brand-ink);
        text-decoration: underline;
        cursor: pointer;
      }

      .consent-text {
        min-width: 0;
      }

      .actions {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .summary {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-5);
        background: var(--color-surface-section);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
        position: sticky;
        top: var(--space-5);
      }

      .summary-title {
        margin: 0;
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
      }

      .summary-rows {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        margin: 0;
      }

      .summary-loading {
        padding: var(--space-4) 0;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        padding: 0 var(--space-2);
        border-radius: var(--radius-badge);
        background: var(--color-brand-ink);
        color: var(--color-text-inverse);
        font-size: var(--type-meta);
        font-weight: var(--weight-bold);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .refresh {
        align-self: flex-start;
        background: none;
        border: 0;
        padding: var(--space-2) var(--space-3);
        font-size: var(--type-helper);
        color: var(--color-brand-ink);
        text-decoration: underline;
        cursor: pointer;
        min-height: var(--size-control);
      }

      .refresh:disabled {
        color: var(--color-text-secondary);
        text-decoration: none;
        cursor: not-allowed;
      }

      @media (min-width: 640px) {
        .card,
        .summary {
          padding: var(--space-6);
        }

        .actions {
          flex-direction: row;
          justify-content: space-between;
        }
      }

      @media (min-width: 1024px) {
        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: var(--space-6);
          align-items: start;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .review,
        .card,
        .summary {
          transition: none;
        }
      }
    `,
  ],
})
export class ReviewStep {
  private readonly cartFacade = inject(CartFacade);
  private readonly checkoutFacade = inject(CheckoutFacade);
  private readonly quoteController = inject(QuoteController);
  private readonly router = inject(Router);

  /** True while a network mutation (quote / payment intent / order)
   *  is in flight. */
  readonly submitting = signal<boolean>(false);

  /** Whether the user has tried to submit at least once — used to
   *  flip the per-consent error state from "default" to
   *  "submitted-invalid". */
  readonly submitted = signal<boolean>(false);

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
      variantLabel: `${item.colorName} · ${item.storageGb} GB`,
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
    () =>
      this.quoteController.busy() ||
      this.submitting() ||
      this.checkoutFacade.busy(),
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
    if (state === null || state.kind !== 'price-changed') {
      return 'A katalógus ára megváltozott.';
    }
    return `${state.detail} Erősítsd meg az új végösszeget a „Árajánlat frissítése” gombra kattintva.`;
  });

  readonly quoteExpiredMessage = computed<string>(() => {
    const state = this.state();
    if (state === null || state.kind !== 'quote-expired') {
      return 'Az árajánlat lejárt.';
    }
    return `${state.detail} Kattints a „Árajánlat frissítése” gombra az új végösszegért.`;
  });

  readonly outOfStockMessage = computed<string>(() => {
    const state = this.state();
    if (state === null || state.kind !== 'out-of-stock') {
      return 'Egy vagy több változat elfogyott.';
    }
    return `${state.detail} Visszavonulhatsz a kosárhoz a cikk korrigálásához.`;
  });

  readonly fieldErrorMessage = computed<string>(() => {
    const state = this.state();
    if (state === null || state.kind !== 'field-error') {
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
    void this.quoteController.refresh();
  }

  openTerms(): void {
    this.termsOpened.set(true);
  }

  closeTerms(): void {
    this.termsOpened.set(false);
  }

  onDismissStatus(): void {
    void this.quoteController.refresh();
  }

  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      this.submitted.set(true);
      return;
    }
    this.submitted.set(true);
    this.submitting.set(true);
    try {
      const paymentMethod = this.reviewForm().value().paymentMethod;
      if (paymentMethod === 'demo_card') {
        const intent = await this.checkoutFacade.createPaymentIntent();
        if (!intent.ok) {
          // Payment-decline is surfaced through the cart facade's
          // `error` signal; the form + cart are preserved.
          return;
        }
      }
      const order = await this.checkoutFacade.commitOrder();
      if (!order.ok) {
        return;
      }
      await this.router.navigate(['/penztar/siker', order.value.id]);
    } finally {
      this.submitting.set(false);
    }
  }
}