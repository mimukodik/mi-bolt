import {
  ANIMATION_MODULE_TYPE,
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { form } from '@angular/forms/signals';

import { emptyProductForm, newKey } from '../product-form.model';
import type { ProductFormModel, SpecGroupModel, SpecRowModel } from '../product-form.model';
import { productFormSchema } from '../product-form.schema';

import { SpecGroupsSection } from './spec-groups-section';

/**
 * The section has to run without animations here, for the same reason
 * `conflict-dialog.spec.ts` gives: with no `ANIMATION_MODULE_TYPE` provider
 * Material reports animations as enabled and a panel's expanded state never
 * settles within `whenStable()`.
 */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

function r(label: string, value: string): SpecRowModel {
  return { key: newKey(), label, value };
}

function g(title: string, rows: SpecRowModel[]): SpecGroupModel {
  return { key: newKey(), title, rows };
}

@Component({
  selector: 'adm-spec-groups-section-host',
  imports: [SpecGroupsSection],
  template: `<adm-spec-groups-section [attempted]="attempted()" [field]="form.specGroups" />`,
})
class Host {
  readonly attempted = signal(false);
  readonly model = signal<ProductFormModel>({
    ...emptyProductForm(),
    specGroups: [
      g('Kijelző', [r('Méret', '6,1 hüvelyk'), r('Típus', 'OLED')]),
      g('Rendszer', [r('Operációs rendszer', 'Android')]),
    ],
  });
  readonly form = form(this.model, productFormSchema({ featuredOthers: signal(0) }));
}

describe('SpecGroupsSection', () => {
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

  function panels(): HTMLElement[] {
    return Array.from(element().querySelectorAll<HTMLElement>('mat-expansion-panel'));
  }

  function panelTitles(): string[] {
    return Array.from(element().querySelectorAll('mat-panel-title')).map((el) =>
      el.textContent.trim(),
    );
  }

  function panelDescriptions(): string[] {
    return Array.from(element().querySelectorAll('mat-panel-description')).map((el) =>
      el.textContent.trim(),
    );
  }

  function inputByLabel(label: string, root: HTMLElement = element()): HTMLInputElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('mat-form-field'))
      .filter((field) => field.querySelector('mat-label')?.textContent.trim() === label)
      .map((field) => field.querySelector('input'))
      .filter((input): input is HTMLInputElement => input !== null);
  }

  function textareaByLabel(label: string, root: HTMLElement = element()): HTMLTextAreaElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('mat-form-field'))
      .filter((field) => field.querySelector('mat-label')?.textContent.trim() === label)
      .map((field) => field.querySelector('textarea'))
      .filter((textarea): textarea is HTMLTextAreaElement => textarea !== null);
  }

  function errorBadge(): string {
    return element().querySelector('.adm-section-errors')?.textContent.trim() ?? '';
  }

  function arrayErrors(): string[] {
    return Array.from(element().querySelectorAll('.adm-array-error')).map((el) =>
      el.textContent.trim(),
    );
  }

  function overlayContainer(): HTMLElement {
    const found = document.querySelector<HTMLElement>('.cdk-overlay-container');
    if (found === null) {
      throw new Error('Expected the overlay container');
    }
    return found;
  }

  function menuItems(): HTMLButtonElement[] {
    return Array.from(overlayContainer().querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-item'));
  }

  async function openMenu(button: HTMLButtonElement): Promise<void> {
    button.click();
    await fixture.whenStable();
  }

  async function clickMenuItem(label: string): Promise<void> {
    const item = menuItems().find((el) => el.textContent.trim().includes(label));
    if (item === undefined) {
      throw new Error(`Expected a menu item labelled "${label}"`);
    }
    item.click();
    await fixture.whenStable();
  }

  it('renders two collapsed panels with the group titles and row-count descriptions', () => {
    // Fails if a group's title, its row count, or the collapsed state changes.
    expect(panelTitles()).toEqual(['Kijelző', 'Rendszer']);
    expect(panelDescriptions()).toEqual(['2 sor', '1 sor']);
    expect(panels().every((panel) => !panel.classList.contains('mat-expanded'))).toBe(true);
  });

  it('opens the first panel on header click and shows its fields', async () => {
    // Fails if isOpen or the (opened) handler stops opening the panel, or the
    // field bindings stop reflecting the group's current values.
    const header = element().querySelector<HTMLElement>('mat-expansion-panel-header');
    if (header === null) throw new Error('Expected a panel header');
    header.click();
    await fixture.whenStable();

    const panel = panels()[0];
    expect(panel.classList.contains('mat-expanded')).toBe(true);
    expect(inputByLabel('Csoport neve', panel)[0].value).toBe('Kijelző');
    expect(inputByLabel('Megnevezés', panel).map((el) => el.value)).toEqual(['Méret', 'Típus']);
    expect(textareaByLabel('Érték', panel).map((el) => el.value)).toEqual(['6,1 hüvelyk', 'OLED']);
  });

  it('typing into the first row value updates the model', async () => {
    // Fails if [formField] stops wiring the row's value control to the model.
    const header = element().querySelector<HTMLElement>('mat-expansion-panel-header');
    if (header === null) throw new Error('Expected a panel header');
    header.click();
    await fixture.whenStable();

    const textarea = textareaByLabel('Érték')[0];
    textarea.value = '6,7 hüvelyk';
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(host.model().specGroups[0].rows[0].value).toBe('6,7 hüvelyk');
  });

  it('Csoport adds a new open group with one empty row', async () => {
    // Fails if addGroup stops appending a group, stops opening it, or stops
    // giving it a single empty row.
    const addGroupButton = Array.from(element().querySelectorAll<HTMLButtonElement>('button')).find(
      (btn) => btn.textContent.trim().endsWith('Csoport'),
    );
    if (addGroupButton === undefined) throw new Error('Expected the Csoport button');
    addGroupButton.click();
    await fixture.whenStable();

    expect(panelTitles()).toEqual(['Kijelző', 'Rendszer', 'Új csoport 3']);
    expect(panels()[2].classList.contains('mat-expanded')).toBe(true);
    expect(host.model().specGroups[2].rows.length).toBe(1);
  });

  it('reorders groups through the first group menu and disables the edge items', async () => {
    // Fails if moveGroup stops swapping groups, or firstGroup/lastGroup stop
    // gating the menu buttons.
    // Fails if the two groups' first-row menu buttons share a name, which
    // would leave a screen reader unable to tell them apart.
    const rowMenuAriaLabels = Array.from(
      element().querySelectorAll<HTMLButtonElement>('button[aria-label$=", sor 1: műveletek"]'),
    ).map((btn) => btn.getAttribute('aria-label'));
    expect(rowMenuAriaLabels).toEqual([
      'Csoport 1, sor 1: műveletek',
      'Csoport 2, sor 1: műveletek',
    ]);

    // Fails if the two groups' add-row buttons share a name, which would
    // leave a screen reader unable to tell them apart.
    const addRowButtonAriaLabels = Array.from(
      element().querySelectorAll<HTMLButtonElement>('button[aria-label$=": sor hozzáadása"]'),
    ).map((btn) => btn.getAttribute('aria-label'));
    expect(addRowButtonAriaLabels).toEqual([
      'Csoport 1: sor hozzáadása',
      'Csoport 2: sor hozzáadása',
    ]);

    const groupMenuButton = element().querySelector<HTMLButtonElement>(
      'button[aria-label="Csoport 1: műveletek"]',
    );
    if (groupMenuButton === null) throw new Error('Expected the first group menu button');
    await openMenu(groupMenuButton);
    await clickMenuItem('Lejjebb');

    expect(panelTitles()).toEqual(['Rendszer', 'Kijelző']);

    const firstGroupButton = element().querySelector<HTMLButtonElement>(
      'button[aria-label="Csoport 1: műveletek"]',
    );
    if (firstGroupButton === null) throw new Error('Expected the first group menu button');
    await openMenu(firstGroupButton);
    expect(menuItems().find((el) => el.textContent.trim().includes('Feljebb'))?.disabled).toBe(
      true,
    );
    // The disabled item never fires click, so the menu is closed through its
    // backdrop instead of by clicking a menu item.
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click();
    await fixture.whenStable();

    const secondGroupButton = element().querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Csoport 2: műveletek"]',
    )[0];
    await openMenu(secondGroupButton);
    expect(menuItems().find((el) => el.textContent.trim().includes('Lejjebb'))?.disabled).toBe(
      true,
    );
  });

  it('Csoport törlése removes the group and returns focus to the Csoport button', async () => {
    // Fails if removeGroup stops removing the group or stops moving focus to
    // the add-group button once its own menu trigger is gone.
    const groupMenuButton = element().querySelector<HTMLButtonElement>(
      'button[aria-label="Csoport 1: műveletek"]',
    );
    if (groupMenuButton === null) throw new Error('Expected the first group menu button');
    await openMenu(groupMenuButton);
    await clickMenuItem('Csoport törlése');

    expect(panelTitles()).toEqual(['Rendszer']);

    const addGroupButton = Array.from(element().querySelectorAll<HTMLButtonElement>('button')).find(
      (btn) => btn.textContent.trim().endsWith('Csoport'),
    );
    if (addGroupButton === undefined) throw new Error('Expected the Csoport button');
    expect(document.activeElement).toBe(addGroupButton);
  });

  it('removes and adds rows through the row menu and the Sor button', async () => {
    // Fails if removeRow/addRow stop updating the group's row list.
    const header = element().querySelector<HTMLElement>('mat-expansion-panel-header');
    if (header === null) throw new Error('Expected a panel header');
    header.click();
    await fixture.whenStable();

    const rowMenuButton = element().querySelector<HTMLButtonElement>(
      'button[aria-label="Csoport 1, sor 1: műveletek"]',
    );
    if (rowMenuButton === null) throw new Error('Expected the first row menu button');
    await openMenu(rowMenuButton);
    await clickMenuItem('Sor törlése');

    expect(host.model().specGroups[0].rows.map((row) => row.label)).toEqual(['Típus']);

    const addRowButton = panels()[0].querySelector<HTMLButtonElement>(
      'button[aria-label="Csoport 1: sor hozzáadása"]',
    );
    if (addRowButton === null) throw new Error('Expected the Sor button');
    // Removing the row's menu trigger has to leave focus in the section
    // rather than dropping it to <body> (WCAG 2.4.3).
    expect(document.activeElement).toBe(addRowButton);

    addRowButton.click();
    await fixture.whenStable();

    expect(host.model().specGroups[0].rows.map((row) => row.label)).toEqual(['Típus', '']);
  });

  it('shows errors only after a save attempt, opens the panel holding one and the array errors', async () => {
    // Fails if arrayError/rowsError/isOpen stop gating on attempted(), or the
    // messages stop matching the schema's minLength/required errors.
    host.model.update((model) => ({
      ...model,
      specGroups: [
        g('Kijelző', [r('Méret', '6,1 hüvelyk'), r('Típus', '')]),
        g('Rendszer', [r('Operációs rendszer', 'Android')]),
      ],
    }));
    await fixture.whenStable();

    expect(panels().every((panel) => !panel.classList.contains('mat-expanded'))).toBe(true);
    expect(element().querySelectorAll('.adm-section-errors').length).toBe(0);

    host.attempted.set(true);
    await fixture.whenStable();

    expect(errorBadge()).toBe('1 hiba');
    expect(panels()[0].classList.contains('mat-expanded')).toBe(true);
    expect(panels()[1].classList.contains('mat-expanded')).toBe(false);
    expect(panelDescriptions()).toEqual(['2 sor · 1 hiba', '1 sor']);

    host.model.update((model) => ({
      ...model,
      specGroups: [{ ...model.specGroups[0], rows: [] }, model.specGroups[1]],
    }));
    await fixture.whenStable();

    expect(arrayErrors()).toContain('Legalább egy sor kell.');

    host.model.update((model) => ({ ...model, specGroups: [] }));
    await fixture.whenStable();

    expect(arrayErrors()).toContain('Legalább egy specifikációcsoport kell.');
  });
});
