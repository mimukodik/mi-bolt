import { AssetUrlError, resolveAssetUrl } from './resolve-asset-url';

describe('resolveAssetUrl', () => {
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
    // MIM-210: the catalogue serves `Image.src` as `/api/v1/media/<imageId>`
    // (`docs/api/openapi.yaml:1126`). Rejecting that shape rendered the
    // monogram fallback on the gallery, the cart line and the card.
    [
      '/api/v1/media/849997cd0d4d4ff9a1f0e4e1a1c4d9b1b7ab8d0ad2e0c3b7e0b8d4b5b8c5e7a1',
      'http://localhost:4201/',
      'http://localhost:4201/api/v1/media/849997cd0d4d4ff9a1f0e4e1a1c4d9b1b7ab8d0ad2e0c3b7e0b8d4b5b8c5e7a1',
    ],
    [
      '/api/v1/media/849997cd',
      'https://example.test/mi-bolt/',
      'https://example.test/mi-bolt/api/v1/media/849997cd',
    ],
    // The prefix is the server's choice, so any root-relative path under
    // the deployment base resolves; the boundary is the base, not a
    // hard-coded directory name.
    [
      '/public/x.webp',
      'https://example.test/mi-bolt/',
      'https://example.test/mi-bolt/public/x.webp',
    ],
  ])('resolves %s against %s to %s', (path, base, expected) => {
    expect(resolveAssetUrl(path, base)).toBe(expected);
  });

  it.each([
    ['/assets/../../etc/passwd'],
    ['/assets/%2e%2e/%2e%2e/etc/passwd'],
    ['//evil.example/assets/x.webp'],
    ['https://evil.example/assets/x.webp'],
    ['javascript:alert(1)'],
    ['data:image/png;base64,iVBORw0KGgo='],
    ['assets/products/x.webp'],
    ['/assets/products/x%2Ewebp'],
    [''],
  ])('rejects %s as AssetUrlError', (path) => {
    expect(() => resolveAssetUrl(path, 'https://example.test/mi-bolt/')).toThrow(AssetUrlError);
  });
});
