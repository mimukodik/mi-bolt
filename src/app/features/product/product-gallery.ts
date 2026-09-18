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
  templateUrl: './product-gallery.html',
  styleUrl: './product-gallery.scss',
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
