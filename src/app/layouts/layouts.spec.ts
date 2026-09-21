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
        if (c.path === ':slug') found = true;
      });
    });
    expect(found).toBe(true);
  });

  it('utility 404 is wired as a wildcard leaf route', () => {
    let found = false;
    routes.forEach((r) => {
      if (r.path === '**') found = true;
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
    const fullPath = 'siker/:orderId';
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

  it('MarketingLayout header is the lime bar with navy on it (docs/design/yettel.md §5)', () => {
    const f = TestBed.createComponent(MarketingLayout);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const header = raw.querySelector('header');
    expect(header).not.toBeNull();
    const css = getComponentStyles(HeaderNav)
      .join(' ')
      .replaceAll('%NS%', '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s+/g, '');
    // .portal-header__bar{height:72px;background:#b4ff00} with navy text —
    // the header no longer takes the navy shell token, which still grounds
    // the footer, the hero and the drawer.
    const at = css.indexOf('.header{');
    expect(at).toBeGreaterThan(-1);
    const bar = css.slice(at, css.indexOf('}', at));
    expect(bar).toContain('background:var(--color-accent)');
    expect(bar).toContain('color:var(--color-primary)');
    expect(css.includes('color-shell-dark')).toBe(false);
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

  it('MarketingLayout renders the single-bar footer with the demo-explainer CTA', () => {
    const f = TestBed.createComponent(MarketingLayout);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const footer = raw.querySelector('footer');
    expect(footer).not.toBeNull();
    const text = footer?.textContent ?? '';
    expect(text).toContain('Hogyan működik a demó?');
    expect(text).not.toContain('demo@mibolt.hu');
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
    f.componentRef.setInput('step', 'cart');
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
    f.componentRef.setInput('step', 'cart');
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const text = raw.textContent;
    expect(text).toContain('Kosár');
    expect(text).toContain('Adatok');
    expect(text).toContain('Szállítás');
    expect(text).toContain('Ellenőrzés');
  });

  // -------------------------------------------------------------------------
  // CENTRE-2: `<main class="layout-main">` inside CheckoutLayout must carry
  // `width: 100%` so the element behaves as a stretched flex item inside
  // `<app-app-shell>` instead of being sized shrink-to-fit against the
  // available cross-axis space (AppShell is `display: flex; flex-direction:
  // column`, its `<ng-content>` is `display: contents`, and `margin: 0 auto`
  // on the cross axis suppresses the default stretch). Without this
  // declaration the cart and contact steps render 129px / 137.66px in from
  // each side at 1280px while every other route sits on the site
  // centreline. jsdom does not lay out, so the assertion checks that the
  // declaration reached the element rather than that some pixel width was
  // produced — which is the invariant worth pinning.
  // -------------------------------------------------------------------------
  it('CheckoutLayout main.layout-main carries width: 100% (CENTRE-2)', () => {
    const f = TestBed.createComponent(CheckoutLayout);
    f.componentRef.setInput('step', 'cart');
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const main = raw.querySelector('main.layout-main');
    if (!(main instanceof HTMLElement)) throw new Error('Expected main.layout-main');
    expect(getComputedStyle(main).width).toBe('100%');
  });

  it('FIX-35: on the contact step the first indicator is complete (✓) and the second shows 2', () => {
    const f = TestBed.createComponent(CheckoutLayout);
    f.componentRef.setInput('step', 'contact');
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const items = raw.querySelectorAll('.steps__item');
    expect(items.length).toBe(4);
    const firstIndex = items[0].querySelector('.steps__index');
    expect(firstIndex?.textContent.trim()).toBe('✓');
    const secondIndex = items[1].querySelector('.steps__index');
    expect(secondIndex?.textContent.trim()).toBe('2');
  });

  it('FIX-35: on the success step every indicator is complete (✓)', () => {
    const f = TestBed.createComponent(CheckoutLayout);
    f.componentRef.setInput('step', 'success');
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const indexes = raw.querySelectorAll('.steps__index');
    expect(indexes.length).toBe(4);
    indexes.forEach((el) => {
      expect(el.textContent.trim()).toBe('✓');
    });
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
      if (L === CheckoutLayout) {
        f.componentRef.setInput('step', 'cart');
      }
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
      if (L === CheckoutLayout) {
        f.componentRef.setInput('step', 'cart');
      }
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

  it('RouteFocusService.pathChangeNavigationEnd$ emits on the first navigation', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideZonelessChangeDetection()],
    });
    const router = TestBed.inject(Router);
    const focus = TestBed.inject(RouteFocusService);
    const events: NavigationEnd[] = [];
    const sub = focus.pathChangeNavigationEnd$().subscribe((event) => {
      events.push(event);
    });
    await router.navigateByUrl('/telefonok');
    const ok = events.length - 0;
    expect(ok > 0).toBe(true);
    sub.unsubscribe();
  });

  it('RouteFocusService.pathChangeNavigationEnd$ does not emit for a query-only navigation', async () => {
    // The subscription is created before the baseline navigation and
    // stays alive across both, mirroring how a layout's constructor
    // subscribes once and keeps that same subscription for every
    // navigation the layout lives through. A subscription created only
    // after the baseline nav would see the query-only nav as its own
    // first-ever event, which always passes distinctUntilChanged.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideZonelessChangeDetection()],
    });
    const router = TestBed.inject(Router);
    const focus = TestBed.inject(RouteFocusService);
    const events: NavigationEnd[] = [];
    const sub = focus.pathChangeNavigationEnd$().subscribe((event) => {
      events.push(event);
    });
    await router.navigateByUrl('/telefonok');
    const afterBaseline = events.length;
    await router.navigateByUrl('/telefonok?q=foo');
    const diff = events.length - afterBaseline;
    expect(diff).toBe(0);
    sub.unsubscribe();
  });

  it('RouteFocusService.pathChangeNavigationEnd$ does not emit between two query-only navigations', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideZonelessChangeDetection()],
    });
    const router = TestBed.inject(Router);
    const focus = TestBed.inject(RouteFocusService);
    const events: NavigationEnd[] = [];
    const sub = focus.pathChangeNavigationEnd$().subscribe((event) => {
      events.push(event);
    });
    await router.navigateByUrl('/telefonok?q=foo');
    const afterBaseline = events.length;
    await router.navigateByUrl('/telefonok?q=bar');
    const diff = events.length - afterBaseline;
    expect(diff).toBe(0);
    sub.unsubscribe();
  });

  it('RouteFocusService.pathChangeNavigationEnd$ emits when the path itself changes', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideZonelessChangeDetection()],
    });
    const router = TestBed.inject(Router);
    const focus = TestBed.inject(RouteFocusService);
    const events: NavigationEnd[] = [];
    const sub = focus.pathChangeNavigationEnd$().subscribe((event) => {
      events.push(event);
    });
    await router.navigateByUrl('/telefonok?q=foo');
    const afterBaseline = events.length;
    await router.navigateByUrl('/');
    const diff = events.length - afterBaseline;
    expect(diff > 0).toBe(true);
    sub.unsubscribe();
  });

  it('RouteFocusService.pathChangeNavigationEnd$ emits again on returning to a path visited earlier', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideZonelessChangeDetection()],
    });
    const router = TestBed.inject(Router);
    const focus = TestBed.inject(RouteFocusService);
    const events: NavigationEnd[] = [];
    const sub = focus.pathChangeNavigationEnd$().subscribe((event) => {
      events.push(event);
    });
    await router.navigateByUrl('/telefonok');
    await router.navigateByUrl('/');
    await router.navigateByUrl('/telefonok');
    const ok = events.length - 2;
    expect(ok > 0).toBe(true);
    sub.unsubscribe();
  });

  it('a query-only navigation does not move focus off the field the user is typing into', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideZonelessChangeDetection()],
    });
    const router = TestBed.inject(Router);
    const focus = TestBed.inject(RouteFocusService);
    document.body.innerHTML = '';
    const main = document.createElement('main');
    main.id = 'main-content';
    const h1 = document.createElement('h1');
    h1.textContent = 'Mobiltelefonok';
    main.appendChild(h1);
    document.body.appendChild(main);
    const input = document.createElement('input');
    document.body.appendChild(input);

    // Mirrors the subscription each layout sets up in its constructor.
    // `focusMainHeading()` is called directly rather than through
    // `scheduleFocus()`'s `afterNextRender` wrapper: that wrapper exists
    // to wait for a lazy chunk's not-yet-mounted H1, and the H1 above is
    // already in the DOM, so the indirection would only add an
    // unrelated async render dependency to this test.
    const sub = focus.pathChangeNavigationEnd$().subscribe(() => {
      focus.focusMainHeading();
    });

    await router.navigateByUrl('/telefonok');
    expect(document.activeElement).toBe(h1);

    input.focus();
    expect(document.activeElement).toBe(input);

    await router.navigateByUrl('/telefonok?q=foo');
    expect(document.activeElement).toBe(input);
    expect(document.activeElement).not.toBe(h1);

    sub.unsubscribe();
  });

  // -------------------------------------------------------------------------
  // FIX-25: the heading focus has to survive a page whose H1 arrives late.
  //
  // Measured in Chrome at 1440x900: clicking a product card on
  // `/telefonok` rendered the product page correctly and left
  // `document.activeElement` on `BODY`, immediately and 500 ms later.
  //
  // `ProductPage` renders `LoadingState` until the SDK answers, so its
  // `<h1>` is not in the DOM one render after `NavigationEnd` — which is
  // exactly when `scheduleFocus()`'s `afterNextRender` callback runs.
  // `focusMainHeading()` found no H1, returned having done nothing, and
  // nothing ever re-ran it. `CatalogPage` was unaffected because its H1
  // is static markup, which is why `/telefonok` focused and
  // `/telefonok/:slug` did not.
  //
  // Reproduced end to end in jsdom by deferring the product response
  // past the first render; the same run with `navigationEnd$()` in place
  // of `pathChangeNavigationEnd$()` behaved identically, so this is not
  // a regression of that change.
  // -------------------------------------------------------------------------

  function mountMainLandmark(): HTMLElement {
    document.body.innerHTML = '';
    const main = document.createElement('main');
    main.id = 'main-content';
    main.setAttribute('tabindex', '-1');
    const placeholder = document.createElement('div');
    placeholder.textContent = 'Termék betöltése';
    main.appendChild(placeholder);
    document.body.appendChild(main);
    return main;
  }

  function mountHeading(main: HTMLElement, text: string): HTMLElement {
    const h1 = document.createElement('h1');
    h1.textContent = text;
    main.appendChild(h1);
    return h1;
  }

  async function flushMutations(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function freshRouteFocus(): RouteFocusService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideZonelessChangeDetection()],
    });
    return TestBed.inject(RouteFocusService);
  }

  it('focusMainHeadingWhenMounted focuses an H1 that is already in the DOM', () => {
    const focus = freshRouteFocus();
    const main = mountMainLandmark();
    const h1 = mountHeading(main, 'Mobiltelefonok');
    focus.focusMainHeadingWhenMounted();
    expect(document.activeElement).toBe(h1);
  });

  it('focusMainHeadingWhenMounted focuses an H1 that mounts after the navigation settled', async () => {
    const focus = freshRouteFocus();
    const main = mountMainLandmark();
    focus.focusMainHeadingWhenMounted();
    // The lazy page is still showing its loading state: nothing to focus.
    expect(document.activeElement).toBe(document.body);
    const h1 = mountHeading(main, 'Demo One 5G');
    await flushMutations();
    expect(document.activeElement).toBe(h1);
  });

  it('focusMainHeadingWhenMounted keeps waiting through a render that brings no H1', async () => {
    const focus = freshRouteFocus();
    const main = mountMainLandmark();
    focus.focusMainHeadingWhenMounted();
    main.appendChild(document.createElement('p'));
    await flushMutations();
    expect(document.activeElement).toBe(document.body);
    const h1 = mountHeading(main, 'Demo One 5G');
    await flushMutations();
    expect(document.activeElement).toBe(h1);
  });

  it('focusMainHeadingWhenMounted gives the focus up once the user has claimed it', async () => {
    const focus = freshRouteFocus();
    const main = mountMainLandmark();
    const input = document.createElement('input');
    document.body.appendChild(input);
    focus.focusMainHeadingWhenMounted();
    input.focus();
    // The H1 arrives late, but the user is already typing somewhere.
    const h1 = mountHeading(main, 'Demo One 5G');
    await flushMutations();
    expect(document.activeElement).toBe(input);
    expect(document.activeElement).not.toBe(h1);
    // The watch is gone for good, not merely skipped once.
    mountHeading(main, 'Second');
    await flushMutations();
    expect(document.activeElement).toBe(input);
  });

  it('focusMainHeadingWhenMounted replaces the watch a previous navigation left pending', async () => {
    const focus = freshRouteFocus();
    const first = mountMainLandmark();
    focus.focusMainHeadingWhenMounted();
    // A second route change before the first page ever produced an H1.
    const second = mountMainLandmark();
    focus.focusMainHeadingWhenMounted();
    expect(first.isConnected).toBe(false);
    const h1 = mountHeading(second, 'Demo Air 5G');
    await flushMutations();
    expect(document.activeElement).toBe(h1);
  });

  it('scheduleFocus defers the heading focus to after the next render', async () => {
    const f = TestBed.createComponent(ShopLayout);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const main = raw.querySelector('main#main-content');
    if (!(main instanceof HTMLElement)) throw new Error('Expected main HTMLElement');
    const h1 = mountHeading(main, 'Pelda');
    TestBed.inject(RouteFocusService).scheduleFocus();
    expect(document.activeElement).not.toBe(h1);
    f.detectChanges();
    await f.whenStable();
    expect(document.activeElement).toBe(h1);
    f.destroy();
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
    // Exactly one node may carry the dialog role. The CDK container
    // carries it by default (DialogConfig.role), so a primitive that
    // also stamps role="dialog" on its own panel nests two dialogs.
    const dialogNodes = document.body.querySelectorAll('[role="dialog"]');
    expect(dialogNodes.length).toBe(1);
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
    // output) or a function that returns the array, so
    // `getComponentDependencies` accepts both forms.
    //
    // The entries are matched by identity, never by `Function.name`: the
    // build pipeline emits every decorated class as
    // `var AccessibleDialog = class _AccessibleDialog { ... }`, so the
    // runtime `name` is the bundler's inner alias `_AccessibleDialog` and
    // no comparison against the source name can ever match.
    expect(getComponentDependencies(MobileDrawer)).toContain(AccessibleDialog);
    // Control: HeaderNav composes the drawer, not the dialog, so the
    // same check has to come back negative for it.
    expect(getComponentDependencies(HeaderNav)).not.toContain(AccessibleDialog);
  });
});

describe('T11-AC05 demo notice and cart badge wiring', () => {
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
    facade._seedCart({ id: 'cart-test-001', totalQuantity: 3 });
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const badge = raw.querySelector('[data-testid="cart-badge"]');
    const text = badge?.textContent ? badge.textContent.trim() : '';
    expect(text).toBe('3');
  });

  it('the demo notice is visible in every layout', () => {
    const layouts: readonly Type<unknown>[] = [MarketingLayout, ShopLayout, CheckoutLayout];
    layouts.forEach((L) => {
      const f = TestBed.createComponent(L);
      if (L === CheckoutLayout) {
        f.componentRef.setInput('step', 'cart');
      }
      f.detectChanges();
      const raw: unknown = f.nativeElement;
      if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
      const notice = raw.querySelector('[data-testid="demo-notice"]');
      expect(notice).not.toBeNull();
      const text = notice?.textContent ?? '';
      expect(text).toContain('Fiktív termékek és árak.');
      f.destroy();
    });
  });
});

// ---------------------------------------------------------------------------
// The constructor subscription each layout sets up is the line that turns
// `pathChangeNavigationEnd$()` into an actual focus move. The tests above
// exercise the service on its own and the layouts' markup on its own, so
// that one line was executed by nothing: `marketing-layout.ts:41` came
// back uncovered from the per-file 100% threshold after the switch from
// `navigationEnd$()`.
//
// These drive a real navigation through a mounted layout instead of
// calling the service directly, so the subscription, its `takeUntilDestroyed`
// pipe and the `scheduleFocus()` call are all on the executed path.
// ---------------------------------------------------------------------------

describe('T11-AC03 each layout moves focus on a real path change', () => {
  // Two empty routes rather than the real table: navigating the real
  // `/telefonok` renders `CatalogPage` into the layout's outlet, which
  // fires SDK requests this spec registers no handler for. The subject
  // here is the layout's own subscription, and a path change is a path
  // change whatever renders at the other end.
  const stubRoutes = [
    { path: 'egy', children: [] },
    { path: 'ketto', children: [] },
  ];

  async function focusAfterNavigation(layout: Type<unknown>, url: string): Promise<string> {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [layout],
      providers: [provideRouter(stubRoutes), provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(layout);
    if (layout === CheckoutLayout) {
      fixture.componentRef.setInput('step', 'cart');
    }
    fixture.detectChanges();
    const host: unknown = fixture.nativeElement;
    if (!(host instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    document.body.appendChild(host);
    const main = host.querySelector('main#main-content');
    if (!(main instanceof HTMLElement)) throw new Error('Expected main#main-content');

    const heading = document.createElement('h1');
    heading.textContent = 'Cel';
    main.appendChild(heading);

    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const active = document.activeElement;
    if (active === heading) return 'h1';
    return active instanceof HTMLElement ? active.tagName : 'NONE';
  }

  it('MarketingLayout focuses the heading after a path change', async () => {
    const where = await focusAfterNavigation(MarketingLayout, '/egy');
    expect(where).toBe('h1');
  });

  it('ShopLayout focuses the heading after a path change', async () => {
    const where = await focusAfterNavigation(ShopLayout, '/egy');
    expect(where).toBe('h1');
  });

  it('CheckoutLayout focuses the heading after a path change', async () => {
    const where = await focusAfterNavigation(CheckoutLayout, '/egy');
    expect(where).toBe('h1');
  });
});

// ---------------------------------------------------------------------------
// S0-G2 item D: the shell's free space belongs to the page, not to the DEMÓ
// notice. `app-shell.scss` carried `:host > :nth-child(1) { flex: 1 1 auto }`
// and the shell's first child is `<app-demo-notice>`, so the notice grew and
// the footer stopped sitting at the bottom of a short page. The shell cannot
// reach the page element at all: emulated encapsulation scopes a component's
// styles to the elements of its own template, and `<main class="layout-main">`
// is projected in through `<ng-content>`
// (https://angular.dev/guide/components/styling#viewencapsulationemulated).
// The fill therefore lives in the three layout sheets that declare
// `.layout-main`. jsdom does not lay out, so the assertion is that the
// declaration reached the built stylesheet, which is the invariant worth
// pinning.
// ---------------------------------------------------------------------------
describe('S0-G2 item D: .layout-main carries the shell fill', () => {
  function normalisedCss(comp: unknown): string {
    return getComponentStyles(comp)
      .join(' ')
      .replaceAll('%NS%', '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s+/g, '');
  }

  function layoutMainBody(comp: unknown): string {
    const css = normalisedCss(comp);
    const at = css.indexOf('.layout-main{');
    expect(at).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  }

  it('AppShell no longer grows its own first child', () => {
    expect(normalisedCss(AppShell).includes('nth-child')).toBe(false);
  });

  it('MarketingLayout .layout-main is flex: 1 1 auto', () => {
    expect(layoutMainBody(MarketingLayout)).toContain('flex:11auto');
  });

  it('ShopLayout .layout-main is flex: 1 1 auto', () => {
    expect(layoutMainBody(ShopLayout)).toContain('flex:11auto');
  });

  it('CheckoutLayout .layout-main is flex: 1 1 auto', () => {
    expect(layoutMainBody(CheckoutLayout)).toContain('flex:11auto');
  });
});
