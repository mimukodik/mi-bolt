import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { CatalogItem } from '../../api/generated/models/catalog-item';

import { PriceBlock } from '../../shared/ui/price-block/price-block';
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
 *     handler. The variant id rides along in the route matrix so the
 *     product page lands on the exact same configuration (R17);
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
  readonly product = input.required<CatalogItem>();

  /** Money payload for the PriceBlock — read straight off the item. */
  readonly price = computed(() => this.product().price);

  /** The colour option whose variantId matches the displayed entry, or
   *  `null` when none does (defensive — the 2.0.0 contract says the
   *  displayed variant is always present in `colors`). The template
   *  uses `colorName()` and not `variant().colorName`, because there
   *  is no separate `variant` field any more. */
  readonly colorName = computed<string>(
    () =>
      this.product().colors.find((c) => c.variantId === this.product().variantId)?.colorName ?? '',
  );

  /** First image of the item's gallery. */
  readonly image = computed<ImageLike>(() => {
    const item = this.product();
    return {
      src: item.image.src,
      alt: item.image.alt || `${item.name} illusztráció`,
      width: item.image.width,
      height: item.image.height,
    };
  });

  /** Up to two highlights, never invented beyond what the API supplies. */
  readonly visibleHighlights = computed<readonly string[]>(() =>
    this.product().highlights.slice(0, 2),
  );

  /** Router link to the product page; the variant goes in `detailsQuery`. */
  readonly detailsLink = computed(() => {
    const item = this.product();
    return ['/telefonok', item.slug];
  });

  /** The selected variant travels as `?variant=`, which the product page reads. */
  readonly detailsQuery = computed(() => ({ variant: this.product().variantId }));

  /** Concatenated accessible name for the image link. */
  readonly ariaLabel = computed(() => {
    const item = this.product();
    return `${item.name}, ${this.colorName()}, ${String(item.storageGb)} GB - részletek megnyitása`;
  });
}
