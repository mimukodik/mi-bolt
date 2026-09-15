import {
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { AccessibleDialog } from '../../shared/ui/accessible-dialog/accessible-dialog';
import { ProductImage, type ImageLike } from '../../shared/ui/product-image/product-image';

/**
 * T16 — product image gallery.
 *
 * Owns the active image index inside a single variant's gallery. The
 * gallery deliberately does NOT auto-advance: there is no autoplay
 * timer, no time-based rotation, no `setInterval` and no CSS
 * animation that moves the image. The user is in full control of
 * which image is on screen, and they can reach the next / previous
 * image by clicking the buttons, clicking a thumbnail, or pressing
 * the arrow keys on the keyboard.
 *
 * Required states:
 * - default     — the active image is on screen, the count reads
 *     "current / total", the prev/next buttons are visible.
 * - zoom-open   — the active image is mounted inside an
 *     AccessibleDialog with role=dialog and a CDK-managed focus trap.
 *     Escape and the dialog's close button both close it.
 * - error       — ProductImage swaps to its named fallback so a
 *     missing photo never substitutes an invented image of another
 *     device (R11).
 *
 * Keyboard model:
 * - ArrowRight / ArrowLeft on the gallery surface move the index.
 * - Escape closes the zoom when it is open. The dialog's own Escape
 *   handling (CDK) drives the `closed` signal.
 */
@Component({
  selector: 'app-product-gallery',
  imports: [AccessibleDialog, ProductImage],
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
  template: `
    <section
      class="root"
      aria-roledescription="gallery"
      data-testid="product-gallery"
      tabindex="-1"
      (keydown)="onKeydown($event)"
    >
      <div class="frame" data-testid="gallery-main" tabindex="0" aria-label="Termékképek">
        <button
          type="button"
          class="step step--prev"
          data-testid="gallery-prev"
          aria-label="Előző kép"
          [disabled]="!canPrev()"
          (click)="prev()"
        >‹</button>
        @if (activeImage(); as img) {
          <app-product-image
            [image]="img"
            [productName]="productName()"
            aspectRatio="4 / 3"
            (loadFailed)="onImageFailed()"
          ></app-product-image>
        }
        <button
          type="button"
          class="step step--next"
          data-testid="gallery-next"
          aria-label="Következő kép"
          [disabled]="!canNext()"
          (click)="next()"
        >›</button>
        <button
          type="button"
          class="zoom"
          data-testid="gallery-zoom-open"
          aria-label="Kép nagyítása"
          (click)="openZoom()"
        >Nagyítás</button>
        <p class="count" data-testid="gallery-count" aria-live="polite">
          {{ imageIndex() + 1 }} / {{ images().length }}
        </p>
      </div>
      <ol class="thumbs" aria-label="Galéria indexképei">
        @for (image of images(); let i = $index; track i) {
          <li>
            <button
              type="button"
              class="thumb"
              [attr.data-testid]="'gallery-thumb-' + i"
              [attr.aria-current]="i === imageIndex() ? 'true' : 'false'"
              [attr.aria-label]="'Ugrás a(z) ' + (i + 1) + '. képre'"
              (click)="goTo(i)"
            >
              <span class="thumb-mark" aria-hidden="true">{{ thumbLabel(i) }}</span>
              <span class="thumb-check" aria-hidden="true">✓</span>
            </button>
          </li>
        }
      </ol>
    </section>
    <app-accessible-dialog
      [opened]="zoomOpen()"
      [label]="'Nagyított kép: ' + productName()"
      (closed)="closeZoom()"
    >
      @if (activeImage(); as img) {
        <app-product-image
          [image]="img"
          [productName]="productName()"
          aspectRatio="4 / 3"
          (loadFailed)="onImageFailed()"
        ></app-product-image>
      }
    </app-accessible-dialog>
  `,
  styles: [
    `
      :host { display: block; }

      .root {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      .frame {
        position: relative;
        display: flex;
        align-items: stretch;
        justify-content: center;
        gap: var(--space-3);
        padding: var(--space-3);
        background: var(--color-surface-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
      }

      .frame:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      app-product-image {
        flex: 1 1 auto;
        min-width: 0;
      }

      .step,
      .zoom {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        min-width: var(--size-control);
        min-height: var(--size-control);
        border-radius: var(--radius-control);
        border: 1px solid var(--color-border-control);
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
        line-height: 1;
        cursor: pointer;
        font-family: inherit;
      }

      .step:hover:not(:disabled),
      .zoom:hover {
        background: var(--color-brand-accent-soft);
      }

      .step:focus-visible,
      .zoom:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .step:disabled {
        background: var(--color-surface-section);
        color: var(--color-text-secondary);
        cursor: not-allowed;
      }

      .step--prev { left: var(--space-3); }
      .step--next { right: var(--space-3); }

      .zoom {
        top: auto;
        bottom: var(--space-3);
        right: var(--space-3);
        transform: none;
        font-size: var(--type-helper);
        font-weight: var(--weight-medium);
      }

      .count {
        position: absolute;
        top: var(--space-3);
        left: var(--space-3);
        margin: 0;
        padding: var(--space-1) var(--space-3);
        border-radius: var(--radius-badge);
        background: var(--color-surface-light);
        color: var(--color-text-secondary);
        font-size: var(--type-helper);
        font-variant-numeric: tabular-nums;
      }

      .thumbs {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .thumb {
        position: relative;
        min-width: var(--size-control);
        min-height: var(--size-control);
        padding: 0 var(--space-3);
        border-radius: var(--radius-control);
        border: 1px solid var(--color-border-subtle);
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: var(--type-helper);
        font-weight: var(--weight-medium);
        cursor: pointer;
      }

      .thumb[aria-current='true'] {
        border-color: var(--color-brand-ink);
        background: var(--color-brand-accent-soft);
        color: var(--color-brand-ink);
      }

      .thumb:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .thumb-mark { display: inline-block; }

      .thumb-check {
        display: none;
        margin-left: var(--space-2);
        font-weight: var(--weight-bold);
      }

      .thumb[aria-current='true'] .thumb-check { display: inline-block; }

      .thumb[aria-current='true'] .thumb-mark { display: none; }

      @media (max-width: 640px) {
        .frame { padding: var(--space-2); }
        .step { min-width: var(--size-control); min-height: var(--size-control); }
        .zoom { font-size: var(--type-helper); }
      }
    `,
  ],
})
export class ProductGallery {
  readonly images = input<readonly ImageLike[]>([]);
  readonly imageIndex = input<number>(0);
  readonly productName = input<string>('');

  readonly imageChange = output<number>();
  readonly zoomChange = output<boolean>();

  private readonly frame = viewChild<ElementRef<HTMLElement>>('gallery-main');

  /** Mirror of `imageIndex()` so internal clicks do not lose state when
   *  the parent re-emits the same value. The reactive `effect` keeps
   *  the mirror in sync whenever the parent pushes a new index (e.g.
   *  on a variant switch), so a stale local value cannot win the
   *  effective-index race against the new variant's image list. */
  private readonly localIndex = signal<number>(0);

  readonly zoomOpen = signal(false);
  private readonly imageFailed = signal(false);

  readonly activeImage = computed<ImageLike | null>(() => {
    const list = this.images();
    if (list.length === 0) return null;
    const idx = this.effectiveIndex();
    return list[Math.min(Math.max(idx, 0), list.length - 1)] ?? null;
  });

  readonly canPrev = computed(() => this.effectiveIndex() > 0);
  readonly canNext = computed(() => {
    const list = this.images();
    return this.effectiveIndex() < list.length - 1;
  });

  constructor() {
    // Re-sync the mirror on every change to `imageIndex()`. The effect
    // also fires once on construction, replacing the previous
    // queueMicrotask + ngOnInit pair with a single reactive source
    // of truth.
    effect(() => {
      this.localIndex.set(this.imageIndex());
    });
  }

  prev(): void {
    if (!this.canPrev()) return;
    const next = this.effectiveIndex() - 1;
    this.localIndex.set(next);
    this.imageChange.emit(next);
  }

  next(): void {
    if (!this.canNext()) return;
    const next = this.effectiveIndex() + 1;
    this.localIndex.set(next);
    this.imageChange.emit(next);
  }

  goTo(index: number): void {
    const list = this.images();
    if (index < 0 || index >= list.length) return;
    this.localIndex.set(index);
    this.imageChange.emit(index);
  }

  openZoom(): void {
    this.zoomOpen.set(true);
    this.zoomChange.emit(true);
  }

  closeZoom(): void {
    if (!this.zoomOpen()) return;
    this.zoomOpen.set(false);
    this.zoomChange.emit(false);
  }

  /**
   * Listen for keyboard input on the host element so the gallery is
   * focusable as a whole unit. The frame itself has tabindex=0 so the
   * user can reach the gallery surface with the keyboard.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prev();
    } else if (event.key === 'Escape' && this.zoomOpen()) {
      event.preventDefault();
      this.closeZoom();
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.goTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      this.goTo(this.images().length - 1);
    }
  }

  /**
   * Listen for keyboard input on the document so that arrow keys work
   * when the gallery surface itself is focused.
   */
  onDocumentKeydown(event: KeyboardEvent): void {
    const frame = this.frame()?.nativeElement;
    if (!frame) return;
    const target = event.target as Node | null;
    if (!target || !frame.contains(target)) return;
    this.onKeydown(event);
  }

  onImageFailed(): void {
    this.imageFailed.set(true);
  }

  /** Render the thumbnail label as the human index — keeps the
   *  selection readable for screen readers and for users who cannot
   *  perceive the swatch alone (R03 — selection is not conveyed by
   *  color alone). */
  thumbLabel(index: number): string {
    return `${index + 1}`;
  }

  private effectiveIndex(): number {
    const input = this.imageIndex();
    const list = this.images();
    if (list.length === 0) return 0;
    const safe = Math.min(Math.max(input, 0), list.length - 1);
    // Prefer the local mirror when it matches a valid range so the
    // user-driven navigation stays responsive.
    const local = this.localIndex();
    if (local >= 0 && local < list.length) return local;
    return safe;
  }
}