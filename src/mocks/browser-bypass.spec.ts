/**
 * FIX-51 Part 1 — `isSameOriginNonBusiness` is the predicate that
 * decides which requests `installBusinessRouteBypass` (`./browser.ts`)
 * passes through untouched. It is a pure function of a `URL` and an
 * origin string, so it needs no service worker, no jsdom `location`
 * and no MSW — which is also why it lives in its own module rather
 * than in `browser.ts`: that module's top-level `setupWorker()` call
 * throws outside a real browser, so nothing under `src`/`tests` may
 * import it (see `src/main.spec.ts`'s own guard against that chain).
 *
 * T05-AC05 (`docs/tasks/T05.md:49`): "Unknown API endpoints cannot
 * pass through; local app/media assets are explicitly allowed.
 * External scripts, fonts, telemetry and business hosts are
 * disallowed."
 */
import { isSameOriginNonBusiness } from './business-route-predicates';

const PAGE_ORIGIN = 'http://localhost:4200';

// The predicate this change replaces, copied verbatim from the
// pre-FIX-51 `installBusinessRouteBypass` body. It is kept here so
// the defect stays covered: a later edit that reverts to a
// pathname-only test fails the three cases below rather than passing
// silently.
const pathnameOnlyBypass = (url: URL): boolean => !url.pathname.startsWith('/api/');

describe('FIX-51 isSameOriginNonBusiness', () => {
  it('passes a same-origin static asset', () => {
    const url = new URL('http://localhost:4200/assets/products/graphite-front.webp');
    expect(isSameOriginNonBusiness(url, PAGE_ORIGIN)).toBe(true);
  });

  it('passes the same-origin mock worker bundle', () => {
    const url = new URL('http://localhost:4200/mockServiceWorker.js');
    expect(isSameOriginNonBusiness(url, PAGE_ORIGIN)).toBe(true);
  });

  it('declines a same-origin business API path, leaving it to the business handlers', () => {
    const url = new URL('http://localhost:4200/api/v1/cart');
    expect(isSameOriginNonBusiness(url, PAGE_ORIGIN)).toBe(false);
  });

  it('declines a foreign-origin telemetry beacon', () => {
    const url = new URL('https://telemetry.example/collect');
    expect(isSameOriginNonBusiness(url, PAGE_ORIGIN)).toBe(false);
  });

  it('declines a foreign-origin font request', () => {
    const url = new URL('https://fonts.googleapis.com/css2?family=X');
    expect(isSameOriginNonBusiness(url, PAGE_ORIGIN)).toBe(false);
  });

  it('declines a foreign-origin business-shaped path', () => {
    const url = new URL('https://example.com/api/v1/cart');
    expect(isSameOriginNonBusiness(url, PAGE_ORIGIN)).toBe(false);
  });

  it('declines a same-path request on a different port — a different origin', () => {
    const url = new URL('http://localhost:4201/assets/x.webp');
    expect(isSameOriginNonBusiness(url, PAGE_ORIGIN)).toBe(false);
  });

  it('the pathname-only predicate passed a foreign origin through; this one does not', () => {
    const foreign = new URL('http://localhost:4201/assets/x.webp');
    expect(pathnameOnlyBypass(foreign)).toBe(true);
    expect(isSameOriginNonBusiness(foreign, PAGE_ORIGIN)).toBe(false);
  });

  it('the pathname-only predicate passed a telemetry beacon through; this one does not', () => {
    const foreign = new URL('https://telemetry.example/collect');
    expect(pathnameOnlyBypass(foreign)).toBe(true);
    expect(isSameOriginNonBusiness(foreign, PAGE_ORIGIN)).toBe(false);
  });

  it('the pathname-only predicate passed a foreign font request through; this one does not', () => {
    const foreign = new URL('https://fonts.googleapis.com/css2?family=X');
    expect(pathnameOnlyBypass(foreign)).toBe(true);
    expect(isSameOriginNonBusiness(foreign, PAGE_ORIGIN)).toBe(false);
  });
});
