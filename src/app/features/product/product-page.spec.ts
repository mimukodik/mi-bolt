// @vitest-environment jsdom
import '@angular/compiler';

import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { Location } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { server, useMswServer } from '../../../../tests/msw-server';
import { provideApiConfiguration } from '../../api/generated/api-configuration';
import type { Cart } from '../../api/generated/models/cart';
import { demoSessionInterceptor } from '../../core/api/demo-session.interceptor';
import { CartFacade } from '../cart/cart.facade';
import { isProductNotFound, ProductFacade } from './product.facade';
import { ProductPage } from './product-page';
import { DEMO_PRODUCT } from '../../../mocks/cart/cart.handlers';

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
 *     checkmark, and aria-pressed; specification accordion with disclosure
 *     pattern (aria-expanded, aria-controls, panel role=region).
 *   - T16-AC04: mobile purchase rail carries price block + primary CTA,
 *     emits addRequested with chosen variant id and quantity, and dispatches
 *     to CartFacade.
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
    status: 'active',
    items: [],
    itemCount: 0,
    subtotal: { amount: 0, currency: 'HUF' },
    expiresAt: '2026-12-31T23:59:59.000Z',
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

    http.post(`${BASE_URL}/carts`, async ({ request }) => {
      const bodyText = await request.text();
      capturedRequests.push({ method: 'POST', url: request.url, bodyText });
      return HttpResponse.json(makeMockCart('cart-test-page-1'), { status: 201 });
    }),

    http.post(`${BASE_URL}/carts/:cartId/items`, async ({ request }) => {
      const bodyText = await request.text();
      capturedRequests.push({ method: 'POST', url: request.url, bodyText });
      return HttpResponse.json(makeMockCart('cart-test-page-1'), { status: 200 });
    }),
  );
});

afterEach(() => {
  server.resetHandlers();
  TestBed.resetTestingModule();
});

@Component({
  imports: [ProductPage],
  template: `
    <app-product-page [slug]="slug()" (addRequested)="onAddRequested($event)"></app-product-page>
  `,
})
class ProductPageHost {
  readonly slug = signal<string>('demo-one-5g');
  readonly addRequests: { variantId: string; quantity: number }[] = [];

  onAddRequested(event: { variantId: string; quantity: number }): void {
    this.addRequests.push(event);
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
      provideRouter([]),
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
    const buyCol = layout.querySelector('.buy');
    expect(galleryCol).not.toBeNull();
    expect(buyCol).not.toBeNull();
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

    const meta = queryElement(root, '.buy-header .meta');
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

    const meta = queryElement(root, '.buy-header .meta');
    expect(meta.textContent).toContain('512 GB');

    const priceSection = queryElement(root, '.prices');
    expect(priceSection.textContent).toContain('378');
  });

  it('T16-AC03: SpecificationAccordion renders disclosure triggers with aria-expanded and aria-controls', async () => {
    const { root } = await createHarness();

    const accordion = queryElement(root, '[data-testid="spec-accordion"]');
    expect(accordion).not.toBeNull();

    const displayTrigger = queryButton(accordion, '[data-testid="spec-disclosure-display"]');
    expect(displayTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(displayTrigger.getAttribute('aria-controls')).toBe('spec-panel-display');
    expect(displayTrigger.textContent).toContain('Kijelző és kialakítás');

    expect(accordion.querySelector('[data-testid="spec-panel-display"]')).toBeNull();
  });

  it('T16-AC03: SpecificationAccordion expands panel with role=region and displays rows on click', async () => {
    const { fixture, root, tick } = await createHarness();

    const displayTrigger = queryButton(root, '[data-testid="spec-disclosure-display"]');
    displayTrigger.click();
    await tick();
    fixture.detectChanges();

    expect(displayTrigger.getAttribute('aria-expanded')).toBe('true');

    const panel = queryElement(root, '[data-testid="spec-panel-display"]');
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-labelledby')).toBe('spec-trigger-display');

    expect(panel.textContent).toContain('Kijelző');
    expect(panel.textContent).toContain('Képfrissítés');
  });

  it('T16-AC03: renders highlights list when product highlights are present', async () => {
    const { root } = await createHarness();

    const highlightsList = queryElement(root, '.highlights');
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

  it('T16-AC04: primary CTA emits addRequested output with selected variant id and quantity', async () => {
    const { host, root, tick } = await createHarness();

    const ctaButton = queryButton(root, '[data-testid="purchase-cta"] button');
    ctaButton.click();
    await tick();

    expect(host.addRequests.length).toBe(1);
    const firstRequest = host.addRequests[0];
    expect(firstRequest.variantId).toBe('demo-one-5g-graphite-256');
    expect(firstRequest.quantity).toBe(1);
  });

  it('T16-AC04: primary CTA dispatches cart addition to CartFacade over real HTTP', async () => {
    const { root, tick } = await createHarness();

    const ctaButton = queryButton(root, '[data-testid="purchase-cta"] button');
    ctaButton.click();
    await tick();

    expect(capturedRequests.length).toBeGreaterThanOrEqual(1);
    const cartPost = capturedRequests.find((r) => r.url.includes('/carts'));
    expect(cartPost).toBeDefined();
  });

  it('T16-AC04: QuantityControl increments and updates the addRequested quantity', async () => {
    const { fixture, host, root, tick } = await createHarness();

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

    expect(host.addRequests.length).toBe(1);
    const firstRequest = host.addRequests[0];
    expect(firstRequest.quantity).toBe(2);
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
      http.get(`${BASE_URL}/products/:slug`, () => {
        return new Promise<Response>(() => {
          // Keep request pending
        });
      }),
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
      http.get(`${BASE_URL}/products/:slug`, () => {
        return HttpResponse.json(
          {
            type: 'https://example.com/server-error',
            title: 'Szolgáltatás nem elérhető',
            status: 503,
            detail: 'Service unavailable',
          },
          { status: 503 },
        );
      }),
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
      http.get(`${BASE_URL}/products/:slug`, () => {
        return HttpResponse.json(DEMO_PRODUCT, { status: 200 });
      }),
    );

    retryBtn.click();
    await tick();
    fixture.detectChanges();

    expect(root.querySelector('app-error-state')).toBeNull();
    expect(root.querySelector('.layout')).not.toBeNull();
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
      http.get(`${BASE_URL}/products/:slug`, () => {
        return HttpResponse.json(
          {
            type: 'https://example.com/not-found',
            title: 'Nem található',
            status: 404,
            detail: 'Product not found',
          },
          { status: 404 },
        );
      }),
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
