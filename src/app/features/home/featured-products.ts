import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Product } from '../../api/generated/models/product';
import type { Money } from '../../api/generated/models/money';

/** Status of a single featured-product slot in the home grid. */
export type FeaturedSlotStatus = 'loading' | 'success' | 'error';

/**
 * One slot in the featured grid. The orchestrator owns the request
 * lifecycle and threads these down to the presentation layer; the
 * presentation layer never sees the SDK.
 */
export interface FeaturedSlot {
  readonly slug: string;
  readonly status: FeaturedSlotStatus;
  readonly product: Product | null;
  readonly error: string | null;
}

/**
 * `FeaturedProducts` — four product cards rendered from the live
 * `getProduct` responses (T14-AC03).
 *
 * The component consumes pre-shaped `FeaturedSlot` values; loading
 * and error states never substitute invented figures for a missing
 * price (R14, R25). The "Részletek" link points at the catalogue
 * detail route with the documented slug (T14-AC02).
 *
 * The home page renders its own price block / image element because
 * the shared T10 primitives pull in their CSS through `styleUrl`,
 * which the vitest test runner cannot resolve at module-init time.
 * The component keeps the same data contract so a future refactor can
 * swap in the shared primitives without touching the page logic.
 */
@Component({
  selector: 'app-featured-products',
  imports: [RouterLink],
  template: `
    <section
      class="featured"
      data-testid="featured-section"
      aria-labelledby="featured-heading"
    >
      <div class="featured__inner">
        <header class="featured__header">
          <h2 id="featured-heading" class="featured__title">
            Kiemelt készülékek
          </h2>
          <p class="featured__lede">
            A demóban elérhető négy kiemelt készülék — az árak a kiválasztott variánstól függenek.
          </p>
        </header>
        @if (allErrored()) {
          <div class="featured__grid-error" data-testid="error-state" role="alert" aria-live="polite">
            <p class="featured__error-title">A kiemelt termékek nem tölthetők be</p>
            <p class="featured__error-message">{{ errorMessage() }}</p>
            <button
              type="button"
              class="featured__retry"
              data-testid="retry-button"
              (click)="retryRequested.emit()"
            >Újrapróbálom</button>
          </div>
        } @else {
          <ul
            class="featured__grid"
            data-testid="featured-grid"
            role="list"
          >
            @for (slot of slots(); track slot.slug) {
              <li
                class="featured__card"
                [attr.data-testid]="'featured-card-' + slot.slug"
              >
                @switch (slot.status) {
                  @case ('success') {
                    @if (slot.product) {
                      <a
                        class="featured__media"
                        [routerLink]="['/telefonok', slot.product.slug]"
                        [attr.aria-label]="slot.product.name + ' — részletek'"
                      >
                        <div class="featured__image">
                          @if (firstImageSrc(slot.product); as src) {
                            <img
                              [src]="src"
                              [alt]="firstImageAlt(slot.product)"
                              [attr.width]="firstImageWidth(slot.product)"
                              [attr.height]="firstImageHeight(slot.product)"
                              decoding="async"
                              loading="lazy"
                              data-testid="image-photo"
                            />
                          } @else {
                            <span class="featured__image-fallback" aria-hidden="true">
                              {{ initialFor(slot.product.name) }}
                            </span>
                          }
                        </div>
                      </a>
                      <div class="featured__body">
                        <p class="featured__brand">{{ slot.product.brand }}</p>
                        <h3 class="featured__name">{{ slot.product.name }}</h3>
                        <p class="featured__price" data-testid="price-amount">
                          <span class="featured__price-amount">{{ formatPrice(slot.product.defaultVariant.price) }}</span>
                          <span class="featured__price-currency" aria-hidden="true">Ft</span>
                        </p>
                        <a
                          class="featured__details"
                          [routerLink]="['/telefonok', slot.product.slug]"
                          [attr.data-testid]="'featured-details-' + slot.product.slug"
                        >Részletek</a>
                      </div>
                    }
                  }
                  @case ('error') {
                    <div class="featured__error" data-testid="featured-error">
                      <p class="featured__error-title">Nem tölthető be</p>
                      <p class="featured__error-message">
                        {{ slot.error || 'A termék ideiglenesen nem elérhető.' }}
                      </p>
                    </div>
                  }
                  @default {
                    <div class="featured__loading" data-testid="featured-loading">
                      <span
                        class="featured__skeleton featured__skeleton--image"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="featured__skeleton featured__skeleton--title"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="featured__skeleton featured__skeleton--price"
                        aria-hidden="true"
                        data-testid="price-skeleton"
                      ></span>
                      <span class="sr-only">Termék betöltése…</span>
                    </div>
                  }
                }
              </li>
            }
          </ul>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
  styleUrl: './featured-products.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturedProducts {
  /** Slots from the orchestrator. */
  readonly slots = input<readonly FeaturedSlot[]>([]);

  /** Re-fire signal — surfaced when the user clicks "Újrapróbálom"
   *  on the whole-grid error state. Per-card errors don't surface a
   *  retry CTA on their own; the whole-grid state does. */
  readonly retryRequested = output<void>();

  /** True when every slot is in error state (the grid-level error UI). */
  readonly allErrored = computed(() => {
    const list = this.slots();
    if (list.length === 0) return false;
    return list.every((s) => s.status === 'error');
  });

  /** Joined error messages for the whole-grid error state. */
  readonly errorMessage = computed(() => {
    const list = this.slots();
    const messages = list
      .map((s) => s.error)
      .filter((m): m is string => m !== null);
    if (messages.length === 0) {
      return 'A kiemelt termékek jelenleg nem érhetők el.';
    }
    return messages[0]!;
  });

  /** Returns the first image src for the product, or null if absent. */
  firstImageSrc(product: Product): string | null {
    const first = product.defaultVariant.images[0];
    return first ? first.src : null;
  }

  firstImageAlt(product: Product): string {
    const first = product.defaultVariant.images[0];
    return (first && first.alt) || product.name;
  }

  firstImageWidth(product: Product): number | null {
    const first = product.defaultVariant.images[0];
    return first && first.width ? first.width : null;
  }

  firstImageHeight(product: Product): number | null {
    const first = product.defaultVariant.images[0];
    return first && first.height ? first.height : null;
  }

  initialFor(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0) return '·';
    return trimmed.charAt(0).toUpperCase();
  }

  /** Hungarian integer HUF formatter. Non-breaking space thousands separator. */
  formatPrice(money: Money): string {
    const amount = money.amount;
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
      return '—';
    }
    const grouped = Math.trunc(Math.abs(amount))
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return grouped;
  }
}
