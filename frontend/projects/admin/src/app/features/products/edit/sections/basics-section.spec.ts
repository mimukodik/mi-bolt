import {
  ANIMATION_MODULE_TYPE,
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { form } from '@angular/forms/signals';

import { emptyProductForm } from '../product-form.model';
import { productFormSchema } from '../product-form.schema';

import { BasicsSection } from './basics-section';

/** See `product-edit-page.spec.ts` for the NoopAnimations spelling this workspace uses. */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

const BRANDS: readonly string[] = ['Apple', 'HONOR', 'Samsung'];

@Component({
  selector: 'adm-basics-section-host',
  imports: [BasicsSection],
  template: `<adm-basics-section [attempted]="attempted()" [brands]="brands" [form]="form" />`,
})
class Host {
  readonly attempted = signal(false);
  readonly slugLocked = signal(false);
  readonly brands = BRANDS;
  readonly model = signal(emptyProductForm());
  readonly form = form(
    this.model,
    productFormSchema({ featuredOthers: signal(0), slugLocked: this.slugLocked }),
  );
}

describe('BasicsSection', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let overlayContainer: OverlayContainer;

  function element(): HTMLElement {
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) {
      throw new Error('Expected the host element');
    }
    return raw;
  }

  function labels(): string[] {
    const matLabels = Array.from(element().querySelectorAll('mat-label')).map((el) =>
      el.textContent.trim(),
    );
    const toggleText = element().querySelector('mat-slide-toggle')?.textContent.trim() ?? '';
    return [...matLabels, toggleText];
  }

  function inputs(): HTMLInputElement[] {
    return Array.from(element().querySelectorAll<HTMLInputElement>('input'));
  }

  function textareas(): HTMLTextAreaElement[] {
    return Array.from(element().querySelectorAll<HTMLTextAreaElement>('textarea'));
  }

  function hints(): string[] {
    return Array.from(element().querySelectorAll('mat-hint')).map((el) => el.textContent.trim());
  }

  function matErrorTexts(): string[] {
    return Array.from(element().querySelectorAll('mat-error')).map((el) => el.textContent.trim());
  }

  function errorBadge(): string {
    const found = element().querySelector('.adm-section-errors');
    return found === null ? '' : found.textContent.trim();
  }

  function generateButton(): HTMLButtonElement | null {
    return element().querySelector<HTMLButtonElement>('.adm-generate-slug');
  }

  function toggleButton(): HTMLButtonElement {
    const found = element().querySelector<HTMLButtonElement>('mat-slide-toggle button');
    if (found === null) {
      throw new Error('Expected the 5G toggle button');
    }
    return found;
  }

  function optionTexts(): string[] {
    return Array.from(overlayContainer.getContainerElement().querySelectorAll('mat-option')).map(
      (el) => el.textContent.trim(),
    );
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideZonelessChangeDetection(), NOOP_ANIMATIONS],
    });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    overlayContainer = TestBed.inject(OverlayContainer);
    host.model.set({
      ...emptyProductForm(),
      name: 'Apple iPhone 18 Pro Max',
      brand: 'Apple',
      slug: 'apple-iphone-18-pro-max',
      description: 'Leírás',
      is5g: true,
      releasedAt: new Date(2024, 0, 15),
    });
    await fixture.whenStable();
  });

  it('renders the six labels, the field values and the counters', () => {
    // Fails if a label, binding or hint text changes.
    expect(labels()).toEqual(['Név', 'Márka', 'Slug', 'Leírás', 'Megjelenés dátuma', '5G']);
    expect(inputs()[0].value).toBe('Apple iPhone 18 Pro Max');
    expect(inputs()[1].value).toBe('Apple');
    expect(inputs()[2].value).toBe('apple-iphone-18-pro-max');
    expect(textareas()[0].value).toBe('Leírás');
    expect(inputs()[3].value).toBe('2024. 01. 15.');
    expect(hints()[0]).toBe('23 / 200');
    expect(hints()[2]).toBe('6 / 2000');
    expect(toggleButton().getAttribute('aria-checked')).toBe('true');
  });

  it('updates the model and the counter as the Név input changes', async () => {
    // Fails if [formField] stops writing into the tree, or the hint stops reading value().length.
    const input = inputs()[0];
    input.value = 'Apple iPhone 18';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(host.model().name).toBe('Apple iPhone 18');
    expect(hints()[0]).toBe('15 / 200');
  });

  it('filters brand suggestions as the user types and still accepts a new brand', async () => {
    // Fails if brandOptions() stops filtering, or [matAutocomplete] stops writing the selection back.
    const input = inputs()[1];
    input.dispatchEvent(new Event('focusin'));
    input.value = 'sa';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(optionTexts()).toEqual(['Samsung']);

    const samsung = Array.from(
      overlayContainer.getContainerElement().querySelectorAll('mat-option'),
    ).find((el) => el.textContent.trim() === 'Samsung');
    if (samsung === undefined) {
      throw new Error('Expected the Samsung option');
    }
    samsung.dispatchEvent(new Event('click', { bubbles: true }));
    await fixture.whenStable();

    expect(host.model().brand).toBe('Samsung');

    input.value = '';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(optionTexts()).toEqual(['Apple', 'HONOR', 'Samsung']);

    input.value = 'Nokia';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(host.model().brand).toBe('Nokia');
  });

  it('generates the slug from the name in create mode', async () => {
    // Fails if generateSlug() stops calling slugify() or markAsTouched(), or the guard hides the button (red proof a).
    host.model.set({ ...emptyProductForm(), name: 'Árvíztűrő Tükör' });
    await fixture.whenStable();

    const button = generateButton();
    if (button === null) {
      throw new Error('Expected the .adm-generate-slug button');
    }
    button.click();
    await fixture.whenStable();

    expect(host.model().slug).toBe('arvizturo-tukor');
    expect(inputs()[2].value).toBe('arvizturo-tukor');
    expect(hints()[1]).toBe('Kisbetű, szám, kötőjel');
  });

  it('hides the generate button and shows the immutable hint once the slug is locked', async () => {
    // Fails if the readonly() guard is dropped or the locked hint text changes.
    host.slugLocked.set(true);
    await fixture.whenStable();

    expect(inputs()[2].readOnly).toBe(true);
    expect(generateButton()).toBeNull();
    expect(hints()[1]).toBe('A slug létrehozás után nem módosítható.');
  });

  it('parses a typed date as a local date with no day shift', async () => {
    // Fails if MAT_DATE_LOCALE is dropped (red proof c) or the mapper drifts back to a UTC read.
    const input = inputs()[3];
    input.value = '2025. 03. 09.';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    const releasedAt = host.model().releasedAt;
    expect(releasedAt?.getFullYear()).toBe(2025);
    expect(releasedAt?.getMonth()).toBe(2);
    expect(releasedAt?.getDate()).toBe(9);
  });

  it('flips is5g when the toggle is clicked', async () => {
    toggleButton().click();
    await fixture.whenStable();

    expect(host.model().is5g).toBe(false);
  });

  it('shows the error badge only once attempted, and the Név error once blurred', async () => {
    // Fails if errorCount() stops gating on attempted(), or the schema's required message changes.
    host.model.set(emptyProductForm());
    await fixture.whenStable();
    expect(errorBadge()).toBe('');

    host.attempted.set(true);
    await fixture.whenStable();
    expect(errorBadge()).toBe('4 hiba');

    inputs()[0].dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(matErrorTexts()[0]).toBe('Kötelező mező.');
  });
});
