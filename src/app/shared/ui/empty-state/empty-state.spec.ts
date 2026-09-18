import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { EmptyState } from './empty-state';

@Component({
  imports: [EmptyState],
  template: `
    <app-empty-state
      [title]="title()"
      [message]="message()"
      [actionLabel]="actionLabel()"
      [actionVariant]="actionVariant()"
      (actionRequested)="actionCount.set(actionCount() + 1)"
    ></app-empty-state>
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
    const btn = getNativeElement(fixture).querySelector<HTMLButtonElement>('button');
    if (!btn) {
      throw new Error('Expected button');
    }
    btn.click();
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
