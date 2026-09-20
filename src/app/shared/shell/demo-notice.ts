import { Component, input } from '@angular/core';

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
 *
 * `persistenceMode` drives the second, `'memory'` state
 * `docs/spec/components.md:101-113` declares: a visibly distinct
 * surface warning that a reload will not restore the demo snapshot.
 * The default is `'durable'` rather than a required input so this
 * component can land before the call site has a real value to bind —
 * see `docs/fix/FIX-70.md`.
 */
@Component({
  selector: 'app-demo-notice',
  templateUrl: './demo-notice.html',
  styleUrl: './demo-notice.scss',
})
export class DemoNotice {
  protected readonly tag = 'app-demo-notice';

  readonly persistenceMode = input<'durable' | 'memory'>('durable');
}
