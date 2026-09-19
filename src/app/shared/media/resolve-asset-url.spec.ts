import { AssetUrlError, resolveAssetUrl } from './resolve-asset-url';

describe('resolveAssetUrl (FIX-49)', () => {
  it.each([
    [
      '/assets/products/graphite-front.webp',
      'https://example.test/',
      'https://example.test/assets/products/graphite-front.webp',
    ],
    [
      '/assets/products/graphite-front.webp',
      'https://example.test/mi-bolt/',
      'https://example.test/mi-bolt/assets/products/graphite-front.webp',
    ],
    [
      '/assets/placeholder.svg',
      'https://example.test/mi-bolt/',
      'https://example.test/mi-bolt/assets/placeholder.svg',
    ],
  ])('resolves %s against %s to %s', (path, base, expected) => {
    expect(resolveAssetUrl(path, base)).toBe(expected);
  });

  it.each([
    ['/assets/../../etc/passwd'],
    ['/assets/%2e%2e/%2e%2e/etc/passwd'],
    ['//evil.example/assets/x.webp'],
    ['https://evil.example/assets/x.webp'],
    ['assets/products/x.webp'],
    ['/public/x.webp'],
    ['/assets/products/x%2Ewebp'],
    [''],
  ])('rejects %s as AssetUrlError', (path) => {
    expect(() => resolveAssetUrl(path, 'https://example.test/mi-bolt/')).toThrow(AssetUrlError);
  });
});
