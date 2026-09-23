import { ANIMATION_MODULE_TYPE, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { openConfirm } from './confirm-dialog';
import type { ConfirmDialogData } from './confirm-dialog';

/**
 * The dialog has to run without animations here. With no `ANIMATION_MODULE_TYPE`
 * provider Material reports animations as enabled
 * (node_modules/@angular/material/fesm2022/_animation-chunk.mjs:7-19), and an
 * enabled dialog finishes its exit on a real timer
 * (node_modules/@angular/material/fesm2022/dialog.mjs:96-101), which leaves the
 * overlay pane attached to `document.body` for the length of that timer and in
 * front of the next case's queries.
 *
 * `provideNoopAnimations()` would be the usual spelling, but it lives in
 * `@angular/platform-browser/animations`, which imports `@angular/animations` —
 * a package this workspace does not install. All Material reads is the token,
 * and that is exactly what that function provides
 * (node_modules/@angular/platform-browser/fesm2022/animations.mjs:80-86,184).
 */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;
@Component({ selector: 'adm-confirm-dialog-host', template: '' })
class HostComponent {}

describe('ConfirmDialog', () => {
  const DATA: ConfirmDialogData = {
    title: 'Termék archiválása',
    message: 'A termék a kukába kerül, és a shopból eltűnik.',
    confirmLabel: 'Archiválás',
    cancelLabel: 'Mégse',
  };

  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection(), NOOP_ANIMATIONS],
    });
    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
  });

  /** Opens the dialog and resolves with the boolean `openConfirm` emits on close. */
  function openDialog(overrides: Partial<ConfirmDialogData> = {}): Promise<boolean> {
    return firstValueFrom(openConfirm(TestBed.inject(MatDialog), { ...DATA, ...overrides }));
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container button'),
    );
  }

  function buttonByLabel(label: string): HTMLButtonElement {
    const found = buttons().find((button) => button.textContent.trim() === label);
    if (found === undefined) {
      throw new Error(`No open dialog button labelled "${label}"`);
    }
    return found;
  }

  /** The labels of the dialog's action buttons, in DOM order. */
  function actionLabels(): string[] {
    return buttons().map((button) => button.textContent.trim());
  }

  function paneText(selector: string): string {
    const found = document.querySelector(`.cdk-overlay-container ${selector}`);
    return found === null ? '' : found.textContent.trim();
  }

  /** Closes whatever is still open so the next case starts with an empty overlay. */
  async function closeAll(): Promise<void> {
    TestBed.inject(MatDialog).closeAll();
    await fixture.whenStable();
  }

  /**
   * jsdom has no layout engine: every element reports `offsetWidth` and
   * `offsetHeight` as 0 and an empty `getClientRects()`, so the CDK's
   * `InteractivityChecker.isVisible`
   * (node_modules/@angular/cdk/fesm2022/_a11y-module-chunk.mjs:20-22,98-100)
   * finds no tabbable element and the focus trap leaves focus on the dialog
   * container instead of moving it to the first tabbable button. One pixel of
   * geometry puts the trap back on the path it takes on a laid-out page.
   */
  function withElementGeometry<T>(body: () => Promise<T>): Promise<T> {
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get: () => 1,
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 1,
    });
    return body().finally(() => {
      if (width !== undefined) {
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width);
      }
      if (height !== undefined) {
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height);
      }
    });
  }

  it('emits true when the confirm button is clicked', async () => {
    // Fails if the confirm button stops carrying `[mat-dialog-close]="true"`, or
    // if openConfirm stops mapping the result to a boolean.
    const closed = openDialog();
    await fixture.whenStable();

    buttonByLabel('Archiválás').click();
    await fixture.whenStable();

    await expect(closed).resolves.toBe(true);
  });

  it('emits false when the cancel button is clicked', async () => {
    // Fails if the cancel button stops carrying `[mat-dialog-close]="false"`.
    const closed = openDialog();
    await fixture.whenStable();

    buttonByLabel('Mégse').click();
    await fixture.whenStable();

    await expect(closed).resolves.toBe(false);
  });

  it('emits false when Escape closes the dialog', async () => {
    // Fails if openConfirm stops mapping `afterClosed()`'s `undefined` to false.
    const closed = openDialog();
    await fixture.whenStable();

    const pane = document.querySelector('.cdk-overlay-pane');
    if (!(pane instanceof HTMLElement)) {
      throw new Error('Expected the dialog overlay pane');
    }
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    // jsdom's KeyboardEvent carries no keyCode, and the CDK's dialog reads
    // `event.keyCode === ESCAPE` (node_modules/@angular/cdk/fesm2022/dialog.mjs:357).
    Object.defineProperty(escape, 'keyCode', { get: () => 27 });
    pane.dispatchEvent(escape);
    await fixture.whenStable();

    await expect(closed).resolves.toBe(false);
  });

  it('renders the given title, message and both labels', async () => {
    // Fails if the template renames a binding or stops binding `data` into it.
    void openDialog();
    await fixture.whenStable();

    expect(paneText('h2')).toBe('Termék archiválása');
    expect(paneText('mat-dialog-content p')).toBe('A termék a kukába kerül, és a shopból eltűnik.');
    expect(actionLabels()).toEqual(['Mégse', 'Archiválás']);

    await closeAll();
  });

  it('marks a destructive confirm button with adm-danger', async () => {
    // Fails if the template drops `[class.adm-danger]="data.danger === true"`.
    void openDialog({ danger: true });
    await fixture.whenStable();

    expect(buttonByLabel('Archiválás').classList.contains('adm-danger')).toBe(true);

    await closeAll();
  });

  it('leaves a non-destructive confirm button unmarked', async () => {
    // Fails if `adm-danger` is bound to a constant or to `danger` being absent.
    void openDialog();
    await fixture.whenStable();

    expect(buttonByLabel('Archiválás').classList.contains('adm-danger')).toBe(false);

    await closeAll();
  });

  it('focuses the cancel button when the dialog opens', async () => {
    // Fails if the cancel button stops coming first in the actions row, which is
    // what puts Material's default first-tabbable focus on the safe choice.
    await withElementGeometry(async () => {
      void openDialog();
      await fixture.whenStable();

      expect(document.activeElement).toBe(buttonByLabel('Mégse'));
    });

    await closeAll();
  });
});
