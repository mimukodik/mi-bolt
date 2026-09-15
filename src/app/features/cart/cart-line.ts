/**
 * T18 — single cart line (S4.1).
 *
 * Renders one cart item as a card with:
 *
 *   - Product image (ProductImage primitive, lazy via NgOptimizedImage
 *     when src is local).
 *   - Product name + variant descriptor (color name + storage bucket).
 *   - Unit price + line total through the PriceBlock primitive so the
 *     whole HUF formatting and the loading/empty states are reused.
 *   - QuantityControl (T10) so the user can increment / decrement
 *     within the variant's `maxQuantity` ceiling. The component
 *     surfaces `pending` so the controls disable while a
 *     `setQuantity` mutation is in flight.
 *   - A remove action with `aria-label` and an explicit button so
 *     keyboard users can reach it.
 *
 * The component owns NO state — it is fully driven by the wire-shaped
 * `CartItem` it receives through `line()` and forwards the user's
 * intent through `(quantityChanged)` and `(removeRequested)`. The
 * cart page subscribes to those events and routes them through the
 * `CartFacade` (T17) so the mutation queue's serialization and
 * If-Match binding rules apply uniformly.
 */

import { Component, computed, input, output } from '@angular/core';

import { PriceBlock, type Money } from '../../shared/ui/price-block/price-block';
import { ProductImage, type ImageLike } from '../../shared/ui/product-image/product-image';
import { QuantityControl } from '../../shared/ui/quantity-control/quantity-control';

import type { CartItem } from '../../api/generated/models/cart-item';

@Component({
  selector: 'app-cart-line',
  imports: [PriceBlock, ProductImage, QuantityControl],
  template: `
    <article class="line" [attr.aria-busy]="pending() ? 'true' : null" data-testid="cart-line">
      <div class="media">
        <app-product-image
          [image]="imageLike()"
          [productName]="line().productName"
        ></app-product-image>
      </div>

      <div class="body">
        <header class="header">
          <h3 class="name" data-testid="cart-line-name">{{ line().productName }}</h3>
          <p class="variant">
            <span class="variant-color">{{ line().colorName }}</span>
            <span class="variant-sep" aria-hidden="true">·</span>
            <span class="variant-storage">{{ line().storageGb }} GB</span>
          </p>
        </header>

        <div class="prices">
          <app-price-block
            [money]="line().unitPrice"
            [label]="'Egységár'"
            [status]="'success'"
          ></app-price-block>
        </div>

        <div class="quantity-row">
          <label class="qty-label" [attr.for]="quantityId()">Darabszám</label>
          <app-quantity-control
            [id]="quantityId()"
            [value]="line().quantity"
            [min]="1"
            [max]="maxQuantity()"
            [disabled]="pending()"
            [pending]="pending()"
            [label]="'Darabszám'"
            (quantityChanged)="onQuantityChanged($event)"
          ></app-quantity-control>
        </div>
      </div>

      <div class="totals">
        <app-price-block
          [money]="line().lineTotal"
          [label]="'Részösszeg'"
          [status]="'success'"
        ></app-price-block>
        <button
          type="button"
          class="remove"
          [attr.aria-label]="'Törlés: ' + line().productName"
          [disabled]="pending()"
          (click)="onRemoveRequested()"
          data-testid="cart-line-remove"
        >
          Törlés
        </button>
      </div>
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .line {
        display: grid;
        grid-template-columns: 96px minmax(0, 1fr);
        gap: var(--space-4);
        padding: var(--space-4);
        background: var(--color-surface-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
        color: var(--color-text-primary);
      }

      .line[aria-busy='true'] {
        opacity: 0.7;
      }

      .media {
        display: flex;
        align-items: flex-start;
        justify-content: center;
        min-width: 0;
      }

      .body {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        min-width: 0;
      }

      .header {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .name {
        margin: 0;
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      .variant {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .variant-sep {
        margin: 0 var(--space-2);
      }

      .prices {
        display: flex;
        align-items: center;
      }

      .quantity-row {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .qty-label {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .totals {
        display: none;
      }

      .remove {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: var(--size-control);
        height: var(--size-control);
        padding: 0 var(--space-4);
        border: 1px solid var(--color-border-control);
        background: var(--color-surface-light);
        color: var(--color-brand-ink);
        border-radius: var(--radius-control);
        font-family: inherit;
        font-size: var(--type-body);
        font-weight: var(--weight-medium);
        cursor: pointer;
        transition:
          background-color var(--motion-fast) ease,
          border-color var(--motion-fast) ease;
      }

      .remove:hover:not(:disabled) {
        background: var(--color-brand-accent-soft);
        border-color: var(--color-brand-ink);
      }

      .remove:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .remove:disabled {
        background: var(--color-surface-section);
        color: var(--color-text-secondary);
        border-color: var(--color-border-subtle);
        cursor: not-allowed;
      }

      @media (min-width: 640px) {
        .line {
          grid-template-columns: 128px minmax(0, 1fr) auto;
          gap: var(--space-5);
          padding: var(--space-5);
        }

        .totals {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--space-3);
          min-width: 180px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .line {
          transition: none;
        }
      }
    `,
  ],
})
export class CartLine {
  readonly line = input.required<CartItem>();
  readonly pending = input<boolean>(false);

  readonly quantityChanged = output<number>();
  readonly removeRequested = output<string>();

  readonly quantityId = computed(() => `cart-line-qty-${this.line().id}`);

  /**
   * `PriceBlock` expects a unit in whole HUF; the wire-shaped
   * `unitPrice` already is. We re-export the value as `Money` so the
   * template can use `app-price-block` without a manual cast.
   */
  readonly unitPrice = computed<Money>(() => this.line().unitPrice);
  readonly lineTotal = computed<Money>(() => this.line().lineTotal);

  /**
   * The cart-backend `maxQuantity` is the cap the server enforces.
   * Forwarding it to the `QuantityControl` primitive keeps the line
   * in sync with what the cart will accept (AC03 — no silent
   * clamping on the UI side).
   */
  readonly maxQuantity = computed<number>(() => Math.max(1, this.line().maxQuantity));

  /**
   * `ProductImage` takes an `ImageLike` (alt/src/width/height).
   * The wire-shaped `CartItem.image` already has those fields, so
   * the line component can forward it as-is.
   */
  readonly imageLike = computed<ImageLike>(() => {
    const image = this.line().image;
    return {
      src: image.src,
      alt: image.alt,
      width: image.width,
      height: image.height,
    };
  });

  onQuantityChanged(quantity: number): void {
    this.quantityChanged.emit(quantity);
  }

  onRemoveRequested(): void {
    this.removeRequested.emit(this.line().id);
  }
}