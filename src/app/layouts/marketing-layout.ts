import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  templateUrl: './marketing-layout.html',
  styleUrl: './marketing-layout.scss',
})
export class MarketingLayout {
  private readonly routeFocus = inject(RouteFocusService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Move focus to the new H1 on every navigation so keyboard and
    // screen-reader users land on the active page heading rather than
    // staying on the previous one. A `queueMicrotask` defers the read
    // until Angular has rendered the lazy chunk's H1.
    this.routeFocus.navigationEnd$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.routeFocus.scheduleFocus();
      });
  }
}
