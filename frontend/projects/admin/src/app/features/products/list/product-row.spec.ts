/**
 * Spec for `ProductRow` (MIM-351, F16a): the placeholder state while a
 * page is still in flight, the loaded desktop and handset renderings,
 * and `open()`'s activation rule — the whole row navigates on click or
 * Enter, except when the interaction started on the edit link, which
 * navigates through `RouterLink`'s own `navigateByUrl` rather than the
 * row's `Router.navigate`.
 */
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { ANIMATION_MODULE_TYPE, Component } from '@angular/core';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { provideApiConfiguration } from '../../../api/generated/api-configuration';
import type { AdminProductListItem } from '../../../api/generated/models/admin-product-list-item';

import { formatPriceRange } from './price-range';
import { ProductRow } from './product-row';
import { ProductListStore } from './product-list.store';

// See confirm-dialog.spec.ts:25 — the NoopAnimations spelling this
// workspace uses, since `@angular/platform-browser/animations` is not
// installed and Material only reads the token.
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

@Component({ selector: 'adm-product-edit-stub', template: 'edit' })
class ProductEditStub {}

/** One full `AdminProductListItem`, overridden per case. */
function baseItem(overrides: Partial<AdminProductListItem> = {}): AdminProductListItem {
  return {
    id: 7,
    brand: 'Apple',
    colors: [
      { name: 'Fekete', swatchHex: '#111111' },
      { name: 'Fehér', swatchHex: '#eeeeee' },
    ],
    featured: false,
    maxPrice: { amount: 717990, currency: 'HUF' },
    minPrice: { amount: 599990, currency: 'HUF' },
    name: 'Apple iPhone 18 Pro Max',
    rank: 3,
    releasedAt: '2026-01-01',
    slug: 'apple-iphone-18-pro-max',
    status: 'active',
    thumbnail: { id: 'a'.repeat(64), src: '/x.jpg', alt: '', width: 40, height: 40 },
    totalStock: 44,
    variantCount: 7,
    version: 0,
    ...overrides,
  };
}

function hostOf(fixture: ComponentFixture<ProductRow>): HTMLElement {
  const element: unknown = fixture.nativeElement;
  if (!(element instanceof HTMLElement)) throw new Error('expected the row host element');
  return element;
}

function createFixture(): ComponentFixture<ProductRow> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'termekek/:productId', component: ProductEditStub }]),
      provideHttpClient(withXhr()),
      provideApiConfiguration(new URL('/api/v1', document.baseURI).href),
      // The row now hosts `ProductRowActions` (F17), which injects the
      // page's store; here the row is mounted on its own, so the store
      // is provided directly. No request is made: nothing reads
      // `dataSource()` in this spec.
      ProductListStore,
      NOOP_ANIMATIONS,
    ],
  });
  return TestBed.createComponent(ProductRow);
}

describe('ProductRow', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('a placeholder row is aria-busy, untabbable, carries its aria-rowindex, and never navigates', () => {
    // Fails if the host bindings stop reading `item() === undefined`, or if
    // `open()` drops its early return for an undefined item.
    const fixture = createFixture();
    fixture.componentRef.setInput('item', undefined);
    fixture.componentRef.setInput('rowIndex', 5);
    fixture.detectChanges();
    const host = hostOf(fixture);

    expect(host.getAttribute('aria-busy')).toBe('true');
    expect(host.getAttribute('tabindex')).toBe('-1');
    expect(host.getAttribute('aria-rowindex')).toBe('5');

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    host.click();
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(navigate).toHaveBeenCalledTimes(0);
  });

  it('Enter on a loaded row navigates to the product; a click on the edit link does not', () => {
    // Fails if `open()` drops its Enter handler, or if its `closest('a, button')`
    // guard stops excluding the edit link's own click from the row's navigate.
    const fixture = createFixture();
    fixture.componentRef.setInput('item', baseItem({ id: 7 }));
    fixture.componentRef.setInput('rowIndex', 2);
    fixture.detectChanges();
    const host = hostOf(fixture);

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/termekek', 7]);

    navigate.mockClear();
    const link = host.querySelector('a');
    if (link === null) throw new Error('edit link missing');
    link.click();
    expect(navigate).toHaveBeenCalledTimes(0);
  });

  it('marks zero stock and renders no star for a non-featured, archived row', () => {
    // Fails if the stock-out class drops its `=== 0` check, if a
    // non-featured row still renders the star icon, or if the status
    // chip stops reading `archived` as "Archivált".
    const fixture = createFixture();
    fixture.componentRef.setInput(
      'item',
      baseItem({ totalStock: 0, featured: false, status: 'archived' }),
    );
    fixture.componentRef.setInput('rowIndex', 2);
    fixture.detectChanges();
    const host = hostOf(fixture);

    const stockSpan = host.querySelector('.adm-stock-out');
    expect(stockSpan).not.toBeNull();
    expect(stockSpan?.textContent).toBe('0');

    const icons = Array.from(host.querySelectorAll('mat-icon')).map((icon) =>
      icon.textContent.trim(),
    );
    expect(icons).not.toContain('star');

    const chip = host.querySelector('mat-chip');
    expect(chip?.textContent.trim()).toBe('Archivált');
  });

  it('non-zero stock carries no stock-out class', () => {
    // Fails if the stock-out class is applied unconditionally.
    const fixture = createFixture();
    fixture.componentRef.setInput('item', baseItem({ totalStock: 5 }));
    fixture.componentRef.setInput('rowIndex', 2);
    fixture.detectChanges();
    const host = hostOf(fixture);

    expect(host.querySelector('.adm-stock-out')).toBeNull();
  });

  it('handset rendering has exactly four cells and a brand · price · stock summary', () => {
    // Fails if the handset branch stops rendering exactly four `role="cell"`
    // elements, or if the summary's separators drift from " · " and " db".
    const fixture = createFixture();
    const item = baseItem();
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('rowIndex', 2);
    fixture.componentRef.setInput('handset', true);
    fixture.detectChanges();
    const host = hostOf(fixture);

    const cells = host.querySelectorAll('[role="cell"]');
    expect(cells.length).toBe(4);

    const expectedPrice = formatPriceRange(item.minPrice, item.maxPrice);
    const summary = host.querySelector('.adm-slug');
    expect(summary?.textContent.trim()).toBe(`Apple · ${expectedPrice} · 44 db`);
  });

  it('renders two colours that share a name without NG0955', () => {
    // Fails if the colour swatches track a key the contract does not
    // declare unique (`AdminProductListColor.name`): two same-named
    // colours then warn NG0955 and may swap their swatch background.
    const fixture = createFixture();
    fixture.componentRef.setInput(
      'item',
      baseItem({
        colors: [
          { name: 'Fekete', swatchHex: '#000000' },
          { name: 'Fekete', swatchHex: '#111111' },
        ],
      }),
    );
    fixture.componentRef.setInput('rowIndex', 2);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      fixture.detectChanges();

      // NG0955 is recorded only when a rendered list is reconciled against
      // the next one, so the same colours arrive again in a new item.
      fixture.componentRef.setInput(
        'item',
        baseItem({
          colors: [
            { name: 'Fekete', swatchHex: '#000000' },
            { name: 'Fekete', swatchHex: '#111111' },
          ],
        }),
      );
      fixture.detectChanges();
      const host = hostOf(fixture);
      expect(host.querySelectorAll('.adm-swatch').length).toBe(2);
      expect(warn.mock.calls.some((call) => String(call[0]).includes('NG0955'))).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });
});
