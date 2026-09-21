/**
 * T14: Home (Főoldal) acceptance suite.
 *
 * The home page is the entry screen for the four commerce families.
 * It owns a dark hero (R02), three light shopping entry points, up to
 * four featured products rendered with one `listProducts({ featured: true })`
 * SDK call, and three "how the demo works" tiles that explain browsing
 * / cart / simulated order (AC04: and nothing about tariffs, internet,
 * services, payments or bank cards).
 *
 * The vitest decorator transform cannot resolve `styleUrl`
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
 *      signal inputs cannot be resolved through the decorator
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
import { Observable } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Api } from '../../api/generated/api';
import { listProducts } from '../../api/generated/fn/catalog/list-products';
import type { CatalogItem } from '../../api/generated/models/catalog-item';
import type { Image } from '../../api/generated/models/image';
import type { ProductPage } from '../../api/generated/models/product-page';

import { Hero } from './hero';
import { HowDemoWorks } from './how-demo-works';
import { HomePage } from './home-page';
import { FeaturedProducts, type FeaturedState } from './featured-products';

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
// (`api.invoke(listProducts, { featured: true })`). Captures every call
// and delivers the configured response / error via queueMicrotask so the
// RxJS chain inside the page observes the same observable shape the
// real SDK would deliver.
// ---------------------------------------------------------------------------

interface CapturedCall {
  readonly fn: unknown;
  readonly params: unknown;
}

function isListProductsParams(params: unknown): params is { featured: boolean } {
  return (
    typeof params === 'object' &&
    params !== null &&
    'featured' in params &&
    typeof params.featured === 'boolean'
  );
}

function emptyFacets(): ProductPage['facets'] {
  return {
    brands: [],
    colors: [],
    inStock: 0,
    is5g: 0,
    priceRange: {
      min: { amount: 0, currency: 'HUF' },
      max: { amount: 0, currency: 'HUF' },
    },
    storageGb: [],
  };
}

@Injectable({ providedIn: 'root' })
class StubApi {
  readonly calls: CapturedCall[] = [];

  /** Configured next-error, consumed by the first listProducts call. */
  nextListProductsError: unknown = null;

  /** Configured page builder, default returns an empty page. */
  listProductsResponse: () => ProductPage = () => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 12,
    totalPages: 1,
    facets: emptyFacets(),
  });

  invoke(fn: typeof listProducts, params: { featured: boolean }): Observable<ProductPage>;
  invoke(fn: unknown, params?: unknown): Observable<unknown> {
    this.calls.push({ fn, params });

    if (fn === listProducts) {
      if (!isListProductsParams(params)) {
        throw new Error('StubApi: expected { featured: boolean }.');
      }
      const errorPlan = this.nextListProductsError;
      this.nextListProductsError = null;
      const response = this.listProductsResponse();
      return new Observable<ProductPage>((subscriber) => {
        if (errorPlan !== null) {
          queueMicrotask(() => {
            subscriber.error(errorPlan);
          });
        } else {
          queueMicrotask(() => {
            subscriber.next(response);
            subscriber.complete();
          });
        }
        return () => undefined;
      });
    }

    throw new Error('StubApi: unknown function.');
  }

  listProductsCalls(): readonly CapturedCall[] {
    return this.calls.filter((c) => c.fn === listProducts);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

const FEATURED_FIXTURES: readonly (readonly [string, string, string, number])[] = [
  ['demo-one-5g', 'Demo One 5G', 'MiBolt Demo', 339_990],
  ['demo-air-5g', 'Demo Air 5G', 'MiBolt Demo', 219_990],
  ['demo-pro-5g', 'Demo Pro 5G', 'MiBolt Demo', 499_990],
  ['demo-lite-5g', 'Demo Lite 5G', 'MiBolt Demo', 149_990],
];

function makeCatalogItem(slug: string, name: string, brand: string, price: number): CatalogItem {
  return {
    id: slug,
    slug,
    brand,
    name,
    highlights: ['6,7" kijelző'],
    is5g: true,
    releasedAt: '2026-01-15',
    storageGb: 256,
    variantId: `${slug}-256`,
    variantSlug: `${slug}-grafit-256`,
    price: money(price),
    availability: 'in_stock',
    maxQuantity: 5,
    image: imageFor(slug),
    colors: [
      {
        colorCode: 'graphite',
        colorName: 'Grafit',
        swatchHex: '#343B43',
        variantId: `${slug}-256`,
        variantSlug: `${slug}-grafit-256`,
        price: money(price),
        availability: 'in_stock',
      },
    ],
  };
}

function catalogItemFixtures(): readonly CatalogItem[] {
  return FEATURED_FIXTURES.map(([slug, name, brand, price]) =>
    makeCatalogItem(slug, name, brand, price),
  );
}

function pageFrom(items: readonly CatalogItem[]): ProductPage {
  return {
    items: [...items],
    total: items.length,
    page: 1,
    pageSize: 12,
    totalPages: 1,
    facets: emptyFacets(),
  };
}

// ---------------------------------------------------------------------------
// AC01: Brand-consistent composition, live Hungarian copy, no raster
// CTA / operator name in functional UI.
// ---------------------------------------------------------------------------

describe('T14-AC01 brand-consistent hero, Hungarian copy, no raster CTA', () => {
  it('hero uses the navy shell token and the brand accent token, and its CTA is the lime pill (docs/design/yettel.md §9)', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(Hero);
    f.componentRef.setInput('title', 'A következő mobilod.');
    f.componentRef.setInput('subtitle', 'Egyszerűen.');
    f.detectChanges();
    const css = getComponentStyles(Hero).join(' ');
    expect(css.includes('color-shell-dark')).toBe(true);
    expect(css.includes('color-brand-accent')).toBe(true);
    // The browser pass caught .hero__cta rendering navy text on a navy
    // ground with an 8px radius. --color-brand-accent now resolves to the
    // lime #b4ff00, so the pair below is the lime pill with navy text, and
    // the radius is the 24px --radius-pill every yettel .btn carries (§4).
    const normalised = css
      .replaceAll('%NS%', '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s+/g, '');
    const at = normalised.indexOf('.hero__cta{');
    expect(at).toBeGreaterThan(-1);
    const cta = normalised.slice(at, normalised.indexOf('}', at));
    expect(cta).toContain('background:var(--color-brand-accent)');
    expect(cta).toContain('color:var(--color-text-primary)');
    expect(cta).toContain('padding:12pxvar(--space-6)');
    // Both CTAs share the yettel .btn box: portal-font-bold, 16/24 and the
    // 24px pill (docs/design/yettel.md §5).
    const boxAt = normalised.indexOf('.hero__cta,.hero__cta-secondary{');
    expect(boxAt).toBeGreaterThan(-1);
    const box = normalised.slice(boxAt, normalised.indexOf('}', boxAt));
    expect(box).toContain('border-radius:var(--radius-pill)');
    expect(box).toContain('font-family:var(--font-family-bold)');
    expect(box).toContain('font-size:var(--type-body)');
    expect(box).toContain('line-height:24px');
    // .btn-outline-lime on the navy hero: lime text and hairline, no fill.
    // The selector has to sit at a rule boundary, or it would match inside
    // the grouped `.hero__cta,.hero__cta-secondary` box rule above.
    const secAt = normalised.indexOf('}.hero__cta-secondary{');
    expect(secAt).toBeGreaterThan(-1);
    const secondary = normalised.slice(secAt + 1, normalised.indexOf('}', secAt + 1));
    expect(secondary).toContain('color:var(--color-brand-accent)');
    expect(secondary).toContain('border:1pxsolidvar(--color-brand-accent)');
    expect(secondary).toContain('background:transparent');
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
    // yettel's buttons carry no arrow glyph ("Megnézem", "Belépés" on
    // docs/design/yettel/screenshots/home-1920.png), so the label is exact.
    expect((links[0]?.textContent ?? '').trim()).toBe('Megnézem a telefonokat');
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

  it('.hero-shortcuts splits the gutter-bearing outer element from a max-width inner wrapper (FIX-34)', async () => {
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
    const heroShortcuts = raw.querySelector('[data-testid="hero-shortcuts"]');
    expect(heroShortcuts).not.toBeNull();
    const inner = heroShortcuts?.querySelector(':scope > .hero-shortcuts__inner') ?? null;
    expect(inner).not.toBeNull();
    const cardsInInner = inner?.querySelectorAll(':scope > .hero-shortcuts__card') ?? [];
    expect(cardsInInner.length).toBe(3);
    const directCards = heroShortcuts?.querySelectorAll(':scope > .hero-shortcuts__card') ?? [];
    expect(directCards.length).toBe(0);
  });

  it('featured product "Részletek" opens the correct slug and variant', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeaturedProducts);
    const items = catalogItemFixtures();
    fixture.componentRef.setInput('state', {
      status: 'success',
      items,
      error: null,
    } satisfies FeaturedState);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const link = root.querySelector<HTMLAnchorElement>(
      '[data-testid="featured-details-demo-one-5g"]',
    );
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('Részletek');
    expect(link?.getAttribute('href')).toBe('/telefonok/demo-one-5g?variant=' + items[0].variantId);
  });

  it('FIX-33-AC04: featured section header carries a "Minden telefon" link to the catalogue', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeaturedProducts);
    fixture.componentRef.setInput('state', {
      status: 'loading',
      items: [],
      error: null,
    } satisfies FeaturedState);
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
// made-up prices; the actual price is rendered when the call succeeds.
// ---------------------------------------------------------------------------

describe('T14-AC03 four featured products with real prices, no made-up prices', () => {
  it('FeaturedProducts consumes the grid state and renders the SDK price', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeaturedProducts);
    const items = catalogItemFixtures();
    fixture.componentRef.setInput('state', {
      status: 'success',
      items,
      error: null,
    } satisfies FeaturedState);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    expect(root.textContent.replace(/\u00a0/g, ' ')).toContain('339 990');
    expect(root.textContent).not.toContain('0 Ft');
  });

  it('home page issues exactly one listProducts({ featured: true }) call and threads four cards in order', async () => {
    const api = new StubApi();
    const items = catalogItemFixtures();
    api.listProductsResponse = () => pageFrom(items);
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
    for (let i = 0; i < 20; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    // The orchestrator must have called listProducts exactly once with { featured: true }.
    const productCalls = api.listProductsCalls();
    expect(productCalls.length).toBe(1);
    expect(productCalls[0]?.params).toEqual({ featured: true });

    const instance = fixture.componentInstance;
    const state = instance.featured();
    expect(state.status).toBe('success');
    expect(state.items.length).toBe(items.length);
    state.items.forEach((item, idx) => {
      expect(item.slug).toBe(items[idx]?.slug);
      expect(item.id).toBe(items[idx]?.id);
    });
  });

  it('FeaturedProducts renders four cards in response order with featured-details and price-amount', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeaturedProducts);
    const items = catalogItemFixtures();
    fixture.componentRef.setInput('state', {
      status: 'success',
      items,
      error: null,
    } satisfies FeaturedState);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    for (const item of items) {
      const link = root.querySelector<HTMLAnchorElement>(
        `[data-testid="featured-details-${item.slug}"]`,
      );
      expect(link).not.toBeNull();
      expect(link?.textContent).toContain('Részletek');
    }
    const priceAmounts = root.querySelectorAll('[data-testid="price-amount"]');
    expect(priceAmounts.length).toBe(items.length);
  });

  it('does not show a price while the listProducts call is still pending', async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([], withComponentInputBinding())],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeaturedProducts);
    fixture.componentRef.setInput('state', {
      status: 'loading',
      items: [],
      error: null,
    } satisfies FeaturedState);
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const skeletons = root.querySelectorAll('[data-testid="featured-loading"]');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(root.querySelector('[data-testid="price-skeleton"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="price-amount"]')).toBeNull();
    expect(root.querySelector('[data-testid="error-state"]')).toBeNull();
  });

  it('renders error-state with retry-button on a failed listProducts call, and retry issues a second call', async () => {
    const api = new StubApi();
    api.nextListProductsError = new Error('network down');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([], withComponentInputBinding()),
        { provide: Api, useValue: api },
      ],
    });
    TestBed.overrideComponent(HomePage, {
      set: {
        imports: [Hero, HowDemoWorks, FeaturedProducts],
        template:
          '<app-hero></app-hero><app-featured-products [state]="featured()" (retryRequested)="retryFeatured()"></app-featured-products><app-how-demo-works></app-how-demo-works>',
      },
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    for (let i = 0; i < 20; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    fixture.detectChanges();
    const root = getRootElement(fixture);

    expect(root.querySelector('[data-testid="error-state"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="retry-button"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="featured-grid"]')).toBeNull();

    // First listProducts call has been made.
    expect(api.listProductsCalls().length).toBe(1);

    // Resolve the retry call so the orchestrator does not stay loading.
    api.nextListProductsError = null;
    api.listProductsResponse = () => pageFrom(catalogItemFixtures());
    const retry = root.querySelector<HTMLButtonElement>('[data-testid="retry-button"]');
    expect(retry).not.toBeNull();
    retry?.click();
    for (let i = 0; i < 20; i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    fixture.detectChanges();

    expect(api.listProductsCalls().length).toBe(2);
    expect(api.listProductsCalls()[1]?.params).toEqual({ featured: true });
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
    api.listProductsResponse = () => pageFrom(catalogItemFixtures());
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
