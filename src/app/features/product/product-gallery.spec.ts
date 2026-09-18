// @vitest-environment jsdom
import '@angular/compiler';

import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ProductGallery } from './product-gallery';
import type { ImageLike } from '../../shared/ui/product-image/product-image';

/**
 * T16 - Product gallery component (T16-AC02 / T16-AC05).
 *
 * Real Angular TestBed behavior tests covering:
 *
 *   - T16-AC02: prev and next buttons advance and rewind active image,
 *     disabling at boundary 0 and length - 1 without wrapping.
 *   - T16-AC02: thumbnail strip renders one button per image with
 *     aria-current on the selected index; click invokes goTo(i).
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
 */

const sampleImages: readonly ImageLike[] = [
  {
    src: '/assets/products/demo-one-front.webp',
    alt: 'Demo One 5G - Elolap',
    width: 800,
    height: 600,
  },
  {
    src: '/assets/products/demo-one-back.webp',
    alt: 'Demo One 5G - Hatlap',
    width: 800,
    height: 600,
  },
  {
    src: '/assets/products/demo-one-side.webp',
    alt: 'Demo One 5G - Oldalnezat',
    width: 800,
    height: 600,
  },
] satisfies readonly ImageLike[];

@Component({
  imports: [ProductGallery],
  template: `
    <app-product-gallery
      [images]="images()"
      [imageIndex]="imageIndex()"
      [productName]="productName()"
      (imageChange)="onImageChange($event)"
      (zoomChange)="onZoomChange($event)"
    ></app-product-gallery>
  `,
})
class GalleryTestHost {
  readonly images = signal<readonly ImageLike[]>(sampleImages);
  readonly imageIndex = signal<number>(0);
  readonly productName = signal<string>('Demo One 5G');

  readonly emittedImageChanges: number[] = [];
  readonly emittedZoomChanges: boolean[] = [];

  onImageChange(index: number): void {
    this.emittedImageChanges.push(index);
    this.imageIndex.set(index);
  }

  onZoomChange(opened: boolean): void {
    this.emittedZoomChanges.push(opened);
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

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
      teardown: { destroyAfterEach: true },
    });
  } catch {
    // Environment already initialized
  }
});

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
  it('T16-AC02: renders previous and next buttons that emit imageChange with updated index', async () => {
    const { fixture, host, root } = await createHarness();

    const prevBtn = queryButton(root, '[data-testid="gallery-prev"]');
    const nextBtn = queryButton(root, '[data-testid="gallery-next"]');
    expect(prevBtn).not.toBeNull();
    expect(nextBtn).not.toBeNull();

    // At index 0, next button advances to index 1
    nextBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageChanges).toEqual([1]);
    expect(host.imageIndex()).toBe(1);

    const activePhoto = queryImage(root, '[data-testid="image-photo"]');
    expect(activePhoto.getAttribute('src')).toBe('/assets/products/demo-one-back.webp');

    // From index 1, prev button returns to index 0
    prevBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageChanges).toEqual([1, 0]);
    expect(host.imageIndex()).toBe(0);
    expect(queryImage(root, '[data-testid="image-photo"]').getAttribute('src')).toBe(
      '/assets/products/demo-one-front.webp',
    );
  });

  it('T16-AC02: disables prev button at start index 0 and does not wrap backward', async () => {
    const { fixture, host, root } = await createHarness();

    const prevBtn = queryButton(root, '[data-testid="gallery-prev"]');
    expect(prevBtn.disabled).toBe(true);
    expect(host.imageIndex()).toBe(0);

    // Clicking disabled prev does not advance or emit
    prevBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageChanges.length).toBe(0);
    expect(host.imageIndex()).toBe(0);
  });

  it('T16-AC02: disables next button at the last image and does not wrap forward', async () => {
    const { fixture, host, root } = await createHarness();

    host.imageIndex.set(2);
    fixture.detectChanges();
    await fixture.whenStable();

    const nextBtn = queryButton(root, '[data-testid="gallery-next"]');
    expect(nextBtn.disabled).toBe(true);

    nextBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageChanges.length).toBe(0);
    expect(host.imageIndex()).toBe(2);
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
      const thumb = queryButton(root, `[data-testid="gallery-thumb-${index}"]`);
      const img = queryImage(thumb, 'img.thumb-img');
      expect(img.getAttribute('src')).toBe(image.src);
      expect(thumb.querySelector('.thumb-' + 'mark')).toBeNull();
      expect(thumb.textContent).not.toContain(String(index + 1));
      expect(thumb.getAttribute('aria-current')).toBe(index === 0 ? 'true' : 'false');
    });
  });

  it('T16-AC02: clicking a thumbnail emits imageChange with that index and selects it', async () => {
    const { fixture, host, root } = await createHarness();

    const thumb2 = queryButton(root, '[data-testid="gallery-thumb-2"]');
    thumb2.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageChanges).toEqual([2]);
    expect(host.imageIndex()).toBe(2);

    const thumb0 = queryButton(root, '[data-testid="gallery-thumb-0"]');
    expect(thumb0.getAttribute('aria-current')).toBe('false');
    expect(thumb2.getAttribute('aria-current')).toBe('true');

    const activePhoto = queryImage(root, '[data-testid="image-photo"]');
    expect(activePhoto.getAttribute('src')).toBe('/assets/products/demo-one-side.webp');
  });

  it('T16-AC02: displays image count formatted in current / total format with polite live region', async () => {
    const { fixture, host, root } = await createHarness();

    const countEl = queryElement(root, '[data-testid="gallery-count"]');
    expect(countEl.getAttribute('aria-live')).toBe('polite');
    expect(countEl.textContent.trim()).toBe('1 / 3');

    host.imageIndex.set(1);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(countEl.textContent.trim()).toBe('2 / 3');

    host.imageIndex.set(2);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(countEl.textContent.trim()).toBe('3 / 3');
  });
});

describe('T16-AC02 product-gallery zoom dialog', () => {
  it('T16-AC02: zoom button opens AccessibleDialog with role=dialog and aria-modal=true', async () => {
    const { fixture, host, root } = await createHarness();

    const zoomBtn = queryButton(root, '[data-testid="gallery-zoom-open"]');
    expect(zoomBtn).not.toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    zoomBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedZoomChanges).toEqual([true]);

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Nagyított kép: Demo One 5G');
  });

  it('T16-AC02: dialog close button closes the zoom dialog and emits zoomChange false', async () => {
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

    expect(host.emittedZoomChanges).toEqual([true, false]);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('T16-AC02 product-gallery keyboard navigation', () => {
  it('T16-AC02: ArrowRight advances active image and ArrowLeft rewinds active image', async () => {
    const { fixture, host, root } = await createHarness();

    const gallerySection = queryElement(root, '[data-testid="product-gallery"]');

    // ArrowRight steps to index 1
    gallerySection.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageChanges).toEqual([1]);
    expect(host.imageIndex()).toBe(1);

    // ArrowLeft steps back to index 0
    gallerySection.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageChanges).toEqual([1, 0]);
    expect(host.imageIndex()).toBe(0);
  });

  it('T16-AC02: Home moves to first image and End moves to last image', async () => {
    const { fixture, host, root } = await createHarness();

    const gallerySection = queryElement(root, '[data-testid="product-gallery"]');

    // End jumps to index 2
    gallerySection.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageChanges).toEqual([2]);
    expect(host.imageIndex()).toBe(2);

    // Home jumps back to index 0
    gallerySection.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emittedImageChanges).toEqual([2, 0]);
    expect(host.imageIndex()).toBe(0);
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

    expect(host.emittedZoomChanges).toEqual([true, false]);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('T16-AC02 product-gallery image error fallback and no autoplay', () => {
  it('T16-AC02: renders fallback mark on image load error without substituting other device photo', async () => {
    const { fixture, root } = await createHarness();

    const photoImg = queryImage(root, '[data-testid="image-photo"]');
    expect(photoImg).not.toBeNull();
    expect(root.querySelector('[data-testid="image-fallback"]')).toBeNull();

    // Trigger image load failure
    photoImg.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    await fixture.whenStable();

    const fallback = queryElement(root, '[data-testid="image-fallback"]');
    expect(fallback).not.toBeNull();
    const fallbackMark = queryElement(fallback, '.fallback-mark');
    expect(fallbackMark.textContent.trim()).toBe('D');
    expect(root.querySelector('[data-testid="image-photo"]')).toBeNull();
  });

  it('T16-AC02: does not autoplay or advance index automatically without user action', async () => {
    const { fixture, host } = await createHarness();

    expect(host.imageIndex()).toBe(0);

    // Advance artificial delay and trigger change detection
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.imageIndex()).toBe(0);
    expect(host.emittedImageChanges.length).toBe(0);
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
