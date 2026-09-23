import { variantId, variantSlug } from './variant-id';

describe('variantSlug', () => {
  it('joins the colour code and the storage with "gb"', () => {
    expect(variantSlug('zold', 256)).toBe('zold-256gb');
  });
});

describe('variantId', () => {
  it('joins the product slug, the colour code and the storage with double dashes', () => {
    expect(variantId('motorola-edge-50-fusion', 'zold', 256)).toBe(
      'motorola-edge-50-fusion--zold--256',
    );
  });
});
