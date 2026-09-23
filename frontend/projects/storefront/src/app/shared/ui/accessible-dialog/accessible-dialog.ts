import type { TemplateRef } from '@angular/core';
import {
  Component,
  ViewContainerRef,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { DialogRef } from '@angular/cdk/dialog';
import { Dialog, DialogModule } from '@angular/cdk/dialog';

/**
 * MiBolt AccessibleDialog primitive.
 *
 * Built on top of `@angular/cdk/dialog` because the CDK already does the
 * work required by T10-AC04 and R23:
 *  - creates a backdrop and marks background content inert / aria-hidden
 *    so the user cannot accidentally interact with it;
 *  - installs a focus trap, so Tab and Shift+Tab walk only inside the
 *    panel;
 *  - restores focus to the element that opened the dialog when it closes;
 *  - listens for the Escape key and closes the dialog through the same
 *    path the close button uses.
 *
 * The component is intentionally minimal: it owns the lifecycle and the
 * labelled region for the consumer. All content is projected through the
 * dedicated `app-accessible-dialog` element so the parent stays in
 * charge of what fills the dialog.
 *
 * Required states:
 * - closed  - nothing mounted, focus lives wherever the user left it.
 * - open    - focus trapped inside, backdrop excluded.
 * - focus   - focus is somewhere inside the panel; the consumer can
 *             render `autofocus` on the element that should start there.
 */
@Component({
  imports: [DialogModule],
  selector: 'app-accessible-dialog',
  templateUrl: './accessible-dialog.html',
  styleUrl: './accessible-dialog.scss',
})
export class AccessibleDialog {
  private readonly dialog = inject(Dialog);
  private readonly viewContainerRef = inject(ViewContainerRef);

  /** Whether the dialog is open. Driven by the parent. */
  readonly opened = input<boolean>(false);

  /** Required labelled name. Becomes the dialog's accessible name. */
  readonly label = input.required<string>();

  /**
   * Optional id of a heading inside the projected content. When set, the
   * dialog references it via aria-labelledby instead of aria-label.
   */
  readonly labelledBy = input<string | null>(null);

  /**
   * Element that should regain focus when the dialog closes. When left
   * unset, the CDK restores focus to whatever had it before the dialog
   * opened.
   */
  readonly restoreTarget = input<HTMLElement | null>(null);

  /**
   * Where focus lands when the dialog opens. `first-tabbable` is the
   * CDK default and keeps a plain modal behaving as it did. A drawer
   * passes `first-heading` so the user is told the name of what they
   * opened, per docs/spec/screens.md S2 ("Initial focus=drawer heading").
   */
  readonly initialFocus = input<'first-tabbable' | 'first-heading'>('first-tabbable');

  /** Emits when the dialog closes by any mechanism (button, Escape, backdrop). */
  readonly closed = output();

  readonly body = viewChild.required<TemplateRef<unknown>>('body');

  private ref: DialogRef | null = null;

  constructor() {
    effect(() => {
      const open = this.opened();
      if (open && this.ref === null) {
        this.openInternal();
      } else if (!open && this.ref !== null) {
        this.closeInternal();
      }
    });
  }

  /**
   * Programmatic close exposed for the projected content (e.g. a confirmation
   * button inside the dialog).
   */
  close(): void {
    this.closeInternal();
  }

  private openInternal(): void {
    const restore = this.restoreTarget() ?? true;
    this.ref = this.dialog.open(this.body(), {
      // The dialog semantics (role, aria-modal and the accessible name)
      // live on the `.panel` element in accessible-dialog.html, next to
      // the heading and the close button they describe. `CdkDialogContainer`
      // binds `role`, `aria-modal`, `aria-label` and `aria-labelledby` from
      // this config, and `DialogConfig.role` defaults to 'dialog', so
      // leaving those defaults in place wraps the panel in a second dialog
      // node. `undefined` clears the bound attribute instead: the config is
      // spread over the defaults, so the key still overrides them.
      role: undefined,
      ariaModal: undefined,
      hasBackdrop: true,
      disableClose: false,
      restoreFocus: restore,
      autoFocus: this.initialFocus(),
      viewContainerRef: this.viewContainerRef,
    });
    // Notify parent when the dialog closes through any of CDK's paths
    // (close button, Escape key, backdrop click).
    this.ref.closed.subscribe(() => {
      this.ref = null;
      this.closed.emit();
    });
  }

  private closeInternal(): void {
    if (this.ref === null) return;
    const ref = this.ref;
    // Setting ref = null first so the effect does not loop on the next
    // tick when the parent observes `closed` and sets `opened` back to false.
    this.ref = null;
    ref.close();
  }
}
