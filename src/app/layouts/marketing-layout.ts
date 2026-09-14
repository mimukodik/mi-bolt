import { ChangeDetectionStrategy, Component, OnInit, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AppShell } from '../shared/shell/app-shell';
import { RouteFocusService } from '../core/navigation/route-focus';

/**
 * `MarketingLayout` is the shell for the Home route.
 *
 * Family S1 — Home: the dark hero, three restrained category shortcuts,
 * featured product grid and three how-it-works tiles live inside the
 * page component (`HomePage`). The shell only owns the chrome around
 * them and exposes a single `<main id="main-content">` landmark so the
 * skip link in the root lands on the right place.
 *
 * The H1 belongs to the lazy page; the layout carries zero headings so
 * the "ONE H1 per page" rule is guaranteed by structure.
 */
@Component({
  selector: 'app-marketing-layout',
  imports: [AppShell, RouterOutlet],
  template: `
    <app-app-shell variant="marketing">
      <main id="main-content" tabindex="-1" class="layout-main">
        <router-outlet />
      </main>
    </app-app-shell>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .layout-main {
        display: block;
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        scroll-margin-top: 80px;
      }
    `,
  ],
})
export class MarketingLayout implements OnInit {
  private readonly routeFocus = inject(RouteFocusService);

  constructor() {
    // Re-focus the page H1 on every navigation. The directive below is
    // attached to the H1 inside the lazy page, but the layout also
    // forwards the route-change pulse through the focus service so
    // navigation between lazy chunks always lands on the new heading.
    effect(() => {
      this.routeFocus.routeChange$;
    });
  }

  ngOnInit(): void {
    // Move focus to the first H1 inside the main landmark after the
    // initial render. The lazy HomePage H1 is in the DOM at this point.
    queueMicrotask(() => this.routeFocus.focusMainHeading());
  }
}
