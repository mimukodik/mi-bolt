// @vitest-environment jsdom
import '@angular/compiler';

import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProductGallery } from './product-gallery';
import type { Image } from '../../api/generated/models/image';

/**
 * T16 / FIX-50 - Product gallery component (T16-AC02 / T16-AC05).
 *
 * Reshaped to `docs/spec/components.md:420-428`: the component
 * resolves its active image by id (`selectedImageId`) rather than by
 * position, so a variant switch that swaps the image list never shows
 * the wrong photo at a stale index.
 *
 * Real Angular TestBed behavior tests covering:
 *
 *   - T16-AC02: prev and next buttons advance and rewind active image,
 *     disabling at boundary 0 and length - 1 without wrapping.
 *   - T16-AC02: thumbnail strip renders one button per image with
 *     aria-current on the selected id; click invokes goTo(id).
 *   - T16-AC02: visible counter format is "current / total" with polite
 *     aria-live announcements.
 *   - T16-AC02: zoom button opens AccessibleDialog with role=dialog,
 *     aria-modal=true, accessible label, and projects the active image.
 *   - T16-AC02: keyboard controls (ArrowRight, ArrowLeft, Home, End,
 *     Escape to close zoom dialog).
 *   - T16-AC02: image load error triggers named fallback without
 *     substituting another device image.
 *   - T16-AC02: no automatic carousel (no autoplay timer, index remains
 *     stable without user action).
 *   - T16-AC05: no 3D surface (no canvas element rendered, no 3D
 *     engine script, no fake 3D action button).
 *   - FIX-50: an id that matches no image renders the image-error
 *     note and falls back to the first image rather than substituting
 *     a different variant's photo.
 */

const sampleImages: readonly Image[] = [
  {
    id: 'img-front',
    src: '/assets/products/demo-one-front.webp',
    alt: 'Demo One 5G - Elolap',
    width: 800,
    height: 600,
  },
  {
    id: 'img-back',
    src: '/assets/products/demo-one-back.webp',
    alt: 'Demo One 5G - Hatlap',
    width: 800,
    height: 600,
  },
  {
    id: 'img-side',
    src: '/assets/products/demo-one-side.webp',
    alt: 'Demo One 5G - Oldalnezat',
    width: 800,
    height: 600,
  },
] satisfies readonly Image[];

@Component({
  imports: [ProductGallery],
  template: `
    <app-product-gallery
      [images]="images()"
      [productName]="productName()"
      [selectedImageId]="selectedImageId()"
      (imageSelected)="onImageSelected($event)"
      (zoomRequested)="onZoomRequested($event)"
    />
  `,
})
class GalleryTestHost {
  readonly images = signal<readonly Image[]>(sampleImages);
  readonly selectedImageId = signal<string>('img-front');
  readonly productName = signal<string>('Demo One 5G');

  readonly emittedImageSelected: string[] = [];
  readonly emittedZoomRequested: string[] = [];

  onImageSelected(imageId: string): void {
    this.emittedImageSelected.push(imageId);
    this.selectedImageId.set(imageId);
  }

  onZoomRequested(imageId: string): void {
    this.emittedZoomRequested.push(imageId);
  }
}

function getRootElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
  return raw;
}

function queryButton(parent: ParentNode, selector: string): HTMLButtonElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLButtonElement)) {
    throw new Error(`Expected HTMLButtonElement: ${selector}`);
  }
  return el;
}

function queryElement(parent: ParentNode, selector: string): HTMLElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Expected HTMLElement: ${selector}`);
  }
  return el;
}

function queryImage(parent: ParentNode, selector: string): HTMLImageElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLImageElement)) {
    throw new Error(`Expected HTMLImageElement: ${selector}`);
  }
  return el;
}

/**
 * The path an `<img>` actually points at, with the origin stripped off.
 *
 * `ProductImage` runs its `src` through `resolveAssetUrl`, which returns an
 * absolute URL, so the rendered attribute reads
 * `http://localhost:3000/assets/...` under the unit runner. Asserting on the
 * whole string would pin these tests to whatever host the runner happens to
 * serve from; the path is the part the component decides.
 */
function imagePath(image: HTMLImageElement): string {
  return new URL(image.getAttribute('src') ?? '', 'http://localhost').pathname;
}

beforeEach(() => {
  document.body.querySelectorAll('.cdk-overlay-container').forEach((el) => {
    el.remove();
  });
});

afterEach(() => {
  document.body.querySelectorAll('.cdk-overlay-container').forEach((el) => {
    el.remove();
  });
  TestBed.resetTestingModule();
});

async function createHarness(): Promise<{
  fixture: ComponentFixture<GalleryTestHost>;
  host: GalleryTestHost;
  root: HTMLElement;
}> {
  TestBed.configureTestingModule({
    imports: [GalleryTestHost],
    teardown: { destroyAfterEach: true },
  });
  await TestBed.compileComponents();

  const fixture = TestBed.createComponent(GalleryTestHost);
  const host = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();

  return {
    fixture,
    host,
    root: getRootElement(fixture),
  };
}

describe('T16-AC02 product-gallery prev/next navigation and boundaries', () => {
  it('T16-AC02: renders previous and next buttons that emit imageSelected with the adjacent id', async () => {
    const { fixture, host, root } = await createHarness();

    const prevBtn = queryButton(root, '[data-testid="gallery-prev"]');
    const nextBtn = queryButton(root, '[data-testid="gallery-next"]');
    expect(prevBtn).not.toBeNull();
    expect(nextBtn).not.toBeNull();

    // At the first image, next button advances to the second
    nextBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageSelected).toEqual(['img-back']);
    expect(host.selectedImageId()).toBe('img-back');

    const activePhoto = queryImage(
      root,
      '[data-testid="gallery-main"] [data-testid="image-photo"]',
    );
    expect(imagePath(activePhoto)).toBe('/assets/products/demo-one-back.webp');

    // From the second image, prev button returns to the first
    prevBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageSelected).toEqual(['img-back', 'img-front']);
    expect(host.selectedImageId()).toBe('img-front');
    expect(
      imagePath(queryImage(root, '[data-testid="gallery-main"] [data-testid="image-photo"]')),
    ).toBe('/assets/products/demo-one-front.webp');
  });

  it('T16-AC02: disables prev button at the first image and does not wrap backward', async () => {
    const { fixture, host, root } = await createHarness();

    const prevBtn = queryButton(root, '[data-testid="gallery-prev"]');
    expect(prevBtn.disabled).toBe(true);
    expect(host.selectedImageId()).toBe('img-front');

    prevBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageSelected.length).toBe(0);
    expect(host.selectedImageId()).toBe('img-front');
  });

  it('T16-AC02: disables next button at the last image and does not wrap forward', async () => {
    const { fixture, host, root } = await createHarness();

    host.selectedImageId.set('img-side');
    fixture.detectChanges();
    await fixture.whenStable();

    const nextBtn = queryButton(root, '[data-testid="gallery-next"]');
    expect(nextBtn.disabled).toBe(true);

    nextBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageSelected.length).toBe(0);
    expect(host.selectedImageId()).toBe('img-side');
  });
});

describe('T16-AC02 product-gallery thumbnail strip and count display', () => {
  it('T16-AC02: renders a thumbnail button per image with correct aria-current state', async () => {
    const { root } = await createHarness();

    const thumbs = root.querySelectorAll('button.thumb');
    expect(thumbs.length).toBe(3);

    const thumb0 = queryButton(root, '[data-testid="gallery-thumb-0"]');
    const thumb1 = queryButton(root, '[data-testid="gallery-thumb-1"]');
    const thumb2 = queryButton(root, '[data-testid="gallery-thumb-2"]');

    expect(thumb0.getAttribute('aria-current')).toBe('true');
    expect(thumb1.getAttribute('aria-current')).toBe('false');
    expect(thumb2.getAttribute('aria-current')).toBe('false');
    expect(thumb0.getAttribute('aria-label')).toBe('Ugrás a(z) 1. képre');

    sampleImages.forEach((image, index) => {
      const thumb = queryButton(root, `[data-testid="gallery-thumb-${String(index)}"]`);
      const img = queryImage(
        thumb,
        '[data-testid="gallery-thumb-image"] [data-testid="image-photo"]',
      );
      expect(imagePath(img)).toBe(image.src);
      expect(thumb.querySelector('.thumb-mark')).toBeNull();
      expect(thumb.querySelector('.thumb-check')).toBeNull();
      expect(thumb.textContent).not.toContain(String(index + 1));
      expect(thumb.getAttribute('aria-current')).toBe(index === 0 ? 'true' : 'false');
    });
  });

  it('T16-AC02: renders each thumbnail image through app-product-image with the configured aspect ratio', async () => {
    const { root } = await createHarness();

    sampleImages.forEach((image, index) => {
      const thumb = queryButton(root, `[data-testid="gallery-thumb-${String(index)}"]`);
      const img = queryImage(
        thumb,
        '[data-testid="gallery-thumb-image"] [data-testid="image-photo"]',
      );
      expect(imagePath(img)).toBe(image.src);
      const rootEl = queryElement(thumb, '[data-testid="gallery-thumb-image"] .root');
      expect(rootEl.style.aspectRatio).toBe('1 / 1');
    });
  });

  it('T16-AC02: clicking a thumbnail emits imageSelected with that id and selects it', async () => {
    const { fixture, host, root } = await createHarness();

    const thumb2 = queryButton(root, '[data-testid="gallery-thumb-2"]');
    thumb2.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageSelected).toEqual(['img-side']);
    expect(host.selectedImageId()).toBe('img-side');

    const thumb0 = queryButton(root, '[data-testid="gallery-thumb-0"]');
    expect(thumb0.getAttribute('aria-current')).toBe('false');
    expect(thumb2.getAttribute('aria-current')).toBe('true');

    const activePhoto = queryImage(
      root,
      '[data-testid="gallery-main"] [data-testid="image-photo"]',
    );
    expect(imagePath(activePhoto)).toBe('/assets/products/demo-one-side.webp');
  });

  it('T16-AC02: displays image count formatted in current / total format with polite live region', async () => {
    const { fixture, host, root } = await createHarness();

    const countEl = queryElement(root, '[data-testid="gallery-count"]');
    expect(countEl.getAttribute('aria-live')).toBe('polite');
    expect(countEl.textContent.trim()).toBe('1 / 3');

    host.selectedImageId.set('img-back');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(countEl.textContent.trim()).toBe('2 / 3');

    host.selectedImageId.set('img-side');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(countEl.textContent.trim()).toBe('3 / 3');
  });
});

describe('FIX-50 product-gallery id resolution', () => {
  it('an id that matches no image falls back to the first image and renders the image-error note', async () => {
    const { fixture, host, root } = await createHarness();

    host.selectedImageId.set('does-not-exist');
    fixture.detectChanges();
    await fixture.whenStable();

    const note = queryElement(root, '[data-testid="gallery-image-error"]');
    expect(note.getAttribute('role')).toBe('status');

    const activePhoto = queryImage(
      root,
      '[data-testid="gallery-main"] [data-testid="image-photo"]',
    );
    expect(imagePath(activePhoto)).toBe('/assets/products/demo-one-front.webp');
  });

  it('a resolved id renders no image-error note', async () => {
    const { root } = await createHarness();
    expect(root.querySelector('[data-testid="gallery-image-error"]')).toBeNull();
  });
});

describe('T16-AC02 product-gallery zoom dialog', () => {
  it('T16-AC02: zoom button opens AccessibleDialog with role=dialog, aria-modal=true, and emits zoomRequested with the current id', async () => {
    const { fixture, host, root } = await createHarness();

    const zoomBtn = queryButton(root, '[data-testid="gallery-zoom-open"]');
    expect(zoomBtn).not.toBeNull();
    expect(zoomBtn.getAttribute('aria-label')).toBe('Kép nagyítása');
    expect(zoomBtn.querySelector('svg')).not.toBeNull();
    expect(zoomBtn.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(zoomBtn.textContent.trim()).toBe('');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    zoomBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedZoomRequested).toEqual(['img-front']);

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Nagyított kép: Demo One 5G');
  });

  it('T16-AC02: dialog close button closes the zoom dialog (closing is internal — no output for it)', async () => {
    const { fixture, host, root } = await createHarness();

    const zoomBtn = queryButton(root, '[data-testid="gallery-zoom-open"]');
    zoomBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const dialogClose = document.body.querySelector('[data-testid="dialog-close"]');
    if (!(dialogClose instanceof HTMLButtonElement)) {
      throw new Error('Expected HTMLButtonElement for dialog-close');
    }

    dialogClose.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedZoomRequested).toEqual(['img-front']);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('T16-AC02 product-gallery keyboard navigation', () => {
  it('T16-AC02: ArrowRight advances active image and ArrowLeft rewinds active image', async () => {
    const { fixture, host, root } = await createHarness();

    const gallerySection = queryElement(root, '[data-testid="product-gallery"]');

    gallerySection.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageSelected).toEqual(['img-back']);
    expect(host.selectedImageId()).toBe('img-back');

    gallerySection.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageSelected).toEqual(['img-back', 'img-front']);
    expect(host.selectedImageId()).toBe('img-front');
  });

  it('T16-AC02: Home moves to first image and End moves to last image', async () => {
    const { fixture, host, root } = await createHarness();

    const gallerySection = queryElement(root, '[data-testid="product-gallery"]');

    gallerySection.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageSelected).toEqual(['img-side']);
    expect(host.selectedImageId()).toBe('img-side');

    gallerySection.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageSelected).toEqual(['img-side', 'img-front']);
    expect(host.selectedImageId()).toBe('img-front');
  });

  it('T16-AC02: Escape key closes the zoom dialog when open', async () => {
    const { fixture, host, root } = await createHarness();

    const zoomBtn = queryButton(root, '[data-testid="gallery-zoom-open"]');
    zoomBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

    const gallerySection = queryElement(root, '[data-testid="product-gallery"]');
    gallerySection.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedZoomRequested).toEqual(['img-front']);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('T16-AC02 product-gallery image error fallback and no autoplay', () => {
  it('T16-AC02: renders fallback mark on image load error without substituting other device photo', async () => {
    const { fixture, root } = await createHarness();

    const photoImg = queryImage(root, '[data-testid="gallery-main"] [data-testid="image-photo"]');
    expect(photoImg).not.toBeNull();
    expect(
      root.querySelector('[data-testid="gallery-main"] [data-testid="image-fallback"]'),
    ).toBeNull();

    photoImg.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    await fixture.whenStable();

    const fallback = queryElement(
      root,
      '[data-testid="gallery-main"] [data-testid="image-fallback"]',
    );
    expect(fallback).not.toBeNull();
    const fallbackMark = queryElement(fallback, '.fallback-mark');
    expect(fallbackMark.textContent.trim()).toBe('D');
    expect(
      root.querySelector('[data-testid="gallery-main"] [data-testid="image-photo"]'),
    ).toBeNull();
  });

  it('renders every thumbnail through app-product-image with the neutral fallback on error', async () => {
    const { fixture, root } = await createHarness();

    const thumbPhoto = queryImage(
      root,
      '[data-testid="gallery-thumb-image"] [data-testid="image-photo"]',
    );
    expect(thumbPhoto).not.toBeNull();
    expect(
      root.querySelector('[data-testid="gallery-thumb-image"] [data-testid="image-fallback"]'),
    ).toBeNull();
    const mainPhoto = queryImage(root, '[data-testid="gallery-main"] [data-testid="image-photo"]');
    expect(mainPhoto).not.toBeNull();

    thumbPhoto.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      root.querySelector('[data-testid="gallery-thumb-image"] [data-testid="image-fallback"]'),
    ).not.toBeNull();
    // The main photo must remain on screen while the thumbnail falls back.
    expect(
      root.querySelector('[data-testid="gallery-main"] [data-testid="image-photo"]'),
    ).not.toBeNull();
  });

  it('T16-AC02: does not autoplay or advance index automatically without user action', async () => {
    const { fixture, host } = await createHarness();

    expect(host.selectedImageId()).toBe('img-front');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.selectedImageId()).toBe('img-front');
    expect(host.emittedImageSelected.length).toBe(0);
  });
});

describe('T16-AC05 product-gallery has no 3D surface', () => {
  it('T16-AC05: does not render canvas element, fake 3D button, or 3D labels', async () => {
    const { root } = await createHarness();

    expect(root.querySelector('canvas')).toBeNull();
    const buttons = root.querySelectorAll('button');
    buttons.forEach((btn) => {
      const label = (btn.getAttribute('aria-label') ?? '').toLowerCase();
      const text = btn.textContent.toLowerCase();
      expect(label).not.toContain('3d');
      expect(text).not.toContain('3d');
    });

    const fullText = root.textContent.toLowerCase();
    expect(fullText).not.toContain('3d');
  });
});

describe('MIM-233 product-gallery with a single image', () => {
  it('MIM-233: one image renders no prev/next buttons and no counter, and keeps zoom and the thumbnail', async () => {
    const { fixture, host, root } = await createHarness();
    host.images.set([sampleImages[0]]);
    host.selectedImageId.set(sampleImages[0].id);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(root.querySelector('[data-testid="gallery-prev"]')).toBeNull();
    expect(root.querySelector('[data-testid="gallery-next"]')).toBeNull();
    expect(root.querySelector('[data-testid="gallery-count"]')).toBeNull();
    expect(root.querySelector('[data-testid="gallery-zoom-open"]')).not.toBeNull();
    expect(root.querySelectorAll('button.thumb').length).toBe(1);
    expect(
      root.querySelector('[data-testid="gallery-main"] [data-testid="image-photo"]'),
    ).not.toBeNull();
    expect(queryButton(root, 'button.thumb').getAttribute('aria-current')).toBe('true');
  });

  it('MIM-233: two images render both buttons and the counter', async () => {
    const { fixture, host, root } = await createHarness();
    host.images.set([sampleImages[0], sampleImages[1]]);
    host.selectedImageId.set(sampleImages[0].id);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(root.querySelector('[data-testid="gallery-prev"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="gallery-next"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="gallery-count"]')?.textContent.trim()).toBe('1 / 2');
  });

  it('MIM-233: ArrowLeft, ArrowRight, Home and End on a single-image gallery do not emit imageSelected', async () => {
    const { fixture, host, root } = await createHarness();
    host.images.set([sampleImages[0]]);
    host.selectedImageId.set(sampleImages[0].id);
    fixture.detectChanges();
    await fixture.whenStable();

    const gallerySection = queryElement(root, '[data-testid="product-gallery"]');

    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      gallerySection.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
    }

    expect(host.emittedImageSelected.length).toBe(0);
    expect(host.selectedImageId()).toBe(sampleImages[0].id);
  });

  it('MIM-233: Home and End on a single-image gallery still stop the page from scrolling', async () => {
    const { fixture, host, root } = await createHarness();
    host.images.set([sampleImages[0]]);
    host.selectedImageId.set(sampleImages[0].id);
    fixture.detectChanges();
    await fixture.whenStable();

    const gallerySection = queryElement(root, '[data-testid="product-gallery"]');

    for (const key of ['Home', 'End']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      gallerySection.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(host.emittedImageSelected.length).toBe(0);
  });
});
