import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { DialogModule } from '@angular/cdk/dialog';
import { AccessibleDialog } from './accessible-dialog';

@Component({
  imports: [AccessibleDialog, DialogModule],
  template: `
    <button #trigger data-testid="dialog-trigger" type="button" (click)="open()">Open</button>
    <app-accessible-dialog
      [label]="label()"
      [opened]="opened()"
      [restoreTarget]="triggerEl"
      (closed)="closedCount.set(closedCount() + 1)"
    >
      <p data-testid="dialog-body">Dialog tartalma</p>
    </app-accessible-dialog>
  `,
})
class HostComponent {
  readonly trigger = signal<HTMLButtonElement | null>(null);
  readonly opened = signal(false);
  readonly closedCount = signal(0);
  readonly label = signal('Megerősítés');
  get triggerEl(): HTMLButtonElement | null {
    return this.trigger();
  }
  open(): void {
    this.opened.set(true);
  }
}

@Component({
  imports: [AccessibleDialog, DialogModule],
  template: `
    <app-accessible-dialog [label]="label1()" [opened]="opened1()">
      <p data-testid="dialog-1-body">Első tartalom</p>
    </app-accessible-dialog>
    <app-accessible-dialog [label]="label2()" [opened]="opened2()">
      <p data-testid="dialog-2-body">Második tartalom</p>
    </app-accessible-dialog>
  `,
})
class TwoDialogsHostComponent {
  readonly opened1 = signal(true);
  readonly opened2 = signal(true);
  readonly label1 = signal('Első dialógus');
  readonly label2 = signal('Második dialógus');
}

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new TypeError('Expected HTMLElement');
  }
  return raw;
}

interface ComponentWithStyles {
  ɵcmp: {
    styles: readonly string[];
  };
}

function hasStyles(value: unknown): value is ComponentWithStyles {
  if (typeof value !== 'function' && typeof value !== 'object') {
    return false;
  }
  if (value === null || !('ɵcmp' in value)) {
    return false;
  }
  const cmp = value.ɵcmp;
  return typeof cmp !== 'object' || cmp === null || !('styles' in cmp)
    ? false
    : Array.isArray(cmp.styles);
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  document.body.querySelectorAll('.cdk-overlay-container').forEach((element) => {
    element.remove();
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const trigger = getNativeElement(fixture).querySelector<HTMLButtonElement>(
    '[data-testid="dialog-trigger"]',
  );
  fixture.componentInstance.trigger.set(trigger);
  return { fixture, host: fixture.componentInstance };
}

function setupTwoDialogs(): {
  fixture: ComponentFixture<TwoDialogsHostComponent>;
  host: TwoDialogsHostComponent;
} {
  document.body.querySelectorAll('.cdk-overlay-container').forEach((element) => {
    element.remove();
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [TwoDialogsHostComponent] });
  const fixture = TestBed.createComponent(TwoDialogsHostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('AccessibleDialog primitive', () => {
  it('does not mount anything while closed', () => {
    setup();
    expect(document.body.querySelector('[data-testid="dialog-body"]')).toBeNull();
  });

  it('mounts the dialog in the overlay container when opened becomes true', () => {
    const { fixture, host } = setup();
    host.opened.set(true);
    fixture.detectChanges();
    expect(document.body.querySelector('[data-testid="dialog-body"]')).not.toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
  });

  it('exposes the label as the dialog accessible name', () => {
    const { fixture, host } = setup();
    host.opened.set(true);
    fixture.detectChanges();
    const panel = document.body.querySelector('[role="dialog"]');
    expect(panel?.getAttribute('aria-label')).toBe('Megerősítés');
  });

  it('declares a 44-CSS-px close target via the size-control token (R21)', () => {
    if (!hasStyles(AccessibleDialog)) {
      throw new Error('Expected AccessibleDialog to have styles');
    }
    const css = AccessibleDialog.ɵcmp.styles.join('\n');
    expect(css).toMatch(/size-control/);
    expect(css).toMatch(/min-(width|height)/);
  });

  it('closes when the close button is clicked and emits closed', () => {
    const { fixture, host } = setup();
    host.opened.set(true);
    fixture.detectChanges();
    const close = document.body.querySelector<HTMLButtonElement>('[data-testid="dialog-close"]');
    expect(close).not.toBeNull();
    if (!close) {
      throw new Error('Expected close button');
    }
    close.click();
    fixture.detectChanges();
    expect(document.body.querySelector('[data-testid="dialog-body"]')).toBeNull();
    expect(host.closedCount()).toBeGreaterThanOrEqual(1);
  });

  it('closes when the opened input flips back to false', () => {
    const { fixture, host } = setup();
    host.opened.set(true);
    fixture.detectChanges();
    expect(document.body.querySelector('[data-testid="dialog-body"]')).not.toBeNull();
    host.opened.set(false);
    fixture.detectChanges();
    expect(document.body.querySelector('[data-testid="dialog-body"]')).toBeNull();
  });

  it('does not emit hardcoded heading ids and preserves unique aria-labels when two dialogs are mounted simultaneously', () => {
    const { host } = setupTwoDialogs();
    expect(document.querySelectorAll('#dialog-title').length).toBe(0);

    const panels = document.querySelectorAll<HTMLElement>('.panel[role="dialog"]');
    expect(panels.length).toBe(2);
    expect(panels[0].getAttribute('aria-label')).toBe(host.label1());
    expect(panels[1].getAttribute('aria-label')).toBe(host.label2());
  });
});
