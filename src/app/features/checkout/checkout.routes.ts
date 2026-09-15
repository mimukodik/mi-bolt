/**
 * T19 — child routes under `/penztar`.
 *
 * The five wizard steps each get their own lazy chunk; the page
 * components themselves live in their respective feature folders
 * (cart-page.ts, contact-page.ts, ...). This file owns:
 *
 *   - the `path → loadComponent` mapping,
 *   - the route guards (`contactGuard`, `deliveryGuard`,
 *     `reviewGuard`, `successGuard`),
 *   - the page title shown in the document tab,
 *   - the static `step` value the layout indicator uses to
 *     highlight the current step.
 *
 * The previous inline definition in `app.routes.ts` has been
 * replaced with a single `loadChildren: () => import(...)` so the
 * four pages ship as a single lazy bundle. The `CheckoutLayout`
 * component still owns the breadcrumb indicator (T11) and the
 * four-step ribbon.
 */

import type { Routes } from '@angular/router';

import {
  contactGuard,
  deliveryGuard,
  reviewGuard,
  successGuard,
} from './checkout.guards';

/**
 * Route table for `/penztar/...`. The parent layout (`CheckoutLayout`)
 * is mounted in `app.routes.ts` so the layout chrome (header, footer
 * suppression, step indicator) wraps every child.
 */
export const checkoutRoutes: Routes = [
  {
    path: 'kosar',
    loadComponent: () => import('../cart/cart-page').then((m) => m.CartPage),
    title: 'MiBolt — Kosár',
    data: { step: 'cart' },
  },
  {
    path: 'adatok',
    canMatch: [contactGuard],
    loadComponent: () =>
      import('./contact-page').then((m) => m.ContactPage),
    title: 'MiBolt — Kapcsolattartási adatok',
    data: { step: 'contact' },
  },
  {
    path: 'szallitas',
    canMatch: [deliveryGuard],
    loadComponent: () =>
      import('./delivery-page').then((m) => m.DeliveryPage),
    title: 'MiBolt — Szállítás és fizetés',
    data: { step: 'delivery' },
  },
  {
    path: 'ellenorzes',
    canMatch: [reviewGuard],
    loadComponent: () =>
      import('./review-page').then((m) => m.ReviewPage),
    title: 'MiBolt — Rendelés ellenőrzése',
    data: { step: 'review' },
  },
  {
    path: 'siker/:orderId',
    canActivate: [successGuard],
    loadComponent: () =>
      import('./success-step').then((m) => m.SuccessStep),
    title: 'MiBolt — Demórendelés elkészült',
    data: { step: 'success' },
  },
];

/** Default export so `loadChildren` consumers can use it directly. */
export default checkoutRoutes;