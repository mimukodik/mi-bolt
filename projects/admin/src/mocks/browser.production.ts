/**
 * Stands in for `./browser` in the admin production build (angular.json,
 * `production` configuration, `fileReplacements`), so no MSW code reaches
 * the production dist. `main.ts` never calls it there: its guard starts the
 * mocks only in a non-production demo build.
 */
export function startAdminMocks(): Promise<void> {
  return Promise.reject(new Error('The mock backend is not part of the production build.'));
}
