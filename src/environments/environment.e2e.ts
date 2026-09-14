/**
 * environment.e2e.ts — end-to-end test configuration.
 *
 * Replaces environment.ts when the Angular CLI runs the `e2e`
 * configuration. The MSW handler enables deterministic scenarios
 * used by Playwright specs.
 */

export const environment = {
  production: false,
  demo: false,
  e2e: true,
  apiBase: '/api/v1',
  cartStorageKey: 'mi-bolt.cart',
  ordersStorageKey: 'mi-bolt.orders',
} as const;

export type Environment = typeof environment;
