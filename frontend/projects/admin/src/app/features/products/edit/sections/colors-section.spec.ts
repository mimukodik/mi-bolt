import {
  ANIMATION_MODULE_TYPE,
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { form } from '@angular/forms/signals';
import { EMPTY } from 'rxjs';

import type { Image } from '../../../../api/generated/models/image';
import { MediaUploader } from '../../../../shared/image-upload/media-uploader';
import { emptyColor, emptyProductForm, emptyVariant } from '../product-form.model';
import type { ColorModel, VariantModel } from '../product-form.model';
import { productFormSchema } from '../product-form.schema';

import { ColorsSection } from './colors-section';

/** See `confirm-dialog.spec.ts` (shared/confirm-dialog) for why NoopAnimations is required in jsdom. */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

const IMAGE = {
  id: 'img-1',
  src: '/api/v1/media/img-1',
  width: 800,
  height: 800,
  alt: 'Ezüst telefon',
} satisfies Image;

const EZUST: ColorModel = {
  ...emptyColor(),
  code: 'ezust',
  name: 'Ezüst',
  swatchHex: '#C0C0C0',
  alt: 'Ezüst telefon',
  image: IMAGE,
};

const FEKETE: ColorModel = {
  ...emptyColor(),
  code: 'fekete',
  name: 'Fekete',
  swatchHex: '#000000',
  alt: 'Fekete telefon',
  image: null,
};

/** The model's one variant, on the colour a removal test can take away. */
function variantOn(color: ColorModel): VariantModel {
  return { ...emptyVariant(color.key), storageGb: 128, price: 1000, stock: 1 };
}

@Component({
  selector: 'adm-colors-section-host',
  imports: [ColorsSection],
  template: `<adm-colors-section [attempted]="attempted()" [field]="form.colors" />`,
})
class Host {
  readonly attempted = signal(false);
  readonly model = signal({
    ...emptyProductForm(),
    colors: [EZUST, FEKETE],
    variants: [variantOn(FEKETE)],
  });
  readonly form = form(this.model, productFormSchema({ featuredOthers: signal(0) }));
}

describe('ColorsSection', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        provideZonelessChangeDetection(),
        NOOP_ANIMATIONS,
        { provide: MediaUploader, useValue: { upload: () => EMPTY } },
      ],
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

  /** The `mat-form-field`s carrying `label` as their `mat-label`, in document order. */
  function fieldsByLabel(label: string): HTMLElement[] {
    return Array.from(element().querySelectorAll<HTMLElement>('mat-form-field')).filter(
      (field) => field.querySelector('mat-label')?.textContent.trim() === label,
    );
  }

  function inputOf(field: HTMLElement): HTMLInputElement {
    const input = field.querySelector('input');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('Expected an input inside the form field');
    }
    return input;
  }

  function inputsByLabel(label: string): HTMLInputElement[] {
    return fieldsByLabel(label).map((field) => inputOf(field));
  }

  /** Each labelled field's error text, empty while Material projects no `mat-error`. */
  function errorsByLabel(label: string): string[] {
    return fieldsByLabel(label).map((field) => {
      const error = field.querySelector('mat-error');
      return error === null ? '' : error.textContent.trim();
    });
  }

  function swatchPickers(): HTMLInputElement[] {
    return Array.from(element().querySelectorAll<HTMLInputElement>('.adm-swatch-picker'));
  }

  function rowTriggers(): HTMLButtonElement[] {
    return Array.from(element().querySelectorAll<HTMLButtonElement>('.adm-row-menu-trigger'));
  }

  function chooseButtons(): HTMLButtonElement[] {
    return Array.from(element().querySelectorAll<HTMLButtonElement>('adm-image-upload button'));
  }

  function controlErrors(): string[] {
    return Array.from(element().querySelectorAll('.adm-control-error')).map((el) =>
      el.textContent.trim(),
    );
  }

  function badge(): string {
    const found = element().querySelector('.adm-section-errors');
    return found === null ? '' : found.textContent.trim();
  }

  function arrayError(): string {
    const found = element().querySelector('.adm-array-error');
    if (found === null) {
      throw new Error('Expected the array error paragraph');
    }
    return found.textContent.trim();
  }

  function addButton(): HTMLButtonElement {
    const found = element().querySelector<HTMLButtonElement>('.adm-section-actions button');
    if (found === null) {
      throw new Error('Expected the header add button');
    }
    return found;
  }

  function overlayMenuItems(): HTMLButtonElement[] {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container .mat-mdc-menu-item'),
    );
  }

  async function openMenu(rowIndex: number): Promise<void> {
    rowTriggers()[rowIndex].click();
    await fixture.whenStable();
  }

  async function clickMenuItem(label: string): Promise<void> {
    const item = overlayMenuItems().find(
      (menuItem) => menuItem.querySelector('span')?.textContent.trim() === label,
    );
    if (item === undefined) {
      throw new Error(`Expected the ${label} menu item`);
    }
    item.click();
    await fixture.whenStable();
  }

  function setInput(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('renders one block per colour, with its code, hex, picker value and preview', () => {
    // Fails if the @for stops walking the field, pickerValue stops lowercasing a
    // seeded swatch, or the image upload drops out of the block.
    expect(inputsByLabel('Kód').map((input) => input.value)).toEqual(['ezust', 'fekete']);
    expect(inputsByLabel('Hex').map((input) => input.value)).toEqual(['#C0C0C0', '#000000']);
    expect(swatchPickers().map((input) => input.value)).toEqual(['#c0c0c0', '#000000']);

    const preview = element().querySelector('adm-image-upload img');
    expect(preview?.getAttribute('src')?.endsWith('/api/v1/media/img-1')).toBe(true);
    expect(element().querySelectorAll('.adm-image-upload-preview').length).toBe(1);
    expect(element().querySelector('.adm-image-upload-preview')?.textContent.trim()).toBe(
      '(nincs kép)',
    );
  });

  it('writes the native picker choice into the Hex field, uppercased', async () => {
    // Fails if setSwatch drops the toUpperCase() (case a) or stops writing through the tree.
    setInput(swatchPickers()[0], '#12ab34');
    await fixture.whenStable();

    expect(host.model().colors[0].swatchHex).toBe('#12AB34');
    expect(inputsByLabel('Hex')[0].value).toBe('#12AB34');
  });

  it('shows the hex pattern error and falls the picker back to #000000', async () => {
    // Fails if pickerValue stops guarding with the hex pattern, or the mat-error binding changes.
    const hex = inputsByLabel('Hex')[0];
    setInput(hex, '#12345');
    hex.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(errorsByLabel('Hex')).toEqual(['Formátum: #RRGGBB.', '']);
    expect(swatchPickers()[0].value).toBe('#000000');
  });

  it('shows the duplicate-code error on the second colour only', async () => {
    // Fails if the schema's duplicate check stops landing on the later colour's code field.
    const kod = inputsByLabel('Kód')[1];
    setInput(kod, 'ezust');
    kod.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(errorsByLabel('Kód')).toEqual(['', 'Ez a színkód már szerepel.']);
  });

  it('shows the missing-image error once the upload button is blurred', async () => {
    // Fails if the adm-control-error binding is dropped (case b), or the image
    // field stops reporting required.
    chooseButtons()[1].dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(controlErrors()).toEqual(['', 'Tölts fel képet.']);

    host.attempted.set(true);
    await fixture.whenStable();
    expect(badge()).toBe('1 hiba');
  });

  it('removes a used colour and leaves the variant reading Ismeretlen szín.', async () => {
    // Fails if remove() stops filtering by index, or the variant's colourKey
    // stops resolving against the colour list.
    await openMenu(1);
    await clickMenuItem('Törlés');

    expect(rowTriggers().length).toBe(1);
    expect(host.model().colors.map((color) => color.code)).toEqual(['ezust']);
    expect(host.form.variants[0].colorKey().errors()[0]?.message).toBe('Ismeretlen szín.');
  });

  it('adds an empty colour and reorders by menu and by drop', async () => {
    // Fails if add() stops appending an emptyColor(), move() uses index instead of
    // index + delta (case c), or drop() ignores previousIndex/currentIndex.
    addButton().click();
    await fixture.whenStable();

    expect(rowTriggers().length).toBe(3);
    expect(host.model().colors[2].code).toBe('');
    expect(host.model().colors[2].image).toBeNull();

    await openMenu(0);
    await clickMenuItem('Lejjebb');
    expect(host.model().colors.map((color) => color.code)).toEqual(['fekete', 'ezust', '']);

    const dropList = fixture.debugElement.query(By.css('[cdkDropList]'));
    dropList.triggerEventHandler('cdkDropListDropped', { previousIndex: 2, currentIndex: 0 });
    await fixture.whenStable();

    expect(host.model().colors.map((color) => color.code)).toEqual(['', 'fekete', 'ezust']);
  });

  it('disables Feljebb on the first colour', async () => {
    // Fails if the row menu's [disabled]="first" binding drops off, which is the
    // only guard against move(index, -1) wrapping the first colour to the end.
    await openMenu(0);
    expect(overlayMenuItems().map((item) => item.disabled)).toEqual([true, false, false]);
  });

  it('disables Lejjebb on the last colour', async () => {
    // Fails if the row menu's [disabled]="last" binding drops off, which is the
    // only guard against move(index, 1) wrapping the last colour to the front.
    await openMenu(1);
    expect(overlayMenuItems().map((item) => item.disabled)).toEqual([false, true, false]);
  });

  it('shows the list error only after a save attempt', async () => {
    // Fails if arrayError() ignores attempted(), or errorCount() drops its gate.
    host.model.set({ ...emptyProductForm(), colors: [] });
    await fixture.whenStable();

    expect(arrayError()).toBe('');
    expect(badge()).toBe('');

    host.attempted.set(true);
    await fixture.whenStable();

    expect(arrayError()).toBe('Legalább egy szín kell.');
    expect(badge()).toBe('1 hiba');
  });
});
