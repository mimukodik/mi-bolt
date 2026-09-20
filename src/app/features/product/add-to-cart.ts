/**
 * T18 — add-to-cart surface (S3 → S4.1).
 *
 * Presentation-only per `docs/spec/components.md:446-458`
 * (`AddToCartControl`): a single primary CTA that emits one intent
 * and owns no cart persistence of its own. `variant`, `quantity`,
 * `pending` and `error` all come from the parent — `ProductPage`,
 * which `components.md:409` names as the container that owns
 * `CartFacade` injection (FIX-50 item 2b).
 *
 * The component still renders the pending / error `StatusMessage`
 * banners itself, since both are driven entirely by its own inputs;
 * the `success` state has no input to drive it from and is rendered
 * by the parent instead (see `ProductPage`).
 */

import { Component, computed, input, output } from '@angular/core';

import { Button } from '../../shared/ui/button/button';
import { StatusMessage, type StatusSeverity } from '../../shared/ui/status-message/status-message';
import type { UiProblem } from '../../shared/types/ui-problem';

import type { Variant } from '../../api/generated/models/variant';

@Component({
  selector: 'app-add-to-cart',
  imports: [Button, StatusMessage],
  templateUrl: './add-to-cart.html',
  styleUrl: './add-to-cart.scss',
})
export class AddToCart {
  /**
  The variant to add. Null until the parent has resolved one.
  */
  readonly variant = input<Variant | null>(null);

  /**
  Quantity the parent wants added. The component never invents it.
  */
  readonly quantity = input<number>(1);

  /**
  In-flight state of the parent's single cart mutation.
  */
  readonly pending = input<boolean>(false);

  /**
  The parent's last cart-mutation failure, or null.
  */
  readonly error = input<UiProblem | null>(null);

  /**
  Emitted once per click; the parent performs the actual mutation.
  */
  readonly addRequested = output<{ variantId: string; quantity: number }>();

  readonly disabled = computed<boolean>(() => this.variant() === null || this.pending());

  /** Transient status banner copy + severity, driven entirely by the
   *  parent's `pending` / `error` inputs. The component never invents
   *  urgency or stock counts. */
  readonly statusBanner = computed<{ text: string; severity: StatusSeverity } | null>(() => {
    if (this.pending()) {
      return { text: 'A termék hozzáadása a kosárhoz…', severity: 'info' };
    }
    const problem = this.error();
    return problem === null ? null : { text: problem.message, severity: 'error' };
  });

  /** Severity accessor so the StatusMessage primitive owns the
   *  role/aria-live switch without leaking the local banner shape.
   *  Defaults to `info` when no banner is active so the binding is
   *  always defined. */
  readonly severity = computed<StatusSeverity>(() => this.statusBanner()?.severity ?? 'info');

  onAdd(): void {
    const variant = this.variant();
    if (variant === null || this.pending()) return;
    this.addRequested.emit({ variantId: variant.id, quantity: this.quantity() });
  }
}
