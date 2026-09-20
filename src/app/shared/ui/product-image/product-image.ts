import { Component, computed, inject, input, output, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { AssetUrlError, resolveAssetUrl } from '../../media/resolve-asset-url';

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
  imports: [],
  templateUrl: './product-image.html',
  styleUrl: './product-image.scss',
})
export class ProductImage {
  readonly image = input.required<ImageLike>();
  readonly productName = input.required<string>();
  readonly aspectRatio = input<string>('4 / 3');

  /** When true the image is presentational: the surrounding markup
   *  already names it in visible text, so repeating the alt here
   *  duplicates that text for a screen reader (axe image-redundant-alt). */
  readonly decorative = input<boolean>(false);

  readonly loadFailed = output();

  private readonly doc = inject(DOCUMENT);

  private readonly failed = signal(false);

  /** Resolution result: the deployment-resolved image URL, or null when
   *  `resolveAssetUrl` rejected the wire value. A rejection renders the
   *  same neutral fallback as a failed network load; it never renders a
   *  broken `<img>`. */
  private readonly resolution = computed<string | null>(() => {
    try {
      return resolveAssetUrl(this.image().src, this.doc.baseURI);
    } catch (error) {
      if (error instanceof AssetUrlError) return null;
      throw error;
    }
  });

  readonly status = computed<'loading' | 'loaded' | 'error'>(() =>
    this.failed() || this.resolution() === null ? 'error' : 'loaded',
  );

  /** Non-null view of `resolution()`, and the only member the template
   *  reads. `status()` is `'loaded'` only when `resolution()` is non-null
   *  and the `@case ('loaded')` branch is its only reader, so the
   *  empty-string arm never reaches the DOM. */
  readonly resolvedSrc = computed<string>(() => this.resolution() ?? '');

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
