/**
 * environment.ts — the admin application's production defaults.
 *
 * The file the admin build resolves when no `fileReplacements` entry swaps
 * it out. `production: true` asks for the optimised bundle; `demo: false`
 * keeps the mock worker out of the artefact, so a production build talks to
 * whatever the deployment serves at the API root. The development and
 * local-backend configurations replace this file wholesale
 * (`angular.json`, the admin build's `configurations`).
 */

export interface Environment {
  readonly production: boolean;
  readonly demo: boolean;
}

export const environment: Environment = {
  production: true,
  demo: false,
};
