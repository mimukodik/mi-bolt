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
  template: `
    <app-accessible-dialog
      [opened]="opened()"
      [label]="label()"
      (closed)="onClosed()"
      data-testid="review-terms-dialog"
    >
      <div class="body" data-testid="terms-body">
        <p>
          Ez a pénztár <strong>demó folyamat</strong>: a leadott
          rendelés nem valós, nem küldünk sem e-mailt, sem csomagot,
          és a fizetés sem valós pénzmozgás.
        </p>
        <p>
          A megadott nevet, e-mail címet, telefonszámot és szállítási
          adatot kizárólag a böngésző memóriájában tároljuk, a
          szerveroldali demó munkamenet idejére. A pénztár oldal
          frissítésekor ezek az adatok törlődnek.
        </p>
        <p>
          A jelölőnégyzet elfogadása nem minősül valós
          jogi nyilatkozatnak — kizárólag azt jelzi, hogy a demó
          folyamatot tudomásul vetted.
        </p>
        <p class="muted">
          A demó feltételek verziója:
          <code>demo-1</code>
        </p>
      </div>
    </app-accessible-dialog>
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .body {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        font-size: var(--type-body);
        line-height: var(--line-height-body);
        color: var(--color-text-primary);
      }

      .muted {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }
    `,
  ],
})
export class TermsDialog {
  /** Drives the open / closed lifecycle. The parent owns the
   *  toggle signal. */
  readonly opened = input<boolean>(false);

  /** Localised accessible label for the dialog. */
  readonly label = input<string>('Demó pénztár — feltételek');

  /** Emits whenever the dialog closes by any mechanism (close
   *  button, Escape, backdrop click). */
  readonly closed = output<void>();

  onClosed(): void {
    this.closed.emit();
  }
}