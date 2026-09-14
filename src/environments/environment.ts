/**
 * environment.ts — base environment for production builds.
 *
 * The production build uses this file unmodified; development and e2e
 * configurations swap it out via angular.json fileReplacements. Each
 * environment exports the same shape so consumers can stay typed.
 */

export const environment = {
  production: false,
  demo: false,
  e2e: false,
  apiBase: '/api/v1',
  cartStorageKey: 'mi-bolt.cart',
  ordersStorageKey: 'mi-bolt.orders',
} as const;

export type Environment = typeof environment;
