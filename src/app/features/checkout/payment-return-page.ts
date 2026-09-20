/**
 * T19+ — payment-return cold start (2.0.0, S3-C2).
 *
 * The 2.0.0 payment application returns the shopper to
 * `/penztar?paymentIntentId=...` with a full page load; the SPA is
 * destroyed by the redirect (`01-kommunikacio.md` §8.3) and starts
 * cold on return. This page is the landing target: it hydrates the
 * cart and the session, reads the payment intent through the
 * facade, then navigates to `/penztar/ellenorzes`. The review page
 * owns every branch on `paymentIntent` status; this one renders only
 * a skeleton while the read is in flight, so it stays logic rather
 * than design work.
 *
 *   - no guard on the route — the return arrives cold, before any
 *     facade has state, and there is nothing to check until the
 *     cart and the session are loaded;
 *   - the `paymentIntentId` query parameter arrives through the
 *     router's input binding (enabled by `app.config.ts:27`'s
 *     `withComponentInputBinding()`), so no `ActivatedRoute`
 *     subscription is needed;
 *   - a bare `/penztar` with no query parameter is also handled: it
 *     lands on the cart, which keeps the new empty path from
 *     becoming a dead URL.
 *
 * Hydration failures (network down, 5xx, expired session) send the
 * shopper back to the cart rather than stranding them on a loading
 * skeleton, and a `DestroyRef` cancels a navigation in flight when
 * the component unmounts so a back-button race cannot bounce them
 * into the wizard they just left.
 *
 * The brief's `code-review xhigh --fix` pass scopes its findings to
 * the five files this unit writes; nothing else is touched here.
 */

import { Component, DestroyRef, inject, input } from '@angular/core';
import { Router } from '@angular/router';

import { CartFacade } from '../cart/cart.facade';
import { CheckoutFacade } from './checkout.facade';
import { checkoutKeys } from './checkout-keys';

import { LoadingState } from '../../shared/ui/loading-state/loading-state';

@Component({
  selector: 'app-payment-return-page',
  imports: [LoadingState],
  templateUrl: './payment-return-page.html',
})
export class PaymentReturnPage {
  /** Bound from the `paymentIntentId` query parameter by
   *  `withComponentInputBinding()` (`app.config.ts:27`). Null when
   *  the user lands on a bare `/penztar` with no query. */
  readonly paymentIntentId = input<string | null>(null);

  private readonly router = inject(Router);
  private readonly cart = inject(CartFacade);
  private readonly checkout = inject(CheckoutFacade);
  private readonly destroyRef = inject(DestroyRef);

  /** Runs once on construction. Calls every `inject()` above before
   *  the first `await` so NG0203 cannot fire, then hydrates the
   *  cart and the session, reads the payment intent through the
   *  facade, and lands on the review page regardless of the
   *  outcome. A missing id (no query parameter and no stored id
   *  either) sends the shopper to the cart instead. A hydration
   *  failure (network down, 5xx) sends them back to the cart as
   *  well; the cart page's own error surfaces are the right place
   *  for the diagnostic rather than this transient skeleton. */
  constructor() {
    let cancelled = false;
    this.destroyRef.onDestroy(() => {
      cancelled = true;
    });
    void this.hydrate(() => cancelled);
  }

  private async hydrate(cancelled: () => boolean): Promise<void> {
    try {
      await this.cart.ensureCart();
      if (cancelled()) return;
      await this.checkout.ensureSession();
      if (cancelled()) return;
    } catch {
      if (cancelled()) return;
      await this.router.navigate(['/penztar/kosar']);
      return;
    }

    const id = this.paymentIntentId() ?? checkoutKeys.activeIntentId();
    if (id === null || id.length === 0) {
      if (cancelled()) return;
      await this.router.navigate(['/penztar/kosar']);
      return;
    }

    const intent = await this.checkout.readPaymentIntent(id);
    if (cancelled()) return;
    if (!intent.ok) {
      // The payment intent could not be read (404, network, expired).
      // The review page is the wrong destination for an intent-less
      // session — it would render an empty "Fizetés folyamatban"
      // affordance with no status to drive it. Land on the cart so
      // the user sees the wired cart instead of a stalled wizard.
      await this.router.navigate(['/penztar/kosar']);
      return;
    }
    await this.router.navigate(['/penztar/ellenorzes']);
  }
}
