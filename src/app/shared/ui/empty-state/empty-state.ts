import { Component, input, output } from '@angular/core';
import { Button } from '../button/button';

/**
 * MiBolt EmptyState primitive.
 *
 * Brief explanation plus an optional action whose label the caller chooses.
 * The primitive stays silent on social proof, urgency and "others bought…"
 * language — those are explicitly excluded (R25).
 *
 * Required states:
 * - empty       — short text, optional primary action.
 * - empty-active — same view with the action focused for keyboard users
 *                 arriving via the filter-clear flow.
 */
@Component({
  selector: 'app-empty-state',
  imports: [Button],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly actionLabel = input<string | null>(null);
  readonly actionVariant = input<'primary' | 'secondary'>('secondary');

  readonly actionRequested = output();
}
