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

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('EmptyState primitive', () => {
  it('renders the supplied title and message as live text', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement.querySelector('.root');
    expect(root.textContent).toContain('Nincs találat');
    expect(root.textContent).toContain('A jelenlegi szűrőkkel');
  });

  it('exposes role=status and aria-live=polite so screen readers are informed', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement.querySelector('.root');
    expect(root.getAttribute('role')).toBe('status');
    expect(root.getAttribute('aria-live')).toBe('polite');
  });

  it('emits actionRequested when the action button is clicked', () => {
    const { fixture, host } = setup();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    btn.click();
    expect(host.actionCount()).toBe(1);
  });

  it('hides the action area when no actionLabel is supplied', () => {
    const { fixture, host } = setup();
    host.actionLabel.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('does not include any urgency, review or scarcity copy', () => {
    const { fixture } = setup();
    const text: string = fixture.nativeElement.querySelector('.root').textContent ?? '';
    expect(text).not.toMatch(/utolsó|készleten|népszerű|ajánljuk/i);
  });
});
