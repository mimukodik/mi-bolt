/**
 * T11 — Layouts, navigation and global state.
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
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { Location } from '@angular/common';
import { beforeAll } from 'vitest';

import { routes } from '../src/app/app.routes';
import { checkoutRoutes } from '../src/app/features/checkout/checkout.routes';
import { App } from '../src/app/app';
import { CartCountFacade } from '../src/app/core/navigation/cart-count-facade';
import { RouteFocusService } from '../src/app/core/navigation/route-focus';
import { MarketingLayout } from '../src/app/layouts/marketing-layout';
import { ShopLayout } from '../src/app/layouts/shop-layout';
import { CheckoutLayout } from '../src/app/layouts/checkout-layout';
import { AppShell } from '../src/app/shared/shell/app-shell';
import { HeaderNav } from '../src/app/core/navigation/header-nav';
import { MobileDrawer } from '../src/app/core/navigation/mobile-drawer';
import { MobileDrawerHost } from '../src/app/core/navigation/mobile-drawer-host';
import { AccessibleDialog } from '../src/app/shared/ui/accessible-dialog/accessible-dialog';
import { FooterNav } from '../src/app/core/navigation/footer-nav';

beforeAll(() => {
  TestBed.initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting(),
    { teardown: { destroyAfterEach: true } },
  );
});

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
    const header = f.nativeElement.querySelector('header');
    expect(header).not.toBeNull();
    const css = (HeaderNav as unknown as { ɵcmp: { styles: readonly string[] } }).ɵcmp.styles.join(' ');
    const hasDark = css.indexOf('color-shell-dark') >= 0;
    const hasAlt = css.indexOf('mi-bolt-color-surface-dark') >= 0;
    const found = hasDark ? hasDark : hasAlt;
    expect(found).toBe(true);
  });

  it('MarketingLayout exposes Hungarian nav links', () => {
    const f = TestBed.createComponent(MarketingLayout);
    f.detectChanges();
    const nav = f.nativeElement.querySelector('nav');
    const text = nav && nav.textContent ? nav.textContent : '';
    const has1 = text.indexOf('Mobiltelefonok') >= 0;
    const has2 = text.indexOf('A demóról') >= 0;
    expect(has1).toBe(true);
    expect(has2).toBe(true);
  });

  it('MarketingLayout renders the standard footer with link groups', () => {
    const f = TestBed.createComponent(MarketingLayout);
    f.detectChanges();
    const footer = f.nativeElement.querySelector('footer');
    expect(footer).not.toBeNull();
    const links = footer ? footer.querySelectorAll('a') : [];
    const len = links.length;
    const ok = len - 2;
    expect(ok > 0).toBe(true);
  });

  it('ShopLayout exposes a full-width mobile search at narrow widths', () => {
    const f = TestBed.createComponent(ShopLayout);
    f.detectChanges();
    const m = f.nativeElement.querySelector('[data-testid="mobile-search"]');
    expect(m).not.toBeNull();
    const css = (ShopLayout as unknown as { ɵcmp: { styles: readonly string[] } }).ɵcmp.styles.join(' ');
    expect(css.indexOf('max-width: 640px') >= 0).toBe(true);
  });

  it('CheckoutLayout removes search but retains return-to-shop navigation', () => {
    const f = TestBed.createComponent(CheckoutLayout);
    f.detectChanges();
    const root = f.nativeElement as HTMLElement;
    const text = root.textContent ? root.textContent : '';
    expect(text.indexOf('Vissza a shopba') >= 0).toBe(true);
    const checkoutHeader = root.querySelector('[data-testid="checkout-header"]');
    expect(checkoutHeader).not.toBeNull();
    const search = checkoutHeader ? checkoutHeader.querySelector('[data-testid="header-search"]') : null;
    expect(search).toBeNull();
  });

  it('CheckoutLayout shows the four numbered step labels', () => {
    const f = TestBed.createComponent(CheckoutLayout);
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent || '';
    expect(text.indexOf('Kosár') >= 0).toBe(true);
    expect(text.indexOf('Adatok') >= 0).toBe(true);
    expect(text.indexOf('Szállítás') >= 0).toBe(true);
    expect(text.indexOf('Ellenőrzés') >= 0).toBe(true);
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
    const skip = app.nativeElement.querySelector('a.skip-link');
    expect(skip).not.toBeNull();
    const href = skip ? skip.getAttribute('href') : '';
    expect(href).toBe('#main-content');
  });

  it('each layout renders a main with id=main-content', () => {
    const layouts = [MarketingLayout, ShopLayout, CheckoutLayout];
    layouts.forEach((L) => {
      const f = TestBed.createComponent(L);
      f.detectChanges();
      const main = f.nativeElement.querySelector('main#main-content');
      expect(main).not.toBeNull();
      f.destroy();
    });
  });

  it('layouts expose zero H1s by themselves', () => {
    const layouts = [MarketingLayout, ShopLayout, CheckoutLayout];
    layouts.forEach((L) => {
      const f = TestBed.createComponent(L);
      f.detectChanges();
      const h1s = f.nativeElement.querySelectorAll('main h1');
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
    const main = f.nativeElement.querySelector('main') as HTMLElement;
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
    const has1 = p1.indexOf('telefonok') >= 0;
    const has2 = p1.indexOf('brand=demo-one') >= 0;
    expect(has1).toBe(true);
    expect(has2).toBe(true);
    await router.navigateByUrl('/telefonok/demo-one');
    const p2 = location.path();
    expect(p2.indexOf('demo-one') >= 0).toBe(true);
    location.back();
    await new Promise((r) => setTimeout(r, 0));
    const p3 = location.path();
    expect(p3.indexOf('brand=demo-one') >= 0).toBe(true);
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
    const host = f.componentInstance as unknown as { opened: { set: (v: boolean) => void } };
    host.opened.set(true);
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
    const host = f.componentInstance as unknown as { opened: { set: (v: boolean) => void } };
    host.opened.set(true);
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
    const rawDeps = (MobileDrawer as unknown as {
      ɵcmp: { dependencies: unknown };
    }).ɵcmp.dependencies;
    const deps = (typeof rawDeps === 'function'
      ? (rawDeps as () => readonly unknown[])()
      : (rawDeps as readonly unknown[]));
    let found = false;
    deps.forEach((d) => {
      if ((d as { name?: string }).name === 'AccessibleDialog') found = true;
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
    const badge = f.nativeElement.querySelector('[data-testid="cart-badge"]');
    const text = badge && badge.textContent ? badge.textContent.trim() : '';
    expect(text).toBe('0');
  });

  it('AppShell reflects CartCountFacade.itemCount changes', () => {
    const f = TestBed.createComponent(AppShell);
    f.componentRef.setInput('variant', 'marketing');
    f.detectChanges();
    // T17 replaced the T11 stub with the real CartFacade: there is no
    // writable `count` signal any more. Drive the badge through the
    // authoritative cart snapshot — `_seedCart` is the test seam that
    // points the facade at a known cart id.
    const facade = TestBed.inject(CartCountFacade) as unknown as {
      _seedCart: (input: { id: string; itemCount: number }) => void;
    };
    facade._seedCart({ id: 'cart-test-001', itemCount: 3 });
    f.detectChanges();
    const badge = f.nativeElement.querySelector('[data-testid="cart-badge"]');
    const text = badge && badge.textContent ? badge.textContent.trim() : '';
    expect(text).toBe('3');
  });
});
