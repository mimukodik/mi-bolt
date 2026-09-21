import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, computed, signal } from '@angular/core';

import { AppliedFilters } from './applied-filters';
import { buildChips, type CatalogQuery } from './catalog-query';
import type { FilterIdentity } from '../../shared/types/filter-identity';

const NO_FILTERS: CatalogQuery = { page: 1, pageSize: 12 };

const ALL_FILTERS: CatalogQuery = {
  q: 'demo',
  brands: ['MiBolt Demo'],
  storageGb: [256],
  minPrice: 10_000,
  maxPrice: 500_000,
  inStock: true,
  is5g: true,
  featured: true,
  page: 1,
  pageSize: 12,
};

@Component({
  imports: [AppliedFilters],
  template: `
    <app-applied-filters
      [chips]="chips()"
      (cleared)="clearedCount.set(clearedCount() + 1)"
      (filterRemoved)="lastRemoved.set($event)"
    />
  `,
})
class HostComponent {
  readonly query = signal<CatalogQuery>(NO_FILTERS);
  /** The page builds the chip row and passes it down; `AppliedFilters`
   *  is presentational and takes chips, never a query. */
  readonly chips = computed(() => buildChips(this.query()));
  readonly lastRemoved = signal<FilterIdentity | null>(null);
  readonly clearedCount = signal(0);
}

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
  return raw;
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('AppliedFilters', () => {
  it('renders nothing when the query has no filters', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture);
    expect(root.querySelector('[data-testid="applied-filters"]')).toBeNull();
    expect(root.querySelector('[data-testid="applied-chip"]')).toBeNull();
  });

  it('renders one chip per filter, eight chips for a fully filtered query', () => {
    const { fixture, host } = setup();
    host.query.set(ALL_FILTERS);
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    const chips = root.querySelectorAll('[data-testid="applied-chip"]');
    expect(chips.length).toBe(8);
  });

  const cases: readonly {
    readonly testId: string;
    readonly name: FilterIdentity['name'];
    readonly value: string | number | undefined;
  }[] = [
    { testId: 'applied-chip-remove-q', name: 'q', value: undefined },
    { testId: 'applied-chip-remove-brand', name: 'brands', value: 'MiBolt Demo' },
    { testId: 'applied-chip-remove-storage', name: 'storageGb', value: 256 },
    { testId: 'applied-chip-remove-minPrice', name: 'minPrice', value: 10_000 },
    { testId: 'applied-chip-remove-maxPrice', name: 'maxPrice', value: 500_000 },
    { testId: 'applied-chip-remove-inStock', name: 'inStock', value: undefined },
    { testId: 'applied-chip-remove-is5g', name: 'is5g', value: undefined },
    { testId: 'applied-chip-remove-featured', name: 'featured', value: undefined },
  ];

  for (const testCase of cases) {
    it(`removing the ${testCase.name} chip emits FilterIdentity{name: '${testCase.name}'}`, () => {
      const { fixture, host } = setup();
      host.query.set(ALL_FILTERS);
      fixture.detectChanges();
      const root = getNativeElement(fixture);
      const removeBtn = root.querySelector<HTMLButtonElement>(`[data-testid="${testCase.testId}"]`);
      expect(removeBtn).not.toBeNull();
      removeBtn?.click();
      fixture.detectChanges();
      expect(host.lastRemoved()).toEqual({ name: testCase.name, value: testCase.value });
    });
  }

  it('emits cleared when the clear-all control is clicked', () => {
    const { fixture, host } = setup();
    host.query.set(ALL_FILTERS);
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    const clearAll = root.querySelector<HTMLButtonElement>('[data-testid="applied-filters-clear"]');
    clearAll?.click();
    expect(host.clearedCount()).toBe(1);
  });

  it('every chip remove button has an accessible name naming the chip it removes', () => {
    const { fixture, host } = setup();
    host.query.set({ ...NO_FILTERS, brands: ['MiBolt Demo'] });
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    const removeBtn = root.querySelector('[data-testid="applied-chip-remove-brand"]');
    expect(removeBtn?.getAttribute('aria-label')).toBe('Szűrő eltávolítása: MiBolt Demo');
  });
});
