import { Injectable, signal } from '@angular/core';

/**
 * T11 stub for the cart count surfaced in the header.
 *
 * T17 replaces this with the real `CartFacade` (providedIn root) that
 * exposes the same `itemCount` signal. Consumers — `AppShell`, `HeaderNav`
 * — inject this token only, so swapping the implementation later is a
 * single-line change with no consumer edits.
 *
 * The class intentionally exposes a writable internal `count` signal so
 * the T11 unit suite can drive the badge without depending on a full
 * cart lifecycle; T17 closes that seam.
 */
@Injectable({ providedIn: 'root' })
export class CartCountFacade {
  /** Internal writable signal. T17 will replace the body, not the API. */
  readonly count = signal<number>(0);

  /** Readonly cart line item total. UI subscribes through this signal. */
  readonly itemCount = this.count.asReadonly();
}
