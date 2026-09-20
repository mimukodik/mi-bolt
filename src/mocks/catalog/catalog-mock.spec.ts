/**
 * T06 - catalog mock + filter semantics.
 *
 * The tests run end-to-end against MSW so every line of the catalog
 * handler dispatch path is exercised. The pure predicates are also
 * covered directly so each branch of the filter / sort / facet
 * functions gets an isolated assertion.
 *
 * Each test stands up its own Repository so the demo fixture does not
 * leak between cases. The MSW Node server is shared.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import productsFixture from '../../../docs/api/fixtures/products.json';
import { buildCatalogHandlers } from '../../mocks/catalog/catalog.handlers';
import {
  DEFAULT_PAGE_SIZE,
  FACET_STORAGE_GB,
  filterProducts,
  findMatchingVariant,
  matchProduct,
  normalizeBrand,
  normalizeBrands,
  normalizeQuery,
  paginateMatches,
  parseCatalogFilter,
  sortMatches,
  type CatalogFilter,
  type ProductMatch,
} from '../../mocks/catalog/filter-products';
import { buildFacets } from '../../mocks/catalog/facets';
import type { Money, Product, Variant } from '../../mocks/repository';
import { Repository } from '../../mocks/repository';
import type { CreateHandlersOptions } from '../../mocks/create-handlers';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
  type Clock,
  type Ids,
  type ScenarioDescriptor,
} from '../../mocks/scenarios';
import { server, useMswServer } from '../../../tests/msw-server';

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

// ---------------------------------------------------------------------------
// Tiny product factories for the predicate tests
// ---------------------------------------------------------------------------

function money(amount: number): Money {
  return { amount, currency: 'HUF' };
}

function variant(
  id: string,
  price: number,
  storageGb: 128 | 256 | 512,
  availability: 'in_stock' | 'out_of_stock' = 'in_stock',
  maxQuantity = 5,
): Variant {
  return {
    id,
    colorCode: 'graphite',
    colorName: 'Grafit',
    swatchHex: '#343B43',
    storageGb,
    price: money(price),
    availability,
    maxQuantity,
    images: [
      {
        id: `${id}-front`,
        src: '/assets/products/graphite-front.webp',
        alt: 'front',
        width: 320,
        height: 400,
      },
    ],
  };
}

function product(
  id: string,
  slug: string,
  brand: string,
  name: string,
  is5g: boolean,
  variants: readonly Variant[],
  description = '',
): Product {
  return {
    id,
    slug,
    brand,
    name,
    highlights: ['demo'],
    defaultVariant: variants[0],
    is5g,
    isDemo: true,
    description,
    variants,
    specGroups: [],
  };
}

const EMPTY_FILTER: CatalogFilter = { page: 1, pageSize: DEFAULT_PAGE_SIZE };

// ---------------------------------------------------------------------------
// Pure-predicate coverage
// ---------------------------------------------------------------------------

describe('normalizeQuery / normalizeBrand(s)', () => {
  it('trims, lowercases and NFC-normalises a search string', () => {
    expect(normalizeQuery('  Demo ')).toBe('demo');
    expect(normalizeQuery('ÁRVÍZTŰRŐ')).toBe(normalizeQuery('árvíztűrő'));
    expect(normalizeQuery('   ')).toBe('');
  });

  it('normalises a single brand value', () => {
    expect(normalizeBrand('  MiBolt DEMO ')).toBe('mibolt demo');
  });

  it('drops whitespace-only entries from a brand array', () => {
    expect(normalizeBrands(['  ', 'MiBolt', '', '   Sample   '])).toEqual(['mibolt', 'sample']);
  });
});

describe('findMatchingVariant', () => {
  const p = product('p-A', 'demo-a', 'MiBolt Demo', 'Demo A', true, [
    variant('a-128', 100_000, 128),
    variant('a-256', 200_000, 256),
    variant('a-512', 300_000, 512),
  ]);

  it('returns the cheapest variant when no filter is applied', () => {
    expect(findMatchingVariant(p, EMPTY_FILTER)?.id).toBe('a-128');
  });

  it('returns null when no variant satisfies a storage filter', () => {
    expect(findMatchingVariant(p, { ...EMPTY_FILTER, storageGb: [999] })).toBeNull();
  });

  it('returns the cheapest variant inside the storage filter', () => {
    expect(findMatchingVariant(p, { ...EMPTY_FILTER, storageGb: [256, 512] })?.id).toBe('a-256');
  });

  it('rejects variants whose price is outside the inclusive range', () => {
    expect(findMatchingVariant(p, { ...EMPTY_FILTER, minPrice: 250_000 })?.id).toBe('a-512');
    expect(findMatchingVariant(p, { ...EMPTY_FILTER, maxPrice: 150_000 })?.id).toBe('a-128');
  });

  it('requires an in-stock variant when inStock=true', () => {
    const mixed = product('p-B', 'demo-b', 'MiBolt Demo', 'Demo B', true, [
      variant('b-out', 50_000, 128, 'out_of_stock', 0),
      variant('b-in', 60_000, 256, 'in_stock', 3),
    ]);
    expect(findMatchingVariant(mixed, { ...EMPTY_FILTER, inStock: true })?.id).toBe('b-in');
    // Without the inStock filter the cheapest overall variant wins.
    expect(findMatchingVariant(mixed, EMPTY_FILTER)?.id).toBe('b-out');
  });

  it('breaks ties on equal prices by variant id ascending', () => {
    const tied = product('p-C', 'demo-c', 'MiBolt Demo', 'Demo C', true, [
      variant('c-z', 100_000, 128),
      variant('c-a', 100_000, 128),
      variant('c-m', 100_000, 128),
    ]);
    expect(findMatchingVariant(tied, EMPTY_FILTER)?.id).toBe('c-a');
  });

  it('breaks ties on equal prices across products by product id then variant id', () => {
    // Two products share the cheapest matching price; the comparator
    // must first order by product id then by variant id.
    const a = product('p-A', 'a', 'BrandX', 'A', true, [variant('a-1', 100_000, 256)]);
    const b = product('p-B', 'b', 'BrandX', 'B', true, [variant('b-1', 100_000, 256)]);
    const matchB = matchProduct(b, EMPTY_FILTER, new Set());
    const matchA = matchProduct(a, EMPTY_FILTER, new Set());
    if (!matchA || !matchB) {
      throw new Error('expected matches');
    }
    const sorted = sortMatches([matchB, matchA], 'price_asc').map((m) => m.product.id);
    expect(sorted).toEqual(['p-A', 'p-B']);
  });
});

describe('matchProduct (AC01 same-variant conjunction)', () => {
  const featuredSet = new Set<string>(['demo-x']);

  it('matches q against brand and name (case-insensitive, NFC)', () => {
    const p = product('p-1', 'demo-x', 'MiBolt Demo', 'Demo X 5G', true, [
      variant('x-256', 200_000, 256),
    ]);
    expect(matchProduct(p, { ...EMPTY_FILTER, q: 'demo x' }, featuredSet)?.product.id).toBe('p-1');
    expect(matchProduct(p, { ...EMPTY_FILTER, q: 'mibolt' }, featuredSet)?.product.id).toBe('p-1');
    expect(matchProduct(p, { ...EMPTY_FILTER, q: 'nope' }, featuredSet)).toBeNull();
    // Empty q after normalize applies no filter.
    expect(matchProduct(p, { ...EMPTY_FILTER, q: '   ' }, featuredSet)?.product.id).toBe('p-1');
  });

  it('applies brand filter as OR within the facet', () => {
    const a = product('p-A', 'a', 'Alpha', 'Alpha Phone', true, [variant('a-1', 100_000, 256)]);
    const b = product('p-B', 'b', 'Beta', 'Beta Phone', true, [variant('b-1', 100_000, 256)]);
    expect(matchProduct(a, { ...EMPTY_FILTER, brands: ['alpha'] }, featuredSet)?.product.id).toBe(
      'p-A',
    );
    expect(
      matchProduct(b, { ...EMPTY_FILTER, brands: ['Alpha', 'Beta'] }, featuredSet)?.product.id,
    ).toBe('p-B');
    expect(matchProduct(a, { ...EMPTY_FILTER, brands: ['beta'] }, featuredSet)).toBeNull();
    // Empty brand array (after normalize) applies no filter.
    expect(matchProduct(a, { ...EMPTY_FILTER, brands: ['  '] }, featuredSet)?.product.id).toBe(
      'p-A',
    );
  });

  it('returns null when no single variant satisfies every across-facet condition (AC01)', () => {
    const p = product('p-AC01', 'demo-ac01', 'BrandX', 'Demo AC01', true, [
      variant('cheap-128', 250_000, 128),
      variant('mid-256', 250_000, 256),
      variant('out-512', 180_000, 512, 'out_of_stock', 0),
    ]);
    const filter: CatalogFilter = {
      ...EMPTY_FILTER,
      minPrice: 0,
      maxPrice: 200_000,
      storageGb: [128, 256],
      inStock: true,
    };
    // No in-stock variant at storage 128/256 within the price range.
    expect(matchProduct(p, filter, featuredSet)).toBeNull();

    // Replace the 256 GB variant with one inside the price range.
    const ok = product('p-AC01b', 'demo-ac01b', 'BrandX', 'Demo AC01b', true, [
      variant('cheap-128', 250_000, 128),
      variant('mid-256', 150_000, 256),
      variant('out-512', 180_000, 512, 'out_of_stock', 0),
    ]);
    const match = matchProduct(ok, filter, featuredSet);
    expect(match?.matchingVariant.id).toBe('mid-256');
  });

  it('enforces is5g and featured against the product and the featured-slug set', () => {
    const fiveG = product('p-5', 'demo-5', 'BrandX', 'Demo 5G', true, [
      variant('5-256', 100_000, 256),
    ]);
    const fourG = product('p-4', 'demo-4', 'BrandX', 'Demo 4G', false, [
      variant('4-256', 100_000, 256),
    ]);
    expect(matchProduct(fiveG, { ...EMPTY_FILTER, is5g: true }, featuredSet)?.product.id).toBe(
      'p-5',
    );
    expect(matchProduct(fourG, { ...EMPTY_FILTER, is5g: true }, featuredSet)).toBeNull();
    expect(
      matchProduct(fiveG, { ...EMPTY_FILTER, featured: true }, new Set(['demo-5']))?.product.id,
    ).toBe('p-5');
    expect(
      matchProduct(fiveG, { ...EMPTY_FILTER, featured: true }, new Set(['demo-other'])),
    ).toBeNull();
    expect(
      matchProduct(fiveG, { ...EMPTY_FILTER, featured: false }, new Set(['demo-other']))?.product
        .id,
    ).toBe('p-5');
  });
});

describe('sortMatches', () => {
  function mk(productId: string, name: string, price: number, variantId = 'v'): ProductMatch {
    const v = variant(variantId, price, 256);
    return {
      product: product(productId, `slug-${productId}`, 'BrandX', name, true, [v]),
      matchingVariant: v,
    };
  }
  const matches: ProductMatch[] = [
    mk('p-2', 'Bravo', 300, 'z'),
    mk('p-1', 'Alpha', 100, 'z'),
    mk('p-3', 'Charlie', 200, 'z'),
    mk('p-4', 'Alpha', 100, 'a'),
  ];

  it('orders price_asc by cheapest matching variant with id tie-break', () => {
    const sorted = sortMatches(matches, 'price_asc').map((m) => m.product.id);
    expect(sorted).toEqual(['p-1', 'p-4', 'p-3', 'p-2']);
  });

  it('orders price_desc by descending variant price', () => {
    const sorted = sortMatches(matches, 'price_desc').map((m) => m.product.id);
    expect(sorted).toEqual(['p-2', 'p-3', 'p-1', 'p-4']);
  });

  it('orders name_asc by product name with product id tie-break', () => {
    const sorted = sortMatches(matches, 'name_asc').map((m) => m.product.id);
    expect(sorted).toEqual(['p-1', 'p-4', 'p-2', 'p-3']);
  });

  it('uses the recommended sort (cheapest variant) by default', () => {
    const sorted = sortMatches(matches, 'recommended').map((m) => m.product.id);
    expect(sorted).toEqual(['p-1', 'p-4', 'p-3', 'p-2']);
  });

  it('returns a fresh array - the input is not mutated', () => {
    const original = matches.slice();
    sortMatches(matches, 'price_desc');
    expect(matches.map((m) => m.product.id)).toEqual(original.map((m) => m.product.id));
  });
});

describe('paginateMatches', () => {
  function mk(id: string, price = 100_000): ProductMatch {
    const v = variant(`v-${id}`, price, 256);
    return {
      product: product(id, `slug-${id}`, 'BrandX', `Name ${id}`, true, [v]),
      matchingVariant: v,
    };
  }
  const matches = Array.from({ length: 5 }, (_, i) => mk(`p-${String(i)}`));

  it('returns the requested page of items', () => {
    const page = paginateMatches(matches, 1, 12);
    expect(page.items).toHaveLength(5);
    expect(page.total).toBe(5);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(12);
  });

  it('slices the right segment for mid-range pages', () => {
    const many = Array.from({ length: 25 }, (_, i) => mk(`p-${i.toString().padStart(2, '0')}`));
    const page = paginateMatches(many, 2, 12);
    expect(page.items.map((m) => m.product.id)).toEqual([
      'p-12',
      'p-13',
      'p-14',
      'p-15',
      'p-16',
      'p-17',
      'p-18',
      'p-19',
      'p-20',
      'p-21',
      'p-22',
      'p-23',
    ]);
  });

  it('returns an empty page when the page is beyond total', () => {
    const page = paginateMatches(matches, 9, 12);
    expect(page.items).toHaveLength(0);
    expect(page.total).toBe(5);
  });

  it('returns an empty page when the input is empty', () => {
    const page = paginateMatches([], 1, 12);
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});

describe('filterProducts', () => {
  const products: Product[] = [
    product('p-1', 'demo-1', 'MiBolt Demo', 'Demo One 5G', true, [variant('1-256', 150_000, 256)]),
    product('p-2', 'demo-2', 'Sample', 'Sample Phone', true, [variant('2-256', 250_000, 256)]),
    product('p-3', 'demo-3', 'MiBolt Demo', 'Demo Pro 5G', true, [variant('3-256', 400_000, 256)]),
  ];

  it('returns every product when no filter is applied', () => {
    const out = filterProducts(products, EMPTY_FILTER, []);
    expect(out).toHaveLength(3);
  });

  it('applies featured against the supplied slug set', () => {
    const featured = filterProducts(products, { ...EMPTY_FILTER, featured: true }, ['demo-1']);
    expect(featured.map((m) => m.product.id)).toEqual(['p-1']);
    const nonFeatured = filterProducts(products, { ...EMPTY_FILTER, featured: false }, ['demo-1']);
    expect(nonFeatured.map((m) => m.product.id)).toEqual(['p-2', 'p-3']);
  });
});

// ---------------------------------------------------------------------------
// parseCatalogFilter - every error path is exercised
// ---------------------------------------------------------------------------

function paramsOf(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

describe('parseCatalogFilter happy paths', () => {
  it('returns the documented defaults', () => {
    const result = parseCatalogFilter(paramsOf(''));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.page).toBe(1);
      expect(result.value.pageSize).toBe(12);
      expect(result.value.sort).toBeUndefined();
    }
  });

  it('parses every supported query parameter', () => {
    const result = parseCatalogFilter(
      paramsOf(
        'q=demo&brand=MiBolt&brand=Sample&storageGb=128&storageGb=256&minPrice=10000&maxPrice=500000&inStock=true&is5g=true&featured=true&sort=price_desc&page=2&pageSize=24',
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.q).toBe('demo');
      expect(result.value.brands).toEqual(['MiBolt', 'Sample']);
      expect(result.value.storageGb).toEqual([128, 256]);
      expect(result.value.minPrice).toBe(10_000);
      expect(result.value.maxPrice).toBe(500_000);
      expect(result.value.inStock).toBe(true);
      expect(result.value.is5g).toBe(true);
      expect(result.value.featured).toBe(true);
      expect(result.value.sort).toBe('price_desc');
      expect(result.value.page).toBe(2);
      expect(result.value.pageSize).toBe(24);
    }
  });

  it('accepts false booleans and a recommended sort', () => {
    const result = parseCatalogFilter(
      paramsOf('inStock=false&is5g=false&featured=false&sort=recommended'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.inStock).toBe(false);
      expect(result.value.is5g).toBe(false);
      expect(result.value.featured).toBe(false);
      expect(result.value.sort).toBe('recommended');
    }
  });
});

describe('parseCatalogFilter validation errors (AC04)', () => {
  it('rejects an empty brand[] value with 400', () => {
    const result = parseCatalogFilter(paramsOf('brand='));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_BRAND');
  });

  it('rejects non-integer storageGb with 400', () => {
    const r1 = parseCatalogFilter(paramsOf('storageGb=abc'));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe('INVALID_STORAGE');

    const r2 = parseCatalogFilter(paramsOf('storageGb=999'));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('INVALID_STORAGE');
  });

  it('rejects non-integer / negative prices with 400', () => {
    const r1 = parseCatalogFilter(paramsOf('minPrice=abc'));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error.code).toBe('INVALID_PRICE');

    const r2 = parseCatalogFilter(paramsOf('minPrice=-1'));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe('INVALID_PRICE');

    const r3 = parseCatalogFilter(paramsOf('maxPrice=foo'));
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.error.code).toBe('INVALID_PRICE');

    const r4 = parseCatalogFilter(paramsOf('maxPrice=-5'));
    expect(r4.ok).toBe(false);
    if (!r4.ok) expect(r4.error.code).toBe('INVALID_PRICE');
  });

  it('rejects minPrice > maxPrice with 400', () => {
    const result = parseCatalogFilter(paramsOf('minPrice=100000&maxPrice=50000'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_PRICE');
  });

  it('rejects non-boolean values for inStock / is5g / featured', () => {
    const cases = ['inStock=foo', 'is5g=1', 'featured=yes'];
    for (const qs of cases) {
      const result = parseCatalogFilter(paramsOf(qs));
      expect(result.ok, qs).toBe(false);
      if (!result.ok) expect(result.error.code, qs).toBe('INVALID_BOOLEAN');
    }
  });

  it('rejects unknown sort modes with 400', () => {
    const result = parseCatalogFilter(paramsOf('sort=newest'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_SORT');
  });

  it('rejects non-positive or non-integer page values with 400', () => {
    const cases = ['page=abc', 'page=0', 'page=-1', 'page=1.5'];
    for (const qs of cases) {
      const result = parseCatalogFilter(paramsOf(qs));
      expect(result.ok, qs).toBe(false);
      if (!result.ok) expect(result.error.code, qs).toBe('INVALID_PAGE');
    }
  });

  it('rejects empty price values with 400', () => {
    const result = parseCatalogFilter(paramsOf('minPrice='));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_PRICE');
  });

  it('rejects pageSize values that are not 12 or 24', () => {
    const cases = ['pageSize=13', 'pageSize=abc', 'pageSize=12.5'];
    for (const qs of cases) {
      const result = parseCatalogFilter(paramsOf(qs));
      expect(result.ok, qs).toBe(false);
      if (!result.ok) expect(result.error.code, qs).toBe('INVALID_PAGE_SIZE');
    }
  });
});

// ---------------------------------------------------------------------------
// Facet coverage (AC03)
// ---------------------------------------------------------------------------

describe('buildFacets', () => {
  const products: Product[] = [
    product('p-A', 'a', 'Alpha', 'Alpha Phone', true, [
      variant('a-128', 100_000, 128),
      variant('a-256', 200_000, 256),
    ]),
    product('p-B', 'b', 'Beta', 'Beta Phone', false, [variant('b-256', 150_000, 256)]),
    product('p-C', 'c', 'Alpha', 'Alpha Plus', true, [variant('c-512', 300_000, 512)]),
  ];

  it('brand facet counts distinct products per brand without the brand filter', () => {
    const facets = buildFacets(products, { ...EMPTY_FILTER, brands: ['Alpha'] }, []);
    const brands = Object.fromEntries(facets.brands.map((f) => [f.value, f.count]));
    expect(brands['Alpha']).toBe(2);
    expect(brands['Beta']).toBe(1);
  });

  it('storage facet counts distinct products per storage without the storage filter', () => {
    const facets = buildFacets(products, { ...EMPTY_FILTER, storageGb: [256] }, []);
    const storages = Object.fromEntries(facets.storageGb.map((f) => [f.value, f.count]));
    expect(storages['128']).toBe(1); // p-A
    expect(storages['256']).toBe(2); // p-A, p-B
    expect(storages['512']).toBe(1); // p-C
    // The known-storage ordering is preserved for the documented enum.
    expect(facets.storageGb.map((f) => f.value)).toEqual(['128', '256', '512']);
  });

  it('honours an is5g filter when computing both facets', () => {
    const facets = buildFacets(products, { ...EMPTY_FILTER, is5g: true }, []);
    const brands = Object.fromEntries(facets.brands.map((f) => [f.value, f.count]));
    expect(brands['Alpha']).toBe(2);
    expect(brands['Beta']).toBeUndefined();
  });

  it('surfaces unknown storage values for forward compatibility', () => {
    const weird = [
      product('p-Q', 'q', 'BrandQ', 'BrandQ Phone', true, [
        variant('q-1024', 100_000, 1024 as 128 | 256 | 512),
      ]),
    ];
    const facets = buildFacets(weird, EMPTY_FILTER, []);
    const found = facets.storageGb.find((f) => f.value === '1024');
    expect(found?.count).toBe(1);
  });

  it('surfaces no product counts when no product survives the storage filter', () => {
    // No product has a 256 GB variant; the brand facet is empty and the
    // storage facet reports 0 for the 256 bucket while keeping the rest
    // at 0 too because no product passes filterWithoutStorage either.
    const noMatch = product('p-N', 'n', 'NoMatch', 'NoMatch Phone', true, [
      variant('n-128', 100_000, 128),
    ]);
    const facets = buildFacets([noMatch], { ...EMPTY_FILTER, storageGb: [256] }, []);
    expect(facets.brands).toEqual([]);
    // The product's 128 GB variant still passes filterWithoutStorage, so
    // the storage facet shows the 128 bucket at 1.
    const storage128 = facets.storageGb.find((f) => f.value === '128');
    expect(storage128?.count).toBe(1);
    const storage256 = facets.storageGb.find((f) => f.value === '256');
    expect(storage256?.count).toBe(0);
  });
});

describe('FACET_STORAGE_GB', () => {
  it('lists the documented storage sizes', () => {
    expect(FACET_STORAGE_GB).toEqual([128, 256, 512]);
  });
});

// ---------------------------------------------------------------------------
// MSW handler dispatch - every catalog operationId + every error path
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProduct(value: unknown): value is Product {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['slug'] === 'string' &&
    Array.isArray(value['variants'])
  );
}

function isProductArray(value: unknown): value is readonly Product[] {
  return Array.isArray(value) && value.every(isProduct);
}

interface ConfigResponse {
  providerId: string;
  featuredSlugs: string[];
  maximumLineQuantity: number;
}

function isConfigResponse(data: unknown): data is ConfigResponse {
  if (!isRecord(data)) return false;
  return (
    typeof data['providerId'] === 'string' &&
    Array.isArray(data['featuredSlugs']) &&
    typeof data['maximumLineQuantity'] === 'number'
  );
}

interface ProductItem {
  id: string;
  slug: string;
  brand: string;
  name: string;
  defaultVariant: {
    price: { amount: number };
    storageGb?: number;
    availability?: string;
  };
}

interface ProductPageResponse {
  total: number;
  page: number;
  pageSize: number;
  items: ProductItem[];
  facets: {
    brands: { value: string; count: number }[];
    storageGb: { value: string; count: number }[];
  };
}

function isProductPageResponse(data: unknown): data is ProductPageResponse {
  if (!isRecord(data)) return false;
  return (
    typeof data['total'] === 'number' && Array.isArray(data['items']) && isRecord(data['facets'])
  );
}

interface ProblemResponse {
  code: string;
  type?: string;
  fieldErrors?: { path: string; message: string }[];
}

function isProblemResponse(data: unknown): data is ProblemResponse {
  if (!isRecord(data)) return false;
  return typeof data['code'] === 'string';
}

interface ProductDetailResponse {
  slug: string;
  variants: readonly unknown[];
  specGroups: readonly unknown[];
}

function isProductDetailResponse(data: unknown): data is ProductDetailResponse {
  if (!isRecord(data)) return false;
  return (
    typeof data['slug'] === 'string' &&
    Array.isArray(data['variants']) &&
    Array.isArray(data['specGroups'])
  );
}

async function readJson<T>(response: Response, guard: (data: unknown) => data is T): Promise<T> {
  const data: unknown = await response.json();
  if (!guard(data)) {
    throw new Error('Response JSON did not match expected shape');
  }
  return data;
}

const API_ROOT = '/api/v1';
const BASE_URL = `http://localhost${API_ROOT}`;

function makeHandlerOptions(): CreateHandlersOptions {
  const scenario: ScenarioDescriptor = DEFAULT_SCENARIO;
  const ids: Ids = createDeterministicIds(scenario.seed);
  const clock: Clock = createFixedClock('2026-09-14T10:00:00.000Z');
  const repository = new Repository(scenario, ids, clock);
  // The handler file is Node-free; the statically imported fixture
  // seeds the per-test repository instead.
  const parsed: unknown = productsFixture;
  if (!isProductArray(parsed)) {
    throw new Error('Invalid products fixture');
  }
  repository.loadProducts(parsed);
  return { repository, clock, ids, scenario, apiRoot: API_ROOT };
}

beforeEach(() => {
  server.use(...buildCatalogHandlers(makeHandlerOptions()));
});

describe('catalog MSW dispatch (AC02 / AC04 / AC05)', () => {
  it('GET /api/v1/config returns the demo config (AC01 of T06)', async () => {
    const response = await fetch(`${BASE_URL}/config`);
    expect(response.status).toBe(200);
    const body = await readJson(response, isConfigResponse);
    expect(body.providerId).toBe('mi-bolt');
    expect(body.featuredSlugs).toContain('demo-one-5g');
    expect(body.maximumLineQuantity).toBe(5);
  });

  it('GET /api/v1/products returns the 16-product catalogue with default page', async () => {
    const response = await fetch(`${BASE_URL}/products`);
    expect(response.status).toBe(200);
    const body = await readJson(response, isProductPageResponse);
    expect(body.total).toBe(16);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(12);
    expect(body.items).toHaveLength(12);
    expect(body.facets.brands.length).toBeGreaterThan(0);
    expect(body.facets.storageGb.map((s) => s.value)).toEqual(['128', '256', '512']);
  });

  it('GET /api/v1/products?pageSize=24 returns 16 items in one page', async () => {
    const response = await fetch(`${BASE_URL}/products?pageSize=24`);
    expect(response.status).toBe(200);
    const body = await readJson(response, isProductPageResponse);
    expect(body.pageSize).toBe(24);
    expect(body.items).toHaveLength(16);
  });

  it('GET /api/v1/products?page=2&pageSize=12 returns the second page', async () => {
    const response = await fetch(`${BASE_URL}/products?page=2&pageSize=12`);
    expect(response.status).toBe(200);
    const body = await readJson(response, isProductPageResponse);
    expect(body.page).toBe(2);
    expect(body.items).toHaveLength(4);
  });

  it('returns the cheapest matching defaultVariant (AC02)', async () => {
    const response = await fetch(`${BASE_URL}/products?sort=price_asc`);
    expect(response.status).toBe(200);
    const body = await readJson(response, isProductPageResponse);
    const first = body.items[0];
    expect(first.id).toBeTruthy();
    // demo-go-graphite-128 is the cheapest variant (79 990 HUF).
    expect(first.defaultVariant.price.amount).toBe(79_990);
  });

  it('breaks price ties by product id (AC02)', async () => {
    // Sort by price asc. The cheapest variant wins; ties break by
    // product id. We assert the order is monotonic in (price, id).
    const response = await fetch(`${BASE_URL}/products?sort=price_asc&pageSize=24`);
    const body = await readJson(response, isProductPageResponse);
    interface Row {
      id: string;
      price: number;
    }
    const rows: Row[] = body.items.map((i) => ({
      id: i.id,
      price: i.defaultVariant.price.amount,
    }));
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      const priceUp = curr.price > prev.price;
      const priceTied = curr.price === prev.price;
      const idOrdered = curr.id.localeCompare(prev.id) >= 0;
      expect(priceUp || (priceTied && idOrdered)).toBe(true);
    }
  });

  it('sort=price_desc returns products in reverse price order', async () => {
    const response = await fetch(`${BASE_URL}/products?sort=price_desc&pageSize=24`);
    const body = await readJson(response, isProductPageResponse);
    const amounts = body.items.map((i) => i.defaultVariant.price.amount);
    const sorted = amounts.slice().sort((a, b) => b - a);
    expect(amounts).toEqual(sorted);
  });

  it('sort=name_asc returns products in alphabetical name order', async () => {
    const response = await fetch(`${BASE_URL}/products?sort=name_asc&pageSize=24`);
    const body = await readJson(response, isProductPageResponse);
    const names = body.items.map((i) => i.name);
    const sorted = names.slice().sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('sort=recommended matches price_asc + product id tie-break', async () => {
    const resA = await fetch(`${BASE_URL}/products?sort=recommended&pageSize=24`);
    const a = await readJson(resA, isProductPageResponse);
    const resB = await fetch(`${BASE_URL}/products?sort=price_asc&pageSize=24`);
    const b = await readJson(resB, isProductPageResponse);
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id));
  });

  it('repeated brand[] params are applied as OR within the facet (AC05)', async () => {
    const response = await fetch(
      `${BASE_URL}/products?brand=MiBolt%20Demo&brand=Sample&pageSize=24`,
    );
    expect(response.status).toBe(200);
    const body = await readJson(response, isProductPageResponse);
    // MiBolt Demo (7) + Sample (5) = 12 distinct products
    expect(body.total).toBe(12);
  });

  it('AC01: a single variant must satisfy every across-facet condition', async () => {
    const response = await fetch(
      `${BASE_URL}/products?minPrice=0&maxPrice=200000&storageGb=128&storageGb=256&inStock=true&pageSize=24`,
    );
    expect(response.status).toBe(200);
    const body = await readJson(response, isProductPageResponse);
    expect(body.total).toBeGreaterThan(0);
    for (const item of body.items) {
      const v = item.defaultVariant;
      expect(v.price.amount).toBeLessThanOrEqual(200_000);
      expect([128, 256]).toContain(v.storageGb);
      expect(v.availability).toBe('in_stock');
    }
  });

  it('AC03: brand facet counts are independent of the brand filter', async () => {
    const resAll = await fetch(`${BASE_URL}/products`);
    const all = await readJson(resAll, isProductPageResponse);
    const resFiltered = await fetch(`${BASE_URL}/products?brand=MiBolt%20Demo`);
    const filtered = await readJson(resFiltered, isProductPageResponse);
    const allBrands = Object.fromEntries(all.facets.brands.map((f) => [f.value, f.count]));
    const filteredBrands = Object.fromEntries(
      filtered.facets.brands.map((f) => [f.value, f.count]),
    );
    // Brand facets stay identical regardless of the active brand filter.
    expect(filteredBrands).toEqual(allBrands);
  });

  it('AC03: storage facet counts are independent of the storage filter', async () => {
    const resAll = await fetch(`${BASE_URL}/products`);
    const all = await readJson(resAll, isProductPageResponse);
    const resFiltered = await fetch(`${BASE_URL}/products?storageGb=256`);
    const filtered = await readJson(resFiltered, isProductPageResponse);
    const allStorage = Object.fromEntries(all.facets.storageGb.map((f) => [f.value, f.count]));
    const filteredStorage = Object.fromEntries(
      filtered.facets.storageGb.map((f) => [f.value, f.count]),
    );
    expect(filteredStorage).toEqual(allStorage);
  });

  it('returns 200 with empty items when brand is unknown (AC04)', async () => {
    const response = await fetch(`${BASE_URL}/products?brand=NotExisting`);
    expect(response.status).toBe(200);
    const body = await readJson(response, isProductPageResponse);
    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
  });

  it('returns 200 with empty items when the combination yields no products', async () => {
    const response = await fetch(`${BASE_URL}/products?minPrice=0&maxPrice=10`);
    expect(response.status).toBe(200);
    const body = await readJson(response, isProductPageResponse);
    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
  });

  it('returns 404 when the page is beyond the result set (AC04)', async () => {
    const response = await fetch(`${BASE_URL}/products?page=99`);
    expect(response.status).toBe(404);
    const body = await readJson(response, isProblemResponse);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.type).toBe('urn:mi-bolt:problem:not-found');
  });

  it('returns 400 for an empty brand[] value (AC04)', async () => {
    const response = await fetch(`${BASE_URL}/products?brand=`);
    expect(response.status).toBe(400);
    const body = await readJson(response, isProblemResponse);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fieldErrors?.[0]?.path).toBe('brand');
  });

  it('returns 400 for page=abc (AC04)', async () => {
    const response = await fetch(`${BASE_URL}/products?page=abc`);
    expect(response.status).toBe(400);
    const body = await readJson(response, isProblemResponse);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fieldErrors?.[0]?.path).toBe('page');
  });

  it('returns 400 for minPrice > maxPrice (AC04)', async () => {
    const response = await fetch(`${BASE_URL}/products?minPrice=100000&maxPrice=50000`);
    expect(response.status).toBe(400);
    const body = await readJson(response, isProblemResponse);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fieldErrors?.[0]?.path).toBe('minPrice');
  });

  it('returns 400 for unknown sort mode (AC04)', async () => {
    const response = await fetch(`${BASE_URL}/products?sort=newest`);
    expect(response.status).toBe(400);
    const body = await readJson(response, isProblemResponse);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fieldErrors?.[0]?.path).toBe('sort');
  });

  it('returns 400 for unsupported storage size (AC04)', async () => {
    const response = await fetch(`${BASE_URL}/products?storageGb=999`);
    expect(response.status).toBe(400);
    const body = await readJson(response, isProblemResponse);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fieldErrors?.[0]?.path).toBe('storageGb');
  });

  it('returns 400 for unsupported pageSize (AC04)', async () => {
    const response = await fetch(`${BASE_URL}/products?pageSize=13`);
    expect(response.status).toBe(400);
    const body = await readJson(response, isProblemResponse);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.fieldErrors?.[0]?.path).toBe('pageSize');
  });

  it('GET /api/v1/products/{slug} returns 200 with the full Product', async () => {
    const response = await fetch(`${BASE_URL}/products/demo-one-5g`);
    expect(response.status).toBe(200);
    const body = await readJson(response, isProductDetailResponse);
    expect(body.slug).toBe('demo-one-5g');
    expect(body.variants.length).toBeGreaterThan(0);
    expect(body.specGroups.length).toBeGreaterThan(0);
  });

  it('strips a trailing slash from the apiRoot so /products still resolves', async () => {
    // Use a trailing-slash apiRoot and confirm the handler still fires.
    const scenario = DEFAULT_SCENARIO;
    const ids = createDeterministicIds(scenario.seed);
    const clock = createFixedClock('2026-09-14T10:00:00.000Z');
    const repository = new Repository(scenario, ids, clock);
    const parsed: unknown = productsFixture;
    if (!isProductArray(parsed)) {
      throw new Error('Invalid products fixture');
    }
    repository.loadProducts(parsed);
    const handlers = buildCatalogHandlers({
      repository,
      clock,
      ids,
      scenario,
      apiRoot: API_ROOT + '/',
    });
    server.use(...handlers);
    const response = await fetch(`${BASE_URL}/config`);
    expect(response.status).toBe(200);
  });

  it('GET /api/v1/products/{slug} returns 404 for an unknown slug', async () => {
    const response = await fetch(`${BASE_URL}/products/does-not-exist`);
    expect(response.status).toBe(404);
    const body = await readJson(response, isProblemResponse);
    expect(body.code).toBe('NOT_FOUND');
  });
});

// SortMode is used as a type-only import; the type assertion at the top
// is sufficient and no runtime value is required.
