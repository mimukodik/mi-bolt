/**
 * Spec for `ProductFilters` (MIM-351, F16b): the search field's
 * native-`change` write, the brand multi-select (rendered from the
 * mock's own seed rather than a hard-coded second copy of it), the
 * status toggle, the Kiemelt/Készlethiány chips and the Szűrők törlése
 * button — every one of them writing a `queryChange` patch, never
 * holding state of its own. MSW is already started by the admin test
 * setup (`testing/setup-msw.ts`); this file calls `useMswServer()`
 * itself too, per that file's own doc comment.
 */
import { ANIMATION_MODULE_TYPE, Component, signal } from '@angular/core';
import type { DebugElement, Provider } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { By } from '@angular/platform-browser';
import { MatButtonToggle } from '@angular/material/button-toggle';
import { MatChipOption } from '@angular/material/chips';
import { MatSelectHarness } from '@angular/material/select/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { provideApiConfiguration } from '../../../api/generated/api-configuration';
import { AdminApi } from '../../../api/generated/admin-api';
import { listAdminBrands } from '../../../api/generated/fn/admin-products/list-admin-brands';

import { useMswServer, server } from '../../../../testing/msw-server';
import { issueXsrfCookie } from '../../../../mocks/guards';
import { createDb } from '../../../../mocks/db';
import { productsReadHandlers } from '../../../../mocks/products-read.handlers';
import { SEED_ADMIN, seedCatalog } from '../../../../mocks/seed';

import { DEFAULT_PRODUCT_LIST_QUERY } from './product-list.query';
import type { ProductListQuery } from './product-list.query';
import { ProductFilters } from './product-filters';

useMswServer();

// See confirm-dialog.spec.ts:25 — the NoopAnimations spelling this
// workspace uses, since `@angular/platform-browser/animations` is not
// installed and Material only reads the token.
const NOOP_ANIMATIONS: Provider = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' };

@Component({
  selector: 'adm-product-filters-host',
  imports: [ProductFilters],
  template: `
    <adm-product-filters
      [filtered]="filtered()"
      [query]="query()"
      (clear)="onClear()"
      (queryChange)="onQueryChange($event)"
    />
  `,
})
class Host {
  readonly query = signal<ProductListQuery>(DEFAULT_PRODUCT_LIST_QUERY);
  readonly filtered = signal(false);
  readonly queryChanges: Partial<ProductListQuery>[] = [];
  clears = 0;

  onQueryChange(patch: Partial<ProductListQuery>): void {
    this.queryChanges.push(patch);
  }

  onClear(): void {
    this.clears += 1;
  }
}

function configureTestBed(): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withXhr()),
      provideApiConfiguration(new URL('/api/v1', document.baseURI).href),
      NOOP_ANIMATIONS,
    ],
  });
}

/** Seeds the MSW server the way `product-list-page.spec.ts` does: a
 *  signed-in session so `GET /admin/brands` does not 401. */
function seed(): void {
  const db = createDb();
  db.sessionAdminId = SEED_ADMIN.id;
  issueXsrfCookie(db);
  const mswServer = server;
  if (mswServer === undefined) throw new Error('MSW server not initialised');
  mswServer.use(...productsReadHandlers(db));
}

async function createFixture(
  query: ProductListQuery,
  filtered = false,
): Promise<{ fixture: ComponentFixture<Host>; host: Host }> {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.query.set(query);
  fixture.componentInstance.filtered.set(filtered);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

function element(fixture: ComponentFixture<Host>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) throw new Error('expected the host element');
  return raw;
}

function searchInput(fixture: ComponentFixture<Host>): HTMLInputElement {
  const found = element(fixture).querySelector('input');
  if (!(found instanceof HTMLInputElement)) throw new Error('missing search input');
  return found;
}

function clearButton(fixture: ComponentFixture<Host>): HTMLButtonElement {
  const found = Array.from(element(fixture).querySelectorAll('button')).find(
    (button) => button.textContent.trim() === 'Szűrők törlése',
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error('missing Szűrők törlése button');
  return found;
}

/** `DebugElement.nativeElement` is typed `any`; narrow it once here rather than at every call site. */
function nativeElementOf(de: DebugElement): HTMLElement {
  const raw: unknown = de.nativeElement;
  if (!(raw instanceof HTMLElement)) throw new Error('expected an HTMLElement');
  return raw;
}

function toggleDebugElement(fixture: ComponentFixture<Host>, label: string): DebugElement {
  const found = fixture.debugElement
    .queryAll(By.directive(MatButtonToggle))
    .find((de) => nativeElementOf(de).textContent.trim() === label);
  if (found === undefined) throw new Error(`missing ${label} toggle`);
  return found;
}

function toggleInstance(fixture: ComponentFixture<Host>, label: string): MatButtonToggle {
  const instance: unknown = toggleDebugElement(fixture, label).componentInstance;
  if (!(instance instanceof MatButtonToggle))
    throw new Error('expected a MatButtonToggle instance');
  return instance;
}

function toggleButton(fixture: ComponentFixture<Host>, label: string): HTMLButtonElement {
  const found = nativeElementOf(toggleDebugElement(fixture, label)).querySelector('button');
  if (!(found instanceof HTMLButtonElement)) throw new Error(`missing ${label} toggle button`);
  return found;
}

function chipDebugElement(fixture: ComponentFixture<Host>, label: string): DebugElement {
  const found = fixture.debugElement
    .queryAll(By.directive(MatChipOption))
    .find((de) => nativeElementOf(de).textContent.trim() === label);
  if (found === undefined) throw new Error(`missing ${label} chip`);
  return found;
}

function chipInstance(fixture: ComponentFixture<Host>, label: string): MatChipOption {
  const instance: unknown = chipDebugElement(fixture, label).componentInstance;
  if (!(instance instanceof MatChipOption)) throw new Error('expected a MatChipOption instance');
  return instance;
}

function chipElement(fixture: ComponentFixture<Host>, label: string): HTMLElement {
  return nativeElementOf(chipDebugElement(fixture, label));
}

describe('ProductFilters', () => {
  beforeEach(() => {
    configureTestBed();
  });

  it('renders the query: the search value, the two selected brands, the Archivált toggle and the chips', async () => {
    // Fails if the search input stops reading `query().q`, the select
    // stops reading `query().brands`, the toggle stops reading
    // `query().status`, or the chips stop reading `query().featured`
    // / `query().outOfStock`.
    seed();
    const distinctBrands = [...new Set(seedCatalog().products.map((product) => product.brand))];
    if (distinctBrands.length < 2) throw new Error('the seed does not carry two distinct brands');
    const [brandA, brandB] = distinctBrands;

    const query: ProductListQuery = {
      ...DEFAULT_PRODUCT_LIST_QUERY,
      q: 'iphone',
      brands: [brandA, brandB],
      status: 'archived',
      featured: true,
      outOfStock: false,
    };
    const { fixture } = await createFixture(query);

    expect(searchInput(fixture).value).toBe('iphone');

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const select = await loader.getHarness(MatSelectHarness);
    await select.open();
    const selectedOptions = await select.getOptions({ isSelected: true });
    const selectedText = await Promise.all(selectedOptions.map((option) => option.getText()));
    expect(selectedText.slice().sort()).toEqual([brandA, brandB].sort());
    await select.close();

    expect(toggleInstance(fixture, 'Archivált').checked).toBe(true);

    expect(chipInstance(fixture, 'Kiemelt').selected).toBe(true);
    expect(chipInstance(fixture, 'Készlethiány').selected).toBe(false);
  });

  it('search: emits on the native change event, only when the trimmed value differs from query().q', async () => {
    // Fails if `onSearchChange` stops trimming before comparing/emitting
    // (red proof a), or emits on every change regardless of the guard.
    seed();
    const { fixture, host } = await createFixture(DEFAULT_PRODUCT_LIST_QUERY);
    const input = searchInput(fixture);

    input.value = '  samsung  ';
    input.dispatchEvent(new Event('change'));
    expect(host.queryChanges).toEqual([{ q: 'samsung' }]);

    // Mirror the round trip through the store: the parent's query now
    // carries the value this component just emitted.
    host.query.set({ ...host.query(), q: 'samsung' });
    fixture.detectChanges();

    input.value = '  samsung  ';
    input.dispatchEvent(new Event('change'));
    expect(host.queryChanges).toEqual([{ q: 'samsung' }]);
  });

  it('brands: the select options equal the mock brand list, and picking one emits it alone', async () => {
    // Fails if the options stop being rendered "in the order the endpoint
    // returns", or if `onBrandsChange` stops narrowing/forwarding the
    // selection.
    seed();
    const { fixture, host } = await createFixture(DEFAULT_PRODUCT_LIST_QUERY);

    const expectedBrands = await firstValueFrom(TestBed.inject(AdminApi).invoke(listAdminBrands));

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const select = await loader.getHarness(MatSelectHarness);
    await select.open();
    const options = await select.getOptions();
    const optionText = await Promise.all(options.map((option) => option.getText()));
    expect(optionText).toEqual(expectedBrands);

    if (expectedBrands.length === 0) throw new Error('the mock brand list is empty');
    const [firstBrand] = expectedBrands;
    await select.clickOptions({ text: firstBrand });

    expect(host.queryChanges).toEqual([{ brands: [firstBrand] }]);
  });

  it('status: clicking Mind emits the new status', async () => {
    // Fails if `onStatusChange` stops narrowing/forwarding the group's value.
    seed();
    const { fixture, host } = await createFixture(DEFAULT_PRODUCT_LIST_QUERY);
    toggleButton(fixture, 'Mind').click();
    expect(host.queryChanges).toEqual([{ status: 'all' }]);
  });

  it('chips: a click on Készlethiány emits only the flag that changed', async () => {
    // Fails if the click handler starts emitting the other flag too, or
    // stops reading the current `query().outOfStock` to compute the toggle.
    seed();
    const { fixture, host } = await createFixture(DEFAULT_PRODUCT_LIST_QUERY);
    chipElement(fixture, 'Készlethiány').click();
    expect(host.queryChanges).toEqual([{ outOfStock: true }]);
  });

  it('Szűrők törlése is disabled unless filtered, and emits clear once when clicked', async () => {
    // Fails if the `[disabled]` binding is dropped (red proof b), or if
    // the click stops emitting `clear`.
    seed();
    const { fixture, host } = await createFixture(DEFAULT_PRODUCT_LIST_QUERY, false);
    expect(clearButton(fixture).disabled).toBe(true);

    host.filtered.set(true);
    fixture.detectChanges();
    clearButton(fixture).click();

    expect(host.clears).toBe(1);
  });
});
