/**
 * environment.development.ts — local development (demo mode).
 *
 * Replaces environment.ts when the Angular CLI runs the `development`
 * configuration. The MSW bootstrap in T05 switches on `demo === true`.
 */

export const environment = {
  production: false,
  demo: true,
  e2e: false,
  apiBase: '/api/v1',
  cartStorageKey: 'mi-bolt.cart',
  ordersStorageKey: 'mi-bolt.orders',
} as const;

export type Environment = typeof environment;
