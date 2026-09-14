import { Component, input, output } from '@angular/core';
import { Button } from '../button/button';

/**
 * MiBolt ErrorState primitive.
 *
 * Brief, non-blaming message, a single retry button and an optional hint
 * that previous data is still in place. The component never invents
 * stock/service/health copy: the `message` is supplied by the caller and
 * should describe only what the user can act on (retry, refresh, etc.).
 *
 * Required states:
 * - error       — live-region announcement, retry button is interactive.
 * - preserving  — adds a secondary hint that existing values are retained.
 * - retrying    — disables the retry button via `pending` and labels it
 *                 "Újrapróbálom…" so the action's meaning is preserved.
 */
@Component({
  selector: 'app-error-state',
  imports: [Button],
  template: `
    <section class="root" role="alert" aria-live="polite" data-testid="error-state">
      <h2 class="title">{{ title() }}</h2>
      <p class="message">{{ message() }}</p>
      @if (preserving()) {
        <p class="hint" data-testid="error-hint">A korábban megadott értékeket megőrizzük.</p>
      }
      <div class="actions">
        <app-button
          variant="primary"
          size="standard"
          [label]="pending() ? 'Újrapróbálom…' : retryLabel()"
          [loading]="pending()"
          [loadingLabel]="'Újrapróbálom…'"
          (pressed)="retryRequested.emit()"
        ></app-button>
      </div>
    </section>
  `,
  styleUrl: './error-state.css',
})
export class ErrorState {
  readonly title = input<string>('Hiba történt');
  readonly message = input.required<string>();
  readonly retryLabel = input<string>('Újrapróbálom');
  readonly pending = input(false);
  readonly preserving = input(false);

  readonly retryRequested = output<void>();
}
