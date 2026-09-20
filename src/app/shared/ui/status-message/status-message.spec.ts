import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { StatusMessage } from './status-message';
import type { StatusSeverity } from './status-message';

@Component({
  imports: [StatusMessage],
  template: `
    <app-status-message
      [message]="message()"
      [persistent]="persistent()"
      [severity]="severity()"
      (dismissed)="dismissCount.set(dismissCount() + 1)"
    />
  `,
})
class HostComponent {
  readonly message = signal('A művelet sikeres volt.');
  readonly severity = signal<StatusSeverity>('success');
  readonly persistent = signal(false);
  readonly dismissCount = signal(0);
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

describe('StatusMessage primitive', () => {
  it('renders the supplied message as live text', () => {
    const { fixture } = setup();
    expect(getNativeElement(fixture).querySelector('.message')?.textContent).toContain(
      'A művelet sikeres volt.',
    );
  });

  it('uses role=status + aria-live=polite for info', () => {
    const { fixture, host } = setup();
    host.severity.set('info');
    fixture.detectChanges();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('role')).toBe('status');
    expect(root?.getAttribute('aria-live')).toBe('polite');
  });

  it('uses role=status + aria-live=polite for success', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('role')).toBe('status');
    expect(root?.getAttribute('aria-live')).toBe('polite');
  });

  it('uses role=alert + aria-live=assertive for error (T10-AC05)', () => {
    const { fixture, host } = setup();
    host.severity.set('error');
    fixture.detectChanges();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('role')).toBe('alert');
    expect(root?.getAttribute('aria-live')).toBe('assertive');
  });

  it('emits dismissed when the close button is clicked', () => {
    const { fixture, host } = setup();
    const button = getNativeElement(fixture).querySelector<HTMLButtonElement>('button');
    if (!button) {
      throw new Error('Expected button');
    }
    button.click();
    expect(host.dismissCount()).toBe(1);
  });

  it('hides the close button when persistent is true', () => {
    const { fixture, host } = setup();
    host.persistent.set(true);
    fixture.detectChanges();
    expect(getNativeElement(fixture).querySelector('button')).toBeNull();
  });

  it.each<StatusSeverity>(['info', 'success', 'error'])(
    'gives the %s toast a dismiss control with a light-surface contrast pair, not the dark-surface one',
    (severity) => {
      const { fixture, host } = setup();
      host.severity.set(severity);
      fixture.detectChanges();
      const button = getNativeElement(fixture).querySelector<HTMLButtonElement>('button');
      if (!button) {
        throw new Error('Expected button');
      }
      // jsdom's computed-style engine (cssstyle) does not resolve CSS custom
      // properties: `getComputedStyle(btn).color` on this button returns the
      // literal string `var(--color-brand-ink)` rather than a resolved color,
      // and `getComputedStyle(root).backgroundColor` returns `rgba(0, 0, 0, 0)`
      // because the token stylesheet that defines `--color-surface-light` is
      // never loaded in this unit-test environment (measured directly against
      // this suite: both were confirmed empirically before writing this
      // assertion). The real contrast outcome — computed color vs. computed
      // background-color actually differing — is therefore not observable
      // here, so this asserts the structural proxy the toast's fix turns on:
      // the dismiss button must not carry `is-secondary-on-dark` (the
      // dark-surface, light-on-transparent pairing that produced the
      // 0:1 contrast on this light `.root` background) and must instead carry
      // `is-secondary` (white background, brand-ink text/border — ~6.4:1 on
      // `--color-surface-light`, verified against the token hex values in
      // src/styles/tokens.css).
      expect(button.classList.contains('is-secondary-on-dark')).toBe(false);
      expect(button.classList.contains('is-secondary')).toBe(true);
    },
  );

  it('does not invent urgency or stock copy', () => {
    const { fixture, host } = setup();
    host.message.set('A tranzakció jóváhagyásra vár.');
    fixture.detectChanges();
    const text = getNativeElement(fixture).querySelector('.message')?.textContent ?? '';
    expect(text).not.toMatch(/utolsó|készleten|siess/i);
  });
});
