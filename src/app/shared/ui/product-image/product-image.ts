import {
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Wire-shaped Image object used by the OpenAPI-generated SDK.
 * Kept local so the primitive has zero dependency on the SDK build.
 */
export interface ImageLike {
  readonly src: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
}

/**
 * MiBolt ProductImage primitive.
 *
 * Reserves the container dimensions up-front using the requested aspect
 * ratio, so neighbouring cards do not jump while the image loads. When the
 * asset fails, the rendered element swaps to a neutral named fallback that
 * keeps the same dimensions and the live `alt`, instead of substituting an
 * invented image of another device. (R11 — preserve dimensions and aspect.)
 *
 * Required states:
 * - `loading` — skeleton with reserved aspect ratio, no decorative content.
 * - `loaded`  — the real image, `object-fit: contain`, accessible alt.
 * - `error`   — neutral named fallback (product name), no invented photo.
 */
@Component({
  selector: 'app-product-image',
  templateUrl: './product-image.html',
  styleUrl: './product-image.scss',
})
export class ProductImage {
  readonly image = input.required<ImageLike>();
  readonly productName = input.required<string>();
  readonly aspectRatio = input<string>('4 / 3');

  readonly loadFailed = output<void>();

  private readonly failed = signal(false);
  readonly status = computed<'loading' | 'loaded' | 'error'>(() =>
    this.failed() ? 'error' : 'loaded',
  );

  readonly initial = computed<string>(() => {
    const name = this.productName().trim();
    if (name.length === 0) return '·';
    const first = name.charAt(0).toUpperCase();
    return first;
  });

  onError(): void {
    if (this.failed()) return;
    this.failed.set(true);
    this.loadFailed.emit();
  }
}
