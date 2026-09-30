import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CatalogItem } from '@mi-bolt/api/models/catalog-item';
import type { ColorOption } from '@mi-bolt/api/models/color-option';

import { PriceBlock } from '../../shared/ui/price-block/price-block';
import { PromotionState, saleOriginal } from '../../core/promotion';
import { ProductImage, type ImageLike } from '../../shared/ui/product-image/product-image';

/**
 * T13 — atomic product card for the catalogue grid (AC04).
 *
 * The card is purely presentational:
 *
 *   - receives one `CatalogItem` as a signal input (the 2.0.0 list
 *     payload; carries price, variant id, image and colour options
 *     for one `(product, storage)` pair);
 *   - reserves the 4:3 media frame so neighbouring cards never jump
 *     (R11 — devices keep their optical size, no cropping);
 *   - shows up to two highlights so the eye lands on the most
 *     decision-supporting facts first;
 *   - renders the matched colour + storage label so the price, image
 *     and configuration name belong to the same product;
 *   - shows the whole-HUF one-time price through `PriceBlock` and the
 *     "Egyszeri készülékár" one-time label so the user never confuses
 *     it with a monthly fee (R13);
 *   - asks for navigation through `RouterLink`, not a manual click
 *     handler. The variant id travels as `?variant=` so the product
 *     page lands on the exact same configuration (R17);
 *   - uses an outlined CTA per the catalogue rule: one filled
 *     primary per page section, never per card (R08).
 *
 * No HTTP, no facade, no shared mutable state — the card is a leaf
 * the catalog page composes inside its grid.
 */
@Component({
  selector: 'app-product-card',
  imports: [RouterLink, PriceBlock, ProductImage],
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss',
})
export class ProductCard {
  private readonly promotionState = inject(PromotionState);
  readonly product = input.required<CatalogItem>();

  /** When true the card's photo loads eagerly. The catalogue grid passes
   *  `true` for every card because a page holds at most 24 of them and a
   *  lazy card past the browser's native threshold renders as an empty
   *  box with no network request issued. The home page's featured grid
   *  is the first card only, since above-the-fold is what matters there.
   *  The related products grid on the product page leaves it at the
   *  default (`false`): four cards stacked below the fold, where lazy
   *  is the right choice. */
  readonly eager = input<boolean>(false);

  /** Currently selected variant id. `linkedSignal` re-initialises from
   *  the product's displayed variant whenever the `product` input
   *  changes, so a card swap resets the selection rather than carrying
   *  the previous card's choice. */
  readonly selectedVariantId = linkedSignal(() => this.product().variantId);

  /** The matching colour option for the selected variant, or `null` when
   *  none is present (defensive — the 2.0.0 contract says the displayed
   *  variant is always in `colors`). */
  readonly selectedColor = computed<ColorOption | null>(
    () => this.product().colors.find((c) => c.variantId === this.selectedVariantId()) ?? null,
  );

  selectColor(variantId: string): void {
    this.selectedVariantId.set(variantId);
  }

  /** Money payload for the PriceBlock — prefers the selected colour's
   *  price, falls back to the item-level price for single-colour items. */
  readonly price = computed(() => {
    const value = this.selectedColor() ?? this.product();
    return this.promotionState.invalidated() && value.originalPrice !== undefined
      ? null
      : (this.selectedColor()?.price ?? this.product().price);
  });
  readonly originalPrice = computed(() =>
    this.promotionState.invalidated() ? null : saleOriginal(this.selectedColor() ?? this.product()),
  );

  /** The colour name currently shown on the card. */
  readonly colorName = computed<string>(() => this.selectedColor()?.colorName ?? '');

  /** First image of the item's gallery. */
  readonly image = computed<ImageLike>(() => {
    const item = this.product();
    const image = this.selectedColor()?.image ?? item.image;
    return {
      src: image.src,
      alt: image.alt !== '' ? image.alt : `${item.name} illusztráció`,
      width: image.width,
      height: image.height,
    };
  });

  /** Up to two highlights, never invented beyond what the API supplies. */
  readonly visibleHighlights = computed<readonly string[]>(() =>
    this.product().highlights.slice(0, 2),
  );

  /** True when the shown variant is out of stock — drives the
   *  "Elfogyott" marker under the price, which screen readers read in place
   *  (MIM-247, decision 10). The selected variant's own
   *  `ColorOption.availability` wins; the item-level
   *  `CatalogItem.availability` is the defensive fallback for the rare
   *  case where no matching colour option is found. */
  readonly isOutOfStock = computed<boolean>(() => {
    const color = this.selectedColor();
    const availability = color?.availability ?? this.product().availability;
    return availability === 'out_of_stock';
  });

  /** Router link to the product page; the variant goes in `detailsQuery`. */
  readonly detailsLink = computed(() => {
    const item = this.product();
    return ['/telefonok', item.slug];
  });

  /** The selected variant travels as `?variant=`, which the product page reads. */
  readonly detailsQuery = computed(() => ({ variant: this.selectedVariantId() }));

  /** Accessible name for the "Megnézem" CTA: the product name plus what
   *  the link does, without the stock state, which the "Elfogyott"
   *  marker says in place (the owner's decision 10, like yettel.hu's
   *  list cards). The name link needs none: its text is the name. */
  readonly detailsAriaLabel = computed(() => `${this.product().name} részleteinek megnyitása`);

  /** Concatenated accessible name for the image link. */
  readonly ariaLabel = computed(() => {
    const item = this.product();
    return `${item.name}, ${this.colorName()}, ${String(item.storageGb)} GB - részletek megnyitása`;
  });
}
