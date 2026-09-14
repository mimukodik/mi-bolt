import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { StatusMessage } from './status-message';
import type { StatusSeverity } from './status-message';

@Component({
  imports: [StatusMessage],
  template: `
    <app-status-message
      [message]="message()"
      [severity]="severity()"
      [persistent]="persistent()"
      (dismissed)="dismissCount.set(dismissCount() + 1)"
    ></app-status-message>
  `,
})
class HostComponent {
  readonly message = signal('A művelet sikeres volt.');
  readonly severity = signal<StatusSeverity>('success');
  readonly persistent = signal(false);
  readonly dismissCount = signal(0);
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('StatusMessage primitive', () => {
  it('renders the supplied message as live text', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('.message')?.textContent).toContain('A művelet sikeres volt.');
  });

  it('uses role=status + aria-live=polite for info', () => {
    const { fixture, host } = setup();
    host.severity.set('info');
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement.querySelector('.root');
    expect(root.getAttribute('role')).toBe('status');
    expect(root.getAttribute('aria-live')).toBe('polite');
  });

  it('uses role=status + aria-live=polite for success', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement.querySelector('.root');
    expect(root.getAttribute('role')).toBe('status');
    expect(root.getAttribute('aria-live')).toBe('polite');
  });

  it('uses role=alert + aria-live=assertive for error (T10-AC05)', () => {
    const { fixture, host } = setup();
    host.severity.set('error');
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement.querySelector('.root');
    expect(root.getAttribute('role')).toBe('alert');
    expect(root.getAttribute('aria-live')).toBe('assertive');
  });

  it('emits dismissed when the close button is clicked', () => {
    const { fixture, host } = setup();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    btn.click();
    expect(host.dismissCount()).toBe(1);
  });

  it('hides the close button when persistent is true', () => {
    const { fixture, host } = setup();
    host.persistent.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('does not invent urgency or stock copy', () => {
    const { fixture, host } = setup();
    host.message.set('A tranzakció jóváhagyásra vár.');
    fixture.detectChanges();
    const text: string = fixture.nativeElement.querySelector('.message').textContent ?? '';
    expect(text).not.toMatch(/utolsó|készleten|siess/i);
  });
});
