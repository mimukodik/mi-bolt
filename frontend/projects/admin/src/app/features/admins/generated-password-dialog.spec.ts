/**
 * Spec for `GeneratedPasswordDialog` (MIM-345, F14): shows the username
 * and password `NewAdminDialog`'s 201 handed to it, copies the password
 * to the clipboard through `cdkCopyToClipboard` and snack-bars the
 * outcome, and only Bezárás closes it (`disableClose: true` blocks both
 * Escape and a backdrop click, the same way `confirm-dialog.spec.ts`
 * exercises Escape on a `disableClose`-free dialog).
 */
import { Clipboard } from '@angular/cdk/clipboard';
import { ANIMATION_MODULE_TYPE, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import type { MatDialogRef } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveApiRoot } from '@mi-bolt/core-api/api-root';

import { provideApiConfiguration } from '../../api/generated/api-configuration';

import { GeneratedPasswordDialog } from './generated-password-dialog';
import type { GeneratedPasswordData } from './generated-password-dialog';

/** See `confirm-dialog.spec.ts` for why NoopAnimations is required in jsdom. */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

const DATA: GeneratedPasswordData = { username: 'kovacs.anna', password: 'Xq7-pL2m-9vRt-Kd4w' };

@Component({ selector: 'adm-generated-password-dialog-host', template: '' })
class HostComponent {}

function configureTestBed(): void {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [
      provideZonelessChangeDetection(),
      NOOP_ANIMATIONS,
      provideHttpClient(withXhr()),
      provideApiConfiguration(resolveApiRoot()),
      provideRouter([]),
    ],
  });
}

function overlay(): HTMLElement {
  const found = document.querySelector('.cdk-overlay-container');
  if (!(found instanceof HTMLElement)) throw new Error('expected the overlay container');
  return found;
}

function passwordInput(): HTMLInputElement {
  const found = overlay().querySelector('input');
  if (!(found instanceof HTMLInputElement)) throw new Error('expected the password input');
  return found;
}

function copyButton(): HTMLButtonElement {
  const found = Array.from(overlay().querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.getAttribute('aria-label') === 'Jelszó másolása',
  );
  if (found === undefined) throw new Error('expected the copy button');
  return found;
}

function bezarasButton(): HTMLButtonElement {
  const found = Array.from(overlay().querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent.trim() === 'Bezárás',
  );
  if (found === undefined) throw new Error('expected the Bezárás button');
  return found;
}

function snackBarText(): string {
  const element = document.querySelector('.mat-mdc-snack-bar-container, .mat-mdc-simple-snack-bar');
  if (element === null) throw new Error('no snack-bar container in the document');
  return element.textContent.trim();
}

describe('GeneratedPasswordDialog', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    configureTestBed();
    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
  });

  function openDialog(): MatDialogRef<GeneratedPasswordDialog, undefined> {
    return TestBed.inject(MatDialog).open<
      GeneratedPasswordDialog,
      GeneratedPasswordData,
      undefined
    >(GeneratedPasswordDialog, { data: DATA, disableClose: true });
  }

  it('case 7: the title, the readonly password and the warning text render', async () => {
    // Fails if the title interpolation, the readonly value binding, or
    // the warning paragraph's text drifts.
    openDialog();
    await fixture.whenStable();

    const title = overlay().querySelector('h2[mat-dialog-title]');
    if (title === null) throw new Error('expected the dialog title');
    expect(title.textContent.trim()).toBe('Admin létrehozva: kovacs.anna');
    expect(passwordInput().value).toBe('Xq7-pL2m-9vRt-Kd4w');
    expect(overlay().textContent).toContain(
      'Ez a jelszó csak most látható. Másold ki, és add át biztonságos csatornán.',
    );
  });

  it('case 8: clicking Jelszó másolása copies the password once and snack-bars the outcome', async () => {
    // Fails if `onCopied` stops calling `Clipboard.copy` with the exact
    // password, or if either outcome's snack-bar text drifts.
    openDialog();
    await fixture.whenStable();

    const copy = vi.spyOn(TestBed.inject(Clipboard), 'copy').mockReturnValue(true);
    copyButton().click();
    await fixture.whenStable();

    expect(copy).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledWith('Xq7-pL2m-9vRt-Kd4w');
    expect(snackBarText()).toBe('Vágólapra másolva.');

    copy.mockReturnValue(false);
    copyButton().click();
    await fixture.whenStable();

    expect(snackBarText()).toBe('A másolás nem sikerült; jelöld ki és másold kézzel.');
  });

  it('case 9: Escape and a backdrop click leave the dialog open; Bezárás closes it', async () => {
    // Fails if `disableClose` stops blocking Escape or the backdrop, or
    // if Bezárás stops closing the dialog.
    const ref = openDialog();
    await fixture.whenStable();

    const pane = document.querySelector('.cdk-overlay-pane');
    if (!(pane instanceof HTMLElement)) throw new Error('expected the dialog overlay pane');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    // jsdom's KeyboardEvent carries no keyCode, and the CDK's dialog reads
    // `event.keyCode === ESCAPE` (see `confirm-dialog.spec.ts`).
    Object.defineProperty(escape, 'keyCode', { get: () => 27 });
    pane.dispatchEvent(escape);
    await fixture.whenStable();
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(1);

    const backdrop = document.querySelector('.cdk-overlay-backdrop');
    if (!(backdrop instanceof HTMLElement)) throw new Error('expected the overlay backdrop');
    backdrop.click();
    await fixture.whenStable();
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(1);

    const closed = firstValueFrom(ref.afterClosed());
    bezarasButton().click();
    await fixture.whenStable();
    await closed;
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(0);
  });
});
