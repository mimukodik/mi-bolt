/**
 * environment.ts — production environment.
 *
 * This is the base environment that ships in the production build.
 * The development configuration replaces it via the fileReplacements
 * in angular.json. The production build has
 * `production: true, demo: false`, so the MSW bootstrap
 * short-circuits, and the production dist carries no MSW at all: the
 * production configuration's `fileReplacements` swap
 * `projects/shop-mocks/src/browser.ts` for `browser.production.ts`, and the base
 * `assets` pattern ignores `mockServiceWorker.js`
 * (`npm run check:storefront-dist`).
 *
 * `environment.production` is the single source of truth: do not
 * branch on `environment.demo` for production decisions.
 */

export interface Environment {
  readonly production: boolean;
  readonly demo: boolean;
  readonly apiBase: string;
  readonly cartStorageKey: string;
  readonly ordersStorageKey: string;
}

export const environment: Environment = {
  production: true,
  demo: false,
  apiBase: '/api/v1',
  cartStorageKey: 'mi-bolt.cart',
  ordersStorageKey: 'mi-bolt.orders',
};
