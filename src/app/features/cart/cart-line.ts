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
  templateUrl: './cart-line.html',
  styleUrl: './cart-line.scss',
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
