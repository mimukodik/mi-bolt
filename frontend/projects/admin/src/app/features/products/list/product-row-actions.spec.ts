/**
 * Spec for `ProductRowActions` (MIM-352, F17): the Termékek row menu —
 * Archiválás behind the shared confirm dialog, Visszaállítás on an
 * archived row, and the undo snack-bar that restores with the version
 * the archive returned. Mounted through the whole `ProductListPage` so
 * the component injects the page's own `ProductListStore` instance.
 */
import { ANIMATION_MODULE_TYPE, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockResult } from 'vitest';

import { provideApiConfiguration } from '../../../api/generated/api-configuration';
import { ifMatchInterceptor } from '../../../core/api/if-match.interceptor';

import { useMswServer, server } from '../../../../testing/msw-server';
import { createDb } from '../../../../mocks/db';
import type { MockDb } from '../../../../mocks/db';
import type { ScenarioName } from '../../../../mocks/scenario';
import { productsReadHandlers } from '../../../../mocks/products-read.handlers';
import { productsWriteHandlers } from '../../../../mocks/products-write.handlers';
import { SEED_ADMIN } from '../../../../mocks/seed';

import { ProductListPage } from './product-list-page';
import { ProductListStore } from './product-list.store';
import { ProductRowActions } from './product-row-actions';

useMswServer();

const TEST_XSRF_TOKEN = 'test-xsrf-token';

/** Stamps the fixed token on every write, the way `product-edit-page.spec.ts` does. */
const addXsrfInterceptor: HttpInterceptorFn = (request, next) =>
  next(request.clone({ setHeaders: { 'X-XSRF-TOKEN': TEST_XSRF_TOKEN } }));

// See confirm-dialog.spec.ts:25 — the NoopAnimations spelling this
// workspace uses, since `@angular/platform-browser/animations` is not
// installed and Material only reads the token.
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

@Component({ selector: 'adm-new-product-stub', template: 'uj' })
class NewProductStub {}

@Component({ selector: 'adm-product-edit-stub', template: 'edit' })
class ProductEditStub {}

function configureTestBed(): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'termekek', component: ProductListPage },
        { path: 'termekek/uj', component: NewProductStub },
        { path: 'termekek/:productId', component: ProductEditStub },
      ]),
      provideHttpClient(withXhr(), withInterceptors([ifMatchInterceptor, addXsrfInterceptor])),
      provideApiConfiguration(new URL('/api/v1', document.baseURI).href),
      NOOP_ANIMATIONS,
    ],
  });
}

function seed(scenario: ScenarioName = 'default'): MockDb {
  const db = createDb(scenario);
  db.sessionAdminId = SEED_ADMIN.id;
  db.xsrfToken = TEST_XSRF_TOKEN;
  const mswServer = server;
  if (mswServer === undefined) throw new Error('MSW server not initialised');
  mswServer.use(...productsReadHandlers(db), ...productsWriteHandlers(db));
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

function rowNamed(root: HTMLElement, name: string): HTMLElement {
  const found = rows(root).find(
    (row) => row.querySelector('.adm-name')?.textContent.trim() === name,
  );
  if (found === undefined) throw new Error(`no row named "${name}"`);
  return found;
}

function chipText(row: HTMLElement): string {
  const chip = row.querySelector('mat-chip');
  if (chip === null) throw new Error('no mat-chip in the row');
  return chip.textContent.trim();
}

function dialogButtonByLabel(label: string): HTMLButtonElement {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container button'),
  );
  const found = buttons.find((button) => button.textContent.trim() === label);
  if (found === undefined) throw new Error(`no dialog button labelled "${label}"`);
  return found;
}

function snackBarText(): string {
  const element = document.querySelector('.mat-mdc-snack-bar-container, .mat-mdc-simple-snack-bar');
  if (element === null) throw new Error('no snack-bar container in the document');
  return element.textContent.trim();
}

function menuTrigger(row: HTMLElement): HTMLButtonElement {
  const button = row.querySelector<HTMLButtonElement>('.adm-row-menu');
  if (button === null) throw new Error('no row menu trigger');
  return button;
}

function menuItems(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('.cdk-overlay-container .mat-mdc-menu-item'),
  );
}

/** The label of each open menu item: the `span`, never the icon ligature. */
function menuLabels(): string[] {
  return menuItems().map((item) => item.querySelector('span')?.textContent.trim() ?? '');
}

function snackAction(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    '.cdk-overlay-container .mat-mdc-snack-bar-action',
  );
  if (button === null) throw new Error('no snack-bar action in the document');
  return button;
}

function actionsOf(harness: RouterTestingHarness, index: number): ProductRowActions {
  const debug = harness.fixture.debugElement.queryAll(By.directive(ProductRowActions)).at(index);
  if (debug === undefined) throw new Error('no ProductRowActions for that row');
  const instance: unknown = debug.componentInstance;
  if (!(instance instanceof ProductRowActions)) throw new Error('not a ProductRowActions');
  return instance;
}

function pageStore(harness: RouterTestingHarness): ProductListStore {
  const debug = harness.fixture.debugElement.queryAll(By.directive(ProductListPage)).at(0);
  if (debug === undefined) throw new Error('no ProductListPage in the fixture');
  return debug.injector.get(ProductListStore);
}

/** The promise a spied row action returned; it resolves once the dialog, the POST and the snack-bar are done. */
function returnedPromise(result: MockResult<Promise<void>> | undefined): Promise<void> {
  if (result?.type === 'return') {
    return result.value;
  }
  throw new Error('the spied row action did not return');
}

interface PostRecord {
  readonly url: string;
  readonly ifMatch: string | null;
}

/** Records every product POST the row action fires, and how the test stops it. */
function recordProductPosts(): { readonly posts: PostRecord[]; readonly stop: () => void } {
  const posts: PostRecord[] = [];
  const listener = ({ request }: { request: Request }): void => {
    if (request.method === 'POST' && request.url.includes('/admin/products/')) {
      posts.push({ url: request.url, ifMatch: request.headers.get('If-Match') });
    }
  };
  server?.events.on('request:start', listener);
  return { posts, stop: () => server?.events.removeListener('request:start', listener) };
}

async function openMenu(harness: RouterTestingHarness, row: HTMLElement): Promise<void> {
  menuTrigger(row).click();
  await harness.fixture.whenStable();
  harness.detectChanges();
}

async function clickMenuItem(harness: RouterTestingHarness, label: string): Promise<void> {
  const item = menuItems().find((element) => element.textContent.includes(label));
  if (item === undefined) throw new Error(`no menu item labelled "${label}"`);
  item.click();
  await harness.fixture.whenStable();
  harness.detectChanges();
}

function dialogTitle(): string {
  const title = document.querySelector('.cdk-overlay-container h2');
  if (title === null) throw new Error('dialog title missing');
  return title.textContent.trim();
}

function dialogMessage(): string {
  const message = document.querySelector('.cdk-overlay-container mat-dialog-content p');
  if (message === null) throw new Error('dialog message missing');
  return message.textContent.trim();
}

const FIRST_ACTIVE = 'Motorola Edge 50 Fusion';

describe('ProductRowActions', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('case 1: the active row menu offers Archiválás, and Mégse sends nothing', async () => {
    // Fails if the trigger disappears from the row, if an active row's
    // menu grows a Visszaállítás item, if the confirm dialog's title,
    // message or danger labels drift, or if Mégse still fires the POST.
    seed();
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek');
    const root = rootOf(harness);
    const row = rowNamed(root, FIRST_ACTIVE);

    const { posts, stop } = recordProductPosts();
    try {
      const actions = actionsOf(harness, 0);
      const archive = vi.spyOn(actions, 'archive');

      await openMenu(harness, row);
      expect(menuLabels()).toContain('Archiválás');
      expect(menuLabels()).not.toContain('Visszaállítás');

      await clickMenuItem(harness, 'Archiválás');
      expect(dialogTitle()).toBe('Termék archiválása');
      expect(dialogMessage()).toBe(
        `Biztosan archiválod: ${FIRST_ACTIVE}? Eltűnik a boltból, később visszaállítható.`,
      );

      dialogButtonByLabel('Mégse').click();
      await returnedPromise(archive.mock.results[0]);
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(posts).toHaveLength(0);
      expect(chipText(row)).toBe('Aktív');
    } finally {
      stop();
    }
  });

  it('case 2: confirming archives with If-Match and opens the undo snack-bar', async () => {
    // Fails if the row action stops posting the row's version quoted in
    // If-Match, if the archive lands on the wrong product, or if the
    // snack-bar loses its label, its Visszavonás action or its name.
    seed();
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek');
    const root = rootOf(harness);
    const row = rowNamed(root, FIRST_ACTIVE);

    const { posts, stop } = recordProductPosts();
    try {
      const actions = actionsOf(harness, 0);
      const archive = vi.spyOn(actions, 'archive');

      await openMenu(harness, row);
      await clickMenuItem(harness, 'Archiválás');
      dialogButtonByLabel('Archiválás').click();
      await returnedPromise(archive.mock.results[0]);
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(posts).toHaveLength(1);
      expect(posts[0]?.url.endsWith('/archive')).toBe(true);
      expect(posts[0]?.ifMatch).toBe('"0"');
      expect(chipText(row)).toBe('Archivált');
      expect(snackBarText()).toContain(`Archiválva: ${FIRST_ACTIVE}`);
      expect(snackAction().textContent.trim()).toBe('Visszavonás');
    } finally {
      stop();
    }
  });

  it('case 3: Visszavonás restores with the version the archive returned', async () => {
    // Fails if the undo closes over the stale pre-archive item instead of
    // the item the archive returned: the second POST would carry If-Match
    // "0" against version 1 and draw a 412 instead of a 200.
    seed();
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek');
    const root = rootOf(harness);
    const row = rowNamed(root, FIRST_ACTIVE);

    const { posts, stop } = recordProductPosts();
    try {
      const actions = actionsOf(harness, 0);
      const archive = vi.spyOn(actions, 'archive');

      await openMenu(harness, row);
      await clickMenuItem(harness, 'Archiválás');
      dialogButtonByLabel('Archiválás').click();
      await returnedPromise(archive.mock.results[0]);
      await harness.fixture.whenStable();
      harness.detectChanges();

      const restore = vi.spyOn(actions, 'restore');
      snackAction().click();
      await returnedPromise(restore.mock.results[0]);
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(posts).toHaveLength(2);
      expect(posts[1]?.url.endsWith('/restore')).toBe(true);
      expect(posts[1]?.ifMatch).toBe('"1"');
      expect(chipText(row)).toBe('Aktív');
      expect(snackBarText()).toContain(`Visszaállítva: ${FIRST_ACTIVE}`);
    } finally {
      stop();
    }
  });

  it('case 4: a stale version draws a 412, snack-bars, and reloads the list', async () => {
    // Fails if the conflict branch loses its message, or if it stops
    // asking the store to reload after the list drifted underneath.
    const db = seed();
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek');
    const root = rootOf(harness);
    const row = rowNamed(root, FIRST_ACTIVE);

    const stored = db.products.get(1);
    if (stored === undefined) throw new Error('seed missing product 1');
    db.products.set(1, { ...stored, version: stored.version + 1 });

    const { posts, stop } = recordProductPosts();
    try {
      const actions = actionsOf(harness, 0);
      const archive = vi.spyOn(actions, 'archive');
      const retry = vi.spyOn(pageStore(harness), 'retry');

      await openMenu(harness, row);
      await clickMenuItem(harness, 'Archiválás');
      dialogButtonByLabel('Archiválás').click();
      await returnedPromise(archive.mock.results[0]);
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(posts).toHaveLength(1);
      expect(posts[0]?.ifMatch).toBe('"0"');
      expect(snackBarText()).toContain(
        'Valaki közben módosította ezt a terméket; a lista frissült.',
      );
      expect(retry).toHaveBeenCalledTimes(1);
    } finally {
      stop();
    }
  });

  it('case 5: an archived row restores straight from the menu, with no dialog', async () => {
    // Fails if an archived row still offers Archiválás, if Visszaállítás
    // goes through the confirm dialog, or if the restored row keeps its
    // archived chip.
    seed();
    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek?status=archived');
    const root = rootOf(harness);
    const first = rows(root).at(0);
    if (first === undefined) throw new Error('no archived row rendered');
    const name = first.querySelector('.adm-name')?.textContent.trim() ?? '';

    const { posts, stop } = recordProductPosts();
    try {
      const actions = actionsOf(harness, 0);
      const restore = vi.spyOn(actions, 'restore');

      await openMenu(harness, first);
      expect(menuLabels()).toContain('Visszaállítás');
      expect(menuLabels()).not.toContain('Archiválás');

      await clickMenuItem(harness, 'Visszaállítás');
      await returnedPromise(restore.mock.results[0]);
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(document.querySelector('.cdk-overlay-container h2')).toBeNull();
      expect(posts).toHaveLength(1);
      expect(posts[0]?.url.endsWith('/restore')).toBe(true);
      expect(posts[0]?.ifMatch).toBe('"0"');
      expect(snackBarText()).toContain(`Visszaállítva: ${name}`);
      expect(chipText(first)).toBe('Aktív');
    } finally {
      stop();
    }
  });

  it('case 6: restoring a featured archived row hits the featured limit', async () => {
    // Fails if a 409 FEATURED_LIMIT is reported as a generic failure, or
    // if the refused restore still flips the row to active.
    const db = seed();
    const product47 = db.products.get(47);
    if (product47 === undefined) throw new Error('seed missing product 47');
    const name = product47.name;
    db.products.set(47, { ...product47, featured: true });

    const harness = await RouterTestingHarness.create();
    await nav(harness, '/termekek?status=archived');
    const root = rootOf(harness);
    const row = rowNamed(root, name);
    const actions = actionsOf(harness, rows(root).indexOf(row));
    const restore = vi.spyOn(actions, 'restore');

    const { posts, stop } = recordProductPosts();
    try {
      await openMenu(harness, row);
      await clickMenuItem(harness, 'Visszaállítás');
      await returnedPromise(restore.mock.results[0]);
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(posts).toHaveLength(1);
      expect(posts[0]?.url.endsWith('/restore')).toBe(true);
      expect(snackBarText()).toContain('Nem állítható vissza: már 4 aktív kiemelt termék van.');
      expect(chipText(row)).toBe('Archivált');
    } finally {
      stop();
    }
  });
});
