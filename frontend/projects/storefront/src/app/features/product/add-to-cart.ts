/**
 * T18 — add-to-cart surface (S3 → S4.1).
 *
 * Presentation-only per `docs/spec/components.md:431-443`
 * (`AddToCartControl`): a single primary CTA that emits one intent
 * and owns no cart persistence of its own. `variant`, `pending` and
 * `error` all come from the parent — `ProductPage`, which
 * `components.md:394` names as the container that owns `CartFacade`
 * injection (FIX-50 item 2b). The control adds one piece: there is no
 * quantity to read or display.
 *
 * The component still renders the pending / error `StatusMessage`
 * banners itself, since both are driven entirely by its own inputs;
 * the `success` state has no input to drive it from and is rendered
 * by the parent instead (see `ProductPage`).
 */

import { Component, ElementRef, computed, inject, input, output } from '@angular/core';

import { Button } from '../../shared/ui/button/button';
import { StatusMessage, type StatusSeverity } from '../../shared/ui/status-message/status-message';
import type { UiProblem } from '../../shared/types/ui-problem';

import type { Variant } from '@mi-bolt/api/models/variant';

@Component({
  selector: 'app-add-to-cart',
  imports: [Button, StatusMessage],
  templateUrl: './add-to-cart.html',
  styleUrl: './add-to-cart.scss',
})
export class AddToCart {
  /** The variant to add. Null until the parent has resolved one. */
  readonly variant = input<Variant | null>(null);

  /** In-flight state of the parent's single cart mutation. */
  readonly pending = input<boolean>(false);

  /** The parent's last cart-mutation failure, or null. */
  readonly error = input<UiProblem | null>(null);

  /** Emitted once per click; the parent performs the actual mutation. */
  readonly addRequested = output<{ variantId: string; quantity: number }>();

  /** Emitted when the user closes the error banner via the StatusMessage
   *  primitive's "Bezárás" button. The parent clears its `error` input;
   *  the control itself stays mounted so the next click keeps working. */
  readonly errorDismissed = output();

  readonly disabled = computed<boolean>(() => this.variant() === null || this.pending());

  /** Host element so a dismiss of the error banner can return focus to the
   *  add CTA. The StatusMessage primitive is a sibling, not a descendant of
   *  the button, so it has no native way to land focus back. */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Transient status banner copy + severity, driven entirely by the
   *  parent's `pending` / `error` inputs. The component never invents
   *  urgency or stock counts. */
  readonly statusBanner = computed<{ text: string; severity: StatusSeverity } | null>(() => {
    if (this.pending()) {
      return { text: 'A termék hozzáadása a kosárhoz…', severity: 'info' };
    }
    const problem = this.error();
    if (problem !== null) {
      return { text: problem.message, severity: 'error' };
    }
    return null;
  });

  /** Severity accessor so the StatusMessage primitive owns the
   *  role/aria-live switch without leaking the local banner shape.
   *  Defaults to `info` when no banner is active so the binding is
   *  always defined. */
  readonly severity = computed<StatusSeverity>(() => this.statusBanner()?.severity ?? 'info');

  onAdd(): void {
    const variant = this.variant();
    if (variant === null || this.pending()) return;
    this.addRequested.emit({ variantId: variant.id, quantity: 1 });
  }

  /** The "Bezárás" on the error banner: tells the parent to clear its
   *  error and returns focus to the add button so a keyboard user keeps
   *  their place. Called by the parent via the `(errorDismissed)` listener. */
  onErrorDismissed(): void {
    this.errorDismissed.emit();
    this.focusButton();
  }

  /** Move keyboard focus to the add CTA. Used by `onErrorDismissed` and
   *  reachable from the page through its `viewChild(AddToCart)` handle. */
  focusButton(): void {
    this.host.nativeElement.querySelector('button')?.focus();
  }
}
