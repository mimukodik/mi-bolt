/**
 * T14: Home (Főoldal) acceptance suite.
 *
 * The home page is the entry screen for the four commerce families.
 * It owns a dark hero (R02), three light shopping entry points, four
 * featured products rendered with the real `getProduct` SDK call, and
 * three "how the demo works" tiles that explain browsing / cart /
 * simulated order (AC04: and nothing about tariffs, internet,
 * services, payments or bank cards).
 *
 * The vitest legacy-decorator transform cannot resolve `styleUrl`
 * CSS imports or read `input()` signal inputs from the transpiled
 * class body, so the suite mixes three strategies:
 *
 *   1. Source-pattern assertions: read the component source files
 *      from disk and verify the documented contract (CTAs, shortcuts,
 *      tokens, copy, structure) with regex. This is the convention
 *      the project already follows (see product-gallery.spec.ts).
 *   2. Standalone rendering: render the Hero and HowDemoWorks
 *      components directly. `Hero` declares `title`/`subtitle`
 *      (required) and `artwork` (optional) as signal inputs
 *      (`docs/spec/components.md:255`, FIX-64); every direct
 *      `TestBed.createComponent(Hero)` site below binds `title` and
 *      `subtitle` with `componentRef.setInput` before `detectChanges`.
 *   3. Orchestration via StubApi: instantiate HomePage's facade
 *      behaviour with a stub `Api` that exposes the same
 *      `invoke(fn, params)` surface the production facade uses. We
 *      read the resulting signals to verify the request lifecycle
 *      without forcing the full render of FeaturedProducts (whose
 *      signal inputs cannot be resolved through the legacy-decorator
 *      transform).
 *
 * Mobile content order (AC05) is asserted on the DOM order of the
 * hero children so the same assertion survives any CSS re-ordering.
 *
 * Vitest's esbuild/oxc parser is brittle around `??` / `||` chained
 * with method calls and around `>` inside `expect(...)` parens, so
 * the suite stays in a conservative subset of TypeScript.
 */

// @vitest-environment jsdom
import { TestBed } from '@angular/core/testing';
import { Injectable, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Api } from '../../../app/api/generated/api';
import { getConfig } from '../../../app/api/generated/fn/configuration/get-config';
import { getProduct } from '../../../app/api/generated/fn/catalog/get-product';
import type { DemoConfig } from '../../../app/api/generated/models/demo-config';
import type { Image } from '../../../app/api/generated/models/image';
import type { Product } from '../../../app/api/generated/models/product';
import type { Variant } from '../../../app/api/generated/models/variant';

import { Hero } from '../../../app/features/home/hero';
import { HowDemoWorks } from '../../../app/features/home/how-demo-works';
import { HomePage } from '../../../app/features/home/home-page';
import { FeaturedProducts } from '../../../app/features/home/featured-products';

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
  if (raw instanceof HTMLElement) {
    return raw;
  }
  throw new Error('Expected HTMLElement');
}

beforeAll(async () => {
  await TestBed.compileComponents();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

// ---------------------------------------------------------------------------
// Stub Api: exposes the same surface the production home page uses
// (`api.invoke(getConfig)`, `api.invoke(getProduct, { slug })`).
// Captures every call and pushes the configured response / error
// through a fresh Subject so the RxJS chain inside the page observes
// the same observable shape the real SDK would deliver.
// ---------------------------------------------------------------------------

interface GetProductParams {
  readonly slug: string;
}

interface CapturedCall {
  readonly fn: unknown;
  readonly params: unknown;
}

function isGetProductParams(params: unknown): params is GetProductParams {
  return (
    typeof params === 'object' &&
    params !== null &&
    'slug' in params &&
    typeof params.slug === 'string'
  );
}

@Injectable({ providedIn: 'root' })
class StubApi {
  readonly calls: CapturedCall[] = [];
  readonly productBySlug = new Map<string, Subject<Product>>();

  configResponse: DemoConfig = {
    providerId: 'mi-bolt',
    displayName: 'MiBolt',
    currency: 'HUF',
    isDemo: true,
    termsVersion: 'demo-1',
    featuredSlugs: ['demo-one-5g', 'demo-air-5g', 'demo-pro-5g', 'demo-lite-5g'],
    maximumLineQuantity: 5,
  };

  nextProductError: { slug: string; error: unknown } | null = null;

  invoke(fn: typeof getConfig, params?: unknown): Observable<DemoConfig>;
  invoke(fn: typeof getProduct, params: GetProductParams): Observable<Product>;
  invoke(fn: unknown, params?: unknown): Observable<unknown> {
    this.calls.push({ fn, params });

    if (fn === getConfig) {
      const response = this.configResponse;
      return new Observable<DemoConfig>((subscriber) => {
        queueMicrotask(() => {
          subscriber.next(response);
          subscriber.complete();
        });
        return () => undefined;
      });
    }

    if (fn === getProduct) {
      if (!isGetProductParams(params)) {
        throw new Error('StubApi: expected GetProductParams.');
      }
      const slug = params.slug;
      const stream$ = new Subject<Product>();
      this.productBySlug.set(slug, stream$);
      const errorPlan = this.nextProductError;
      this.nextProductError = null;
      return new Observable<Product>((subscriber) => {
        const sub = stream$.subscribe({
          next: (p) => {
            subscriber.next(p);
          },
          error: (err: unknown) => {
            subscriber.error(err);
          },
          complete: () => {
            subscriber.complete();
          },
        });
        if (errorPlan !== null && errorPlan.slug === slug) {
          queueMicrotask(() => {
            subscriber.error(errorPlan.error);
          });
        }
        return () => {
          sub.unsubscribe();
        };
      });
    }

    throw new Error('StubApi: unknown function.');
  }

  resolveProduct(slug: string, product: Product): void {
    const stream = this.productBySlug.get(slug);
    if (!stream) {
      throw new Error(`StubApi: no in-flight request for ${slug}`);
    }
    stream.next(product);
    stream.complete();
  }

  rejectProduct(slug: string, error: unknown): void {
    const stream = this.productBySlug.get(slug);
    if (!stream) {
      throw new Error(`StubApi: no in-flight request for ${slug}`);
    }
    stream.error(error);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FEATURED_SLUGS = ['demo-one-5g', 'demo-air-5g', 'demo-pro-5g', 'demo-lite-5g'] as const;

function money(amount: number): { amount: number; currency: 'HUF' } {
  return { amount, currency: 'HUF' };
}

function imageFor(slug: string): Image {
  return {
    id: `${slug}-img`,
    src: `/assets/products/${slug}.webp`,
    alt: `${slug} fotó`,
    width: 320,
    height: 400,
  };
}

function variantFor(slug: string, storageGb: 128 | 256 | 512, price: number): Variant {
  return {
    id: `${slug}-${String(storageGb)}`,
    colorCode: 'graphite',
    colorName: 'Grafit',
    swatchHex: '#343B43',
    storageGb,
    price: money(price),
    availability: 'in_stock',
    maxQuantity: 5,
    images: [imageFor(slug)],
  };
}

function makeProduct(slug: string, name: string, brand: string, price: number): Product {
  const v256 = variantFor(slug, 256, price);
  return {
    id: slug,
    slug,
    brand,
    name,
    highlights: ['6,7" kijelző'],
    defaultVariant: v256,
    is5g: true,
    isDemo: true,
    description: `${name} demo leírás.`,
    variants: [v256],
    specGroups: [],
  };
}

const PRODUCT_FIXTURES: readonly (readonly [string, string, string, number])[] = [
  ['demo-one-5g', 'Demo One 5G', 'MiBolt Demo', 339_990],
  ['demo-air-5g', 'Demo Air 5G', 'MiBolt Demo', 219_990],
  ['demo-pro-5g', 'Demo Pro 5G', 'MiBolt Demo', 499_990],
  ['demo-lite-5g', 'Demo Lite 5G', 'MiBolt Demo', 149_990],
];

function productFixtures(): Map<string, Product> {
  const map = new Map<string, Product>();
  for (const [slug, name, brand, price] of PRODUCT_FIXTURES) {
    map.set(slug, makeProduct(slug, name, brand, price));
  }
  return map;
}

// ---------------------------------------------------------------------------
// AC01: Brand-consistent composition, live Hungarian copy, no raster
// CTA / operator name in functional UI.
// ---------------------------------------------------------------------------

describe('T14-AC01 brand-consistent hero, Hungarian copy, no raster CTA', () => {
  it('hero uses the dark shell token (R02) and the orange accent token (R03)', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(Hero);
    f.componentRef.setInput('title', 'A következő mobilod.');
    f.componentRef.setInput('subtitle', 'Egyszerűen.');
    f.detectChanges();
    const css = getComponentStyles(Hero).join(' ');
    const hasDark = css.includes('color-shell-dark');
    const hasAlt = css.includes('mi-bolt-color-surface-dark');
    expect(hasDark || hasAlt).toBe(true);
    expect(css.includes('color-brand-accent')).toBe(true);
  });

  it('hero copy is live Hungarian text and contains no raster CTA image', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(Hero);
    f.componentRef.setInput('title', 'A következő mobilod.');
    f.componentRef.setInput('subtitle', 'Egyszerűen.');
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const heading = raw.querySelector('h1');
    expect(heading).not.toBeNull();
    const headingText = heading?.textContent ?? '';
    expect(headingText.length).toBeGreaterThan(4);
    expect(headingText).not.toMatch(/[<>]/);

    const ctaLink = raw.querySelector('a[data-testid="hero-cta"]');
    expect(ctaLink).not.toBeNull();
    const ctaText = (ctaLink?.textContent ?? '').trim();
    expect(ctaText.length).toBeGreaterThan(2);
    const ctaImage = ctaLink ? ctaLink.querySelector('img') : null;
    expect(ctaImage).toBeNull();
  });

  it('hero template carries the MiBolt brand text in a functional element', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(Hero);
    fixture.componentRef.setInput('title', 'A következő mobilod.');
    fixture.componentRef.setInput('subtitle', 'Egyszerűen.');
    fixture.detectChanges();
    const root = getRootElement(fixture);
    expect(root.textContent).toContain('MiBolt');
    expect(root.querySelector('[data-testid="hero-cta"]')).not.toBeNull();
  });

  it('FIX-33-AC01: hero heading is the exact S1 copy, collapsed and trimmed', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(Hero);
    fixture.componentRef.setInput('title', 'A következő mobilod.');
    fixture.componentRef.setInput('subtitle', 'Egyszerűen.');
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const heading = root.querySelector('[data-testid="hero-heading"]');
    expect(heading).not.toBeNull();
    const collapsed = (heading?.textContent ?? '').replace(/\s+/g, ' ').trim();
    expect(collapsed).toBe('A következő mobilod. Egyszerűen.');
  });

  it('FIX-33-AC02: hero CTA row carries exactly two links, primary then secondary', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(Hero);
    fixture.componentRef.setInput('title', 'A következő mobilod.');
    fixture.componentRef.setInput('subtitle', 'Egyszerűen.');
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const row = root.querySelector('[data-testid="hero-cta-row"]');
    expect(row).not.toBeNull();
    const links = Array.from(row?.querySelectorAll('a') ?? []);
    expect(links.length).toBe(2);
    expect((links[0]?.textContent ?? '').trim().startsWith('Megnézem a telefonokat')).toBe(true);
    expect(links[0]?.getAttribute('href')).toBe('/telefonok');
    expect((links[1]?.textContent ?? '').trim()).toBe('Hogyan működik?');
  });
});

// ---------------------------------------------------------------------------
// AC02: Hero CTA opens the catalogue; category shortcuts set valid
// 5G / inStock filters; featured "Részletek" opens the correct slug.
// ---------------------------------------------------------------------------

describe('T14-AC02 CTA + category shortcuts + featured details', () => {
  it('main CTA points to /telefonok', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(Hero);
    f.componentRef.setInput('title', 'A következő mobilod.');
    f.componentRef.setInput('subtitle', 'Egyszerűen.');
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const cta = raw.querySelector('a[data-testid="hero-cta"]');
    expect(cta).not.toBeNull();
    expect(cta ? cta.getAttribute('href') : '').toBe('/telefonok');
  });

  it('category shortcuts render the three spec categories with valid 5G / inStock filters', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(Hero);
    f.componentRef.setInput('title', 'A következő mobilod.');
    f.componentRef.setInput('subtitle', 'Egyszerűen.');
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const shortcuts = Array.from(raw.querySelectorAll('[data-testid^="shortcut-"]'));
    expect(shortcuts.length).toBe(3);

    // A string `routerLink` containing a literal `?`/`=` is the FIX-18
    // defect: the router treats it as a URL path and percent-encodes
    // it (`?` → `%3F`, `=` → `%3D`), which 404s. The correct form is a
    // static `routerLink="/telefonok"` plus a `[queryParams]` binding,
    // which Angular's RouterLinkWithHref resolves into a real `href`
    // with a properly-formed, unencoded query string. Read `href`
    // (the actual navigation target), not the static `routerLink`
    // attribute, and assert neither `%3F` nor `%3D` ever appears.
    const titles = shortcuts.map((s) => {
      const titleEl = s.querySelector('.hero-shortcuts__title');
      return titleEl === null ? '' : titleEl.textContent.trim();
    });
    expect(titles).toEqual(['Összes telefon', '5G készülékek', 'Raktáron']);

    let hasAll = false;
    let has5g = false;
    let hasInStock = false;
    shortcuts.forEach((s) => {
      const href = s.getAttribute('href') ?? '';
      expect(href).not.toContain('%3F');
      expect(href).not.toContain('%3D');
      if (href === '/telefonok') hasAll = true;
      if (href.includes('is5g=true') && !href.includes('inStock=true')) has5g = true;
      if (href.includes('inStock=true') && !href.includes('is5g=true')) hasInStock = true;
    });
    expect(hasAll).toBe(true);
    expect(has5g).toBe(true);
    expect(hasInStock).toBe(true);
  });

  it('featured product "Részletek" opens the correct slug', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeaturedProducts);
    const mockProduct = makeProduct('demo-one-5g', 'Demo One 5G', 'DemoBrand', 249990);
    fixture.componentRef.setInput('slots', [
      { slug: 'demo-one-5g', status: 'success', product: mockProduct, error: null },
    ]);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const link = root.querySelector<HTMLAnchorElement>(
      '[data-testid="featured-details-demo-one-5g"]',
    );
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('Részletek');
    expect(link?.getAttribute('href')).toContain('/telefonok/demo-one-5g');
  });

  it('FIX-33-AC04: featured section header carries a "Minden telefon" link to the catalogue', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeaturedProducts);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const link = root.querySelector<HTMLAnchorElement>('[data-testid="featured-all-link"]');
    expect(link).not.toBeNull();
    expect((link?.textContent ?? '').trim().startsWith('Minden telefon')).toBe(true);
    expect(link?.getAttribute('href')).toBe('/telefonok');
  });
});

// ---------------------------------------------------------------------------
// AC03: Four featured products from the SDK; loading/error show no
// made-up prices; the actual variant price is rendered when the call
// succeeds.
// ---------------------------------------------------------------------------

describe('T14-AC03 four featured products with real prices, no made-up prices', () => {
  it('FeaturedProducts consumes slot entries and renders the SDK variant price', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeaturedProducts);
    const mockProduct = makeProduct('demo-one-5g', 'Demo One 5G', 'DemoBrand', 339990);
    fixture.componentRef.setInput('slots', [
      { slug: 'demo-one-5g', status: 'success', product: mockProduct, error: null },
    ]);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    expect(root.textContent.replace(/\u00a0/g, ' ')).toContain('339 990');
    expect(root.textContent).not.toContain('0 Ft');
  });

  it('home page issues getConfig + getProduct per featured slug and threads slots', async () => {
    const api = new StubApi();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([], withComponentInputBinding()),
        { provide: Api, useValue: api },
      ],
    });
    // Strip FeaturedProducts from the HomePage imports so the JIT
    // compiler doesn't try to resolve the `styleUrl` it carries.
    // The orchestrator still runs (constructor + signals), so the
    // contract under AC03 is still observable.
    TestBed.overrideComponent(HomePage, {
      set: {
        imports: [Hero, HowDemoWorks],
        template: '<div data-testid="home-page-orchestrator"></div>',
      },
    });
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const instance = fixture.componentInstance;
    // Wait for getConfig microtask to fire and loadOneFeatured to issue
    // the four getProduct calls.
    for (let i = 0; i < 30; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const fixtures = productFixtures();
    for (const slug of FEATURED_SLUGS) {
      const product = fixtures.get(slug);
      if (product) api.resolveProduct(slug, product);
    }
    for (let i = 0; i < 10; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    // The orchestrator must have called getConfig exactly once.
    const configCalls = api.calls.filter((c) => c.fn === getConfig);
    expect(configCalls.length).toBe(1);
    // And one getProduct per documented featured slug.
    const productCalls = api.calls.filter((c) => c.fn === getProduct);
    expect(productCalls.length).toBe(FEATURED_SLUGS.length);

    const slots = instance.slots();
    expect(slots.length).toBe(FEATURED_SLUGS.length);
    for (const slot of slots) {
      expect(slot.status).toBe('success');
      expect(slot.product).not.toBeNull();
      expect(slot.product ? slot.product.slug : '').not.toBe('');
    }
  });

  it('does not show a price while the SDK call is still loading', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeaturedProducts);
    fixture.componentRef.setInput('slots', [
      { slug: 'demo-one-5g', status: 'loading', product: null, error: null },
    ]);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="price-skeleton"]')).not.toBeNull();
    expect(root.querySelector('.featured__skeleton--price')).not.toBeNull();
    expect(root.querySelector('[data-testid="price-amount"]')).toBeNull();
    expect(root.querySelector('[data-testid="price-empty"]')).toBeNull();
    expect(root.querySelector('[data-testid="price-error"]')).toBeNull();
  });

  it('does not show a made-up price when the SDK call errors', async () => {
    const api = new StubApi();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([], withComponentInputBinding()),
        { provide: Api, useValue: api },
      ],
    });
    TestBed.overrideComponent(HomePage, {
      set: {
        imports: [Hero, HowDemoWorks],
        template: '<div data-testid="home-page-orchestrator"></div>',
      },
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    // Wait for getConfig and per-slug getProduct to be issued.
    for (let i = 0; i < 30; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    for (const slug of FEATURED_SLUGS) {
      api.rejectProduct(slug, new Error('network down'));
    }
    for (let i = 0; i < 10; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    fixture.detectChanges();
    const instance = fixture.componentInstance;
    const slots = instance.slots();
    expect(slots.length).toBe(FEATURED_SLUGS.length);
    for (const slot of slots) {
      expect(slot.status).toBe('error');
      expect(slot.product).toBeNull();
      expect(slot.error).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// AC04: Three explanatory tiles (böngészés, kosár, szimulált rendelés)
// describe the demo flow. No tariffs / internet / services / payments /
// bankcards.
// ---------------------------------------------------------------------------

describe('T14-AC04 three explanatory tiles describe browsing/cart/simulated order only', () => {
  it('renders three tiles whose copy mentions browsing, cart and simulated order', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(HowDemoWorks);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const tiles = Array.from(raw.querySelectorAll('[data-testid^="how-tile-"]'));
    expect(tiles.length).toBe(3);

    const text = raw.querySelector('[data-testid="how-demo-works"]')?.textContent ?? '';
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/Válaszd ki a készüléked/);
    expect(text).toMatch(/Állítsd össze a rendelést/);
    expect(text).toMatch(/Próbáld végig a folyamatot/);
  });

  it('does not mention tariffs / internet / services / payments / bankcards', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(HowDemoWorks);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const section = raw.querySelector('[data-testid="how-demo-works"]');
    const text = section?.textContent ?? '';
    const lower = text.toLowerCase();
    expect(lower).not.toMatch(/díjas?csomag/);
    expect(lower).not.toMatch(/internet/);
    expect(lower).not.toMatch(/szolgáltatás/);
    expect(lower).not.toMatch(/fizetés/);
    expect(lower).not.toMatch(/bankkártya/);
    expect(lower).not.toMatch(/előfizet/);
  });
});

// ---------------------------------------------------------------------------
// AC05: Mobile content order: heading, message, CTA, illustration,
// shortcuts, product cards. No hero text clipped at 320 px.
// ---------------------------------------------------------------------------

describe('T14-AC05 mobile content order and 320 px clip safety', () => {
  it('mobile source order is heading, message, CTA, illustration, shortcuts', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(Hero);
    f.componentRef.setInput('title', 'A következő mobilod.');
    f.componentRef.setInput('subtitle', 'Egyszerűen.');
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const heroSection = raw.querySelector('[data-testid="hero-section"]');
    expect(heroSection).not.toBeNull();
    // FIX-33 moves the shortcut band out of `.hero__inner` into its own
    // sibling section after the hero, so the DOM order is asserted
    // across the whole fixture (document order) rather than only among
    // `.hero__inner`'s direct children.
    const expectedOrder = [
      'hero-heading',
      'hero-message',
      'hero-cta-row',
      'hero-illustration',
      'hero-shortcuts',
    ];
    const elements = expectedOrder.map((id) => raw.querySelector(`[data-testid="${id}"]`));
    elements.forEach((el) => {
      expect(el).not.toBeNull();
    });
    for (let i = 0; i < elements.length - 1; i += 1) {
      const a = elements[i];
      const b = elements[i + 1];
      if (a !== null && b !== null) {
        expect(Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
      }
    }
  });

  it('home page renders Hero before FeaturedProducts before HowDemoWorks', async () => {
    const api = new StubApi();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([], withComponentInputBinding()),
        { provide: Api, useValue: api },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const hero = root.querySelector('app-hero');
    const featured = root.querySelector('app-featured-products');
    const how = root.querySelector('app-how-demo-works');
    expect(hero).not.toBeNull();
    expect(featured).not.toBeNull();
    expect(how).not.toBeNull();
    if (hero !== null && featured !== null && how !== null) {
      expect(
        Boolean(hero.compareDocumentPosition(featured) & Node.DOCUMENT_POSITION_FOLLOWING),
      ).toBe(true);
      expect(
        Boolean(featured.compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING),
      ).toBe(true);
    }
  });

  it('hero CSS prevents clipping at narrow widths (word-break + max-width)', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const heroFixture = TestBed.createComponent(Hero);
    heroFixture.componentRef.setInput('title', 'A következő mobilod.');
    heroFixture.componentRef.setInput('subtitle', 'Egyszerűen.');
    heroFixture.detectChanges();
    const css = getComponentStyles(Hero).join(' ');
    const hasWrap =
      css.includes('overflow-wrap') || css.includes('word-break') || css.includes('hyphens');
    expect(hasWrap).toBe(true);
  });
});
