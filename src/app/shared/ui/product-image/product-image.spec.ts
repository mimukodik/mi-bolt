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
      [decorative]="decorative()"
      [eager]="eager()"
      (loadFailed)="failedCount.set(failedCount() + 1)"
    ></app-product-image>
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
  readonly eager = signal(false);
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
    if (!photo) {
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
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
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

  it('resolves a logical /assets/ path against the document base URI (FIX-49)', () => {
    const { fixture } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    if (!photo) {
      throw new Error('Expected image photo');
    }
    expect(photo.getAttribute('src')).toBe(
      new URL('assets/products/graphite-front.webp', document.baseURI).href,
    );
  });

  // MIM-210: `Image.src` is a ready-to-use URL the server decides
  // (`docs/api/openapi.yaml:1126`); the catalogue serves it as
  // `/api/v1/media/<imageId>`. Rejecting that shape rendered the
  // monogram fallback on the gallery, the cart line and the card.
  it('renders the photo for a contract /api/v1/media/<imageId> src (MIM-210)', () => {
    const { fixture, host } = setup();
    host.image.set({
      src: '/api/v1/media/849997cd0d4d4ff9a1f0e4e1a1c4d9b1b7ab8d0ad2e0c3b7e0b8d4b5b8c5e7a1',
      alt: 'Demo telefon fotó',
      width: 800,
      height: 600,
    });
    fixture.detectChanges();
    expect(getNativeElement(fixture).querySelector('[data-testid="image-fallback"]')).toBeNull();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    expect(photo?.getAttribute('src')).toBe(
      new URL(
        'api/v1/media/849997cd0d4d4ff9a1f0e4e1a1c4d9b1b7ab8d0ad2e0c3b7e0b8d4b5b8c5e7a1',
        document.baseURI,
      ).href,
    );
  });

  it('renders the photo for an absolute https src', () => {
    const { fixture, host } = setup();
    host.image.set({
      src: 'https://cdn.example/products/a.webp',
      alt: 'Demo telefon fotó',
      width: 800,
      height: 600,
    });
    fixture.detectChanges();
    expect(getNativeElement(fixture).querySelector('[data-testid="image-fallback"]')).toBeNull();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    expect(photo?.getAttribute('src')).toBe('https://cdn.example/products/a.webp');
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('data-status')).toBe('loading');
    if (!photo) {
      throw new Error('Expected image photo');
    }
    photo.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(root?.getAttribute('data-status')).toBe('loaded');
  });

  it('lays the skeleton over the photo until the image loads (MIM-210)', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('data-status')).toBe('loading');
    // The `<img>` has to be in the DOM while loading or the browser
    // never fetches it, so both the photo and the skeleton are present.
    expect(getNativeElement(fixture).querySelector('[data-testid="image-photo"]')).not.toBeNull();
    expect(
      getNativeElement(fixture).querySelector('[data-testid="image-skeleton"]'),
    ).not.toBeNull();
  });

  it('switches to loaded and drops the skeleton when the <img> fires load (MIM-210)', () => {
    const { fixture } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    if (!photo) {
      throw new Error('Expected image photo');
    }
    expect(
      getNativeElement(fixture).querySelector('[data-testid="image-skeleton"]'),
    ).not.toBeNull();
    photo.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('data-status')).toBe('loaded');
    expect(getNativeElement(fixture).querySelector('[data-testid="image-skeleton"]')).toBeNull();
    expect(getNativeElement(fixture).querySelector('[data-testid="image-photo"]')).not.toBeNull();
  });

  it('returns to loading when the image input changes (MIM-210)', () => {
    const { fixture, host } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    if (!photo) {
      throw new Error('Expected image photo');
    }
    photo.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    host.image.set({
      src: '/assets/products/silver-front.webp',
      alt: 'Másik telefon fotó',
      width: 800,
      height: 600,
    });
    fixture.detectChanges();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('data-status')).toBe('loading');
    expect(
      getNativeElement(fixture).querySelector('[data-testid="image-skeleton"]'),
    ).not.toBeNull();
    expect(
      getNativeElement(fixture)
        .querySelector<HTMLImageElement>('[data-testid="image-photo"]')
        ?.getAttribute('src'),
    ).toBe(new URL('assets/products/silver-front.webp', document.baseURI).href);
  });

  // The `error` outcome has to be forgotten with the source as well as the
  // `load` one: without that, a gallery that fails on one variant keeps the
  // monogram on every later variant. Reverting `phase` to a plain signal
  // makes this case fail while the `load` case above still passes.
  it('shows the photo again after an error once the image input changes (MIM-210)', () => {
    const { fixture, host } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    if (!photo) {
      throw new Error('Expected image photo');
    }
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(
      getNativeElement(fixture).querySelector('[data-testid="image-fallback"]'),
    ).not.toBeNull();

    host.image.set({
      src: '/assets/products/silver-front.webp',
      alt: 'Másik telefon fotó',
      width: 800,
      height: 600,
    });
    fixture.detectChanges();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('data-status')).toBe('loading');
    expect(getNativeElement(fixture).querySelector('[data-testid="image-fallback"]')).toBeNull();
    expect(
      getNativeElement(fixture)
        .querySelector<HTMLImageElement>('[data-testid="image-photo"]')
        ?.getAttribute('src'),
    ).toBe(new URL('assets/products/silver-front.webp', document.baseURI).href);
  });

  // A rejected src in between must not hide the source change from the
  // linked `phase`: reading it only inside the non-null branch of
  // `status()` leaves the first image carrying its old failure when the
  // gallery comes back to it.
  it('retries an image that failed before a rejected one (MIM-210)', () => {
    const { fixture, host } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    if (!photo) {
      throw new Error('Expected image photo');
    }
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    host.image.set({
      src: '//evil.example/x.webp',
      alt: 'Elutasított kép',
      width: 800,
      height: 600,
    });
    fixture.detectChanges();
    expect(
      getNativeElement(fixture).querySelector<HTMLElement>('.root')?.getAttribute('data-status'),
    ).toBe('error');

    host.image.set({
      src: '/assets/products/graphite-front.webp',
      alt: 'Demo telefon fotó',
      width: 800,
      height: 600,
    });
    fixture.detectChanges();
    expect(
      getNativeElement(fixture).querySelector<HTMLElement>('.root')?.getAttribute('data-status'),
    ).toBe('loading');
    expect(
      getNativeElement(fixture)
        .querySelector<HTMLImageElement>('[data-testid="image-photo"]')
        ?.getAttribute('src'),
    ).toBe(new URL('assets/products/graphite-front.webp', document.baseURI).href);
  });

  it('renders the fallback, not a broken <img>, when the wire src is rejected (FIX-49)', () => {
    const { fixture, host } = setup();
    host.image.set({
      src: '//evil.example/x.webp',
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

  it('renders the photo with loading="lazy" by default', () => {
    const { fixture } = setup();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    expect(photo?.getAttribute('loading')).toBe('lazy');
  });

  it('renders the photo with loading="eager" when eager is set', () => {
    const { fixture, host } = setup();
    host.eager.set(true);
    fixture.detectChanges();
    const photo = getNativeElement(fixture).querySelector<HTMLImageElement>(
      '[data-testid="image-photo"]',
    );
    expect(photo?.getAttribute('loading')).toBe('eager');
  });
});
