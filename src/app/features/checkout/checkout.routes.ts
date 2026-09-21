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
 *     highlight the current step,
 *   - the per-route `providers` array that wires the real
 *     `CONTACT_DRAFT_SAVER` factory on the `/adatok` step. The
 *     default `providedIn: 'root'` factory in `contact-step.ts`
 *     returns a no-op `{ ok: true }`; the override routes the save
 *     through `CheckoutFacade.updateContact()` so the draft is
 *     persisted through `PATCH /checkout` before navigation.
 *
 * The first route below mounts `PaymentReturnPage` at `path: ''`,
 * because the 2.0.0 mock payment application returns the shopper to
 * `/penztar?paymentIntentId=...` with a full page load, the SPA
 * starts cold, and without this child `/penztar` falls through to
 * the `**` route and lands on the 404 screen.
 *
 * The previous inline definition in `app.routes.ts` has been
 * replaced with a single `loadChildren: () => import(...)` so the
 * four pages ship as a single lazy bundle. The `CheckoutLayout`
 * component still owns the breadcrumb indicator (T11) and the
 * four-step ribbon.
 */

import type { Routes } from '@angular/router';

import { contactGuard, deliveryGuard, reviewGuard, successGuard } from './checkout.guards';

import { CheckoutLayout } from '../../layouts/checkout-layout';

import { CheckoutFacade } from './checkout.facade';

import {
  CONTACT_DRAFT_SAVER,
  type ContactDraftSaver,
  type ContactSubmission,
} from './contact-step';

import { toContactFieldErrors } from './contact-server-errors';

/**
 * Real `ContactDraftSaver` factory. The 2.0.0 `PATCH /checkout`
 * returns the whole session, so `CheckoutFacade.updateContact()`
 * already returns the new session and no merge step is needed
 * client-side. `error.detail` is an English developer diagnostic
 * (openapi.yaml:1490-1493); the page renders the fixed Hungarian
 * banner `'A mentés sikertelen.'` for any non-422 failure and
 * ignores the message, so a leaked detail is harmless — but no
 * component should render it. A 422 carries per-field errors
 * (`CheckoutError.fieldErrors`) the page maps onto the contact
 * form fields (MIM-212).
 */
const contactDraftSaverFactory =
  (facade: CheckoutFacade): ContactDraftSaver =>
  async (submission: ContactSubmission) => {
    const result = await facade.updateContact(submission);
    if (result.ok) return { ok: true };
    return {
      ok: false,
      message: result.error.detail,
      ...(result.error.status === 422
        ? { fieldErrors: toContactFieldErrors(result.error.fieldErrors) }
        : {}),
    };
  };

/**
 * Route table for `/penztar/...`. The parent layout (`CheckoutLayout`)
 * is mounted in `app.routes.ts` so the layout chrome (header, footer
 * suppression, step indicator) wraps every child.
 */
export const checkoutRoutes: Routes = [
  {
    // Payment-return cold start. `PaymentReturnPage` hydrates the
    // cart and the session, reads the payment intent through the
    // facade, then navigates to `/penztar/ellenorzes`. The bare
    // `/penztar` with no query parameter redirects to the cart.
    path: '',
    component: CheckoutLayout,
    data: { step: 'review' },
    children: [
      {
        path: '',
        loadComponent: () => import('./payment-return-page').then((m) => m.PaymentReturnPage),
        title: 'MiBolt — Fizetés eredménye',
      },
    ],
  },
  {
    path: 'kosar',
    component: CheckoutLayout,
    data: { step: 'cart' },
    children: [
      {
        path: '',
        loadComponent: () => import('../cart/cart-page').then((m) => m.CartPage),
        title: 'MiBolt — Kosár',
      },
    ],
  },
  {
    path: 'adatok',
    component: CheckoutLayout,
    data: { step: 'contact' },
    children: [
      {
        path: '',
        canMatch: [contactGuard],
        loadComponent: () => import('./contact-page').then((m) => m.ContactPage),
        // Override the root-provided no-op default with the real
        // facade-backed saver. Lives on the route (not the component)
        // so the binding survives any re-creation of the lazy chunk
        // and so the wizard's other steps do not pick up a Checkout
        // dependency they do not use.
        providers: [
          {
            provide: CONTACT_DRAFT_SAVER,
            useFactory: contactDraftSaverFactory,
            deps: [CheckoutFacade],
          },
        ],
        title: 'MiBolt — Kapcsolattartási adatok',
      },
    ],
  },
  {
    path: 'szallitas',
    component: CheckoutLayout,
    data: { step: 'delivery' },
    children: [
      {
        path: '',
        canMatch: [deliveryGuard],
        loadComponent: () => import('./delivery-page').then((m) => m.DeliveryPage),
        title: 'MiBolt — Átvétel és fizetés',
      },
    ],
  },
  {
    path: 'ellenorzes',
    component: CheckoutLayout,
    data: { step: 'review' },
    children: [
      {
        path: '',
        canMatch: [reviewGuard],
        loadComponent: () => import('./review-page').then((m) => m.ReviewPage),
        title: 'MiBolt — Rendelés ellenőrzése',
      },
    ],
  },
  {
    path: 'siker/:orderId',
    component: CheckoutLayout,
    data: { step: 'success' },
    children: [
      {
        path: '',
        canActivate: [successGuard],
        loadComponent: () => import('./success-step').then((m) => m.SuccessStep),
        title: 'MiBolt — Demórendelés elkészült',
      },
    ],
  },
];

/** Default export so `loadChildren` consumers can use it directly. */
export default checkoutRoutes;
