import { describe, expect, it } from 'vitest';

import {
  isSort,
  isStorageBucket,
  parseCatalogQuery,
  serializeCatalogQuery,
  SORT_MODES,
  type CatalogQuery,
} from './catalog-query';

describe('isSort', () => {
  it('returns true for every documented sort mode', () => {
    for (const mode of SORT_MODES) {
      expect(isSort(mode)).toBe(true);
    }
  });

  it('returns false for "cheapest"', () => {
    expect(isSort('cheapest')).toBe(false);
  });

  it('returns false for ""', () => {
    expect(isSort('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSort(null)).toBe(false);
  });
});

describe('isStorageBucket', () => {
  it('returns true for 128', () => {
    expect(isStorageBucket(128)).toBe(true);
  });

  it('returns true for 256', () => {
    expect(isStorageBucket(256)).toBe(true);
  });

  it('returns true for 512', () => {
    expect(isStorageBucket(512)).toBe(true);
  });

  it('returns false for 64', () => {
    expect(isStorageBucket(64)).toBe(false);
  });

  it('returns false for 0', () => {
    expect(isStorageBucket(0)).toBe(false);
  });
});

describe('parseCatalogQuery / serializeCatalogQuery — color[] and the 8 sorts', () => {
  it('parses color=… (repeated) into colors', () => {
    const params = new URLSearchParams('color=zold&color=feher');
    const parsed = parseCatalogQuery(params);
    expect(parsed.colors).toEqual(['zold', 'feher']);
  });

  it('serializes colors as repeated color=', () => {
    const q: CatalogQuery = {
      ...{ page: 1, pageSize: 12 },
      colors: ['zold', 'feher'],
    };
    const params = serializeCatalogQuery(q);
    expect(params.getAll('color')).toEqual(['zold', 'feher']);
  });

  it('drops empty / whitespace-only color values', () => {
    const params = new URLSearchParams('color=&color=%20%20&color=zold');
    const parsed = parseCatalogQuery(params);
    expect(parsed.colors).toEqual(['zold']);
    const serialised = serializeCatalogQuery({
      ...{ page: 1, pageSize: 12 },
      colors: parsed.colors,
    });
    expect(serialised.getAll('color')).toEqual(['zold']);
  });

  it('round-trips every one of the 8 sorts', () => {
    for (const mode of SORT_MODES) {
      const q: CatalogQuery = { ...{ page: 1, pageSize: 12 }, sort: mode };
      const serialised = serializeCatalogQuery(q);
      expect(serialised.get('sort')).toBe(mode);
      const reparsed = parseCatalogQuery(serialised);
      expect(reparsed.sort).toBe(mode);
    }
  });

  it('drops an unknown sort', () => {
    const params = new URLSearchParams('sort=cheapest');
    const parsed = parseCatalogQuery(params);
    expect(parsed.sort).toBeUndefined();
  });
});
