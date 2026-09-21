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

import { Component, computed, input } from '@angular/core';

import { PriceBlock } from '../../shared/ui/price-block/price-block';

import type { OrderLine } from '../../api/generated/models/order-line';
import type { OrderReceipt } from '../../api/generated/models/order-receipt';

const PAYMENT_LABELS: Readonly<Record<OrderReceipt['paymentMethod'], string>> = {
  card: 'Bankkártya (szimulált)',
  cash_on_delivery: 'Utánvét (demó)',
};

/** Labels keyed on `DeliverySelection` discriminator (`optionId`), since the
 *  wire carries a `DeliverySelection`, not a top-level delivery id. */
const DELIVERY_LABELS: Readonly<Record<NonNullable<OrderReceipt['delivery']>['optionId'], string>> =
  {
    home_delivery: 'Házhozszállítás',
    pickup_point: 'Bemutatótermi átvétel (demó)',
  };

/**
 * Notice string rendered under the totals. Hungarian copy that makes
 * the simulation explicit without claiming any real-world consequence.
 */
const SIMULATION_NOTICE =
  'Nem történt valódi fizetés, rendelésküldés vagy e-mail-küldés — ez egy demó folyamat.';

@Component({
  selector: 'app-order-receipt',
  imports: [PriceBlock],
  templateUrl: './order-receipt.html',
  styleUrl: './order-receipt.scss',
})
export class OrderReceiptComponent {
  /** The wire-shaped receipt payload. Required. */
  readonly receipt = input.required<OrderReceipt>();

  /** Friendly Hungarian label for the payment method. */
  readonly paymentLabel = computed<string>(() => PAYMENT_LABELS[this.receipt().paymentMethod]);

  /** Friendly Hungarian label for the delivery option. */
  readonly deliveryLabel = computed<string>(
    () => DELIVERY_LABELS[this.receipt().delivery.optionId],
  );

  /** The simulation notice copy. Pulled from the receipt body when present. */
  readonly simulationNotice = computed<string>(() => {
    const fromWire = this.receipt().notice.trim();
    if (typeof fromWire === 'string' && fromWire.length > 0) return fromWire;
    return SIMULATION_NOTICE;
  });

  /** Exported so unit-style assertions and other consumers can count items. */
  readonly lineItems = computed<readonly OrderLine[]>(() => this.receipt().items);
}
