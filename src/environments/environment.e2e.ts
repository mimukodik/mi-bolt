/**
 * environment.e2e.ts — end-to-end test configuration.
 *
 * Replaces environment.ts when the Angular CLI runs the `e2e`
 * configuration. MSW starts and reads the scenario from
 * `?mi-scenario=`.
 */

interface Environment {
  readonly production: boolean;
  readonly demo: boolean;
  readonly e2e: boolean;
  readonly apiBase: string;
  readonly cartStorageKey: string;
  readonly ordersStorageKey: string;
}

export const environment: Environment = {
  production: false,
  demo: false,
  e2e: true,
  apiBase: '/api/v1',
  cartStorageKey: 'mi-bolt.cart',
  ordersStorageKey: 'mi-bolt.orders',
};