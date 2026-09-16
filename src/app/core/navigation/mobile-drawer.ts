import { Component, input, output } from '@angular/core';
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
  templateUrl: './mobile-drawer.html',
  styleUrl: './mobile-drawer.scss',
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
