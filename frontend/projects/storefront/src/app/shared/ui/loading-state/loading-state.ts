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
  templateUrl: './loading-state.html',
  styleUrl: './loading-state.scss',
})
export class LoadingState {
  readonly variant = input<LoadingVariant>('block');
  readonly label = input<string>('Betöltés…');
  readonly role = input<'status' | 'progressbar'>('status');
}
