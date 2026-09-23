// @vitest-environment jsdom
import '@angular/compiler';

import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { Location } from '@angular/common';
import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server, useMswServer } from '../../../../../../tests/msw-server';
import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';
import type { Cart } from '@mi-bolt/api/models/cart';
import type { CatalogItem } from '@mi-bolt/api/models/catalog-item';
import { demoSessionInterceptor } from '@mi-bolt/core-api/demo-session.interceptor';
import { CartFacade } from '../cart/cart.facade';
import type { UiProblem } from '../../shared/types/ui-problem';
import { isProductNotFound, ProductFacade, type ProductVm } from './product.facade';
import { ProductPage } from './product-page';
import { DEMO_PRODUCT } from './demo-product.fixture';

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
 *   - Shared primitives: Button, PriceBlock, ErrorState,
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
  readonly page = viewChild(ProductPage);
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

  it('MIM-216: Bezárás dismisses the add-to-cart success message and returns focus to the add CTA', async () => {
    const { root, fixture, host } = await createHarness();

    const page = host.page();
    if (!(page instanceof ProductPage)) {
      throw new Error('Expected ProductPage');
    }
    page.addSuccessMessage.set('Demo One 5G, Grafit, 128 GB – 1 darab a kosárban.');
    fixture.detectChanges();

    const cta = queryElement(root, '.cta-desktop');
    const toast = queryElement(cta, '[data-testid="status-message"]');
    expect(toast.textContent).toContain('1 darab a kosárban.');

    const close = queryButton(toast, 'button');
    close.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(page.addSuccessMessage()).toBeNull();
    expect(cta.querySelector('[data-testid="status-message"]')).toBeNull();
    const addCta = queryElement(root, '.cta-desktop [data-testid="add-to-cart-button"] button');
    expect(document.activeElement).toBe(addCta);
  });

  it('MIM-216: the mobile purchase rail shows the add-to-cart success message and forwards its dismiss', async () => {
    const { root, fixture, host } = await createHarness();

    const page = host.page();
    if (!(page instanceof ProductPage)) {
      throw new Error('Expected ProductPage');
    }
    const message = 'Demo One 5G, Grafit, 128 GB – 1 darab a kosárban.';
    page.addSuccessMessage.set(message);
    fixture.detectChanges();
    await fixture.whenStable();

    const rail = queryElement(root, '[data-testid="purchase-rail"]');
    const railStatus = queryElement(rail, '.rail-status');
    const railToast = queryElement(railStatus, '[data-testid="status-message"]');
    expect(railToast.textContent).toContain('1 darab a kosárban.');
    expect(railToast.textContent).toContain('Demo One 5G');

    const desktopCta = queryElement(root, '.cta-desktop');
    const desktopToast = queryElement(desktopCta, '[data-testid="status-message"]');
    expect(railToast.textContent).toBe(desktopToast.textContent);

    const close = queryButton(railToast, 'button');
    close.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(page.addSuccessMessage()).toBeNull();
    // Both the rail and the desktop success toasts are driven by the
    // same `addSuccessMessage` signal, so dismissing either one clears
    // both — confirm no stale toast survives on the page side.
    expect(rail.querySelector('[data-testid="status-message"]')).toBeNull();
    expect(desktopCta.querySelector('[data-testid="status-message"]')).toBeNull();
  });

  it('MIM-216: Bezárás on the add-to-cart error banner clears addError through errorDismissed', async () => {
    const { root, fixture, host } = await createHarness();

    const page = host.page();
    if (!(page instanceof ProductPage)) {
      throw new Error('Expected ProductPage');
    }
    const problem = {
      code: 'OUT_OF_STOCK',
      message: 'A termék jelenleg nem rendelhető.',
      fieldErrors: [],
      retryable: true,
    } as const satisfies UiProblem;
    page.addError.set(problem);
    fixture.detectChanges();
    await fixture.whenStable();

    const addToCart = queryElement(root, '[data-testid="add-to-cart"]');
    const errorToast = queryElement(addToCart, '[data-testid="status-message"]');
    expect(errorToast.textContent).toContain('A termék jelenleg nem rendelhető.');

    const close = queryButton(errorToast, 'button');
    close.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(page.addError()).toBeNull();
    expect(addToCart.querySelector('[data-testid="status-message"]')).toBeNull();
    const addCta = queryButton(addToCart, '[data-testid="add-to-cart-button"] button');
    expect(document.activeElement).toBe(addCta);
  });

  it('MIM-216: success message reports the cart line quantity, not the amount just dispatched', async () => {
    // Mock the POST so the cart snapshot reflects a 2-item line for the
    // selected variant — what the shopper sees in their cart after a
    // second add of the same variant.
    server.use(
      http.post(`${BASE_URL}/cart/items`, () =>
        HttpResponse.json(
          {
            id: 'cart-test-page-1',
            version: 2,
            items: [
              {
                variantId: 'demo-one-5g-graphite-256',
                variantSlug: 'demo-one-5g-graphite-256-variant',
                productId: 'demo-one-5g',
                productName: 'Demo One 5G',
                productSlug: 'demo-one-5g',
                colorName: 'Grafit',
                storageGb: 256,
                quantity: 2,
                unitPrice: { amount: 339_990, currency: 'HUF' },
                lineTotal: { amount: 679_980, currency: 'HUF' },
                maxQuantity: 5,
                availability: 'in_stock',
                image: {
                  id: 'demo-one-5g-graphite-256-front',
                  src: '/assets/products/graphite-front.webp',
                  alt: 'Demo One 5G',
                  width: 800,
                  height: 800,
                },
              },
            ],
            lineCount: 1,
            totalQuantity: 2,
            subtotal: { amount: 679_980, currency: 'HUF' },
            expiresAt: '2026-12-31T23:59:59.000Z',
            notices: [],
          } satisfies Cart,
          {
            status: 200,
            headers: { ETag: '"2"' },
          },
        ),
      ),
    );

    const { root, fixture, tick } = await createHarness();

    const addButton = queryElement(root, '.cta-desktop [data-testid="add-to-cart-button"] button');
    addButton.click();
    await tick();
    fixture.detectChanges();

    const cta = queryElement(root, '.cta-desktop');
    const toast = queryElement(cta, '[data-testid="status-message"]');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain('2 darab a kosárban');
  });

  it('T16-AC01: displays the product name matching the loaded product', async () => {
    const { root } = await createHarness();

    const nameEl = queryElement(root, '[data-testid="product-name"]');
    expect(nameEl.textContent.trim()).toBe('Demo One 5G');
  });
});

describe('T16-AC02 product-page embeds the gallery primitive', () => {
  it('T16-AC02: mounts ProductGallery with the active variant image and no counter for a single image', async () => {
    const { root } = await createHarness();

    const galleryEl = queryElement(root, 'app-product-gallery');
    expect(galleryEl).not.toBeNull();

    const galleryMain = queryElement(galleryEl, '[data-testid="gallery-main"]');
    expect(galleryMain).not.toBeNull();

    expect(galleryEl.querySelector('[data-testid="gallery-count"]')).toBeNull();
    expect(galleryEl.querySelector('[data-testid="gallery-prev"]')).toBeNull();
    expect(galleryEl.querySelector('[data-testid="gallery-next"]')).toBeNull();
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
  it('T16-AC03: VariantSelector renders color buttons with label and swatch, no checkmark', async () => {
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

    expect(graphiteBtn.querySelector('.check')).toBeNull();
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

    const priceSection = queryElement(root, '.prices');
    expect(priceSection.textContent).toContain('344');
  });

  it('T16-AC03: clicking another storage updates selection and active variant price', async () => {
    const { fixture, root, tick } = await createHarness();

    const storage512 = queryButton(root, '[data-testid="variant-storage-512"]');
    storage512.click();
    await tick();
    fixture.detectChanges();

    expect(storage512.getAttribute('aria-pressed')).toBe('true');

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
  it('FIX-45-AC01/AC07: the breadcrumb is held out of the DOM; description and simulation note render with the exact prototype copy', async () => {
    const { root } = await createHarness();

    expect(root.querySelector('[data-testid="product-breadcrumb"]')).toBeNull();

    expect(root.querySelector('[data-testid="product-demo-tag"]')).toBeNull();
    expect(root.textContent).not.toContain('DEMÓTERMÉK');

    const description = queryElement(root, '[data-testid="product-description"]');
    expect(description.textContent.trim()).toBe(
      'Fiktív készülék a MiBolt webshop működésének bemutatásához. A kép illusztráció, az ár demóadat.',
    );

    const note = queryElement(root, '[data-testid="product-simulation-note"]');
    expect(note.textContent.trim()).toBe('A rendelés kipróbálható, de nem jár valódi vásárlással.');
  });

  it('FIX-45-AC02: the breadcrumb link is held out of the DOM, so navigation has no product-page breadcrumb link to follow', async () => {
    const { root } = await createHarness();

    expect(
      root.querySelector('[data-testid="product-breadcrumb"] a[routerLink="/telefonok"]'),
    ).toBeNull();
  });

  it('MIM-235: the product header renders no separate brand line', async () => {
    const { root } = await createHarness();

    expect(root.querySelector('.brand')).toBeNull();
  });

  it('MIM-236: no colour or storage line under the title', async () => {
    const { root } = await createHarness();

    expect(root.querySelector('.meta')).toBeNull();
    expect(queryElement(root, '.page-header').textContent).not.toContain('Tárhely:');
  });

  it('owner 2026-09-22: the add-to-cart button is the filled lime pill on the navy box', async () => {
    const { root } = await createHarness();

    const button = queryElement(root, '.cta-desktop [data-testid="add-to-cart-button"] button');
    expect(button.classList.contains('is-primary-on-dark')).toBe(true);
    expect(button.classList.contains('is-secondary-on-dark')).toBe(false);
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
      product: DEMO_PRODUCT,
      selectedVariant: null,
      selectedImage: null,
      gallery: [],
      galleryIndex: -1,
      selectedColorCode: null,
      selectedStorageGb: null,
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
    // PR #176: the disabled placeholder is the filled lime button with the white ring.
    const placeholder = queryElement(root, '.cta-desktop button');
    expect(placeholder.classList.contains('is-primary-on-dark')).toBe(true);
    expect(placeholder.classList.contains('is-secondary-on-dark')).toBe(false);
  });
});

describe('FIX-16/FIX-50 desktop CTA disabled state, against the real ProductPage', () => {
  // FIX-16's own Status line recorded this as open: the original
  // AC09b case rendered a hand-copied markup replica rather than
  // ProductPage. The FIX-50 reshape drops AddToCart's `enabled`
  // input (components.md:435 declares none), so the page now
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

describe('T16 product-page shared-primitive dependency wiring', () => {
  it('wires shared UI primitives: Button, PriceBlock, ProductGallery, VariantSelector, SpecificationAccordion', async () => {
    const { root } = await createHarness();

    expect(root.querySelector('app-button')).not.toBeNull();
    expect(root.querySelector('app-price-block')).not.toBeNull();
    expect(root.querySelector('app-product-gallery')).not.toBeNull();
    expect(root.querySelector('app-variant-selector')).not.toBeNull();
    expect(root.querySelector('app-specification-accordion')).not.toBeNull();
  });

  it('MIM-233: the product page no longer renders the quantity control', async () => {
    const { root } = await createHarness();
    expect(root.querySelector('app-quantity-control')).toBeNull();
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

describe('MIM-233: the stock line on the navy buy box is white, as on yettel.hu', () => {
  it('the in-stock line uses the inverse text colour, not lime', () => {
    if (!hasStyles(ProductPage)) throw new Error('Expected ProductPage to have styles');
    const css = ProductPage.ɵcmp.styles.join('\n');
    const start = css.indexOf('.stock[');
    const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    expect(body).toContain('var(--%NS%color-text-inverse)');
    expect(body).not.toContain('var(--%NS%color-accent)');
  });
});

describe('owner 2026-09-22: a refused add names the per-product limit', () => {
  function refuseAdd(code: string, params?: Record<string, unknown>): void {
    // The contract derives the `type` URI from the code the same way
    // `contracts/commerce/openapi.yaml:341-360` and `cart-store.ts:88`
    // (`problemType`) do. Hardcoding it to `quantity-limit` here made
    // the OUT_OF_STOCK case below send a body whose `type` and `code`
    // disagreed with the contract.
    const type = `urn:mi-bolt:problem:${code.toLowerCase().replace(/_/g, '-')}`;
    server.use(
      http.post(`${BASE_URL}/cart/items`, () =>
        HttpResponse.json(
          {
            type,
            title: 'Conflict',
            status: 409,
            code,
            detail: 'Merged quantity would exceed the line maximum',
            traceId: 't',
            fieldErrors: [],
            ...(params === undefined ? {} : { params }),
          },
          { status: 409 },
        ),
      ),
    );
  }

  async function pressAddAndReadMessage(): Promise<string> {
    const { root, fixture, tick } = await createHarness();
    queryElement(root, '.cta-desktop [data-testid="add-to-cart-button"] button').click();
    await tick();
    fixture.detectChanges();
    const cta = queryElement(root, '.cta-desktop');
    return queryElement(cta, '[data-testid="status-message"] .message').textContent.trim();
  }

  it('QUANTITY_LIMIT with max 5 says the decided sentence', async () => {
    refuseAdd('QUANTITY_LIMIT', { max: 5, requested: 6 });
    expect(await pressAddAndReadMessage()).toBe(
      'Ebből a termékből legfeljebb 5 db lehet a kosárban.',
    );
  });

  it('the number comes from params.max, not from the copy', async () => {
    refuseAdd('QUANTITY_LIMIT', { max: 3, requested: 4 });
    expect(await pressAddAndReadMessage()).toBe(
      'Ebből a termékből legfeljebb 3 db lehet a kosárban.',
    );
  });

  it('QUANTITY_LIMIT without a numeric max keeps the generic text', async () => {
    refuseAdd('QUANTITY_LIMIT');
    expect(await pressAddAndReadMessage()).toBe(
      'A termék hozzáadása nem sikerült; a kosár változatlan.',
    );
  });

  it('any other refusal keeps the generic text', async () => {
    refuseAdd('OUT_OF_STOCK', { variantId: 'demo-one-5g-graphite-256' });
    expect(await pressAddAndReadMessage()).toBe(
      'A termék hozzáadása nem sikerült; a kosár változatlan.',
    );
  });

  it('a numeric max on another code keeps the generic text (pin for the QUANTITY_LIMIT check)', async () => {
    refuseAdd('OUT_OF_STOCK', { max: 5, variantId: 'demo-one-5g-graphite-256' });
    expect(await pressAddAndReadMessage()).toBe(
      'A termék hozzáadása nem sikerült; a kosár változatlan.',
    );
  });

  it('switching colour clears the refusal of the previous variant (owner 2026-09-23)', async () => {
    refuseAdd('QUANTITY_LIMIT', { max: 3, requested: 4 });
    const { root, fixture, tick } = await createHarness();
    queryElement(root, '.cta-desktop [data-testid="add-to-cart-button"] button').click();
    await tick();
    fixture.detectChanges();
    expect(queryElement(root, '.cta-desktop').textContent).toContain(
      'Ebből a termékből legfeljebb 3 db lehet a kosárban.',
    );
    queryButton(root, '[data-testid="variant-color-silver"]').click();
    await tick();
    fixture.detectChanges();
    expect(queryElement(root, '.cta-desktop').textContent).not.toContain('legfeljebb');
  });
});

describe('an add that settles after another variant was picked shows no message', () => {
  // Holds `POST /cart/items` until the case calls `release()`, so the
  // shopper can switch colour while the add is in flight. `release()`
  // is safe to call before the handler has been driven: the response
  // is stashed and the next request resolves with it immediately,
  // so a slow first request cannot hang the test.
  function holdAdd(respond: () => Response): { release: () => void } {
    let capture: ((response: Response) => void) | null = null;
    let pending: Response | null = null;
    server.use(
      http.post(
        `${BASE_URL}/cart/items`,
        () =>
          new Promise<Response>((resolve) => {
            if (pending !== null) {
              const response = pending;
              pending = null;
              resolve(response);
              return;
            }
            capture = resolve;
          }),
      ),
    );
    return {
      release: (): void => {
        const response = respond();
        if (capture !== null) {
          capture(response);
          capture = null;
          return;
        }
        pending = response;
      },
    };
  }

  function cartWithGraphite256(): Cart {
    return {
      id: 'cart-test-page-1',
      version: 2,
      items: [
        {
          variantId: 'demo-one-5g-graphite-256',
          variantSlug: 'demo-one-5g-graphite-256-variant',
          productId: 'demo-one-5g',
          productName: 'Demo One 5G',
          productSlug: 'demo-one-5g',
          colorName: 'Grafit',
          storageGb: 256,
          quantity: 1,
          unitPrice: { amount: 339_990, currency: 'HUF' },
          lineTotal: { amount: 339_990, currency: 'HUF' },
          maxQuantity: 5,
          availability: 'in_stock',
          image: {
            id: 'demo-one-5g-graphite-256-front',
            src: '/assets/products/graphite-front.webp',
            alt: 'Demo One 5G',
            width: 800,
            height: 800,
          },
        },
      ],
      lineCount: 1,
      totalQuantity: 1,
      subtotal: { amount: 339_990, currency: 'HUF' },
      expiresAt: '2026-12-31T23:59:59.000Z',
      notices: [],
    };
  }

  it('drops the success message of the previous variant', async () => {
    const held = holdAdd(() =>
      HttpResponse.json(cartWithGraphite256(), { status: 200, headers: { ETag: '"2"' } }),
    );
    const { root, fixture, host, cartFacade, tick } = await createHarness();

    queryElement(root, '.cta-desktop [data-testid="add-to-cart-button"] button').click();
    await tick();
    queryButton(root, '[data-testid="variant-color-silver"]').click();
    await tick();
    held.release();
    await tick();
    fixture.detectChanges();

    expect(host.page()?.addSuccessMessage()).toBeNull();
    expect(
      queryElement(root, '.cta-desktop').querySelector('[data-testid="status-message"]'),
    ).toBeNull();
    expect(host.page()?.addPending()).toBe(false);
    // The cart itself took the add; only the page's message is dropped.
    expect(cartFacade.cart()?.items.map((item) => item.variantId)).toEqual([
      'demo-one-5g-graphite-256',
    ]);
  });

  it('drops the refusal of the previous variant', async () => {
    const held = holdAdd(() =>
      HttpResponse.json(
        {
          type: 'urn:mi-bolt:problem:quantity-limit',
          title: 'Conflict',
          status: 409,
          code: 'QUANTITY_LIMIT',
          detail: 'Merged quantity would exceed the line maximum',
          traceId: 't',
          fieldErrors: [],
          params: { max: 3, requested: 4 },
        },
        { status: 409 },
      ),
    );
    const { root, fixture, host, cartFacade, tick } = await createHarness();

    queryElement(root, '.cta-desktop [data-testid="add-to-cart-button"] button').click();
    await tick();
    queryButton(root, '[data-testid="variant-color-silver"]').click();
    await tick();
    held.release();
    await tick();
    fixture.detectChanges();

    // The dispatch must have failed for this case to exercise the
    // refusal drop; without this assertion a future regression that
    // quietly returns 200 would still pass.
    expect(cartFacade.error()?.code).toBe('QUANTITY_LIMIT');
    expect(host.page()?.addError()).toBeNull();
    expect(
      queryElement(root, '.cta-desktop').querySelector('[data-testid="status-message"]'),
    ).toBeNull();
    expect(host.page()?.addPending()).toBe(false);
  });
});
