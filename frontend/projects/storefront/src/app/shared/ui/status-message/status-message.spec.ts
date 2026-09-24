import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { StatusMessage } from './status-message';
import type { StatusSeverity } from './status-message';

@Component({
  imports: [StatusMessage],
  template: `
    <app-status-message
      [live]="live()"
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
  readonly live = signal(true);
  readonly dismissCount = signal(0);
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

  it('uses role=status + aria-live=polite for warning (MIM-240)', () => {
    const { fixture, host } = setup();
    host.severity.set('warning');
    fixture.detectChanges();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('role')).toBe('status');
    expect(root?.getAttribute('aria-live')).toBe('polite');
  });

  it.each<[StatusSeverity, string]>([
    ['info', 'is-info'],
    ['success', 'is-success'],
    ['warning', 'is-warning'],
    ['error', 'is-error'],
  ])('severity %s carries exactly the %s class (MIM-240)', (severity, expected) => {
    const { fixture, host } = setup();
    host.severity.set(severity);
    fixture.detectChanges();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    const severityClasses = ['is-info', 'is-success', 'is-warning', 'is-error'].filter(
      (name) => root?.classList.contains(name) === true,
    );
    expect(severityClasses).toEqual([expected]);
  });

  it('decision 16: live=false renders the message with no role and no aria-live', () => {
    const { fixture, host } = setup();
    host.severity.set('info');
    host.live.set(false);
    fixture.detectChanges();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('role')).toBeNull();
    expect(root?.getAttribute('aria-live')).toBeNull();
    expect(root?.textContent).toContain('A művelet sikeres volt.');
  });

  it('decision 16: live defaults to true, so an unbound message stays a live region', () => {
    TestBed.configureTestingModule({ imports: [StatusMessage] });
    const fixture = TestBed.createComponent(StatusMessage);
    fixture.componentRef.setInput('message', 'Szöveg');
    fixture.detectChanges();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('role')).toBe('status');
    expect(root?.getAttribute('aria-live')).toBe('polite');
  });

  it('emits dismissed when the close button is clicked', () => {
    const { fixture, host } = setup();
    const btn = getNativeElement(fixture).querySelector<HTMLButtonElement>('button');
    if (btn === null) {
      throw new Error('Expected button');
    }
    btn.click();
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
      const btn = getNativeElement(fixture).querySelector<HTMLButtonElement>('button');
      if (btn === null) {
        throw new Error('Expected button');
      }
      // jsdom's computed-style engine (cssstyle) does not resolve CSS custom
      // properties: `getComputedStyle(btn).color` on this button returns the
      // literal string `var(--color-primary)` rather than a resolved color,
      // and `getComputedStyle(root).backgroundColor` returns `rgba(0, 0, 0, 0)`
      // because the token stylesheet that defines `--color-surface-light` is
      // never loaded in this unit-test environment (measured directly against
      // this suite: both were confirmed empirically before writing this
      // assertion). The real contrast outcome — computed color vs. computed
      // background-color actually differing — is therefore not observable
      // here, so this asserts the structural proxy the toast's fix turns on:
      // the dismiss button must not carry `is-secondary-on-dark` (now the
      // navy-on-lime primary-inverse recipe, which is meant for the navy
      // shell surfaces and not for this light `.root` background) and must
      // instead carry `is-secondary` (white background, navy text and border
      // — #002340 on #ffffff is 16.3:1, computed from the yettel hex values
      // in the @theme block of src/styles.css).
      expect(btn.classList.contains('is-secondary-on-dark')).toBe(false);
      expect(btn.classList.contains('is-secondary')).toBe(true);
    },
  );

  it('does not invent urgency or stock copy', () => {
    const { fixture, host } = setup();
    host.message.set('A tranzakció jóváhagyásra vár.');
    fixture.detectChanges();
    const text = getNativeElement(fixture).querySelector('.message')?.textContent ?? '';
    expect(text).not.toMatch(/utolsó|készleten|siess/i);
  });

  it('MIM-216: the row wraps so a narrow host drops the close button under the text', () => {
    const raw: unknown = StatusMessage;
    const cmp: unknown =
      typeof raw === 'function' && 'ɵcmp' in raw ? Reflect.get(raw, 'ɵcmp') : undefined;
    const styles: unknown =
      typeof cmp === 'object' && cmp !== null && 'styles' in cmp
        ? Reflect.get(cmp, 'styles')
        : undefined;
    const css = (Array.isArray(styles) ? styles : [])
      .filter((s): s is string => typeof s === 'string')
      .join(' ')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,])\s*/g, '$1');
    const root = css.slice(css.indexOf('.root{'), css.indexOf('}', css.indexOf('.root{')));
    const message = css.slice(css.indexOf('.message{'), css.indexOf('}', css.indexOf('.message{')));
    const actions = css.slice(css.indexOf('.actions{'), css.indexOf('}', css.indexOf('.actions{')));
    expect(root).toContain('flex-wrap:wrap');
    expect(message).toContain('flex:1 1 12rem');
    expect(message).toContain('min-width:0');
    expect(actions).toContain('margin-left:auto');
  });
});
