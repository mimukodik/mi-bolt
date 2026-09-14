import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * `DemoNotice` is the dark strip immediately below the global header.
 *
 * It is intentionally non-dismissable on the demo: every layout renders
 * it because every commercial surface belongs to the simulation. The
 * notice states the simulation in Hungarian and repeats the no-real-
 * purchase guarantee that the project brief requires (`R15`).
 *
 * The element uses `role="status"` so screen readers announce it once
 * when the page renders without hijacking subsequent updates; the
 * visible text is the source of truth, not a redundant aria-label.
 */
@Component({
  selector: 'app-demo-notice',
  template: `
    <aside class="demo-notice" role="status" data-testid="demo-notice">
      <span class="demo-notice__badge" aria-hidden="true">DEMÓ</span>
      <span class="demo-notice__text">
        MiBolt demó — nincs valódi vásárlás, nincs fizetés, nincs kiszállítás.
      </span>
    </aside>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .demo-notice {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2) var(--layout-gutter-mobile);
        background: var(--color-surface-section);
        border-bottom: 1px solid var(--color-border-subtle);
        color: var(--color-text-primary);
        font-size: var(--type-helper);
        line-height: var(--line-height-body);
      }

      .demo-notice__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        height: var(--size-control);
        padding: 0 var(--space-2);
        background: var(--color-brand-accent);
        color: var(--color-text-primary);
        font-weight: var(--weight-bold);
        font-size: var(--type-meta);
        border-radius: var(--radius-badge);
        letter-spacing: 0.04em;
      }

      .demo-notice__text {
        flex: 1 1 auto;
        min-width: 0;
      }

      @media (min-width: 768px) {
        .demo-notice {
          padding: var(--space-2) var(--layout-gutter-desktop);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .demo-notice {
          transition: none;
        }
      }
    `,
  ],
})
export class DemoNotice {}
