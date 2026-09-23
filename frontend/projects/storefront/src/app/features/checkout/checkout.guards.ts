/**
 * Checkout wizard route guards.
 *
 * `contactGuard`, `deliveryGuard` and `reviewGuard` are async
 * `CanMatchFn`s. Each one hydrates before it decides: it awaits
 * `CartFacade.ensureCart()` and `CheckoutFacade.ensureSession()`, then
 * runs its own step logic against the snapshots those two reads
 * filled. A reload or a deep link of `/penztar/adatok`,
 * `/penztar/szallitas` or `/penztar/ellenorzes` therefore lands on
 * that step with the draft the server still holds, instead of
 * restarting the wizard from the cart.
 *
 * The hydration sits inside each guard rather than in a separate
 * guard placed first in the route's `canMatch` array, because the
 * router gives an array no sequencing: `runCanMatchGuards` maps over
 * `route.canMatch` and invokes every guard in the same tick, then
 * combines the results with `combineLatest` inside
 * `prioritizedGuardValue` (`@angular/router` 22.1.6,
 * `fesm2022/_router-chunk.mjs:2634` and `:2490`). A hydrating guard in
 * front of a synchronous one would not delay it; the synchronous one
 * would still read the empty signals and its redirect would win the
 * priority walk. "They are executed in the order they appear in the
 * array" (https://angular.dev/guide/routing/route-guards) orders the
 * invocation and the result priority, not the awaiting.
 *
 * Each of the three guards:
 *
 *   - injects the `Router` and both facades before its first `await`,
 *     because `inject()` runs outside the injection context once the
 *     guard has suspended and throws NG0203 there;
 *   - issues no request when the wizard is already hydrated, both
 *     reads being no-ops on a snapshot that is in memory;
 *   - writes no section, submits no order and creates no payment
 *     intent;
 *   - returns `true`, or a `UrlTree` redirecting to the earliest step
 *     that is not satisfied.
 *
 * `ensureSession()` is safe before the contact step exists: `GET
 * /checkout` answers 200 with an empty, incomplete draft on a session
 * that has never been written (`contracts/commerce/openapi.yaml:491-513`), so a
 * first visit hydrates to a session with no sections and the contact
 * step matches on the cart alone. A failed read leaves `session()`
 * null, which the step logic treats as a missing section.
 *
 * `successGuard` stays synchronous: the success page owns its own
 * hydration through `CheckoutFacade.fetchOrder()`.
 */

import { inject } from '@angular/core';
import { Router, type CanActivateFn, type CanMatchFn, type UrlTree } from '@angular/router';

import { CartFacade } from '../cart/cart.facade';
import { CheckoutFacade } from './checkout.facade';

/**
 * Why the shopper is being sent somewhere else. The value is written
 * to the `navigationReason` query parameter; `NavigationReasonBanner`
 * (`navigation-reason-banner.ts`) reads it on the cart, contact and
 * delivery pages and shows the sentence `navigationReasonMessage` maps
 * it to.
 *
 *   - `incomplete`: an earlier step of the wizard has no saved section.
 *   - `empty-cart`: the hydrated cart has no lines.
 *   - `cart-unavailable`: the cart could not be read from the server.
 *   - `deep-link`: the success URL was opened without an order id.
 */
export type NavigationReason = 'incomplete' | 'empty-cart' | 'cart-unavailable' | 'deep-link';

/**
 * Everything a guard needs, collected while the injection context is
 * still open. A guard builds this as its first statement so that the
 * `Router` is in hand for a redirect it decides on after an `await`.
 */
interface GuardContext {
  readonly router: Router;
  readonly cart: CartFacade;
  readonly checkout: CheckoutFacade;
}

function injectGuardContext(): GuardContext {
  return {
    router: inject(Router),
    cart: inject(CartFacade),
    checkout: inject(CheckoutFacade),
  };
}

/**
 * Brings the cart and the checkout draft into memory. Both calls are
 * idempotent reads (`GET /cart`, `GET /checkout`, neither carrying an
 * `If-Match`) and both return at once when their snapshot is already
 * loaded, so this costs two requests on a fresh document load and
 * nothing on a navigation inside the wizard. Neither call throws: a
 * failure lands on the facade's own error signal and leaves the
 * snapshot null, which the caller reads as "not available".
 */
async function hydrate(context: GuardContext): Promise<void> {
  await context.cart.ensureCart();
  await context.checkout.ensureSession();
}

/** Builds a UrlTree pointing at the given step, with the reason. */
function redirectToStep(
  router: Router,
  step: 'cart' | 'contact' | 'delivery' | 'review',
  reason: NavigationReason,
): UrlTree {
  return router.createUrlTree([`/penztar/${stepPath(step)}`], {
    queryParams: { navigationReason: reason },
  });
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
 * Returns the redirect UrlTree for the hydrated cart, or null when the
 * cart is usable (has lines) and the guard should keep checking the
 * downstream sections. It runs after `hydrate()`, so both failing
 * cases mean what they say:
 *
 *   - a null snapshot means `GET /cart` did not succeed, and takes the
 *     `cart-unavailable` reason;
 *   - a loaded snapshot with no lines means the server confirmed an
 *     empty cart, and takes `empty-cart`.
 *
 * An order in memory takes precedence in both, so a back-navigation
 * after a successful commit cannot reopen the wizard: the server drops
 * the ordered cart, so the hydrated snapshot comes back empty. A
 * hydrated cart WITH lines after an order is a fresh purchase and the
 * wizard proceeds.
 */
function redirectForCartSnapshot(context: GuardContext): UrlTree | null {
  const cartSnapshot = context.cart.cart();
  const existingOrder = context.checkout.order();
  if (cartSnapshot === null) {
    if (existingOrder !== null) {
      return redirectToSuccess(context.router, existingOrder.id);
    }
    return redirectToStep(context.router, 'cart', 'cart-unavailable');
  }
  if (cartSnapshot.items.length === 0) {
    if (existingOrder !== null) {
      return redirectToSuccess(context.router, existingOrder.id);
    }
    return redirectToStep(context.router, 'cart', 'empty-cart');
  }
  return null;
}

/**
 * Guard for `/penztar/adatok` (contact step).
 *
 * Hydrates, then rejects and redirects to the earliest failure mode:
 *   - an order is in memory and the hydrated cart has no lines →
 *     /penztar/siker/{orderId};
 *   - the cart could not be read → /penztar/kosar with reason
 *     `cart-unavailable`, the cart page being the screen that reports
 *     a cart it cannot load;
 *   - the cart is empty → /penztar/kosar with reason `empty-cart`, so
 *     a deep link with nothing to buy lands on the cart page rather
 *     than on a form.
 *
 * The contact section itself is not required here: this is the step
 * that writes it, and the hydrated draft only decides what the form
 * opens with (`contact-page.ts`).
 */
export const contactGuard: CanMatchFn = async (_route, _segments): Promise<boolean | UrlTree> => {
  const context = injectGuardContext();
  await hydrate(context);
  const cartResult = redirectForCartSnapshot(context);
  if (cartResult !== null) return cartResult;
  return true;
};

/**
 * Guard for `/penztar/szallitas` (delivery + payment step).
 *
 * Hydrates, then rejects and redirects to the earliest failure mode:
 *   - an order is in memory and the hydrated cart has no lines →
 *     /penztar/siker/{orderId};
 *   - the cart could not be read → /penztar/kosar with reason
 *     `cart-unavailable`;
 *   - the cart is empty → /penztar/kosar with reason `empty-cart`;
 *   - the hydrated draft carries no contact section →
 *     /penztar/adatok, the step that writes it.
 */
export const deliveryGuard: CanMatchFn = async (_route, _segments): Promise<boolean | UrlTree> => {
  const context = injectGuardContext();
  await hydrate(context);
  const cartResult = redirectForCartSnapshot(context);
  if (cartResult !== null) return cartResult;
  const session = context.checkout.session();
  if (session?.contact === undefined) {
    return redirectToStep(context.router, 'contact', 'incomplete');
  }
  return true;
};

/**
 * Guard for `/penztar/ellenorzes` (review step).
 *
 * Hydrates, then rejects and redirects to the earliest missing piece:
 *   - an order is in memory and the hydrated cart has no lines →
 *     /penztar/siker/{orderId};
 *   - the cart could not be read → /penztar/kosar with reason
 *     `cart-unavailable`;
 *   - the cart is empty → /penztar/kosar with reason `empty-cart`;
 *   - contact missing → /penztar/adatok;
 *   - delivery, payment or billing missing → /penztar/szallitas.
 */
export const reviewGuard: CanMatchFn = async (_route, _segments): Promise<boolean | UrlTree> => {
  const context = injectGuardContext();
  await hydrate(context);
  const cartResult = redirectForCartSnapshot(context);
  if (cartResult !== null) return cartResult;
  const session = context.checkout.session();
  if (session?.contact === undefined) {
    return redirectToStep(context.router, 'contact', 'incomplete');
  }
  if (
    session.delivery === undefined ||
    session.payment === undefined ||
    session.billing === undefined
  ) {
    return redirectToStep(context.router, 'delivery', 'incomplete');
  }
  return true;
};

/**
 * Builds a UrlTree pointing at the existing success page so a
 * back-navigation attempt lands the user on the same receipt they
 * already have, instead of re-opening the wizard.
 */
function redirectToSuccess(router: Router, orderId: string): UrlTree {
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
  const router = inject(Router);
  const checkout = inject(CheckoutFacade);
  if (checkout.order() !== null) {
    return true;
  }
  const orderId = route.paramMap.get('orderId');
  if (orderId === null || orderId.length === 0) {
    return redirectToStep(router, 'cart', 'deep-link');
  }
  // Hydration belongs to the success page. The guard matches and the
  // page resolves the receipt through GET.
  return true;
};
