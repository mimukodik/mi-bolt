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
 * banner. The cart survives because the `CartFacade` is the source
 * of truth for it; only contact / address / paymentMethod in memory
 * are cleared on hard reload (the facade's `loadSession` does that
 * when the URL contains `?reload=1`).
 */

import { inject } from '@angular/core';
import {
  Router,
  type CanActivateFn,
  type CanMatchFn,
  type UrlSegment,
  type UrlTree,
} from '@angular/router';

import { CartFacade } from '../cart/cart.facade';
import { CheckoutFacade } from './checkout.facade';

/**
 * Builds a UrlTree pointing at the given step with a `navigationReason`
 * query param so the destination page can show a banner explaining
 * why the deep link was redirected.
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
 * Guard for `/penztar/adatok` (contact step).
 *
 * Rejects and redirects to the earliest failure mode:
 *   - an order is already in memory → /penztar/siker/{orderId}
 *     so a back-navigation after a successful commit cannot reopen
 *     the wizard (T24-AC04);
 *   - the cart is empty (or has never been created) →
 *     /penztar/kosar so a deep link with no cart lands on the
 *     cart page rather than an empty form (T19-AC02).
 */
export const contactGuard: CanMatchFn = (_route, _segments): boolean | UrlTree => {
  const checkout = inject(CheckoutFacade);
  const cart = inject(CartFacade);
  const existingOrder = checkout.order();
  if (existingOrder !== null) {
    return redirectToSuccess(existingOrder.id);
  }
  const cartSnapshot = cart.cart();
  if (cartSnapshot === null || cartSnapshot.items.length === 0) {
    return redirectToStep('cart', 'empty-cart');
  }
  return true;
};

/**
 * Guard for `/penztar/szallitas` (delivery + payment step).
 *
 * Rejects and redirects to the earliest failure mode:
 *   - an order is already in memory → /penztar/siker/{orderId}
 *     so a back-navigation after a successful commit cannot reopen
 *     the wizard (T24-AC04);
 *   - the cart is empty → /penztar/kosar (T19-AC02);
 *   - the contact section has not been saved yet →
 *     /penztar/adatok so a deep link to the delivery step lands on
 *     the contact form, where the checkout facade hydrates whatever
 *     was saved server-side.
 */
export const deliveryGuard: CanMatchFn = (_route, _segments): boolean | UrlTree => {
  const checkout = inject(CheckoutFacade);
  const cart = inject(CartFacade);
  const existingOrder = checkout.order();
  if (existingOrder !== null) {
    return redirectToSuccess(existingOrder.id);
  }
  const cartSnapshot = cart.cart();
  if (cartSnapshot === null || cartSnapshot.items.length === 0) {
    return redirectToStep('cart', 'empty-cart');
  }
  const session = checkout.session();
  if (session === null || session.contact === undefined) {
    return redirectToStep('contact', 'incomplete');
  }
  return true;
};

/**
 * Guard for `/penztar/ellenorzes` (review step).
 *
 * Rejects and redirects to the earliest missing section. Covers
 * the four failure modes the spec calls out:
 *   - an order is already in memory → /penztar/siker/{orderId}
 *     so a back-navigation after a successful commit cannot
 *     resubmit the cart (T24-AC04).
 *   - no cart at all → /penztar/kosar (empty-cart)
 *   - contact missing → /penztar/adatok
 *   - delivery / paymentMethod missing → /penztar/szallitas
 */
export const reviewGuard: CanMatchFn = (_route, _segments): boolean | UrlTree => {
  const checkout = inject(CheckoutFacade);
  const cart = inject(CartFacade);
  // T24-AC04: when an order is already in memory the user must NOT
  // be allowed back into the wizard — that path could resubmit the
  // cart. Redirect them to the existing success URL instead.
  const existingOrder = checkout.order();
  if (existingOrder !== null) {
    return redirectToSuccess(existingOrder.id);
  }
  const cartSnapshot = cart.cart();
  if (cartSnapshot === null || cartSnapshot.items.length === 0) {
    return redirectToStep('cart', 'empty-cart');
  }
  const session = checkout.session();
  if (session === null || session.contact === undefined) {
    return redirectToStep('contact', 'incomplete');
  }
  if (session.delivery === undefined || session.paymentMethod === undefined) {
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

/**
 * Factory for guard functions that need to read the URL segments
 * to decide where to send the user. Currently unused but exported
 * for tests that drive the guards directly without a Router.
 */
export function guardForSegment(step: 'cart' | 'contact' | 'delivery' | 'review' | 'success') {
  return (_segments: readonly UrlSegment[]): boolean | UrlTree => {
    const checkout = inject(CheckoutFacade);
    const cart = inject(CartFacade);
    const cartSnapshot = cart.cart();
    if (cartSnapshot === null || cartSnapshot.items.length === 0) {
      return redirectToStep('cart', 'empty-cart');
    }
    if (step === 'success') {
      return checkout.order() !== null
        ? true
        : redirectToStep('cart', 'deep-link');
    }
    const session = checkout.session();
    const target = step;
    if (target === 'contact') {
      return true;
    }
    if (target === 'delivery') {
      if (session === null || session.contact === undefined) {
        return redirectToStep('contact', 'incomplete');
      }
      return true;
    }
    // review
    if (session === null || session.contact === undefined) {
      return redirectToStep('contact', 'incomplete');
    }
    if (session.delivery === undefined || session.paymentMethod === undefined) {
      return redirectToStep('delivery', 'incomplete');
    }
    return true;
  };
}