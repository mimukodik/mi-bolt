/**
 * T19 — checkout wizard route guards.
 *
 * Each guard is a synchronous `CanMatchFn` (or `CanActivateFn` for
 * the success page, which already has a `:orderId` URL parameter).
 * Guards:
 *
 *   - read the `CheckoutFacade` and `CartFacade` signals,
 *   - never call the network,
 *   - never mutate wizard state,
 *   - never submit an order or create a payment intent
 *     (T19-AC05),
 *   - return either `true` or a `UrlTree` redirecting the user to
 *     the earliest incomplete step (T19-AC02).
 *
 * The guards run as part of route matching so a deep link or hard
 * reload of an unfinished checkout lands the user on the right step
 * with a `navigationReason` query param the page renders as a
 * banner. The cart survives because the `CartFacade` is the source of
 * truth for it, and the checkout draft is the server's session. The
 * guards read only the in-memory `CheckoutFacade.session()` signal
 * (T19-AC05, no network), which is `null` on a fresh document load
 * until a `PATCH /checkout` response or `PaymentReturnPage`'s
 * `ensureSession()` fills it, so a reload restarts the wizard from
 * the cart.
 */

import { inject } from '@angular/core';
import { Router, type CanActivateFn, type CanMatchFn, type UrlTree } from '@angular/router';

import type { Cart } from '../../api/generated/models/cart';
import type { OrderReceipt } from '../../api/generated/models/order-receipt';

import { CartFacade } from '../cart/cart.facade';
import { CheckoutFacade } from './checkout.facade';

/**
 * Builds a UrlTree pointing at the given step with a `navigationReason`
 * query param. The reason is part of the redirect helper's union so a
 * deep-link or a reload can be told apart from a real empty-cart state;
 * nothing in `src/app` reads the query param today, so it travels with
 * the URL until a page chooses to consume it.
 */
function redirectToStep(
  step: 'cart' | 'contact' | 'delivery' | 'review' | 'success',
  reason: 'incomplete' | 'empty-cart' | 'deep-link' | 'reload',
): UrlTree {
  const router = inject(Router);
  const segment = step === 'success' ? '/penztar/kosar' : `/penztar/${stepPath(step)}`;
  return router.createUrlTree([segment], { queryParams: { navigationReason: reason } });
}

function stepPath(step: 'cart' | 'contact' | 'delivery' | 'review'): string {
  switch (step) {
    case 'cart':
      return 'kosar';
    case 'contact':
      return 'adatok';
    case 'delivery':
      return 'szallitas';
    case 'review':
      return 'ellenorzes';
  }
}

/**
 * Returns the redirect UrlTree for a cart snapshot, or null when the
 * cart is usable (has items) and the guard should keep checking the
 * downstream sections. The order in memory takes precedence so a
 * back-navigation after a successful commit cannot reopen the
 * wizard (T24-AC04) — the cart at that point is null because
 * `CartFacade.resetOrderedCart()` cleared the local snapshot. The
 * `deep-link` reason distinguishes a fresh document load (where the
 * cart is still hydrating over the network) from a `empty-cart`
 * cart the server actually confirmed has no items (T19-AC02).
 */
function redirectForCartSnapshot(
  cartSnapshot: Cart | null,
  existingOrder: OrderReceipt | null,
): UrlTree | null {
  if (cartSnapshot === null) {
    if (existingOrder !== null) {
      return redirectToSuccess(existingOrder.id);
    }
    return redirectToStep('cart', 'deep-link');
  }
  if (cartSnapshot.items.length === 0) {
    if (existingOrder !== null) {
      return redirectToSuccess(existingOrder.id);
    }
    return redirectToStep('cart', 'empty-cart');
  }
  return null;
}

/**
 * Guard for `/penztar/adatok` (contact step).
 *
 * Rejects and redirects to the earliest failure mode:
 *   - an order is already in memory AND the cart has no items
 *     (snapshot is null after `resetOrderedCart()` cleared it, or
 *     the cart itself is empty) → /penztar/siker/{orderId} so a
 *     back-navigation after a successful commit cannot reopen the
 *     wizard (T24-AC04). When the cart has items the user is
 *     starting a fresh purchase — the new cart id differs from
 *     the ordered one — and the wizard must proceed;
 *   - the cart snapshot has not loaded yet → /penztar/kosar with
 *     reason `deep-link`, because the cart is unknown and the
 *     cart page is what hydrates it. `CartFacade.ensureCart()`
 *     goes over the network, so on a fresh document load the
 *     guard reads `null` while a real cart may already exist
 *     server-side (T19-AC02).
 *   - the cart is loaded and empty → /penztar/kosar with reason
 *     `empty-cart`, so a deep link with no cart lands on the
 *     cart page rather than an empty form (T19-AC02).
 */
export const contactGuard: CanMatchFn = (_route, _segments): boolean | UrlTree => {
  const checkout = inject(CheckoutFacade);
  const cart = inject(CartFacade);
  const cartResult = redirectForCartSnapshot(cart.cart(), checkout.order());
  if (cartResult !== null) return cartResult;
  return true;
};

/**
 * Guard for `/penztar/szallitas` (delivery + payment step).
 *
 * Rejects and redirects to the earliest failure mode:
 *   - an order is already in memory AND the cart has no items
 *     (snapshot is null after `resetOrderedCart()` cleared it, or
 *     the cart itself is empty) → /penztar/siker/{orderId} so a
 *     back-navigation after a successful commit cannot resubmit
 *     the cart (T24-AC04);
 *   - the cart snapshot has not loaded yet → /penztar/kosar with
 *     reason `deep-link`. `CartFacade.ensureCart()` restores the
 *     session cart over the network, so a synchronous guard
 *     always reads `null` on a fresh document load (T19-AC02).
 *   - the cart is loaded and empty → /penztar/kosar with reason
 *     `empty-cart` (T19-AC02);
 *   - the contact section has not been saved yet →
 *     /penztar/adatok so a deep link to the delivery step lands on
 *     the contact form, which starts empty; the `PATCH /checkout`
 *     it sends returns the whole retained draft into `session()`.
 */
export const deliveryGuard: CanMatchFn = (_route, _segments): boolean | UrlTree => {
  const checkout = inject(CheckoutFacade);
  const cart = inject(CartFacade);
  const cartResult = redirectForCartSnapshot(cart.cart(), checkout.order());
  if (cartResult !== null) return cartResult;
  const session = checkout.session();
  if (session?.contact === undefined) {
    return redirectToStep('contact', 'incomplete');
  }
  return true;
};

/**
 * Guard for `/penztar/ellenorzes` (review step).
 *
 * Rejects and redirects to the earliest missing section. Covers
 * the failure modes the spec calls out:
 *   - an order is already in memory AND the cart has no items
 *     (snapshot is null after `resetOrderedCart()` cleared it, or
 *     the cart itself is empty) → /penztar/siker/{orderId} so a
 *     back-navigation after a successful commit cannot resubmit
 *     the cart (T24-AC04). When the cart has items the user is
 *     starting a fresh purchase and the wizard proceeds;
 *   - the cart snapshot has not loaded yet → /penztar/kosar with
 *     reason `deep-link`. `CartFacade.ensureCart()` restores the
 *     session cart over the network, so a synchronous guard
 *     always reads `null` on a fresh document load;
 *   - the cart is loaded and empty → /penztar/kosar with reason
 *     `empty-cart`;
 *   - contact missing → /penztar/adatok
 *   - delivery / payment / billing missing → /penztar/szallitas
 */
export const reviewGuard: CanMatchFn = (_route, _segments): boolean | UrlTree => {
  const checkout = inject(CheckoutFacade);
  const cart = inject(CartFacade);
  const cartResult = redirectForCartSnapshot(cart.cart(), checkout.order());
  if (cartResult !== null) return cartResult;
  const session = checkout.session();
  if (session?.contact === undefined) {
    return redirectToStep('contact', 'incomplete');
  }
  if (
    session.delivery === undefined ||
    session.payment === undefined ||
    session.billing === undefined
  ) {
    return redirectToStep('delivery', 'incomplete');
  }
  return true;
};

/**
 * Builds a UrlTree pointing at the existing success page so a
 * back-navigation attempt lands the user on the same receipt they
 * already have, instead of re-opening the wizard.
 */
function redirectToSuccess(orderId: string): UrlTree {
  const router = inject(Router);
  return router.createUrlTree([`/penztar/siker/${orderId}`]);
}

/**
 * Guard for `/penztar/siker/:orderId`.
 *
 * Three paths:
 *
 *   - The user navigated forward through the wizard, in which case
 *     `CheckoutFacade.order()` already carries the receipt and the
 *     guard matches.
 *   - The user reloaded / deep-linked to the URL with a valid
 *     `orderId` parameter. The success page owns the hydration
 *     through `CheckoutFacade.fetchOrder()`; the guard simply
 *     allows the navigation through so the page can run its GET.
 *   - The user deep-linked without an `orderId`. We send them back
 *     to the cart page rather than rendering an empty receipt.
 */
export const successGuard: CanActivateFn = (route): boolean | UrlTree => {
  const checkout = inject(CheckoutFacade);
  if (checkout.order() !== null) {
    return true;
  }
  const orderId = route.paramMap.get('orderId');
  if (orderId === null || orderId.length === 0) {
    return redirectToStep('cart', 'deep-link');
  }
  // T24-AC02: hydration belongs to the success page. The guard
  // matches and the page resolves the receipt through GET.
  return true;
};
