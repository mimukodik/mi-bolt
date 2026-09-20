/**
 * FIX-28: the home page (`marketing` variant) had no search control at all
 * below 1024px — the full-width mobile search row existed in the template
 * but was gated behind `@if (variant() === 'shop')`. These specs assert the
 * three DOM-shape behaviours jsdom can see; the width-dependent CSS
 * (`display: none/flex/block`, the featured grid column count) is a real
 * browser check per FIX-28-AC01 to FIX-28-AC08 and is not repeated here.
 */

// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { HeaderNav, type HeaderVariant } from './header-nav';

describe('FIX-28: mobile search row is available outside the shop variant', () => {
  beforeEach(async () => {
    document.body.replaceChildren();
    TestBed.configureTestingModule({
      imports: [HeaderNav],
      providers: [provideRouter([]), provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();
  });

  function render(variant: HeaderVariant): HTMLElement {
    const f = TestBed.createComponent(HeaderNav);
    f.componentRef.setInput('variant', variant);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    return raw;
  }

  it('renders exactly one mobile-search-input for the marketing variant', () => {
    const host = render('marketing');
    const inputs = host.querySelectorAll('[data-testid="mobile-search-input"]');
    expect(inputs.length).toBe(1);
  });

  it('renders exactly one mobile-search-input for the shop variant', () => {
    const host = render('shop');
    const inputs = host.querySelectorAll('[data-testid="mobile-search-input"]');
    expect(inputs.length).toBe(1);
  });

  it('renders no mobile-search-input for the checkout variant', () => {
    const host = render('checkout');
    const inputs = host.querySelectorAll('[data-testid="mobile-search-input"]');
    expect(inputs.length).toBe(0);
  });

  it('places the menu trigger before the brand in document order for the marketing variant', () => {
    const host = render('marketing');
    const trigger = host.querySelector('[data-testid="menu-trigger"]');
    const brand = host.querySelector('.brand');
    expect(trigger).not.toBeNull();
    expect(brand).not.toBeNull();
    if (trigger === null || brand === null) return;
    const position = trigger.compareDocumentPosition(brand);
    expect((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });
});
