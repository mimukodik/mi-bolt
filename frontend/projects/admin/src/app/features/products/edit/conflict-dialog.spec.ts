import { ANIMATION_MODULE_TYPE, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { openConflict } from './conflict-dialog';

/**
 * The dialog has to run without animations here, for the same reason
 * `confirm-dialog.spec.ts` gives: with no `ANIMATION_MODULE_TYPE` provider
 * Material reports animations as enabled and the overlay pane stays attached
 * past the end of the case.
 */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

@Component({ selector: 'adm-conflict-dialog-host', template: '' })
class HostComponent {}

describe('ConflictDialog', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection(), NOOP_ANIMATIONS],
    });
    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
  });

  function buttons(): HTMLButtonElement[] {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container button'),
    );
  }

  function paneText(selector: string): string {
    const found = document.querySelector(`.cdk-overlay-container ${selector}`);
    return found === null ? '' : found.textContent.trim();
  }

  it('shows the title, the message, the single Újratöltés button, opened with disableClose', async () => {
    // Fails if the template drops the title, the paragraph, gains a second
    // button, or openConflict stops passing disableClose: true.
    void openConflict(TestBed.inject(MatDialog));
    await fixture.whenStable();

    expect(paneText('h2')).toBe('Valaki közben módosította ezt a terméket');
    expect(paneText('mat-dialog-content p')).toBe(
      'A mentés nem történt meg. Töltsd újra a legfrissebb változatot; a módosításaid elvesznek.',
    );
    expect(buttons().length).toBe(1);
    expect(buttons()[0].textContent.trim()).toBe('Újratöltés');
    expect(TestBed.inject(MatDialog).openDialogs.at(0)?.disableClose).toBe(true);

    TestBed.inject(MatDialog).closeAll();
    await fixture.whenStable();
  });

  it('emits once and closes the dialog when Újratöltés is clicked', async () => {
    // Fails if openConflict stops mapping afterClosed() to a single undefined
    // emission, or the button stops carrying mat-dialog-close.
    const closed = firstValueFrom(openConflict(TestBed.inject(MatDialog)));
    await fixture.whenStable();

    buttons()[0].click();
    await fixture.whenStable();

    await expect(closed).resolves.toBeUndefined();
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(0);
  });
});
