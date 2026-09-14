import { Component, input } from '@angular/core';

export type LoadingVariant = 'block' | 'lines' | 'card';

/**
 * MiBolt LoadingState primitive.
 *
 * Renders a skeleton that matches the expected component dimensions, so
 * the surrounding layout never jumps when real data arrives. The skeleton
 * is animated only with restrained motion and it stops entirely when
 * `prefers-reduced-motion: reduce` is set (handled globally in primitives.css).
 *
 * Required states:
 * - loading     — single static skeleton of the requested variant.
 * - refreshing  — same skeleton plus a screen-reader-only status so the
 *                 user knows old content is being replaced, not loaded for
 *                 the first time.
 */
@Component({
  selector: 'app-loading-state',
  template: `
    <div
      class="root"
      [class.is-lines]="variant() === 'lines'"
      [class.is-card]="variant() === 'card'"
      [attr.aria-busy]="true"
      [attr.role]="role()"
      [attr.aria-label]="label()"
      data-testid="loading-state"
    >
      @switch (variant()) {
        @case ('lines') {
          <span class="line line--wide" aria-hidden="true"></span>
          <span class="line line--medium" aria-hidden="true"></span>
          <span class="line line--narrow" aria-hidden="true"></span>
        }
        @case ('card') {
          <span class="block block--image" aria-hidden="true"></span>
          <span class="block block--title" aria-hidden="true"></span>
          <span class="block block--price" aria-hidden="true"></span>
        }
        @default {
          <span class="block block--single" aria-hidden="true"></span>
        }
      }
      <span class="sr-only">{{ label() }}</span>
    </div>
  `,
  styleUrl: './loading-state.css',
})
export class LoadingState {
  readonly variant = input<LoadingVariant>('block');
  readonly label = input<string>('Betöltés…');
  readonly role = input<'status' | 'progressbar'>('status');
}
