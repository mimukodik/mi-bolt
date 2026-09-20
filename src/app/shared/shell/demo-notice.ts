import { Component } from '@angular/core';

/**
 * `DemoNotice` is a light strip immediately below the global header,
 * stating the simulation. It is intentionally non-dismissable on the
 * demo: every layout renders it because every commercial surface
 * belongs to the simulation. The notice states the simulation in
 * Hungarian and repeats the no-real-purchase guarantee that the
 * project brief requires (`R15`).
 *
 * The element uses `role="status"` so screen readers announce it once
 * when the page renders without hijacking subsequent updates; the
 * visible text is the source of truth, not a redundant aria-label.
 */
@Component({
  selector: 'app-demo-notice',
  templateUrl: './demo-notice.html',
  styleUrl: './demo-notice.scss',
})
export class DemoNotice {
  protected readonly tag = 'app-demo-notice';
}
