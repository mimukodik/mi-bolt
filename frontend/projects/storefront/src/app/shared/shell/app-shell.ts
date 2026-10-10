import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { HeaderNav, type HeaderVariant } from '../../core/navigation/header-nav';
import { FooterNav } from '../../core/navigation/footer-nav';
import { CartCountFacade } from '../../core/navigation/cart-count-facade';
import { PERSISTENCE_MODE, SNAPSHOT_DISCARD } from '../../core/persistence-mode';
import { PromotionStrip } from './promotion-strip';
import { DemoNotice } from './demo-notice';
import { ShopAppearanceFacade } from './shop-appearance.facade';
import { HalloweenPreviewState } from './halloween-preview-state';

/**
 * `AppShell` is the shared chrome (header + footer) rendered around
 * every page. The three layout shells — Marketing, Shop and Checkout —
 * wrap their `<router-outlet>` in `AppShell` and supply the variant
 * that drives the header.
 *
 * The shell receives the cart count from the `CartCountFacade` token
 * (root-provided). T17 will replace the facade with the real cart
 * facade; the shell subscribes through the readonly `itemCount` signal
 * so the change is a single-line swap with no consumer edits.
 *
 * The checkout variant renders the footer in its compact form: the
 * demo terms dialog inside the review step carries the legal copy,
 * so the footer itself needs less room there.
 */
@Component({
  selector: 'app-app-shell',
  imports: [HeaderNav, FooterNav, DemoNotice, PromotionStrip],
  templateUrl: './app-shell.html',
  host: {
    '[class.halloween]': 'showHalloween()',
    '[class.sm--motion]': 'showHalloween()',
    '[class.sm--deco]': 'showHalloween()',
    '[class.bd-wait]': 'showHalloween() && !decorationsReady()',
  },
  styleUrl: './app-shell.scss',
})
export class AppShell {
  protected readonly decorationsReady = signal(false);
  private readonly appearance = inject(ShopAppearanceFacade);
  protected readonly preview = inject(HalloweenPreviewState);
  /** The explicit preview can force the theme without changing campaign settings. */
  readonly halloween = input(false);
  protected readonly showHalloween = computed(
    () => this.halloween() || this.preview.enabled() || this.appearance.halloweenActive(),
  );

  constructor() {
    effect((cleanup) => {
      const active = this.showHalloween();
      this.decorationsReady.set(false);
      if (!active) return;
      const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
      const reveal = (): void => {
        this.decorationsReady.set(true);
      };
      const changed = (): void => {
        if (preference.matches) reveal();
      };
      const timer = window.setTimeout(reveal, preference.matches ? 0 : 1000);
      preference.addEventListener('change', changed);
      cleanup(() => {
        window.clearTimeout(timer);
        preference.removeEventListener('change', changed);
      });
    });
  }

  /** Header variant — drives which chrome appears. */
  readonly variant = input.required<HeaderVariant>();

  /** Cart count source-of-truth. Injected here so the shell owns the wiring. */

  private readonly cart = inject(CartCountFacade);

  private readonly router = inject(Router);

  /** Drives `DemoNotice`'s `'memory'` state (FIX-70-AC05) — see `PERSISTENCE_MODE`. */
  readonly persistenceMode = inject(PERSISTENCE_MODE);

  /** Drives `DemoNotice`'s reset strip (MIM-448) — see `SNAPSHOT_DISCARD`. */
  readonly snapshotDiscard = inject(SNAPSHOT_DISCARD);

  /** Whether the footer renders in its compact form. The checkout layout is
   *  the only caller that sets this; every other shell uses the default. */
  readonly compact = input<boolean>(false);

  /**
   * Destination of the footer's demo explainer. `'how'` is the
   * post-FIX-33 shape, where the surviving link is
   * "Hogyan működik a demó?" and its target is the home page's
   * how-it-works section (`id="how"`, `FIX-42`/`FIX-33` item 8).
   */
  onDemoInfo(): void {
    void this.router.navigate(['/'], { fragment: 'how' });
  }

  /** Make the variant easy to set from the parent. */
  asVariant(v: HeaderVariant): HeaderVariant {
    return v;
  }
}
