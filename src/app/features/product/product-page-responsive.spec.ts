/**
 * FIX-26 — regression guard for the one-column collapse and the fixed
 * mobile buy rail.
 *
 * jsdom has no layout engine: it does not apply component stylesheets,
 * evaluate media queries, or compute `getComputedStyle(...)`,
 * `getBoundingClientRect()` or `scrollWidth`. Every width-dependent
 * claim in FIX-26's acceptance criteria is therefore a real-browser
 * check; this spec only asserts what jsdom *can* see: that the fixed
 * rail and the in-flow desktop CTA are two distinct, separately
 * parented elements in the rendered DOM, so the CSS this task writes
 * has exactly one rail and one in-flow CTA to toggle.
 */

// @vitest-environment jsdom
import '@angular/compiler';

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server, useMswServer } from '../../../../tests/msw-server';
import { provideApiConfiguration as provideApiConfig } from '../../api/generated/api-configuration';
import { demoSessionInterceptor } from '../../core/api/demo-session.interceptor';
import { ProductPage } from './product-page';
import { DEMO_PRODUCT } from '../../../mocks/cart/cart.handlers';

useMswServer();

const BASE_URL = 'http://localhost/api/v1';

@Component({
  imports: [ProductPage],
  template: `<app-product-page [slug]="slug()" />`,
})
class ProductPageHost {
  readonly slug = signal<string>('demo-one-5g');
}

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new TypeError('Expected HTMLElement');
  }
  return raw;
}

describe('FIX-26 product-page-responsive: one rail, one in-flow CTA', () => {
  it('renders exactly one purchase rail and one .cta-desktop, each under a distinct parent', async () => {
    server.use(
      http.get(`${BASE_URL}/products/:slug`, () =>
        HttpResponse.json(DEMO_PRODUCT, { status: 200 }),
      ),
    );

    TestBed.configureTestingModule({
      imports: [ProductPageHost],
      providers: [
        provideHttpClient(withInterceptors([demoSessionInterceptor])),
        provideApiConfig(BASE_URL),
        provideRouter([]),
      ],
      teardown: { destroyAfterEach: true },
    });

    const fixture = TestBed.createComponent(ProductPageHost);
    fixture.detectChanges();
    await fixture.whenStable();
    for (let index = 0; index < 8; index += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 15);
      });
      fixture.detectChanges();
    }

    const root = getRootElement(fixture);

    const rails = root.querySelectorAll('[data-testid="purchase-rail"]');
    expect(rails.length).toBe(1);

    const ctaDesktops = root.querySelectorAll('.cta-desktop');
    expect(ctaDesktops.length).toBe(1);

    // The rail is wrapped by `<app-mobile-buy-rail>` (FIX-50), itself
    // a direct child of `.page`; the in-flow CTA lives inside `.buy`,
    // inside `.card`. Distinct parents is what lets the CSS hide one
    // without touching the other.
    const rail = rails[0];
    const ctaDesktop = ctaDesktops[0];
    const railHost = rail.parentElement;
    expect(railHost?.tagName.toLowerCase()).toBe('app-mobile-buy-rail');
    expect(railHost?.parentElement).toBe(root.querySelector('.page'));
    expect(ctaDesktop.closest('.buy')).not.toBeNull();
    expect(rail.parentElement).not.toBe(ctaDesktop.parentElement);
  });
});
