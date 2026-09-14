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

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('ProductImage primitive', () => {
  it('exposes the alt text via aria-label and a visually-hidden span', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement.querySelector('.root');
    expect(root.getAttribute('aria-label')).toBe('Demo telefon fotó');
    expect(root.textContent).toContain('Demo telefon fotó');
  });

  it('reserves the aspect ratio via style binding', () => {
    const { fixture, host } = setup();
    host.aspectRatio.set('1 / 1');
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement.querySelector('.root');
    // The binding sets the inline style; jsdom stores it on style.aspectRatio.
    expect(root.style.aspectRatio).toBe('1 / 1');
  });

  it('declares object-fit: contain in its stylesheet so the photo never stretches', () => {
    const css = (ProductImage as unknown as { ɵcmp: { styles: readonly string[] } }).ɵcmp.styles.join('\n');
    expect(css).toContain('object-fit: contain');
  });

  it('swaps to a neutral named fallback on image error rather than a random photo', () => {
    const { fixture, host } = setup();
    const photo: HTMLImageElement = fixture.nativeElement.querySelector('[data-testid="image-photo"]');
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host.failedCount()).toBe(1);
    expect(fixture.nativeElement.querySelector('[data-testid="image-fallback"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="image-photo"]')).toBeNull();
  });

  it('emits loadFailed exactly once per failure', () => {
    const { fixture, host } = setup();
    const photo: HTMLImageElement = fixture.nativeElement.querySelector('[data-testid="image-photo"]');
    photo.dispatchEvent(new Event('error'));
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host.failedCount()).toBe(1);
  });

  it('renders the product-name initial as the fallback marker', () => {
    const { fixture, host } = setup();
    const photo: HTMLImageElement = fixture.nativeElement.querySelector('[data-testid="image-photo"]');
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.fallback-mark')?.textContent?.trim()).toBe('D');
    host.productName.set('Apple iPhone');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.fallback-mark')?.textContent?.trim()).toBe('A');
  });
});
