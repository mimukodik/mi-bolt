/**
 * Spec for `ProductEditPage` (projects/admin/src/app/features/products/edit/product-edit-page.ts).
 *
 * Real MSW behind the store's own HTTP providers (`ifMatchInterceptor` and a
 * fixed `X-XSRF-TOKEN`, as `product-edit.store.spec.ts` wires them), rendered
 * through `RouterTestingHarness` with `withComponentInputBinding()` so
 * `:productId` reaches the page the way the router binds it. The page
 * instance and its native element come from `harness.routeDebugElement`,
 * never from a component fixture of our own.
 */
import { ANIMATION_MODULE_TYPE, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeHu from '@angular/common/locales/hu';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MatDialog } from '@angular/material/dialog';
import { http } from 'msw';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { provideApiConfiguration } from '../../../api/generated/api-configuration';
import type { AdminProduct } from '../../../api/generated/models/admin-product';
import { ifMatchInterceptor } from '../../../core/api/if-match.interceptor';

import { server, useMswServer } from '../../../../testing/msw-server';
import { bodyViolations, fieldError, serviceUnavailable } from '../../../../mocks/backend-answers';
import { createDb } from '../../../../mocks/db';
import type { MockDb } from '../../../../mocks/db';
import { problem } from '../../../../mocks/problem';
import { SEED_ADMIN } from '../../../../mocks/seed';
import { productsReadHandlers } from '../../../../mocks/products-read.handlers';
import { productsWriteHandlers } from '../../../../mocks/products-write.handlers';
import { promotionHandlers } from '../../../../mocks/promotion.handlers';

import { toFormModel } from './product-form.mapper';
import { ProductEditPage } from './product-edit-page';
import { DisplayCard } from './sections/display-card';
import { UploadTracker } from '../../../shared/image-upload/upload-tracker';

useMswServer();

const TEST_XSRF_TOKEN = 'test-xsrf-token';

const addXsrfInterceptor: HttpInterceptorFn = (request, next) =>
  next(request.clone({ setHeaders: { 'X-XSRF-TOKEN': TEST_XSRF_TOKEN } }));

// See confirm-dialog.spec.ts:25 — the NoopAnimations spelling this
// workspace uses, since `@angular/platform-browser/animations` is not
// installed and Material only reads the token.
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

registerLocaleData(localeHu, 'hu-HU');

@Component({ selector: 'adm-termekek-stub', template: '' })
class TermekekStub {}

function signedIn(scenario: 'default' | 'save-conflict' = 'default'): MockDb {
  const db = createDb(scenario);
  db.sessionAdminId = SEED_ADMIN.id;
  db.xsrfToken = TEST_XSRF_TOKEN;
  server?.use(...productsReadHandlers(db), ...productsWriteHandlers(db), ...promotionHandlers(db));
  return db;
}

function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideApiConfiguration('/api/v1'),
      provideHttpClient(withXhr(), withInterceptors([ifMatchInterceptor, addXsrfInterceptor])),
      provideRouter(
        [
          { path: 'termekek', component: TermekekStub },
          { path: 'termekek/uj', component: ProductEditPage },
          { path: 'termekek/:productId', component: ProductEditPage },
        ],
        withComponentInputBinding(),
      ),
      provideZonelessChangeDetection(),
      NOOP_ANIMATIONS,
    ],
  });
}

function pageOf(harness: RouterTestingHarness): ProductEditPage {
  const element = harness.routeDebugElement;
  if (element === null) throw new Error('expected the routed page element');
  const instance: unknown = element.componentInstance;
  if (!(instance instanceof ProductEditPage)) {
    throw new Error('expected a ProductEditPage instance');
  }
  return instance;
}

function root(harness: RouterTestingHarness): HTMLElement {
  const element = harness.routeNativeElement;
  if (element === null) throw new Error('expected the routed page element');
  return element;
}

async function navigate(
  url: string,
): Promise<{ harness: RouterTestingHarness; page: ProductEditPage }> {
  const harness = await RouterTestingHarness.create(url);
  return { harness, page: pageOf(harness) };
}

function h1Text(harness: RouterTestingHarness): string {
  const element = root(harness).querySelector('h1');
  if (element === null) throw new Error('expected the h1');
  return element.textContent.trim();
}

function saveButton(harness: RouterTestingHarness): HTMLButtonElement {
  const button = root(harness).querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button === null) throw new Error('expected the Mentés button');
  return button;
}

function buttonByLabel(harness: RouterTestingHarness, label: string): HTMLButtonElement {
  const buttons = Array.from(root(harness).querySelectorAll<HTMLButtonElement>('button'));
  const button = buttons.find((candidate) => candidate.textContent.trim() === label);
  if (button === undefined) throw new Error(`expected a button labelled "${label}"`);
  return button;
}

function metaTexts(harness: RouterTestingHarness): string[] {
  return Array.from(root(harness).querySelectorAll('.adm-edit-meta dd')).map((el) =>
    el.textContent.trim(),
  );
}

function sectionErrorTexts(harness: RouterTestingHarness): string[] {
  return Array.from(root(harness).querySelectorAll('.adm-section-errors')).map((el) =>
    el.textContent.trim(),
  );
}

function snackBarText(): string {
  const element = document.querySelector('.mat-mdc-snack-bar-container, .mat-mdc-simple-snack-bar');
  if (element === null) throw new Error('no snack-bar container in the document');
  return element.textContent.trim();
}

function dialogTitle(): string | null {
  const element = document.querySelector('.cdk-overlay-container h2');
  return element === null ? null : element.textContent.trim();
}

function dialogButtonByLabel(label: string): HTMLButtonElement {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container button'),
  );
  const found = buttons.find((button) => button.textContent.trim() === label);
  if (found === undefined) throw new Error(`no dialog button labelled "${label}"`);
  return found;
}

function seededProduct(db: MockDb, id: number): AdminProduct {
  const product = db.products.get(id);
  if (product === undefined) throw new Error(`seed missing product ${String(id)}`);
  return product;
}

describe('ProductEditPage', () => {
  beforeEach(() => {
    configureTestBed();
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    TestBed.resetTestingModule();
  });

  it('1: edit mode renders product 1, no spinner, Mentés enabled, slug read-only', async () => {
    const db = signedIn();
    const product = seededProduct(db, 1);

    const { harness, page } = await navigate('/termekek/1');
    await harness.fixture.whenStable();

    expect(h1Text(harness)).toBe(product.name);

    const chip = root(harness).querySelector('mat-chip');
    if (chip === null) throw new Error('expected the status chip');
    expect(chip.textContent.trim()).toBe(product.status === 'active' ? 'Aktív' : 'Archivált');

    const meta = metaTexts(harness);
    expect(meta[0].startsWith(String(product.id))).toBe(true);
    expect(meta[1].startsWith(product.slug)).toBe(true);
    expect(meta[2].startsWith(String(product.version))).toBe(true);

    const image = root(harness).querySelector<HTMLImageElement>('.adm-edit-preview');
    if (image === null) throw new Error('expected the preview image');
    expect(image.getAttribute('src')).toBe(product.colors[0].image.src);

    expect(root(harness).querySelector('mat-progress-bar')).toBeNull();
    expect(saveButton(harness).disabled).toBe(false);
    expect(page.form.slug().readonly()).toBe(true);
  });

  it('2: featuredOthers excludes product 1 from the active-featured count when it is one', async () => {
    const db = signedIn();
    const product = seededProduct(db, 1);
    const activeFeatured = [...db.products.values()].filter(
      (candidate) => candidate.featured && candidate.status === 'active',
    ).length;
    const expected =
      product.featured && product.status === 'active' ? activeFeatured - 1 : activeFeatured;

    const { harness } = await navigate('/termekek/1');
    await harness.fixture.whenStable();

    const element = harness.routeDebugElement;
    if (element === null) throw new Error('expected the routed page element');
    const displayCard: unknown = element.query(By.directive(DisplayCard)).componentInstance;
    if (!(displayCard instanceof DisplayCard)) throw new Error('expected a DisplayCard instance');

    expect(displayCard.featuredOthers()).toBe(expected);
  });

  it('3: not-found for a missing id and for a non-numeric id, which sends no request', async () => {
    signedIn();

    // One harness reused across both navigations: `RouterTestingHarness.create` may only be
    // called once per test, and `navigateByUrl` re-navigates the same root component.
    const harness = await RouterTestingHarness.create('/termekek/99999');
    await harness.fixture.whenStable();
    expect(root(harness).querySelector('[role="alert"]')?.textContent.trim()).toBe(
      'Ez a termék nem létezik.',
    );
    expect(saveButton(harness).disabled).toBe(true);

    let requestCount = 0;
    const listener = ({ request }: { request: Request }): void => {
      if (request.url.includes('/admin/products/abc')) requestCount += 1;
    };
    server?.events.on('request:start', listener);

    await harness.navigateByUrl('/termekek/abc');
    await harness.fixture.whenStable();

    server?.events.removeListener('request:start', listener);

    expect(root(harness).querySelector('[role="alert"]')?.textContent.trim()).toBe(
      'Ez a termék nem létezik.',
    );
    expect(requestCount).toBe(0);
  });

  it('4: a load error shows the failure text; Újra moves focus to the title, then reloads', async () => {
    const db = signedIn();
    const product = seededProduct(db, 1);
    server?.use(http.get('*/api/v1/admin/products/1', () => serviceUnavailable(), { once: true }));

    const { harness } = await navigate('/termekek/1');
    await harness.fixture.whenStable();

    expect(root(harness).querySelector('[role="alert"]')?.textContent.trim()).toBe(
      'A termék betöltése nem sikerült.',
    );

    const titleElement = root(harness).querySelector('.adm-edit-title');
    if (titleElement === null) throw new Error('expected the page title');
    expect(titleElement.getAttribute('tabindex')).toBe('-1');

    buttonByLabel(harness, 'Újra').click();
    expect(document.activeElement).toBe(titleElement);

    harness.detectChanges();
    const spinner = root(harness).querySelector('mat-progress-bar');
    if (spinner === null) throw new Error('expected the loading spinner');
    expect(spinner.getAttribute('aria-label')).toBe('Termék betöltése');

    await harness.fixture.whenStable();
    expect(document.activeElement).toBe(titleElement);
    expect(h1Text(harness)).toBe(product.name);
  });

  it('5: save on the edit page snack-bars Mentve and bumps the version', async () => {
    const db = signedIn();
    const product = seededProduct(db, 1);

    const { harness, page } = await navigate('/termekek/1');
    await harness.fixture.whenStable();

    if (page.form().invalid()) {
      throw new Error(
        `blocked: seeded product 1 is invalid: ${JSON.stringify(page.form().errorSummary())}`,
      );
    }

    saveButton(harness).click();
    await harness.fixture.whenStable();

    expect(snackBarText()).toBe('Mentve');
    expect(db.products.get(1)?.version).toBe(product.version + 1);
    expect(metaTexts(harness)[2]).toBe(String(product.version + 1));
  });

  it('6: a save conflict opens the dialog; Újratöltés reloads and drops the edit', async () => {
    const db = signedIn('save-conflict');
    const product = seededProduct(db, 1);

    const { harness, page } = await navigate('/termekek/1');
    await harness.fixture.whenStable();

    page.model.update((m) => ({ ...m, name: 'Átírt név' }));
    await harness.fixture.whenStable();

    saveButton(harness).click();
    await harness.fixture.whenStable();

    expect(dialogTitle()).toBe('Valaki közben módosította ezt a terméket');

    dialogButtonByLabel('Újratöltés').click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(0);
    expect(page.model().name).toBe(product.name);
    expect(db.products.get(1)?.version).toBe(product.version);
    expect(saveButton(harness).disabled).toBe(false);
  });

  it('7: a 422 UNKNOWN_IMAGE lands on the image field and disables Mentés', async () => {
    signedIn();
    server?.use(
      http.put(
        '*/api/v1/admin/products/1',
        () => bodyViolations([fieldError('/colors/0/imageId', 'UNKNOWN_IMAGE')]),
        { once: true },
      ),
    );

    const { harness, page } = await navigate('/termekek/1');
    await harness.fixture.whenStable();

    saveButton(harness).click();
    await harness.fixture.whenStable();

    expect(
      page.form.colors[0]
        .image()
        .errors()
        .map((error) => error.message),
    ).toEqual(['A kép nem található; töltsd fel újra.']);
    const colorsErrors = root(harness).querySelector('adm-colors-section .adm-section-errors');
    if (colorsErrors === null) throw new Error('expected the colours section error badge');
    expect(colorsErrors.textContent.trim()).toBe('1 hiba');
    expect(saveButton(harness).disabled).toBe(true);
  });

  it('8: a failed save snack-bars the generic message, no dialog', async () => {
    signedIn();
    server?.use(http.put('*/api/v1/admin/products/1', () => serviceUnavailable(), { once: true }));

    const { harness } = await navigate('/termekek/1');
    await harness.fixture.whenStable();

    saveButton(harness).click();
    await harness.fixture.whenStable();

    expect(snackBarText()).toBe('A mentés nem sikerült. Próbáld újra.');
    expect(dialogTitle()).toBeNull();
  });

  it('8b: a 409 VARIANT_IN_CART names the dropped variant, no dialog', async () => {
    signedIn();
    server?.use(
      http.put(
        '*/api/v1/admin/products/1',
        () =>
          problem(409, 'VARIANT_IN_CART', 'Variant in cart', {
            detail: 'A dropped variant is in an unexpired cart',
            params: { variantIds: ['x'] },
          }),
        { once: true },
      ),
    );

    const { harness } = await navigate('/termekek/1');
    await harness.fixture.whenStable();

    saveButton(harness).click();
    await harness.fixture.whenStable();

    expect(snackBarText()).toBe(
      'A mentés nem sikerült: egy törölt változat még egy vásárló kosarában van. Tartsd meg a változatot, vagy próbáld újra később.',
    );
    expect(dialogTitle()).toBeNull();
  });

  it('9: create mode with the empty form shows the six section counts and sends no request', async () => {
    signedIn();

    let postCount = 0;
    const listener = ({ request }: { request: Request }): void => {
      if (request.method === 'POST' && request.url.endsWith('/admin/products')) postCount += 1;
    };
    server?.events.on('request:start', listener);

    const { harness, page } = await navigate('/termekek/uj');
    await harness.fixture.whenStable();

    expect(h1Text(harness)).toBe('Új termék');
    expect(root(harness).querySelector('.adm-edit-meta')).toBeNull();
    const metaCard = Array.from(root(harness).querySelectorAll('p')).find(
      (p) => p.textContent.trim() === 'Új termék, még nincs mentve.',
    );
    expect(metaCard).toBeDefined();
    expect(root(harness).querySelector('mat-chip')).toBeNull();
    expect(page.form.slug().readonly()).toBe(false);

    saveButton(harness).click();
    await harness.fixture.whenStable();

    server?.events.removeListener('request:start', listener);

    expect(sectionErrorTexts(harness)).toEqual([
      '4 hiba',
      '1 hiba',
      '5 hiba',
      '2 hiba',
      '3 hiba',
      '2 hiba',
    ]);
    expect(saveButton(harness).disabled).toBe(true);
    expect(postCount).toBe(0);
  });

  it('10: create, saved sends the model and navigates to the new product', async () => {
    const db = signedIn();
    const product = seededProduct(db, 1);

    const { harness, page } = await navigate('/termekek/uj');
    await harness.fixture.whenStable();

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    // `featured: false`, as `product-edit.store.spec.ts`'s "create with a fresh slug" case
    // does with the same seeded product: product 1 is one of the seed's 4 active featured
    // products, and create mode's `featuredOthers` (no loaded product to subtract) counts
    // all 4, so reusing `featured: true` would trip the client-side featuredLimit validator.
    page.model.set({
      ...toFormModel(product),
      slug: 'uj-teszt-termek',
      name: 'Új teszt termék',
      featured: false,
    });
    await harness.fixture.whenStable();

    if (page.form().invalid()) {
      throw new Error(
        `blocked: the reused model is invalid: ${JSON.stringify(page.form().errorSummary())}`,
      );
    }

    saveButton(harness).click();
    await harness.fixture.whenStable();

    const created = [...db.products.values()].find(
      (candidate) => candidate.slug === 'uj-teszt-termek',
    );
    if (created === undefined) {
      const snackBar = document.querySelector(
        '.mat-mdc-snack-bar-container, .mat-mdc-simple-snack-bar',
      );
      const snackBarRead = snackBar === null ? '(none)' : snackBar.textContent.trim();
      throw new Error(
        `blocked: no product with slug "uj-teszt-termek" was created; snack-bar reads "${snackBarRead}"`,
      );
    }

    expect(snackBarText()).toBe('Mentve');
    expect(navigateSpy).toHaveBeenCalledWith(['/termekek', created.id], { replaceUrl: true });
  });

  it('11: an upload in flight disables Mentés until it settles', async () => {
    signedIn();
    const { harness } = await navigate('/termekek/1');
    await harness.fixture.whenStable();

    const element = harness.routeDebugElement;
    if (element === null) throw new Error('expected the routed page element');
    const tracker = element.injector.get(UploadTracker);

    const subscription = tracker.track(new Subject<never>()).subscribe();
    harness.detectChanges();
    expect(saveButton(harness).disabled).toBe(true);

    subscription.unsubscribe();
    harness.detectChanges();
    expect(saveButton(harness).disabled).toBe(false);
  });

  it('12: Mégse navigates to /termekek', async () => {
    signedIn();
    const { harness } = await navigate('/termekek/1');
    await harness.fixture.whenStable();

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    buttonByLabel(harness, 'Mégse').click();
    await harness.fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith(['/termekek']);
  });
});
