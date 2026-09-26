# Checks per changed path

Read this when choosing the checks for a concrete diff. Run the changed-paths
script from `SKILL.md` first: it says which CI jobs the diff triggers. This
file gives the local side: for each kind of changed path, what to run before
the commit on top of the gate list at `.claude/rules/code-standards.md:100`,
and which CI components the path triggers (`.github/components.yml`). Every
command's working directory, prerequisites and side-effect class are in the
command tables of `SKILL.md`.

Candidate Build (`.github/workflows/candidate.yml`) runs on every pull request
whatever changed, so no row lists it.

## Contents

- [Frontend](#frontend)
- [Contract and catalogue data](#contract-and-catalogue-data)
- [Backend](#backend)
- [Tools, hooks, deploy and root files](#tools-hooks-deploy-and-root-files)
- [Paths no CI component watches](#paths-no-ci-component-watches)

## Frontend

Every path under `frontend/` triggers the `frontend` and `smoke` components.
Anything a person can see or click also needs the browser pass
(`.claude/rules/browser-verification.md`).

| Changed path | Run locally |
|---|---|
| `frontend/projects/storefront/**` | `npx eslint` and `npx prettier --check` on the changed files; the focused spec while iterating; `npm --prefix frontend run test -- --no-watch`; `npm --prefix frontend run build`. |
| `frontend/projects/demo-payment/**` | As for the storefront, plus `npm --prefix frontend run build:payment`, then `npm --prefix frontend run check:payment-dist` and `npm --prefix frontend run check:payment-boot`. The gate list's `build` builds the storefront alone (`frontend/package.json:12`). |
| `frontend/projects/admin/**` | As for the storefront, plus `npm --prefix frontend run build:admin`, then `npm --prefix frontend run check:admin-dist` and `npm --prefix frontend run check:admin-boot`. |
| `frontend/projects/core-api/**` | All three apps import `@mi-bolt/core-api`, so the full unit suite and `mise run //frontend:build`. |
| `frontend/projects/shop-mocks/**` | The full unit suite: the shop-mocks project and the storefront specs that import `@mi-bolt/mocks`. The browser pass when mocked behaviour a user sees changes. |
| `frontend/projects/shop-api/src/generated/`, `frontend/projects/admin/src/app/api/generated/` | Never edited by hand. `mise run api:drift` proves they match the contract. |
| `frontend/tests/**` | `npm --prefix frontend run test:contract`, the only suite that reaches these files. `npm --prefix frontend run lint` lints them through the storefront's lint target (`frontend/angular.json:132-138`). |
| `frontend/e2e/**`, `frontend/playwright.config.ts`, `frontend/specs/**` | Consult `playwright-tests`. `npm --prefix frontend run lint` covers the TypeScript here through the storefront's lint target. |
| `frontend/scripts/**` | The npm script that calls the changed file (`frontend/README.md`, "npm scripts"). `frontend/scripts/proxy-timeout.mjs` is tested by `frontend/tests/scripts/proxy-timeout.spec.ts`, under `test:contract`. |
| `frontend/nginx/**`, `frontend/Dockerfile` | `npm --prefix frontend run test:contract`: the specs in `frontend/tests/web-image/` read `frontend/nginx/default.conf.template` as text. The image itself is exercised only by the stack smoke, which the orchestrator runs. |
| `frontend/eslint.config.mjs` | `npm --prefix frontend run lint`, because a rule change reaches every linted file. |
| `frontend/.prettierrc`, `frontend/.prettierignore` | `npm --prefix frontend run format:check`. |
| `frontend/angular.json`, `frontend/tsconfig*.json`, `frontend/projects/*/vitest.config.ts`, `frontend/vitest.contract.config.ts` | `mise run //frontend:test` and `mise run //frontend:build`. |
| `frontend/package.json`, `frontend/package-lock.json` | The install comes first, and it is a shared resource (`.claude/rules/parallel-spawns.md`, "What a batch shares"). Then `mise run //frontend:lint`, `mise run //frontend:test` and `mise run //frontend:build`. |
| `frontend/docs/**` | Nothing locally: ESLint ignores `docs/**` (`frontend/eslint.config.mjs:102`) and so does `frontend/.prettierignore`. CI still runs both components. |

## Contract and catalogue data

| Changed path | Components | Run locally |
|---|---|---|
| `contracts/commerce/openapi.yaml` | frontend, backend, contracts, smoke | `mise run contracts:check`. Once the clients are regenerated (`mibolt-cross-package-changes`), `mise run api:drift`. `npm --prefix frontend run test:contract` and the full unit suite. `backend/gradlew -p backend :services:commerce:build`, which regenerates the server interfaces before compiling (`backend/services/commerce/build.gradle:137-139`). |
| `contracts/commerce/samples/**`, `contracts/commerce/sequences/**`, `contracts/commerce/kommunikacio.md`, `contracts/check-samples.sh`, `contracts/mise.toml` | frontend, backend, contracts, smoke | `mise run contracts:check`. Every path under `contracts/` triggers all four components. |
| `data/catalog/**` | frontend, backend, smoke | `npm --prefix frontend run fixtures:catalog:check`, which nothing else runs and which fails until the fixture is regenerated (`mibolt-cross-package-changes`). The full unit suite, and `backend/gradlew -p backend :services:commerce:build`. |

## Backend

Every path under `backend/` triggers the `backend` and `smoke` components.

| Changed path | Run locally |
|---|---|
| `backend/services/commerce/src/**/*.java` | A focused `test` or `integrationTest` run with `--tests` while iterating; then `backend/gradlew -p backend :services:commerce:build`. |
| `backend/services/commerce/src/main/resources/db/**` | `backend/gradlew -p backend :services:commerce:build`: the integration tests run the same Liquibase changelog on H2 (`backend/services/commerce/src/test/resources/application-test.properties:1-3`). Only CI's `postgres-smoke` job and the stack smoke start the app on real PostgreSQL; locally the nearest is the orchestrator's `mise run backend`, then `bash backend/services/commerce/scripts/smoke.sh`. `mibolt-commerce-backend` owns the changelog rules. |
| `backend/services/commerce/src/main/resources/application.properties` | `backend/gradlew -p backend :services:commerce:build`; for a runtime setting, `bash backend/services/commerce/scripts/smoke.sh` against a backend the orchestrator started. |
| `backend/config/pmd/ruleset.xml` | `mise run //backend:lint`. |
| `backend/services/commerce/build.gradle`, `backend/settings.gradle`, `backend/gradle/wrapper/**` | `backend/gradlew -p backend :services:commerce:build`. |
| `backend/services/commerce/scripts/smoke.sh` | `bash backend/services/commerce/scripts/smoke.sh` against a backend the orchestrator started. |
| `backend/services/commerce/Dockerfile` | The container modes, which the orchestrator runs (`mise run stack`). |

## Tools, hooks, deploy and root files

| Changed path | Components | Run locally |
|---|---|---|
| `tools/**` | tools | `mise run //tools:lint` and `mise run //tools:test`. |
| `.claude/hooks/**` | tools, whose job runs neither hook check | `mise run claude:hooks:test` and `mise run claude:hooks:typecheck`. |
| `deploy/helm/**` | smoke | `mise run deploy:check`, which needs `helm` on PATH. |
| `deploy/compose.yaml`, `deploy/compose.sh`, `deploy/.env.example` | smoke | The stack smoke, run by the orchestrator: `mise run stack`, then `E2E_BASE_URL=http://localhost:4200 npm --prefix frontend run e2e:smoke`, then `mise run stop`. The smoke specs belong to `playwright-tests`. |
| `deploy/candidate/**`, `deploy/tests/**` | smoke | The lines Candidate Build runs (`.github/workflows/candidate.yml:32-40`); `mibolt-workspace-ops` owns them. |
| `mise.toml` | frontend, backend, tools, smoke | `mise tasks --all`, then the tasks that changed; `mibolt-workspace-ops` owns the task graph. |
| `.github/**` | frontend, backend, tools, smoke | No local runner. Rerun the changed-paths script to see what a changed workflow now runs; `mibolt-workspace-ops` owns the workflows. |

## Paths no CI component watches

A path that matches none of the globs in `.github/components.yml` triggers no
component: for example `docs/**`, the root `README.md` and `CLAUDE.md`, and
`.claude/**` outside `.claude/hooks/`. Measured with the changed-paths script
on `.claude/skills/mibolt-verification/SKILL.md`, `docs/monorepo.md` and
`README.md`: it printed `not triggered: frontend, backend, contracts, tools, smoke`.
Candidate Build still runs.
