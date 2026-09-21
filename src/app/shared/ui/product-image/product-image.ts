import { Component, computed, inject, input, linkedSignal, output } from '@angular/core';
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
 * - `loading` — the `<img>` is in the DOM so the browser fetches it,
 *     with the skeleton laid over it and the aspect ratio reserved.
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

  /** Non-null view of `resolution()`, and the only member the template
   *  reads. The `<img>` is rendered only while `status()` is `'loading'`
   *  or `'loaded'`, both of which require a non-null resolution, so the
   *  empty-string arm never reaches the DOM. */
  readonly resolvedSrc = computed<string>(() => this.resolution() ?? '');

  /** What the `<img>` currently in the DOM has reported for
   *  `resolvedSrc()`. Linked to that URL so a new image starts in
   *  `loading` again instead of inheriting the previous one's outcome
   *  when the gallery switches variant. */
  private readonly phase = linkedSignal<string, 'loading' | 'loaded' | 'error'>({
    source: () => this.resolvedSrc(),
    computation: () => 'loading',
  });

  readonly status = computed<'loading' | 'loaded' | 'error'>(() => {
    // `phase()` is read before the null check, never inside the branch: a
    // `linkedSignal` only notices its source moved when it is read, so a
    // short-circuit that skips it while `resolution()` is null would hide
    // the intermediate empty source, and an image that failed before a
    // rejected one would come back still carrying its old failure.
    const reported = this.phase();
    return this.resolution() === null ? 'error' : reported;
  });

  readonly initial = computed<string>(() => {
    const name = this.productName().trim();
    if (name.length === 0) return '·';
    const first = name.charAt(0).toUpperCase();
    return first;
  });

  onLoad(): void {
    if (this.phase() === 'error') return;
    this.phase.set('loaded');
  }

  onError(): void {
    if (this.phase() === 'error') return;
    this.phase.set('error');
    this.loadFailed.emit();
  }
}
