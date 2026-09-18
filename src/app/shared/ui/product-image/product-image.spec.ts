import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { ProductImage } from './product-image';
import type { ImageLike } from './product-image';

@Component({
  imports: [ProductImage],
  template: `
    <app-product-image
      [image]="image()"
      [productName]="productName()"
      [aspectRatio]="aspectRatio()"
      (loadFailed)="failedCount.set(failedCount() + 1)"
    ></app-product-image>
  `,
})
class HostComponent {
  readonly image = signal<ImageLike>({
    src: '/test.png',
    alt: 'Demo telefon fotó',
    width: 800,
    height: 600,
  });
  readonly productName = signal('Demo One 5G');
  readonly aspectRatio = signal('4 / 3');
  readonly failedCount = signal(0);
}

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
  return raw;
}

interface ComponentWithStyles {
  ɵcmp: {
    styles: readonly string[];
  };
}

function hasStyles(val: unknown): val is ComponentWithStyles {
  if (typeof val !== 'function' && typeof val !== 'object') {
    return false;
  }
  if (val === null || !('ɵcmp' in val)) {
    return false;
  }
  const cmp = val.ɵcmp;
  if (typeof cmp !== 'object' || cmp === null || !('styles' in cmp)) {
    return false;
  }
  return Array.isArray(cmp.styles);
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
    expect(root?.getAttribute('aria-label')).toBe('Demo telefon fotó');
    expect(root?.textContent).toContain('Demo telefon fotó');
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
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>('[data-testid="image-photo"]');
    if (!photo) {
      throw new Error('Expected image photo');
    }
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host.failedCount()).toBe(1);
    expect(getNativeElement(fixture).querySelector('[data-testid="image-fallback"]')).not.toBeNull();
    expect(getNativeElement(fixture).querySelector('[data-testid="image-photo"]')).toBeNull();
  });

  it('emits loadFailed exactly once per failure', () => {
    const { fixture, host } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>('[data-testid="image-photo"]');
    if (!photo) {
      throw new Error('Expected image photo');
    }
    photo.dispatchEvent(new Event('error'));
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host.failedCount()).toBe(1);
  });

  it('renders the product-name initial as the fallback marker', () => {
    const { fixture, host } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>('[data-testid="image-photo"]');
    if (!photo) {
      throw new Error('Expected image photo');
    }
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    const mark1 = getNativeElement(fixture).querySelector<HTMLElement>('.fallback-mark');
    expect(mark1).not.toBeNull();
    if (!mark1) {
      throw new Error('Expected fallback mark');
    }
    expect(mark1.textContent.trim()).toBe('D');
    host.productName.set('Apple iPhone');
    fixture.detectChanges();
    const mark2 = getNativeElement(fixture).querySelector<HTMLElement>('.fallback-mark');
    expect(mark2).not.toBeNull();
    if (!mark2) {
      throw new Error('Expected fallback mark');
    }
    expect(mark2.textContent.trim()).toBe('A');
  });
});
