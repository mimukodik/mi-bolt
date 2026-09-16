import { Component, input, output } from '@angular/core';
import { Button } from '../button/button';

export type StatusSeverity = 'info' | 'error' | 'success';

/**
 * MiBolt StatusMessage primitive.
 *
 * Renders a message whose role depends on its severity:
 * - `info`    — `role="status"`, polite live region.
 * - `success` — `role="status"`, polite live region.
 * - `error`   — `role="alert"`, assertive live region (T10-AC05: critical
 *               results never live in a transient toast only).
 *
 * The component never invents success or urgency copy: the `message` text
 * is the caller's responsibility, and only those three exact severities
 * are exposed.
 *
 * Required states:
 * - info, success, error — visible message, dismissible unless persistent.
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
  readonly dismissed = output<void>();
}
