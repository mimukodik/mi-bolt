/**
 * T13: ProductCard atomic view-model (AC04).
 *
 * The card is purely presentational. It receives one CatalogItem and
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
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { CatalogItem } from '../../api/generated/models/catalog-item';
import type { ColorOption } from '../../api/generated/models/color-option';
import type { Money } from '../../shared/ui/price-block/price-block';

import { ProductCard } from './product-card';

beforeAll(async () => {
  await TestBed.compileComponents();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

function isObjectOrFunction(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'function' || typeof value === 'object') && value !== null;
}

function getComponentStyles(comp: unknown): readonly string[] {
  if (!isObjectOrFunction(comp)) {
    return [];
  }
  const cmp = comp['ɵcmp'];
  if (!isObjectOrFunction(cmp)) {
    return [];
  }
  const styles = cmp['styles'];
  if (Array.isArray(styles)) {
    return styles.filter((s): s is string => typeof s === 'string');
  }
  return [];
}

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
  return raw;
}

function queryElement(parent: Element, selector: string): HTMLElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error(`Expected HTMLElement: ${selector}`);
  return el;
}

function queryAnchor(parent: Element, selector: string): HTMLAnchorElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLAnchorElement))
    throw new Error(`Expected HTMLAnchorElement: ${selector}`);
  return el;
}

function queryImage(parent: Element, selector: string): HTMLImageElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLImageElement)) throw new Error(`Expected HTMLImageElement: ${selector}`);
  return el;
}

// ---------------------------------------------------------------------------
// Fixture factory
// ---------------------------------------------------------------------------

function money(amount: number): Money {
  return { amount, currency: 'HUF' };
}

function makeItem(opts: {
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
}): CatalogItem {
  const colorCode = opts.colorName !== undefined ? opts.colorName.toLowerCase() : 'graphite';
  const imageId = `${opts.id}-front`;
  const storageVal = opts.storageGb ?? 256;
  const variantId = `${opts.id}-${String(storageVal)}-${colorCode}`;
  const variantSlug = `${opts.slug}-${colorCode}-${String(storageVal)}`;
  const price = money(opts.price ?? 339_990);
  const displayedColor: ColorOption = {
    colorCode,
    colorName: opts.colorName ?? 'Grafit',
    swatchHex: '#343B43',
    variantId,
    variantSlug,
    price,
    availability: opts.availability ?? 'in_stock',
  };
  return {
    id: opts.id,
    slug: opts.slug,
    brand: opts.brand ?? 'MiBolt Demo',
    name: opts.name,
    highlights:
      opts.highlights !== undefined ? [...opts.highlights] : ['6,7″ kijelző', '50 MP kamera'],
    is5g: opts.is5g ?? true,
    releasedAt: '2026-01-01',
    storageGb: storageVal,
    variantId,
    variantSlug,
    price,
    availability: opts.availability ?? 'in_stock',
    maxQuantity: 5,
    image: {
      id: imageId,
      src: opts.imageSrc ?? `/assets/products/${colorCode}-front.webp`,
      alt: `${opts.name}, ${opts.colorName ?? 'Grafit'}, ${String(storageVal)} GB`,
      width: 320,
      height: 400,
    },
    colors: [displayedColor],
  };
}

@Component({
  imports: [ProductCard],
  template: `<app-product-card [product]="product()" />`,
})
class HostComponent {
  readonly product = signal<CatalogItem>(
    makeItem({ id: 'p-01', slug: 'demo-one-5g', name: 'Demo One 5G' }),
  );
}

function setup(): {
  fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  host: HostComponent;
} {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

// ---------------------------------------------------------------------------
// AC04: atomic view-model and outlined CTA
// ---------------------------------------------------------------------------

describe('T13-AC04 ProductCard', () => {
  it('renders the matching variant image with 4:3 frame and a decorative (empty) alt', () => {
    const { fixture } = setup();
    const raw = getRootElement(fixture);
    const frame = queryElement(raw, '[data-testid="product-card-image"]');
    // The aspect ratio MUST be exactly 4 / 3: R11 keeps the
    // optical size of the device consistent across the catalog.
    // ProductImage applies the input on its own inner `.root` element
    // (product-image.html), not on the app-product-image host, so read
    // it from where it actually lands.
    const mediaRoot = queryElement(frame, '.root');
    expect(mediaRoot.style.aspectRatio.replace(/\s+/g, '')).toBe('4/3');
    // FIX-29 item 3 (axe image-redundant-alt): the card passes
    // [decorative]="true" because the name, colour and storage already
    // render as visible text below the image (product-card.html:17-28),
    // so the image itself carries no alt and the wrapper carries no
    // role="img" — repeating the same words would announce them twice.
    const photo = queryImage(raw, '[data-testid="image-photo"]');
    expect(photo.getAttribute('alt')).toBe('');
    expect(mediaRoot.getAttribute('role')).toBeNull();
  });

  it('preserves the full device aspect: no cropping, object-fit contain', () => {
    const { fixture } = setup();
    const raw = getRootElement(fixture);
    const photo = queryImage(raw, '[data-testid="image-photo"]');
    // object-fit: contain is declared in ProductImage's own stylesheet
    // (product-image.scss), not ProductCard's; read the computed style
    // of the rendered <img> rather than the wrong component's style text.
    // Cropping via object-fit: cover is explicitly disallowed (R11).
    expect(getComputedStyle(photo).objectFit).toBe('contain');
  });

  it('renders the whole-HUF one-time price and the explicit one-time label', () => {
    const { fixture, host } = setup();
    host.product.set(
      makeItem({ id: 'p-01', slug: 'demo-one-5g', name: 'Demo One 5G', price: 339990 }),
    );
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const priceEl = queryElement(root, '[data-testid="price-amount"]');
    // 339 990: non-breaking space U+00A0 separator, integer HUF.
    expect(priceEl.textContent.replace(/\s+/g, ' ').trim()).toBe('339 990');
    const label = queryElement(root, '.label');
    expect(label.textContent).toContain('Egyszeri');
  });

  it('the price block renders at the md size (MIM-210)', () => {
    const { fixture } = setup();
    const root = getRootElement(fixture);
    const priceRoot = queryElement(root, 'app-price-block .root');
    expect(priceRoot.getAttribute('data-size')).toBe('md');
  });

  it('renders the matching variant color label and storage bucket together', () => {
    const { fixture, host } = setup();
    host.product.set(
      makeItem({
        id: 'p-02',
        slug: 'demo-air-5g',
        name: 'Demo Air 5G',
        storageGb: 128,
        colorName: 'Ezüst',
      }),
    );
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const text = root.textContent.replace(/\s+/g, ' ');
    expect(text).toContain('Ezüst');
    expect(text).toContain('128 GB');
  });

  it('renders the outlined "Megnézem" CTA: not a filled primary button', () => {
    const { fixture } = setup();
    const cta = queryElement(getRootElement(fixture), '[data-testid="product-card-cta"]');
    expect(cta.textContent).toContain('Megnézem');
    const css = getComponentStyles(ProductCard).join('\n');
    expect(css).toContain('border'); // outlined look: border on the CTA
  });

  it('navigates to the product detail route with the matching variant id', () => {
    const { fixture, host } = setup();
    host.product.set(
      makeItem({
        id: 'p-01',
        slug: 'demo-one-5g',
        name: 'Demo One 5G',
        colorName: 'Grafit',
        storageGb: 256,
      }),
    );
    fixture.detectChanges();
    const link = queryAnchor(getRootElement(fixture), '[data-testid="product-card-cta"]');
    const href = link.getAttribute('href') ?? '';
    expect(href).toBe('/telefonok/demo-one-5g?variant=p-01-256-grafit');
  });

  it("the details link carries the item's variantId as the variant query parameter (MIM-210)", () => {
    const { fixture, host } = setup();
    host.product.set(
      makeItem({
        id: 'p-07',
        slug: 'demo-pro-5g',
        name: 'Demo Pro 5G',
        colorName: 'Arany',
        storageGb: 512,
      }),
    );
    fixture.detectChanges();
    const item = host.product();
    const link = queryAnchor(getRootElement(fixture), '[data-testid="product-card-cta"]');
    const href = link.getAttribute('href') ?? '';
    expect(href).toBe(`/telefonok/${item.slug}?variant=${item.variantId}`);
  });

  it('the image and name links carry the same variant query as the CTA', () => {
    const { fixture, host } = setup();
    host.product.set(
      makeItem({
        id: 'p-07',
        slug: 'demo-pro-5g',
        name: 'Demo Pro 5G',
        colorName: 'Arany',
        storageGb: 512,
      }),
    );
    fixture.detectChanges();
    const item = host.product();
    const root = getRootElement(fixture);
    const anchors = Array.from(root.querySelectorAll('a[href]'));
    expect(anchors.length).toBe(3);
    const expected = `/telefonok/${item.slug}?variant=${item.variantId}`;
    for (const anchor of anchors) {
      expect(anchor.getAttribute('href')).toBe(expected);
    }
  });

  it('falls back to the named image-fallback when the photo errors (no invented device)', () => {
    const { fixture } = setup();
    const photo = queryImage(getRootElement(fixture), '[data-testid="image-photo"]');
    photo.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    const fallback = queryElement(getRootElement(fixture), '[data-testid="image-fallback"]');
    // The fallback MUST stay inside the card and keep the product's
    // initial so the user still sees WHICH product this card is.
    expect(fallback.textContent).toMatch(/D/);
  });

  it('limits the rendered highlights to at most two', () => {
    const { fixture, host } = setup();
    host.product.set(
      makeItem({
        id: 'p-03',
        slug: 'demo-pro-5g',
        name: 'Demo Pro 5G',
        highlights: ['6,7″ kijelző', '50 MP kamera', '5000 mAh', '120 Hz'],
      }),
    );
    fixture.detectChanges();
    const list = getRootElement(fixture).querySelectorAll(
      '[data-testid="product-card-highlights"] .highlights__item',
    );
    expect(list.length).toBe(2);
    const first = list[0];
    expect(first.textContent).toContain('6,7″ kijelző');
  });

  it('FIX-35: carries a DEMÓTERMÉK tag and never renders the brand name', () => {
    const { fixture, host } = setup();
    host.product.set(
      makeItem({ id: 'p-04', slug: 'demo-lite-5g', name: 'Demo Lite 5G', brand: 'MiBolt Demo' }),
    );
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const tag = queryElement(root, '[data-testid="product-card-tag"]');
    expect(tag.textContent.trim()).toBe('DEMÓTERMÉK');
    expect(root.textContent).not.toContain('MiBolt Demo');
  });
});
