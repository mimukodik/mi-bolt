import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';

import { CatalogToolbar } from './catalog-toolbar';
import type { Sort } from './catalog-query';
import type { AsyncStatus } from '../../shared/types/async-status';

@Component({
  imports: [CatalogToolbar],
  template: `
    <app-catalog-toolbar
      [total]="total()"
      [sort]="sort()"
      [pageSize]="pageSize()"
      [status]="status()"
      [appliedCount]="appliedCount()"
      (sortChanged)="lastSort.set($event)"
      (pageSizeChanged)="lastPageSize.set($event)"
      (openFilters)="openCount.set(openCount() + 1)"
    ></app-catalog-toolbar>
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
    if (!select) throw new Error('Expected select');
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
    if (!select) throw new Error('Expected select');
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
});
