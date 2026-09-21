import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';

import { AsyncContent } from './async-content';
import type { AsyncStatus } from '../../types/async-status';
import type { UiProblem } from '../../types/ui-problem';

@Component({
  imports: [AsyncContent],
  template: `
    <app-async-content
      [hasPrevious]="hasPrevious()"
      [problem]="problem()"
      [status]="status()"
      (retryRequested)="retryCount.set(retryCount() + 1)"
    >
      <p data-testid="loaded-content">Loaded content</p>
      <button
        data-async-empty-action
        type="button"
        (click)="emptyActionCount.set(emptyActionCount() + 1)"
      >
        Szűrők törlése
      </button>
    </app-async-content>
  `,
})
class HostComponent {
  readonly status = signal<AsyncStatus>('loading');
  readonly problem = signal<UiProblem | null>(null);
  readonly hasPrevious = signal(false);
  readonly retryCount = signal(0);
  readonly emptyActionCount = signal(0);
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

describe('AsyncContent primitive', () => {
  it('loading with hasPrevious=false renders the skeleton and hides the projected content', () => {
    const { fixture, host } = setup();
    host.status.set('loading');
    host.hasPrevious.set(false);
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    expect(root.querySelector('[data-testid="loading-state"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="loaded-content"]')).toBeNull();
  });

  it('loading with hasPrevious=true (refreshing) keeps the projected content visible, no skeleton', () => {
    const { fixture, host } = setup();
    host.status.set('loading');
    host.hasPrevious.set(true);
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    expect(root.querySelector('[data-testid="loading-state"]')).toBeNull();
    expect(root.querySelector('[data-testid="loaded-content"]')).not.toBeNull();
  });

  it('success renders the projected content alone', () => {
    const { fixture, host } = setup();
    host.status.set('success');
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    expect(root.querySelector('[data-testid="loaded-content"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="loading-state"]')).toBeNull();
    expect(root.querySelector('[data-testid="empty-state"]')).toBeNull();
    expect(root.querySelector('[data-testid="error-state"]')).toBeNull();
  });

  it('empty renders EmptyState and projects the empty-action slot', () => {
    const { fixture } = setup();
    const fixtureHost = fixture.componentInstance;
    fixtureHost.status.set('empty');
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    expect(root.querySelector('[data-testid="catalog-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    const action = root.querySelector('[data-async-empty-action]');
    expect(action).not.toBeNull();
  });

  it('error renders ErrorState with the problem message', () => {
    const { fixture, host } = setup();
    host.status.set('error');
    host.problem.set({ code: 'x', message: 'Nem sikerült.', fieldErrors: [], retryable: true });
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    expect(root.querySelector('[data-testid="catalog-error"]')).not.toBeNull();
    const errorState = root.querySelector('[data-testid="error-state"]');
    expect(errorState).not.toBeNull();
    expect(errorState?.textContent).toContain('Nem sikerült.');
  });

  it('retryRequested emits from the error state retry control', () => {
    const { fixture, host } = setup();
    host.status.set('error');
    host.problem.set({ code: 'x', message: 'Nem sikerült.', fieldErrors: [], retryable: true });
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    const retry = root.querySelector<HTMLButtonElement>(
      '[data-testid="catalog-error"] app-button button',
    );
    expect(retry).not.toBeNull();
    retry?.click();
    fixture.detectChanges();
    expect(host.retryCount()).toBe(1);
  });
});
