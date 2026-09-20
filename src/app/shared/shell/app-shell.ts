import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { HeaderNav, type HeaderVariant } from '../../core/navigation/header-nav';
import { FooterNav } from '../../core/navigation/footer-nav';
import { CartCountFacade } from '../../core/navigation/cart-count-facade';
import { PERSISTENCE_MODE } from '../../core/persistence-mode';
import { DemoNotice } from './demo-notice';

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
  imports: [HeaderNav, FooterNav, DemoNotice],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  /** Header variant — drives which chrome appears. */
  readonly variant = input.required<HeaderVariant>();

  /** Cart count source-of-truth. Injected here so the shell owns the wiring. */

  private readonly cart = inject(CartCountFacade);

  private readonly router = inject(Router);

  /** Drives `DemoNotice`'s `'memory'` state (FIX-70-AC05) — see `PERSISTENCE_MODE`. */
  readonly persistenceMode = inject(PERSISTENCE_MODE);

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
