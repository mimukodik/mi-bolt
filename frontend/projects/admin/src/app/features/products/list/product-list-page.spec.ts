/**
 * Spec for `ProductListPage` (MIM-351, F16a): the sortable header row
 * outside a `cdk-virtual-scroll-viewport`, the loading/empty/error
 * states, the loaded-count footer, and the deep-linkable sort and
 * filter-clear query. The filter row (search, brand, status, chips)
 * is F16b and is not exercised here; every scenario below reaches it
 * only through the query string, the same way a deep link would.
 */
import { BreakpointObserver } from '@angular/cdk/layout';
import { ANIMATION_MODULE_TYPE, Component } from '@angular/core';
import type { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, firstValueFrom, of } from 'rxjs';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { provideApiConfiguration } from '../../../api/generated/api-configuration';

import { useMswServer, server } from '../../../../testing/msw-server';
import { issueXsrfCookie } from '../../../../mocks/guards';
import { createDb } from '../../../../mocks/db';
import type { MockDb } from '../../../../mocks/db';
import type { ScenarioName } from '../../../../mocks/scenario';
import { productsReadHandlers } from '../../../../mocks/products-read.handlers';
import { serviceUnavailable } from '../../../../mocks/backend-answers';
import { SEED_ADMIN } from '../../../../mocks/seed';

import { ProductListPage } from './product-list-page';

useMswServer();

// See confirm-dialog.spec.ts:25 — the NoopAnimations spelling this
// workspace uses, since `@angular/platform-browser/animations` is not
// installed and Material only reads the token.
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

const HANDSET_OBSERVER: Provider = {
  provide: BreakpointObserver,
  useValue: { observe: () => of({ matches: true, breakpoints: {} }) },
};

@Component({ selector: 'adm-new-product-stub', template: 'uj' })
class NewProductStub {}

@Component({ selector: 'adm-product-edit-stub', template: 'edit' })
class ProductEditStub {}

/** Wait for the next `NavigationEnd` emitted by `router.events`. The
 *  store's `setQuery(...)` triggers a `router.navigate(...)`, and the
 *  router emits `NavigationEnd` exactly once on a successful run;
 *  resolving on that event is the supported wait for the navigation
 *  the test caused, without sleeping for an arbitrary amount of time.
 *  See angular.dev/api/router/NavigationEnd — "An event triggered
 *  when a navigation ends successfully." */
function nextNavigationEnd(router: Router): Promise<NavigationEnd> {
  return firstValueFrom(
    router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
  );
}

function configureTestBed(extraProviders: readonly Provider[] = []): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'termekek', component: ProductListPage },
        { path: 'termekek/uj', component: NewProductStub },
        { path: 'termekek/:productId', component: ProductEditStub },
      ]),
      provideHttpClient(withXhr()),
      provideApiConfiguration(new URL('/api/v1', document.baseURI).href),
      NOOP_ANIMATIONS,
      ...extraProviders,
    ],
  });
}

function seed(scenario: ScenarioName = 'default'): MockDb {
  const db = createDb(scenario);
  db.sessionAdminId = SEED_ADMIN.id;
  issueXsrfCookie(db);
  const mswServer = server;
  if (mswServer === undefined) throw new Error('MSW server not initialised');
  mswServer.use(...productsReadHandlers(db));
  return db;
}

async function nav(harness: RouterTestingHarness, url: string): Promise<void> {
  await harness.navigateByUrl(url);
  await harness.fixture.whenStable();
  harness.detectChanges();
}

function rootOf(harness: RouterTestingHarness): HTMLElement {
  const el = harness.routeNativeElement;
  if (el === null) throw new Error('expected the routed page element');
  return el;
}

function rows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('adm-product-row'));
}

function rowNames(root: HTMLElement): string[] {
  return rows(root).map((row) => row.querySelector('.adm-name')?.textContent.trim() ?? '');
}

function cellsOf(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>('[role="cell"]'));
}

function sortHeaders(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[mat-sort-header]'));
}

describe('ProductListPage', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('loads the default query: title, count, the first three rows, and the third row’s cells', async () => {
    // Fails if the store is not provided per-page, the header title/count
    // markup drifts, the row order stops following the data source, or any
    // of the third row's cells (brand, variants, price, stock, star, status,
    // swatches, edit link) stops reading from the loaded item.
    seed();
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek');
    const root = rootOf(harness);

    expect(root.querySelector('h1')?.textContent.trim()).toBe('Termékek');
    expect(root.querySelector('.adm-count')?.textContent.trim()).toBe('46 termék');

    const renderedRows = rows(root);

    const names = rowNames(root);
    expect(names.slice(0, 3)).toEqual([
      'Motorola Edge 50 Fusion',
      'Honor X7D',
      'Apple iPhone 18 Pro Max',
    ]);

    const thirdRow = renderedRows[2];
    expect(thirdRow).toBeDefined();
    const cells = cellsOf(thirdRow);
    expect(cells[2]?.textContent.trim()).toBe('Apple');
    expect(cells[4]?.textContent.trim()).toBe('7');
    const NBSP = String.fromCharCode(0xa0);
    const DASH = String.fromCharCode(0x2013);
    expect(cells[5]?.textContent.trim()).toBe(`599${NBSP}990${DASH}717${NBSP}990${NBSP}Ft`);
    expect(cells[6]?.textContent.trim()).toBe('44');
    expect(thirdRow.querySelector('mat-icon[aria-label="Kiemelt"]')).not.toBeNull();
    expect(cells[8]?.textContent.trim()).toBe('Aktív');
    expect(thirdRow.querySelectorAll('.adm-swatch').length).toBe(4);

    const editLink = thirdRow.querySelector('a');
    expect(editLink?.getAttribute('aria-label')).toBe('Szerkesztés: Apple iPhone 18 Pro Max');
    expect(editLink?.getAttribute('href')?.endsWith('/termekek/3')).toBe(true);

    expect(root.querySelector('[role="table"]')?.getAttribute('aria-rowcount')).toBe('47');
    expect(renderedRows[0]?.getAttribute('aria-rowindex')).toBe('2');

    expect(root.querySelector('p')?.textContent.trim()).not.toBe('');
    const footer = Array.from(root.querySelectorAll('p')).find((p) =>
      p.textContent.includes('termék betöltve'),
    );
    expect(footer?.textContent.trim()).toBe('46 / 46 termék betöltve');

    const newProductLink = root.querySelector('a[matbutton], a[matButton]');
    expect(newProductLink?.getAttribute('href')?.endsWith('/termekek/uj')).toBe(true);
  });

  it('exposes exactly five sortable headers, in order, with their field ids and labels', async () => {
    // Fails if a header stops carrying `mat-sort-header`, if the order
    // drifts from the plan's column order, or if a label text changes.
    seed();
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek');
    const root = rootOf(harness);

    const headers = sortHeaders(root);
    expect(headers.map((header) => header.getAttribute('mat-sort-header'))).toEqual([
      'name',
      'brand',
      'minPrice',
      'totalStock',
      'featured',
    ]);
    expect(headers.map((header) => header.textContent.trim())).toEqual([
      'Név',
      'Márka',
      'Ár',
      'Készlet',
      'Kiemelt',
    ]);
  });

  it('clicking a header writes the sort query, disableClear keeps it on desc, and a new column resets to its own start', async () => {
    // Fails if `onSortChange` drops its guard for an empty direction or an
    // unsortable column id, or if it stops forwarding `{ sort, direction }`
    // to `store.setQuery`.
    seed();
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek');
    const root = rootOf(harness);
    const router = TestBed.inject(Router);

    const nameHeader = sortHeaders(root).find(
      (header) => header.getAttribute('mat-sort-header') === 'name',
    );
    if (nameHeader === undefined) throw new Error('name header missing');

    let navigated = nextNavigationEnd(router);
    nameHeader.click();
    await navigated;
    expect(router.parseUrl(router.url).queryParams).toEqual({ sort: 'name' });

    navigated = nextNavigationEnd(router);
    nameHeader.click();
    await navigated;
    expect(router.parseUrl(router.url).queryParams).toEqual({ sort: 'name', direction: 'desc' });

    const featuredHeader = sortHeaders(root).find(
      (header) => header.getAttribute('mat-sort-header') === 'featured',
    );
    if (featuredHeader === undefined) throw new Error('featured header missing');

    navigated = nextNavigationEnd(router);
    featuredHeader.click();
    await navigated;
    expect(router.parseUrl(router.url).queryParams).toEqual({
      sort: 'featured',
      direction: 'desc',
    });
  });

  it('a deep-linked sort renders the header as descending and reorders the rows', async () => {
    // Fails if `sortActive`/`sortDirection` stop reading the store's query,
    // or if the header's `aria-sort` stops reflecting `MatSort`'s state.
    seed();
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek?sort=minPrice&direction=desc');
    const root = rootOf(harness);

    const priceHeader = sortHeaders(root).find(
      (header) => header.getAttribute('mat-sort-header') === 'minPrice',
    );
    expect(priceHeader?.getAttribute('aria-sort')).toBe('descending');
    expect(rowNames(root)[0]).toBe('Samsung Galaxy Z Fold8 Ultra 5G');
  });

  it('Enter on the first row and a click on the second row navigate to their product', async () => {
    // Fails if the row's activation stops navigating, or navigates to the
    // wrong id for a row other than the first.
    seed();
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek');
    const root = rootOf(harness);

    const firstRow = rows(root)[0];
    firstRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/termekek/1');

    await nav(harness, '/termekek');
    const secondRow = rows(rootOf(harness))[1];
    secondRow.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/termekek/2');
  });

  it('while the first page is pending: a progress bar shows and no footer; once it lands, the footer reads 46 / 46', async () => {
    // Fails if the loading branch renders no progress bar, or if the
    // footer appears before `total()` resolves.
    seed();
    let releaseFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let released = false;
    const mswServer = server;
    if (mswServer === undefined) throw new Error('MSW server not initialised');
    mswServer.use(
      http.get('*/api/v1/admin/products', async () => {
        if (released) return undefined;
        await firstPending;
        released = true;
        return undefined;
      }),
    );

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/termekek');
    harness.detectChanges();
    const root = rootOf(harness);

    expect(root.querySelector('mat-progress-bar')).not.toBeNull();
    const footerBeforeRelease = Array.from(root.querySelectorAll('p')).find((p) =>
      p.textContent.includes('termék betöltve'),
    );
    expect(footerBeforeRelease).toBeUndefined();

    (releaseFirst ?? ((): void => undefined))();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(root.querySelector('mat-progress-bar')).toBeNull();
    const footerAfterRelease = Array.from(root.querySelectorAll('p')).find((p) =>
      p.textContent.includes('termék betöltve'),
    );
    expect(footerAfterRelease?.textContent.trim()).toBe('46 / 46 termék betöltve');
  });

  it('an empty catalogue shows the not-filtered empty message, no clear button, and a 0 / 0 footer', async () => {
    // Fails if the empty branch always shows "Szűrők törlése", or if the
    // count/footer stop reading zero from an empty page 1.
    seed('empty-catalog');
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek');
    const root = rootOf(harness);

    expect(root.textContent).toContain('Még nincs aktív termék.');
    const clearButtons = Array.from(root.querySelectorAll('button')).filter(
      (button) => button.textContent.trim() === 'Szűrők törlése',
    );
    expect(clearButtons.length).toBe(0);
    expect(root.querySelector('.adm-count')?.textContent.trim()).toBe('0 termék');
    const footer = Array.from(root.querySelectorAll('p')).find((p) =>
      p.textContent.includes('termék betöltve'),
    );
    expect(footer?.textContent.trim()).toBe('0 / 0 termék betöltve');
  });

  it('a query that matches nothing shows the filtered empty message; Szűrők törlése resets filters but keeps the sort', async () => {
    // Fails if `filtered()` stops detecting a non-default query, or if
    // `clearFilters()` also resets the sort it must leave untouched.
    seed();
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek?q=nincs-ilyen-termek&sort=name');
    const root = rootOf(harness);

    expect(root.textContent).toContain('Nincs a szűrésnek megfelelő termék.');

    const router = TestBed.inject(Router);
    const clearButton = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Szűrők törlése',
    );
    if (clearButton === undefined) throw new Error('Szűrők törlése button missing');
    expect(getComputedStyle(clearButton).alignSelf).toBe('flex-start');

    const title = root.querySelector('h1');
    if (!(title instanceof HTMLElement)) throw new Error('page title missing');

    const navigated = nextNavigationEnd(router);
    clearButton.click();
    expect(document.activeElement).toBe(title);
    await navigated;
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(document.activeElement).toBe(title);
    expect(title.getAttribute('tabindex')).toBe('-1');
    expect(router.parseUrl(router.url).queryParams).toEqual({ sort: 'name' });
    expect(rowNames(rootOf(harness))[0]).toBe('Apple iPhone 16');
  });

  it('a failed load shows the alert and Újra; a retry clears it and reloads the first page', async () => {
    // Fails if the error branch renders no `role="alert"`, or if `Újra`
    // stops calling `store.retry()`.
    seed();
    const mswServer = server;
    if (mswServer === undefined) throw new Error('MSW server not initialised');
    mswServer.use(http.get('*/api/v1/admin/products', () => serviceUnavailable(), { once: true }));

    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek');
    const root = rootOf(harness);

    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent.trim()).toBe('A termékek betöltése nem sikerült.');
    expect(root.querySelector('[role="table"]')?.getAttribute('aria-rowcount')).toBe('-1');

    const retryButton = Array.from(root.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Újra',
    );
    if (retryButton === undefined) throw new Error('Újra button missing');
    expect(getComputedStyle(retryButton).alignSelf).toBe('flex-start');
    const title = root.querySelector('h1');
    if (!(title instanceof HTMLElement)) throw new Error('page title missing');

    retryButton.click();
    expect(document.activeElement).toBe(title);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(document.activeElement).toBe(title);
    expect(title.getAttribute('tabindex')).toBe('-1');
    expect(rootOf(harness).querySelector('[role="alert"]')).toBeNull();
    expect(rowNames(rootOf(harness))[0]).toBe('Motorola Edge 50 Fusion');
  });

  it('handset: the header holds exactly one sortable column, and the third row is condensed into one summary line', async () => {
    // Fails if the handset header branch renders more than the one Név
    // sort header, or if the row's condensed summary drops a field.
    configureTestBed([HANDSET_OBSERVER]);
    seed();
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek');
    const root = rootOf(harness);

    const headers = sortHeaders(root);
    expect(headers.length).toBe(1);
    expect(headers[0]?.getAttribute('mat-sort-header')).toBe('name');

    const thirdRow = rows(root)[2];
    expect(thirdRow).toBeDefined();
    const NBSP = String.fromCharCode(0xa0);
    const DASH = String.fromCharCode(0x2013);
    const summary = thirdRow.querySelector('.adm-slug');
    expect(summary?.textContent.trim()).toBe(
      `Apple · 599${NBSP}990${DASH}717${NBSP}990${NBSP}Ft · 44 db`,
    );
  });
});
