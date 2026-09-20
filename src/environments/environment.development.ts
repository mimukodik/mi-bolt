/**
 * environment.development.ts — local development (demo mode).
 *
 * Replaces environment.ts when the Angular CLI runs the `development`
 * configuration. `production: false` keeps the gate in bootstrap-demo
 * open so MSW can start.
 */

interface Environment {
  readonly production: boolean;
  readonly demo: boolean;
  readonly apiBase: string;
  readonly cartStorageKey: string;
  readonly ordersStorageKey: string;
}

export const environment: Environment = {
  production: false,
  demo: true,
  apiBase: '/api/v1',
  cartStorageKey: 'mi-bolt.cart',
  ordersStorageKey: 'mi-bolt.orders',
};
