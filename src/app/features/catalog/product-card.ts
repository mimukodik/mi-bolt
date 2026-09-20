import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { ProductSummary } from '../../api/legacy/models/product-summary';

import { PriceBlock } from '../../shared/ui/price-block/price-block';
import { ProductImage, type ImageLike } from '../../shared/ui/product-image/product-image';

/**
 * T13 — atomic product card for the catalogue grid (AC04).
 *
 * The card is purely presentational:
 *
 *   - receives one `ProductSummary` as a signal input;
 *   - reserves the 4:3 media frame so neighbouring cards never jump
 *     (R11 — devices keep their optical size, no cropping);
 *   - shows up to two highlights so the eye lands on the most
 *     decision-supporting facts first;
 *   - renders the matching variant's color + storage label so the
 *     price, image and configuration name belong to the same product;
 *   - shows the whole-HUF one-time price through `PriceBlock` and the
 *     "Egyszeri készülékár" one-time label so the user never confuses
 *     it with a monthly fee (R13);
 *   - asks for navigation through `RouterLink`, not a manual click
 *     handler. The variant id rides along in the query string so the
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
  readonly product = input.required<ProductSummary>();

  /** Matching variant exposed through the summary's `defaultVariant`. */
  readonly variant = computed(() => this.product().defaultVariant);

  /** Money payload for the PriceBlock — converted from the variant. */
  readonly price = computed(() => this.variant().price);

  /** First image of the variant's gallery. */
  readonly image = computed<ImageLike>(() => {
    const first = this.variant().images[0];
    return {
      src: first.src,
      alt: first.alt || `${this.product().name} illusztráció`,
      width: first.width,
      height: first.height,
    };
  });

  /** Up to two highlights, never invented beyond what the API supplies. */
  readonly visibleHighlights = computed<readonly string[]>(() =>
    this.product().highlights.slice(0, 2),
  );

  /** Router link to the product page, including the matching variant id. */
  readonly detailsLink = computed(() => {
    const slug = this.product().slug;
    const variantId = this.variant().id;
    return ['/telefonok', slug, { variant: variantId }];
  });

  /** Concatenated accessible name for the image link. */
  readonly ariaLabel = computed(() => {
    const p = this.product();
    const v = this.variant();
    return `${p.name}, ${v.colorName}, ${String(v.storageGb)} GB - részletek megnyitása`;
  });
}
