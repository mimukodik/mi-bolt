/**
 * T24 — `OrderReceipt` presentational component (S4.5 receipt block).
 *
 * Renders the privacy-minimized `OrderReceipt` payload returned by
 * `GET /orders/{orderId}` (or by an in-memory commit). The component
 * is deliberately free of facade / route / network dependencies so it
 * can be reused outside `/penztar/siker/...` and so its assertions do
 * not depend on injector context.
 *
 * Contract:
 *
 *   - Every value rendered comes from the `receipt` input. The order
 *     number is the wire `orderNumber` (e.g. "DEMO-2026-0001"); the
 *     line items come from `items[]`; the totals come from `subtotal`,
 *     `shipping` and `total`; the payment method is mapped from
 *     `paymentMethod` to a Hungarian label.
 *   - The simulation notice is rendered as a prominent live region so
 *     keyboard and screen-reader users hear it once the receipt
 *     loads. The wording is fixed Hungarian ("demó") and explicitly
 *     states that no real payment, dispatch or e-mail took place.
 *   - The component never invents a price: every price is routed
 *     through `PriceBlock` and `Money` so a missing / non-HUF input
 *     gracefully renders the "—" empty state.
 *
 * The component is NOT a replacement for the page chrome (heading,
 * breadcrumbs, "Új vásárlás" CTA); those live in `success-step.ts`.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { PriceBlock } from '../../shared/ui/price-block/price-block';

import type { OrderLine } from '../../api/generated/models/order-line';
import type { OrderReceipt } from '../../api/generated/models/order-receipt';

const PAYMENT_LABELS: Readonly<Record<OrderReceipt['paymentMethod'], string>> = {
  demo_card: 'Bankkártya (szimulált)',
  demo_cod: 'Utánvét (demó)',
};

const DELIVERY_LABELS: Readonly<Record<OrderReceipt['deliveryOptionId'], string>> = {
  home_delivery: 'Házhozszállítás',
  demo_pickup: 'Bemutatótermi átvétel (demó)',
};

/**
 * Notice string rendered under the totals. Hungarian copy that makes
 * the simulation explicit without claiming any real-world consequence.
 */
const SIMULATION_NOTICE =
  'Nem történt valódi fizetés, rendelésküldés vagy e-mail-küldés — ez egy demó folyamat.';

@Component({
  selector: 'app-order-receipt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PriceBlock],
  template: `
    <article class="receipt" data-testid="order-receipt">
      <header class="receipt__header">
        <span class="receipt__badge" aria-hidden="true" data-testid="receipt-demo-badge">DEMO</span>
        <h2 class="receipt__heading" data-testid="receipt-heading">
          A demórendelésed elkészült
        </h2>
        <p class="receipt__order-number">
          <span class="receipt__label">Rendelésszám</span>
          <span class="receipt__value" data-testid="receipt-order-number">{{ receipt().orderNumber }}</span>
        </p>
      </header>

      <section class="receipt__lines" aria-label="Rendelt termékek" data-testid="receipt-lines">
        <h3 class="receipt__section-title">Termékek</h3>
        <ul class="lines">
          @for (line of receipt().items; track line.variantId) {
            <li class="line" data-testid="receipt-line">
              <div class="line__main">
                <span class="line__name">{{ line.productName }}</span>
                <span class="line__variant">
                  {{ line.colorName }} • {{ line.storageGb }} GB
                </span>
              </div>
              <div class="line__quantity">
                <span class="line__quantity-label">Mennyiség</span>
                <span class="line__quantity-value">{{ line.quantity }} db</span>
              </div>
              <div class="line__totals">
                <app-price-block
                  [money]="line.lineTotal"
                  [label]="'Sor végösszeg'"
                  [status]="'success'"
                ></app-price-block>
              </div>
            </li>
          } @empty {
            <li class="lines__empty">A rendeléshez nem tartozik terméksor.</li>
          }
        </ul>
      </section>

      <section class="receipt__totals" aria-label="Összegzés" data-testid="receipt-totals">
        <h3 class="receipt__section-title">Összegzés</h3>
        <dl class="totals">
          <div class="totals__row" data-testid="receipt-row-subtotal">
            <dt>Részösszeg</dt>
            <dd>
              <app-price-block
                [money]="receipt().subtotal"
                [label]="'Részösszeg'"
                [status]="'success'"
              ></app-price-block>
            </dd>
          </div>
          <div class="totals__row" data-testid="receipt-row-shipping">
            <dt>Szállítási díj</dt>
            <dd>
              <app-price-block
                [money]="receipt().shipping"
                [label]="'Szállítási díj'"
                [status]="'success'"
              ></app-price-block>
            </dd>
          </div>
          <div class="totals__row totals__row--strong" data-testid="receipt-row-total">
            <dt>Végösszeg</dt>
            <dd>
              <app-price-block
                [money]="receipt().total"
                [label]="'Végösszeg'"
                [status]="'success'"
              ></app-price-block>
            </dd>
          </div>
        </dl>
      </section>

      <section class="receipt__meta" aria-label="Fizetés és szállítás" data-testid="receipt-meta">
        <div class="meta__row" data-testid="receipt-row-payment">
          <dt>Fizetési mód</dt>
          <dd>{{ paymentLabel() }}</dd>
        </div>
        <div class="meta__row" data-testid="receipt-row-delivery">
          <dt>Szállítási mód</dt>
          <dd>{{ deliveryLabel() }}</dd>
        </div>
        <div class="meta__row" data-testid="receipt-row-status">
          <dt>Státusz</dt>
          <dd>Demó rendelés visszaigazolva</dd>
        </div>
      </section>

      <p
        class="receipt__notice"
        role="status"
        aria-live="polite"
        data-testid="receipt-simulation-notice"
      >
        <strong>Demo figyelmeztetés.</strong>
        {{ simulationNotice() }}
      </p>

      <div class="receipt__actions" data-testid="receipt-actions">
        <ng-content></ng-content>
      </div>
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .receipt {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
        padding: var(--space-5);
        background: var(--color-surface-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
        color: var(--color-text-primary);
      }

      .receipt__header {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding-bottom: var(--space-4);
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .receipt__badge {
        display: inline-flex;
        align-self: flex-start;
        align-items: center;
        padding: var(--space-1) var(--space-3);
        background: var(--color-brand-accent);
        color: var(--color-text-primary);
        font-weight: var(--weight-bold);
        font-size: var(--type-meta);
        border-radius: var(--radius-badge);
        letter-spacing: 0.05em;
      }

      .receipt__heading {
        margin: 0;
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      .receipt__order-number {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        margin: 0;
      }

      .receipt__label {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .receipt__value {
        font-family: var(--font-stack-mono, monospace);
        font-size: var(--type-body);
        font-weight: var(--weight-medium);
      }

      .receipt__section-title {
        margin: 0 0 var(--space-3);
        font-size: var(--type-body);
        font-weight: var(--weight-bold);
        color: var(--color-text-primary);
      }

      .lines {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .line {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: var(--space-3);
        align-items: center;
        padding: var(--space-3);
        background: var(--color-surface-section);
        border-radius: var(--radius-card);
      }

      .line__main {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 0;
      }

      .line__name {
        font-weight: var(--weight-medium);
        font-size: var(--type-body);
        color: var(--color-text-primary);
      }

      .line__variant {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .line__quantity {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: var(--space-1);
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .line__quantity-value {
        font-size: var(--type-body);
        color: var(--color-text-primary);
      }

      .line__quantity-label {
        font-size: var(--type-meta);
        color: var(--color-text-secondary);
      }

      .lines__empty {
        margin: 0;
        padding: var(--space-3);
        background: var(--color-surface-section);
        border-radius: var(--radius-card);
        color: var(--color-text-secondary);
        font-size: var(--type-helper);
      }

      .totals {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin: 0;
      }

      .totals__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-2) 0;
        border-bottom: 1px dashed var(--color-border-subtle);
      }

      .totals__row:last-child {
        border-bottom: none;
      }

      .totals__row dt,
      .totals__row dd {
        margin: 0;
      }

      .totals__row dt {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .totals__row dd {
        font-size: var(--type-body);
        color: var(--color-text-primary);
      }

      .totals__row--strong dt,
      .totals__row--strong dd {
        font-weight: var(--weight-bold);
        font-size: var(--type-body);
      }

      .receipt__meta {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: var(--space-4);
        background: var(--color-surface-section);
        border-radius: var(--radius-card);
        color: var(--color-text-primary);
      }

      .meta__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }

      .meta__row dt,
      .meta__row dd {
        margin: 0;
        font-size: var(--type-body);
      }

      .meta__row dt {
        color: var(--color-text-secondary);
        font-size: var(--type-helper);
      }

      .receipt__notice {
        margin: 0;
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface-section);
        border-left: 4px solid var(--color-brand-ink);
        border-radius: var(--radius-card);
        font-size: var(--type-helper);
        color: var(--color-text-primary);
        line-height: var(--line-height-body);
      }

      .receipt__actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3);
      }

      @media (min-width: 640px) {
        .receipt {
          padding: var(--space-6);
        }

        .line {
          grid-template-columns: minmax(0, 1fr) 140px 140px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .receipt {
          transition: none;
        }
      }
    `,
  ],
})
export class OrderReceiptComponent {
  /** The wire-shaped receipt payload. Required. */
  readonly receipt = input.required<OrderReceipt>();

  /** Friendly Hungarian label for the payment method. */
  readonly paymentLabel = computed<string>(() => PAYMENT_LABELS[this.receipt().paymentMethod]);

  /** Friendly Hungarian label for the delivery option. */
  readonly deliveryLabel = computed<string>(() => DELIVERY_LABELS[this.receipt().deliveryOptionId]);

  /** The simulation notice copy. Pulled from the receipt body when present. */
  readonly simulationNotice = computed<string>(() => {
    const fromWire = this.receipt().notice?.trim();
    if (typeof fromWire === 'string' && fromWire.length > 0) return fromWire;
    return SIMULATION_NOTICE;
  });

  /** Exported so unit-style assertions and other consumers can count items. */
  readonly lineItems = computed<readonly OrderLine[]>(() => this.receipt().items);
}
