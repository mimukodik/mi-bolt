import {
  ANIMATION_MODULE_TYPE,
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { form } from '@angular/forms/signals';

import { emptyProductForm } from '../product-form.model';
import type { ProductFormModel } from '../product-form.model';
import { productFormSchema } from '../product-form.schema';

import { DisplayCard } from './display-card';

/** See `spec-groups-section.spec.ts` for why the animation module token is required in jsdom. */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

@Component({
  selector: 'adm-display-card-host',
  imports: [DisplayCard],
  template: `
    <adm-display-card [attempted]="attempted()" [featuredOthers]="featuredOthers()" [form]="form" />
  `,
})
class Host {
  readonly attempted = signal(false);
  readonly featuredOthers = signal<number | null>(3);
  readonly model = signal<ProductFormModel>({
    ...emptyProductForm(),
    featured: false,
    rank: 7,
    popularityScore: 120,
  });
  readonly form = form(this.model, productFormSchema({ featuredOthers: this.featuredOthers }));
}

describe('DisplayCard', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideZonelessChangeDetection(), NOOP_ANIMATIONS],
    });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  function element(): HTMLElement {
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) {
      throw new Error('Expected the host element');
    }
    return raw;
  }

  function toggle(): HTMLElement {
    const raw: unknown = element().querySelector('mat-slide-toggle');
    if (!(raw instanceof HTMLElement)) {
      throw new Error('Expected the Kiemelt toggle');
    }
    return raw;
  }

  function toggleButton(): HTMLButtonElement {
    const raw: unknown = toggle().querySelector('button');
    if (!(raw instanceof HTMLButtonElement)) {
      throw new Error('Expected the Kiemelt toggle button');
    }
    return raw;
  }

  function hint(): string {
    return element().querySelector('.adm-featured-hint')?.textContent.trim() ?? '';
  }

  function controlError(): string {
    return element().querySelector('.adm-control-error')?.textContent.trim() ?? '';
  }

  function errorBadge(): string {
    return element().querySelector('.adm-section-errors')?.textContent.trim() ?? '';
  }

  function formField(label: string): Element {
    const found = Array.from(element().querySelectorAll('mat-form-field')).find(
      (candidate) => candidate.querySelector('mat-label')?.textContent.trim() === label,
    );
    if (found === undefined) {
      throw new Error(`Expected the ${label} form field`);
    }
    return found;
  }

  function numberInput(label: string): HTMLInputElement {
    const raw: unknown = formField(label).querySelector('input');
    if (!(raw instanceof HTMLInputElement)) {
      throw new Error(`Expected the ${label} input`);
    }
    return raw;
  }

  function fieldError(label: string): string {
    return formField(label).querySelector('mat-error')?.textContent.trim() ?? '';
  }

  function typeNumber(label: string, value: string): void {
    const input = numberInput(label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function blur(target: HTMLElement): void {
    target.dispatchEvent(new Event('blur'));
  }

  it('1: renders Kiemelt unchecked, the featured count and the two numbers', () => {
    // Fails if the hint stops counting the others, the toggle renders checked,
    // or the numbers are not written into their inputs.
    expect(toggle().textContent.trim()).toBe('Kiemelt');
    expect(toggle().classList.contains('mat-mdc-slide-toggle-checked')).toBe(false);
    expect(hint()).toBe('3 / 4 kiemelt termék');
    expect(numberInput('Rangsor').value).toBe('7');
    expect(numberInput('Népszerűség').value).toBe('120');
  });

  it('2: toggling Kiemelt marks the model featured and counts it in the hint', async () => {
    // Fails if featuredCount stops adding this product, or the toggle stops
    // writing the boolean back into the model.
    toggleButton().click();
    await fixture.whenStable();

    expect(host.model().featured).toBe(true);
    expect(hint()).toBe('4 / 4 kiemelt termék');
    expect(controlError()).toBe('');
  });

  it('3: the cap is reported by the hint and by the control error once touched', async () => {
    // Fails if the hint clamps at four, the cap error stops rendering, or the
    // section stops counting it.
    host.featuredOthers.set(4);
    await fixture.whenStable();
    expect(hint()).toBe('4 / 4 kiemelt termék');

    toggleButton().click();
    await fixture.whenStable();
    blur(toggleButton());
    // Material's focus monitor marks the toggle touched from a microtask, so the
    // first `whenStable` can resolve before the field state carries it.
    await fixture.whenStable();
    await fixture.whenStable();

    expect(hint()).toBe('5 / 4 kiemelt termék');
    expect(controlError()).toBe('Legfeljebb 4 kiemelt termék lehet.');

    host.attempted.set(true);
    await fixture.whenStable();
    expect(errorBadge()).toBe('1 hiba');
  });

  it('4: an unknown count shows no hint and raises no cap error', async () => {
    // Fails if a null count is treated as zero in the hint, or the cap
    // validator starts firing without knowing the other products.
    host.featuredOthers.set(null);
    await fixture.whenStable();
    expect(hint()).toBe('');

    toggleButton().click();
    await fixture.whenStable();
    blur(toggleButton());
    await fixture.whenStable();
    await fixture.whenStable();

    expect(host.form.featured().touched()).toBe(true);
    expect(controlError()).toBe('');
  });

  it('5: the number fields write numbers, null for empty, and the schema messages', async () => {
    // Fails if a number input writes a string, an empty input keeps a value, or
    // the field stops showing the schema's first error.
    typeNumber('Rangsor', '12');
    await fixture.whenStable();
    expect(host.model().rank).toBe(12);

    typeNumber('Rangsor', '');
    blur(numberInput('Rangsor'));
    await fixture.whenStable();
    expect(host.model().rank).toBeNull();
    expect(fieldError('Rangsor')).toBe('Kötelező mező.');

    typeNumber('Népszerűség', '1.5');
    blur(numberInput('Népszerűség'));
    await fixture.whenStable();
    expect(fieldError('Népszerűség')).toBe('Egész számot adj meg.');
  });
});
