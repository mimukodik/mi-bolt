import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { EmptyState } from './empty-state';

@Component({
  imports: [EmptyState],
  template: `
    <app-empty-state
      [actionLabel]="actionLabel()"
      [actionVariant]="actionVariant()"
      [message]="message()"
      [title]="title()"
      (actionRequested)="actionCount.set(actionCount() + 1)"
    />
  `,
})
class HostComponent {
  readonly title = signal('Nincs találat');
  readonly message = signal('A jelenlegi szűrőkkel nincs megjeleníthető eszköz.');
  readonly actionLabel = signal<string | null>('Szűrők törlése');
  readonly actionVariant = signal<'primary' | 'secondary'>('secondary');
  readonly actionCount = signal(0);
}

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new TypeError('Expected HTMLElement');
  }
  return raw;
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('EmptyState primitive', () => {
  it('renders the supplied title and message as live text', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.textContent).toContain('Nincs találat');
    expect(root?.textContent).toContain('A jelenlegi szűrőkkel');
  });

  it('exposes role=status and aria-live=polite so screen readers are informed', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('role')).toBe('status');
    expect(root?.getAttribute('aria-live')).toBe('polite');
  });

  it('emits actionRequested when the action button is clicked', () => {
    const { fixture, host } = setup();
    const button = getNativeElement(fixture).querySelector<HTMLButtonElement>('button');
    if (button === null) {
      throw new Error('Expected button');
    }
    button.click();
    expect(host.actionCount()).toBe(1);
  });

  it('hides the action area when no actionLabel is supplied', () => {
    const { fixture, host } = setup();
    host.actionLabel.set(null);
    fixture.detectChanges();
    expect(getNativeElement(fixture).querySelector('button')).toBeNull();
  });

  it('does not include any urgency, review or scarcity copy', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    const text = root?.textContent ?? '';
    expect(text).not.toMatch(/utolsó|készleten|népszerű|ajánljuk/i);
  });
});
