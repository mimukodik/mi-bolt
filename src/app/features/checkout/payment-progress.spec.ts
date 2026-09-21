/**
 * FIX-61 — `PaymentProgress`'s declared surface
 * (`docs/spec/components.md:626-635`): the two signal inputs
 * (`status`, `pollCount`) and the two outputs (`retryRequested`,
 * `changeMethodRequested`). The component injects nothing and
 * issues no wire request — it is a pure render of whatever the
 * orchestrator (the review step) feeds it.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PaymentProgress } from './payment-progress';
import type { PaymentStatus } from '../../shared/types/payment-status';

@Component({
  imports: [PaymentProgress],
  template: `
    <app-payment-progress
      [status]="status()"
      [pollCount]="pollCount()"
      (retryRequested)="retryCount.set(retryCount() + 1)"
      (changeMethodRequested)="changeMethodCount.set(changeMethodCount() + 1)"
    ></app-payment-progress>
  `,
})
class HostComponent {
  readonly status = signal<PaymentStatus>('idle');
  readonly pollCount = signal(0);
  readonly retryCount = signal(0);
  readonly changeMethodCount = signal(0);
}

function getRoot(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
  return raw;
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('PaymentProgress — declared status/pollCount inputs and the two outputs', () => {
  it('renders nothing when status is idle', () => {
    const { fixture } = setup();
    expect(getRoot(fixture).querySelector('[data-testid="payment-progress"]')).toBeNull();
  });

  it('renders the pending state with the attempt counter and a progress bar', () => {
    const { fixture, host } = setup();
    host.status.set('pending');
    host.pollCount.set(3);
    fixture.detectChanges();
    const root = getRoot(fixture);
    const el = root.querySelector('[data-testid="payment-progress"]');
    expect(el?.getAttribute('data-state')).toBe('pending');
    expect(el?.textContent).toContain('3 / 10');
    expect(root.querySelector('progress')).not.toBeNull();
  });

  it('renders the succeeded state', () => {
    const { fixture, host } = setup();
    host.status.set('succeeded');
    fixture.detectChanges();
    const el = getRoot(fixture).querySelector('[data-testid="payment-progress"]');
    expect(el?.getAttribute('data-state')).toBe('succeeded');
    expect(el?.textContent).toContain('sikeres');
  });

  it('renders the declined state with retry and change-method controls, and a distinct message', () => {
    const { fixture, host } = setup();
    host.status.set('declined');
    fixture.detectChanges();
    const root = getRoot(fixture);
    const el = root.querySelector('[data-testid="payment-progress"]');
    expect(el?.getAttribute('data-state')).toBe('declined');
    expect(el?.textContent).toContain('elutasítva');
    expect(root.querySelector('[data-testid="payment-progress-retry"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="payment-progress-change-method"]')).not.toBeNull();
  });

  it('renders the unknown state with retry and change-method controls, and does not claim a rejection', () => {
    const { fixture, host } = setup();
    host.status.set('unknown');
    fixture.detectChanges();
    const root = getRoot(fixture);
    const el = root.querySelector('[data-testid="payment-progress"]');
    expect(el?.getAttribute('data-state')).toBe('unknown');
    expect(el?.textContent).not.toContain('elutasítva');
    expect(root.querySelector('[data-testid="payment-progress-retry"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="payment-progress-change-method"]')).not.toBeNull();
  });

  it('renders the error state with a generic message and no retry/change-method controls', () => {
    const { fixture, host } = setup();
    host.status.set('error');
    fixture.detectChanges();
    const root = getRoot(fixture);
    const el = root.querySelector('[data-testid="payment-progress"]');
    expect(el?.getAttribute('data-state')).toBe('error');
    expect(el?.textContent).toContain('nem sikerült');
    expect(root.querySelector('[data-testid="payment-progress-retry"]')).toBeNull();
    expect(root.querySelector('[data-testid="payment-progress-change-method"]')).toBeNull();
  });

  it('every non-idle state renders a visibly different heading', () => {
    const { fixture, host } = setup();
    const headings = new Set<string>();
    for (const status of ['pending', 'succeeded', 'declined', 'unknown', 'error'] as const) {
      host.status.set(status);
      fixture.detectChanges();
      const el = getRoot(fixture).querySelector('[data-testid="payment-progress"]');
      headings.add(el?.querySelector('h2')?.textContent ?? '');
    }
    expect(headings.size).toBe(5);
  });

  it('emits retryRequested when the declined state retry control is activated', () => {
    const { fixture, host } = setup();
    host.status.set('declined');
    fixture.detectChanges();
    const btn = getRoot(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="payment-progress-retry"] button',
    );
    if (btn === null) throw new Error('Expected the retry button');
    btn.click();
    expect(host.retryCount()).toBe(1);
  });

  it('emits changeMethodRequested when the declined state change-method control is activated', () => {
    const { fixture, host } = setup();
    host.status.set('declined');
    fixture.detectChanges();
    const btn = getRoot(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="payment-progress-change-method"] button',
    );
    if (btn === null) throw new Error('Expected the change-method button');
    btn.click();
    expect(host.changeMethodCount()).toBe(1);
  });

  it('emits both outputs from the unknown state too', () => {
    const { fixture, host } = setup();
    host.status.set('unknown');
    fixture.detectChanges();
    const root = getRoot(fixture);
    const retryBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="payment-progress-retry"] button',
    );
    const changeBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="payment-progress-change-method"] button',
    );
    if (retryBtn === null || changeBtn === null) throw new Error('Expected both buttons');
    retryBtn.click();
    changeBtn.click();
    expect(host.retryCount()).toBe(1);
    expect(host.changeMethodCount()).toBe(1);
  });
});
