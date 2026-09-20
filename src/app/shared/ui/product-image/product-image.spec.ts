import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { ProductImage } from './product-image';
import type { ImageLike } from './product-image';

@Component({
  imports: [ProductImage],
  template: `
    <app-product-image
      [aspectRatio]="aspectRatio()"
      [decorative]="decorative()"
      [image]="image()"
      [productName]="productName()"
      (loadFailed)="failedCount.set(failedCount() + 1)"
    />
  `,
})
class HostComponent {
  readonly image = signal<ImageLike>({
    src: '/assets/products/graphite-front.webp',
    alt: 'Demo telefon fotó',
    width: 800,
    height: 600,
  });
  readonly productName = signal('Demo One 5G');
  readonly aspectRatio = signal('4 / 3');
  readonly failedCount = signal(0);
  readonly decorative = signal(false);
}

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new TypeError('Expected HTMLElement');
  }
  return raw;
}

interface ComponentWithStyles {
  ɵcmp: {
    styles: readonly string[];
  };
}

function hasStyles(value: unknown): value is ComponentWithStyles {
  if (typeof value !== 'function' && typeof value !== 'object') {
    return false;
  }
  if (value === null || !('ɵcmp' in value)) {
    return false;
  }
  const cmp = value.ɵcmp;
  return typeof cmp !== 'object' || cmp === null || !('styles' in cmp)
    ? false
    : Array.isArray(cmp.styles);
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('ProductImage primitive', () => {
  it('exposes the alt text via aria-label and a visually-hidden span', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('role')).toBe('img');
    expect(root?.getAttribute('aria-label')).toBe('Demo telefon fotó');
    expect(root?.textContent).toContain('Demo telefon fotó');
  });

  // FIX-29 item 3: axe image-redundant-alt. When the surrounding markup
  // already names the image in visible text (product-card.html), the
  // primitive must not repeat that name a second time for a screen reader.
  it('suppresses role, aria-label, alt and the hidden span when decorative (FIX-29-AC03)', () => {
    const { fixture, host } = setup();
    host.decorative.set(true);
    fixture.detectChanges();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('role')).toBeNull();
    expect(root?.getAttribute('aria-label')).toBeNull();
    expect(root?.textContent.trim()).toBe('');
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    expect(photo?.getAttribute('alt')).toBe('');
  });

  it('keeps the real alt when decorative is false (the default)', () => {
    const { fixture } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    expect(photo?.getAttribute('alt')).toBe('Demo telefon fotó');
  });

  it('reserves the aspect ratio via style binding', () => {
    const { fixture, host } = setup();
    host.aspectRatio.set('1 / 1');
    fixture.detectChanges();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    // The binding sets the inline style; jsdom stores it on style.aspectRatio.
    expect(root?.style.aspectRatio).toBe('1 / 1');
  });

  it('declares object-fit: contain in its stylesheet so the photo never stretches', () => {
    if (!hasStyles(ProductImage)) {
      throw new Error('Expected ProductImage to have styles');
    }
    const css = ProductImage.ɵcmp.styles.join('\n');
    expect(css).toContain('object-fit: contain');
  });

  it('swaps to a neutral named fallback on image error rather than a random photo', () => {
    const { fixture, host } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    if (photo === null) {
      throw new Error('Expected image photo');
    }
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host.failedCount()).toBe(1);
    expect(
      getNativeElement(fixture).querySelector('[data-testid="image-fallback"]'),
    ).not.toBeNull();
    expect(getNativeElement(fixture).querySelector('[data-testid="image-photo"]')).toBeNull();
  });

  it('emits loadFailed exactly once per failure', () => {
    const { fixture, host } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    if (photo === null) {
      throw new Error('Expected image photo');
    }
    photo.dispatchEvent(new Event('error'));
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host.failedCount()).toBe(1);
  });

  it('renders the product-name initial as the fallback marker', () => {
    const { fixture, host } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    if (photo === null) {
      throw new Error('Expected image photo');
    }
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    const mark1 = getNativeElement(fixture).querySelector<HTMLElement>('.fallback-mark');
    expect(mark1).not.toBeNull();
    if (mark1 === null) {
      throw new Error('Expected fallback mark');
    }
    expect(mark1.textContent.trim()).toBe('D');
    host.productName.set('Apple iPhone');
    fixture.detectChanges();
    const mark2 = getNativeElement(fixture).querySelector<HTMLElement>('.fallback-mark');
    expect(mark2).not.toBeNull();
    if (mark2 === null) {
      throw new Error('Expected fallback mark');
    }
    expect(mark2.textContent.trim()).toBe('A');
  });

  it('resolves a logical /assets/ path against the document base URI (FIX-49)', () => {
    const { fixture } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    if (photo === null) {
      throw new Error('Expected image photo');
    }
    expect(photo.getAttribute('src')).toBe(
      new URL('assets/products/graphite-front.webp', document.baseURI).href,
    );
  });

  it('renders the fallback, not a broken <img>, when the wire src is rejected (FIX-49)', () => {
    const { fixture, host } = setup();
    host.image.set({
      src: 'https://evil.example/x.webp',
      alt: 'Demo telefon fotó',
      width: 800,
      height: 600,
    });
    fixture.detectChanges();
    expect(getNativeElement(fixture).querySelector('[data-testid="image-photo"]')).toBeNull();
    expect(
      getNativeElement(fixture).querySelector('[data-testid="image-fallback"]'),
    ).not.toBeNull();
  });
});
