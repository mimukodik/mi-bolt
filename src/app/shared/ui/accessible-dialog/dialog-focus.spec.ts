/**
 * FIX-30 — focus restoration regression coverage.
 *
 * When a consumer passes no `restoreTarget`, the primitive used to fall
 * back to its own (non-focusable) host element, so focus dropped to
 * `<body>` on close. The fix passes `true` to the CDK's `restoreFocus`,
 * which restores focus to whatever had it before the dialog opened.
 *
 * Item 3 of this task's own "Regression test" plan — asserting that
 * `MobileDrawer` / `FilterDrawer` set `initialFocus` to `'first-heading'`
 * and that `TermsDialog` / the gallery's dialog leave it at
 * `'first-tabbable'` — is not covered here: those four components live
 * outside `src/app/shared/ui/**`, in `src/app/core/navigation/` and in
 * two feature directories owned by other agents' worktrees this round.
 * That wiring is deferred; see this task's Status line.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { DialogModule } from '@angular/cdk/dialog';
import { AccessibleDialog } from './accessible-dialog';

@Component({
  imports: [AccessibleDialog, DialogModule],
  template: `
    <button #trigger type="button" data-testid="trigger-a">Trigger A</button>
    <button #other type="button" data-testid="trigger-b">Trigger B</button>
    <app-accessible-dialog
      [opened]="opened()"
      [label]="'Megerősítés'"
      [restoreTarget]="restoreTarget()"
      (closed)="closed.set(closed() + 1)"
    >
      <p data-testid="dialog-body">Tartalom</p>
    </app-accessible-dialog>
  `,
})
class HostComponent {
  readonly opened = signal(false);
  readonly closed = signal(0);
  readonly restoreTarget = signal<HTMLElement | null>(null);
}

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
  return raw;
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  document.body.querySelectorAll('.cdk-overlay-container').forEach((el) => {
    el.remove();
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('AccessibleDialog focus restoration (FIX-30)', () => {
  it('restores focus to the element that had it before opening when no restoreTarget is given', () => {
    const { fixture, host } = setup();
    const triggerA = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="trigger-a"]',
    );
    if (!triggerA) throw new Error('Expected trigger A');
    triggerA.focus();
    expect(document.activeElement).toBe(triggerA);

    host.opened.set(true);
    fixture.detectChanges();
    expect(document.body.querySelector('[data-testid="dialog-body"]')).not.toBeNull();

    host.opened.set(false);
    fixture.detectChanges();

    expect(document.activeElement).toBe(triggerA);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('restores focus to an explicit restoreTarget instead, when one is passed', () => {
    const { fixture, host } = setup();
    const triggerA = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="trigger-a"]',
    );
    const triggerB = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="trigger-b"]',
    );
    if (!triggerA || !triggerB) throw new Error('Expected both triggers');
    host.restoreTarget.set(triggerB);
    triggerA.focus();

    host.opened.set(true);
    fixture.detectChanges();
    host.opened.set(false);
    fixture.detectChanges();

    expect(document.activeElement).toBe(triggerB);
  });
});
