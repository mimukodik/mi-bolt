import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';

import { AppShell } from '../shared/shell/app-shell';
import { RouteFocusService } from '../core/navigation/route-focus';

/**
 * `ShopLayout` is the shell for the Catalogue (S2) and Product (S3)
 * families, and the utility 404 state.
 *
 * Variants:
 * - The default chrome (full nav, dark header with mobile search bar
 *   below at <= 640 px) wraps the catalogue and product routes.
 * - The 404 route is also mounted under this layout, so the user keeps
 *   the standard header/footer when an unknown URL is hit.
 *
 * Mobile search input: rendered by `HeaderNav` as a full-width strip
 * below the header on narrow widths. Visibility is driven by a CSS
 * media query (max-width: 640 px) inside `header-nav.css`.
 */
@Component({
  selector: 'app-shop-layout',
  imports: [AppShell, RouterOutlet],
  templateUrl: './shop-layout.html',
  styleUrl: './shop-layout.scss',
})
export class ShopLayout {
  private readonly routeFocus = inject(RouteFocusService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.routeFocus
      .navigationEnd$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.routeFocus.scheduleFocus();
      });
  }
}
