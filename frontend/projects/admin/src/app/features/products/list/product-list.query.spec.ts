/**
 * MIM-350, unit F15 — codec spec for the router query.
 *
 * Pure round-trip matrix: every documented field is exercised through
 * `parse` and `serialize`, plus a junk-input pass that proves the
 * codec never throws and never returns junk. `toListParams` is the
 * wire-translation spec, asserted at the SDK type level so a
 * contract drift is caught here rather than in the data-source spec.
 */
import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRODUCT_LIST_QUERY,
  parseProductListParams,
  parseProductListQuery,
  PRODUCT_LIST_PAGE_SIZE,
  serializeProductListQuery,
  toListParams,
  type ProductListQuery,
} from './product-list.query';

describe('DEFAULT_PRODUCT_LIST_QUERY', () => {
  it('matches the documented defaults', () => {
    expect(DEFAULT_PRODUCT_LIST_QUERY).toEqual({
      q: '',
      brands: [],
      status: 'active',
      featured: false,
      outOfStock: false,
      sort: 'rank',
      direction: 'asc',
    });
  });
});

describe('PRODUCT_LIST_PAGE_SIZE', () => {
  it('is 50, the contract default', () => {
    expect(PRODUCT_LIST_PAGE_SIZE).toBe(50);
  });
});

describe('parseProductListQuery — round-trip with empty input', () => {
  it('parses an empty ParamMap to the documented defaults', () => {
    expect(parseProductListQuery(convertToParamMap({}))).toEqual(DEFAULT_PRODUCT_LIST_QUERY);
  });
});

describe('serializeProductListQuery', () => {
  it('serialises the default query to an empty Params', () => {
    expect(serializeProductListQuery(DEFAULT_PRODUCT_LIST_QUERY)).toEqual({});
  });

  it('serialises a full query: q, brand[], status, featured, outOfStock, sort, direction', () => {
    const query: ProductListQuery = {
      q: 'honor',
      brands: ['Samsung', 'Apple'],
      status: 'archived',
      featured: true,
      outOfStock: true,
      sort: 'name',
      direction: 'desc',
    };
    expect(serializeProductListQuery(query)).toEqual({
      q: 'honor',
      brand: ['Apple', 'Samsung'],
      status: 'archived',
      featured: 'true',
      outOfStock: 'true',
      sort: 'name',
      direction: 'desc',
    });
  });

  it('sorts the brand array alphabetically before emitting', () => {
    const query: ProductListQuery = { ...DEFAULT_PRODUCT_LIST_QUERY, brands: ['Zeta', 'Alpha'] };
    expect(serializeProductListQuery(query)).toEqual({ brand: ['Alpha', 'Zeta'] });
  });

  it('omits an empty brand array entirely', () => {
    const query: ProductListQuery = { ...DEFAULT_PRODUCT_LIST_QUERY, brands: [] };
    expect(serializeProductListQuery(query)).toEqual({});
  });
});

describe('parseProductListQuery — full round-trip', () => {
  it('round-trips a full query through serialize → parse', () => {
    const query: ProductListQuery = {
      q: 'honor 600',
      brands: ['Apple', 'Samsung'],
      status: 'all',
      featured: true,
      outOfStock: false,
      sort: 'releasedAt',
      direction: 'desc',
    };
    const serialised = serializeProductListQuery(query);
    const parsed = parseProductListParams(serialised);
    expect(parsed).toEqual({ ...query, outOfStock: false });
    expect(parsed.featured).toBe(true);
    expect(parsed.outOfStock).toBe(false);
  });

  it('round-trips the default query: serialise to {} parses back to the defaults', () => {
    const serialised = serializeProductListQuery(DEFAULT_PRODUCT_LIST_QUERY);
    expect(parseProductListParams(serialised)).toEqual(DEFAULT_PRODUCT_LIST_QUERY);
  });
});

describe('parseProductListQuery — junk / unknown values', () => {
  it('falls back to the defaults on unknown status, sort, direction', () => {
    const parsed = parseProductListParams({
      status: 'x',
      sort: 'price',
      direction: 'up',
    });
    expect(parsed.status).toBe(DEFAULT_PRODUCT_LIST_QUERY.status);
    expect(parsed.sort).toBe(DEFAULT_PRODUCT_LIST_QUERY.sort);
    expect(parsed.direction).toBe(DEFAULT_PRODUCT_LIST_QUERY.direction);
  });

  it('treats featured=1 and outOfStock=yes as the absent filter', () => {
    const parsed = parseProductListParams({ featured: '1', outOfStock: 'yes' });
    expect(parsed.featured).toBe(false);
    expect(parsed.outOfStock).toBe(false);
  });

  it('cleans blank and duplicate brands, then keeps the trimmed ones in first-seen order', () => {
    const parsed = parseProductListParams({
      brand: ['  Apple  ', '', 'Samsung', 'Apple', '   ', 'Honor'],
    });
    expect(parsed.brands).toEqual(['Apple', 'Samsung', 'Honor']);
  });

  it('trims a padded q', () => {
    const parsed = parseProductListParams({ q: '   honor 600   ' });
    expect(parsed.q).toBe('honor 600');
  });

  it('an empty padded q serialises to the default (omitted)', () => {
    const parsed = parseProductListParams({ q: '   ' });
    expect(parsed.q).toBe('');
    expect(serializeProductListQuery(parsed)).toEqual({});
  });
});

describe('toListParams', () => {
  it('produces the documented defaults for the default query at page 1', () => {
    const params = toListParams(DEFAULT_PRODUCT_LIST_QUERY, 1);
    expect(params).toEqual({
      status: 'active',
      sort: 'rank',
      direction: 'asc',
      page: 1,
      pageSize: 50,
    });
  });

  it('carries q, brand, featured:true and outOfStock:true when set', () => {
    const query: ProductListQuery = {
      q: 'honor',
      brands: ['Apple', 'Samsung'],
      status: 'all',
      featured: true,
      outOfStock: true,
      sort: 'minPrice',
      direction: 'desc',
    };
    const params = toListParams(query, 2);
    expect(params).toEqual({
      status: 'all',
      sort: 'minPrice',
      direction: 'desc',
      page: 2,
      pageSize: 50,
      q: 'honor',
      brand: ['Apple', 'Samsung'],
      featured: true,
      outOfStock: true,
    });
  });

  it('never carries featured:false or outOfStock:false on the wire', () => {
    const params = toListParams(
      { ...DEFAULT_PRODUCT_LIST_QUERY, featured: false, outOfStock: false },
      1,
    );
    expect(params).not.toHaveProperty('featured');
    expect(params).not.toHaveProperty('outOfStock');
  });

  it('always carries status, sort, direction, page and pageSize', () => {
    const params = toListParams({ ...DEFAULT_PRODUCT_LIST_QUERY, q: '' }, 7);
    expect(params.status).toBe('active');
    expect(params.sort).toBe('rank');
    expect(params.direction).toBe('asc');
    expect(params.page).toBe(7);
    expect(params.pageSize).toBe(50);
  });
});
