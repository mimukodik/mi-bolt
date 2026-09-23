/**
 * T27 fix — FilterPanel draft/reset regression suite.
 *
 * Root cause: the search / min-price / max-price boxes used to carry a
 * private `signal` + `computed` "draft" pair that fell back to the
 * applied `value()` only while the local signal was empty. A page-side
 * clear (the "Összes szűrő törlése" link or the empty state's "Szűrők
 * törlése" button) updates `value()` directly without ever touching that
 * private signal, so the stale typed text stayed on screen while the
 * applied query, the URL and the result count had already reset — see
 * `.visual-screenshots/2026-09-19-showcase-catalog/07-catalog-after-reset-1440.png`.
 *
 * The fix replaces each draft with a `linkedSignal` sourced from the
 * matching field of `value()` *plus* whether the applied query still
 * carries any filter at all, so the applied value wins back on a change
 * to the mirrored field and on a clear, while a `value()` change that
 * leaves the mirrored field untouched (e.g. an unrelated brand toggle)
 * does not throw away an uncommitted edit. The second half of that
 * source is what covers a draft the `invalid` price state blocked from
 * ever committing: its own field never changed, so a clear is invisible
 * to the field comparison alone.
 *
 * The same round also removed the `priceError()` guard from
 * `onSearchInput`, which dropped a typed search term whenever the price
 * range happened to be invalid — an unrelated field silently refusing
 * to filter.
 *
 * The suite follows the pattern of `product-card.spec.ts`: a thin host
 * component drives the real `FilterPanel` through its public inputs and
 * output, and every assertion reads the rendered DOM rather than the
 * component's private state.
 */

import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Facets } from '@mi-bolt/api/models/facets';

import { DEFAULT_CATALOG_QUERY, type CatalogQuery } from './catalog-query';
import { FilterPanel } from './filter-panel';

beforeAll(async () => {
  await TestBed.compileComponents();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
  return raw;
}

function queryInput(parent: Element, selector: string): HTMLInputElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLInputElement)) throw new Error(`Expected HTMLInputElement: ${selector}`);
  return el;
}

function queryElement(parent: Element, selector: string): HTMLElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error(`Expected HTMLElement: ${selector}`);
  return el;
}

function queryButton(parent: Element, selector: string): HTMLButtonElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLButtonElement))
    throw new Error(`Expected HTMLButtonElement: ${selector}`);
  return el;
}

function fireInput(el: HTMLInputElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

// ---------------------------------------------------------------------------
// Host: wires FilterPanel to a query signal the way CatalogPage does
// (`[value]="facade.query()"`, `(filtersChanged)="onFiltersChanged($event)"`),
// so a committed edit really does round-trip back into `value()`.
// ---------------------------------------------------------------------------

@Component({
  imports: [FilterPanel],
  template: `<app-filter-panel
    [busy]="busy()"
    [facets]="facets()"
    [value]="query()"
    (filtersChanged)="onFiltersChanged($event)"
  />`,
})
class HostComponent {
  readonly query = signal<CatalogQuery>(DEFAULT_CATALOG_QUERY);
  readonly facets = signal<Facets | null>(null);
  readonly busy = signal(false);

  onFiltersChanged(next: CatalogQuery): void {
    this.query.set(next);
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

describe('T27 FilterPanel — draft/reset regression', () => {
  it('empties the rendered search box when a page-side clear removes q from value()', () => {
    const { fixture, host } = setup();
    const root = getRootElement(fixture);
    const search = queryInput(root, '[data-testid="filter-search-input"]');

    fireInput(search, 'zzzno');
    fixture.detectChanges();
    expect(search.value).toBe('zzzno');

    // A page-side "Összes szűrő törlése" / "Szűrők törlése" click does not
    // go through FilterPanel.resetAll() — it updates the applied value()
    // directly, exactly like the reproduction in the bug report.
    host.query.set(DEFAULT_CATALOG_QUERY);
    fixture.detectChanges();

    expect(search.value).toBe('');
  });

  it('empties the rendered min-price box when a page-side clear removes minPrice from value()', () => {
    const { fixture, host } = setup();
    const root = getRootElement(fixture);
    const min = queryInput(root, '[data-testid="filter-min-price"]');

    fireInput(min, '50000');
    fixture.detectChanges();
    expect(min.value).toBe('50000');

    host.query.set(DEFAULT_CATALOG_QUERY);
    fixture.detectChanges();

    expect(min.value).toBe('');
  });

  it('empties the rendered max-price box when a page-side clear removes maxPrice from value()', () => {
    const { fixture, host } = setup();
    const root = getRootElement(fixture);
    const max = queryInput(root, '[data-testid="filter-max-price"]');

    fireInput(max, '900000');
    fixture.detectChanges();
    expect(max.value).toBe('900000');

    host.query.set(DEFAULT_CATALOG_QUERY);
    fixture.detectChanges();

    expect(max.value).toBe('');
  });

  it('keeps an uncommitted draft when value() changes in a field the draft does not mirror', () => {
    const { fixture } = setup();
    const root = getRootElement(fixture);
    const max = queryInput(root, '[data-testid="filter-max-price"]');
    const min = queryInput(root, '[data-testid="filter-min-price"]');
    const inStockToggle = queryElement(root, '[data-testid="filter-inStock"]');

    // Commit a valid max price.
    fireInput(max, '10000');
    fixture.detectChanges();

    // Type a min price that makes the range invalid: min > max suppresses
    // the emit, so this edit never reaches value().minPrice.
    fireInput(min, '20000');
    fixture.detectChanges();
    expect(min.value).toBe('20000');
    expect(queryElement(root, '[data-testid="filter-price-error"]')).toBeTruthy();

    // An unrelated control (in-stock toggle) changes value(), but never
    // touches minPrice. The uncommitted "20000" must survive.
    inStockToggle.click();
    fixture.detectChanges();

    expect(min.value).toBe('20000');
  });

  it('lets the search box be cleared by hand instead of falling back to the applied term', () => {
    const { fixture, host } = setup();
    host.query.set({ ...DEFAULT_CATALOG_QUERY, q: 'hello' });
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const search = queryInput(root, '[data-testid="filter-search-input"]');
    expect(search.value).toBe('hello');

    // Select-all + delete: the input fires with an empty string.
    fireInput(search, '');
    fixture.detectChanges();

    expect(search.value).toBe('');
  });

  it('still clears the search box through the panel\'s own "Szűrők törlése" button', () => {
    const { fixture } = setup();
    const root = getRootElement(fixture);
    const search = queryInput(root, '[data-testid="filter-search-input"]');

    fireInput(search, 'zzzno');
    fixture.detectChanges();
    expect(search.value).toBe('zzzno');

    // resetAll() no longer clears a private draft signal directly; it
    // relies solely on the round-tripped value() update below. The
    // testid lives on the <app-button> host, so click its inner
    // native <button> to fire a real click event.
    queryButton(root, '[data-testid="filter-reset"] button').click();
    fixture.detectChanges();

    expect(search.value).toBe('');
  });

  it('applies a search term typed while the price range is invalid, without leaking the rejected price', () => {
    const { fixture, host } = setup();
    const root = getRootElement(fixture);
    const max = queryInput(root, '[data-testid="filter-max-price"]');
    const min = queryInput(root, '[data-testid="filter-min-price"]');
    const search = queryInput(root, '[data-testid="filter-search-input"]');

    // Commit a valid max, then type a min that inverts the range.
    fireInput(max, '1000');
    fixture.detectChanges();
    fireInput(min, '20000');
    fixture.detectChanges();
    expect(queryElement(root, '[data-testid="filter-price-error"]')).toBeTruthy();

    fireInput(search, 'Sample');
    fixture.detectChanges();

    // The search term reaches the applied query; `emit` composes the
    // next query from the APPLIED value, so the rejected min stays out
    // and the committed max is untouched.
    expect(host.query().q).toBe('Sample');
    expect(host.query().minPrice).toBeUndefined();
    expect(host.query().maxPrice).toBe(1000);
    // The price range is still flagged as invalid.
    expect(queryElement(root, '[data-testid="filter-price-error"]')).toBeTruthy();
  });

  it('empties a price box whose edit never reached value() when a page-side clear empties the query', () => {
    const { fixture, host } = setup();
    const root = getRootElement(fixture);
    const max = queryInput(root, '[data-testid="filter-max-price"]');
    const min = queryInput(root, '[data-testid="filter-min-price"]');

    fireInput(max, '1000');
    fixture.detectChanges();
    fireInput(min, '20000');
    fixture.detectChanges();
    expect(min.value).toBe('20000');
    // The inverted range suppressed the emit: minPrice never entered
    // value(), so a clear leaves this draft's own source unchanged.
    expect(host.query().minPrice).toBeUndefined();

    host.query.set(DEFAULT_CATALOG_QUERY);
    fixture.detectChanges();

    expect(min.value).toBe('');
    expect(max.value).toBe('');
    expect(root.querySelector('[data-testid="filter-price-error"]')).toBeNull();
  });

  it('empties every box after the reported repro: invalid range, toggle, search, page-side clear', () => {
    const { fixture, host } = setup();
    const root = getRootElement(fixture);
    const max = queryInput(root, '[data-testid="filter-max-price"]');
    const min = queryInput(root, '[data-testid="filter-min-price"]');
    const search = queryInput(root, '[data-testid="filter-search-input"]');
    const inStockToggle = queryElement(root, '[data-testid="filter-inStock"]');

    fireInput(max, '1000');
    fixture.detectChanges();
    fireInput(min, '20000');
    fixture.detectChanges();
    inStockToggle.click();
    fixture.detectChanges();
    fireInput(search, 'Sample');
    fixture.detectChanges();

    expect(max.value).toBe('1000');
    expect(min.value).toBe('20000');
    expect(search.value).toBe('Sample');

    // "Összes szűrő törlése" on the page resets the applied query.
    host.query.set(DEFAULT_CATALOG_QUERY);
    fixture.detectChanges();

    expect(search.value).toBe('');
    expect(min.value).toBe('');
    expect(max.value).toBe('');
    expect(root.querySelector('[data-testid="filter-price-error"]')).toBeNull();
  });

  it('keeps an uncommitted draft when an unrelated control switches the first filter on', () => {
    const { fixture, host } = setup();
    const root = getRootElement(fixture);
    const min = queryInput(root, '[data-testid="filter-min-price"]');
    const inStockToggle = queryElement(root, '[data-testid="filter-inStock"]');

    // A negative min is invalid on its own, so nothing is applied yet:
    // the query still carries no filter at all.
    fireInput(min, '-5');
    fixture.detectChanges();
    expect(queryElement(root, '[data-testid="filter-price-error"]').textContent).toContain(
      'A minimum ár nem lehet negatív.',
    );
    expect(host.query().minPrice).toBeUndefined();

    // Unfiltered -> filtered is not a clear; the local edit survives.
    inStockToggle.click();
    fixture.detectChanges();

    expect(min.value).toBe('-5');
  });

  it('clears a never-applied price draft through the panel\'s own "Szűrők törlése" button', () => {
    const { fixture } = setup();
    const root = getRootElement(fixture);
    const max = queryInput(root, '[data-testid="filter-max-price"]');
    const min = queryInput(root, '[data-testid="filter-min-price"]');

    fireInput(max, '1000');
    fixture.detectChanges();
    fireInput(min, '20000');
    fixture.detectChanges();
    expect(min.value).toBe('20000');

    queryButton(root, '[data-testid="filter-reset"] button').click();
    fixture.detectChanges();

    expect(min.value).toBe('');
    expect(max.value).toBe('');
  });

  it('renders the Hungarian message for an inverted min/max range', () => {
    const { fixture } = setup();
    const root = getRootElement(fixture);
    const min = queryInput(root, '[data-testid="filter-min-price"]');
    const max = queryInput(root, '[data-testid="filter-max-price"]');

    fireInput(max, '1000');
    fixture.detectChanges();
    fireInput(min, '2000');
    fixture.detectChanges();

    const error = queryElement(root, '[data-testid="filter-price-error"]');
    expect(error.textContent).toContain('A minimum nem lehet nagyobb a maximum árnál.');
  });
});

describe('FilterPanel — hasActiveFilters() and resetAll() cover featured', () => {
  it('enables the reset button when featured is the only applied field', () => {
    const { fixture, host } = setup();
    const root = getRootElement(fixture);
    const reset = queryButton(root, '[data-testid="filter-reset"] button');

    // Default query: nothing applied, reset stays disabled.
    expect(reset.disabled).toBe(true);

    host.query.set({ ...DEFAULT_CATALOG_QUERY, featured: true });
    fixture.detectChanges();

    expect(reset.disabled).toBe(false);
  });

  it('does not treat featured: false as an active filter', () => {
    const { fixture, host } = setup();
    const root = getRootElement(fixture);
    const reset = queryButton(root, '[data-testid="filter-reset"] button');

    host.query.set({ ...DEFAULT_CATALOG_QUERY, featured: false });
    fixture.detectChanges();

    expect(reset.disabled).toBe(true);
  });

  it("clears featured through the panel's own reset button", () => {
    const { fixture, host } = setup();
    host.query.set({ ...DEFAULT_CATALOG_QUERY, featured: true });
    fixture.detectChanges();
    const root = getRootElement(fixture);

    queryButton(root, '[data-testid="filter-reset"] button').click();
    fixture.detectChanges();

    expect(host.query().featured).toBeUndefined();
  });

  it('clears an uncommitted invalid min-price draft through a page-side clear when featured is the only applied field', () => {
    // Symptom 2 reproduction: with only `featured` applied, `filtered`
    // (hasActiveFilters()) was already true->false-insensitive because it
    // never counted `featured` at all, so a page-side clear (which never
    // touches the applied `featured` filter directly, but replaces the
    // whole query) failed to flip `filtered` and left the invalid draft
    // on screen. With `featured` now counted, `filtered` starts true and
    // a page-side clear correctly flips it to false.
    const { fixture, host } = setup();
    host.query.set({ ...DEFAULT_CATALOG_QUERY, featured: true });
    fixture.detectChanges();
    const root = getRootElement(fixture);
    const min = queryInput(root, '[data-testid="filter-min-price"]');

    fireInput(min, '-5');
    fixture.detectChanges();
    expect(queryElement(root, '[data-testid="filter-price-error"]').textContent).toContain(
      'A minimum ár nem lehet negatív.',
    );
    expect(min.value).toBe('-5');

    // Page-side clear: "Összes szűrő törlése" replaces the whole applied
    // query, exactly like CatalogPage.onClearAll() -> facade.reset().
    host.query.set(DEFAULT_CATALOG_QUERY);
    fixture.detectChanges();

    expect(min.value).toBe('');
    expect(root.querySelector('[data-testid="filter-price-error"]')).toBeNull();
  });
});

/**
 * Storage / stock / 5G / price facets wiring.
 *
 * Each facet field renders from `Facets` exactly the way the contract
 * publishes it: storage chips show the `FacetValue.label` and an
 * `option__count` span with the count when the facet is present, the
 * stock and 5G toggles add an `option__count` span next to the label,
 * and the price inputs carry the price range as a placeholder hint.
 * When `Facets` is null (the very first load), every count span and
 * placeholder is suppressed so the controls stay present without
 * displaying a number that has no value.
 */
describe('FilterPanel — facets wire-up', () => {
  it('storage chips show the facet label and an option__count when facets are loaded', () => {
    const { fixture, host } = setup();
    const root = getRootElement(fixture);

    // With no facets: three chips, no count spans.
    const before = root.querySelectorAll('[data-testid="filter-storage-128"]');
    expect(before.length).toBe(1);
    expect(before[0].querySelector('.option__count')).toBeNull();

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

    const mid = queryElement(root, '[data-testid="filter-storage-256"]');
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
    const root = getRootElement(fixture);

    const inStock = queryElement(root, '[data-testid="filter-inStock"]');
    const inStockCount = inStock.querySelector('.option__count');
    expect(inStockCount?.textContent.trim()).toBe('(7)');

    const is5g = queryElement(root, '[data-testid="filter-is5g"]');
    const is5gCount = is5g.querySelector('.option__count');
    expect(is5gCount?.textContent.trim()).toBe('(9)');
  });

  it('price inputs carry the price range as a placeholder when facets are loaded', () => {
    const { fixture, host } = setup();
    const root = getRootElement(fixture);
    const min = queryInput(root, '[data-testid="filter-min-price"]');
    const max = queryInput(root, '[data-testid="filter-max-price"]');

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
    // A brand beyond row five is selected, forcing the list open without
    // the user ever clicking "more" — brandsExpanded stays false.
    host.query.set({ ...DEFAULT_CATALOG_QUERY, brands: ['xiaomi'] });
    fixture.detectChanges();

    const more = queryButton(getRootElement(fixture), '[data-testid="filter-brand-more"]');
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.textContent.trim()).toBe('Kevesebb gyártó');
  });
});

describe('MIM-228: a selected facet row with a zero count stays clickable', () => {
  it('a selected brand and colour at count 0 are enabled; unselected ones at count 0 are disabled', () => {
    const { fixture, host } = setup();
    const root = getRootElement(fixture);

    host.query.set({ ...DEFAULT_CATALOG_QUERY, brands: ['apple'], colors: ['black'] });
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
    fixture.detectChanges();

    expect(queryButton(root, '[data-testid="filter-brand-apple"]').disabled).toBe(false);
    expect(queryButton(root, '[data-testid="filter-brand-samsung"]').disabled).toBe(true);
    expect(queryButton(root, '[data-testid="filter-color-black"]').disabled).toBe(false);
    expect(queryButton(root, '[data-testid="filter-color-white"]').disabled).toBe(true);
  });
});

describe('FilterPanel — the price error is tied to the invalid price field', () => {
  it('an untouched price range links no field and marks none invalid', () => {
    const { fixture } = setup();
    const root = getRootElement(fixture);
    const min = queryInput(root, '[data-testid="filter-min-price"]');
    const max = queryInput(root, '[data-testid="filter-max-price"]');

    expect(min.getAttribute('aria-describedby')).toBeNull();
    expect(min.getAttribute('aria-invalid')).toBeNull();
    expect(max.getAttribute('aria-describedby')).toBeNull();
    expect(max.getAttribute('aria-invalid')).toBeNull();
    expect(root.querySelector('[data-testid="filter-price-error"]')).toBeNull();
  });

  it('a negative min links the min field to the message and marks it invalid', () => {
    const { fixture } = setup();
    const root = getRootElement(fixture);
    const min = queryInput(root, '[data-testid="filter-min-price"]');
    const max = queryInput(root, '[data-testid="filter-max-price"]');

    fireInput(min, '-5');
    fixture.detectChanges();

    expect(min.getAttribute('aria-describedby')).toBe('filter-price-message');
    expect(min.getAttribute('aria-invalid')).toBe('true');
    expect(max.getAttribute('aria-describedby')).toBeNull();
    expect(max.getAttribute('aria-invalid')).toBeNull();
    const message = queryElement(root, '#filter-price-message');
    expect(message.hidden).toBe(false);
    expect(message.textContent.trim()).toBe('A minimum ár nem lehet negatív.');
  });

  it('a negative max links the max field to the message and marks it invalid', () => {
    const { fixture } = setup();
    const root = getRootElement(fixture);
    const min = queryInput(root, '[data-testid="filter-min-price"]');
    const max = queryInput(root, '[data-testid="filter-max-price"]');

    fireInput(max, '-5');
    fixture.detectChanges();

    expect(max.getAttribute('aria-describedby')).toBe('filter-price-message');
    expect(max.getAttribute('aria-invalid')).toBe('true');
    expect(min.getAttribute('aria-describedby')).toBeNull();
    expect(min.getAttribute('aria-invalid')).toBeNull();
    const message = queryElement(root, '#filter-price-message');
    expect(message.hidden).toBe(false);
    expect(message.textContent.trim()).toBe('A maximum ár nem lehet negatív.');
  });

  it('an inverted range links the min field, not the max field', () => {
    const { fixture } = setup();
    const root = getRootElement(fixture);
    const min = queryInput(root, '[data-testid="filter-min-price"]');
    const max = queryInput(root, '[data-testid="filter-max-price"]');

    fireInput(max, '1000');
    fixture.detectChanges();
    fireInput(min, '2000');
    fixture.detectChanges();

    expect(min.getAttribute('aria-describedby')).toBe('filter-price-message');
    expect(min.getAttribute('aria-invalid')).toBe('true');
    expect(max.getAttribute('aria-describedby')).toBeNull();
    expect(max.getAttribute('aria-invalid')).toBeNull();
    expect(queryElement(root, '#filter-price-message').textContent.trim()).toBe(
      'A minimum nem lehet nagyobb a maximum árnál.',
    );
  });

  it('fixing the error removes the link and the invalid mark', () => {
    const { fixture } = setup();
    const root = getRootElement(fixture);
    const min = queryInput(root, '[data-testid="filter-min-price"]');

    fireInput(min, '-5');
    fixture.detectChanges();
    expect(min.getAttribute('aria-invalid')).toBe('true');

    fireInput(min, '500');
    fixture.detectChanges();

    expect(min.getAttribute('aria-describedby')).toBeNull();
    expect(min.getAttribute('aria-invalid')).toBeNull();
    expect(root.querySelector('[data-testid="filter-price-error"]')).toBeNull();
  });
});

describe('MIM-228 facet skeleton', () => {
  // Fixture: at least 2 brands, 3 colours, all three storage buckets with
  // counts, and non-null inStock and is5g — every count cell rendered.
  function loadedFacets(): Facets {
    return {
      brands: [
        { value: 'apple', label: 'Apple', count: 12 },
        { value: 'samsung', label: 'Samsung', count: 7 },
      ],
      colors: [
        { value: 'black', label: 'Fekete', count: 9, swatchHex: '#000000' },
        { value: 'white', label: 'Fehér', count: 5, swatchHex: '#ffffff' },
        { value: 'blue', label: 'Kék', count: 3, swatchHex: '#1e6fff' },
      ],
      storageGb: [
        { value: '128', label: '128 GB', count: 3 },
        { value: '256', label: '256 GB', count: 5 },
        { value: '512', label: '512 GB', count: 1 },
      ],
      inStock: 11,
      is5g: 14,
      priceRange: { min: { amount: 0, currency: 'HUF' }, max: { amount: 0, currency: 'HUF' } },
    };
  }

  it('a count being re-fetched keeps its text and its box, and is hidden from assistive tech', () => {
    const { fixture, host } = setup();
    const panel = getRootElement(fixture);
    host.facets.set(loadedFacets());
    fixture.detectChanges();

    const beforeSpans = Array.from(
      panel.querySelectorAll<HTMLElement>('.option__count, .color-chip__count'),
    );
    expect(beforeSpans.length).toBeGreaterThan(0);
    const beforeTexts = beforeSpans.map((el) => el.textContent);
    const beforeBrandLi = panel.querySelectorAll('[data-testid="filter-group-brand"] li').length;
    const beforeColorLi = panel.querySelectorAll('[data-testid="filter-group-color"] li').length;

    host.busy.set(true);
    fixture.detectChanges();

    const afterSpans = Array.from(
      panel.querySelectorAll<HTMLElement>('.option__count, .color-chip__count'),
    );
    expect(afterSpans.length).toBe(beforeSpans.length);
    afterSpans.forEach((el, idx) => {
      expect(el.classList.contains('facet-count-busy')).toBe(true);
      expect(el.getAttribute('aria-hidden')).toBe('true');
      expect(el.textContent).toBe(beforeTexts[idx]);
    });
    expect(panel.querySelectorAll('[data-testid="filter-group-brand"] li').length).toBe(
      beforeBrandLi,
    );
    expect(panel.querySelectorAll('[data-testid="filter-group-color"] li').length).toBe(
      beforeColorLi,
    );

    host.busy.set(false);
    fixture.detectChanges();

    const settledSpans = Array.from(
      panel.querySelectorAll<HTMLElement>('.option__count, .color-chip__count'),
    );
    settledSpans.forEach((el) => {
      expect(el.classList.contains('facet-count-busy')).toBe(false);
      expect(el.getAttribute('aria-hidden')).toBeNull();
    });
  });

  it('before the first response the brand and colour lists show skeleton rows', () => {
    const { fixture, host } = setup();
    const panel = getRootElement(fixture);
    host.facets.set(null);
    host.busy.set(true);
    fixture.detectChanges();

    const brandSkeletons = panel.querySelectorAll(
      '[data-testid="filter-group-brand"] [data-testid="brand-skeleton-row"]',
    );
    const colorSkeletons = panel.querySelectorAll(
      '[data-testid="filter-group-color"] [data-testid="color-skeleton-row"]',
    );
    expect(brandSkeletons.length).toBe(5);
    expect(colorSkeletons.length).toBe(1);
    expect(panel.querySelectorAll('[data-testid="filter-group-brand"] button.option').length).toBe(
      0,
    );
    expect(
      panel.querySelectorAll('[data-testid="filter-group-color"] button.color-chip').length,
    ).toBe(0);

    Array.from(brandSkeletons).forEach((el) => {
      expect(el.getAttribute('aria-hidden')).toBe('true');
    });
    Array.from(colorSkeletons).forEach((el) => {
      expect(el.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('no skeleton rows while no request runs', () => {
    const { fixture, host } = setup();
    const panel = getRootElement(fixture);
    host.facets.set(null);
    host.busy.set(false);
    fixture.detectChanges();

    expect(panel.querySelectorAll('[data-testid="brand-skeleton-row"]').length).toBe(0);
    expect(panel.querySelectorAll('[data-testid="color-skeleton-row"]').length).toBe(0);
  });

  it('the skeleton rows leave once the first response lands', () => {
    const { fixture, host } = setup();
    const panel = getRootElement(fixture);
    host.facets.set(null);
    host.busy.set(true);
    fixture.detectChanges();
    expect(panel.querySelectorAll('[data-testid="brand-skeleton-row"]').length).toBe(5);
    expect(panel.querySelectorAll('[data-testid="color-skeleton-row"]').length).toBe(1);

    host.facets.set(loadedFacets());
    host.busy.set(false);
    fixture.detectChanges();

    expect(panel.querySelectorAll('[data-testid="brand-skeleton-row"]').length).toBe(0);
    expect(panel.querySelectorAll('[data-testid="color-skeleton-row"]').length).toBe(0);
    expect(panel.querySelectorAll('[data-testid="filter-group-brand"] button.option').length).toBe(
      2,
    );
  });
});
