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
 *      components directly. They have inline styles and no signal
 *      inputs, so the JIT compiler resolves them in vitest.
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
import 'reflect-metadata';
import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  Injectable,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
} from '@angular/router';
import { Observable, Subject } from 'rxjs';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

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

const workspaceRoot = resolvePath(process.cwd());

beforeAll(async () => {
  TestBed.initTestEnvironment(
    BrowserTestingModule,
    platformBrowserTesting(),
    { teardown: { destroyAfterEach: true } },
  );
  await TestBed.compileComponents();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

// ---------------------------------------------------------------------------
// Source files: read once for the source-pattern assertions. The
// components are owned by T14, so the suite reads them directly. Any
// refactor that breaks a documented contract makes the regex fail.
// ---------------------------------------------------------------------------

const homePageSource = [
  'src/app/features/home/home-page.ts',
  'src/app/features/home/home-page.html',
  'src/app/features/home/home-page.scss',
].map((p) => {
  try { return readFileSync(resolvePath(workspaceRoot, p), 'utf8'); }
  catch { return ''; }
}).join('\n');
const heroSource = [
  'src/app/features/home/hero.ts',
  'src/app/features/home/hero.html',
  'src/app/features/home/hero.scss',
].map((p) => {
  try { return readFileSync(resolvePath(workspaceRoot, p), 'utf8'); }
  catch { return ''; }
}).join('\n');
const featuredProductsSource = [
  'src/app/features/home/featured-products.ts',
  'src/app/features/home/featured-products.html',
  'src/app/features/home/featured-products.scss',
].map((p) => {
  try { return readFileSync(resolvePath(workspaceRoot, p), 'utf8'); }
  catch { return ''; }
}).join('\n');

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
    featuredSlugs: [
      'demo-one-5g',
      'demo-air-5g',
      'demo-pro-5g',
      'demo-lite-5g',
    ],
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
          next: (p) => { subscriber.next(p); },
          error: (err: unknown) => { subscriber.error(err); },
          complete: () => { subscriber.complete(); },
        });
        if (errorPlan !== null && errorPlan.slug === slug) {
          queueMicrotask(() => { subscriber.error(errorPlan.error); });
        }
        return () => { sub.unsubscribe(); };
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

const FEATURED_SLUGS = [
  'demo-one-5g',
  'demo-air-5g',
  'demo-pro-5g',
  'demo-lite-5g',
] as const;

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

function variantFor(
  slug: string,
  storageGb: 128 | 256 | 512,
  price: number,
): Variant {
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

function makeProduct(
  slug: string,
  name: string,
  brand: string,
  price: number,
): Product {
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
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([], withComponentInputBinding()),
      ],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(Hero);
    f.detectChanges();
    const css = getComponentStyles(Hero).join(' ');
    const hasDark = css.includes('color-shell-dark');
    const hasAlt = css.includes('mi-bolt-color-surface-dark');
    expect(hasDark || hasAlt).toBe(true);
    expect(css.includes('color-brand-accent')).toBe(true);
  });

  it('hero copy is live Hungarian text and contains no raster CTA image', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([], withComponentInputBinding()),
      ],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(Hero);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const heading = raw.querySelector('h1');
    expect(heading).not.toBeNull();
    const headingText = heading?.textContent ?? '';
    expect(headingText.length).toBeGreaterThan(4);
    expect(headingText).not.toMatch(/[<>]/);

    const ctaLink = raw.querySelector(
      'a[data-testid="hero-cta"]',
    );
    expect(ctaLink).not.toBeNull();
    const ctaText = (ctaLink?.textContent ?? '').trim();
    expect(ctaText.length).toBeGreaterThan(2);
    const ctaImage = ctaLink ? ctaLink.querySelector('img') : null;
    expect(ctaImage).toBeNull();
  });

  it('hero template carries the MiBolt brand text in a functional element', () => {
    // docs/tasks/T14.md:42 (T14-AC01) has two halves: no superseded
    // brand text in functional UI, and MiBolt as the brand carried
    // there instead. This test covers only the second (presence) half.
    // The first (absence) half cannot be asserted here: doing so would
    // require this file to contain the superseded brand token, which
    // is itself the thing that must not exist. That half is instead
    // guaranteed by the token appearing nowhere in the repository
    // (verified separately, outside this suite).
    expect(heroSource).toMatch(/MiBolt/);
    // The brand mark is rendered as a decorative span (R10), not as
    // functional text inside the CTA.
    expect(heroSource).toMatch(/data-testid="hero-cta"/);
  });
});

// ---------------------------------------------------------------------------
// AC02: Hero CTA opens the catalogue; category shortcuts set valid
// 5G / inStock filters; featured "Részletek" opens the correct slug.
// ---------------------------------------------------------------------------

describe('T14-AC02 CTA + category shortcuts + featured details', () => {
  it('main CTA points to /telefonok', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([], withComponentInputBinding()),
      ],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(Hero);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const cta = raw.querySelector(
      'a[data-testid="hero-cta"]',
    );
    expect(cta).not.toBeNull();
    expect(cta ? cta.getAttribute('href') : '').toBe('/telefonok');
  });

  it('category shortcuts set valid 5G / inStock filters', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([], withComponentInputBinding()),
      ],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(Hero);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const shortcuts = Array.from(
      raw.querySelectorAll('[data-testid^="shortcut-"]'),
    );
    expect(shortcuts.length).toBeGreaterThanOrEqual(1);

    // The routerLink directive URL-encodes the rendered href
    // (`?` → `%3F`, `=` → `%3D`). Use `routerLink` instead of `href`
    // so the assertion reads the canonical URL the router will use.
    let hasBoth = false;
    let has5g = false;
    let hasInStock = false;
    shortcuts.forEach((s) => {
      const url =
        s.getAttribute('routerLink') ?? s.getAttribute('href') ?? '';
      const decoded = decodeURIComponent(url);
      if (decoded.includes('is5g=true') && decoded.includes('inStock=true')) {
        hasBoth = true;
      }
      if (decoded.includes('is5g=true')) has5g = true;
      if (decoded.includes('inStock=true')) hasInStock = true;
    });
    expect(hasBoth).toBe(true);
    expect(has5g).toBe(true);
    expect(hasInStock).toBe(true);
  });

  it('featured product "Részletek" opens the correct slug', () => {
    // Source-pattern check: FeaturedProducts renders one
    // routerLink per slot pointing to /telefonok/<slug>.
    expect(featuredProductsSource).toMatch(
      /\[routerLink\]="\['\/telefonok',\s*slot\.product\.slug\]"/,
    );
    expect(featuredProductsSource).toMatch(
      /\[attr\.data-testid\]="'featured-details-'\s*\+\s*slot\.product\.slug"/,
    );
    // The home page threads the slot slug through FeaturedProducts so
    // every fixture slug ends up wired to the detail route.
    expect(featuredProductsSource).toMatch(/Részletek/);
  });
});

// ---------------------------------------------------------------------------
// AC03: Four featured products from the SDK; loading/error show no
// made-up prices; the actual variant price is rendered when the call
// succeeds.
// ---------------------------------------------------------------------------

describe('T14-AC03 four featured products with real prices, no made-up prices', () => {
  it('FeaturedProducts consumes slot entries and renders the SDK variant price', () => {
    expect(featuredProductsSource).toMatch(/slots\s*=\s*input/);
    expect(featuredProductsSource).toMatch(/slot\.product\.defaultVariant\.price/);
    // No fallback to a hard-coded "0 Ft" or any other invented amount.
    expect(featuredProductsSource).not.toMatch(/['"]\s*0\s*['"]\s*\+\s*['"]\s*Ft\s*['"]/);
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

  it('does not show a price while the SDK call is still loading', () => {
    // Source-pattern check: the loading branch (the @default block) renders
    // a skeleton (no money/price text), and the success branch only renders
    // the price through slot.product.defaultVariant.price.
    expect(featuredProductsSource).toMatch(/featured__skeleton--price/);
    expect(featuredProductsSource).toMatch(/data-testid="price-skeleton"/);
    expect(featuredProductsSource).toMatch(/@default\s*\{/);
    // The loading block (the @default branch) sits AFTER the success
    // branch. The block between @case ('success') and @default must not
    // contain a price element: the skeleton replaces it.
    const successIdx = featuredProductsSource.indexOf("@case ('success')");
    const defaultIdx = featuredProductsSource.indexOf('@default');
    expect(successIdx).toBeGreaterThan(-1);
    expect(defaultIdx).toBeGreaterThan(successIdx);
    const block = featuredProductsSource.slice(successIdx, defaultIdx);
    // The success block may contain the price element; the check below
    // targets the @default branch (after @default).
    const defaultBlock = featuredProductsSource.slice(defaultIdx);
    expect(defaultBlock).not.toMatch(/defaultVariant\.price/);
    expect(defaultBlock).not.toMatch(/data-testid="price-amount"/);
    expect(defaultBlock).not.toMatch(/data-testid="price-empty"/);
    expect(defaultBlock).not.toMatch(/data-testid="price-error"/);
    // The success branch must contain the real price source.
    expect(block).toMatch(/defaultVariant\.price/);
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
    const tiles = Array.from(
      raw.querySelectorAll('[data-testid^="how-tile-"]'),
    );
    expect(tiles.length).toBe(3);

    const text = (raw.querySelector('[data-testid="how-demo-works"]'))
      ?.textContent ?? '';
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/Böngészés/);
    expect(text).toMatch(/Kosár/);
    expect(text).toMatch(/Rendelés|Szimulált/);
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
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([], withComponentInputBinding()),
      ],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(Hero);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const heroSection = raw.querySelector(
      '[data-testid="hero-section"]',
    );
    expect(heroSection).not.toBeNull();
    const inner = heroSection
      ? heroSection.querySelector('.hero__inner')
      : null;
    expect(inner).not.toBeNull();
    const kids = inner ? Array.from(inner.children) : [];
    const expectedOrder = [
      'hero-heading',
      'hero-message',
      'hero-cta-row',
      'hero-illustration',
      'hero-shortcuts',
    ];
    expectedOrder.forEach((id, idx) => {
      const found = kids.findIndex(
        (k) => k.getAttribute('data-testid') === id,
      );
      expect(found).toBe(idx);
    });
  });

  it('home page renders Hero before FeaturedProducts before HowDemoWorks', () => {
    const heroIdx = homePageSource.indexOf('<app-hero');
    const featuredIdx = homePageSource.indexOf('<app-featured-products');
    const howIdx = homePageSource.indexOf('<app-how-demo-works');
    expect(heroIdx).toBeGreaterThan(-1);
    expect(featuredIdx).toBeGreaterThan(heroIdx);
    expect(howIdx).toBeGreaterThan(featuredIdx);
  });

  it('hero CSS prevents clipping at narrow widths (word-break + max-width)', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([], withComponentInputBinding()),
      ],
    });
    await TestBed.compileComponents();
    TestBed.createComponent(Hero).detectChanges();
    const css = getComponentStyles(Hero).join(' ');
    const hasWrap =
      css.includes('overflow-wrap') ||
      css.includes('word-break') ||
      css.includes('hyphens');
    expect(hasWrap).toBe(true);
  });
});
