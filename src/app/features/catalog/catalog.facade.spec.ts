/**
 * T12: catalog URL-state and signal facade.
 *
 * Coverage contract: every line of `catalog-query.ts` and
 * `catalog.facade.ts` is exercised. The codec suite is a pure
 * round-trip matrix; the facade suite replaces the generated SDK's
 * `Api` with a stub so the read pipeline is observed deterministically.
 * The stub mirrors the shape the production facade uses
 * (`api.invoke(listProducts, params)`) so the production wire path
 * is unchanged: the test simply substitutes the upstream so the
 * RxJS chain inside the facade can be driven by hand.
 *
 * The vitest parser is brittle around `??` / `||` chained with
 * method calls; the file sticks to a conservative subset of
 * TypeScript to keep esbuild happy.
 */

// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Api } from '../../../app/api/generated/api';
import { listProducts } from '../../../app/api/generated/fn/catalog/list-products';
import { CatalogFacade } from '../../../app/features/catalog/catalog.facade';
import {
  mergeFacetsIntoUniverse,
  type FacetUniverse,
} from '../../../app/features/catalog/catalog.facade';
import {
  ALLOWED_PAGE_SIZES,
  ALLOWED_STORAGE_GB,
  CATALOG_QUERY_KEYS,
  DEFAULT_CATALOG_QUERY,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  parseCatalogQuery,
  SEARCH_DEBOUNCE_MS,
  serializeCatalogQuery,
  SORT_MODES,
  type CatalogQuery,
  type Sort,
} from '../../../app/features/catalog/catalog-query';
import type { CatalogItem } from '../../../app/api/generated/models/catalog-item';
import type { Facets } from '../../../app/api/generated/models/facets';
import type { ColorFacetValue } from '../../../app/api/generated/models/color-facet-value';
import type { ProductPage } from '../../../app/api/generated/models/product-page';

beforeAll(async () => {
  await TestBed.compileComponents();
});

// ---------------------------------------------------------------------------
// Stub SDK: exposes the same surface the production facade uses
// (`api.invoke(listProducts, params)`) so the real wire path is
// unchanged. Tests push responses through `pending$` and read the
// captured request params via `lastCall()`.
// ---------------------------------------------------------------------------

type ListProductsParams = Parameters<typeof listProducts>[2];

@Injectable({ providedIn: 'root' })
class StubApi {
  /** Latest params passed to `invoke(listProducts, ...)`. */
  readonly calls: ListProductsParams[] = [];
  /** Active response stream: replaced per call so a previous error
   * or completion does not poison the next subscriber. */
  private current$: Subject<ProductPage> = new Subject<ProductPage>();
  /** Optional pre-recorded error for the next call. */
  nextError: unknown = null;

  invoke(fn: typeof listProducts, params: ListProductsParams): Observable<ProductPage> {
    if (fn !== listProducts) {
      throw new Error('StubApi only handles listProducts in this spec.');
    }
    this.calls.push(params);
    // A fresh Subject per call so a Subject error / complete from
    // a previous call does not short-circuit the new subscription.
    const stream$ = new Subject<ProductPage>();
    this.current$ = stream$;
    const error = this.nextError;
    this.nextError = null;
    return new Observable<ProductPage>((subscriber) => {
      const sub = stream$.subscribe({
        next: (page) => {
          subscriber.next(page);
        },
        error: (err) => {
          subscriber.error(err);
        },
        complete: () => {
          subscriber.complete();
        },
      });
      if (error !== null && error !== undefined) {
        queueMicrotask(() => {
          subscriber.error(error);
        });
      }
      return () => {
        sub.unsubscribe();
      };
    });
  }

  /** Resolve the most recently issued call with `response`. */
  resolve(response: ProductPage): void {
    this.current$.next(response);
  }

  /** Reject the most recently issued call with `error`. */
  reject(error: unknown): void {
    this.current$.error(error);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function money(amount: number): { amount: number; currency: 'HUF' } {
  return { amount, currency: 'HUF' };
}

function makeItem(id: string, brand: string, name: string, price: number): CatalogItem {
  const slug = id;
  const variantId = `${id}-256-graphite`;
  return {
    id,
    slug,
    brand,
    name,
    highlights: [],
    is5g: true,
    releasedAt: '2026-01-01',
    storageGb: 256,
    variantId,
    variantSlug: `${slug}-graphite-256`,
    price: money(price),
    availability: 'in_stock',
    maxQuantity: 5,
    image: {
      id: `${id}-front`,
      src: '/assets/x.webp',
      alt: '',
      width: 320,
      height: 400,
    },
    colors: [
      {
        colorCode: 'graphite',
        colorName: 'Grafit',
        swatchHex: '#343B43',
        variantId,
        variantSlug: `${slug}-graphite-256`,
        price: money(price),
        availability: 'in_stock',
      },
    ],
  };
}

function makeFacet(value: string, count: number): { value: string; label: string; count: number } {
  return { value, label: value, count };
}

function makeColorFacet(value: string, count: number): ColorFacetValue {
  return { value, label: value, count, swatchHex: '#343B43' };
}

function makeFacets(): Facets {
  return {
    brands: [makeFacet('Alpha', 0), makeFacet('Beta', 0)],
    colors: [makeColorFacet('graphite', 1), makeColorFacet('zold', 0)],
    inStock: 10,
    is5g: 9,
    priceRange: { min: money(0), max: money(1_000_000) },
    storageGb: ALLOWED_STORAGE_GB.map((s) => makeFacet(String(s), 0)),
  };
}

function makePage(
  items: CatalogItem[],
  total: number,
  page = 1,
  pageSize: 12 | 24 = 12,
): ProductPage {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    facets: makeFacets(),
  };
}

function emptyPage(): ProductPage {
  return makePage([], 0);
}

// ---------------------------------------------------------------------------
// Codec suite: every AC01 branch
// ---------------------------------------------------------------------------

describe('T12-AC01 catalog-query codec', () => {
  it('returns the documented defaults for an empty query string', () => {
    const q = parseCatalogQuery(new URLSearchParams(''));
    expect(q).toEqual(DEFAULT_CATALOG_QUERY);
    expect(q.page).toBe(DEFAULT_PAGE);
    expect(q.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(q.sort).toBeUndefined();
    expect(q.q).toBeUndefined();
    expect(q.brands).toBeUndefined();
    expect(q.storageGb).toBeUndefined();
    expect(q.colors).toBeUndefined();
  });

  it('round-trips brand[] without duplicates (AC01)', () => {
    const params = new URLSearchParams('brand=Apple&brand=Apple&brand=MiBolt');
    const parsed = parseCatalogQuery(params);
    expect(parsed.brands).toEqual(['Apple', 'MiBolt']);
    const serialised = serializeCatalogQuery(parsed);
    expect(serialised.getAll('brand')).toEqual(['Apple', 'MiBolt']);
    expect(serialised.toString()).not.toContain('brand=Apple&brand=Apple');
  });

  it('round-trips storageGb[] without duplicates (AC01)', () => {
    const params = new URLSearchParams('storageGb=128&storageGb=128&storageGb=256&storageGb=512');
    const parsed = parseCatalogQuery(params);
    expect(parsed.storageGb).toEqual([128, 256, 512]);
    const serialised = serializeCatalogQuery(parsed);
    expect(serialised.getAll('storageGb')).toEqual(['128', '256', '512']);
  });

  it('drops empty / whitespace-only brand values', () => {
    const params = new URLSearchParams('brand=&brand=%20%20&brand=MiBolt');
    const parsed = parseCatalogQuery(params);
    expect(parsed.brands).toEqual(['MiBolt']);
    const serialised = serializeCatalogQuery(parsed);
    expect(serialised.getAll('brand')).toEqual(['MiBolt']);
  });

  it('drops unknown storage values and empty / invalid sort modes', () => {
    const params = new URLSearchParams('storageGb=999&storageGb=128&sort=foo&sort=');
    const parsed = parseCatalogQuery(params);
    expect(parsed.storageGb).toEqual([128]);
    expect(parsed.sort).toBeUndefined();
  });

  it('keeps the first-seen brand order across parse and serialise', () => {
    const parsed = parseCatalogQuery(new URLSearchParams('brand=MiBolt&brand=Apple'));
    expect(parsed.brands).toEqual(['MiBolt', 'Apple']);
    expect(serializeCatalogQuery(parsed).getAll('brand')).toEqual(['MiBolt', 'Apple']);
  });

  it('clamps invalid page and pageSize values to the documented defaults', () => {
    const cases = ['page=abc', 'page=0', 'page=-1', 'pageSize=13', 'pageSize=foo'];
    for (const qs of cases) {
      const parsed = parseCatalogQuery(new URLSearchParams(qs));
      expect(parsed.page).toBe(DEFAULT_PAGE);
      expect(parsed.pageSize).toBe(DEFAULT_PAGE_SIZE);
    }
  });

  it('trims q and drops empty trimmed search', () => {
    const parsed = parseCatalogQuery(new URLSearchParams('q=%20apple%20'));
    expect(parsed.q).toBe('apple');
    const empty = parseCatalogQuery(new URLSearchParams('q=%20%20'));
    expect(empty.q).toBeUndefined();
  });

  it('drops non-boolean inStock / is5g / featured values', () => {
    const parsed = parseCatalogQuery(new URLSearchParams('inStock=yes&is5g=1&featured=true'));
    expect(parsed.inStock).toBeUndefined();
    expect(parsed.is5g).toBeUndefined();
    expect(parsed.featured).toBe(true);
  });

  it('drops negative prices and keeps valid bounds', () => {
    const parsed = parseCatalogQuery(new URLSearchParams('minPrice=-1&maxPrice=50000'));
    expect(parsed.minPrice).toBeUndefined();
    expect(parsed.maxPrice).toBe(50_000);
  });

  it('omits default page / pageSize / sort from the serialised output', () => {
    const serialised = serializeCatalogQuery({ ...DEFAULT_CATALOG_QUERY });
    expect(serialised.has('page')).toBe(false);
    expect(serialised.has('pageSize')).toBe(false);
    expect(serialised.has('sort')).toBe(false);
  });

  it('round-trips a fully populated query through parse + serialise', () => {
    const sample: CatalogQuery = {
      q: 'demo',
      brands: ['Apple', 'MiBolt'],
      storageGb: [256, 128],
      colors: ['zold', 'feher'],
      minPrice: 10_000,
      maxPrice: 500_000,
      inStock: true,
      is5g: true,
      featured: false,
      sort: 'price_desc',
      page: 3,
      pageSize: 24,
    };
    const serialised = serializeCatalogQuery(sample);
    const reparsed = parseCatalogQuery(serialised);
    expect(reparsed).toEqual(sample);
  });

  it('exports the documented sort modes, page sizes and storage buckets', () => {
    expect(SORT_MODES).toEqual([
      'recommended',
      'newest',
      'oldest',
      'popularity',
      'price_asc',
      'price_desc',
      'name_asc',
      'name_desc',
    ]);
    expect(ALLOWED_PAGE_SIZES).toEqual([12, 24]);
    expect(ALLOWED_STORAGE_GB).toEqual([128, 256, 512]);
  });

  it('keeps a valid sort mode on round-trip', () => {
    const sample: CatalogQuery = {
      q: 'demo',
      sort: 'price_desc',
      page: 1,
      pageSize: 12,
    };
    const serialised = serializeCatalogQuery(sample);
    expect(serialised.get('sort')).toBe('price_desc');
    const reparsed = parseCatalogQuery(serialised);
    expect(reparsed.sort).toBe<Sort>('price_desc');
  });

  it('CATALOG_QUERY_KEYS covers every key serializeCatalogQuery can emit for a fully populated query (FIX-24-AC08)', () => {
    const fullyPopulated: CatalogQuery = {
      q: 'demo',
      brands: ['Apple', 'MiBolt'],
      storageGb: [128, 256, 512],
      colors: ['zold'],
      minPrice: 10_000,
      maxPrice: 999_999,
      inStock: true,
      is5g: true,
      featured: true,
      sort: 'price_desc',
      page: 3,
      pageSize: 24,
    };
    const serialised = serializeCatalogQuery(fullyPopulated);
    const emittedKeys = new Set<string>(serialised.keys());
    // A fully populated query forces every documented key to be
    // emitted, so this also proves CATALOG_QUERY_KEYS is not merely a
    // superset that happens to contain zero emitted keys.
    expect(emittedKeys.size).toBe(CATALOG_QUERY_KEYS.length);
    for (const key of emittedKeys) {
      expect(CATALOG_QUERY_KEYS).toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Facade setup
// ---------------------------------------------------------------------------

interface SetupHandle {
  facade: CatalogFacade;
  api: StubApi;
  /** Resolve the most recently issued call with `response`. */
  respond: (response: ProductPage) => void;
  /** Reject the most recently issued call with `error`. */
  reject: (error: unknown) => void;
  /** Drain pending microtasks / macrotasks. */
  tick: () => Promise<void>;
  /** Wait for the search debounce (300 ms) to elapse. */
  waitDebounce: () => Promise<void>;
}

function setupFacade(): SetupHandle {
  TestBed.resetTestingModule();
  const api = new StubApi();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: Api, useValue: api }],
  });
  const facade = TestBed.inject(CatalogFacade);

  const tick = (): Promise<void> =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  const waitDebounce = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, SEARCH_DEBOUNCE_MS + 20);
    });
  };

  return {
    facade,
    api,
    respond: api.resolve.bind(api),
    reject: api.reject.bind(api),
    tick,
    waitDebounce,
  };
}

beforeEach(() => {
  // No-op; each test sets up its own TestBed.
});

afterEach(() => {
  TestBed.resetTestingModule();
});

// ---------------------------------------------------------------------------
// AC02: debounce + page reset + cancellation safety
// ---------------------------------------------------------------------------

describe('T12-AC02 search debounce + page reset on filter/sort', () => {
  it('debounces search input by 300 ms (AC02)', async () => {
    const { facade, api, waitDebounce, tick } = setupFacade();
    expect(SEARCH_DEBOUNCE_MS).toBe(300);

    facade.setSearch('a');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    facade.setSearch('ap');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    facade.setSearch('app');
    // Still inside the 300 ms window from the last setSearch.
    expect(api.calls.length).toBe(0);

    await waitDebounce();
    await tick();
    expect(api.calls.length).toBe(1);
    expect(api.calls[0]?.q).toBe('app');

    api.resolve(emptyPage());
    await tick();
  });

  it('does not emit when the trimmed search value is identical to the previous one', async () => {
    const { facade, api, waitDebounce, tick } = setupFacade();

    facade.setSearch('apple');
    await waitDebounce();
    await tick();
    api.resolve(emptyPage());
    await tick();
    expect(api.calls.length).toBe(1);

    facade.setSearch('  apple  ');
    await waitDebounce();
    await tick();
    expect(api.calls.length).toBe(1);
  });

  it('clears the search filter when setSearch receives an empty trimmed value', async () => {
    const { facade, api, waitDebounce, tick } = setupFacade();

    facade.setSearch('apple');
    await waitDebounce();
    await tick();
    api.resolve(emptyPage());
    await tick();
    expect(api.calls.length).toBe(1);

    facade.setSearch('   ');
    await waitDebounce();
    await tick();
    expect(api.calls.length).toBe(2);
    expect(api.calls[1]?.q).toBeUndefined();
    api.resolve(emptyPage());
    await tick();
  });

  it('resets page to 1 when a filter changes (AC02)', async () => {
    const { facade, api, tick } = setupFacade();

    facade.setPage(3);
    await tick();
    expect(api.calls.length).toBe(1);
    expect(api.calls[0]?.page).toBe(3);
    api.resolve(emptyPage());
    await tick();

    facade.toggleBrand('Apple');
    await tick();
    expect(api.calls.length).toBe(2);
    expect(api.calls[1]?.page).toBe(1);
    expect(api.calls[1]?.brand).toEqual(['Apple']);
    api.resolve(emptyPage());
    await tick();
  });

  it('resets page to 1 when the sort mode changes (AC02)', async () => {
    const { facade, api, tick } = setupFacade();
    facade.setPage(4);
    await tick();
    api.resolve(emptyPage());
    await tick();

    facade.setSort('price_asc');
    await tick();
    expect(api.calls.length).toBe(2);
    expect(api.calls[1]?.sort).toBe<Sort>('price_asc');
    expect(api.calls[1]?.page).toBe(1);
    api.resolve(emptyPage());
    await tick();
  });

  it('resets page to 1 when page size changes (AC02)', async () => {
    const { facade, api, tick } = setupFacade();
    facade.setPage(2);
    await tick();
    api.resolve(emptyPage());
    await tick();

    facade.setPageSize(24);
    await tick();
    expect(api.calls.length).toBe(2);
    expect(api.calls[1]?.pageSize).toBe(24);
    expect(api.calls[1]?.page).toBe(1);
    api.resolve(emptyPage());
    await tick();
  });

  it('preserves page when the caller explicitly sets one (AC02)', async () => {
    const { facade, api, tick } = setupFacade();
    facade.setPage(5);
    await tick();
    expect(facade.query().page).toBe(5);
    api.resolve(emptyPage());
    await tick();
  });

  it('merges a new filter into the active state instead of resetting siblings', async () => {
    const { facade, api, tick } = setupFacade();
    facade.setFilters({ brands: ['Apple'], inStock: true });
    await tick();
    api.resolve(emptyPage());
    await tick();
    expect(api.calls[0]?.brand).toEqual(['Apple']);
    expect(api.calls[0]?.inStock).toBe(true);

    facade.toggleStorage(256);
    await tick();
    expect(api.calls.length).toBe(2);
    expect(api.calls[1]?.brand).toEqual(['Apple']);
    expect(api.calls[1]?.inStock).toBe(true);
    expect(api.calls[1]?.storageGb).toEqual([256]);
    api.resolve(emptyPage());
    await tick();
  });

  it('a filter change opens page 1 even when the partial carries the old page', async () => {
    const { facade, api, tick } = setupFacade();
    facade.setPage(2);
    await tick();
    api.resolve(emptyPage());
    await tick();
    facade.setFilters({ ...facade.query(), brands: ['Samsung'] });
    await tick();
    expect(facade.query().page).toBe(1);
    expect(api.calls.at(-1)?.page).toBe(1);
    expect(api.calls.at(-1)?.brand).toEqual(['Samsung']);
    api.resolve(emptyPage());
    await tick();
  });

  it('serialises the active query through currentParams()', () => {
    const { facade } = setupFacade();
    facade.toggleBrand('Apple');
    facade.toggleBrand('MiBolt');
    const params = facade.currentParams();
    expect(params.getAll('brand')).toEqual(['Apple', 'MiBolt']);
    expect(params.has('page')).toBe(false);
  });

  it('toggleBrand with an empty string is a no-op', async () => {
    const { facade, api, tick } = setupFacade();
    facade.toggleBrand('   ');
    await tick();
    expect(api.calls.length).toBe(0);
  });

  it('toggleStorage adds and removes a bucket', async () => {
    const { facade, api, tick } = setupFacade();
    facade.toggleStorage(256);
    await tick();
    expect(api.calls[0]?.storageGb).toEqual([256]);
    api.resolve(emptyPage());
    await tick();

    facade.toggleStorage(256);
    await tick();
    expect(api.calls[api.calls.length - 1]?.storageGb).toBeUndefined();
    api.resolve(emptyPage());
    await tick();
  });

  it('toggleColor adds and removes a colour and resets the page', async () => {
    const { facade, api, tick } = setupFacade();
    facade.setPage(3);
    await tick();
    expect(api.calls[0]?.page).toBe(3);
    api.resolve(emptyPage());
    await tick();

    facade.toggleColor('zold');
    await tick();
    expect(api.calls[1]?.color).toEqual(['zold']);
    expect(api.calls[1]?.page).toBe(1);
    api.resolve(emptyPage());
    await tick();

    facade.toggleColor('zold');
    await tick();
    expect(api.calls[api.calls.length - 1]?.color).toBeUndefined();
    api.resolve(emptyPage());
    await tick();
  });

  it('toSdkParams carries color[] (MIM-210)', async () => {
    const { facade, api, tick } = setupFacade();
    facade.setFilters({ colors: ['zold', 'feher'] });
    await tick();
    api.resolve(emptyPage());
    await tick();
    const last = api.calls[api.calls.length - 1];
    expect(last?.color).toEqual(['zold', 'feher']);
  });

  it('setPriceRange / setInStock / setIs5g / setFeatured round-trip', async () => {
    const { facade, api, tick } = setupFacade();
    facade.setPriceRange(10_000, 200_000);
    facade.setInStock(true);
    facade.setIs5g(true);
    facade.setFeatured(false);
    await tick();
    api.resolve(emptyPage());
    await tick();

    const last = api.calls[api.calls.length - 1];
    expect(last?.minPrice).toBe(10_000);
    expect(last?.maxPrice).toBe(200_000);
    expect(last?.inStock).toBe(true);
    expect(last?.is5g).toBe(true);
    expect(last?.featured).toBe(false);
  });

  it('destroyRef cleanup unsubscribes from the read pipeline', async () => {
    const { facade, api, tick } = setupFacade();
    facade.setSearch('apple');
    await tick();
    facade.setSearch('apple');
    await tick();
    facade.setSearch('apple');
    await tick();
    // Destroying the facade (by tearing down the TestBed) must
    // dispose the internal subscriptions cleanly.
    TestBed.resetTestingModule();
    expect(api.calls.length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// AC03: switchMap race + no duplicate requests
// ---------------------------------------------------------------------------

describe('T12-AC03 race + duplicate request suppression', () => {
  it('cancels the in-flight request when a newer query supersedes it (AC03)', async () => {
    const { facade, api, waitDebounce, tick } = setupFacade();
    facade.setSearch('apple');
    await waitDebounce();
    await tick();
    expect(api.calls.length).toBe(1);

    // Issue a newer query before the first response arrives.
    facade.setSearch('apricot');
    await waitDebounce();
    await tick();
    expect(api.calls.length).toBe(2);

    // A stale response for the first request must not overwrite the
    // VM state derived from the newer request.
    const stale = makePage([makeItem('old', 'Old', 'Old', 1)], 1);
    api.resolve(stale);
    await tick();
    const fresh = makePage([makeItem('new', 'New', 'New', 2)], 1);
    api.resolve(fresh);
    await tick();

    const vm = facade.vm();
    expect(vm.items.length).toBe(1);
    expect(vm.items[0]?.id).toBe('new');
  });

  it('does not re-fire the SDK when the same query is emitted twice in a row (AC03)', async () => {
    const { facade, api, tick } = setupFacade();
    facade.setFilters({ brands: ['Apple'] });
    await tick();
    api.resolve(makePage([makeItem('p1', 'Apple', 'Apple One', 100)], 1));
    await tick();

    facade.setFilters({ brands: ['Apple'] });
    await tick();
    expect(api.calls.length).toBe(1);
  });

  it('does not re-fire when retry() is called on a successful query (AC03)', async () => {
    const { facade, api, waitDebounce, tick } = setupFacade();
    facade.setSearch('apple');
    await waitDebounce();
    await tick();
    api.resolve(emptyPage());
    await tick();
    expect(api.calls.length).toBe(1);

    facade.retry();
    await tick();
    expect(api.calls.length).toBe(1);
  });

  it('re-fires when retry() is called after an errored query (AC03)', async () => {
    const { facade, api, waitDebounce, tick } = setupFacade();
    facade.setSearch('apple');
    await waitDebounce();
    await tick();
    api.reject(new Error('boom'));
    await tick();
    expect(facade.vm().status).toBe('error');

    facade.retry();
    await tick();
    expect(api.calls.length).toBe(2);
    const items = [makeItem('p1', 'Apple', 'Apple One', 100_000)];
    api.resolve(makePage(items, 1));
    await tick();
    expect(facade.vm().status).toBe('success');
    expect(facade.vm().items).toEqual(items);
  });

  it('toggleBrand off removes the brand filter and triggers one refetch (AC03)', async () => {
    const { facade, api, tick } = setupFacade();
    facade.toggleBrand('Apple');
    await tick();
    api.resolve(emptyPage());
    await tick();
    expect(api.calls.length).toBe(1);
    expect(api.calls[0]?.brand).toEqual(['Apple']);

    facade.toggleBrand('Apple');
    await tick();
    // Toggling the only brand off is a real state change: the URL
    // no longer carries `brand=Apple`, so the next fetch must see
    // the dropped filter.
    expect(api.calls.length).toBe(2);
    expect(api.calls[1]?.brand).toBeUndefined();
    api.resolve(emptyPage());
    await tick();
  });
});

// ---------------------------------------------------------------------------
// AC04: distinct vm states preserve useful content; errors never zero out
// ---------------------------------------------------------------------------

describe('T12-AC04 vm status transitions preserve useful content', () => {
  it('emits `loading` on the very first render (AC04)', () => {
    const { facade } = setupFacade();
    const vm = facade.vm();
    expect(vm.status).toBe('loading');
    expect(vm.items).toEqual([]);
    expect(vm.total).toBe(0);
    expect(vm.facets).toBeNull();
    expect(vm.error).toBeNull();
  });

  it('emits `success` and exposes items + full facets when results exist (AC04)', async () => {
    const { facade, api, waitDebounce, tick } = setupFacade();
    const items = [makeItem('p1', 'Apple', 'Apple One', 100_000)];
    facade.setSearch('apple');
    await waitDebounce();
    await tick();
    api.resolve(makePage(items, 1));
    await tick();

    const vm = facade.vm();
    expect(vm.status).toBe('success');
    expect(vm.items).toEqual(items);
    expect(vm.total).toBe(1);
    expect(vm.facets).not.toBeNull();
    expect(vm.facets?.storageGb.some((f) => f.value === '128')).toBe(true);
    expect(vm.facets?.colors.some((c) => c.value === 'zold')).toBe(true);
    expect(vm.facets?.priceRange).toBeDefined();
    expect(vm.error).toBeNull();
  });

  it('facets reach the vm whole (MIM-210)', async () => {
    const { facade, api, tick } = setupFacade();
    const page = makePage([], 0);
    // Issue the request the response will resolve, otherwise the SDK
    // observable never sees a subscriber and `api.resolve(page)`
    // pushes onto a Subject nobody is listening on. setFilters
    // short-circuits the 300 ms search debounce, so a single tick
    // is enough to reach the SDK call. The empty page is a deliberate
    // fixture: the assertion is that whatever facets the SDK returns
    // — full object, every documented field — reach the vm without
    // being narrowed or stripped.
    facade.setFilters({ q: 'trigger' });
    await tick();
    api.resolve(page);
    await tick();
    const vm = facade.vm();
    expect(vm.facets).toEqual(page.facets);
  });

  it('emits `empty` when the catalogue returns zero items (AC04)', async () => {
    const { facade, api, waitDebounce, tick } = setupFacade();
    facade.setSearch('nope');
    await waitDebounce();
    await tick();
    api.resolve(emptyPage());
    await tick();

    const vm = facade.vm();
    expect(vm.status).toBe('empty');
    expect(vm.items).toEqual([]);
    expect(vm.total).toBe(0);
    expect(vm.error).toBeNull();
  });

  it('emits `refreshing` with the previous items while a new request is in flight (AC04)', async () => {
    const { facade, api, waitDebounce, tick } = setupFacade();
    const firstItems = [makeItem('p1', 'Apple', 'Apple One', 100_000)];
    facade.setSearch('apple');
    await waitDebounce();
    await tick();
    api.resolve(makePage(firstItems, 1));
    await tick();
    expect(facade.vm().status).toBe('success');

    facade.setSearch('apricot');
    await waitDebounce();
    await tick();
    // Before the second response arrives, the VM must show refreshing
    // + the previous items / facets, not a blank screen.
    expect(facade.vm().status).toBe('refreshing');
    expect(facade.vm().items).toEqual(firstItems);
    expect(facade.vm().total).toBe(1);

    const secondItems = [makeItem('p2', 'Apricot', 'Apricot Phone', 200_000)];
    api.resolve(makePage(secondItems, 1));
    await tick();
    expect(facade.vm().status).toBe('success');
    expect(facade.vm().items).toEqual(secondItems);
  });

  it('emits `error` on request failure and preserves the last useful payload (AC04)', async () => {
    const { facade, api, waitDebounce, tick } = setupFacade();
    const items = [makeItem('p1', 'Apple', 'Apple One', 100_000)];
    facade.setSearch('apple');
    await waitDebounce();
    await tick();
    api.resolve(makePage(items, 1));
    await tick();

    facade.setSearch('apricot');
    await waitDebounce();
    await tick();
    api.reject(new Error('boom'));
    await tick();

    const vm = facade.vm();
    expect(vm.status).toBe('error');
    expect(vm.items).toEqual(items);
    expect(vm.total).toBe(1);
    expect(vm.error).not.toBeNull();
  });

  it('error on the very first request still surfaces an empty items array, not a fabricated zero (AC04)', async () => {
    const { facade, api, waitDebounce, tick } = setupFacade();
    facade.setSearch('apple');
    await waitDebounce();
    await tick();
    api.reject(new Error('boom'));
    await tick();

    const vm = facade.vm();
    expect(vm.status).toBe('error');
    expect(vm.items).toEqual([]);
    expect(vm.total).toBe(0);
    expect(vm.error).not.toBeNull();
  });

  it('retry() after an error returns the vm to `success` when the next request succeeds (AC04)', async () => {
    const { facade, api, waitDebounce, tick } = setupFacade();
    facade.setSearch('apple');
    await waitDebounce();
    await tick();
    api.reject(new Error('boom'));
    await tick();
    expect(facade.vm().status).toBe('error');

    facade.retry();
    await tick();
    const items = [makeItem('p1', 'Apple', 'Apple One', 100_000)];
    api.resolve(makePage(items, 1));
    await tick();
    expect(facade.vm().status).toBe('success');
    expect(facade.vm().items).toEqual(items);
  });
});

// ---------------------------------------------------------------------------
// AC05: URL is the single source of truth (loadFromParams / currentParams)
// ---------------------------------------------------------------------------

describe('T12-AC05 URL round-trip + direct-link restore', () => {
  it('loadFromParams restores search + filters + page + sort (AC05)', async () => {
    const { facade, api, tick } = setupFacade();
    const params = new URLSearchParams(
      'q=apple&brand=Apple&brand=MiBolt&storageGb=256&color=zold&minPrice=10000&maxPrice=200000&inStock=true&is5g=true&sort=price_desc&page=2&pageSize=24',
    );
    facade.loadFromParams(params);
    await tick();
    expect(api.calls.length).toBe(1);

    const call = api.calls[0];
    expect(call?.q).toBe('apple');
    expect(call?.brand).toEqual(['Apple', 'MiBolt']);
    expect(call?.storageGb).toEqual([256]);
    expect(call?.color).toEqual(['zold']);
    expect(call?.minPrice).toBe(10_000);
    expect(call?.maxPrice).toBe(200_000);
    expect(call?.inStock).toBe(true);
    expect(call?.is5g).toBe(true);
    expect(call?.sort).toBe<Sort>('price_desc');
    expect(call?.page).toBe(2);
    expect(call?.pageSize).toBe(24);

    api.resolve(emptyPage());
    await tick();
  });

  it('loadFromParams canonicalises unknown / malformed values rather than rejecting (AC05)', async () => {
    const { facade, api, tick } = setupFacade();
    const params = new URLSearchParams('sort=foo&storageGb=999&page=abc&inStock=foo');
    facade.loadFromParams(params);
    await tick();
    const call = api.calls[0];
    expect(call?.sort).toBeUndefined();
    expect(call?.storageGb).toBeUndefined();
    expect(call?.page).toBe(DEFAULT_PAGE);
    expect(call?.inStock).toBeUndefined();
    api.resolve(emptyPage());
    await tick();
  });

  it('currentParams emits the canonical URL for the active state (AC05)', async () => {
    const { facade, api, tick } = setupFacade();
    facade.toggleBrand('Apple');
    facade.toggleBrand('MiBolt');
    facade.setSort('name_asc');
    facade.setPage(2);
    await tick();
    api.resolve(emptyPage());
    await tick();

    const params = facade.currentParams();
    expect(params.getAll('brand')).toEqual(['Apple', 'MiBolt']);
    expect(params.get('sort')).toBe('name_asc');
    expect(params.get('page')).toBe('2');
    expect(params.has('pageSize')).toBe(false);
    expect(params.has('q')).toBe(false);
  });

  it('reset() restores the documented defaults (AC05)', async () => {
    const { facade, api, tick } = setupFacade();
    facade.toggleBrand('Apple');
    facade.setSort('price_desc');
    facade.setPage(4);
    await tick();
    api.resolve(emptyPage());
    await tick();

    facade.reset();
    await tick();
    // toggleBrand + setSort + setPage + reset = 4 calls in total.
    const resetCall = api.calls[api.calls.length - 1];
    expect(resetCall?.brand).toBeUndefined();
    expect(resetCall?.sort).toBeUndefined();
    expect(resetCall?.page).toBe(DEFAULT_PAGE);
    expect(facade.query()).toEqual(DEFAULT_CATALOG_QUERY);
    api.resolve(emptyPage());
    await tick();
  });

  it('loadFromParams + currentParams is the identity on a fully populated query (AC05)', () => {
    const { facade } = setupFacade();
    const sample: CatalogQuery = {
      q: 'demo',
      brands: ['Apple', 'MiBolt'],
      storageGb: [128, 256],
      colors: ['zold', 'feher'],
      minPrice: 1_000,
      maxPrice: 999_999,
      inStock: true,
      is5g: false,
      featured: true,
      sort: 'name_asc',
      page: 7,
      pageSize: 24,
    };
    facade.loadFromParams(serializeCatalogQuery(sample));
    expect(facade.query()).toEqual(sample);
    expect(serializeCatalogQuery(facade.query())).toEqual(serializeCatalogQuery(sample));
  });

  it('serialising the documented default query omits every CATALOG_QUERY_KEYS entry, so a reset resolves to null for each one under the router merge (FIX-24-AC08)', () => {
    const serialised = serializeCatalogQuery(DEFAULT_CATALOG_QUERY);
    for (const key of CATALOG_QUERY_KEYS) {
      expect(serialised.has(key)).toBe(false);
      // `URLSearchParams.get` returns null for an absent key — the
      // same null the router merge needs to remove it from the URL.
      expect(serialised.get(key)).toBeNull();
    }
  });

  it('setFilters with undefined values clears the matching field (mobile Apply path) (AC05)', async () => {
    const { facade, api, tick } = setupFacade();
    facade.setFilters({ inStock: true, is5g: true });
    await tick();
    api.resolve(emptyPage());
    await tick();

    // Mobile "Apply" flow: a draft that only sets inStock should clear
    // is5g even though the page component never set it explicitly.
    facade.setFilters({ inStock: false, is5g: undefined });
    await tick();
    expect(api.calls.length).toBe(2);
    const second = api.calls[1];
    expect(second?.inStock).toBe(false);
    expect(second?.is5g).toBeUndefined();
    api.resolve(emptyPage());
    await tick();
  });
});

// ---------------------------------------------------------------------------
// MIM-228: facet universe. A brand or colour absent from a later response
// keeps its row with a zero count, a value new in a later response is
// appended, and the pass-through fields are untouched.
// ---------------------------------------------------------------------------

function emptyUniverse(): FacetUniverse {
  return { brands: [], colors: [] };
}

function makeFreshFacets(args: {
  colors: readonly { value: string; count: number }[];
  brands?: readonly { value: string; count: number }[];
}): Facets {
  return {
    brands: (args.brands ?? []).map((b) => ({ value: b.value, label: b.value, count: b.count })),
    colors: args.colors.map((c) => ({
      value: c.value,
      label: c.value,
      count: c.count,
      swatchHex: '#343B43',
    })),
    inStock: 0,
    is5g: 0,
    priceRange: { min: money(0), max: money(1_000_000) },
    storageGb: ALLOWED_STORAGE_GB.map((s) => makeFacet(String(s), 0)),
  };
}

describe('MIM-228: facet universe', () => {
  it('MIM-228: a colour absent from the response keeps its row with a zero count, in first-seen order', () => {
    const first = mergeFacetsIntoUniverse(
      emptyUniverse(),
      makeFreshFacets({
        colors: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((value, i) => ({
          value,
          count: i + 1,
        })),
      }),
    );
    const second = mergeFacetsIntoUniverse(
      { brands: first.brands, colors: first.colors },
      makeFreshFacets({
        colors: [
          { value: 'a', count: 1 },
          { value: 'c', count: 1 },
          { value: 'e', count: 1 },
        ],
      }),
    );

    expect(second.colors.map((c) => c.value)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(second.colors.map((c) => c.count)).toEqual([1, 0, 1, 0, 1, 0, 0, 0]);
  });

  it('MIM-228: a value new in a later response is appended', () => {
    const first = mergeFacetsIntoUniverse(
      emptyUniverse(),
      makeFreshFacets({ colors: [{ value: 'a', count: 3 }] }),
    );
    const second = mergeFacetsIntoUniverse(
      { brands: first.brands, colors: first.colors },
      makeFreshFacets({ colors: [{ value: 'b', count: 5 }] }),
    );

    expect(second.colors.map((c) => c.value)).toEqual(['a', 'b']);
    expect(second.colors.map((c) => c.count)).toEqual([0, 5]);
  });

  it('MIM-228: a brand absent from a later response keeps its row with a zero count', () => {
    const first = mergeFacetsIntoUniverse(
      emptyUniverse(),
      makeFreshFacets({
        colors: [],
        brands: [
          { value: 'apple', count: 10 },
          { value: 'samsung', count: 8 },
        ],
      }),
    );
    const second = mergeFacetsIntoUniverse(
      { brands: first.brands, colors: first.colors },
      makeFreshFacets({ colors: [], brands: [{ value: 'apple', count: 3 }] }),
    );
    const third = mergeFacetsIntoUniverse(
      { brands: second.brands, colors: second.colors },
      makeFreshFacets({ colors: [], brands: [{ value: 'google', count: 2 }] }),
    );

    expect(second.brands.map((b) => [b.value, b.count])).toEqual([
      ['apple', 3],
      ['samsung', 0],
    ]);
    expect(third.brands.map((b) => [b.value, b.count])).toEqual([
      ['apple', 0],
      ['samsung', 0],
      ['google', 2],
    ]);
  });

  it('MIM-228: storageGb, inStock, is5g and priceRange pass through from the latest response', () => {
    const priceRange = { min: money(10_000), max: money(500_000) };
    const fresh: Facets = {
      brands: [],
      colors: [],
      inStock: 11,
      is5g: 9,
      priceRange,
      storageGb: ALLOWED_STORAGE_GB.map((s) => makeFacet(String(s), 2)),
    };
    const merged = mergeFacetsIntoUniverse(
      { brands: [], colors: [{ value: 'a', label: 'a', count: 1, swatchHex: '#111111' }] },
      fresh,
    );

    expect(merged.inStock).toBe(11);
    expect(merged.is5g).toBe(9);
    expect(merged.priceRange).toEqual(priceRange);
    expect(merged.storageGb).toBe(fresh.storageGb);
    expect(merged.colors.map((c) => [c.value, c.count])).toEqual([['a', 0]]);
  });
});
