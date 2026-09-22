/**
 * environment.development.ts — the admin application on mocks.
 *
 * Replaces environment.ts when the Angular CLI runs the `development`
 * configuration, which is the admin build's default: `production: false`
 * keeps source maps and skips optimisation, and `demo: true` is the flag
 * the bootstrap reads before it starts the mock worker (unit F5), so `npm
 * run start:admin` answers every call inside the page and needs no backend.
 */

export interface Environment {
  readonly production: boolean;
  readonly demo: boolean;
}

export const environment: Environment = {
  production: false,
  demo: true,
};
