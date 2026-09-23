import { inject } from '@angular/core';
import { Router, type Routes } from '@angular/router';

import { MarketingLayout } from './layouts/marketing-layout';
import { ShopLayout } from './layouts/shop-layout';

/**
 * Root route table (T11).
 *
 * The four commerce screen families from `docs/spec/screens.md` are
 * mounted behind the three reusable layout shells:
 *
 *   - MarketingLayout: `/` (Home)
 *   - ShopLayout: `/telefonok`, `/telefonok/:slug`, `/kosar`
 *                 (shortcut redirect to the checkout cart), `**`
 *                 (utility 404)
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
        loadComponent: async () => {
          const m = await import('./features/home/home-page');
          return m.HomePage;
        },
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
        loadComponent: async () => {
          const m = await import('./features/catalog/catalog-page');
          return m.CatalogPage;
        },
        title: 'MiBolt — Mobiltelefonok',
      },
      {
        path: ':slug',
        loadComponent: async () => {
          const m = await import('./features/product/product-page');
          return m.ProductPage;
        },
        title: 'MiBolt — Termék',
      },
    ],
  },
  // Shop cart shortcut: `/kosar` is the Hungarian word for "cart" used
  // in the user-facing nav, but the wizard itself lives under the
  // checkout subtree at `/penztar/kosar`. Redirecting here keeps a
  // single source of truth for the cart route while letting visitors
  // hit the cart from the shop chrome. The redirect fires before any
  // component mounts, so the user lands on the CheckoutLayout cart
  // without the ShopLayout ever flashing in between.
  {
    path: 'kosar',
    component: ShopLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        // A string redirect keeps only the query parameters written into
        // it, so a function carries the shopper's own query string and
        // fragment across (for example `?mi-scenario=…`).
        redirectTo: ({ queryParams, fragment }) =>
          inject(Router).createUrlTree(['/penztar/kosar'], {
            queryParams,
            fragment: fragment ?? undefined,
          }),
      },
    ],
  },
  {
    path: 'penztar',
    // The checkout subtree (guards + lazy steps + CheckoutLayout,
    // mounted once per step so its `step` signal input can be a real
    // route `data` binding — FIX-64) lives in
    // `features/checkout/checkout.routes.ts`; mounting it through
    // `loadChildren` is what actually wires `contactGuard`,
    // `deliveryGuard`, `reviewGuard` and `successGuard` — without
    // this indirection the inline `loadComponent`s below would skip
    // every guard and the wizard would not enforce T19 / T24.
    loadChildren: () => import('./features/checkout/checkout.routes').then((m) => m.checkoutRoutes),
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
  // Utility 404 — wrapped in the ShopLayout chrome so the user keeps
  // the standard header/footer when an unknown URL is hit. It matches
  // every path, so it must stay the last element of this array; any
  // route declared after it is unreachable.
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
];
