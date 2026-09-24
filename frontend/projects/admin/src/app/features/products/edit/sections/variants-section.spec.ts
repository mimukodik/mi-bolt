import {
  ANIMATION_MODULE_TYPE,
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { form } from '@angular/forms/signals';

import type { StorageGb } from '../../../../api/generated/models/storage-gb';
import { emptyColor, emptyProductForm, newKey } from '../product-form.model';
import type { ColorModel, ProductFormModel, VariantModel } from '../product-form.model';
import { productFormSchema } from '../product-form.schema';

import { VariantsSection } from './variants-section';

/** See `confirm-dialog.spec.ts` (shared/confirm-dialog) for why NoopAnimations is required in jsdom. */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

/** Builds a colour with a fresh key, mirroring `product-form.mapper.ts`'s reader. */
function color(code: string, name: string, swatchHex: string): ColorModel {
  return { ...emptyColor(), code, name, swatchHex };
}

/** Builds a variant with a fresh key; `id` is the server's, and only the server's. */
function variant(
  id: string | null,
  colorKey: string,
  storageGb: StorageGb,
  price: number,
  stock: number,
): VariantModel {
  return { key: newKey(), id, colorKey, storageGb, price, stock };
}

@Component({
  selector: 'adm-variants-section-host',
  imports: [VariantsSection],
  template: `<adm-variants-section [attempted]="attempted()" [form]="form" />`,
})
class Host {
  readonly attempted = signal(false);
  /** Section 3's colours, in order: Ezüst is first, so `add()` starts a row on it. */
  readonly ezust = color('ezust', 'Ezüst', '#C0C0C0');
  readonly fekete = color('fekete', 'Fekete', '#000000');
  readonly model = signal<ProductFormModel>({
    ...emptyProductForm(),
    slug: 'teszt-telefon',
    colors: [this.ezust, this.fekete],
    variants: [
      variant('teszt-telefon--ezust--128', this.ezust.key, 128, 199990, 4),
      variant(null, this.fekete.key, 256, 219990, 0),
    ],
  });
  readonly form = form(this.model, productFormSchema({ featuredOthers: signal(0) }));
}

describe('VariantsSection', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  function element(): HTMLElement {
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) {
      throw new Error('Expected the host element');
    }
    return raw;
  }

  /** One entry per variant, found by its id line so the order is the field's. */
  function rows(): HTMLElement[] {
    return Array.from(element().querySelectorAll<HTMLElement>('.adm-variant-id')).map((idLine) => {
      const row = idLine.parentElement;
      if (row === null) {
        throw new Error('Expected the variant id line inside its row');
      }
      return row;
    });
  }

  function formField(row: HTMLElement, label: string): HTMLElement {
    const found = Array.from(row.querySelectorAll<HTMLElement>('mat-form-field')).find(
      (field) => field.querySelector('mat-label')?.textContent.trim() === label,
    );
    if (found === undefined) {
      throw new Error(`Expected a ${label} form field`);
    }
    return found;
  }

  function inputValue(row: HTMLElement, label: string): string {
    return formField(row, label).querySelector<HTMLInputElement>('input')?.value ?? '';
  }

  function errorText(row: HTMLElement, label: string): string {
    return formField(row, label).querySelector('mat-error')?.textContent.trim() ?? '';
  }

  function selectText(row: HTMLElement): string {
    return row.querySelector('mat-select .mat-mdc-select-value-text')?.textContent.trim() ?? '';
  }

  function checkedToggle(row: HTMLElement): string {
    const checked = Array.from(row.querySelectorAll<HTMLElement>('mat-button-toggle')).find(
      (toggle) => toggle.classList.contains('mat-button-toggle-checked'),
    );
    return checked?.textContent.trim() ?? '';
  }

  function toggleButton(row: HTMLElement, label: string): HTMLButtonElement {
    const found = Array.from(row.querySelectorAll<HTMLElement>('mat-button-toggle'))
      .find((toggle) => toggle.textContent.trim() === label)
      ?.querySelector<HTMLButtonElement>('button');
    if (found === undefined || found === null) {
      throw new Error(`Expected a ${label} storage toggle`);
    }
    return found;
  }

  function idText(row: HTMLElement): string {
    return row.querySelector('.adm-variant-id')?.textContent.trim() ?? '';
  }

  function controlError(row: HTMLElement): string {
    return row.querySelector('.adm-control-error')?.textContent.trim() ?? '';
  }

  function deleteButton(row: HTMLElement): HTMLButtonElement {
    const found = row.querySelector<HTMLButtonElement>('.adm-row-delete');
    if (found === null) {
      throw new Error('Expected the row delete button');
    }
    return found;
  }

  function addButton(): HTMLButtonElement {
    const found = element().querySelector<HTMLButtonElement>('.adm-section-actions button');
    if (found === null) {
      throw new Error('Expected the header add button');
    }
    return found;
  }

  function arrayErrorText(): string {
    return element().querySelector('.adm-array-error')?.textContent.trim() ?? '';
  }

  function badge(): string {
    return element().querySelector('.adm-section-errors')?.textContent.trim() ?? '';
  }

  function overlayOptionTexts(): string[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>('.cdk-overlay-container mat-option'),
    ).map((option) => option.textContent.trim());
  }

  /** Opens the row's colour select; the options live in the overlay until one is picked. */
  async function openColorSelect(row: HTMLElement): Promise<void> {
    const trigger = row.querySelector<HTMLElement>('mat-select .mat-mdc-select-trigger');
    if (trigger === null) {
      throw new Error('Expected the colour select trigger');
    }
    trigger.click();
    await fixture.whenStable();
  }

  async function chooseColor(row: HTMLElement, name: string): Promise<void> {
    await openColorSelect(row);
    const option = Array.from(
      document.querySelectorAll<HTMLElement>('.cdk-overlay-container mat-option'),
    ).find((candidate) => candidate.textContent.trim() === name);
    if (option === undefined) {
      throw new Error(`Expected a ${name} colour option`);
    }
    option.click();
    await fixture.whenStable();
  }

  async function typeInto(row: HTMLElement, label: string, value: string): Promise<void> {
    const input = formField(row, label).querySelector<HTMLInputElement>('input');
    if (input === null) {
      throw new Error(`Expected a ${label} input`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideZonelessChangeDetection(), NOOP_ANIMATIONS],
    });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('renders one row per variant with its colour, storage, price, stock and id', async () => {
    // Fails if the @for stops walking form().variants, or the colour/storage/price/
    // stock bindings or the id line change.
    expect(rows().length).toBe(2);
    expect(rows().map(selectText)).toEqual(['Ezüst', 'Fekete']);
    expect(checkedToggle(rows()[0])).toBe('128 GB');
    expect(inputValue(rows()[0], 'Ár')).toBe('199990');
    expect(inputValue(rows()[1], 'Ár')).toBe('219990');
    expect(rows().map(idText)).toEqual([
      'azonosító: teszt-telefon--ezust--128',
      'azonosító: teszt-telefon--fekete--256 (új)',
    ]);

    await openColorSelect(rows()[0]);
    expect(overlayOptionTexts()).toEqual(['Ezüst', 'Fekete']);
  });

  it('shows the id a changed colour or storage pair will get, and keeps the server id untouched', async () => {
    // Fails if idText() compares the stored id against the derived one (case a): an
    // existing row whose storage changed is a new pair to the backend.
    const stored = 'teszt-telefon--ezust--128';
    expect(
      Array.from(rows()[0].querySelectorAll<HTMLInputElement>('input')).some(
        (input) => input.value === stored,
      ),
    ).toBe(false);

    toggleButton(rows()[0], '512 GB').click();
    await fixture.whenStable();

    expect(idText(rows()[0])).toBe('azonosító: teszt-telefon--ezust--512 (új)');
    expect(host.model().variants[0].id).toBe(stored);
  });

  it('reports a duplicate colour and storage pair on the row that repeats it', async () => {
    // Fails if the storage field stops reading the schema's validateTree error (case b):
    // the group has no mat-form-field, so only adm-control-error can show it.
    await chooseColor(rows()[1], 'Ezüst');
    toggleButton(rows()[1], '128 GB').click();
    await fixture.whenStable();

    expect(host.model().variants[1].colorKey).toBe(host.ezust.key);
    expect(host.model().variants[1].storageGb).toBe(128);
    expect(controlError(rows()[1])).toBe('Ez a szín és tárhely páros már szerepel.');
    expect(controlError(rows()[0])).toBe('');

    host.attempted.set(true);
    await fixture.whenStable();
    expect(badge()).toBe('1 hiba');
  });

  it('validates a negative stock once the field is left', async () => {
    // Fails if the stock input stops writing into the tree, or its mat-error stops
    // reading the schema's min() rule.
    await typeInto(rows()[0], 'Készlet', '-1');

    expect(errorText(rows()[0], 'Készlet')).toBe('Nem lehet negatív.');
    expect(errorText(rows()[1], 'Készlet')).toBe('');
  });

  it('appends a variant on the first colour, and removes one by index', async () => {
    // Fails if add() stops passing the first colour's key (case c), or remove()
    // stops filtering by index.
    addButton().click();
    await fixture.whenStable();

    expect(rows().length).toBe(3);
    expect(selectText(rows()[2])).toBe('Ezüst');
    expect(idText(rows()[2])).toBe('azonosító: mentéskor készül');
    expect(host.model().variants[2].stock).toBe(0);

    deleteButton(rows()[2]).click();
    await fixture.whenStable();

    expect(rows().length).toBe(2);
  });

  it('shows the section error count and the list error only once a save was attempted', async () => {
    // Fails if arrayError() ignores attempted(), or errorCount() stops reading the
    // schema's minLength(path.variants, 1) error.
    host.model.set({
      ...emptyProductForm(),
      slug: 'teszt-telefon',
      colors: [host.ezust, host.fekete],
      variants: [],
    });
    await fixture.whenStable();

    expect(arrayErrorText()).toBe('');
    expect(badge()).toBe('');

    host.attempted.set(true);
    await fixture.whenStable();

    expect(arrayErrorText()).toBe('Legalább egy változat kell.');
    expect(badge()).toBe('1 hiba');
  });
});
