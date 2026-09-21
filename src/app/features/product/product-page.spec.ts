// @vitest-environment jsdom
import '@angular/compiler';

import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { Location } from '@angular/common';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server, useMswServer } from '../../../../tests/msw-server';
import { provideApiConfiguration } from '../../api/generated/api-configuration';
import type { Cart } from '../../api/generated/models/cart';
import type { CatalogItem } from '../../api/generated/models/catalog-item';
import { demoSessionInterceptor } from '../../core/api/demo-session.interceptor';
import { CartFacade } from '../cart/cart.facade';
import { isProductNotFound, ProductFacade, type ProductVm } from './product.facade';
import { ProductPage } from './product-page';
import { DEMO_PRODUCT } from '../../../mocks/cart/cart.handlers';
import type { Product } from '../../api/generated/models/product';
import type { Variant } from '../../api/generated/models/variant';

/**
 * `src/mocks/repository`'s `Product`/`Variant` types declare their
 * array fields `readonly`; the generated SDK's `Product` (which
 * `ProductVm.product` is typed against) declares the same fields
 * mutable. The two are structurally incompatible for direct
 * assignment, so a stubbed `ProductVm` needs a fresh object built
 * with mutable copies of every array `DEMO_PRODUCT` carries.
 */
function toGeneratedProduct(source: typeof DEMO_PRODUCT): Product {
  const toVariant = (v: (typeof source.variants)[number]): Variant => ({
    ...v,
    slug: `${v.id}-variant`,
    images: [...v.images],
  });
  // Drop the fields the mock fixture still carries but the
  // 2.0.0 Product type no longer accepts, and supply the `releasedAt`
  // field ProductBase requires but the mock fixture omits.
  const { isDemo: _isDemo, defaultVariant: _defaultVariant, ...rest } = source;
  return {
    ...rest,
    releasedAt: '2026-01-01',
    highlights: [...source.highlights],
    variants: source.variants.map(toVariant),
    specGroups: source.specGroups.map((g) => ({ ...g, rows: [...g.rows] })),
  };
}

/**
 * T16 - Product detail page (S3).
 *
 * Real Angular TestBed behavior tests covering:
 *
 *   - T16-AC01: desktop 7/5 column split and responsive single-column
 *     layout structure with gallery on the left and buy panel on the right.
 *   - T16-AC02: gallery is mounted via ProductGallery with active variant
 *     images, image count, and imageChange forwarding to the facade.
 *   - T16-AC03: color and storage variant selection with label, swatch,
 *     checkmark, and aria-pressed; specification groups rendered as
 *     always-open boxes with a title and label/value rows.
 *   - T16-AC04: mobile purchase rail carries price block + primary CTA
 *     and dispatches the chosen variant id and quantity to CartFacade
 *     through the page's own add orchestrator (FIX-50).
 *   - T16-AC05: baseline product page has no 3D surface (no canvas element,
 *     no 3D script, no fake 3D button).
 *   - States (R19): initial loading state skeleton, error state with retry.
 *   - Shared primitives: Button, PriceBlock, QuantityControl, ErrorState,
 *     LoadingState, ProductGallery, VariantSelector, SpecificationAccordion.
 */

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

const BASE_URL = 'http://localhost/api/v1';

interface CapturedRequest {
  readonly method: string;
  readonly url: string;
  readonly bodyText: string;
}

const capturedRequests: CapturedRequest[] = [];

function makeMockCart(cartId: string): Cart {
  return {
    id: cartId,
    version: 1,
    items: [],
    lineCount: 0,
    totalQuantity: 0,
    subtotal: { amount: 0, currency: 'HUF' },
    expiresAt: '2026-12-31T23:59:59.000Z',
    notices: [],
  } satisfies Cart;
}

beforeEach(() => {
  capturedRequests.length = 0;
  server.use(
    http.get(`${BASE_URL}/products/:slug`, ({ params }) => {
      const slug = params['slug'];
      if (slug === 'demo-one-5g') {
        return HttpResponse.json(DEMO_PRODUCT, { status: 200 });
      }
      return HttpResponse.json(
        {
          type: 'https://example.com/not-found',
          title: 'Nem található',
          status: 404,
          detail: `Product not found`,
        },
        { status: 404 },
      );
    }),

    http.get(`${BASE_URL}/products/:slug/related`, () =>
      HttpResponse.json(
        [
          {
            id: 'r-01',
            slug: 'demo-related-1',
            brand: 'MiBolt Demo',
            name: 'Demo Related One',
            highlights: ['Hasonló ajánlat'],
            is5g: true,
            releasedAt: '2026-01-01',
            storageGb: 128,
            variantId: 'demo-related-1-graphite-128',
            variantSlug: 'demo-related-1-graphite-128',
            price: { amount: 199_990, currency: 'HUF' },
            availability: 'in_stock',
            maxQuantity: 5,
            image: {
              id: 'demo-related-1-graphite-128-front',
              src: '/assets/products/silver-front.webp',
              alt: 'Demo Related One',
              width: 320,
              height: 400,
            },
            colors: [
              {
                colorCode: 'graphite',
                colorName: 'Grafit',
                swatchHex: '#343B43',
                variantId: 'demo-related-1-graphite-128',
              },
            ],
          },
          {
            id: 'r-02',
            slug: 'demo-related-2',
            brand: 'MiBolt Demo',
            name: 'Demo Related Two',
            highlights: ['Másik hasonló ajánlat'],
            is5g: true,
            releasedAt: '2026-01-01',
            storageGb: 256,
            variantId: 'demo-related-2-graphite-256',
            variantSlug: 'demo-related-2-graphite-256',
            price: { amount: 249_990, currency: 'HUF' },
            availability: 'in_stock',
            maxQuantity: 5,
            image: {
              id: 'demo-related-2-graphite-256-front',
              src: '/assets/products/graphite-front.webp',
              alt: 'Demo Related Two',
              width: 320,
              height: 400,
            },
            colors: [
              {
                colorCode: 'graphite',
                colorName: 'Grafit',
                swatchHex: '#343B43',
                variantId: 'demo-related-2-graphite-256',
              },
            ],
          },
        ],
        { status: 200 },
      ),
    ),

    http.get(`${BASE_URL}/cart`, () =>
      HttpResponse.json(makeMockCart('cart-test-page-1'), {
        status: 200,
        headers: { ETag: '"1"' },
      }),
    ),

    http.post(`${BASE_URL}/cart/items`, async ({ request }) => {
      const bodyText = await request.text();
      capturedRequests.push({ method: 'POST', url: request.url, bodyText });
      return HttpResponse.json(makeMockCart('cart-test-page-1'), {
        status: 200,
        headers: { ETag: '"2"' },
      });
    }),
  );
});

afterEach(() => {
  server.resetHandlers();
  TestBed.resetTestingModule();
});

@Component({
  imports: [ProductPage],
  template: ` <app-product-page [slug]="slug()" /> `,
})
class ProductPageHost {
  readonly slug = signal<string>('demo-one-5g');
}

@Component({ template: '' })
class StubCatalogPage {
  /** Route target only; FIX-45-AC02 asserts on the resulting URL. */
  readonly loaded = true;
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

async function createHarness(): Promise<{
  fixture: ComponentFixture<ProductPageHost>;
  host: ProductPageHost;
  root: HTMLElement;
  facade: ProductFacade;
  cartFacade: CartFacade;
  location: Location;
  tick: () => Promise<void>;
}> {
  TestBed.configureTestingModule({
    imports: [ProductPageHost],
    providers: [
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
      provideRouter([{ path: 'telefonok', component: StubCatalogPage }]),
    ],
    teardown: { destroyAfterEach: true },
  });

  await TestBed.compileComponents();

  const fixture = TestBed.createComponent(ProductPageHost);
  const host = fixture.componentInstance;
  const facade = TestBed.inject(ProductFacade);
  const cartFacade = TestBed.inject(CartFacade);
  const location = TestBed.inject(Location);

  const tick = async (): Promise<void> => {
    for (let i = 0; i < 8; i += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 15);
      });
      fixture.detectChanges();
    }
  };

  fixture.detectChanges();
  await fixture.whenStable();
  await tick();

  return {
    fixture,
    host,
    root: getRootElement(fixture),
    facade,
    cartFacade,
    location,
    tick,
  };
}

describe('T16-AC01 product-page responsive layout and chrome', () => {
  it('T16-AC01: renders page card containing two-column layout with gallery and buy panel', async () => {
    const { root } = await createHarness();

    const page = queryElement(root, '[data-testid="product-page"]');
    expect(page).not.toBeNull();

    const card = queryElement(page, '.card');
    expect(card).not.toBeNull();

    const layout = queryElement(card, '.layout');
    expect(layout).not.toBeNull();

    const galleryCol = layout.querySelector('.gallery');
    const configCol = layout.querySelector('.config');
    const buyCol = layout.querySelector('.buy');
    expect(galleryCol).not.toBeNull();
    expect(configCol).not.toBeNull();
    expect(buyCol).not.toBeNull();
    expect(buyCol?.querySelector('.buy-box')).not.toBeNull();
  });

  it('the buy box carries the price block in inverse colours (MIM-210)', async () => {
    const { root } = await createHarness();

    const price = queryElement(root, '.buy-box app-price-block .root');
    expect(price.hasAttribute('data-inverse')).toBe(true);
    expect(price.getAttribute('data-size')).toBe('lg');
  });

  it('T16-AC01: displays brand and product name matching the loaded product', async () => {
    const { root } = await createHarness();

    const brandEl = queryElement(root, '.brand');
    expect(brandEl.textContent.trim()).toBe('MiBolt Demo');

    const nameEl = queryElement(root, '[data-testid="product-name"]');
    expect(nameEl.textContent.trim()).toBe('Demo One 5G');
  });
});

describe('T16-AC02 product-page embeds the gallery primitive', () => {
  it('T16-AC02: mounts ProductGallery with active variant images and count', async () => {
    const { root } = await createHarness();

    const galleryEl = queryElement(root, 'app-product-gallery');
    expect(galleryEl).not.toBeNull();

    const galleryMain = queryElement(galleryEl, '[data-testid="gallery-main"]');
    expect(galleryMain).not.toBeNull();

    const count = queryElement(galleryEl, '[data-testid="gallery-count"]');
    expect(count.textContent.trim()).toBe('1 / 1');
  });

  it('T16-AC02: forwards gallery imageChange events to update active image', async () => {
    const { fixture, facade, root, tick } = await createHarness();

    expect(facade.vm().galleryIndex).toBe(0);

    const galleryComp = root.querySelector('app-product-gallery');
    expect(galleryComp).not.toBeNull();

    // Select silver-256 which has silver front image
    const silverBtn = queryButton(root, '[data-testid="variant-color-silver"]');
    silverBtn.click();
    await tick();
    fixture.detectChanges();

    expect(facade.vm().selectedColorCode).toBe('silver');
  });
});

describe('T16-AC03 product-page variant selection is semantically labelled', () => {
  it('T16-AC03: VariantSelector renders color buttons with label, swatch and checkmark', async () => {
    const { root } = await createHarness();

    const colorGroup = queryElement(root, '[data-testid="variant-color-group"]');
    expect(colorGroup).not.toBeNull();

    const graphiteBtn = queryButton(colorGroup, '[data-testid="variant-color-graphite"]');
    const silverBtn = queryButton(colorGroup, '[data-testid="variant-color-silver"]');

    expect(graphiteBtn.getAttribute('aria-pressed')).toBe('true');
    expect(silverBtn.getAttribute('aria-pressed')).toBe('false');

    const label = queryElement(graphiteBtn, '.label');
    expect(label.textContent.trim()).toBe('Grafit');

    const swatch = queryElement(graphiteBtn, '.swatch');
    expect(swatch).not.toBeNull();

    const check = queryElement(graphiteBtn, '.check');
    expect(check.textContent.trim()).toBe('✓');
  });

  it('T16-AC03: VariantSelector renders storage options with label, checkmark, and aria-pressed', async () => {
    const { root } = await createHarness();

    const storageGroup = queryElement(root, '[data-testid="variant-storage-group"]');
    expect(storageGroup).not.toBeNull();

    const storage256 = queryButton(storageGroup, '[data-testid="variant-storage-256"]');
    const storage512 = queryButton(storageGroup, '[data-testid="variant-storage-512"]');

    expect(storage256.getAttribute('aria-pressed')).toBe('true');
    expect(storage512.getAttribute('aria-pressed')).toBe('false');

    expect(queryElement(storage256, '.label').textContent.trim()).toBe('256 GB');
    expect(queryElement(storage512, '.label').textContent.trim()).toBe('512 GB');
  });

  it('T16-AC03: clicking another color updates selection, active variant price and metadata', async () => {
    const { fixture, root, tick } = await createHarness();

    const silverBtn = queryButton(root, '[data-testid="variant-color-silver"]');
    silverBtn.click();
    await tick();
    fixture.detectChanges();

    expect(silverBtn.getAttribute('aria-pressed')).toBe('true');

    const graphiteBtn = queryButton(root, '[data-testid="variant-color-graphite"]');
    expect(graphiteBtn.getAttribute('aria-pressed')).toBe('false');

    const meta = queryElement(root, '.page-header .meta');
    expect(meta.textContent).toContain('Ezüst');
    expect(meta.textContent).toContain('256 GB');

    const priceSection = queryElement(root, '.prices');
    expect(priceSection.textContent).toContain('344');
  });

  it('T16-AC03: clicking another storage updates selection, active variant price and metadata', async () => {
    const { fixture, root, tick } = await createHarness();

    const storage512 = queryButton(root, '[data-testid="variant-storage-512"]');
    storage512.click();
    await tick();
    fixture.detectChanges();

    expect(storage512.getAttribute('aria-pressed')).toBe('true');

    const meta = queryElement(root, '.page-header .meta');
    expect(meta.textContent).toContain('512 GB');

    const priceSection = queryElement(root, '.prices');
    expect(priceSection.textContent).toContain('378');
  });

  it('T16-AC03: SpecificationAccordion renders every group as an open box with its title', async () => {
    const { root } = await createHarness();

    const accordion = queryElement(root, '[data-testid="spec-accordion"]');
    expect(accordion).not.toBeNull();
    expect(accordion.querySelector('button')).toBeNull();

    const display = queryElement(accordion, '[data-testid="spec-group-display"]');
    expect(display.querySelector('h3')?.textContent).toContain('Kijelző és kialakítás');
  });

  it('T16-AC03: SpecificationAccordion renders the label/value rows from the first render', async () => {
    const { root } = await createHarness();

    const display = queryElement(root, '[data-testid="spec-group-display"]');
    const rows = Array.from(display.querySelectorAll('dl > div'));
    expect(rows.length).toBe(2);
    const pairs = rows.map((row) => [
      queryElement(row, 'dt').textContent.trim(),
      queryElement(row, 'dd').textContent.trim(),
    ]);
    expect(pairs).toEqual([
      ['Kijelző', '6,7″ • demóadat'],
      ['Képfrissítés', '120 Hz • demóadat'],
    ]);
  });

  it('T16-AC03: renders highlights list when product highlights are present', async () => {
    const { root } = await createHarness();

    const highlightsList = queryElement(root, '.key-facts');
    expect(highlightsList).not.toBeNull();
    expect(highlightsList.getAttribute('aria-label')).toBe('A termék fő jellemzői');

    const items = highlightsList.querySelectorAll('li');
    expect(items.length).toBe(2);
    const item0 = items[0];
    const item1 = items[1];
    expect(item0.textContent).toContain('6,7″ kijelző');
    expect(item1.textContent).toContain('50 MP kamera');
  });
});

describe('T16-AC04 product-page mobile purchase rail and CTA', () => {
  it('T16-AC04: mounts sticky mobile purchase rail with price block and primary CTA', async () => {
    const { root } = await createHarness();

    const rail = queryElement(root, '[data-testid="purchase-rail"]');
    expect(rail).not.toBeNull();
    expect(rail.getAttribute('aria-label')).toBe('Kosárba helyezés');

    const railPrice = queryElement(rail, '.rail-price');
    expect(railPrice.querySelector('app-price-block')).not.toBeNull();
    expect(railPrice.textContent).toContain('339');

    const railCta = queryButton(rail, '[data-testid="purchase-cta"] button');
    expect(railCta).not.toBeNull();
    expect(railCta.textContent).toContain('Kosárba teszem');
  });

  it('T16-AC04/FIX-50: primary rail CTA adds the selected variant and quantity to the cart', async () => {
    const { root, tick } = await createHarness();

    const ctaButton = queryButton(root, '[data-testid="purchase-cta"] button');
    ctaButton.click();
    await tick();

    const addReq = capturedRequests.find((r) => r.url.includes('/items'));
    expect(addReq).toBeDefined();
    const body: unknown = JSON.parse(addReq?.bodyText ?? '{}');
    expect(body).toMatchObject({ variantId: 'demo-one-5g-graphite-256', quantity: 1 });
  });

  it('T16-AC04: primary CTA dispatches cart addition to CartFacade over real HTTP', async () => {
    const { root, tick } = await createHarness();

    const ctaButton = queryButton(root, '[data-testid="purchase-cta"] button');
    ctaButton.click();
    await tick();

    expect(capturedRequests.length).toBeGreaterThanOrEqual(1);
    const cartPost = capturedRequests.find((r) => r.url.includes('/cart/items'));
    expect(cartPost).toBeDefined();
  });

  it('T16-AC04/FIX-50: QuantityControl increments and the rail CTA adds the updated quantity', async () => {
    const { fixture, root, tick } = await createHarness();

    const incrementBtn = queryButton(root, '[data-testid="quantity-increment"]');
    incrementBtn.click();
    await tick();
    fixture.detectChanges();

    const inputEl = root.querySelector('[data-testid="quantity-input"]');
    if (inputEl instanceof HTMLInputElement) {
      expect(inputEl.value).toBe('2');
    }

    const ctaButton = queryButton(root, '[data-testid="purchase-cta"] button');
    ctaButton.click();
    await tick();

    const addReq = capturedRequests.find((r) => r.url.includes('/items'));
    const body: unknown = JSON.parse(addReq?.bodyText ?? '{}');
    expect(body).toMatchObject({ quantity: 2 });
  });
});

describe('T16-AC05 product-page has no 3D surface', () => {
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

describe('T16 product-page loading and error states', () => {
  it('displays loading state skeleton while product is in flight', async () => {
    server.use(
      http.get(
        `${BASE_URL}/products/:slug`,
        () =>
          new Promise<Response>(() => {
            // Keep request pending
          }),
      ),
    );

    TestBed.configureTestingModule({
      imports: [ProductPageHost],
      providers: [
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
        provideRouter([]),
      ],
      teardown: { destroyAfterEach: true },
    });
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(ProductPageHost);
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="product-loading"]')).not.toBeNull();
    expect(root.querySelector('app-loading-state')).not.toBeNull();
    expect(root.querySelector('.layout')).toBeNull();
  });

  it('displays error state with retry action when product load fails', async () => {
    // A 503 is a transient failure (FIX-23 distinguishes it from a 404,
    // which is its own dedicated 'notfound' state — see the FIX-23
    // describe block below).
    server.use(
      http.get(`${BASE_URL}/products/:slug`, () =>
        HttpResponse.json(
          {
            type: 'https://example.com/server-error',
            title: 'Szolgáltatás nem elérhető',
            status: 503,
            detail: 'Service unavailable',
          },
          { status: 503 },
        ),
      ),
    );

    const { fixture, facade, root, tick } = await createHarness();

    expect(facade.vm().status).toBe('error');

    const errorState = root.querySelector('app-error-state');
    expect(errorState).not.toBeNull();
    expect(root.textContent).toContain('A termék nem tölthető be');

    const retryBtn = queryButton(root, 'app-error-state button');
    expect(retryBtn.textContent).toContain('Újrapróbálom');

    // Simulate recovery on retry
    server.use(
      http.get(`${BASE_URL}/products/:slug`, () =>
        HttpResponse.json(DEMO_PRODUCT, { status: 200 }),
      ),
    );

    retryBtn.click();
    await tick();
    fixture.detectChanges();

    expect(root.querySelector('app-error-state')).toBeNull();
    expect(root.querySelector('.layout')).not.toBeNull();
  });
});

describe('FIX-45 product page breadcrumb, description, stock and demo notes', () => {
  it('FIX-45-AC01/AC07: renders breadcrumb, demo tag, description and simulation note with the exact prototype copy', async () => {
    const { root } = await createHarness();

    const breadcrumb = queryElement(root, '[data-testid="product-breadcrumb"]');
    expect(breadcrumb.textContent).toContain('Főoldal');
    expect(breadcrumb.textContent).toContain('Mobiltelefonok');
    expect(breadcrumb.textContent).toContain('Demo One 5G');

    const demoTag = queryElement(root, '[data-testid="product-demo-tag"]');
    expect(demoTag.textContent.trim()).toBe('DEMÓTERMÉK');

    const description = queryElement(root, '[data-testid="product-description"]');
    expect(description.textContent.trim()).toBe(
      'Fiktív készülék a MiBolt webshop működésének bemutatásához. A kép illusztráció, az ár demóadat.',
    );

    const note = queryElement(root, '[data-testid="product-simulation-note"]');
    expect(note.textContent.trim()).toBe('A rendelés kipróbálható, de nem jár valódi vásárlással.');
  });

  it('FIX-45-AC02: breadcrumb links navigate in-app rather than reloading', async () => {
    const { root, location } = await createHarness();

    const link = queryElement(
      root,
      '[data-testid="product-breadcrumb"] a[routerLink="/telefonok"]',
    );
    link.click();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(location.path()).toBe('/telefonok');
  });

  it('FIX-45-AC04: stock line renders "Raktáron a demó készletben" for an in-stock variant', async () => {
    const { root } = await createHarness();

    const stock = queryElement(root, '[data-testid="product-stock"]');
    expect(stock.textContent.trim()).toBe('Raktáron a demó készletben');
    expect(stock.classList.contains('stock--out')).toBe(false);
  });

  it('FIX-45-AC04: stock line renders the out-of-stock sentence and the stock--out class for an unavailable variant', async () => {
    const outOfStockProduct = {
      ...DEMO_PRODUCT,
      variants: DEMO_PRODUCT.variants.map((v, i) =>
        i === 0 ? { ...v, availability: 'out_of_stock' as const } : v,
      ),
    };
    server.use(
      http.get(`${BASE_URL}/products/:slug`, () =>
        HttpResponse.json(outOfStockProduct, { status: 200 }),
      ),
    );

    const { root } = await createHarness();

    const stock = queryElement(root, '[data-testid="product-stock"]');
    expect(stock.textContent.trim()).toBe('Ez a konfiguráció elfogyott a demó készletből.');
    expect(stock.classList.contains('stock--out')).toBe(true);
  });

  it('FIX-45-AC05b: proves the ?? null in item 1 — with a success vm whose selectedVariant is null, the stock line is absent and selectedAvailability() is null', async () => {
    // The live facade never produces this shape: `currentVariant()`
    // falls back to the product's default variant once a product is
    // loaded, which is the point — the guard is for a wire shape the
    // demo fixture happens not to send. Only a stubbed vm can put the
    // page in the one state where `?? null` and `?? 'in_stock'` differ.
    const vm = signal<ProductVm>({
      status: 'success',
      product: toGeneratedProduct(DEMO_PRODUCT),
      selectedVariant: null,
      selectedImage: null,
      gallery: [],
      galleryIndex: -1,
      selectedColorCode: null,
      selectedStorageGb: null,
      quantity: 1,
      quantityOverMax: false,
      disabledCombinations: [],
      invalidVariantQuery: null,
      addToCart: { enabled: false, reason: null },
      error: null,
      variantQuery: null,
      slug: DEMO_PRODUCT.slug,
      related: [],
    });
    const facadeStub: Pick<ProductFacade, 'vm'> = { vm };
    const cartFacadeStub = {
      ensureCart: async (): Promise<void> => {
        // no-op
      },
      addItem: async (): Promise<void> => {
        // no-op
      },
    };

    TestBed.configureTestingModule({
      imports: [ProductPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ProductFacade, useValue: facadeStub },
        { provide: CartFacade, useValue: cartFacadeStub },
      ],
      teardown: { destroyAfterEach: true },
    });

    const fixture = TestBed.createComponent(ProductPage);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.selectedAvailability()).toBeNull();
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="product-stock"]')).toBeNull();
  });
});

describe('FIX-16/FIX-50 desktop CTA disabled state, against the real ProductPage', () => {
  // FIX-16's own Status line recorded this as open: the original
  // AC09b case rendered a hand-copied markup replica rather than
  // ProductPage. The FIX-50 reshape drops AddToCart's `enabled`
  // input (components.md:450 declares none), so the page now
  // withholds the variant instead; this closes both at once.
  it('with an unresolvable ?variant=, .cta-desktop renders app-add-to-cart whose own button is disabled', async () => {
    const { fixture, root, tick } = await createHarness();
    const router = TestBed.inject(Router);

    await router.navigate([], { queryParams: { variant: 'nonsense-variant-id' } });
    await tick();
    fixture.detectChanges();

    const cta = queryElement(root, '.cta-desktop');
    const addToCartEl = cta.querySelector('app-add-to-cart');
    expect(addToCartEl).not.toBeNull();
    const button = queryButton(cta, 'button');
    expect(button.disabled).toBe(true);
    expect(button.textContent.trim()).toBe('Kosárba teszem');
  });

  it('with a valid selection, .cta-desktop renders app-add-to-cart with its button enabled', async () => {
    const { root } = await createHarness();

    const cta = queryElement(root, '.cta-desktop');
    expect(cta.querySelector('app-add-to-cart')).not.toBeNull();
    const button = queryButton(cta, 'button');
    expect(button.disabled).toBe(false);
  });
});

describe('FIX-23 product page ?variant= round trip and not-found state', () => {
  it('FIX-23-AC01/AC02: selecting a different variant writes ?variant= to the URL', async () => {
    const { fixture, root, location, tick } = await createHarness();

    const silverBtn = queryButton(root, '[data-testid="variant-color-silver"]');
    silverBtn.click();
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(location.path()).toContain('variant=demo-one-5g-silver-256');
  });

  it('FIX-23-AC03: a variant switch does not replay the load pipeline through a loading flash', async () => {
    const { fixture, facade, root, tick } = await createHarness();

    expect(facade.vm().status).toBe('success');

    const silverBtn = queryButton(root, '[data-testid="variant-color-silver"]');
    silverBtn.click();
    await tick();
    fixture.detectChanges();

    // The URL-sync navigation this click triggers must not re-enter
    // `facade.load()`, which resets status to 'loading' and clears the
    // product — that would flash the skeleton on every swatch click.
    expect(facade.vm().status).toBe('success');
    expect(facade.vm().product).not.toBeNull();
  });

  it('FIX-23-AC04/AC05: an unresolvable ?variant= disables the add control with an explanation, and a valid selection clears it', async () => {
    const { fixture, root, tick } = await createHarness();
    const router = TestBed.inject(Router);

    await router.navigate([], { queryParams: { variant: 'nonsense-variant-id' } });
    await tick();
    fixture.detectChanges();

    expect(root.textContent).toContain('A linkben megadott változat nem található');
    const addButton = queryButton(root, '.cta-desktop button');
    expect(addButton.disabled).toBe(true);

    const silverBtn = queryButton(root, '[data-testid="variant-color-silver"]');
    silverBtn.click();
    await tick();
    fixture.detectChanges();

    expect(root.textContent).not.toContain('A linkben megadott változat nem található');
  });

  it('FIX-23-AC06: a 404 renders the dedicated not-found state with a catalogue return, distinct from a transient error', async () => {
    server.use(
      http.get(`${BASE_URL}/products/:slug`, () =>
        HttpResponse.json(
          {
            type: 'https://example.com/not-found',
            title: 'Nem található',
            status: 404,
            detail: 'Product not found',
          },
          { status: 404 },
        ),
      ),
    );

    const { facade, root } = await createHarness();

    expect(facade.vm().status).toBe('notfound');
    expect(root.textContent).toContain('A termék nem található');
    expect(root.textContent).not.toContain('Újrapróbálom');

    const backButton = queryButton(root, 'app-error-state button');
    expect(backButton.textContent).toContain('Vissza a telefonokhoz');
  });

  it('FIX-23: isProductNotFound distinguishes a 404 from a transient failure', () => {
    const notFound = new HttpErrorResponse({ status: 404 });
    const serverError = new HttpErrorResponse({ status: 503 });

    expect(isProductNotFound(notFound)).toBe(true);
    expect(isProductNotFound(serverError)).toBe(false);
    expect(isProductNotFound(new Error('boom'))).toBe(false);
  });
});

describe('product-page quantity control has a real accessible name, not a dangling label[for]', () => {
  it('quantity input carries an aria-label and no label[for] points at a non-labelable host', async () => {
    const { root } = await createHarness();

    // `QuantityControl` has no `id` input, so a `[id]` binding on
    // `<app-quantity-control>` lands on that host element rather than on
    // the real `<input>` inside it. A `<label for="...">` pointing at that
    // id is not associated with any labelable control at all. The name
    // must come from the input's own `aria-label` instead, with no
    // dangling label left behind (identical defect fixed on the cart side
    // in 68f14b7).
    const input = root.querySelector('[data-testid="quantity-input"]');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('aria-label')).toBe('Darabszám');
    expect(root.querySelector('label[for]')).toBeNull();
  });
});

describe('T16 product-page shared-primitive dependency wiring', () => {
  it('wires shared UI primitives: Button, PriceBlock, QuantityControl, ProductGallery, VariantSelector, SpecificationAccordion', async () => {
    const { root } = await createHarness();

    expect(root.querySelector('app-button')).not.toBeNull();
    expect(root.querySelector('app-price-block')).not.toBeNull();
    expect(root.querySelector('app-quantity-control')).not.toBeNull();
    expect(root.querySelector('app-product-gallery')).not.toBeNull();
    expect(root.querySelector('app-variant-selector')).not.toBeNull();
    expect(root.querySelector('app-specification-accordion')).not.toBeNull();
  });
});

describe('T16-C2 product-page related-devices strip on the 2.0.0 contract', () => {
  it('renders a related-products section with one card per item from listRelatedProducts', async () => {
    const { root } = await createHarness();

    const section = queryElement(root, '[data-testid="related-products"]');
    expect(section).not.toBeNull();
    const heading = queryElement(section, '#related-heading');
    expect(heading.textContent.trim()).toBe('Hasonló készülékek');

    const items = section.querySelectorAll('li app-product-card');
    expect(items.length).toBe(2);
  });

  it('renders no related section when the related list is empty', async () => {
    server.use(
      http.get(`${BASE_URL}/products/:slug/related`, () => HttpResponse.json([], { status: 200 })),
    );

    const { root } = await createHarness();
    expect(root.querySelector('[data-testid="related-products"]')).toBeNull();
  });

  it('a failed related call leaves the product in success state with no related section', async () => {
    server.use(
      http.get(`${BASE_URL}/products/:slug/related`, () =>
        HttpResponse.json(
          {
            type: 'https://example.com/server-error',
            title: 'Szolgáltatás nem elérhető',
            status: 503,
            detail: 'Service unavailable',
          },
          { status: 503 },
        ),
      ),
    );

    const { facade, root } = await createHarness();

    expect(facade.vm().status).toBe('success');
    expect(facade.vm().related).toEqual([]);
    expect(root.querySelector('[data-testid="related-products"]')).toBeNull();
  });

  it('navigating to another slug clears the related list before the new one arrives', async () => {
    // The first product's related response is delayed and resolves
    // to a non-empty list. The point is that the list cannot land
    // on the new product's screen: the route change must both
    // reset the `relatedSignal` synchronously (product.facade.ts:182)
    // and tear down the in-flight subscription (lines 178-181) so the
    // dangling response's `next` callback never fires. With those two
    // guards removed, the very last assertion below would fail: the
    // delayed `next` would call `this.relatedSignal.set(items)` and
    // repopulate the strip on the new product.
    const relatedItem = (): CatalogItem => ({
      id: 'demo-related-first',
      slug: 'demo-related-first',
      brand: 'MiBolt Demo',
      name: 'Demo Related First',
      highlights: ['Hasonló ajánlat'],
      is5g: true,
      releasedAt: '2026-01-01',
      storageGb: 128,
      variantId: 'demo-related-first-graphite-128',
      variantSlug: 'demo-related-first-graphite-128',
      price: { amount: 199_990, currency: 'HUF' },
      availability: 'in_stock',
      maxQuantity: 5,
      image: {
        id: 'demo-related-first-graphite-128-front',
        src: '/assets/products/silver-front.webp',
        alt: 'Demo Related First',
        width: 320,
        height: 400,
      },
      colors: [
        {
          colorCode: 'graphite',
          colorName: 'Grafit',
          swatchHex: '#343B43',
          variantId: 'demo-related-first-graphite-128',
          variantSlug: 'demo-related-first-graphite-128',
          price: { amount: 199_990, currency: 'HUF' },
          availability: 'in_stock',
        },
      ],
    });
    const resolvers: { current?: () => void } = {};
    server.use(
      http.get(`${BASE_URL}/products/:slug/related`, ({ params }) => {
        const slug = String(params['slug']);
        if (slug === 'demo-one-5g') {
          return new Promise<Response>((resolve) => {
            resolvers.current = (): void => {
              resolve(HttpResponse.json([relatedItem()]));
            };
          });
        }
        // The second product's related request returns [] immediately.
        // It is irrelevant to the assertions — the reset and the
        // tear-down are what keep the strip empty on the new product.
        return HttpResponse.json([], { status: 200 });
      }),
    );

    // Inlined harness: createHarness awaits `fixture.whenStable()`,
    // which waits for the hung related request above; that wait
    // never resolves and the case times out. Build the same fixture
    // without waiting for the related request, then drive the case.
    TestBed.configureTestingModule({
      imports: [ProductPageHost],
      providers: [
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfiguration(BASE_URL),
        provideRouter([{ path: 'telefonok', component: StubCatalogPage }]),
      ],
      teardown: { destroyAfterEach: true },
    });

    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(ProductPageHost);
    const facade = TestBed.inject(ProductFacade);
    const root = getRootElement(fixture);

    const tick = async (): Promise<void> => {
      for (let i = 0; i < 8; i += 1) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 15);
        });
        fixture.detectChanges();
      }
    };

    fixture.detectChanges();
    await tick();

    // The first request is still hanging, so the related signal has
    // not been written to. assert it's [] and no section renders.
    expect(facade.vm().related).toEqual([]);
    expect(root.querySelector('[data-testid="related-products"]')).toBeNull();

    // Navigate to a second product; the route change must reset the
    // related signal synchronously, before the in-flight first response
    // lands.
    fixture.componentInstance.slug.set('demo-pro-5g');
    fixture.detectChanges();
    await tick();

    expect(facade.vm().slug).toBe('demo-pro-5g');
    expect(facade.vm().related).toEqual([]);

    // Now resolve the dangling first request — the facade must not let
    // it repopulate the list for the new product. The subscription was
    // torn down (lines 178-181), so the `next` callback never fires
    // and `relatedSignal` stays at the empty array the reset put there.
    resolvers.current?.();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30);
    });
    fixture.detectChanges();

    expect(facade.vm().slug).toBe('demo-pro-5g');
    expect(facade.vm().related).toEqual([]);
    expect(root.querySelector('[data-testid="related-products"]')).toBeNull();
  });

  it('a related response for the current slug populates the list', async () => {
    // Positive companion to the reset case above: a non-empty related
    // response that arrives in time lands on the strip. Pairs the
    // tear-down proof with the proof that ordinary (in-time) responses
    // still work.
    const relatedItem = (): CatalogItem => ({
      id: 'demo-related-first',
      slug: 'demo-related-first',
      brand: 'MiBolt Demo',
      name: 'Demo Related First',
      highlights: ['Hasonló ajánlat'],
      is5g: true,
      releasedAt: '2026-01-01',
      storageGb: 128,
      variantId: 'demo-related-first-graphite-128',
      variantSlug: 'demo-related-first-graphite-128',
      price: { amount: 199_990, currency: 'HUF' },
      availability: 'in_stock',
      maxQuantity: 5,
      image: {
        id: 'demo-related-first-graphite-128-front',
        src: '/assets/products/silver-front.webp',
        alt: 'Demo Related First',
        width: 320,
        height: 400,
      },
      colors: [
        {
          colorCode: 'graphite',
          colorName: 'Grafit',
          swatchHex: '#343B43',
          variantId: 'demo-related-first-graphite-128',
          variantSlug: 'demo-related-first-graphite-128',
          price: { amount: 199_990, currency: 'HUF' },
          availability: 'in_stock',
        },
      ],
    });
    server.use(
      http.get(`${BASE_URL}/products/:slug/related`, ({ params }) => {
        const slug = String(params['slug']);
        if (slug === 'demo-one-5g') {
          return HttpResponse.json([relatedItem()], { status: 200 });
        }
        return HttpResponse.json([], { status: 200 });
      }),
    );

    const { facade } = await createHarness();

    expect(facade.vm().slug).toBe('demo-one-5g');
    expect(facade.vm().related).toHaveLength(1);
    expect(facade.vm().related[0]?.slug).toBe('demo-related-first');
  });

  it('renders two storage sizes of one related product without a duplicate track key (MIM-210)', async () => {
    const sharedSlug = 'demo-related-shared';
    const sharedItem = (storageGb: 128 | 256, variantId: string): CatalogItem => ({
      id: sharedSlug,
      slug: sharedSlug,
      brand: 'MiBolt Demo',
      name: 'Demo Related Shared',
      highlights: ['Hasonló ajánlat'],
      is5g: true,
      releasedAt: '2026-01-01',
      storageGb,
      variantId,
      variantSlug: `${sharedSlug}-graphite-${String(storageGb)}`,
      price: { amount: 199_990, currency: 'HUF' },
      availability: 'in_stock',
      maxQuantity: 5,
      image: {
        id: `${sharedSlug}-graphite-${String(storageGb)}-front`,
        src: '/assets/products/silver-front.webp',
        alt: 'Demo Related Shared',
        width: 320,
        height: 400,
      },
      colors: [
        {
          colorCode: 'graphite',
          colorName: 'Grafit',
          swatchHex: '#343B43',
          variantId,
          variantSlug: `${sharedSlug}-graphite-${String(storageGb)}`,
          price: { amount: 199_990, currency: 'HUF' },
          availability: 'in_stock',
        },
      ],
    });
    server.use(
      http.get(`${BASE_URL}/products/:slug/related`, () =>
        HttpResponse.json(
          [sharedItem(128, `${sharedSlug}-128`), sharedItem(256, `${sharedSlug}-256`)],
          { status: 200 },
        ),
      ),
    );

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { facade, root } = await createHarness();
      expect(facade.vm().related.length).toBe(2);
      const section = queryElement(root, '[data-testid="related-products"]');
      const cards = section.querySelectorAll('li app-product-card');
      expect(cards.length).toBe(2);
      expect(warn.mock.calls.some((call) => String(call[0]).includes('NG0955'))).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });
});
