import { Component, inject, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { FormField, form, required } from '@angular/forms/signals';
import type { TreeValidationResult } from '@angular/forms/signals';

import { MESSAGES } from './messages';
import { SubmitAttempt } from './submit-attempt';
import { toServerErrors } from './server-errors';

interface TestModel {
  name: string;
  price: number;
  variants: { priceHuf: number }[];
}

/** The smallest form that reproduces R1-R7: one required text field. */
@Component({
  selector: 'adm-submit-attempt-host',
  imports: [FormField],
  providers: [SubmitAttempt],
  template: `
    <input [formField]="f.name" />
    <button type="button" [disabled]="attempt.disabled(f)">Mentés</button>
  `,
})
class HostComponent {
  readonly attempt = inject(SubmitAttempt);
  readonly model = signal<TestModel>({ name: '', price: 0, variants: [{ priceHuf: 0 }] });
  readonly f = form<TestModel>(this.model, (p) => {
    required(p.name, { message: MESSAGES.required });
  });

  run(action: () => Promise<TreeValidationResult>): Promise<boolean> {
    return this.attempt.run(this.f, action);
  }
}

describe('SubmitAttempt', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  function nameInput(): HTMLInputElement {
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) {
      throw new Error('Expected the host element');
    }
    const input = raw.querySelector('input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Expected the name input');
    }
    return input;
  }

  function submitButton(): HTMLButtonElement {
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) {
      throw new Error('Expected the host element');
    }
    const button = raw.querySelector('button');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Expected the submit button');
    }
    return button;
  }

  it('R1: leaves an untouched form untouched and the button enabled', () => {
    // Fails if SubmitAttempt.disabled drops the `attempted()` guard: the
    // required error is already present, so the button would start disabled.
    expect(host.f.name().touched()).toBe(false);
    expect(submitButton().disabled).toBe(false);
  });

  it('R2: shows exactly one error once the empty field was left', async () => {
    // Fails if the bound control never reaches the field (no `[formField]`), or
    // if the schema's message stops being the Hungarian one.
    nameInput().dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(host.f.name().touched()).toBe(true);
    const errors = host.f.name().errors();
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('Kötelező mező.');
  });

  it('R3: marks the form touched, disables the button and focuses the first invalid field', async () => {
    // Fails if SubmitAttempt.run stops calling `submit()` (nothing is marked
    // touched, the button stays enabled), or drops its `onInvalid` handler
    // (the name input never receives focus).
    const resolved = await host.run(() => Promise.resolve(null));
    await fixture.whenStable();

    expect(resolved).toBe(false);
    expect(host.f.name().touched()).toBe(true);
    expect(host.attempt.attempted()).toBe(true);
    expect(submitButton().disabled).toBe(true);
    expect(document.activeElement).toBe(nameInput());
  });

  it('R5: re-enables the button as soon as the form is valid again', async () => {
    // Fails if SubmitAttempt.disabled drops the `invalid()` half: after a failed
    // attempt the button would stay disabled once the field was filled.
    await host.run(() => Promise.resolve(null));
    await fixture.whenStable();
    expect(submitButton().disabled).toBe(true);

    host.model.update((model) => ({ ...model, name: 'Kispad' }));
    await fixture.whenStable();

    expect(host.attempt.attempted()).toBe(true);
    expect(submitButton().disabled).toBe(false);
  });

  it('R6: disables the button while the save request runs', async () => {
    // Fails if SubmitAttempt.disabled drops `form().submitting()`: the form is
    // valid throughout, so only the in-flight request keeps the button disabled.
    host.model.update((model) => ({ ...model, name: 'Kispad' }));
    await fixture.whenStable();

    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });

    const running = host.run(() => pending.then(() => null));
    await fixture.whenStable();
    expect(submitButton().disabled).toBe(true);

    finish?.();
    await running;
    await fixture.whenStable();
    expect(submitButton().disabled).toBe(false);
  });

  it('R7: keeps a 422 field error on its field until the next edit', async () => {
    // Fails if the action's errors never reach the field tree (no `submit()`),
    // or if server-errors.ts stops resolving `/name`.
    host.model.set({ name: 'Kispad', price: 0, variants: [{ priceHuf: 0 }] });
    await fixture.whenStable();

    const resolved = await host.run(() =>
      Promise.resolve(toServerErrors(host.f, [{ path: '/name', code: 'NOTBLANK' }])),
    );
    await fixture.whenStable();

    expect(resolved).toBe(false);
    const serverErrors = host.f
      .name()
      .errors()
      .filter((error) => error.kind === 'server');
    expect(serverErrors.length).toBe(1);
    expect(serverErrors[0].message).toBe('Kötelező mező.');

    host.model.update((model) => ({ ...model, name: 'Kispad 2' }));
    await fixture.whenStable();

    expect(
      host.f
        .name()
        .errors()
        .filter((error) => error.kind === 'server').length,
    ).toBe(0);
  });

  it('reports section errors only after an attempt', async () => {
    // Fails if SubmitAttempt.hasErrors drops the `attempted()` guard: the form
    // is invalid from the start, so the error list is already non-empty.
    expect(host.attempt.hasErrors(host.f)).toBe(false);

    await host.run(() => Promise.resolve(null));
    await fixture.whenStable();

    expect(host.attempt.attempted()).toBe(true);
    expect(host.attempt.hasErrors(host.f)).toBe(true);
  });
});
