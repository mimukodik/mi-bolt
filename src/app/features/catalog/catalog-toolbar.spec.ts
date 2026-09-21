import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';

import { CatalogToolbar } from './catalog-toolbar';
import type { Sort } from './catalog-query';
import type { AsyncStatus } from '../../shared/types/async-status';

@Component({
  imports: [CatalogToolbar],
  template: `
    <app-catalog-toolbar
      [appliedCount]="appliedCount()"
      [pageSize]="pageSize()"
      [sort]="sort()"
      [status]="status()"
      [total]="total()"
      (openFilters)="openCount.set(openCount() + 1)"
      (pageSizeChanged)="lastPageSize.set($event)"
      (sortChanged)="lastSort.set($event)"
    />
  `,
})
class HostComponent {
  readonly total = signal(16);
  readonly sort = signal<Sort>('recommended');
  readonly pageSize = signal<12 | 24>(12);
  readonly status = signal<AsyncStatus>('success');
  readonly appliedCount = signal(0);

  readonly lastSort = signal<Sort | null>(null);
  readonly lastPageSize = signal<12 | 24 | null>(null);
  readonly openCount = signal(0);
}

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
  return raw;
}

function getToolbar(fixture: ComponentFixture<HostComponent>): CatalogToolbar {
  const instance: unknown = fixture.debugElement.children[0]?.componentInstance;
  if (!(instance instanceof CatalogToolbar)) throw new Error('Expected CatalogToolbar');
  return instance;
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('CatalogToolbar', () => {
  it('emits sortChanged with the selected Sort value', () => {
    const { fixture, host } = setup();
    const select = getNativeElement(fixture).querySelector<HTMLSelectElement>(
      '[data-testid="catalog-sort"]',
    );
    if (select === null) throw new Error('Expected select');
    select.value = 'price_asc';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.lastSort()).toBe('price_asc');
  });

  it('emits pageSizeChanged with the selected page size as a number', () => {
    const { fixture, host } = setup();
    const select = getNativeElement(fixture).querySelector<HTMLSelectElement>(
      '[data-testid="catalog-page-size"]',
    );
    if (select === null) throw new Error('Expected select');
    select.value = '24';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.lastPageSize()).toBe(24);
  });

  it('emits openFilters when the mobile trigger is clicked', () => {
    const { fixture, host } = setup();
    const trigger = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="filter-trigger"]',
    );
    trigger?.click();
    expect(host.openCount()).toBe(1);
  });

  it('shows the applied-count cue on the mobile trigger when appliedCount > 0', () => {
    const { fixture, host } = setup();
    host.appliedCount.set(2);
    fixture.detectChanges();
    const trigger = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="filter-trigger"]',
    );
    expect(trigger?.textContent).toContain('(2)');
  });

  it('shows no count cue on the mobile trigger when appliedCount is 0', () => {
    const { fixture, host } = setup();
    host.appliedCount.set(0);
    fixture.detectChanges();
    const trigger = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="filter-trigger"]',
    );
    const text = trigger?.textContent ?? '';
    expect(text.includes('(')).toBe(false);
  });

  it('the mobile trigger carries aria-expanded and aria-controls, reflecting drawerExpanded()', () => {
    // WCAG 4.1.2: a control that discloses a panel must say what it
    // discloses and whether it is open. `drawerExpanded` is the
    // non-input channel `CatalogPage` pushes the drawer's real open
    // state through (see `catalog-toolbar.ts`'s comment on it).
    const { fixture } = setup();
    const toolbar = getToolbar(fixture);
    const trigger = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="filter-trigger"]',
    );
    expect(trigger?.getAttribute('aria-controls')).toBe('filter-drawer');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    toolbar.drawerExpanded.set(true);
    fixture.detectChanges();
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders eight sort options in SORT_MODES order (MIM-210)', () => {
    const { fixture } = setup();
    const options = getNativeElement(fixture).querySelectorAll<HTMLOptionElement>(
      '[data-testid="catalog-sort"] option',
    );
    const values = Array.from(options).map((o) => o.value);
    expect(values).toEqual([
      'recommended',
      'newest',
      'oldest',
      'popularity',
      'price_asc',
      'price_desc',
      'name_asc',
      'name_desc',
    ]);
    const labels = Array.from(options).map((o) => o.textContent.trim());
    expect(labels[0]).toBe('Ajánlott sorrend');
    expect(labels[2]).toBe('Legrégebbi elöl');
    expect(labels[3]).toBe('Népszerűség szerint');
    expect(labels[6]).toBe('Név szerint (A–Z)');
    expect(labels[7]).toBe('Név szerint (Z–A)');
  });

  it('the results line names the filtered count (MIM-210)', () => {
    const { fixture } = setup();
    const toolbar = getToolbar(fixture);
    expect(toolbar.resultCountLabel()).toBe('16 találat a szűrt feltételek szerint');
  });
});
