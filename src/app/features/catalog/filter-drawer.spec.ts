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
    [busy]="busy()"
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
  readonly busy = signal(false);

  onFiltersChanged(_next: CatalogQuery): void {
    // No-op: the drawer applies the draft through this output.
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

  it('the brand list collapses again when the drawer reopens (MIM-210)', () => {
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

    expect(document.body.querySelectorAll('[data-testid="drawer-group-brand"] li').length).toBe(5);
    const moreAfter = queryElement('[data-testid="drawer-group-brand"] .more');
    expect(moreAfter.textContent.trim()).toBe('Még több gyártó');
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

describe('MIM-228: busy input keeps the facet rows stable', () => {
  it('MIM-228-AC08: while busy the count is replaced by a skeleton and the row count does not change', () => {
    const { fixture, host } = setup();
    const colors = [
      { value: 'a', label: 'A', count: 1, swatchHex: '#111111' },
      { value: 'b', label: 'B', count: 2, swatchHex: '#222222' },
      { value: 'c', label: 'C', count: 3, swatchHex: '#333333' },
      { value: 'd', label: 'D', count: 4, swatchHex: '#444444' },
      { value: 'e', label: 'E', count: 5, swatchHex: '#555555' },
      { value: 'f', label: 'F', count: 6, swatchHex: '#666666' },
      { value: 'g', label: 'G', count: 7, swatchHex: '#777777' },
      { value: 'h', label: 'H', count: 8, swatchHex: '#888888' },
    ];
    host.facets.set({
      brands: [],
      colors,
      storageGb: [],
      inStock: 0,
      is5g: 0,
      priceRange: { min: { amount: 0, currency: 'HUF' }, max: { amount: 0, currency: 'HUF' } },
    });
    fixture.detectChanges();

    const colorList = document.body.querySelector('[data-testid="drawer-group-color"] ul');
    expect(colorList?.querySelectorAll('li').length).toBe(8);
    for (const color of colors) {
      expect(
        document.body.querySelector(`[data-testid="drawer-color-${color.value}"]`),
      ).not.toBeNull();
    }

    host.busy.set(true);
    fixture.detectChanges();

    expect(colorList?.querySelectorAll('li').length).toBe(8);
    for (const color of colors) {
      expect(
        document.body.querySelector(`[data-testid="drawer-color-${color.value}"]`),
      ).not.toBeNull();
      const chip = document.body.querySelector(`[data-testid="drawer-color-${color.value}"]`);
      expect(chip?.querySelector('.color-chip__count')).toBeNull();
      expect(chip?.querySelector('.count-skeleton')).not.toBeNull();
    }
  });

  it('MIM-228-AC09: the first load renders five brand skeleton rows and one colour skeleton row', () => {
    const { fixture, host } = setup();
    host.busy.set(true);
    fixture.detectChanges();

    const brandList = document.body.querySelector('[data-testid="drawer-group-brand"] ul');
    expect(brandList?.querySelectorAll('li').length).toBe(5);
    expect(brandList?.querySelectorAll('li.row-skeleton').length).toBe(5);
    expect(brandList?.querySelectorAll('button.option').length).toBe(0);

    const colorList = document.body.querySelector('[data-testid="drawer-group-color"] ul');
    expect(colorList?.querySelectorAll('li').length).toBe(1);
    expect(colorList?.querySelectorAll('li.row-skeleton').length).toBe(1);
    expect(colorList?.querySelectorAll('button.color-chip').length).toBe(0);
  });
});

describe('MIM-228-fix3: drawer scroll preservation', () => {
  let scrollCalls: { x: number; y: number }[];

  beforeEach(() => {
    // Stub the two timing / scroll primitives the drawer's scroll
    // preservation reaches for: `setTimeout` (the close restore waits
    // 100 ms) and `window.scrollTo` (the restore writes directly to
    // the window, which jsdom does not move).
    vi.useFakeTimers();
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true,
    });
    scrollCalls = [];
    vi.spyOn(window, 'scrollTo').mockImplementation((x: number, y: number) => {
      scrollCalls.push({ x, y });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('the close restore writes the highest scrollY seen, not the last', () => {
    const { host, fixture } = setup();
    // The constructor attaches the scroll listener and seeds
    // `preservedWindowY` from `window.scrollY` (0 in jsdom); from
    // there the listener only moves the mark upward.

    Object.defineProperty(window, 'scrollY', {
      value: 100,
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event('scroll'));

    Object.defineProperty(window, 'scrollY', {
      value: 200,
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event('scroll'));

    Object.defineProperty(window, 'scrollY', {
      value: 300,
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event('scroll'));

    // Decreases must NOT lower the captured high-water mark.
    Object.defineProperty(window, 'scrollY', {
      value: 250,
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event('scroll'));

    Object.defineProperty(window, 'scrollY', {
      value: 150,
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event('scroll'));

    host.opened.set(false);
    // Flush the close-restore effect so its 100 ms timer is queued.
    fixture.detectChanges();
    vi.advanceTimersByTime(100);

    expect(scrollCalls).toEqual([{ x: 0, y: 300 }]);
  });

  it('the close restore defers window.scrollTo through setTimeout(100)', () => {
    const { host, fixture } = setup();
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    host.opened.set(false);
    fixture.detectChanges();

    // The close effect scheduled a 100 ms timer.
    const callsWith100 = setTimeoutSpy.mock.calls.filter((args) => args[1] === 100);
    expect(callsWith100.length).toBeGreaterThanOrEqual(1);
    // No scrollTo has run yet — the restore is deferred.
    expect(scrollCalls).toEqual([]);

    vi.advanceTimersByTime(100);

    expect(scrollCalls).toEqual([{ x: 0, y: 0 }]);
  });

  it('afterToggle captures form.scrollTop and window.scrollY and restores them', () => {
    const { fixture } = setup();
    const form = document.body.querySelector('form.drawer');
    expect(form).not.toBeNull();
    if (!(form instanceof HTMLElement)) return;

    Object.defineProperty(form, 'scrollTop', {
      value: 42,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'scrollY', {
      value: 99,
      writable: true,
      configurable: true,
    });

    const button = document.body.querySelector('[data-testid="drawer-is5g"]');
    expect(button).not.toBeNull();
    if (!(button instanceof HTMLButtonElement)) return;
    button.click();
    fixture.detectChanges();

    // The schedule hasn't fired yet.
    expect(scrollCalls).toEqual([]);
    expect(form.scrollTop).toBe(42);

    vi.advanceTimersByTime(100);

    expect(scrollCalls).toEqual([{ x: 0, y: 99 }]);
    expect(form.scrollTop).toBe(42);
  });

  it('pointerdown captures form.scrollTop and focusin restores it', () => {
    const { fixture } = setup();
    const form = document.body.querySelector('form.drawer');
    expect(form).not.toBeNull();
    if (!(form instanceof HTMLElement)) return;

    // The form's own scrollTop goes through the prototype getter/setter
    // in jsdom; install a writable own property so the handler's
    // `form.scrollTop = savedFormTop` write actually lands.
    let currentScrollTop = 50;
    Object.defineProperty(form, 'scrollTop', {
      get(): number {
        return currentScrollTop;
      },
      set(value: number) {
        currentScrollTop = value;
      },
      configurable: true,
    });

    // The pointerdown listener fires in the capture phase, before any
    // focus shift the click would cause, and writes form.scrollTop
    // into the closure's `savedFormTop`.
    document.dispatchEvent(new Event('pointerdown'));

    // Simulate the focus-driven scroll that follows the click.
    currentScrollTop = 99;

    form.dispatchEvent(new FocusEvent('focusin', { bubbles: false }));
    fixture.detectChanges();

    expect(form.scrollTop).toBe(50);
  });
});
