import type { MockSnapshot } from './persistence';

/**
 * Stands in for `./browser` in the storefront and demo-payment production
 * builds (angular.json, `production` configuration, `fileReplacements`), so
 * no MSW code reaches their production dist. Neither `main.ts` calls it
 * there: the storefront starts the mocks only when `environment.production`
 * is false, the payment app only under `isDevMode()`.
 */
export function startMockWorker(_snapshot: MockSnapshot | null = null): Promise<void> {
  return Promise.reject(new Error('The mock backend is not part of the production build.'));
}
