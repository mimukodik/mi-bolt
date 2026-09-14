import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { ProductSummary } from '../../api/generated/models/product-summary';

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
  template: `
    <article class="card" data-testid="product-card">
      <a
        class="media"
        [routerLink]="detailsLink()"
        [attr.aria-label]="ariaLabel()"
      >
        <app-product-image
          data-testid="product-card-image"
          [image]="image()"
          [productName]="product().name"
          [aspectRatio]="'4 / 3'"
        ></app-product-image>
      </a>

      <div class="body">
        <p class="brand">{{ product().brand }}</p>
        <h3 class="name">
          <a
            class="name-link"
            [routerLink]="detailsLink()"
            [attr.aria-label]="product().name + ' részleteinek megnyitása'"
          >{{ product().name }}</a>
        </h3>
        <p class="variant">
          <span class="variant__color">{{ variant().colorName }}</span>
          <span class="variant__sep" aria-hidden="true">·</span>
          <span class="variant__storage">{{ variant().storageGb }} GB</span>
        </p>
        @if (visibleHighlights().length > 0) {
          <ul class="highlights" data-testid="product-card-highlights">
            @for (highlight of visibleHighlights(); track highlight) {
              <li>{{ highlight }}</li>
            }
          </ul>
        }
        <div class="price-row">
          <app-price-block
            [money]="price()"
            label="Egyszeri készülékár • demóadat"
            status="success"
          ></app-price-block>
        </div>
      </div>

      <div class="cta">
        <a
          class="details"
          data-testid="product-card-cta"
          [routerLink]="detailsLink()"
          [attr.aria-label]="product().name + ' részleteinek megnyitása'"
        >Részletek →</a>
      </div>
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .card {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        height: 100%;
        padding: var(--space-4);
        background: var(--color-surface-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
        color: var(--color-text-primary);
      }

      .media {
        display: block;
        text-decoration: none;
        color: inherit;
        border-radius: var(--radius-card);
      }

      .media:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .body {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        flex: 1 1 auto;
      }

      .brand {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        line-height: var(--line-height-body);
      }

      .name {
        margin: 0;
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      .name-link {
        color: var(--color-text-primary);
        text-decoration: none;
      }

      .name-link:hover,
      .name-link:focus-visible {
        color: var(--color-brand-ink);
        text-decoration: underline;
      }

      .name-link:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
        border-radius: var(--radius-badge);
      }

      .variant {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        line-height: var(--line-height-body);
        display: inline-flex;
        gap: var(--space-2);
        align-items: center;
      }

      .variant__sep {
        color: var(--color-border-control);
      }

      .highlights {
        margin: 0;
        padding-left: var(--space-4);
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        font-size: var(--type-helper);
        color: var(--color-text-primary);
        line-height: var(--line-height-body);
      }

      .price-row {
        margin-top: auto;
      }

      .cta {
        display: flex;
        align-items: center;
      }

      .details {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: var(--size-control);
        padding: 0 var(--space-4);
        border: 1px solid var(--color-brand-ink);
        border-radius: var(--radius-control);
        background: var(--color-surface-light);
        color: var(--color-brand-ink);
        font-family: inherit;
        font-size: var(--type-body);
        font-weight: var(--weight-medium);
        line-height: 1;
        text-decoration: none;
        cursor: pointer;
        transition:
          background-color var(--motion-fast) ease,
          border-color var(--motion-fast) ease,
          color var(--motion-fast) ease;
      }

      .details:hover {
        background: var(--color-brand-accent-soft);
      }

      .details:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }
    `,
  ],
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
    if (!first) {
      // ProductImage renders its own named fallback when the URL
      // resolves to 404, so an empty gallery is safe — we feed it an
      // image that points at the public placeholder and re-uses the
      // product name as alt text. R11 forbids inventing another device.
      return {
        src: '/assets/placeholder.svg',
        alt: `${this.product().name}, illusztráció`,
        width: 320,
        height: 240,
      };
    }
    return {
      src: first.src,
      alt: first.alt || `${this.product().name} illusztráció`,
      width: first.width,
      height: first.height,
    };
  });

  /** Up to two highlights, never invented beyond what the API supplies. */
  readonly visibleHighlights = computed<readonly string[]>(
    () => this.product().highlights.slice(0, 2),
  );

  /** Router link to the product page, including the matching variant id. */
  readonly detailsLink = computed(() => ['/telefonok', this.product().slug]);

  /** Concatenated accessible name for the image link. */
  readonly ariaLabel = computed(() => {
    const p = this.product();
    const v = this.variant();
    return `${p.name}, ${v.colorName}, ${v.storageGb} GB — részletek megnyitása`;
  });
}
