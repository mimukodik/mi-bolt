import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { FormFieldMessage, type FieldError } from './form-field-message';

@Component({
  imports: [FormFieldMessage],
  template: `
    <app-form-field-message
      [fieldId]="fieldId()"
      [errors]="errors()"
      [touched]="touched()"
      [submitted]="submitted()"
      [helpText]="helpText()"
      [severity]="severity()"
    ></app-form-field-message>
  `,
})
class HostComponent {
  readonly fieldId = signal('email');
  readonly errors = signal<FieldError[]>([
    { code: 'required', message: 'Az e-mail cím megadása kötelező.', pointer: '/contact/email' },
  ]);
  readonly touched = signal(false);
  readonly submitted = signal(false);
  readonly helpText = signal<string | null>(null);
  readonly severity = signal<'help' | 'error'>('error');
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

describe('FormFieldMessage primitive', () => {
  it('exposes an id derived from the fieldId for aria-describedby', () => {
    const { fixture, host } = setup();
    host.touched.set(true);
    fixture.detectChanges();
    const msg = getNativeElement(fixture).querySelector<HTMLElement>(
      '[data-testid="form-field-message"]',
    );
    expect(msg).not.toBeNull();
    expect(msg?.id).toBe('email-message');
  });

  it('hides error text while the field is untouched and the form un-submitted', () => {
    const { fixture } = setup();
    expect(
      getNativeElement(fixture).querySelector('[data-testid="form-field-message"]'),
    ).toBeNull();
  });

  it('shows the error when the field is touched', () => {
    const { fixture, host } = setup();
    host.touched.set(true);
    fixture.detectChanges();
    const msg = getNativeElement(fixture).querySelector<HTMLElement>(
      '[data-testid="form-field-message"]',
    );
    expect(msg?.textContent).toContain('Az e-mail cím megadása kötelező.');
    expect(msg?.classList.contains('is-error')).toBe(true);
  });

  it('shows the error when the form has been submitted regardless of touched', () => {
    const { fixture, host } = setup();
    host.submitted.set(true);
    fixture.detectChanges();
    expect(
      getNativeElement(fixture).querySelector('[data-testid="form-field-message"]'),
    ).not.toBeNull();
  });

  it('tags server errors with the originating JSON pointer', () => {
    const { fixture, host } = setup();
    host.touched.set(true);
    fixture.detectChanges();
    const msg = getNativeElement(fixture).querySelector<HTMLElement>(
      '[data-testid="form-field-message"]',
    );
    expect(msg?.getAttribute('data-pointer')).toBe('/contact/email');
  });

  it('renders the help text without error styling when severity is help', () => {
    const { fixture, host } = setup();
    host.helpText.set('Formátum: nev@példa.hu');
    host.severity.set('help');
    fixture.detectChanges();
    const msg = getNativeElement(fixture).querySelector<HTMLElement>(
      '[data-testid="form-field-message"]',
    );
    expect(msg).not.toBeNull();
    if (!msg) {
      throw new Error('Expected form-field-message');
    }
    expect(msg.textContent.trim()).toBe('Formátum: nev@példa.hu');
    expect(msg.classList.contains('is-help')).toBe(true);
    expect(msg.classList.contains('is-error')).toBe(false);
  });

  it('does not show any message when there are no errors and no help text', () => {
    const { fixture, host } = setup();
    host.errors.set([]);
    fixture.detectChanges();
    expect(
      getNativeElement(fixture).querySelector('[data-testid="form-field-message"]'),
    ).toBeNull();
  });
});
