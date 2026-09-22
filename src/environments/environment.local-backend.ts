/**
 * environment.local-backend.ts — the frontend on the real local backend.
 *
 * Replaces environment.ts when the Angular CLI runs the `local-backend`
 * configuration. `production: false` keeps the development build
 * (source maps, no optimisation); `demo: false` keeps the mock worker
 * off, so every `/api/v1` call goes through the dev-server proxy
 * (`proxy.local-backend.conf.json`) to the Spring backend on
 * http://localhost:8080. The plain `npm start` stays on the mock
 * (MIM-214, 2026-09-22).
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
  demo: false,
  apiBase: '/api/v1',
  cartStorageKey: 'mi-bolt.cart',
  ordersStorageKey: 'mi-bolt.orders',
};
