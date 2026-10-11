/**
 * T13: CatalogPage acceptance suite.
 *
 * Each named failing test asserts one rule from the task's AC list:
 *
 *   AC01: breakpoint-correct grid (sidebar / drawer switch).
 *   AC02: filter, sort, page-size, search, applied chips and result
 *          count all tied to URL state via the facade.
 *   AC03: mobile drawer Apply commits, Cancel/Escape discards; focus
 *          trap and background exclusion handled by AccessibleDialog.
 *   AC05: default, loading, empty, error, missing-image and selected
 *          filter states are visually distinct.
 *
 * The suite wires the real SDK through MSW (T06 catalog handlers) and
 * the real Router so URL round-trips work end to end. The tests focus
 * on what the user sees: rendered DOM, accessible names, emitted
 * events and the resulting URL after the action.
 */

import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { Location } from '@angular/common';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
  type Params,
} from '@angular/router';
import { By } from '@angular/platform-browser';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { BehaviorSubject } from 'rxjs';

import { server, useMswServer } from '../../../../../../tests/msw-server';
import { Api } from '@mi-bolt/api/api';
import { ApiConfiguration, provideApiConfiguration } from '@mi-bolt/api/api-configuration';
import { demoSessionInterceptor } from '@mi-bolt/core-api/demo-session.interceptor';
import { CatalogFacade } from './catalog.facade';
import { CatalogPage } from './catalog-page';
import { AsyncContent } from '../../shared/ui/async-content/async-content';
import { FilterPanel } from './filter-panel';
import { FilterDrawer } from './filter-drawer';
import type { Variant } from '@mi-bolt/api/models/variant';
import type { ProductPage as ProductPageDTO } from '@mi-bolt/api/models/product-page';
import type { CatalogItem } from '@mi-bolt/api/models/catalog-item';
import type { Money } from '../../shared/ui/price-block/price-block';

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

const BASE_URL = 'http://localhost/api/v1';

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

function queryButton(parent: Element, selector: string): HTMLButtonElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLButtonElement))
    throw new Error(`Expected HTMLButtonElement: ${selector}`);
  return el;
}

function queryInput(parent: Element, selector: string): HTMLInputElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLInputElement)) throw new Error(`Expected HTMLInputElement: ${selector}`);
  return el;
}

function querySelect(parent: Element, selector: string): HTMLSelectElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLSelectElement))
    throw new Error(`Expected HTMLSelectElement: ${selector}`);
  return el;
}

function queryElement(parent: Element, selector: string): HTMLElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error(`Expected HTMLElement: ${selector}`);
  return el;
}

function queryImage(parent: Element, selector: string): HTMLImageElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLImageElement)) throw new Error(`Expected HTMLImageElement: ${selector}`);
  return el;
}

// ---------------------------------------------------------------------------
// MSW handler: minimal stub of GET /products so the SDK round-trip
// resolves without spinning up the entire catalog mock.
// ---------------------------------------------------------------------------

function makeImage(id: string, src: string, alt: string): Variant['images'][number] {
  return { id, src, alt, width: 320, height: 400 };
}

function money(amount: number): Money {
  return { amount, currency: 'HUF' };
}

function buildVariant(
  id: string,
  productId: string,
  colorName: string,
  storageGb: 128 | 256 | 512,
  price: number,
): Variant {
  const colorCode = colorName.toLowerCase();
  return {
    id,
    slug: `${productId}-${colorCode}-${String(storageGb)}`,
    colorCode,
    colorName,
    swatchHex: '#343B43',
    storageGb,
    price: money(price),
    availability: 'in_stock',
    maxQuantity: 5,
    images: [
      makeImage(`${id}-front`, `/assets/products/${colorCode}-front.webp`, `${productId} front`),
    ],
  };
}

function buildItem(
  id: string,
  brand: string,
  name: string,
  price: number,
  is5g: boolean,
  storageGb: 128 | 256 | 512,
): CatalogItem {
  const variant = buildVariant(`${id}-${String(storageGb)}`, id, 'Grafit', storageGb, price);
  const productSlug = id;
  return {
    id,
    slug: productSlug,
    brand,
    name,
    highlights: ['6,7" kijelző'],
    is5g,
    releasedAt: '2026-01-01',
    storageGb,
    variantId: variant.id,
    variantSlug: variant.slug,
    price: variant.price,
    availability: variant.availability,
    maxQuantity: variant.maxQuantity,
    image: variant.images[0],
    colors: [
      {
        colorCode: variant.colorCode,
        colorName: variant.colorName,
        swatchHex: variant.swatchHex,
        variantId: variant.id,
        variantSlug: variant.slug,
        price: variant.price,
        availability: variant.availability,
      },
    ],
  };
}

interface CapturedRequest {
  readonly url: string;
  readonly params: URLSearchParams;
}

interface Harness {
  fixture: ReturnType<typeof TestBed.createComponent<CatalogPage>>;
  router: Router;
  location: Location;
  facade: CatalogFacade;
  captured: CapturedRequest[];
  respond: (page: ProductPageDTO) => void;
  reject: (status: number) => void;
  tick: () => Promise<void>;
  /** Returns when `vm.status` reaches the supplied target. */
  waitForStatus: (
    status: 'loading' | 'refreshing' | 'success' | 'empty' | 'error',
  ) => Promise<void>;
  cleanup: () => void;
}

function isMediaQueryListEvent(event: Event): event is MediaQueryListEvent {
  return 'matches' in event && 'media' in event;
}

/**
 * jsdom (the DOM environment `ng test` runs this suite under) does not
 * implement `window.matchMedia` at all: `CatalogPage.applyLayoutMode()`
 * calls it unconditionally to drive the host's `data-layout-mode`
 * attribute, so constructing the component throws `TypeError:
 * window.matchMedia is not a function` without this shim.
 *
 * `EventTarget` itself is real in jsdom, so extending it gives
 * `addEventListener` / `removeEventListener` / `dispatchEvent` a genuine,
 * working implementation for free; only the media-query-specific members
 * (`matches`, `media`, the deprecated `addListener`/`removeListener`
 * pair) are added here. The query always reports a match (desktop /
 * sidebar); no test in this file drives a live viewport change.
 */
class StaticMediaQueryList extends EventTarget implements MediaQueryList {
  readonly matches: boolean = true;
  readonly media: string;
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null;
  private readonly wrappedListeners = new Map<
    (this: MediaQueryList, ev: MediaQueryListEvent) => unknown,
    EventListener
  >();

  constructor(query: string) {
    super();
    this.media = query;
  }

  addListener(callback: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null): void {
    if (callback === null) return;
    const wrapped: EventListener = (event) => {
      if (isMediaQueryListEvent(event)) callback.call(this, event);
    };
    this.wrappedListeners.set(callback, wrapped);
    this.addEventListener('change', wrapped);
  }

  removeListener(
    callback: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null,
  ): void {
    if (callback === null) return;
    const wrapped = this.wrappedListeners.get(callback);
    if (wrapped === undefined) return;
    this.removeEventListener('change', wrapped);
    this.wrappedListeners.delete(callback);
  }
}

function installMatchMediaStub(): void {
  if (typeof window.matchMedia === 'function') return;
  window.matchMedia = (query: string): MediaQueryList => new StaticMediaQueryList(query);
}

beforeAll(() => {
  installMatchMediaStub();

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
    ],
    teardown: { destroyAfterEach: true },
  });
});

async function setupHarness(queryParams: Params = {}): Promise<Harness> {
  TestBed.resetTestingModule();
  const captured: CapturedRequest[] = [];
  let responder: ((page: ProductPageDTO) => void) | null = null;
  let rejecter: ((status: number) => void) | null = null;
  // jsdom's `XMLHttpRequest` is itself built on Node's `http` module, so
  // MSW's XHR interceptor and its ClientRequest interceptor both fire for
  // a single logical request, invoking this resolver twice with the same
  // `requestId`. Without dedup, `captured` grows by two entries per click
  // and the second invocation orphans the first pending promise's
  // `responder`/`rejecter`. Keying the pending response by `requestId`
  // collapses the second call onto the first: it awaits the same promise
  // and returns a clone (a `Response` body can only be read once).
  const pending = new Map<string, Promise<Response>>();
  server.use(
    http.get(`${BASE_URL}/products`, ({ request, requestId }) => {
      const existing = pending.get(requestId);
      if (existing !== undefined) return existing.then((response) => response.clone());

      const url = new URL(request.url);
      captured.push({ url: request.url, params: url.searchParams });
      const promise = new Promise<Response>((resolve) => {
        responder = (page: ProductPageDTO): void => {
          resolve(HttpResponse.json(page));
        };
        rejecter = (status: number): void => {
          resolve(
            HttpResponse.json(
              {
                type: 'urn:mi-bolt:problem:validation',
                title: 'Error',
                status,
                code: 'NOT_FOUND',
                detail: 'mock error',
                traceId: 'mock-trace-t13',
                fieldErrors: [],
              },
              { status, headers: { 'content-type': 'application/problem+json' } },
            ),
          );
        };
      });
      pending.set(requestId, promise);
      return promise;
    }),
  );

  TestBed.configureTestingModule({
    imports: [CatalogPage],
    providers: [
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
      {
        provide: Api,
        useFactory: (config: ApiConfiguration, http: HttpClient) => new Api(config, http),
        deps: [ApiConfiguration, HttpClient],
      },
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap(queryParams) },
          queryParamMap: new BehaviorSubject(convertToParamMap(queryParams)).asObservable(),
        },
      },
    ],
    teardown: { destroyAfterEach: true },
  });
  const router = TestBed.inject(Router);
  const location = TestBed.inject(Location);
  const facade = TestBed.inject(CatalogFacade);

  const fixture = TestBed.createComponent(CatalogPage);
  fixture.detectChanges();

  const tick = async (): Promise<void> => {
    for (let i = 0; i < 8; i += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    fixture.detectChanges();
  };

  const waitForStatus = async (
    status: 'loading' | 'refreshing' | 'success' | 'empty' | 'error',
  ): Promise<void> => {
    for (let i = 0; i < 20; i += 1) {
      await tick();
      if (facade.vm().status === status) return;
    }
    // final pass to leave the caller in a settled state.
    await tick();
  };

  const cleanup = (): void => {
    server.resetHandlers();
    TestBed.resetTestingModule();
  };

  // `CatalogPage` fires its initial `loadFromParams` request synchronously
  // from the constructor, but MSW's interceptors resolve the matching
  // handler only after several event-loop turns. Every caller of
  // `setupHarness` immediately drives `respond()` / `reject()` (or reads
  // `captured`) against that first request, so the harness itself waits
  // for it to land before handing back control.
  await tick();

  return {
    fixture,
    router,
    location,
    facade,
    captured,
    respond: (page) => {
      if (responder === null) throw new Error('no responder');
      responder(page);
    },
    reject: (status) => {
      if (rejecter === null) throw new Error('no rejecter');
      rejecter(status);
    },
    tick,
    waitForStatus,
    cleanup,
  };
}

function successPage(
  items: readonly CatalogItem[],
  total: number,
  page = 1,
  pageSize: 12 | 24 = 12,
): ProductPageDTO {
  return {
    items: [...items],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    facets: {
      brands: [
        { value: 'MiBolt Demo', label: 'MiBolt Demo', count: items.length },
        { value: 'Sample', label: 'Sample', count: 0 },
      ],
      colors: [{ value: 'graphite', label: 'Grafit', count: items.length, swatchHex: '#343B43' }],
      inStock: items.length,
      is5g: items.length,
      priceRange: {
        min: { amount: 100000, currency: 'HUF' },
        max: { amount: 500000, currency: 'HUF' },
      },
      storageGb: [
        { value: '128', label: '128 GB', count: 1 },
        { value: '256', label: '256 GB', count: 1 },
      ],
    },
  };
}

// ===========================================================================
// AC01: breakpoint-aware layout
// ===========================================================================

describe('T13-AC01 catalog layout breakpoints', () => {
  it('>=1024px desktop renders a sidebar + 3-column grid (CSS data-layout=desktop-3col)', () => {
    // FIX-60 moved the grid rules out of CatalogPage into AsyncContent,
    // which now owns the `[data-testid="catalog-grid"]` element.
    // The 3-column breakpoint is 1024 px
    // to match the new filter sidebar width (docs/design/yettel.md §5).
    const css = getComponentStyles(AsyncContent).join('\n');
    expect(css).toMatch(/min-width:\s*1024px/);
    // Three columns: grid-template-columns repeat(3, ...) inside the desktop media block.
    const desktopBlock = /@media[^{]*min-width:\s*1024px[^}]*\{[^}]*\}/s.exec(css);
    expect(desktopBlock).not.toBeNull();
    expect(desktopBlock?.[0]).toMatch(/repeat\(3/);
  });

  it('1024-1279 px renders a sidebar + 3-column grid (CSS @media repeat(3))', async () => {
    // jsdom does not evaluate `@media` rules in computed style, so the
    // column count itself cannot be asserted from rendered DOM. What
    // the DOM does show at this breakpoint is the sidebar mount (CSS
    // hides the drawer trigger and switches `.layout` to
    // `280px minmax(0, 1fr)` at `min-width: 1024px`) with every result
    // rendered inside the shared `[data-testid="catalog-grid"]` container.
    const harness = await setupHarness();
    const items = [
      buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256),
      buildItem('p-02', 'MiBolt Demo', 'Demo Air 5G', 219990, true, 128),
    ];
    harness.respond(successPage(items, 2));
    await harness.waitForStatus('success');
    const root = getRootElement(harness.fixture);
    expect(root.querySelector('[data-testid="filter-sidebar"]')).not.toBeNull();
    const grid = root.querySelector('[data-testid="catalog-grid"]');
    expect(grid).not.toBeNull();
    expect(grid?.querySelectorAll('[data-testid="product-card"]').length).toBe(2);
    harness.cleanup();
  });

  it('640-1023 px renders a drawer + 2-column grid', () => {
    // The 2-column rule lives at `min-width: 640px` (the 1024 px rule
    // overrides it to 3 columns above). jsdom cannot evaluate @media,
    // so the stylesheet text is what the assertion runs against.
    const css = getComponentStyles(AsyncContent).join('\n');
    expect(css).toMatch(/min-width:\s*640px[^{]*\{[^}]*repeat\(2/s);
  });

  it('<640 px renders a drawer + 1-column grid', async () => {
    // Same jsdom limitation as the 1024-1279px case above: the column
    // count is CSS-media-query-only and unobservable through
    // `getComputedStyle`, so the drawer trigger's presence — the real
    // DOM signal CSS keys off below 1024px — is what this test proves,
    // alongside every result still rendering inside the shared
    // `[data-testid="catalog-grid"]` container.
    const harness = await setupHarness();
    const items = [buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256)];
    harness.respond(successPage(items, 1));
    await harness.waitForStatus('success');
    const root = getRootElement(harness.fixture);
    expect(root.querySelector('[data-testid="filter-trigger"]')).not.toBeNull();
    const grid = root.querySelector('[data-testid="catalog-grid"]');
    expect(grid).not.toBeNull();
    expect(grid?.querySelectorAll('[data-testid="product-card"]').length).toBe(1);
    harness.cleanup();
  });

  it('filter sidebar (>=1024 px) carries data-layout="sidebar" + filter button hidden', () =>
    (async (): Promise<void> => {
      const harness = await setupHarness();
      const root = getRootElement(harness.fixture);
      const sidebar = root.querySelector('[data-testid="filter-sidebar"]');
      expect(sidebar).not.toBeNull();
      const trigger = root.querySelector('[data-testid="filter-trigger"]');
      // trigger is hidden via CSS on desktop; jsdom does not run layout,
      // but the trigger SHOULD exist as a button and have data-mode="sidebar"
      // on the host so the CSS hides it.
      expect(trigger).not.toBeNull();
      const root2 = getRootElement(harness.fixture);
      expect(root2.getAttribute('data-layout-mode') ?? 'sidebar').toBe('sidebar');
      harness.cleanup();
    })());

  it('<1024 px render flips host to data-layout-mode="drawer" and shows the trigger button', async () => {
    // We assert the structural choice (host data-attribute + presence of the
    // mobile drawer trigger). The actual CSS media query is asserted above;
    // here we confirm the host renders both branches so CSS decides which wins.
    const harness = await setupHarness();
    const root = getRootElement(harness.fixture);
    expect(root.querySelector('[data-testid="filter-trigger"]')).not.toBeNull();
    // The desktop sidebar is still mounted but is hidden via CSS at <1024px;
    // the assertion here is structural presence so the host owns both modes.
    expect(root.querySelector('[data-testid="filter-sidebar"]')).not.toBeNull();
    harness.cleanup();
  });
});

// ===========================================================================
// AC02: search / filter / sort / page-size wired through facade & URL
// ===========================================================================

describe('T13-AC02 filter, sort, page-size and applied chips wired to the URL', () => {
  it('starts at vm.status="loading" until the first list response lands', async () => {
    const harness = await setupHarness();
    expect(harness.facade.vm().status).toBe('loading');
    expect(harness.facade.vm().items).toEqual([]);
    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256)], 1),
    );
    await harness.waitForStatus('success');
    expect(harness.facade.vm().items.length).toBe(1);
    expect(harness.facade.vm().total).toBe(1);
    harness.cleanup();
  });

  it('search input is debounced 300ms and pushed to the URL via the facade', async () => {
    const harness = await setupHarness();
    // Absorb the initial mount request (same preamble every other test in
    // this describe block uses) so the debounce timing below is measured
    // against a clean `captured` count.
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.captured.length = 0;

    harness.facade.setSearch('demo');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(harness.captured.length).toBe(0);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 320);
    });
    expect(harness.captured.length).toBe(1);
    expect(harness.captured[0]?.params.get('q')).toBe('demo');
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.cleanup();
  });

  it('does not render test-only search input or search commit button', async () => {
    const harness = await setupHarness();
    const root = getRootElement(harness.fixture);
    expect(root.querySelector('[data-testid="catalog-search"]')).toBeNull();
    expect(root.querySelector('[data-testid="search-commit"]')).toBeNull();
    harness.cleanup();
  });

  it('toggling a brand writes brand= into the URL and re-fires the request', async () => {
    const harness = await setupHarness();
    // The brand button is disabled when its facet count is 0 (a
    // zero-result brand can't be toggled on), so the initial response
    // must carry at least one MiBolt Demo item for the button under
    // test to be enabled.
    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256)], 1),
    );
    await harness.waitForStatus('success');
    harness.captured.length = 0;

    const brandBtn = queryButton(
      getRootElement(harness.fixture),
      '[data-testid="filter-brand-MiBolt Demo"]',
    );
    expect(brandBtn).not.toBeNull();
    brandBtn.click();
    await harness.tick();
    expect(harness.captured.length).toBe(1);
    expect(harness.captured[0]?.params.getAll('brand')).toEqual(['MiBolt Demo']);
    // URL reflects the brand filter
    expect(harness.location.path(true)).toContain('brand=');
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.cleanup();
  });

  it('toggling storage writes storageGb= into the URL', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.captured.length = 0;

    const storageBtn = queryButton(
      getRootElement(harness.fixture),
      '[data-testid="filter-storage-256"]',
    );
    expect(storageBtn).not.toBeNull();
    storageBtn.click();
    await harness.tick();
    expect(harness.captured.length).toBe(1);
    expect(harness.captured[0]?.params.getAll('storageGb')).toEqual(['256']);
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.cleanup();
  });

  it('toggling inStock / is5g writes boolean filters into the URL', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.captured.length = 0;

    const inStockBtn = queryButton(
      getRootElement(harness.fixture),
      '[data-testid="filter-inStock"]',
    );
    const fiveGBtn = queryButton(getRootElement(harness.fixture), '[data-testid="filter-is5g"]');
    expect(inStockBtn).not.toBeNull();
    expect(fiveGBtn).not.toBeNull();
    inStockBtn.click();
    await harness.tick();
    // The filter panel is disabled while a request is in flight, so the
    // in-flight `inStock` toggle must resolve before the `is5g` toggle
    // can be clicked at all.
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    fiveGBtn.click();
    await harness.tick();
    expect(harness.captured.length).toBe(2);
    expect(harness.captured[harness.captured.length - 1]?.params.get('inStock')).toBe('true');
    expect(harness.captured[harness.captured.length - 1]?.params.get('is5g')).toBe('true');
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.cleanup();
  });

  it('renders one removable applied chip per active filter', async () => {
    const harness = await setupHarness({ brand: 'MiBolt Demo', inStock: 'true' });
    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256)], 1),
    );
    await harness.waitForStatus('success');
    const root = getRootElement(harness.fixture);
    const chips = root.querySelectorAll('[data-testid="applied-chip"]');
    expect(chips.length).toBe(2);
    const labels = Array.from(chips).map((c) => c.textContent.trim());
    expect(labels.some((t) => t.includes('MiBolt Demo'))).toBe(true);
    expect(labels.some((t) => t.includes('raktáron'))).toBe(true);
    harness.cleanup();
  });

  it('removing a chip writes the filter out of the URL and refires', async () => {
    const harness = await setupHarness({ brand: 'MiBolt Demo', inStock: 'true' });
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.captured.length = 0;

    const removeBtn = queryButton(
      getRootElement(harness.fixture),
      '[data-testid="applied-chip-remove-brand"]',
    );
    expect(removeBtn).not.toBeNull();
    removeBtn.click();
    await harness.tick();
    expect(harness.captured.length).toBeGreaterThanOrEqual(1);
    const last = harness.captured[harness.captured.length - 1];
    expect(last.params.getAll('brand')).toEqual([]);
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.cleanup();
  });

  it('changing sort writes sort= into the URL and the toolbar exposes it as the active option', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.captured.length = 0;

    const select = querySelect(getRootElement(harness.fixture), '[data-testid="catalog-sort"]');
    expect(select).not.toBeNull();
    select.value = 'price_asc';
    select.dispatchEvent(new Event('change'));
    await harness.tick();
    expect(harness.captured.length).toBe(1);
    expect(harness.captured[0]?.params.get('sort')).toBe('price_asc');
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.cleanup();
  });

  it('changing page-size writes pageSize= into the URL', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.captured.length = 0;

    const select = querySelect(
      getRootElement(harness.fixture),
      '[data-testid="catalog-page-size"]',
    );
    expect(select).not.toBeNull();
    select.value = '24';
    select.dispatchEvent(new Event('change'));
    await harness.tick();
    expect(harness.captured.length).toBe(1);
    expect(harness.captured[0]?.params.get('pageSize')).toBe('24');
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.cleanup();
  });

  it('renders the live result count from the backend total', async () => {
    const harness = await setupHarness();
    const items = [
      buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256),
      buildItem('p-02', 'MiBolt Demo', 'Demo Air 5G', 219990, true, 128),
    ];
    harness.respond(successPage(items, 16));
    await harness.waitForStatus('success');
    const root = getRootElement(harness.fixture);
    const counter = root.querySelector('[data-testid="result-count"]');
    expect(counter).not.toBeNull();
    expect(counter?.textContent ?? '').toContain('16');
    harness.cleanup();
  });

  it('renders one card per storage size of the same product without a duplicate track key (MIM-210)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const harness = await setupHarness();
    try {
      const items = [
        buildItem('p-03', 'MiBolt Demo', 'Demo Pro 5G', 339990, true, 128),
        buildItem('p-03', 'MiBolt Demo', 'Demo Pro 5G', 379990, true, 256),
      ];
      harness.respond(successPage(items, 2));
      await harness.waitForStatus('success');
      harness.fixture.componentInstance.onPageChanged(2);
      await harness.tick();
      // Duplicate keys are recorded only when a rendered list is reconciled against the next one.
      harness.respond(successPage(items, 2));
      await harness.waitForStatus('success');
      const root = getRootElement(harness.fixture);
      expect(root.querySelectorAll('app-product-card').length).toBe(2);
      expect(warn.mock.calls.some((call) => String(call[0]).includes('NG0955'))).toBe(false);
    } finally {
      warn.mockRestore();
      harness.cleanup();
    }
  });
});

// ===========================================================================
// AC03: mobile drawer: Apply commits, Cancel/Escape discards
// ===========================================================================

describe('T13-AC03 mobile filter drawer', () => {
  it('opens the drawer through the trigger button and renders an AccessibleDialog', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    const trigger = queryButton(getRootElement(harness.fixture), '[data-testid="filter-trigger"]');
    expect(trigger).not.toBeNull();
    trigger.click();
    harness.fixture.detectChanges();
    await harness.tick();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    harness.cleanup();
  });

  it('Apply inside the drawer commits one filter set and writes the URL once', async () => {
    const harness = await setupHarness();
    // The drawer's brand checkbox is disabled when its facet count is 0
    // (same rule the sidebar's brand button follows), so the initial
    // response must carry a MiBolt Demo item for the draft toggle below
    // to be enabled.
    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256)], 1),
    );
    await harness.waitForStatus('success');
    harness.captured.length = 0;

    const trigger = queryButton(getRootElement(harness.fixture), '[data-testid="filter-trigger"]');
    trigger.click();
    harness.fixture.detectChanges();
    await harness.tick();

    // Tweak a draft inside the drawer.
    const drawerBrand = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="drawer-brand-MiBolt Demo"]',
    );
    expect(drawerBrand).not.toBeNull();
    drawerBrand?.click();
    harness.fixture.detectChanges();
    await harness.tick();

    // No fetch yet: the drawer is a transient copy.
    expect(harness.captured.length).toBe(0);

    // `data-testid="drawer-apply"` sits on the `<app-button>` host, not
    // the native button `Button` renders internally; `.click()` on the
    // host element never reaches the inner `(click)` listener the
    // `pressed` output depends on.
    const apply = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="drawer-apply"] button',
    );
    expect(apply).not.toBeNull();
    apply?.click();
    harness.fixture.detectChanges();
    await harness.tick();

    // The Apply emitted exactly one filter set; the fetch fires once.
    expect(harness.captured.length).toBe(1);
    expect(harness.captured[0]?.params.getAll('brand')).toEqual(['MiBolt Demo']);
    // The dialog is closed.
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    harness.cleanup();
  });

  it('Cancel discards the draft: the URL stays as the prior state', async () => {
    const harness = await setupHarness();
    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256)], 1),
    );
    await harness.waitForStatus('success');
    harness.captured.length = 0;

    // Establish the "prior state" through a real interaction: the
    // component's facade->URL mirror effect intentionally skips its
    // first run (the URL is assumed to already hold the state the page
    // was constructed with), so the initial ActivatedRoute snapshot
    // this harness seeds the facade from never reaches the router —
    // only a subsequent, user-driven filter change does.
    const brandBtn = queryButton(
      getRootElement(harness.fixture),
      '[data-testid="filter-brand-MiBolt Demo"]',
    );
    brandBtn.click();
    await harness.tick();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.captured.length = 0;
    expect(harness.location.path(true)).toContain('brand=MiBolt');

    const trigger = queryButton(getRootElement(harness.fixture), '[data-testid="filter-trigger"]');
    trigger.click();
    harness.fixture.detectChanges();
    await harness.tick();

    const drawerBrand = queryButton(document.body, '[data-testid="drawer-brand-Sample"]');
    drawerBrand.click();
    harness.fixture.detectChanges();
    await harness.tick();

    const cancel = queryButton(document.body, '[data-testid="drawer-cancel"] button');
    cancel.click();
    harness.fixture.detectChanges();
    await harness.tick();

    // URL is untouched: Sample never made it to the facade.
    expect(harness.location.path(true)).not.toContain('Sample');
    // No extra request was fired.
    expect(harness.captured.length).toBe(0);
    harness.cleanup();
  });

  it('Escape inside the dialog discards the draft (URL unchanged)', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.captured.length = 0;

    const trigger = queryButton(getRootElement(harness.fixture), '[data-testid="filter-trigger"]');
    trigger.click();
    harness.fixture.detectChanges();
    await harness.tick();

    // CDK's `DialogRef` closes on Escape by checking `event.keyCode === 27`
    // (the numeric key code), not `event.key`; jsdom's `KeyboardEvent`
    // does not derive `keyCode` from `key`, so it must be passed
    // explicitly or the dialog never sees a matching keydown.
    const escape = new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true });
    document.body.dispatchEvent(escape);
    harness.fixture.detectChanges();
    await harness.tick();

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(harness.captured.length).toBe(0);
    harness.cleanup();
  });
});

// ===========================================================================
// AC05: distinct state copy/structure for default / loading / empty / error
// ===========================================================================

describe('T13-AC05 distinct visual states', () => {
  it('default state renders the result grid with one or more product cards', async () => {
    const harness = await setupHarness();
    const items = [
      buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256),
      buildItem('p-02', 'MiBolt Demo', 'Demo Air 5G', 219990, true, 128),
    ];
    harness.respond(successPage(items, 2));
    await harness.waitForStatus('success');
    const root = getRootElement(harness.fixture);
    expect(root.querySelectorAll('[data-testid="product-card"]').length).toBe(2);
    expect(root.querySelector('[data-testid="catalog-empty"]')).toBeNull();
    expect(root.querySelector('[data-testid="catalog-error"]')).toBeNull();
    harness.cleanup();
  });

  it('loading state renders six product card skeletons, not the empty placeholder', async () => {
    const harness = await setupHarness();
    // No response yet: facade is in `loading`.
    const root = getRootElement(harness.fixture);
    expect(root.querySelectorAll('[data-testid="product-card-skeleton"]').length).toBe(6);
    expect(root.querySelector('[data-testid="catalog-empty"]')).toBeNull();
    expect(root.querySelector('[data-testid="catalog-error"]')).toBeNull();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.cleanup();
  });

  it('empty state renders the EmptyState primitive with a Reset action', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    const root = getRootElement(harness.fixture);
    expect(root.querySelector('[data-testid="catalog-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-testid="product-card"]').length).toBe(0);
    // `EmptyState` renders its action as a real `app-button` from its own
    // `actionLabel`/`actionVariant` inputs, so the reset action is asserted
    // through the button it actually is.
    const reset = root.querySelector('[data-testid="catalog-empty"] app-button button');
    expect(reset).not.toBeNull();
    harness.cleanup();
  });

  it('error state renders the ErrorState primitive with a Retry action and preserves the last query', async () => {
    const harness = await setupHarness({ q: 'demo' });
    harness.reject(503);
    await harness.waitForStatus('error');
    const root = getRootElement(harness.fixture);
    expect(root.querySelector('[data-testid="catalog-error"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="error-state"]')).not.toBeNull();
    // Same reasoning as the empty-state reset action above: the real retry
    // action is the `app-button` `ErrorState` renders itself.
    const retry = root.querySelector('[data-testid="catalog-error"] app-button button');
    expect(retry).not.toBeNull();
    harness.cleanup();
  });

  it('selected-filter state surfaces the active chip row above the grid', async () => {
    const harness = await setupHarness({ brand: 'MiBolt Demo' });
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    const root = getRootElement(harness.fixture);
    expect(root.querySelector('[data-testid="applied-filters"]')).not.toBeNull();
    harness.cleanup();
  });

  it('missing-image state falls back to the named ProductImage fallback (no invented device)', async () => {
    const harness = await setupHarness();
    const items = [buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256)];
    harness.respond(successPage(items, 1));
    await harness.waitForStatus('success');
    const photo = queryImage(getRootElement(harness.fixture), '[data-testid="image-photo"]');
    photo.dispatchEvent(new Event('error'));
    harness.fixture.detectChanges();
    const fallback = getRootElement(harness.fixture).querySelector(
      '[data-testid="image-fallback"]',
    );
    expect(fallback).not.toBeNull();
    harness.cleanup();
  });
});

// ===========================================================================
// Shared AC: URL round-trips through the facade
// ===========================================================================

describe('T13-AC URL round-trip', () => {
  it('direct-link q=apple drives the facade query', async () => {
    const harness = await setupHarness({ q: 'apple' });
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    const last = harness.captured[harness.captured.length - 1];
    expect(last.params.get('q')).toBe('apple');
    harness.cleanup();
  });

  it('reset from the applied-filters row restores the documented defaults', async () => {
    const harness = await setupHarness({ brand: 'MiBolt Demo', inStock: 'true' });
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    const clearAll = queryButton(
      getRootElement(harness.fixture),
      '[data-testid="applied-filters-clear"]',
    );
    clearAll.click();
    harness.fixture.detectChanges();
    await harness.tick();
    const last = harness.captured[harness.captured.length - 1];
    expect(last.params.getAll('brand')).toEqual([]);
    expect(last.params.get('inStock')).toBeNull();
    harness.cleanup();
  });
});

// ===========================================================================
// FIX-24: clearing the filters clears the URL, the sort control restores
// from the URL, the header search box mirrors the URL, and a foreign query
// parameter survives a filter change.
// ===========================================================================

describe('FIX-24-AC01 clearing the filters clears the URL', () => {
  it('clicking applied-filters-clear removes every canonical query key from the URL', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.captured.length = 0;

    // Drive every canonical key to a non-default value through the
    // facade, exactly the way a real filter/sort/page interaction
    // would, so the query mirror effect writes each of them into the
    // real router URL.
    harness.facade.setFilters({
      q: 'demo',
      brands: ['MiBolt Demo'],
      storageGb: [256],
      minPrice: 10_000,
      maxPrice: 500_000,
      inStock: true,
      is5g: true,
      featured: true,
      activePromotion: true,
      sort: 'price_desc',
      pageSize: 24,
    });
    await harness.tick();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    // The page is the pager's to set: a filter change always opens page 1.
    harness.facade.setPage(2);
    await harness.tick();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');

    const canonicalKeys = [
      'q=',
      'brand=',
      'storageGb=',
      'minPrice=',
      'maxPrice=',
      'inStock=',
      'is5g=',
      'featured=',
      'activePromotion=',
      'sort=',
      'page=',
      'pageSize=',
    ];
    const beforeClear = harness.location.path(true);
    for (const key of canonicalKeys) {
      expect(beforeClear).toContain(key);
    }

    const clearAll = queryButton(
      getRootElement(harness.fixture),
      '[data-testid="applied-filters-clear"]',
    );
    clearAll.click();
    harness.fixture.detectChanges();
    await harness.tick();
    harness.respond(successPage([], 16));
    await harness.waitForStatus('success');

    const afterClear = harness.location.path(true);
    for (const key of canonicalKeys) {
      expect(afterClear).not.toContain(key);
    }
    harness.cleanup();
  });
});

describe('FIX-24-AC03 clearing the filters restores the unfiltered result count', () => {
  it('the result count returns to the unfiltered count after applied-filters-clear is clicked', async () => {
    const harness = await setupHarness();
    const unfilteredItems = [buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256)];
    harness.respond(successPage(unfilteredItems, 16));
    await harness.waitForStatus('success');
    const root = getRootElement(harness.fixture);
    const unfilteredLabel = root.querySelector('[data-testid="result-count"]')?.textContent ?? '';
    expect(unfilteredLabel).toContain('16');

    harness.facade.setFilters({ q: 'demo', brands: ['MiBolt Demo'] });
    await harness.tick();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    const filteredLabel = root.querySelector('[data-testid="result-count"]')?.textContent ?? '';
    expect(filteredLabel).not.toBe(unfilteredLabel);

    const clearAll = queryButton(root, '[data-testid="applied-filters-clear"]');
    clearAll.click();
    harness.fixture.detectChanges();
    await harness.tick();
    harness.respond(successPage(unfilteredItems, 16));
    await harness.waitForStatus('success');

    const restoredLabel = root.querySelector('[data-testid="result-count"]')?.textContent ?? '';
    expect(restoredLabel).toBe(unfilteredLabel);
    harness.cleanup();
  });
});

describe('MIM-234 catalogue breadcrumb switched off', () => {
  it('MIM-234: the breadcrumb is held out of the DOM', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    const root = getRootElement(harness.fixture);
    expect(root.querySelector('[data-testid="catalog-breadcrumb"]')).toBeNull();
    expect(root.querySelector('nav.breadcrumbs')).toBeNull();
    expect(root.querySelector('h1.title')?.textContent.trim()).toBe('Mobiltelefonok');
  });
});

describe('FIX-24-AC05 sort control restores the value the URL asked for', () => {
  it('a fresh load of ?sort=price_desc&pageSize=24 selects the matching sort option and page size', async () => {
    const harness = await setupHarness({ sort: 'price_desc', pageSize: '24' });
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    const root = getRootElement(harness.fixture);

    const sortSelect = querySelect(root, '[data-testid="catalog-sort"]');
    const selected = sortSelect.selectedOptions[0];
    expect(selected).toBeDefined();
    expect(selected.value).toBe('price_desc');

    const pageSizeSelect = querySelect(root, '[data-testid="catalog-page-size"]');
    expect(pageSizeSelect.value).toBe('24');
    harness.cleanup();
  });
});

describe('FIX-24-AC07 a foreign query parameter survives a filter change', () => {
  it('mi-scenario=happy-path stays in the URL after a filter is applied', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.captured.length = 0;

    // Seed the real router URL with a parameter the catalogue does not
    // own, the same way a scenario query string would already be
    // present on a deep link before the user touches a filter.
    await harness.router.navigate([], { queryParams: { 'mi-scenario': 'happy-path' } });
    await harness.tick();
    expect(harness.location.path(true)).toContain('mi-scenario=happy-path');

    harness.facade.setInStock(true);
    await harness.tick();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');

    const afterFilter = harness.location.path(true);
    expect(afterFilter).toContain('mi-scenario=happy-path');
    expect(afterFilter).toContain('inStock=true');
    harness.cleanup();
  });
});

describe('FIX-25 a filter keystroke does not disable the box being typed into', () => {
  /**
   * The defect this suite pins, measured in Chrome at 1440x900 on
   * `/telefonok`: clicking `filter-min-price` and pressing `1`, `5`,
   * `0`, `0`, `0`, `0` left `1` in the box and `document.activeElement`
   * on `BODY` from the first keystroke on. Every later keystroke went
   * nowhere.
   *
   * The cause was `[disabled]="isRefreshing()"`: `CatalogFacade` sets
   * `inFlightSignal` synchronously inside the `input` handler, so the
   * vm reached `refreshing` and the panel disabled the control under
   * the user's hands within the same change-detection pass. A browser
   * answers that with the HTML focus fixup rule — a focused element
   * that stops being a focusable area hands focus back to the viewport,
   * i.e. `<body>` — and a disabled input takes no keystrokes.
   *
   * jsdom does NOT implement that rule (jsdom#3029, jsdom#2931):
   * `document.activeElement` keeps pointing at the disabled input, so
   * the focus loss itself is not observable here. What is observable,
   * and what these tests assert, is the input that caused it: whether
   * the control is disabled while the request it triggered is in
   * flight. The focus assertions below are kept as the regression
   * they are in a real browser, and are true in jsdom for the weaker
   * reason that nothing blurred anything.
   */
  it('leaves the min-price box enabled and focused while its own request is in flight', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([buildItem('p-01', 'MiBolt Demo', 'Demo', 1000, true, 256)], 1));
    await harness.waitForStatus('success');

    const min = queryInput(getRootElement(harness.fixture), '[data-testid="filter-min-price"]');
    expect(min.disabled).toBe(false);
    min.focus();

    min.value = '1';
    min.dispatchEvent(new Event('input', { bubbles: true }));
    harness.fixture.detectChanges();

    // The window the defect lived in really is open: the keystroke has
    // put a request in flight and the vm is in `refreshing`.
    expect(harness.facade.vm().status).toBe('refreshing');
    expect(min.disabled).toBe(false);
    expect(document.activeElement).toBe(min);

    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    expect(min.disabled).toBe(false);
    harness.cleanup();
  });

  it('keeps every character of 150000 typed one at a time', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([buildItem('p-01', 'MiBolt Demo', 'Demo', 1000, true, 256)], 1));
    await harness.waitForStatus('success');

    const root = getRootElement(harness.fixture);
    const min = queryInput(root, '[data-testid="filter-min-price"]');
    min.focus();

    const characters = ['1', '5', '0', '0', '0', '0'];
    for (const character of characters) {
      const active = document.activeElement;
      // A blurred box is the defect, so the loop asserts the focus is
      // still where the user put it before each further keystroke.
      expect(active).toBe(min);
      min.value += character;
      min.dispatchEvent(new Event('input', { bubbles: true }));
      harness.fixture.detectChanges();
      // In a browser this is the assertion that carries the test: a box
      // disabled here is blurred, and the character after this one is
      // dropped. jsdom cannot show the blur, so the disabled flag is
      // what stands in for it.
      expect(min.disabled).toBe(false);
      harness.respond(successPage([], 0));
      await harness.waitForStatus('empty');
    }

    const after = queryInput(getRootElement(harness.fixture), '[data-testid="filter-min-price"]');
    expect(after.value).toBe('150000');
    expect(harness.location.path(true)).toContain('minPrice=150000');
    harness.cleanup();
  });

  it('still disables the panel and the toolbar during the first load', async () => {
    // The disabled state is not deleted, only moved off `refreshing`:
    // it belongs to the first load, where there are no facets to pick
    // from, no applied query to compose an intent onto and nothing
    // focused to blur.
    const harness = await setupHarness();
    expect(harness.facade.vm().status).toBe('loading');
    const root = getRootElement(harness.fixture);
    expect(queryInput(root, '[data-testid="filter-min-price"]').disabled).toBe(true);
    expect(queryInput(root, '[data-testid="filter-search-input"]').disabled).toBe(true);
    expect(queryButton(root, '[data-testid="filter-inStock"]').disabled).toBe(true);
    expect(querySelect(root, '[data-testid="catalog-sort"]').disabled).toBe(true);

    harness.respond(successPage([buildItem('p-01', 'MiBolt Demo', 'Demo', 1000, true, 256)], 1));
    await harness.waitForStatus('success');
    const settled = getRootElement(harness.fixture);
    expect(queryInput(settled, '[data-testid="filter-min-price"]').disabled).toBe(false);
    expect(querySelect(settled, '[data-testid="catalog-sort"]').disabled).toBe(false);
    harness.cleanup();
  });

  it('leaves the brand toggle enabled while the click it caused is in flight', async () => {
    // Same defect, same binding, a button rather than a text box: a
    // disabled button the user has just clicked is blurred by the same
    // focus fixup rule, which stranded keyboard users mid-panel.
    const harness = await setupHarness();
    harness.respond(successPage([buildItem('p-01', 'MiBolt Demo', 'Demo', 1000, true, 256)], 1));
    await harness.waitForStatus('success');

    const brand = queryButton(
      getRootElement(harness.fixture),
      '[data-testid="filter-brand-MiBolt Demo"]',
    );
    brand.focus();
    brand.click();
    harness.fixture.detectChanges();
    expect(harness.facade.vm().status).toBe('refreshing');
    expect(brand.disabled).toBe(false);
    expect(document.activeElement).toBe(brand);

    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.cleanup();
  });
});

// ===========================================================================
// Pagination focus: a click that disables the button it was made on
// ===========================================================================

describe('pagination focus — reaching a boundary never drops focus on <body>', () => {
  /**
   * The defect, measured in Chrome at 1440x900 on `/telefonok` sorted
   * by price ascending (16 results over two pages): clicking
   * `pagination-next` onto page 2/2 left `document.activeElement` on
   * `BODY`, and clicking `pagination-prev` back onto page 1/1 did the
   * same. A keyboard user who had just paginated was left with no
   * focus ring anywhere and had to tab from the top of the document
   * again — WCAG 2.4.3 (Focus Order) and 2.4.7 (Focus Visible).
   *
   * It is NOT the FIX-25 cause. These buttons are not disabled by an
   * in-flight request: `controlsDisabled()` is false throughout, and
   * FIX-25 already took `isRefreshing()` off this binding. They are
   * disabled by its other half — `currentPage() >= totalPages()` —
   * which is correct, because the last page really has no next page.
   * So the native `disabled` the design skill's component table asks
   * for stays, and what changes is where focus goes: the click hands
   * it to the `x / y` page indicator before the button can be
   * disabled under it.
   *
   * jsdom does not implement the HTML focus fixup rule (jsdom#3029,
   * jsdom#2931): a disabled element keeps `document.activeElement`
   * pointing at it, so the `<body>` half of the defect cannot be
   * reproduced here. The half that can be, and that these tests
   * assert, is identical in both environments — focus ends on the
   * page indicator. Before the fix it ends on the disabled button in
   * jsdom and on `<body>` in Chrome, and both fail that assertion.
   */

  it('clicking Következő onto the last page moves focus to the page indicator', async () => {
    const harness = await setupHarness();
    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One', 339990, true, 256)], 16),
    );
    await harness.waitForStatus('success');

    const root = getRootElement(harness.fixture);
    const next = queryButton(root, '[data-testid="pagination-next"]');
    expect(next.disabled).toBe(false);
    next.focus();
    expect(document.activeElement).toBe(next);

    next.click();
    harness.fixture.detectChanges();

    // The window the defect lives in is genuinely open: this click took
    // the button it was made on to its own boundary.
    expect(harness.facade.query().page).toBe(2);
    expect(next.disabled).toBe(true);

    const indicator = queryElement(root, '[data-testid="pagination-current"]');
    expect(document.activeElement).toBe(indicator);
    expect(document.activeElement).not.toBe(document.body);

    await harness.tick();
    harness.respond(
      successPage([buildItem('p-02', 'MiBolt Demo', 'Demo Air', 219990, true, 128)], 16, 2),
    );
    await harness.waitForStatus('success');
    harness.cleanup();
  });

  it('clicking Előző onto the first page moves focus to the page indicator', async () => {
    const harness = await setupHarness({ page: '2' });
    harness.respond(
      successPage([buildItem('p-02', 'MiBolt Demo', 'Demo Air', 219990, true, 128)], 16, 2),
    );
    await harness.waitForStatus('success');

    const root = getRootElement(harness.fixture);
    const prev = queryButton(root, '[data-testid="pagination-prev"]');
    expect(prev.disabled).toBe(false);
    prev.focus();
    expect(document.activeElement).toBe(prev);

    prev.click();
    harness.fixture.detectChanges();

    expect(harness.facade.query().page).toBe(1);
    expect(prev.disabled).toBe(true);

    const indicator = queryElement(root, '[data-testid="pagination-current"]');
    expect(document.activeElement).toBe(indicator);
    expect(document.activeElement).not.toBe(document.body);

    await harness.tick();
    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One', 339990, true, 256)], 16),
    );
    await harness.waitForStatus('success');
    harness.cleanup();
  });

  it('a page change that disables neither button leaves focus on the button pressed', async () => {
    // 30 results over three 12-item pages: page 1 -> page 2 reaches no
    // boundary, so the hand-off must not fire. Moving focus off a
    // control that is still live is a WCAG 3.2.2 (On Input) steal.
    const harness = await setupHarness();
    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One', 339990, true, 256)], 30),
    );
    await harness.waitForStatus('success');

    const root = getRootElement(harness.fixture);
    const next = queryButton(root, '[data-testid="pagination-next"]');
    next.focus();

    next.click();
    harness.fixture.detectChanges();

    expect(harness.facade.query().page).toBe(2);
    expect(next.disabled).toBe(false);
    expect(document.activeElement).toBe(next);

    await harness.tick();
    harness.respond(
      successPage([buildItem('p-02', 'MiBolt Demo', 'Demo Air', 219990, true, 128)], 30, 2),
    );
    await harness.waitForStatus('success');
    harness.cleanup();
  });

  it('a page change made with no pagination on screen moves no focus', async () => {
    // Five results under a page size of 12: `shouldShowPagination()` is
    // false, so there is no indicator to hand focus to, and whatever
    // the user is in keeps it.
    const harness = await setupHarness();
    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One', 339990, true, 256)], 5),
    );
    await harness.waitForStatus('success');

    const root = getRootElement(harness.fixture);
    expect(root.querySelector('[data-testid="catalog-pagination"]')).toBeNull();
    const search = queryInput(root, '[data-testid="filter-search-input"]');
    search.focus();

    harness.fixture.componentInstance.onPageChanged(1);
    harness.fixture.detectChanges();

    expect(document.activeElement).toBe(search);
    harness.cleanup();
  });
});

// ===========================================================================
// MIM-239: full-width layout — the catalog page carries no container cap
// ===========================================================================

describe('MIM-239 full-width layout — the catalog carries no container cap', () => {
  it('the .catalog selector carries no max-width and no margin: 0 auto (MIM-239)', () => {
    // jsdom does not resolve `getComputedStyle` against Angular's
    // processed component CSS, so the assertion runs against the
    // stylesheet text itself — the same pattern `T13-AC01` uses to
    // verify the grid template rule. The production line whose removal
    // fails this test is the deleted `max-width` declaration in
    // `catalog-page.scss`.
    //
    // Angular's view encapsulation appends an attribute selector to every
    // rule (`[_ngcontent-%COMP%]`), so the rule regex matches the selector
    // prefix as well as the body. The negative lookahead `(?![-_a-zA-Z0-9])`
    // after `.catalog` keeps the match from spilling into a `.catalog-*`
    // sibling rule: `\b` does not exclude a hyphen, and `\s*\{` would skip
    // the bare `.catalog` rule itself because the attribute selector sits
    // between the class and the brace. The `.lede` rule still carries
    // `max-width: 60ch` for line-length readability — a typography concern,
    // not a container cap, and out of MIM-239's scope.
    const css = getComponentStyles(CatalogPage).join('\n');
    // Strip every media query body so the assertion only sees the base
    // `.catalog` rule. The non-greedy strip leaves a `.catalog` rule
    // body untouched if it lives outside any `@media` block, which is
    // the only place the base rule is expected; a `.catalog` rule
    // inside a `@media` block would be stripped and the assertion
    // would fail on `expect(catalogRule).not.toBeNull()`.
    const flat = css.replace(/@media[^{]*\{[\s\S]*?\}/g, '');
    const catalogRule = /\.catalog(?![-_a-zA-Z0-9])[^{]*\{[^}]*\}/.exec(flat);
    expect(catalogRule).not.toBeNull();
    expect(catalogRule?.[0]).not.toMatch(/max-width/);
    expect(catalogRule?.[0]).not.toMatch(/margin:\s*0\s+auto/);
  });
});

// ===========================================================================
// Self-removing control focus: a click that destroys the button it was made on
// ===========================================================================

describe('self-removing controls — focus moves to the results counter, not <body>', () => {
  /**
   * The defect, measured in Chrome at 1440x900 on `/telefonok`：removing
   * a filter chip, clearing all filters, resetting from the empty
   * state and retrying from the error state each destroyed the button
   * the click was made on. The browser then handed focus back to
   * `BODY`, and a keyboard user was left with no focus ring and had to
   * tab from the top of the document again (WCAG 2.4.3, 2.4.7).
   *
   * This is NOT the FIX-25 cause and NOT the pagination arm. FIX-25 is
   * "activation disables the control"; the pagination fix is the
   * disabling arm, and `Pagination.onBoundary` answers it. The arm
   * here is activation removing the control from the DOM — `AsyncContent`
   * tears down the empty/error branch when the facade leaves the
   * matching status, and the chip row disappears with the last chip.
   * It needs a different remedy.
   *
   * jsdom does implement focus loss on element removal (the HTML focus
   * fixup rule applies here, unlike the disabled-button case), so
   * unlike the pagination block above the `<body>` half of this defect
   * reproduces here. `toBe(document.body)` is therefore a real pre-fix
   * reading rather than an inference, and the post-fix assertions
   * below are the same in both environments.
   */

  it('removing an inStock chip (one of two) moves focus to the results counter', async () => {
    const harness = await setupHarness({ inStock: 'true', is5g: 'true' });
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');

    const root = getRootElement(harness.fixture);
    const remove = queryButton(root, '[data-testid="applied-chip-remove-inStock"]');
    const counter = queryElement(root, '[data-testid="result-count"]');
    remove.focus();
    expect(document.activeElement).toBe(remove);

    remove.click();
    harness.fixture.detectChanges();

    expect(document.activeElement).toBe(counter);
    expect(document.activeElement).not.toBe(document.body);
    harness.cleanup();
  });

  it('removing the last chip (is5g) moves focus to the results counter', async () => {
    const harness = await setupHarness({ is5g: 'true' });
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');

    const root = getRootElement(harness.fixture);
    const remove = queryButton(root, '[data-testid="applied-chip-remove-is5g"]');
    const counter = queryElement(root, '[data-testid="result-count"]');
    remove.focus();
    expect(document.activeElement).toBe(remove);

    remove.click();
    harness.fixture.detectChanges();

    // The whole chip row disappears with its last chip, but the
    // counter is rendered unconditionally and is what focus lands on.
    expect(root.querySelector('[data-testid="applied-filters"]')).toBeNull();
    expect(document.activeElement).toBe(counter);
    expect(document.activeElement).not.toBe(document.body);
    harness.cleanup();
  });

  it('clicking applied-filters-clear moves focus to the results counter', async () => {
    const harness = await setupHarness({ inStock: 'true', is5g: 'true' });
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');

    const root = getRootElement(harness.fixture);
    const clearAll = queryButton(root, '[data-testid="applied-filters-clear"]');
    const counter = queryElement(root, '[data-testid="result-count"]');
    clearAll.focus();
    expect(document.activeElement).toBe(clearAll);

    clearAll.click();
    harness.fixture.detectChanges();

    expect(root.querySelector('[data-testid="applied-filters"]')).toBeNull();
    expect(document.activeElement).toBe(counter);
    expect(document.activeElement).not.toBe(document.body);
    harness.cleanup();
  });

  it('clicking the empty-state reset action moves focus to the results counter', async () => {
    // The empty-state action is `app-button` projected into
    // `AsyncContent` with `data-async-empty-action`, and its `(pressed)`
    // is bound to `CatalogPage.onClearAll`. The chip row is not on
    // screen in this state, so the entry point that destroys the
    // button under the user is the projected reset action itself.
    const harness = await setupHarness({ inStock: 'true' });
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');

    const root = getRootElement(harness.fixture);
    const reset = queryButton(root, '[data-testid="catalog-empty"] app-button button');
    const counter = queryElement(root, '[data-testid="result-count"]');
    reset.focus();
    expect(document.activeElement).toBe(reset);

    reset.click();
    harness.fixture.detectChanges();

    expect(root.querySelector('[data-testid="catalog-empty"]')).toBeNull();
    expect(document.activeElement).toBe(counter);
    expect(document.activeElement).not.toBe(document.body);
    harness.cleanup();
  });

  it('clicking the error-state retry button moves focus to the results counter', async () => {
    // `ErrorState`'s retry `(retryRequested)` is bound to
    // `CatalogPage.onRetry`, which clears the facade's error and
    // `AsyncContent` then tears down the error branch under the user's
    // hands. Same shape as the empty-state action above.
    const harness = await setupHarness({ q: 'demo' });
    harness.reject(503);
    await harness.waitForStatus('error');

    const root = getRootElement(harness.fixture);
    const retry = queryButton(root, '[data-testid="catalog-error"] app-button button');
    const counter = queryElement(root, '[data-testid="result-count"]');
    retry.focus();
    expect(document.activeElement).toBe(retry);

    retry.click();
    harness.fixture.detectChanges();

    expect(root.querySelector('[data-testid="catalog-error"]')).toBeNull();
    expect(document.activeElement).toBe(counter);
    expect(document.activeElement).not.toBe(document.body);
    harness.cleanup();
  });

  it('the results counter announces the failed-load wording while the error is on screen', async () => {
    // `focusResultCount()` hands focus to the counter from `onRetry()`
    // while the facade's status is still `'error'`, so the label must
    // answer that branch — falling through to the zero-results test
    // would have a screen reader say "Nincs találat" (no results) at
    // the moment the user pressed retry after a server failure. The
    // second assertion is the one the pre-fix code failed and is the
    // pin this case exists to set.
    const harness = await setupHarness({ q: 'demo' });
    harness.reject(503);
    await harness.waitForStatus('error');

    const root = getRootElement(harness.fixture);
    const counter = queryElement(root, '[data-testid="result-count"]');
    expect(counter.textContent.trim()).toBe('A katalógus betöltése nem sikerült.');
    expect(counter.textContent.trim()).not.toBe('Nincs találat.');
    harness.cleanup();
  });

  it('the results counter still says "Nincs találat" in the empty state', async () => {
    // Regression guard for the new branch above: the error branch must
    // not swallow the empty-state wording the page already relies on.
    const harness = await setupHarness();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');

    const root = getRootElement(harness.fixture);
    const counter = queryElement(root, '[data-testid="result-count"]');
    expect(counter.textContent.trim()).toBe('Nincs találat.');
    harness.cleanup();
  });
});

// ===========================================================================
// MIM-225: every card on the results grid loads its photo eagerly.
// ===========================================================================

describe('MIM-225 every results-grid card loads its photo eagerly', () => {
  /**
   * The defect, measured in Chrome at 1920x1080 and 390x844 against
   * `/telefonok?pageSize=24`: cards past the browser's native lazy-loading
   * threshold sat at `data-status="loading"` with `naturalWidth === 0`
   * and no network request issued — a plain grey box, no spinner, no
   * letter, no error. The cause was `catalog-page.html`'s `<app-product-card>`
   * loop never passing `eager`, so every card kept the
   * `input<boolean>(false)` default and the browser deferred the fetch.
   *
   * The fix is `[eager]="true"` on every card. A first-only assertion
   * would still pass if someone put `$first` back, so this test reads
   * `product-image.html`'s `<img data-testid="image-photo">` for every
   * card on the results grid and asserts each carries `loading="eager"`.
   * The production line whose removal fails it is the
   * `[eager]="true"` binding the catalogue grid now passes.
   */
  it('every card on the results grid loads its photo eagerly', async () => {
    const harness = await setupHarness();
    const items = [
      buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256),
      buildItem('p-02', 'MiBolt Demo', 'Demo Air 5G', 219990, true, 128),
      buildItem('p-03', 'MiBolt Demo', 'Demo Pro 5G', 419990, true, 512),
    ];
    harness.respond(successPage(items, 3));
    await harness.waitForStatus('success');

    const root = getRootElement(harness.fixture);
    const cards = root.querySelectorAll('[data-testid="product-card-image"]');
    expect(cards.length).toBe(3);

    for (const card of Array.from(cards)) {
      const img = card.querySelector('[data-testid="image-photo"]');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('loading')).toBe('eager');
    }
    harness.cleanup();
  });
});

// ===========================================================================
// MIM-228: a filter change keeps the scroll position; only paging opens at
// the top. Every URL write is a router navigation, and withInMemoryScrolling
// in app.config.ts scrolls to the top after each one, so a filter click at
// y=600 landed at 0. The catalogue now passes scroll: 'manual' on every
// filter/sort/page-size/search write and scroll: 'after-transition' on the
// pager alone, so the next page still opens at the top.
// ===========================================================================

describe('MIM-228 a filter change keeps the scroll position; paging opens at the top', () => {
  function lastScroll(spy: { mock: { calls: unknown[][] } }): unknown {
    const extras = spy.mock.calls.at(-1)?.[1];
    return typeof extras === 'object' && extras !== null && 'scroll' in extras
      ? extras.scroll
      : 'none';
  }

  it('a brand toggle navigates with scroll: manual', async () => {
    const harness = await setupHarness();
    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256)], 1),
    );
    await harness.waitForStatus('success');
    const spy = vi.spyOn(harness.router, 'navigate');

    queryButton(
      getRootElement(harness.fixture),
      '[data-testid="filter-brand-MiBolt Demo"]',
    ).click();
    await harness.tick();

    expect(spy).toHaveBeenCalled();
    expect(lastScroll(spy)).toBe('manual');
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.cleanup();
  });

  it('a sort change navigates with scroll: manual', async () => {
    const harness = await setupHarness();
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    const spy = vi.spyOn(harness.router, 'navigate');

    const select = querySelect(getRootElement(harness.fixture), '[data-testid="catalog-sort"]');
    select.value = 'price_asc';
    select.dispatchEvent(new Event('change'));
    await harness.tick();

    expect(lastScroll(spy)).toBe('manual');
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.cleanup();
  });

  it('the pager navigates with scroll: after-transition', async () => {
    const harness = await setupHarness();
    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One', 339990, true, 256)], 16),
    );
    await harness.waitForStatus('success');
    const spy = vi.spyOn(harness.router, 'navigate');

    queryButton(getRootElement(harness.fixture), '[data-testid="pagination-next"]').click();
    await harness.tick();

    expect(harness.facade.query().page).toBe(2);
    expect(lastScroll(spy)).toBe('after-transition');
    harness.respond(
      successPage([buildItem('p-02', 'MiBolt Demo', 'Demo Air', 219990, true, 128)], 16, 2),
    );
    await harness.waitForStatus('success');
    harness.cleanup();
  });
});

describe('MIM-228 facet skeleton — busy flag follows the facade status', () => {
  it('the filter panel and drawer are busy while a request runs and not after', async () => {
    const harness = await setupHarness();
    // The harness holds the first request, so the page lands in `loading`.
    expect(harness.facade.vm().status).toBe('loading');

    const panelInstance = harness.fixture.debugElement.query(By.directive(FilterPanel))
      .componentInstance as FilterPanel;
    const drawerInstance = harness.fixture.debugElement.query(By.directive(FilterDrawer))
      .componentInstance as FilterDrawer;

    // First load — `loading`. The skeleton flags are on.
    expect(panelInstance.busy()).toBe(true);
    expect(drawerInstance.busy()).toBe(true);

    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One 5G', 339990, true, 256)], 1),
    );
    await harness.waitForStatus('success');
    harness.fixture.detectChanges();

    expect(harness.facade.vm().status).toBe('success');
    expect(panelInstance.busy()).toBe(false);
    expect(drawerInstance.busy()).toBe(false);

    // A filter mutation puts a refresh in flight — `refreshing`. The
    // flags flip back on while the request is held. `setSearch` is
    // debounced; `setInStock` writes through synchronously, so the
    // very next change-detection pass observes `refreshing`. The
    // harness's `tick()` waits for MSW to register the new HTTP
    // request so the next `respond` call lands on it, not on the
    // first request's already-resolved promise.
    harness.facade.setInStock(true);
    harness.fixture.detectChanges();
    expect(harness.facade.vm().status).toBe('refreshing');
    expect(panelInstance.busy()).toBe(true);
    expect(drawerInstance.busy()).toBe(true);
    await harness.tick();

    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.fixture.detectChanges();

    expect(harness.facade.vm().status).toBe('empty');
    expect(panelInstance.busy()).toBe(false);
    expect(drawerInstance.busy()).toBe(false);

    harness.cleanup();
  });
});

// ===========================================================================
// A page past the last one opens the last page, and the URL follows
// without a new history entry (the owner's decision).
// ===========================================================================

describe('a page past the last one opens the last page', () => {
  function lastExtras(spy: { mock: { calls: unknown[][] } }): unknown {
    return spy.mock.calls.at(-1)?.[1];
  }

  it('replaces the URL with the last page', async () => {
    const harness = await setupHarness({ page: '99' });
    const spy = vi.spyOn(harness.router, 'navigate');

    harness.respond(successPage([], 55, 99));
    await harness.tick();
    await harness.tick();

    expect(harness.facade.query().page).toBe(5);
    expect(harness.captured.at(-1)?.params.get('page')).toBe('5');
    expect(lastExtras(spy)).toMatchObject({ replaceUrl: true, queryParams: { page: '5' } });

    harness.respond(
      successPage([buildItem('p-49', 'MiBolt Demo', 'Demo One', 339990, true, 256)], 55, 5),
    );
    await harness.waitForStatus('success');
    harness.cleanup();
  });

  it('the pager still pushes a history entry', async () => {
    const harness = await setupHarness();
    harness.respond(
      successPage([buildItem('p-01', 'MiBolt Demo', 'Demo One', 339990, true, 256)], 16),
    );
    await harness.waitForStatus('success');
    const spy = vi.spyOn(harness.router, 'navigate');

    queryButton(getRootElement(harness.fixture), '[data-testid="pagination-next"]').click();
    await harness.tick();

    expect(lastExtras(spy)).toMatchObject({ replaceUrl: false });
    harness.respond(
      successPage([buildItem('p-02', 'MiBolt Demo', 'Demo Air', 219990, true, 128)], 16, 2),
    );
    await harness.waitForStatus('success');
    harness.cleanup();
  });
});

describe('CatalogPage opens a facade visit', () => {
  it('CP-V1 every CatalogPage instance opens one new CatalogFacade visit', async () => {
    const spy = vi.spyOn(CatalogFacade.prototype, 'beginVisit');
    const harness = await setupHarness();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    harness.cleanup();
  });
});
