/**
 * environment.local-backend.ts — the admin application on the real backend.
 *
 * Replaces environment.ts when the Angular CLI runs the `local-backend`
 * configuration. `production: false` keeps the development build (source
 * maps, no optimisation); `demo: false` keeps the mock worker off, so every
 * call goes through the dev-server proxy (`proxy.local-backend.conf.json`)
 * to the Spring backend on http://localhost:8080. The plain `npm run
 * start:admin` stays on the mock (unit F5).
 */

export interface Environment {
  readonly production: boolean;
  readonly demo: boolean;
}

export const environment: Environment = {
  production: false,
  demo: false,
};
