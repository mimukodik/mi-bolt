import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';

import { Pagination } from './pagination';

@Component({
  imports: [Pagination],
  template: `
    <app-pagination
      [disabled]="disabled()"
      [page]="page()"
      [pageSize]="pageSize()"
      [total]="total()"
      (pageChanged)="lastPage.set($event); page.set($event)"
    />
  `,
})
class HostComponent {
  readonly page = signal(1);
  readonly pageSize = signal(12);
  readonly total = signal(16);
  readonly disabled = signal(false);
  readonly lastPage = signal<number | null>(null);
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

describe('Pagination', () => {
  it('pageNumbers() renders one button per page, totalPages() entries (16 items / 12 per page = 2)', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture);
    const numbered = root.querySelectorAll(
      '[data-testid^="pagination-page-"], [data-testid="pagination-current"]',
    );
    expect(numbered.length).toBe(2);
  });

  it('exactly one button carries aria-current="page" — the current page', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture);
    const current = root.querySelectorAll('[aria-current="page"]');
    expect(current.length).toBe(1);
    expect(current[0].getAttribute('data-testid')).toBe('pagination-current');
  });

  it('clicking a numbered page emits pageChanged with that page', () => {
    const { fixture, host } = setup();
    const root = getNativeElement(fixture);
    const page2 = root.querySelector<HTMLButtonElement>('[data-testid="pagination-page-2"]');
    expect(page2).not.toBeNull();
    page2?.click();
    expect(host.lastPage()).toBe(2);
  });

  it('clicking Előző emits pageChanged with page - 1', () => {
    const { fixture, host } = setup();
    host.page.set(2);
    fixture.detectChanges();
    const prev = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="pagination-prev"]',
    );
    prev?.click();
    expect(host.lastPage()).toBe(1);
  });

  it('clicking Következő emits pageChanged with page + 1', () => {
    const { fixture, host } = setup();
    const next = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="pagination-next"]',
    );
    next?.click();
    expect(host.lastPage()).toBe(2);
  });

  it('Előző is disabled on page 1 and Következő is disabled on the last page', () => {
    const { fixture, host } = setup();
    const root = getNativeElement(fixture);
    expect(root.querySelector<HTMLButtonElement>('[data-testid="pagination-prev"]')?.disabled).toBe(
      true,
    );
    expect(root.querySelector<HTMLButtonElement>('[data-testid="pagination-next"]')?.disabled).toBe(
      false,
    );
    expect(
      root.querySelector('[data-testid="pagination-prev"]')?.classList.contains('is-unavailable'),
    ).toBe(true);
    expect(
      root.querySelector('[data-testid="pagination-next"]')?.classList.contains('is-unavailable'),
    ).toBe(false);

    host.page.set(2);
    fixture.detectChanges();
    expect(root.querySelector<HTMLButtonElement>('[data-testid="pagination-prev"]')?.disabled).toBe(
      false,
    );
    expect(root.querySelector<HTMLButtonElement>('[data-testid="pagination-next"]')?.disabled).toBe(
      true,
    );
    expect(
      root.querySelector('[data-testid="pagination-prev"]')?.classList.contains('is-unavailable'),
    ).toBe(false);
    expect(
      root.querySelector('[data-testid="pagination-next"]')?.classList.contains('is-unavailable'),
    ).toBe(true);
  });

  it('a refetch disables Előző on page 2 without marking it unavailable', () => {
    const { fixture, host } = setup();
    const root = getNativeElement(fixture);
    host.page.set(2);
    host.disabled.set(true);
    fixture.detectChanges();
    const prev = root.querySelector<HTMLButtonElement>('[data-testid="pagination-prev"]');
    expect(prev?.disabled).toBe(true);
    expect(prev?.classList.contains('is-unavailable')).toBe(false);
  });

  it('clicking Következő onto the last page moves focus to the current-page button, not <body>', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture);
    const next = root.querySelector<HTMLButtonElement>('[data-testid="pagination-next"]');
    next?.focus();
    next?.click();
    fixture.detectChanges();
    const current = root.querySelector('[data-testid="pagination-current"]');
    expect(document.activeElement).toBe(current);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('a page change that reaches no boundary leaves focus on the button pressed', () => {
    const { fixture, host } = setup();
    host.total.set(36); // 3 pages of 12
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    const page2 = root.querySelector<HTMLButtonElement>('[data-testid="pagination-page-2"]');
    page2?.focus();
    page2?.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(page2);
  });
});
