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

import { emptyProductForm, newKey } from '../product-form.model';
import type { HighlightModel } from '../product-form.model';
import { productFormSchema } from '../product-form.schema';

import { HighlightsSection } from './highlights-section';

/** See `confirm-dialog.spec.ts` (shared/confirm-dialog) for why NoopAnimations is required in jsdom. */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

/** Builds a highlight with a fresh key, mirroring `product-form.mapper.ts`'s reader. */
function h(text: string): HighlightModel {
  return { key: newKey(), text };
}

@Component({
  selector: 'adm-highlights-section-host',
  imports: [HighlightsSection],
  template: `<adm-highlights-section [attempted]="attempted()" [field]="form.highlights" />`,
})
class Host {
  readonly attempted = signal(false);
  readonly model = signal({
    ...emptyProductForm(),
    highlights: [h('Első'), h('Második'), h('Harmadik')],
  });
  readonly form = form(this.model, productFormSchema({ featuredOthers: signal(0) }));
}

describe('HighlightsSection', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  function element(): HTMLElement {
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) {
      throw new Error('Expected the host element');
    }
    return raw;
  }

  function labels(): string[] {
    return Array.from(element().querySelectorAll('mat-label')).map((el) => el.textContent.trim());
  }

  function inputs(): HTMLInputElement[] {
    return Array.from(element().querySelectorAll<HTMLInputElement>('input'));
  }

  function hints(): string[] {
    return Array.from(element().querySelectorAll('mat-hint')).map((el) => el.textContent.trim());
  }

  function addButton(): HTMLButtonElement {
    const found = element().querySelector<HTMLButtonElement>('.adm-section-actions button');
    if (found === null) {
      throw new Error('Expected the header add button');
    }
    return found;
  }

  function rowTriggers(): HTMLButtonElement[] {
    return Array.from(element().querySelectorAll<HTMLButtonElement>('button')).filter((button) =>
      (button.getAttribute('aria-label') ?? '').endsWith('műveletek'),
    );
  }

  function overlayMenuItems(): { label: string; disabled: boolean }[] {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container .mat-mdc-menu-item'),
    ).map((item) => ({
      label: item.querySelector('span')?.textContent.trim() ?? '',
      disabled: item.disabled,
    }));
  }

  /** Closes whatever row menu is open, mirroring the Escape handling in `confirm-dialog.spec.ts`. */
  async function closeMenu(): Promise<void> {
    const panel = document.querySelector('.cdk-overlay-container .mat-mdc-menu-panel');
    if (panel === null) return;
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    Object.defineProperty(escape, 'keyCode', { get: () => 27 });
    panel.dispatchEvent(escape);
    await fixture.whenStable();
  }

  async function openMenu(rowIndex: number): Promise<void> {
    rowTriggers()[rowIndex].click();
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

  it('renders one row per highlight, with its label and value', () => {
    // Fails if the @for stops walking the field, or the label/value bindings change.
    expect(labels()).toEqual(['Kiemelés 1', 'Kiemelés 2', 'Kiemelés 3']);
    expect(inputs().map((input) => input.value)).toEqual(['Első', 'Második', 'Harmadik']);
    expect(hints()[0]).toBe('4 / 280');
  });

  it('updates the model and the counter as the first input changes', async () => {
    // Fails if [formField] stops writing into the tree, or the hint stops reading value().length.
    const input = inputs()[0];
    input.value = 'Első pont';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(host.model().highlights[0].text).toBe('Első pont');
    expect(hints()[0]).toBe('9 / 280');
  });

  it('appends a highlight from the header button, up to the max of 6', async () => {
    // Fails if add() stops appending an emptyHighlight(), or the disabled binding drops `>= max`.
    addButton().click();
    await fixture.whenStable();

    expect(host.model().highlights.length).toBe(4);
    expect(host.model().highlights[3].text).toBe('');

    addButton().click();
    await fixture.whenStable();
    addButton().click();
    await fixture.whenStable();

    expect(host.model().highlights.length).toBe(6);
    expect(addButton().disabled).toBe(true);
  });

  it("reorders with the row menu's Lejjebb, and recomputes first/last afterwards", async () => {
    // Fails if move() swaps the wrong pair (case a) or [disabled]="first"/"last" drop (case c).
    await openMenu(0);
    expect(overlayMenuItems()).toEqual([
      { label: 'Feljebb', disabled: true },
      { label: 'Lejjebb', disabled: false },
      { label: 'Törlés', disabled: false },
    ]);

    const lejjebb = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container .mat-mdc-menu-item'),
    )[1];
    lejjebb.click();
    await fixture.whenStable();

    expect(host.model().highlights.map((highlight) => highlight.text)).toEqual([
      'Második',
      'Első',
      'Harmadik',
    ]);

    await openMenu(0);
    expect(overlayMenuItems()[0]).toEqual({ label: 'Feljebb', disabled: true });
    await closeMenu();

    await openMenu(2);
    expect(overlayMenuItems()[1]).toEqual({ label: 'Lejjebb', disabled: true });
    await closeMenu();
  });

  it("removes a row with the row menu's Törlés, and returns focus to the add button", async () => {
    // Fails if remove() stops filtering by index, or drops the addButton.focus() call (case d).
    await openMenu(1);
    const torles = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container .mat-mdc-menu-item'),
    )[2];
    torles.click();
    await fixture.whenStable();

    expect(host.model().highlights.map((highlight) => highlight.text)).toEqual([
      'Első',
      'Harmadik',
    ]);
    expect(document.activeElement).toBe(addButton());

    await fixture.whenStable();
    expect(document.activeElement).toBe(addButton());
  });

  it('reorders on cdkDropListDropped', async () => {
    // Fails if drop() ignores previousIndex/currentIndex or mutates the wrong copy.
    const dropList = fixture.debugElement.query(By.css('[cdkDropList]'));
    dropList.triggerEventHandler('cdkDropListDropped', { previousIndex: 0, currentIndex: 2 });
    await fixture.whenStable();

    expect(host.model().highlights.map((highlight) => highlight.text)).toEqual([
      'Második',
      'Harmadik',
      'Első',
    ]);
  });

  describe('errors on a single empty highlight', () => {
    let errorFixture: ComponentFixture<Host>;
    let errorHost: Host;

    beforeEach(async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [Host],
        providers: [provideZonelessChangeDetection(), NOOP_ANIMATIONS],
      });
      errorFixture = TestBed.createComponent(Host);
      errorHost = errorFixture.componentInstance;
      errorHost.model.set(emptyProductForm());
      await errorFixture.whenStable();
    });

    function errHost(): HTMLElement {
      const raw: unknown = errorFixture.nativeElement;
      if (!(raw instanceof HTMLElement)) {
        throw new Error('Expected the host element');
      }
      return raw;
    }

    function errBadge(): string {
      const found = errHost().querySelector('.adm-section-errors');
      return found === null ? '' : found.textContent.trim();
    }

    function errArray(): string {
      const found = errHost().querySelector('.adm-array-error');
      if (found === null) {
        throw new Error('Expected the array error paragraph');
      }
      return found.textContent.trim();
    }

    it('shows no error badge and no array error before a save attempt, even once the array itself is invalid', async () => {
      // Fails if arrayError() ignores attempted() (case b) or errorCount() drops the gate:
      // with attempted() still false, removing the only row makes the array itself invalid
      // (fewer than 1), so this is the one state where the gate is observable.
      expect(errBadge()).toBe('');
      expect(errArray()).toBe('');

      const trigger = Array.from(errHost().querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => (button.getAttribute('aria-label') ?? '').endsWith('műveletek'),
      );
      trigger?.click();
      await errorFixture.whenStable();
      const torles = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container .mat-mdc-menu-item'),
      )[2];
      torles.click();
      await errorFixture.whenStable();

      expect(errBadge()).toBe('');
      expect(errArray()).toBe('');
    });

    it('shows 1 hiba once attempted, then the min-length message once the last row is removed', async () => {
      // Fails if errorCount() or arrayError() stop reading the schema's errors.
      errorHost.attempted.set(true);
      await errorFixture.whenStable();

      expect(errBadge()).toBe('1 hiba');

      const trigger = Array.from(errHost().querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => (button.getAttribute('aria-label') ?? '').endsWith('műveletek'),
      );
      trigger?.click();
      await errorFixture.whenStable();
      const torles = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container .mat-mdc-menu-item'),
      )[2];
      torles.click();
      await errorFixture.whenStable();

      expect(errArray()).toBe('Legalább egy kiemelés kell.');
      expect(errBadge()).toBe('1 hiba');
    });
  });
});
