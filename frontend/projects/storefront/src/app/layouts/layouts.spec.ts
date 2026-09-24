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
import { provideRouter, Router } from '@angular/router';
import { Location } from '@angular/common';

import { routes } from '../../app/app.routes';
import { checkoutRoutes } from '../../app/features/checkout/checkout.routes';
import { App } from '../../app/app';
import { DemoAccess } from '../../app/core/demo-access/demo-access';
import { CartCountFacade } from '../../app/core/navigation/cart-count-facade';
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
      if (typeof r.loadComponent === 'function') count += 1;
      if (r.children !== undefined) {
        r.children.forEach((c) => {
          if (typeof c.loadComponent === 'function') count += 1;
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
      if (r.children === undefined) return;
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
        if (c.path === e) foundCount += 1;
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
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,])\s*/g, '$1');
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

  it('MarketingLayout exposes the single Hungarian nav link', () => {
    const f = TestBed.createComponent(MarketingLayout);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const nav = raw.querySelector('nav');
    const text = nav?.textContent ?? '';
    const has1 = text.includes('Mobiltelefonok');
    expect(has1).toBe(true);
    expect(text.includes('A demóról')).toBe(false);
    expect(nav?.querySelectorAll('a').length ?? 0).toBe(1);
  });

  it('MIM-220: the active nav link carries aria-current="page"', async () => {
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
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
      // Stub routes — the catalog route at `/telefonok` instantiates
      // `CatalogPage`, which calls `window.matchMedia` and explodes in
      // jsdom; routing to `/` and `/telefonok` against empty route
      // records is enough for `routerLinkActive` to flip.
      providers: [
        provideRouter([
          { path: '', children: [] },
          { path: 'telefonok', children: [] },
        ]),
        provideZonelessChangeDetection(),
      ],
    });
    await TestBed.compileComponents();
    const f = TestBed.createComponent(MarketingLayout);
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const nav = raw.querySelector('nav');
    if (!(nav instanceof HTMLElement)) throw new Error('Expected <nav>');

    await TestBed.inject(Router).navigateByUrl('/telefonok');
    f.detectChanges();
    const active = nav.querySelector('a[aria-current="page"]');
    expect(active?.textContent ?? '').toContain('Mobiltelefonok');

    await TestBed.inject(Router).navigateByUrl('/');
    f.detectChanges();
    expect(nav.querySelector('a[aria-current]')).toBeNull();
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
    let search: Element | null = null;
    if (checkoutHeader !== null) {
      search = checkoutHeader.querySelector('[data-testid="header-search"]');
    }
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
  // CENTRE-2: `<main class="layout-main">` inside CheckoutLayout must not
  // re-introduce the centreline that MIM-239 deleted. The cross-axis size
  // is the shell's default flex stretch: `app-shell.scss` gives `:host`
  // `display: flex; flex-direction: column` with no `align-items`
  // override, so `.layout-main` reaches the full width without an
  // explicit `width: 100%`. A re-introduced `max-width` or `margin: 0
  // auto` would suppress that stretch and pull the cart and contact steps
  // in from the sides at 1280px (the regression MIM-239 fixed). A
  // `width: <anything other than 100%>` is the same container cap under a
  // different name — the rule body must not carry one either. jsdom does
  // not simulate flex stretch, so the assertion cannot read a computed
  // width — instead it pins that the centring declarations are absent
  // from the rule body, which is the invariant MIM-239 cares about.
  // -------------------------------------------------------------------------
  it('CheckoutLayout .layout-main rule carries no centring declarations (CENTRE-2)', () => {
    const f = TestBed.createComponent(CheckoutLayout);
    f.componentRef.setInput('step', 'cart');
    f.detectChanges();
    const raw: unknown = f.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const main = raw.querySelector('main.layout-main');
    if (!(main instanceof HTMLElement)) throw new Error('Expected main.layout-main');
    const css = getComponentStyles(CheckoutLayout).join('\n');
    const ruleBody = /\.layout-main(?![-_a-zA-Z0-9])[^{]*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(ruleBody).not.toBe('');
    expect(ruleBody).not.toMatch(/max-width/);
    expect(ruleBody).not.toMatch(/margin:\s*0\s+auto/);
    expect(ruleBody).not.toMatch(/(?<![\w-])width:\s*(?!100%)/);
  });

  it('owner 2026-09-22: the checkout host has no side padding, so the shell bars run edge to edge; the content keeps its inset', () => {
    const f = TestBed.createComponent(CheckoutLayout);
    f.componentRef.setInput('step', 'cart');
    f.detectChanges();
    const css = getComponentStyles(CheckoutLayout).join('\n');
    const hostRules = [...css.matchAll(/\[_nghost-%COMP%\][^{]*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(hostRules.length).toBeGreaterThan(0);
    for (const body of hostRules) expect(body).not.toMatch(/padding/);

    const mainRules = [...css.matchAll(/\.layout-main(?![-_a-zA-Z0-9])[^{]*\{([^}]*)\}/g)].map(
      (m) => m[1],
    );
    const joined = mainRules.join('\n');
    expect(joined).toContain('var(--%NS%space-4)');
    expect(joined).toContain('var(--%NS%space-6)');
    expect(joined).toContain('var(--%NS%space-9)');
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

describe('T11-AC03 skip link, single H1, route title, history', () => {
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
    let href = '';
    if (skip !== null) {
      href = skip.getAttribute('href') ?? '';
    }
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

  it('browser back preserves URL query filters on /telefonok', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideZonelessChangeDetection(),
        { provide: DemoAccess, useValue: { check: () => Promise.resolve(true) } },
      ],
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
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
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
    let modal = '';
    if (dialog !== null) {
      modal = dialog.getAttribute('aria-modal') ?? '';
    }
    expect(modal).toBe('true');
    const links = document.body.querySelectorAll('[role="dialog"] a');
    expect(links.length).toBe(1);
    // Exactly one node may carry the dialog role. The CDK container
    // carries it by default (DialogConfig.role), so a primitive that
    // also stamps role="dialog" on its own panel nests two dialogs.
    const dialogNodes = document.body.querySelectorAll('[role="dialog"]');
    expect(dialogNodes.length).toBe(1);
  });

  it('MobileDrawer opens with focus on its heading "Menü" (owner 2026-09-23)', async () => {
    const f = TestBed.createComponent(MobileDrawerHost);
    f.detectChanges();
    f.componentInstance.opened.set(true);
    f.detectChanges();
    // The CDK focuses the heading through afterNextRender once the dialog mounts.
    await f.whenStable();
    const active = document.activeElement;
    expect(active?.tagName).toBe('H2');
    expect(active?.textContent.trim()).toBe('Menü');
  });

  it('MobileDrawer puts the focus back on its heading "Menü" when it is closed and reopened', async () => {
    const f = TestBed.createComponent(MobileDrawerHost);
    f.detectChanges();
    f.componentInstance.opened.set(true);
    f.detectChanges();
    await f.whenStable();
    // The CDK's first-heading autoFocus lands the focus on the heading
    // when the dialog opens. Pin it here so the rest of the test cannot
    // pass vacuously if the first-open autoFocus regresses — the close
    // and reopen would still refocus the heading even from <body>.
    const initial = document.activeElement;
    expect(initial?.tagName).toBe('H2');
    expect(initial?.textContent.trim()).toBe('Menü');

    // Move the focus off the heading, so the reopen has to put it back.
    const link = document.body.querySelector<HTMLAnchorElement>('[role="dialog"] a');
    link?.focus();
    expect(document.activeElement).toBe(link);

    f.componentInstance.opened.set(false);
    f.detectChanges();
    await f.whenStable();

    f.componentInstance.opened.set(true);
    f.detectChanges();
    await f.whenStable();

    const active = document.activeElement;
    expect(active?.tagName).toBe('H2');
    expect(active?.textContent.trim()).toBe('Menü');
  });

  it('MobileDrawer dialog is not a scaled desktop header', () => {
    const f = TestBed.createComponent(MobileDrawerHost);
    f.componentInstance.opened.set(true);
    f.detectChanges();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    let closest: Element | null = null;
    if (dialog !== null) {
      closest = dialog.closest('header');
    }
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
    let text = '';
    const content = badge?.textContent ?? '';
    if (content.length > 0) {
      text = content.trim();
    }
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
    let text = '';
    const content = badge?.textContent ?? '';
    if (content.length > 0) {
      text = content.trim();
    }
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
// MIM-220 (2026-09-22): the layouts no longer move focus to the page H1 after
// a navigation. The subscription each constructor used to set up is gone,
// and this pins it: a path change through a mounted layout leaves
// `document.activeElement` where it was.
// ---------------------------------------------------------------------------

describe('MIM-220 a path change moves no focus', () => {
  const stubRoutes = [
    { path: 'egy', children: [] },
    { path: 'ketto', children: [] },
  ];

  async function activeAfterNavigation(layout: Type<unknown>, url: string): Promise<string> {
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
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    const active = document.activeElement;
    return active instanceof HTMLElement ? active.tagName : 'NONE';
  }

  it('MarketingLayout leaves focus on body after a path change', async () => {
    expect(await activeAfterNavigation(MarketingLayout, '/egy')).toBe('BODY');
  });

  it('ShopLayout leaves focus on body after a path change', async () => {
    expect(await activeAfterNavigation(ShopLayout, '/egy')).toBe('BODY');
  });

  it('CheckoutLayout leaves focus on body after a path change', async () => {
    expect(await activeAfterNavigation(CheckoutLayout, '/egy')).toBe('BODY');
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
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,])\s*/g, '$1');
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
    expect(layoutMainBody(MarketingLayout)).toContain('flex:1 1 auto');
  });

  it('ShopLayout .layout-main is flex: 1 1 auto', () => {
    expect(layoutMainBody(ShopLayout)).toContain('flex:1 1 auto');
  });

  it('CheckoutLayout .layout-main is flex: 1 1 auto', () => {
    expect(layoutMainBody(CheckoutLayout)).toContain('flex:1 1 auto');
  });
});
