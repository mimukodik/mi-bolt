import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { DialogModule } from '@angular/cdk/dialog';

import { AccessibleDialog } from '../../shared/ui/accessible-dialog/accessible-dialog';

/**
 * Mobile menu drawer.
 *
 * The mobile menu is a focus-managed dialog built on top of the
 * AccessibleDialog primitive (T10). It is intentionally not a scaled
 * desktop header — the container is an overlay dialog, the menu
 * controls are at least 44 px tall, focus is trapped inside, and
 * closing the dialog restores focus to the trigger element.
 *
 * Content is composed through ng-content so the HeaderNav (and any
 * future caller) can decide which links live inside the drawer.
 */
@Component({
  selector: 'app-mobile-drawer',
  imports: [AccessibleDialog, DialogModule],
  template: `
    <app-accessible-dialog
      [opened]="opened()"
      [label]="label()"
      [restoreTarget]="triggerEl() ?? null"
      (closed)="closed.emit()"
    >
      <nav class="drawer-nav" aria-label="Mobil navigáció">
        <ng-content></ng-content>
      </nav>
    </app-accessible-dialog>
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .drawer-nav {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: 0;
        margin: 0;
      }

      .drawer-nav ::ng-deep a {
        display: flex;
        align-items: center;
        min-height: var(--size-control);
        padding: var(--space-2) var(--space-3);
        color: var(--color-text-primary);
        text-decoration: none;
        border-radius: var(--radius-control);
        font-size: var(--type-body);
      }

      .drawer-nav ::ng-deep a:hover,
      .drawer-nav ::ng-deep a:focus-visible {
        background: var(--color-surface-section);
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }
    `,
  ],
})
export class MobileDrawer {
  /** Whether the drawer is open. The dialog is mounted only when true. */
  readonly opened = input<boolean>(false);

  /** Accessible name of the dialog. Defaults to "Menü". */
  readonly label = input<string>('Menü');

  /** Element to refocus when the drawer closes. */
  readonly triggerEl = input<HTMLElement | null>(null);

  /** Emitted whenever the drawer closes by any path (button, Escape, backdrop). */
  readonly closed = output<void>();
}
