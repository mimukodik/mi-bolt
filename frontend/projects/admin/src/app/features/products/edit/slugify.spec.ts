import { describe, expect, it } from 'vitest';

import { slugify } from './slugify';

describe('slugify', () => {
  it('drops accents and lower-cases', () => {
    // Fails if NFD normalisation or the combining-mark removal breaks.
    expect(slugify('Árvíztűrő Tükör')).toBe('arvizturo-tukor');
  });

  it('reads "+" as "plus"', () => {
    // Fails if the "+" -> " plus " step is removed.
    expect(slugify('Samsung Galaxy S26+')).toBe('samsung-galaxy-s26-plus');
  });

  it('turns spaces into hyphens', () => {
    expect(slugify('Apple iPhone 18 Pro Max')).toBe('apple-iphone-18-pro-max');
  });

  it('trims leading and trailing hyphens and collapses repeats', () => {
    // Fails if the leading/trailing trim or the final -{2,} collapse is removed.
    expect(slugify('  --Honor X7D--  ')).toBe('honor-x7d');
  });

  it('keeps digits and collapses parentheses into hyphens', () => {
    expect(slugify('Xiaomi 15T Pro 5G (512 GB)')).toBe('xiaomi-15t-pro-5g-512-gb');
  });

  it('returns the empty string for the empty string', () => {
    expect(slugify('')).toBe('');
  });
});
