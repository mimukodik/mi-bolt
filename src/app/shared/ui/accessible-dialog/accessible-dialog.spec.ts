import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { DialogModule } from '@angular/cdk/dialog';
import { AccessibleDialog } from './accessible-dialog';

@Component({
  imports: [AccessibleDialog, DialogModule],
  template: `
    <button
      #trigger
      type="button"
      data-testid="dialog-trigger"
      (click)="open()"
    >Open</button>
    <app-accessible-dialog
      [opened]="opened()"
      [label]="label()"
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

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  document.body.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove());
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="dialog-trigger"]');
  fixture.componentInstance.trigger.set(trigger);
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
    const css = (AccessibleDialog as unknown as { ɵcmp: { styles: readonly string[] } }).ɵcmp.styles.join('\n');
    expect(css).toMatch(/size-control/);
    expect(css).toMatch(/min-(width|height)/);
  });

  it('closes when the close button is clicked and emits closed', () => {
    const { fixture, host } = setup();
    host.opened.set(true);
    fixture.detectChanges();
    const close: HTMLButtonElement = document.body.querySelector('[data-testid="dialog-close"]') as HTMLButtonElement;
    expect(close).not.toBeNull();
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
});
