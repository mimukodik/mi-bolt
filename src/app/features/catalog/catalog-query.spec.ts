import { describe, expect, it } from 'vitest';
import { isSort, isStorageBucket } from './catalog-query';

describe('isSort', () => {
  it('returns true for "recommended"', () => {
    expect(isSort('recommended')).toBe(true);
  });

  it('returns true for "price_asc"', () => {
    expect(isSort('price_asc')).toBe(true);
  });

  it('returns true for "price_desc"', () => {
    expect(isSort('price_desc')).toBe(true);
  });

  it('returns true for "name_asc"', () => {
    expect(isSort('name_asc')).toBe(true);
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
