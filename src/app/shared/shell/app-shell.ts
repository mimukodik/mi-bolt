import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { HeaderNav, type HeaderVariant } from '../../core/navigation/header-nav';
import { FooterNav } from '../../core/navigation/footer-nav';
import { CartCountFacade } from '../../core/navigation/cart-count-facade';

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
 * The checkout variant hides the standard footer: the demo terms dialog
 * inside the review step carries the legal copy instead.
 */
@Component({
  selector: 'app-app-shell',
  imports: [HeaderNav, FooterNav],
  template: `
    <app-header-nav [variant]="variant()" />
    <ng-content></ng-content>
    @if (showFooter()) {
      <app-footer-nav />
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100dvh;
      }

      :host > :nth-child(2) {
        flex: 1 1 auto;
      }

      :host > ng-content {
        display: contents;
      }
    `,
  ],
})
export class AppShell {
  /** Header variant — drives which chrome appears. */
  readonly variant = input.required<HeaderVariant>();

  /** Cart count source-of-truth. Injected here so the shell owns the wiring. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly cart = inject(CartCountFacade);

  /** Whether to render the standard footer. Checkout uses a compact footer. */
  readonly showFooter = input<boolean>(true);

  /** Make the variant easy to set from the parent. */
  asVariant(v: HeaderVariant): HeaderVariant {
    return v;
  }
}
