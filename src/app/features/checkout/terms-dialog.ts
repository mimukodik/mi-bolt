/**
 * T22 — demo-only terms dialog.
 *
 * Rendered by the review screen when the user clicks "Feltételek
 * megtekintése" next to the demo-purchase checkbox. The body is
 * deliberately demo-aware copy so the user never confuses the
 * checkbox with a real subscription contract (R15 / T22-AC02):
 *
 *   - This is a simulation, no real order is placed, no real
 *     payment is processed, no email is sent.
 *   - Contact / address data entered on the wizard are kept in
 *     memory only and are wiped on hard reload (per T19's privacy
 *     contract).
 *   - The dialog is NOT a substitute for an ÁSZF / privacy notice;
 *     production legal-compliance copy is deliberately absent.
 *
 * Built on top of the shared `AccessibleDialog` primitive so the
 * CDK-owned focus trap, background exclusion, Escape handling and
 * restoration-on-close satisfy R23 without any new plumbing.
 */

import { Component, input, output } from '@angular/core';

import { AccessibleDialog } from '../../shared/ui/accessible-dialog/accessible-dialog';

@Component({
  selector: 'app-terms-dialog',
  imports: [AccessibleDialog],
  templateUrl: './terms-dialog.html',
  styleUrl: './terms-dialog.scss',
})
export class TermsDialog {
  /** Drives the open / closed lifecycle. The parent owns the
   *  toggle signal. */
  readonly opened = input<boolean>(false);

  /** Localised accessible label for the dialog. */
  readonly label = input<string>('Demó pénztár — feltételek');

  /** Emits whenever the dialog closes by any mechanism (close
   *  button, Escape, backdrop click). */
  readonly closed = output();

  onClosed(): void {
    this.closed.emit();
  }
}
