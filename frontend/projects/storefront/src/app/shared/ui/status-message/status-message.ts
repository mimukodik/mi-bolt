import { Component, input, output } from '@angular/core';
import { Button } from '../button/button';

export type StatusSeverity = 'info' | 'error' | 'success' | 'warning';

/**
 * MiBolt StatusMessage primitive.
 *
 * Renders a message whose role depends on its severity:
 * - `info`    — `role="status"`, polite live region.
 * - `success` — `role="status"`, polite live region.
 * - `warning` — `role="status"`, polite live region.
 * - `error`   — `role="alert"`, assertive live region (T10-AC05: critical
 *               results never live in a transient toast only).
 * - `live` false — no role and no aria-live on any severity (decision 16).
 *
 * The component never invents success or urgency copy: the `message` text
 * is the caller's responsibility, and only those four exact severities
 * are exposed.
 *
 * Required states:
 * - info, success, warning, error — visible message, dismissible unless persistent.
 * - dismissed             — content removed from the live tree.
 */
@Component({
  selector: 'app-status-message',
  imports: [Button],
  templateUrl: './status-message.html',
  styleUrl: './status-message.scss',
})
export class StatusMessage {
  readonly message = input.required<string>();
  readonly severity = input<StatusSeverity>('info');
  readonly persistent = input(false);
  /** False for a notice that is part of the page rather than news about it
   *  (the demo notices): it renders without `role` and `aria-live`, so a
   *  screen reader reads it in place instead of announcing it on load,
   *  where several at once drown each other and the real announcements. */
  readonly live = input(true);
  readonly dismissed = output();
}
