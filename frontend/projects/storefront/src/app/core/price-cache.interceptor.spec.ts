// @vitest-environment jsdom
import { HttpContext, HttpRequest } from '@angular/common/http';
import type { HttpHandlerFn } from '@angular/common/http';
import { EMPTY } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { PROMOTION_PROBE, priceCacheInterceptor } from './price-cache.interceptor';

describe('priceCacheInterceptor', () => {
  it('identifies the shell probe without changing the catalogue query', () => {
    const request = new HttpRequest('GET', 'http://localhost/api/v1/products', {
      context: new HttpContext().set(PROMOTION_PROBE, true),
    });
    const next: HttpHandlerFn = (read) => {
      expect(read.url).toBe(request.url);
      expect(read.headers.get('X-Mibolt-Promotion-Probe')).toBe('true');
      return EMPTY;
    };
    priceCacheInterceptor(request, next);
  });

  it.each(['/cart', '/checkout', '/checkout/options'])(
    'bypasses old browser entries for %s',
    (path) => {
      const request = new HttpRequest('GET', `http://localhost/api/v1${path}`);
      const next: HttpHandlerFn = (read) => {
        expect(read.cache).toBe('no-store');
        return EMPTY;
      };
      priceCacheInterceptor(request, next);
    },
  );

  it.each([
    new HttpRequest('GET', 'http://localhost/api/v1/products'),
    new HttpRequest('POST', 'http://localhost/api/v1/cart/items', { quantity: 1 }),
  ])('leaves catalogue caching and writes intact', (request) => {
    const next: HttpHandlerFn = (read) => {
      expect(read).toBe(request);
      return EMPTY;
    };
    priceCacheInterceptor(request, next);
  });
});
