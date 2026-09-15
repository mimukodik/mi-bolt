/**
 * environment.development.ts — local development (demo mode).
 *
 * Replaces environment.ts when the Angular CLI runs the `development`
 * configuration. `production: false` keeps the gate in bootstrap-demo
 * open so MSW can start.
 */

import type { Environment } from './environment';

export const environment: Environment = {
  production: false,
  demo: true,
  e2e: false,
  apiBase: '/api/v1',
  cartStorageKey: 'mi-bolt.cart',
  ordersStorageKey: 'mi-bolt.orders',
};
