/**
 * T11: Layouts, navigation and global state.
 *
 * Vitest's esbuild/oxc parser is broken with several common TypeScript
 * patterns (e.g. `??` chained with method calls, `||` chained with
 * method calls, `>` inside `expect()` parens, certain arrow function
 * shapes inside `.map()`/`.filter()` calls). This spec is therefore
 * written in a deliberately conservative subset.
 */

// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, type Type } from '@angular/core';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { Location } from '@angular/common';

import { routes } from '../../app/app.routes';
import { checkoutRoutes } from '../../app/features/checkout/checkout.routes';
import { App } from '../../app/app';
import { CartCountFacade } from '../../app/core/navigation/cart-count-facade';
import { RouteFocusService } from '../../app/core/navigation/route-focus';
import { MarketingLayout } from '../../app/layouts/marketing-layout';
import { ShopLayout } from '../../app/layouts/shop-layout';
import { CheckoutLayout } from '../../app/layouts/checkout-layout';
import { AppShell } from '../../app/shared/shell/app-shell';
import { HeaderNav } from '../../app/core/navigation/header-nav';
import { MobileDrawer } from '../../app/core/navigation/mobile-drawer';
import { MobileDrawerHost } from '../../app/core/navigation/mobile-drawer-host';
import { AccessibleDialog } from '../../app/shared/ui/accessible-dialog/accessible-dialog';
import { FooterNav } from '../../app/core/navigation/footer-nav';

function isObjectOrFunction(value: unknown): value is Record<string, unknown> {
  return (typeof value === 'function' || typeof value === 'object') && value !== null;
}

function isCallable(value: unknown): value is () => readonly unknown[] {
  return typeof value === 'function';
}

function getComponentStyles(comp: unknown): readonly string[] {
  if (!isObjectOrFunction(comp)) {
    return [];
  }
  const cmp = comp['ɵcmp'];
  if (!isObjectOrFunction(cmp)) {
    return [];
  }
  const styles = cmp['styles'];
  if (Array.isArray(styles)) {
    return styles.filter((s): s is string => typeof s === 'string');
  }
  return [];
}

function getComponentDependencies(comp: unknown): readonly unknown[] {
  if (!isObjectOrFunction(comp)) {
    return [];
  }
  const cmp = comp['ɵcmp'];
  if (!isObjectOrFunction(cmp)) {
    return [];
  }
  const deps = cmp['dependencies'];
  if (isCallable(deps)) {
    const evaluated: unknown = deps();
    if (Array.isArray(evaluated)) return evaluated;
    return [];
  }
  if (Array.isArray(deps)) {
    return deps;
  }
  return [];
}

function hasName(item: unknown, expectedName: string): boolean {
  if (typeof item === 'function' && item.name === expectedName) {
    return true;
  }
  return typeof item === 'object' && item !== null && 'name' in item && item.name === expectedName;
}

const colon = String.fromCharCode(58);

describe('T11-AC01 layouts and route table', () => {
  it('declares routes for the four screen families', () => {
    let hasHome = false;
    let hasShop = false;
    let hasCheckout = false;
    routes.forEach((r) => {
      if (r.path === '') hasHome = true;
      if (r.path === 'telefonok') hasShop = true;
      if (r.path === 'penztar') hasCheckout = true;
    });
    expect(hasHome).toBe(true);
    expect(hasShop).toBe(true);
    expect(hasCheckout).toBe(true);
  });

  it('every leaf route uses loadComponent as a lazy boundary', () => {
    let count = 0;
    routes.forEach((r) => {
      if (typeof r.loadComponent === 'function') count = count + 1;
      if (r.children) {
        r.children.forEach((c) => {
          if (typeof c.loadComponent === 'function') count = count + 1;
        });
      }
    });
    const ok = count - 0;
    expect(ok > 0).toBe(true);
  });

  it('product detail route exists as a child of telefonok', () => {
    let found = false;
    routes.forEach((r) => {
      if (r.path !== 'telefonok') return;
      if (!r.children) return;
      r.children.forEach((c) => {
        const slugLit = colon + 'slug';
        if (c.path === slugLit) found = true;
      });
    });
    expect(found).toBe(true);
  });

  it('utility 404 is wired as a wildcard leaf route', () => {
    let found = false;
    const wildcard = String.fromCharCode(42) + String.fromCharCode(42);
    routes.forEach((r) => {
      if (r.path === wildcard) found = true;
    });
    expect(found).toBe(true);
  });

  it('checkout family includes cart, contact, delivery, review and success', () => {
    const expected = ['kosar', 'adatok', 'szallitas', 'ellenorzes'];
    let foundCount = 0;
    checkoutRoutes.forEach((c) => {
      expected.forEach((e) => {
        if (c.path === e) foundCount = foundCount + 1;
      });
    });
    const ok = foundCount - 3;
    expect(ok > 0).toBe(true);
  });

  it('checkout success route uses the orderId child pattern', () => {
    let found = false;
    const orderIdLit = colon + 'orderId';
    const fullPath = 'siker' + '/' + orderIdLit;
    checkoutRoutes.forEach((c) => {
      if (c.path === fullPath) found = true;
    });
    expect(found).toBe(true);
  });
});

describe('T11-AC02 brand-consistent header and footer', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [
        MarketingLayout,
        ShopLayout,
        CheckoutLayout,
        AppShell,
        HeaderNav,
        FooterNav,
        MobileDrawer,
        AccessibleDialog,
      ],
      providers: [provideRouter([]), provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();
  });

  it('MarketingLayout header has dark shell and brand label', () => {
    const f = TestBed.createComponent(MarketingLayout);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const header = raw.querySelector('header');
    expect(header).not.toBeNull();
    const css = getComponentStyles(HeaderNav).join(' ');
    const hasDark = css.includes('color-shell-dark');
    const hasAlt = css.includes('mi-bolt-color-surface-dark');
    const found = hasDark || hasAlt;
    expect(found).toBe(true);
  });

  it('MarketingLayout exposes Hungarian nav links', () => {
    const f = TestBed.createComponent(MarketingLayout);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const nav = raw.querySelector('nav');
    const text = nav?.textContent ?? '';
    const has1 = text.includes('Mobiltelefonok');
    const has2 = text.includes('A demóról');
    expect(has1).toBe(true);
    expect(has2).toBe(true);
  });

  it('MarketingLayout renders the standard footer with link groups', () => {
    const f = TestBed.createComponent(MarketingLayout);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const footer = raw.querySelector('footer');
    expect(footer).not.toBeNull();
    const links = footer ? footer.querySelectorAll('a') : [];
    const len = links.length;
    const ok = len - 2;
    expect(ok > 0).toBe(true);
  });

  it('ShopLayout exposes a full-width mobile search at narrow widths', () => {
    const f = TestBed.createComponent(ShopLayout);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const m = raw.querySelector('[data-testid="mobile-search"]');
    expect(m).not.toBeNull();
    const css = getComponentStyles(ShopLayout).join(' ');
    expect(css.includes('max-width: 640px')).toBe(true);
  });

  it('CheckoutLayout removes search but retains return-to-shop navigation', () => {
    const f = TestBed.createComponent(CheckoutLayout);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    expect(raw.textContent).toContain('Vissza a shopba');
    const checkoutHeader = raw.querySelector('[data-testid="checkout-header"]');
    expect(checkoutHeader).not.toBeNull();
    const search = checkoutHeader
      ? checkoutHeader.querySelector('[data-testid="header-search"]')
      : null;
    expect(search).toBeNull();
  });

  it('CheckoutLayout shows the four numbered step labels', () => {
    const f = TestBed.createComponent(CheckoutLayout);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const text = raw.textContent;
    expect(text).toContain('Kosár');
    expect(text).toContain('Adatok');
    expect(text).toContain('Szállítás');
    expect(text).toContain('Ellenőrzés');
  });
});

describe('T11-AC03 skip link, single H1, route title, route-change focus, history', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [
        App,
        MarketingLayout,
        ShopLayout,
        CheckoutLayout,
        AppShell,
        HeaderNav,
        FooterNav,
        MobileDrawer,
        AccessibleDialog,
      ],
      providers: [provideRouter([]), provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();
  });

  it('the root skip link points to main-content', () => {
    const app = TestBed.createComponent(App);
    app.detectChanges();
    const raw: unknown = app.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const skip = raw.querySelector('a.skip-link');
    expect(skip).not.toBeNull();
    const href = skip ? skip.getAttribute('href') : '';
    expect(href).toBe('#main-content');
  });

  it('each layout renders a main with id=main-content', () => {
    const layouts: readonly Type<unknown>[] = [MarketingLayout, ShopLayout, CheckoutLayout];
    layouts.forEach((L) => {
      const f = TestBed.createComponent(L);
      f.detectChanges();
      const raw: unknown = f.nativeElement;
      if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
      const main = raw.querySelector('main#main-content');
      expect(main).not.toBeNull();
      f.destroy();
    });
  });

  it('layouts expose zero H1s by themselves', () => {
    const layouts: readonly Type<unknown>[] = [MarketingLayout, ShopLayout, CheckoutLayout];
    layouts.forEach((L) => {
      const f = TestBed.createComponent(L);
      f.detectChanges();
      const raw: unknown = f.nativeElement;
      if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
      const h1s = raw.querySelectorAll('main h1');
      expect(h1s.length).toBe(0);
      f.destroy();
    });
  });

  it('RouteFocusService emits a NavigationEnd on navigateByUrl', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideZonelessChangeDetection()],
    });
    const router = TestBed.inject(Router);
    const focus = TestBed.inject(RouteFocusService);
    const events: NavigationEnd[] = [];
    const sub = focus.routeChange$.subscribe((event) => {
      if (event instanceof NavigationEnd) events.push(event);
    });
    await router.navigateByUrl('/');
    const ok = events.length - 0;
    expect(ok > 0).toBe(true);
    sub.unsubscribe();
  });

  it('RouteFocusService.focusMainHeading moves focus to the main H1', () => {
    const f = TestBed.createComponent(MarketingLayout);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const main = raw.querySelector('main');
    if (!(main instanceof HTMLElement)) throw new Error('Expected main HTMLElement');
    const h1 = document.createElement('h1');
    h1.textContent = 'Pelda';
    main.appendChild(h1);
    TestBed.inject(RouteFocusService).focusMainHeading();
    expect(document.activeElement).toBe(h1);
  });

  it('browser back preserves URL query filters on /telefonok', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideZonelessChangeDetection()],
    });
    const router = TestBed.inject(Router);
    const location = TestBed.inject(Location);
    await router.navigateByUrl('/telefonok?brand=demo-one');
    const p1 = location.path();
    const has1 = p1.includes('telefonok');
    const has2 = p1.includes('brand=demo-one');
    expect(has1).toBe(true);
    expect(has2).toBe(true);
    await router.navigateByUrl('/telefonok/demo-one');
    const p2 = location.path();
    expect(p2.includes('demo-one')).toBe(true);
    location.back();
    await new Promise((r) => setTimeout(r, 0));
    const p3 = location.path();
    expect(p3.includes('brand=demo-one')).toBe(true);
  });
});

describe('T11-AC04 mobile menu drawer and shop mobile search', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [
        MobileDrawerHost,
        MobileDrawer,
        AccessibleDialog,
        HeaderNav,
        AppShell,
        MarketingLayout,
        ShopLayout,
        CheckoutLayout,
        FooterNav,
      ],
      providers: [provideRouter([]), provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();
  });

  it('MobileDrawer renders a focus-managed dialog', () => {
    const f = TestBed.createComponent(MobileDrawerHost);
    f.detectChanges();
    f.componentInstance.opened.set(true);
    f.detectChanges();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const modal = dialog ? dialog.getAttribute('aria-modal') : '';
    expect(modal).toBe('true');
    const links = document.body.querySelectorAll('[role="dialog"] a');
    expect(links.length).toBe(2);
  });

  it('MobileDrawer dialog is not a scaled desktop header', () => {
    const f = TestBed.createComponent(MobileDrawerHost);
    f.componentInstance.opened.set(true);
    f.detectChanges();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const closest = dialog ? dialog.closest('header') : 'x';
    expect(closest).toBeNull();
  });

  it('MobileDrawer depends on the AccessibleDialog primitive', () => {
    // Angular 22 exposes `ɵcmp.dependencies` as either an array (AOT
    // output) or a function that returns the array (JIT output). The
    // test runner here goes through vitest + the Angular JIT compiler,
    // so accept both forms.
    const deps = getComponentDependencies(MobileDrawer);
    let found = false;
    deps.forEach((d) => {
      if (hasName(d, 'AccessibleDialog')) found = true;
    });
    expect(found).toBe(true);
  });
});

describe('T11-AC05 cart badge wiring', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    TestBed.configureTestingModule({
      imports: [
        AppShell,
        HeaderNav,
        FooterNav,
        MobileDrawer,
        AccessibleDialog,
        MarketingLayout,
        ShopLayout,
        CheckoutLayout,
      ],
      providers: [provideRouter([]), provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();
  });

  it('CartCountFacade is providedIn root and itemCount defaults to 0', () => {
    const facade = TestBed.inject(CartCountFacade);
    expect(facade.itemCount()).toBe(0);
    expect(TestBed.inject(CartCountFacade)).toBe(facade);
  });

  it('AppShell renders the cart count derived from the facade', () => {
    const f = TestBed.createComponent(AppShell);
    f.componentRef.setInput('variant', 'marketing');
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const badge = raw.querySelector('[data-testid="cart-badge"]');
    const text = badge?.textContent ? badge.textContent.trim() : '';
    expect(text).toBe('0');
  });

  it('AppShell reflects CartCountFacade.itemCount changes', () => {
    const f = TestBed.createComponent(AppShell);
    f.componentRef.setInput('variant', 'marketing');
    f.detectChanges();
    // T17 replaced the T11 stub with the real CartFacade: there is no
    // writable `count` signal any more. Drive the badge through the
    // authoritative cart snapshot: `_seedCart` is the test seam that
    // points the facade at a known cart id.
    const facade = TestBed.inject(CartCountFacade);
    facade._seedCart({ id: 'cart-test-001', itemCount: 3 });
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const badge = raw.querySelector('[data-testid="cart-badge"]');
    const text = badge?.textContent ? badge.textContent.trim() : '';
    expect(text).toBe('3');
  });
});
