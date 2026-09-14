import type { Routes } from '@angular/router';

import { MarketingLayout } from './layouts/marketing-layout';
import { ShopLayout } from './layouts/shop-layout';
import { CheckoutLayout } from './layouts/checkout-layout';

/**
 * Root route table (T11).
 *
 * The four commerce screen families from `docs/spec/screens.md` are
 * mounted behind the three reusable layout shells:
 *
 *   - MarketingLayout: `/` (Home)
 *   - ShopLayout: `/telefonok`, `/telefonok/:slug`, `**` (utility 404)
 *   - CheckoutLayout: `/penztar/kosar`, `/penztar/adatok`,
 *                     `/penztar/szallitas`, `/penztar/ellenorzes`,
 *                     `/penztar/siker/:orderId`
 *
 * Every page is loaded with `loadComponent` so each route ships as its
 * own lazy chunk. The title updates automatically through the Router's
 * `title` data — Angular writes it to `document.title` after every
 * NavigationEnd, which is the T11-AC03 "Route title updates via Title
 * service" requirement.
 *
 * The internal showcase route `/primitives` (T10 design) and the
 * coverage canary `/canary` (T02 gate) remain in the table.
 */
export const routes: Routes = [
  {
    path: '',
    component: MarketingLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./home/home-page').then((m) => m.HomePage),
        title: 'MiBolt — Kezdőlap',
      },
    ],
  },
  {
    path: 'telefonok',
    component: ShopLayout,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/catalog/catalog-page').then((m) => m.CatalogPage),
        title: 'MiBolt — Mobiltelefonok',
      },
      {
        path: ':slug',
        loadComponent: () =>
          import('./features/product/product-page').then((m) => m.ProductPage),
        title: 'MiBolt — Termék',
      },
    ],
  },
  {
    path: 'penztar',
    component: CheckoutLayout,
    children: [
      {
        path: 'kosar',
        loadComponent: () => import('./features/cart/cart-page').then((m) => m.CartPage),
        title: 'MiBolt — Kosár',
        data: { step: 'cart' },
      },
      {
        path: 'adatok',
        loadComponent: () =>
          import('./features/checkout/contact-page').then((m) => m.ContactPage),
        title: 'MiBolt — Kapcsolattartási adatok',
        data: { step: 'contact' },
      },
      {
        path: 'szallitas',
        loadComponent: () =>
          import('./features/checkout/delivery-page').then((m) => m.DeliveryPage),
        title: 'MiBolt — Szállítás és fizetés',
        data: { step: 'delivery' },
      },
      {
        path: 'ellenorzes',
        loadComponent: () =>
          import('./features/checkout/review-page').then((m) => m.ReviewPage),
        title: 'MiBolt — Rendelés ellenőrzése',
        data: { step: 'review' },
      },
      {
        path: 'siker/:orderId',
        loadComponent: () =>
          import('./features/checkout/success-page').then((m) => m.SuccessPage),
        title: 'MiBolt — Demórendelés elkészült',
        data: { step: 'success' },
      },
    ],
  },
  // Utility 404 — wrapped in the ShopLayout chrome so the user keeps
  // the standard header/footer when an unknown URL is hit.
  {
    path: '**',
    component: ShopLayout,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
        title: 'MiBolt — Az oldal nem található',
      },
    ],
  },
  // Internal routes ------------------------------------------------------
  {
    path: 'primitives',
    loadComponent: () =>
      import('./features/primitives-showcase/primitives-showcase').then(
        (m) => m.PrimitivesShowcase,
      ),
    title: 'MiBolt — UI primitives',
  },
  {
    path: 'canary',
    loadComponent: () =>
      import('./coverage-canary/canary-page').then((m) => m.CoverageCanaryPage),
    title: 'MiBolt — coverage canary',
  },
];
