import { Component, computed, input, output } from '@angular/core';

/**
 * MiBolt Button primitive.
 *
 * Variants follow docs/design/yettel.md §5 and §9:
 * - `primary`   — navy on lime `.btn--primary-inverse` (single prominent CTA
 *   per unit); the lime pill is yettel's CTA on every captured screen.
 * - `primaryOnDark` — the same lime pill on a navy surface (the product
 *   page's buy box, the cart summary), where the focus ring has to be white
 *   rather than navy.
 * - `secondary` — the outlined navy `.btn-outline-navy` on white (restrained).
 * - `secondaryOnDark` — the outlined lime `.btn-outline-lime` for navy shell
 *   surfaces, where the focus ring has to be white rather than navy.
 * - `navy` — the filled navy `.btn--primary`, white on `#002340`; the
 *   "Belépés" pill on the lime bar in home-1920.png.
 *
 * State contracts (where applicable):
 * - default, hover, focus-visible, active, disabled, loading.
 * - `loading` swaps the label to the loading label and makes the button
 *   appear and behave as inert (`aria-busy`, `aria-disabled`, the disabled
 *   look, the click dropped by `onClick`) without changing its outer width.
 *   It never sets native `disabled`: a focused, enabled button that
 *   transitions to native `disabled` hands the focus to `<body>`, and the
 *   shopper who pressed it would lose their place. Loading keeps the native
 *   focusable state so the focus stays put. Only the `disabled` input sets
 *   native `disabled`.
 *
 * Selection is not conveyed by color alone: the focus ring, the disabled state
 * and the loading label are all textual/structural, not chromatic.
 */
@Component({
  selector: 'app-button',
  templateUrl: './button.html',
  styleUrl: './button.scss',
})
export class Button {
  readonly variant = input<'primary' | 'primaryOnDark' | 'secondary' | 'secondaryOnDark' | 'navy'>(
    'primary',
  );
  readonly label = input.required<string>();
  readonly loadingLabel = input<string>('Betöltés…');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  /** Full-width button for a card's action column. */
  readonly block = input(false);

  /** Shared by the aria-disabled attribute, the is-disabled class and the
   *  click guard so the three stay in lock-step. */
  readonly inert = computed<boolean>(() => this.disabled() || this.loading());

  readonly pressed = output<MouseEvent>();

  onClick(event: MouseEvent): void {
    if (this.inert()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.pressed.emit(event);
  }
}
