import { Component, input } from '@angular/core';

/**
 * `DemoNotice` is a slim navy strip immediately below the global header,
 * stating the simulation. It is intentionally non-dismissable on the
 * demo: every layout renders it because every commercial surface
 * belongs to the simulation. The notice states the simulation in
 * Hungarian and repeats the no-real-purchase guarantee that the
 * project brief requires (`R15`).
 *
 * The element carries no `role` and no `aria-live`: the demo texts are
 * read in place when the user reaches them rather than announced on
 * load, where several live regions at once drown out each other and the
 * real announcements (the owner's decision 16, 2026-09-22). The
 * visible text is the source of truth, not a redundant aria-label.
 *
 * `persistenceMode` drives the second, `'memory'` state
 * `docs/spec/components.md:101-113` declares: a visibly distinct
 * surface warning that a reload will not restore the demo snapshot.
 * The default is `'durable'` rather than a required input so a test
 * host, or a build that never runs the mock bootstrap, can render
 * this component unbound; `AppShell` binds the real value from the
 * `PERSISTENCE_MODE` token, set from whether the mock bootstrap's
 * session-storage hydrate found browser storage denied.
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
