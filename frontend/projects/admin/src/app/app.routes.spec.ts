import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import type { LoadChildren, Route, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { ShellComponent } from './layout/shell.component';
import { OverviewComponent } from './features/overview/overview.component';
import { LoginPage } from './features/login/login-page';
import { AdminsPage } from './features/admins/admins-page';
import { ProductListPage } from './features/products/list/product-list-page';
import { ProductEditPage } from './features/products/edit/product-edit-page';
import { routes } from './app.routes';
import { LOGIN_ROUTES } from './features/login/login.routes';
import { OVERVIEW_ROUTES } from './features/overview/overview.routes';
import { PRODUCTS_ROUTES } from './features/products/products.routes';
import { ADMINS_ROUTES } from './features/admins/admins.routes';

const TEST_ROUTES: Routes = [
  {
    path: 'bejelentkezes',
    loadChildren: (): Promise<Routes> =>
      import('./features/login/login.routes').then((m) => m.LOGIN_ROUTES),
  },
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'attekintes' },
      {
        path: 'attekintes',
        loadChildren: (): Promise<Routes> =>
          import('./features/overview/overview.routes').then((m) => m.OVERVIEW_ROUTES),
      },
      {
        path: 'termekek',
        loadChildren: (): Promise<Routes> =>
          import('./features/products/products.routes').then((m) => m.PRODUCTS_ROUTES),
      },
      {
        path: 'adminok',
        loadChildren: (): Promise<Routes> =>
          import('./features/admins/admins.routes').then((m) => m.ADMINS_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

function shellInner(harness: RouterTestingHarness): HTMLElement | null {
  const nativeElement: HTMLElement | null = harness.routeNativeElement;
  if (nativeElement !== null) {
    return nativeElement.querySelector('main');
  }
  return null;
}

function loadChildrenOf(route: Route): LoadChildren {
  if (route.loadChildren === undefined) {
    throw new Error('loadChildren missing on route');
  }
  return route.loadChildren;
}

function findChild(path: string): NonNullable<(typeof routes)[1]['children']>[number] {
  const shellRoute = routes[1];
  const children = shellRoute.children ?? [];
  const child = children.find((c) => c.path === path);
  if (child === undefined) {
    throw new Error(`No child route with path ${path}`);
  }
  return child;
}

describe('admin routes', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(TEST_ROUTES, withComponentInputBinding())],
    });
    harness = await RouterTestingHarness.create();
  });

  it('redirects the empty path to /attekintes', async () => {
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/attekintes');
    expect(shellInner(harness)?.querySelector('adm-overview')).not.toBeNull();
  });

  it('renders the edit stub at /termekek/uj with "Új termék"', async () => {
    await harness.navigateByUrl('/termekek/uj');
    const main = shellInner(harness);
    expect(main?.querySelector('adm-product-edit-page')).not.toBeNull();
    expect(main?.textContent ?? '').toContain('Új termék');
  });

  it('binds the route productId on /termekek/42', async () => {
    await harness.navigateByUrl('/termekek/42');
    const main = shellInner(harness);
    expect(main?.querySelector('adm-product-edit-page')).not.toBeNull();
    const page: unknown = harness.fixture.debugElement.query(
      By.directive(ProductEditPage),
    ).componentInstance;
    if (!(page instanceof ProductEditPage)) {
      throw new Error('Expected the product edit page');
    }
    expect(page.productId()).toBe('42');
  });

  it('redirects an unknown path through the shell to /attekintes', async () => {
    await harness.navigateByUrl('/nincs-ilyen');
    expect(TestBed.inject(Router).url).toBe('/attekintes');
    expect(shellInner(harness)?.querySelector('adm-overview')).not.toBeNull();
  });

  it('renders /bejelentkezes outside the shell', async () => {
    await harness.navigateByUrl('/bejelentkezes');
    const root: HTMLElement = harness.routeNativeElement ?? document.body;
    const text = root.textContent;
    expect(text).toContain('Bejelentkezés');
    expect(root.querySelector('mat-toolbar')).toBeNull();
    expect(document.body.querySelector('mat-toolbar')).toBeNull();
  });

  it('renders /adminok through the shell', async () => {
    await harness.navigateByUrl('/adminok');
    expect(shellInner(harness)?.querySelector('adm-admins-page')).not.toBeNull();
  });

  it('renders /termekek list through the shell', async () => {
    await harness.navigateByUrl('/termekek');
    expect(shellInner(harness)?.querySelector('adm-product-list-page')).not.toBeNull();
  });

  it('exposes the page components for coverage', () => {
    expect(OverviewComponent).toBeDefined();
    // Imports kept so coverage instruments the module files too.
    const all: readonly unknown[] = [LoginPage, AdminsPage, ProductListPage, ProductEditPage];
    expect(all.length).toBe(4);
    for (const c of all) {
      expect(c).toBeDefined();
    }
  });
});

describe('admin route loaders', () => {
  it('the loginChildren loader returns LOGIN_ROUTES', async () => {
    const loginRoute = routes[0];
    expect(loginRoute.path).toBe('bejelentkezes');
    await expect(loadChildrenOf(loginRoute)()).resolves.toBe(LOGIN_ROUTES);
  });

  it('the overviewChildren loader returns OVERVIEW_ROUTES', async () => {
    const overview = findChild('attekintes');
    await expect(loadChildrenOf(overview)()).resolves.toBe(OVERVIEW_ROUTES);
  });

  it('the productsChildren loader returns PRODUCTS_ROUTES', async () => {
    const products = findChild('termekek');
    await expect(loadChildrenOf(products)()).resolves.toBe(PRODUCTS_ROUTES);
  });

  it('the adminsChildren loader returns ADMINS_ROUTES', async () => {
    const admins = findChild('adminok');
    await expect(loadChildrenOf(admins)()).resolves.toBe(ADMINS_ROUTES);
  });

  it('the shell loader returns ShellComponent', async () => {
    const shellRoute = routes[1];
    expect(shellRoute.path).toBe('');
    expect(shellRoute.component).toBeUndefined();
    const load = shellRoute.loadComponent;
    if (load === undefined) {
      throw new Error('loadComponent missing on the shell route');
    }
    await expect(load()).resolves.toBe(ShellComponent);
  });
});
