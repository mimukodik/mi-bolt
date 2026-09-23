/**
 * T18 — single cart line (S4.1).
 *
 * Renders one cart item as a card with:
 *
 *   - Product image (ProductImage primitive, lazy through the
 *     <img> element's own loading="lazy" attribute).
 *   - Product name + variant descriptor (color name + storage bucket).
 *   - Line total through the PriceBlock primitive so the whole HUF
 *     formatting and the loading/empty states are reused.
 *   - The quantity as read-only text: like yettel.hu, a cart line has
 *     no quantity control (owner's decision, 2026-09-22); the remove
 *     action is how a line changes.
 *   - A remove action with `aria-label` and an explicit button so
 *     keyboard users can reach it.
 *
 * The component owns NO state — it is fully driven by the wire-shaped
 * `CartItem` it receives through `line()` and forwards the user's
 * intent through `(removeRequested)`. The cart page subscribes to
 * that event and routes it through the
 * `CartFacade` (T17) so the mutation queue's serialization and
 * If-Match binding rules apply uniformly.
 */

import { Component, computed, input, output, viewChild } from '@angular/core';
import type { ElementRef } from '@angular/core';

import { PriceBlock, type Money } from '../../shared/ui/price-block/price-block';
import { ProductImage, type ImageLike } from '../../shared/ui/product-image/product-image';

import type { CartItem } from '../../api/generated/models/cart-item';

@Component({
  selector: 'app-cart-line',
  imports: [PriceBlock, ProductImage],
  templateUrl: './cart-line.html',
  styleUrl: './cart-line.scss',
})
export class CartLine {
  readonly line = input.required<CartItem>();
  readonly pending = input<boolean>(false);

  readonly removeRequested = output<string>();

  readonly lineTotal = computed<Money>(() => this.line().lineTotal);

  private readonly removeButton = viewChild.required<ElementRef<HTMLButtonElement>>('removeButton');

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

  onRemoveRequested(): void {
    this.removeRequested.emit(this.line().variantId);
  }

  /** Moves focus to this line's remove button. The cart page calls it
   *  after a removal settles, so focus does not drop to `<body>`. */
  focusRemove(): void {
    this.removeButton().nativeElement.focus();
  }
}
