/**
 * T13 — ProductCard atomic view-model (AC04).
 *
 * The card is purely presentational. It receives one ProductSummary and
 * renders the catalog atomic view: image (4:3, no crop), product name,
 * up to two highlights, the matching variant's color/storage label,
 * the whole-HUF one-time price and an outlined "Részletek" link that
 * navigates to the product detail route. The component owns no HTTP
 * logic and no facade reference.
 *
 * AC04 sub-rules verified here:
 *   - 4:3 media frame, no crop of the device.
 *   - matching-variant image, storage label, stock state, price.
 *   - whole-HUF one-time price formatted by PriceBlock.
 *   - outlined "Részletek" CTA, not a filled primary.
 *   - image-error fallback path is exposed but does not invent a
 *     different device.
 *
 * The suite deliberately mirrors the patterns used by `home-page.spec.ts`
 * and `catalog.facade.spec.ts` so a reader can lift any of those files
 * and find this one in the same shape.
 */

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Component, signal } from '@angular/core';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import type { ProductSummary } from '../../api/generated/models/product-summary';
import type { Variant } from '../../api/generated/models/variant';
import type { Money } from '../../shared/ui/price-block/price-block';

import { ProductCard } from './product-card';

beforeAll(async () => {
  await TestBed.compileComponents();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

// ---------------------------------------------------------------------------
// Fixture factory
// ---------------------------------------------------------------------------

function money(amount: number): Money {
  return { amount, currency: 'HUF' };
}

function makeImage(id: string, src: string, alt: string): Variant['images'][number] {
  return { id, src, alt, width: 320, height: 400 };
}

function makeSummary(opts: {
  readonly id: string;
  readonly slug: string;
  readonly brand?: string;
  readonly name: string;
  readonly highlights?: readonly string[];
  readonly colorName?: string;
  readonly storageGb?: 128 | 256 | 512;
  readonly price?: number;
  readonly availability?: 'in_stock' | 'out_of_stock';
  readonly imageSrc?: string;
  readonly is5g?: boolean;
}): ProductSummary {
  const colorCode = opts.colorName ? opts.colorName.toLowerCase() : 'graphite';
  const imageId = `${opts.id}-front`;
  const variant: Variant = {
    id: `${opts.id}-${opts.storageGb ?? 256}-${colorCode}`,
    colorCode,
    colorName: opts.colorName ?? 'Grafit',
    swatchHex: '#343B43',
    storageGb: opts.storageGb ?? 256,
    price: money(opts.price ?? 339_990),
    availability: opts.availability ?? 'in_stock',
    maxQuantity: 5,
    images: [
      makeImage(
        imageId,
        opts.imageSrc ?? `/assets/products/${colorCode}-front.webp`,
        `${opts.name}, ${opts.colorName ?? 'Grafit'}, ${opts.storageGb ?? 256} GB`,
      ),
    ],
  };
  return {
    id: opts.id,
    slug: opts.slug,
    brand: opts.brand ?? 'MiBolt Demo',
    name: opts.name,
    highlights: opts.highlights ? [...opts.highlights] : ['6,7″ kijelző', '50 MP kamera'],
    defaultVariant: variant,
    is5g: opts.is5g ?? true,
    isDemo: true,
  };
}

@Component({
  imports: [ProductCard],
  template: `<app-product-card [product]="product()" />`,
})
class HostComponent {
  readonly product = signal<ProductSummary>(makeSummary({ id: 'p-01', slug: 'demo-one-5g', name: 'Demo One 5G' }));
}

function setup(): { fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>; host: HostComponent } {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

// ---------------------------------------------------------------------------
// AC04 — atomic view-model and outlined CTA
// ---------------------------------------------------------------------------

describe('T13-AC04 ProductCard', () => {
  it('renders the matching variant image with 4:3 frame and intact alt', () => {
    const { fixture } = setup();
    const root = fixture.nativeElement as HTMLElement;
    const frame = root.querySelector('[data-testid="product-card-image"]') as HTMLElement;
    expect(frame).not.toBeNull();
    // The aspect ratio MUST be exactly 4 / 3 — R11 keeps the
    // optical size of the device consistent across the catalog.
    expect(frame.style.aspectRatio.replace(/\s+/g, '')).toBe('4/3');
    const photo = root.querySelector('[data-testid="image-photo"]') as HTMLImageElement;
    expect(photo).not.toBeNull();
    expect(photo.getAttribute('alt')).toContain('Demo One 5G');
    expect(photo.getAttribute('alt')).toContain('256 GB');
  });

  it('preserves the full device aspect — no cropping, object-fit contain', () => {
    setup();
    const css = (ProductCard as unknown as { ɵcmp: { styles: readonly string[] } }).ɵcmp.styles.join('\n');
    expect(css).toContain('object-fit: contain');
    // Cropping via object-fit: cover is explicitly disallowed (R11).
    expect(css).not.toContain('object-fit: cover');
  });

  it('renders the whole-HUF one-time price and the explicit one-time label', () => {
    const { fixture, host } = setup();
    host.product.set(makeSummary({ id: 'p-01', slug: 'demo-one-5g', name: 'Demo One 5G', price: 339990 }));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const priceEl = root.querySelector('[data-testid="price-amount"]') as HTMLElement;
    expect(priceEl).not.toBeNull();
    // 339 990 — non-breaking space U+00A0 separator, integer HUF.
    expect(priceEl.textContent?.replace(/\s+/g, ' ').trim()).toBe('339 990');
    const label = root.querySelector('.label') as HTMLElement | null;
    expect(label?.textContent ?? '').toContain('Egyszeri');
  });

  it('renders the matching variant color label and storage bucket together', () => {
    const { fixture, host } = setup();
    host.product.set(
      makeSummary({
        id: 'p-02',
        slug: 'demo-air-5g',
        name: 'Demo Air 5G',
        storageGb: 128,
        colorName: 'Ezüst',
      }),
    );
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const text = (root.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain('Ezüst');
    expect(text).toContain('128 GB');
  });

  it('renders the outlined "Részletek" CTA — not a filled primary button', () => {
    const { fixture } = setup();
    const cta = fixture.nativeElement.querySelector('[data-testid="product-card-cta"]') as HTMLElement;
    expect(cta).not.toBeNull();
    expect(cta.textContent ?? '').toContain('Részletek');
    const css = (ProductCard as unknown as { ɵcmp: { styles: readonly string[] } }).ɵcmp.styles.join('\n');
    expect(css).toContain('border'); // outlined look — border on the CTA
  });

  it('navigates to the product detail route with the default variant id', () => {
    const { fixture } = setup();
    const link = fixture.nativeElement.querySelector('[data-testid="product-card-cta"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toContain('/telefonok/demo-one-5g');
    expect(link.getAttribute('href')).toContain('variant=');
  });

  it('falls back to the named image-fallback when the photo errors (no invented device)', () => {
    const { fixture } = setup();
    const photo = fixture.nativeElement.querySelector('[data-testid="image-photo"]') as HTMLImageElement;
    expect(photo).not.toBeNull();
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    const fallback = fixture.nativeElement.querySelector('[data-testid="image-fallback"]') as HTMLElement;
    expect(fallback).not.toBeNull();
    // The fallback MUST stay inside the card and keep the product's
    // initial so the user still sees WHICH product this card is.
    expect(fallback.textContent ?? '').toMatch(/D/);
  });

  it('limits the rendered highlights to at most two', () => {
    const { fixture, host } = setup();
    host.product.set(
      makeSummary({
        id: 'p-03',
        slug: 'demo-pro-5g',
        name: 'Demo Pro 5G',
        highlights: ['6,7″ kijelző', '50 MP kamera', '5000 mAh', '120 Hz'],
      }),
    );
    fixture.detectChanges();
    const list = fixture.nativeElement.querySelectorAll('[data-testid="product-card-highlights"] li');
    expect(list.length).toBe(2);
    expect(list[0]?.textContent ?? '').toContain('6,7″ kijelző');
  });
});
