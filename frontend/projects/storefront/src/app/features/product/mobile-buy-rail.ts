import {
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
} from '@angular/core';

import { Button } from '../../shared/ui/button/button';
import { PriceBlock, type Money } from '../../shared/ui/price-block/price-block';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import type { UiProblem } from '../../shared/types/ui-problem';

/**
 * T16 — narrow-viewport-only sticky purchase rail
 * (`docs/spec/components.md:461-473`).
 *
 * Extracted from the inline markup `product-page.html` used to carry:
 * a plain button with no `[loading]` binding and no error surface of
 * its own. This component shares the page's single cart-mutation
 * state (`pending`, `error`) rather than owning one
 * (`docs/spec/architecture.md:57` — "do not maintain two
 * independently writable totals"); the page is the one place that
 * calls `CartFacade` (`components.md:394`).
 *
 * Required states: default, loading (`pending`), disabled
 * (`!available`), error, and focus (native button semantics).
 */
@Component({
  selector: 'app-mobile-buy-rail',
  imports: [Button, PriceBlock, StatusMessage],
  templateUrl: './mobile-buy-rail.html',
  styleUrl: './mobile-buy-rail.scss',
})
export class MobileBuyRail {
  readonly money = input<Money | null>(null);
  readonly referencePrice = input<Money | null>(null);
  readonly promotionText = input<string | null>(null);
  readonly available = input<boolean>(false);
  readonly pending = input<boolean>(false);
  readonly error = input<UiProblem | null>(null);

  /** The page's add-to-cart success message, shown as the rail's first row
   *  on narrow viewports where the desktop CTA column is hidden. */
  readonly success = input<string | null>(null);

  /** Why the variant cannot be added, from the page's add-to-cart state;
   *  shown under the button on narrow viewports, where the desktop hint is
   *  hidden. */
  readonly reason = input<string | null>(null);

  readonly addRequested = output();

  /** Emitted when the user closes the error banner via the StatusMessage
   *  primitive's "Bezárás" button. The parent clears its `error` input;
   *  the rail itself stays mounted so the next press keeps working. */
  readonly errorDismissed = output();

  /** Emitted when the user closes the success message; the parent clears
   *  its `success` input. */
  readonly successDismissed = output();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Publishes the rail's real height, message row included, as
   *  `--rail-block-size` on the root element, so the footer clearance
   *  and the focus scroll padding in `primitives.css` follow it rather
   *  than the fixed `--rail-height` (MIM-238). */
  constructor() {
    const root = inject(DOCUMENT).documentElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const rail = this.host.nativeElement.querySelector<HTMLElement>('.rail');
      if (rail === null || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => {
        root.style.setProperty(
          '--rail-block-size',
          `${String(rail.getBoundingClientRect().height)}px`,
        );
      });
      observer.observe(rail);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        root.style.removeProperty('--rail-block-size');
      });
    });
  }

  readonly priceStatus = computed<'idle' | 'success'>(() =>
    this.money() === null ? 'idle' : 'success',
  );

  readonly visibleReason = computed<string | null>(() => (this.available() ? null : this.reason()));

  onPress(): void {
    if (!this.available() || this.pending()) return;
    this.addRequested.emit();
  }

  /** The "Bezárás" on the error toast: tells the parent to clear its
   *  error and returns focus to the rail's primary CTA so a keyboard
   *  user keeps their place. */
  onErrorDismissed(): void {
    this.errorDismissed.emit();
    this.focusButton();
  }

  onSuccessDismissed(): void {
    this.successDismissed.emit();
    this.focusButton();
  }

  /** Focuses the CTA. The message row comes before it in the DOM, so the
   *  first `button` in the rail is the message's "Bezárás" while a message
   *  is shown. */
  focusButton(): void {
    this.host.nativeElement.querySelector<HTMLButtonElement>('.rail-cta button')?.focus();
  }
}
