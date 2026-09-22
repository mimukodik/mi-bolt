import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { form, required } from '@angular/forms/signals';

import { ControlError } from './control-error';
import { MESSAGES } from './messages';

interface TestModel {
  name: string;
}

@Component({
  selector: 'adm-control-error-host',
  imports: [ControlError],
  template: `<adm-control-error errorId="name-error" [field]="f.name" />`,
})
class HostComponent {
  readonly model = signal<TestModel>({ name: '' });
  readonly f = form<TestModel>(this.model, (p) => {
    required(p.name, { message: MESSAGES.required });
  });
}

describe('ControlError', () => {
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

  function alert(): HTMLParagraphElement | null {
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) {
      throw new Error('Expected the host element');
    }
    const found = raw.querySelector('p[role="alert"]');
    return found instanceof HTMLParagraphElement ? found : null;
  }

  it('renders nothing while the invalid field is untouched', () => {
    // Fails if control-error.ts drops the `touched()` half of the render
    // predicate: the required error is already present on load.
    expect(alert()).toBeNull();
  });

  it('renders the first message under the given id once the field was touched', async () => {
    // Fails if control-error.ts stops binding `[id]="errorId()"`, drops
    // `role="alert"`, or reads a different message than `errors()[0]`.
    host.f.name().markAsTouched();
    await fixture.whenStable();

    const paragraph = alert();
    expect(paragraph).not.toBeNull();
    expect(paragraph?.id).toBe('name-error');
    expect(paragraph?.getAttribute('role')).toBe('alert');
    expect(paragraph?.textContent.trim()).toBe('Kötelező mező.');
  });

  it('renders nothing once the touched field becomes valid', async () => {
    // Fails if control-error.ts drops the `invalid()` half of the render
    // predicate: the paragraph would stay after the field was filled.
    host.f.name().markAsTouched();
    await fixture.whenStable();
    expect(alert()).not.toBeNull();

    host.model.set({ name: 'Kispad' });
    await fixture.whenStable();

    expect(alert()).toBeNull();
  });
});
