import { Component, computed, input, output } from '@angular/core';

/**
 * MiBolt Button primitive.
 *
 * Variants follow docs/design/yettel.md §5:
 * - `primary`   — white on navy `.btn--primary` (single prominent CTA per unit).
 * - `secondary` — the outlined navy `.btn-outline-navy` on white (restrained).
 * - `secondaryOnDark` — the `.btn--primary-inverse` recipe, navy on lime, for
 *   use on the navy shell surfaces.
 *
 * Sizes:
 * - `standard`     — 44 px (the project minimum purchase-flow target).
 * - `comfortable`  — 48 px.
 *
 * State contracts (where applicable):
 * - default, hover, focus-visible, active, disabled, loading.
 * - The native `aria-busy` and the visual loading state share one source of truth:
 *   setting `loading` to true swaps the label to the loading label and disables
 *   interaction without changing the button's outer width.
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
  readonly variant = input<'primary' | 'secondary' | 'secondaryOnDark'>('primary');
  readonly size = input<'standard' | 'comfortable'>('standard');
  readonly label = input.required<string>();
  readonly loadingLabel = input<string>('Betöltés…');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');

  readonly pressed = output<MouseEvent>();

  readonly minTargetHeight = computed(() =>
    this.size() === 'comfortable' ? 'var(--size-control-comfortable)' : 'var(--size-control)',
  );

  onClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.pressed.emit(event);
  }
}
