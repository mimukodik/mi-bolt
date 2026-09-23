import { Component, computed, effect, input, output, signal } from '@angular/core';

import { AccessibleDialog } from '../../shared/ui/accessible-dialog/accessible-dialog';
import { ProductImage } from '../../shared/ui/product-image/product-image';

import type { Image } from '../../api/generated/models/image';

/**
 * T16 — product image gallery.
 *
 * Owns no image list of its own: it renders whichever `images()` the
 * parent supplies and follows `selectedImageId()`, resolving the
 * active image by id (`docs/spec/components.md:420`) rather than by
 * position, so a variant switch that swaps the image list never shows
 * the wrong photo at a stale index. The gallery deliberately does NOT
 * auto-advance: there is no autoplay timer, no time-based rotation, no
 * `setInterval` and no CSS animation that moves the image. The user is
 * in full control of which image is on screen, and they can reach the
 * next / previous image by clicking the buttons, clicking a
 * thumbnail, or pressing the arrow keys on the keyboard.
 *
 * Required states:
 * - default     — the active image is on screen; with two or more
 *     images the count reads "current / total" and the prev/next
 *     buttons are visible, with one image neither is rendered.
 * - zoom-open   — the active image is mounted inside an
 *     AccessibleDialog with role=dialog and a CDK-managed focus trap.
 *     Escape and the dialog's close button both close it.
 * - image-error — `selectedImageId()` does not resolve inside
 *     `images()`. Rather than silently substituting a different
 *     variant's photo, the component falls back to the first image
 *     for layout purposes and renders an explanatory note (R11,
 *     `docs/spec/screens.md:61`).
 *
 * Keyboard model:
 * - ArrowRight / ArrowLeft on the gallery surface move the index.
 * - Escape closes the zoom when it is open. The dialog's own Escape
 *   handling (CDK) drives the `closed` signal.
 */
@Component({
  selector: 'app-product-gallery',
  imports: [AccessibleDialog, ProductImage],
  templateUrl: './product-gallery.html',
  styleUrl: './product-gallery.scss',
})
export class ProductGallery {
  readonly images = input<readonly Image[]>([]);
  readonly selectedImageId = input<string>('');
  readonly productName = input<string>('');

  readonly imageSelected = output<string>();
  readonly zoomRequested = output<string>();

  readonly zoomOpen = signal(false);
  private readonly imageFailed = signal(false);

  /** True when `selectedImageId()` names no image in `images()`. The
   *  active image then falls back to the first one for layout, and
   *  the template renders the `image-error` note instead of
   *  substituting a different photo silently. */
  readonly idUnresolved = computed<boolean>(() => {
    const list = this.images();
    if (list.length === 0) return false;
    return !list.some((img) => img.id === this.selectedImageId());
  });

  private readonly effectiveIndex = computed<number>(() => {
    const list = this.images();
    if (list.length === 0) return 0;
    const idx = list.findIndex((img) => img.id === this.selectedImageId());
    return idx >= 0 ? idx : 0;
  });

  readonly activeImage = computed<Image | null>(() => {
    const list = this.images();
    if (list.length === 0) return null;
    return list[this.effectiveIndex()] ?? null;
  });

  /** 1-based position of the active image, for the "current / total"
   *  counter. 0 while the gallery has no images. */
  readonly activePosition = computed<number>(() => {
    if (this.images().length === 0) return 0;
    return this.effectiveIndex() + 1;
  });

  readonly canPrev = computed(() => this.effectiveIndex() > 0);
  readonly canNext = computed(() => {
    const list = this.images();
    return this.effectiveIndex() < list.length - 1;
  });

  /** Prev/next and the "current / total" counter only when there is
   *  somewhere to go: a single photo gets neither (MIM-233, owner
   *  2026-09-22). */
  readonly hasSeveral = computed(() => this.images().length > 1);

  constructor() {
    // Clear the stale image-load flag whenever the active image
    // changes (variant switch or a new selection), so a fallback
    // error from a previous image never lingers on the new one.
    effect(() => {
      this.activeImage();
      this.imageFailed.set(false);
    });
  }

  prev(): void {
    if (!this.canPrev()) return;
    const target = this.images()[this.effectiveIndex() - 1];
    this.imageSelected.emit(target.id);
  }

  next(): void {
    if (!this.canNext()) return;
    const target = this.images()[this.effectiveIndex() + 1];
    this.imageSelected.emit(target.id);
  }

  goTo(imageId: string): void {
    const exists = this.images().some((img) => img.id === imageId);
    if (!exists) return;
    this.imageSelected.emit(imageId);
  }

  openZoom(): void {
    const image = this.activeImage();
    if (image === null) return;
    this.zoomOpen.set(true);
    this.zoomRequested.emit(image.id);
  }

  /** Closing the zoom is internal: `components.md:426` lists
   *  `zoom-open` as a state of this component and gives it no close
   *  output, so `AccessibleDialog`'s `(closed)` wires to this
   *  method directly rather than to a parent-owned signal. */
  closeZoom(): void {
    if (!this.zoomOpen()) return;
    this.zoomOpen.set(false);
  }

  /**
   * Listen for keyboard input on the host element so the gallery is
   * focusable as a whole unit. The frame itself has tabindex=0 so the
   * user can reach the gallery surface with the keyboard.
   */
  onKeydown(event: KeyboardEvent): void {
    const list = this.images();
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prev();
    } else if (event.key === 'Escape' && this.zoomOpen()) {
      event.preventDefault();
      this.closeZoom();
    } else if (event.key === 'Home' && list.length > 0) {
      // Home and End never scroll the page from the gallery; with one
      // image there is nothing to move to, so nothing is emitted.
      event.preventDefault();
      if (this.hasSeveral()) this.imageSelected.emit(list[0].id);
    } else if (event.key === 'End' && list.length > 0) {
      event.preventDefault();
      if (this.hasSeveral()) this.imageSelected.emit(list[list.length - 1].id);
    }
  }

  onImageFailed(): void {
    this.imageFailed.set(true);
  }
}
