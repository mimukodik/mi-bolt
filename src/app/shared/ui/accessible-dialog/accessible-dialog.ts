import {
  Component,
  ElementRef,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { Dialog, DialogModule, DialogRef } from '@angular/cdk/dialog';

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
 * - closed  — nothing mounted, focus lives wherever the user left it.
 * - open    — focus trapped inside, backdrop excluded.
 * - focus   — focus is somewhere inside the panel; the consumer can
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
  private readonly host = inject(ElementRef<HTMLElement>);

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
   * Element that should regain focus when the dialog closes. Defaults to
   * the host element of the primitive.
   */
  readonly restoreTarget = input<HTMLElement | null>(null);

  /** Emits when the dialog closes by any mechanism (button, Escape, backdrop). */
  readonly closed = output<void>();

  /**
   * `@ViewChild` is the JIT-friendly view-query API: the JIT compiler
   * (the only path available under vitest without an Angular linker)
   * reads `propDecorators` for property-level `@ViewChild` and
   * `@Input` annotations. The vitest transformer in `vitest.config.ts`
   * ensures those entries reach the JIT compiler; signal-based
   * `viewChild()` only works under AOT.
   */
  @ViewChild('body', { static: true })
  private readonly body!: TemplateRef<unknown>;

  private ref: DialogRef<unknown> | null = null;

  constructor() {
    effect(() => {
      const open = this.opened();
      if (open && !this.ref) {
        this.openInternal();
      } else if (!open && this.ref) {
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
    const restore = (this.restoreTarget() as HTMLElement | null) ?? this.host.nativeElement;
    this.ref = this.dialog.open(this.body, {
      ariaLabel: this.label(),
      ariaLabelledBy: this.labelledBy() ?? undefined,
      ariaModal: true,
      role: 'dialog',
      hasBackdrop: true,
      disableClose: false,
      restoreFocus: restore,
      autoFocus: 'first-tabbable',
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
    if (!this.ref) return;
    const ref = this.ref;
    // Setting ref = null first so the effect does not loop on the next
    // tick when the parent observes `closed` and sets `opened` back to false.
    this.ref = null;
    ref.close();
  }
}
