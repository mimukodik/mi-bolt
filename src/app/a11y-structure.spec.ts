/**
 * FIX-29 — a cross-cutting regression spec for the five structural
 * accessibility facts this task's markup changes fix. It renders five
 * components from four features, so it does not belong inside any one
 * feature directory (mirrors `src/app/layouts/layouts.spec.ts`'s
 * cross-cutting placement at the app root).
 *
 * Not in `tests/`: FIX-06 landed and co-located every feature spec
 * under `src/`, leaving `tests/` holding only shared/contract fixtures;
 * a TestBed spec placed there would be collected by a runner
 * (`vitest.contract.config.ts`) that runs in a Node environment with no
 * Angular compiler. Run this file with `npm run test` (`ng test`), not
 * `npx vitest run <path>`.
 */

// @vitest-environment jsdom
import '@angular/compiler';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter, type Params } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server, useMswServer } from '../../tests/msw-server';
import { Api } from './api/generated/api';
import {
  ApiConfiguration as ApiConfig,
  provideApiConfiguration as provideApiConfig,
} from './api/generated/api-configuration';
import { demoSessionInterceptor } from './core/api/demo-session.interceptor';
import type { ProductPage as ProductPageDTO } from './api/generated/models/product-page';
import type { ProductSummary } from './api/generated/models/product-summary';
import type { Variant } from './api/generated/models/variant';
import type { Money } from './shared/ui/price-block/price-block';
import type { CheckoutOptions } from './api/generated/models/checkout-options';
import type { OrderReceipt } from './api/generated/models/order-receipt';

import { CatalogPage } from './features/catalog/catalog-page';
import { CatalogFacade } from './features/catalog/catalog.facade';
import { ProductCard } from './features/catalog/product-card';
import { ProductPage } from './features/product/product-page';
import { DeliveryStep } from './features/checkout/delivery-step';
import { PaymentMethodSelector } from './features/checkout/payment-method-selector';
import {
  buildCheckoutForm,
  createInitialCheckoutFormModel,
  type CheckoutFieldTree,
} from './features/checkout/checkout-form.model';
import { OrderReceiptComponent } from './features/checkout/order-receipt';

useMswServer();

const BASE_URL = 'http://localhost/api/v1';

function getRootElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
  return raw;
}

function money(amount: number): Money {
  return { amount, currency: 'HUF' };
}

// ---------------------------------------------------------------------------
// Fact 1: a rendered ProductPage contains no <main> element
// (landmark-main-is-top-level / landmark-no-duplicate-main / landmark-unique)
// ---------------------------------------------------------------------------

describe('FIX-29 fact 1 — ProductPage has no nested <main>', () => {
  @Component({
    imports: [ProductPage],
    template: `<app-product-page [slug]="slug()" />`,
  })
  class ProductPageHost {
    readonly slug = signal('demo-one-5g');
  }

  afterEach(() => {
    server.resetHandlers();
    TestBed.resetTestingModule();
  });

  it('renders no <main> anywhere inside the component (FIX-29-AC01)', () => {
    server.use(
      http.get(`${BASE_URL}/products/:slug`, () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:not-found',
            title: 'Nem található',
            status: 404,
            detail: 'not found',
          },
          { status: 404 },
        ),
      ),
    );
    TestBed.configureTestingModule({
      imports: [ProductPageHost],
      providers: [
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfig(BASE_URL),
        provideRouter([]),
      ],
      teardown: { destroyAfterEach: true },
    });
    const fixture = TestBed.createComponent(ProductPageHost);
    fixture.detectChanges();
    // The `.page` wrapper renders unconditionally at the template root,
    // outside the data-driven @switch, so no network settlement is
    // needed to observe the landmark fact this test asserts.
    const root = getRootElement(fixture);
    expect(root.querySelectorAll('main').length).toBe(0);
    expect(root.querySelector('[data-testid="product-page"]')?.tagName).toBe('DIV');
  });
});

// ---------------------------------------------------------------------------
// Fact 2: a rendered ProductCard's <img> has alt === '' and its wrapper has
// no role="img" (image-redundant-alt)
// ---------------------------------------------------------------------------

describe('FIX-29 fact 2 — ProductCard image is decorative', () => {
  function makeImage(id: string, source: string, alt: string): Variant['images'][number] {
    return { id, src: source, alt, width: 320, height: 400 };
  }

  function makeSummary(): ProductSummary {
    const variant: Variant = {
      id: 'p-01-256-graphite',
      colorCode: 'graphite',
      colorName: 'Grafit',
      swatchHex: '#343B43',
      storageGb: 256,
      price: money(339_990),
      availability: 'in_stock',
      maxQuantity: 5,
      images: [
        makeImage(
          'p-01-front',
          '/assets/products/graphite-front.webp',
          'Demo One 5G, Grafit, 256 GB',
        ),
      ],
    };
    return {
      id: 'p-01',
      slug: 'demo-one-5g',
      brand: 'MiBolt Demo',
      name: 'Demo One 5G',
      highlights: ['6,7" kijelző'],
      defaultVariant: variant,
      is5g: true,
      isDemo: true,
    };
  }

  @Component({
    imports: [ProductCard],
    template: `<app-product-card [product]="product()" />`,
  })
  class HostComponent {
    readonly product = signal<ProductSummary>(makeSummary());
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('gives the card image an empty alt and no img role (FIX-29-AC03)', () => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const img = root.querySelector<HTMLImageElement>('[data-testid="product-card-image"] img');
    expect(img?.getAttribute('alt')).toBe('');
    const wrapper = root.querySelector('[data-testid="product-card-image"] .root');
    expect(wrapper?.getAttribute('role')).toBeNull();
    // The visible name stays live text, unaffected by the decorative image:
    expect(root.querySelector('.name')?.textContent).toContain('Demo One 5G');
  });
});

// ---------------------------------------------------------------------------
// Fact 3: DeliveryStep and PaymentMethodSelector each render a <ul> whose
// role is 'list', and neither renders role="radiogroup" (listitem)
// ---------------------------------------------------------------------------

describe('FIX-29 fact 3 — delivery and payment option lists carry role=list', () => {
  const OPTIONS: CheckoutOptions = {
    deliveryOptions: [
      {
        id: 'home_delivery',
        label: 'Házhoz szállítás',
        fee: { amount: 1990, currency: 'HUF' },
        requiresAddress: true,
        description: 'Kiszállítás a megadott címre.',
      },
      {
        id: 'demo_pickup',
        label: 'Virtuális átvétel',
        fee: { amount: 0, currency: 'HUF' },
        requiresAddress: false,
        description: 'Demó átvételi mód, valós üzletcím nélkül.',
      },
    ],
    paymentMethods: ['demo_card', 'demo_cod'],
    termsVersion: 'demo-1',
  };

  function freshFields(): CheckoutFieldTree {
    return TestBed.runInInjectionContext(() =>
      buildCheckoutForm(signal(createInitialCheckoutFormModel())),
    );
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('DeliveryStep renders role=list, not role=radiogroup (FIX-29-AC04)', () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(DeliveryStep);
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('fields', freshFields());
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const list = root.querySelector('[data-testid="delivery-option"]')?.closest('ul');
    expect(list?.getAttribute('role')).toBe('list');
    expect(root.querySelector('[role="radiogroup"]')).toBeNull();
  });

  it('PaymentMethodSelector renders role=list, not role=radiogroup (FIX-29-AC04)', () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(PaymentMethodSelector);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const list = root.querySelector('[data-testid="payment-option"]')?.closest('ul');
    expect(list?.getAttribute('role')).toBe('list');
    expect(root.querySelector('[role="radiogroup"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fact 4: in a rendered OrderReceipt, every <dt> and <dd> has a <dl> ancestor
// (dlitem)
// ---------------------------------------------------------------------------

describe('FIX-29 fact 4 — OrderReceipt meta rows sit inside a <dl>', () => {
  const RECEIPT: OrderReceipt = {
    id: 'demo-order-123',
    orderNumber: 'DEMO-2026-0001',
    isSimulation: true,
    status: 'demo_confirmed',
    items: [
      {
        variantId: 'demo-one-5g-graphite-256',
        productName: 'Demo One 5G',
        colorName: 'Grafit',
        storageGb: 256,
        quantity: 1,
        unitPrice: money(339_990),
        lineTotal: money(339_990),
      },
    ],
    subtotal: money(339_990),
    shipping: money(0),
    total: money(339_990),
    paymentMethod: 'demo_cod',
    deliveryOptionId: 'demo_pickup',
    notice: 'Nem történt valódi fizetés, rendelésküldés vagy e-mail-küldés — ez egy demó folyamat.',
    createdAt: '2026-09-15T09:00:00.000Z',
  };

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('every dt/dd in the receipt meta block has a dl ancestor (FIX-29-AC05)', () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    const fixture = TestBed.createComponent(OrderReceiptComponent);
    fixture.componentRef.setInput('receipt', RECEIPT);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const meta = root.querySelector('[data-testid="receipt-meta"]');
    if (meta === null) throw new Error('Expected receipt-meta section');
    const pairs = [...meta.querySelectorAll('dt, dd')];
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.every((n) => n.closest('dl') !== null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fact 5: a rendered CatalogPage contains an h2 before its first h3 in
// document order, and its search input has a non-empty accessible name
// (heading-order / label)
// ---------------------------------------------------------------------------

describe('FIX-29 fact 5 — CatalogPage heading order and labelled search', () => {
  function isMediaQueryListEvent(event: Event): event is MediaQueryListEvent {
    return 'matches' in event && 'media' in event;
  }

  class StaticMediaQueryList extends EventTarget implements MediaQueryList {
    readonly matches: boolean = true;
    readonly media: string;
    onchange: ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null = null;
    private readonly legacyListeners = new Map<
      (this: MediaQueryList, event: MediaQueryListEvent) => unknown,
      EventListener
    >();

    constructor(query: string) {
      super();
      this.media = query;
    }

    addListener(
      callback: ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null,
    ): void {
      if (callback === null) return;
      const wrapped: EventListener = (event) => {
        if (isMediaQueryListEvent(event)) callback.call(this, event);
      };
      this.legacyListeners.set(callback, wrapped);
      this.addEventListener('change', wrapped);
    }

    removeListener(
      callback: ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null,
    ): void {
      if (callback === null) return;
      const wrapped = this.legacyListeners.get(callback);
      if (wrapped === undefined) return;
      this.removeEventListener('change', wrapped);
      this.legacyListeners.delete(callback);
    }
  }

  function installMatchMediaStub(): void {
    if (typeof globalThis.matchMedia === 'function') return;
    globalThis.matchMedia = (query: string): MediaQueryList => new StaticMediaQueryList(query);
  }

  beforeAll(() => {
    installMatchMediaStub();
  });

  afterEach(() => {
    server.resetHandlers();
    TestBed.resetTestingModule();
  });

  async function renderWithOneResult(): Promise<ComponentFixture<CatalogPage>> {
    const page: ProductPageDTO = {
      items: [
        {
          id: 'p-01',
          slug: 'demo-one-5g',
          brand: 'MiBolt Demo',
          name: 'Demo One 5G',
          highlights: ['6,7" kijelző'],
          defaultVariant: {
            id: 'p-01-256',
            colorCode: 'graphite',
            colorName: 'Grafit',
            swatchHex: '#343B43',
            storageGb: 256,
            price: money(339_990),
            availability: 'in_stock',
            maxQuantity: 5,
            images: [
              {
                id: 'p-01-front',
                src: '/assets/products/graphite-front.webp',
                alt: 'Demo One 5G front',
                width: 320,
                height: 400,
              },
            ],
          },
          is5g: true,
          isDemo: true,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 12,
      facets: {
        brands: [{ value: 'MiBolt Demo', label: 'MiBolt Demo', count: 1 }],
        storageGb: [{ value: '256', label: '256 GB', count: 1 }],
      },
    };

    server.use(http.get(`${BASE_URL}/products`, () => HttpResponse.json(page)));

    TestBed.configureTestingModule({
      imports: [CatalogPage],
      providers: [
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfig(BASE_URL),
        {
          provide: Api,
          useFactory: (config: ApiConfig, http: HttpClient) => new Api(config, http),
          deps: [ApiConfig, HttpClient],
        },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({} satisfies Params) },
            queryParamMap: new BehaviorSubject(
              convertToParamMap({} satisfies Params),
            ).asObservable(),
          },
        },
      ],
      teardown: { destroyAfterEach: true },
    });
    const facade = TestBed.inject(CatalogFacade);
    const fixture = TestBed.createComponent(CatalogPage);
    fixture.detectChanges();

    for (let index = 0; index < 20 && facade.vm().status !== 'success'; index += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      fixture.detectChanges();
    }
    return fixture;
  }

  it('renders an h2 before its first h3 in document order (FIX-29-AC02)', async () => {
    const fixture = await renderWithOneResult();
    const root = getRootElement(fixture);
    const headings = [...root.querySelectorAll('h1, h2, h3')];
    const firstH2Index = headings.findIndex((h) => h.tagName === 'H2');
    const firstH3Index = headings.findIndex((h) => h.tagName === 'H3');
    expect(firstH2Index).toBeGreaterThanOrEqual(0);
    expect(firstH3Index).toBeGreaterThan(firstH2Index);
  });

  it('gives the search input a non-empty accessible name (FIX-29-AC02)', async () => {
    const fixture = await renderWithOneResult();
    const root = getRootElement(fixture);
    const search = root.querySelector<HTMLInputElement>('[data-testid="filter-search-input"]');
    // FIX-43 removed the old hidden, unlabelled test-only search input
    // this task's document originally targeted; the catalogue's one
    // remaining search control lives in the filter sidebar and is
    // already wrapped in a <label> with a visually-hidden name.
    const label = search?.closest('label');
    expect(label?.textContent.trim().length ?? 0).toBeGreaterThan(0);
  });
});
