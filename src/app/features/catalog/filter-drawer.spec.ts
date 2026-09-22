/**
 * Storage / stock / 5G / price facets wiring for the mobile drawer.
 *
 * Mirrors the FilterPanel suite: each facet field renders from
 * `Facets` exactly the way the contract publishes it, and every
 * count span / placeholder is suppressed when no facets have loaded
 * yet so the controls stay present without displaying a number that
 * has no value. The drawer is a dialog, so the host sets `opened`
 * to true and lets AccessibleDialog mount the controls.
 */

import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { DialogModule } from '@angular/cdk/dialog';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Facets } from '../../api/generated/models/facets';

import { DEFAULT_CATALOG_QUERY, type CatalogQuery } from './catalog-query';
import { FilterDrawer } from './filter-drawer';

beforeAll(async () => {
  await TestBed.compileComponents();
});

afterEach(() => {
  // The CDK overlay container survives the test otherwise and pollutes
  // the next one (the projection lives there, not under the host root).
  document.body.querySelectorAll('.cdk-overlay-container').forEach((el) => {
    el.remove();
  });
  TestBed.resetTestingModule();
});

function queryInput(selector: string): HTMLInputElement {
  const el = document.body.querySelector(selector);
  if (!(el instanceof HTMLInputElement)) throw new Error(`Expected HTMLInputElement: ${selector}`);
  return el;
}

function queryElement(selector: string): HTMLElement {
  const el = document.body.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error(`Expected HTMLElement: ${selector}`);
  return el;
}

@Component({
  imports: [FilterDrawer, DialogModule],
  template: `<app-filter-drawer
    [applied]="applied()"
    [disabled]="disabled()"
    [facets]="facets()"
    [opened]="opened()"
    (closed)="onClosed()"
    (filtersChanged)="onFiltersChanged($event)"
  />`,
})
class HostComponent {
  readonly applied = signal<CatalogQuery>(DEFAULT_CATALOG_QUERY);
  readonly facets = signal<Facets | null>(null);
  readonly opened = signal(true);
  readonly disabled = signal(false);
  readonly emitted: CatalogQuery[] = [];

  onFiltersChanged(next: CatalogQuery): void {
    this.emitted.push(next);
  }

  onClosed(): void {
    // No-op: the host hides the dialog in response.
  }
}

function setup(): {
  fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  host: HostComponent;
} {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('FilterDrawer — facets wire-up', () => {
  it('storage chips show the facet label and an option__count when facets are loaded', () => {
    const { fixture, host } = setup();

    // With no facets: three chips, no count spans.
    expect(document.body.querySelectorAll('[data-testid="drawer-storage-128"]').length).toBe(1);
    const beforeChip = document.body.querySelector('[data-testid="drawer-storage-128"]');
    expect(beforeChip).not.toBeNull();
    if (beforeChip === null) return;
    expect(beforeChip.querySelector('.option__count')).toBeNull();

    host.facets.set({
      brands: [],
      colors: [],
      storageGb: [
        { value: '128', label: '128 GB', count: 3 },
        { value: '256', label: '256 GB', count: 5 },
        { value: '512', label: '512 GB', count: 1 },
      ],
      inStock: 0,
      is5g: 0,
      priceRange: { min: { amount: 0, currency: 'HUF' }, max: { amount: 0, currency: 'HUF' } },
    });
    fixture.detectChanges();

    const mid = queryElement('[data-testid="drawer-storage-256"]');
    expect(mid.textContent).toContain('256 GB');
    const midCount = mid.querySelector('.option__count');
    expect(midCount?.textContent.trim()).toBe('(5)');
  });

  it('stock and 5G toggles show their facet count when facets are loaded', () => {
    const { fixture, host } = setup();
    host.facets.set({
      brands: [],
      colors: [],
      storageGb: [],
      inStock: 7,
      is5g: 9,
      priceRange: { min: { amount: 0, currency: 'HUF' }, max: { amount: 0, currency: 'HUF' } },
    });
    fixture.detectChanges();

    const inStock = queryElement('[data-testid="drawer-inStock"]');
    expect(inStock.querySelector('.option__count')?.textContent.trim()).toBe('(7)');

    const is5g = queryElement('[data-testid="drawer-is5g"]');
    expect(is5g.querySelector('.option__count')?.textContent.trim()).toBe('(9)');
  });

  it('price inputs carry the price range as a placeholder when facets are loaded', () => {
    const { fixture, host } = setup();
    const min = queryInput('[data-testid="drawer-min-price"]');
    const max = queryInput('[data-testid="drawer-max-price"]');

    // With no facets: no placeholder attribute.
    expect(min.getAttribute('placeholder')).toBeNull();
    expect(max.getAttribute('placeholder')).toBeNull();

    host.facets.set({
      brands: [],
      colors: [],
      storageGb: [],
      inStock: 0,
      is5g: 0,
      priceRange: {
        min: { amount: 69990, currency: 'HUF' },
        max: { amount: 699990, currency: 'HUF' },
      },
    });
    fixture.detectChanges();

    expect(min.getAttribute('placeholder')).toBe('69990');
    expect(max.getAttribute('placeholder')).toBe('699990');
  });

  it('the expanded brand list stays expanded when the drawer reopens (owner 2026-09-22)', () => {
    const { fixture, host } = setup();
    host.facets.set({
      brands: [
        { value: 'apple', label: 'Apple', count: 3 },
        { value: 'google pixel', label: 'Google Pixel', count: 2 },
        { value: 'honor', label: 'HONOR', count: 4 },
        { value: 'motorola', label: 'Motorola', count: 1 },
        { value: 'samsung', label: 'Samsung', count: 5 },
        { value: 'vivo', label: 'Vivo', count: 2 },
        { value: 'xiaomi', label: 'Xiaomi', count: 1 },
      ],
      colors: [],
      storageGb: [],
      inStock: 0,
      is5g: 0,
      priceRange: { min: { amount: 0, currency: 'HUF' }, max: { amount: 0, currency: 'HUF' } },
    });
    fixture.detectChanges();

    const more = queryElement('[data-testid="drawer-group-brand"] .more');
    expect(more.textContent.trim()).toBe('Még több gyártó');
    more.click();
    fixture.detectChanges();
    expect(document.body.querySelectorAll('[data-testid="drawer-group-brand"] li').length).toBe(7);

    host.opened.set(false);
    fixture.detectChanges();
    host.opened.set(true);
    fixture.detectChanges();

    expect(document.body.querySelectorAll('[data-testid="drawer-group-brand"] li').length).toBe(7);
    const moreAfter = queryElement('[data-testid="drawer-group-brand"] .more');
    expect(moreAfter.textContent.trim()).toBe('Kevesebb gyártó');
    expect(moreAfter.getAttribute('aria-expanded')).toBe('true');
  });

  it('the "more" toggle label follows the same condition as its aria-expanded (MIM-210)', () => {
    const { fixture, host } = setup();
    host.facets.set({
      brands: [
        { value: 'apple', label: 'Apple', count: 3 },
        { value: 'google pixel', label: 'Google Pixel', count: 2 },
        { value: 'honor', label: 'HONOR', count: 4 },
        { value: 'motorola', label: 'Motorola', count: 1 },
        { value: 'samsung', label: 'Samsung', count: 5 },
        { value: 'vivo', label: 'Vivo', count: 2 },
        { value: 'xiaomi', label: 'Xiaomi', count: 1 },
      ],
      colors: [],
      storageGb: [],
      inStock: 0,
      is5g: 0,
      priceRange: { min: { amount: 0, currency: 'HUF' }, max: { amount: 0, currency: 'HUF' } },
    });
    // A brand beyond row five is applied, forcing the list open through
    // the reopen-reseed effect without the user ever clicking "more".
    host.applied.set({ ...DEFAULT_CATALOG_QUERY, brands: ['xiaomi'] });
    fixture.detectChanges();

    const more = queryElement('[data-testid="drawer-group-brand"] .more');
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.textContent.trim()).toBe('Kevesebb gyártó');
  });
});

describe('MIM-228: a selected facet row with a zero count stays clickable (drawer)', () => {
  it('a selected brand and colour at count 0 are enabled; unselected ones at count 0 are disabled', () => {
    const { fixture, host } = setup();

    host.applied.set({ ...DEFAULT_CATALOG_QUERY, brands: ['apple'], colors: ['black'] });
    host.facets.set({
      brands: [
        { value: 'apple', label: 'Apple', count: 0 },
        { value: 'samsung', label: 'Samsung', count: 0 },
      ],
      colors: [
        { value: 'black', label: 'Fekete', count: 0, swatchHex: '#000000' },
        { value: 'white', label: 'Fehér', count: 0, swatchHex: '#FFFFFF' },
      ],
      storageGb: [],
      inStock: 0,
      is5g: 0,
      priceRange: { min: { amount: 0, currency: 'HUF' }, max: { amount: 0, currency: 'HUF' } },
    });
    // Reseed the drawer's draft so the selected values propagate into the
    // rendered rows (the same reopen dance MIM-210 uses).
    host.opened.set(false);
    fixture.detectChanges();
    host.opened.set(true);
    fixture.detectChanges();

    const apple = document.body.querySelector('[data-testid="drawer-brand-apple"]');
    const samsung = document.body.querySelector('[data-testid="drawer-brand-samsung"]');
    const black = document.body.querySelector('[data-testid="drawer-color-black"]');
    const white = document.body.querySelector('[data-testid="drawer-color-white"]');
    if (!(apple instanceof HTMLButtonElement)) throw new Error('drawer-brand-apple');
    if (!(samsung instanceof HTMLButtonElement)) throw new Error('drawer-brand-samsung');
    if (!(black instanceof HTMLButtonElement)) throw new Error('drawer-color-black');
    if (!(white instanceof HTMLButtonElement)) throw new Error('drawer-color-white');

    expect(apple.disabled).toBe(false);
    expect(samsung.disabled).toBe(true);
    expect(black.disabled).toBe(false);
    expect(white.disabled).toBe(true);
  });
});

describe('owner 2026-09-22: Szűrők alkalmazása is always active', () => {
  function applyButton(): HTMLButtonElement {
    const el = document.body.querySelector('[data-testid="drawer-apply"] button');
    if (!(el instanceof HTMLButtonElement)) throw new Error('Expected the apply button');
    return el;
  }

  function typePrice(testId: string, value: string): void {
    const input = queryInput(`[data-testid="${testId}"]`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('with min above max the button stays active; a click applies nothing and focuses the min price', async () => {
    const { fixture, host } = setup();
    typePrice('drawer-min-price', '5000');
    typePrice('drawer-max-price', '1000');
    fixture.detectChanges();

    const min = queryInput('[data-testid="drawer-min-price"]');
    expect(applyButton().disabled).toBe(false);
    expect(min.getAttribute('aria-invalid')).toBe('true');
    expect(min.getAttribute('aria-describedby')).toBe('drawer-price-message');
    expect(queryInput('[data-testid="drawer-max-price"]').getAttribute('aria-invalid')).toBeNull();

    applyButton().click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.emitted.length).toBe(0);
    expect(document.activeElement).toBe(min);
  });

  it('a negative max marks and focuses the max price', async () => {
    const { fixture } = setup();
    typePrice('drawer-max-price', '-1');
    fixture.detectChanges();

    applyButton().click();
    fixture.detectChanges();
    await fixture.whenStable();

    const max = queryInput('[data-testid="drawer-max-price"]');
    expect(max.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(max);
  });

  it('the button is disabled only while the parent refreshes', () => {
    const { fixture, host } = setup();
    expect(applyButton().disabled).toBe(false);
    host.disabled.set(true);
    fixture.detectChanges();
    expect(applyButton().disabled).toBe(true);
  });

  it('a valid draft still applies once', () => {
    const { fixture, host } = setup();
    typePrice('drawer-min-price', '1000');
    fixture.detectChanges();
    applyButton().click();
    fixture.detectChanges();
    expect(host.emitted.length).toBe(1);
    expect(host.emitted[0]?.minPrice).toBe(1000);
  });
});

describe('screens.md:51: the drawer opens with focus on its heading (owner 2026-09-23)', () => {
  it('the heading "Szűrők" has the focus once the drawer is open', async () => {
    const { fixture } = setup();
    // CDK schedules the focus through `afterNextRender` after the
    // dialog mounts, so the change-detection pass alone is not enough.
    await fixture.whenStable();
    const active = document.activeElement;
    expect(active?.tagName).toBe('H2');
    expect(active?.textContent.trim()).toBe('Szűrők');
  });
});
