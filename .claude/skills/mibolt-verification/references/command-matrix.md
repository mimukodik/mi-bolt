# Checks per changed path

Read this when choosing the checks for a concrete diff. Run the changed-paths
script from `SKILL.md` first: it says which CI jobs the diff triggers. This
file gives the local side: for each kind of changed path, what to run before
the commit on top of the gate list in `SKILL.md` ("Gates before a commit"),
and which CI components the path triggers (`.github/components.yml`). Every
command's working directory, prerequisites and side-effect class are in this
skill's commands reference.

Candidate Build (`.github/workflows/candidate.yml`) runs on every pull request
whatever changed, so no row lists it.

## Contents

- [Frontend](#frontend)
- [Contract and catalogue data](#contract-and-catalogue-data)
- [Backend](#backend)
- [Tools, deploy and root files](#tools-deploy-and-root-files)
- [Paths no CI component watches](#paths-no-ci-component-watches)

## Frontend

Every path under `frontend/` triggers the `frontend` and `smoke` components.
Anything a person can see or click also needs the browser pass (`SKILL.md`,
"Browser pass").

| Changed path | Run locally |
|---|---|
| `frontend/projects/storefront/**` | `npx eslint` and `npx prettier --check`, each on the files the changed-paths script lists for it; the focused spec while iterating; `npm --prefix frontend run test -- --no-watch`; `npm --prefix frontend run build`. |
| `frontend/projects/demo-payment/**` | As for the storefront, plus `npm --prefix frontend run build:payment`, then `npm --prefix frontend run check:payment-dist` and `npm --prefix frontend run check:payment-boot`. The gate list's `build` builds the storefront alone (`frontend/package.json:12`). |
| `frontend/projects/admin/**` | As for the storefront, plus `npm --prefix frontend run build:admin`, then `npm --prefix frontend run check:admin-dist` and `npm --prefix frontend run check:admin-boot`. |
| `frontend/projects/core-api/**` | All three apps import `@mi-bolt/core-api`, so the full unit suite and `mise run //frontend:build`. `npm --prefix frontend run test:contract` as well: two contract specs import `demo-session.interceptor` from it (`frontend/tests/contract/operation-matrix.spec.ts:71`, `frontend/tests/contract/sdk-transport.spec.ts:44`). |
| `frontend/projects/shop-mocks/**` | The full unit suite: the shop-mocks project and the storefront specs that import `@mi-bolt/mocks`. `npm --prefix frontend run test:contract`, whose specs import the shop-mocks handlers (`frontend/tests/contract/operation-matrix.spec.ts:39-56`). The storefront and demo-payment bootstraps import shop-mocks too (`frontend/projects/storefront/src/core/bootstrap-demo.ts:22`, `frontend/projects/demo-payment/src/main.ts:38`), so `mise run //frontend:build` as well: its dist checks prove no MSW code reaches a production build, and its boot checks serve the worker. The browser pass when mocked behaviour a user sees changes. |
| `frontend/projects/shop-api/src/generated/`, `frontend/projects/admin/src/app/api/generated/`, `frontend/ng-openapi-gen.json`, `frontend/ng-openapi-gen.admin.json` | The generated trees are never edited by hand; regenerating them belongs to `mibolt-cross-package-changes`. `mise run api:drift` proves they match the contract. Then the full unit suite and `npm --prefix frontend run test:contract`, whose specs import both clients (`frontend/tests/contract/operation-matrix.spec.ts:32-35`, `frontend/tests/contract/sdk-split.spec.ts:29-30`). |
| `frontend/tests/**` | `npm --prefix frontend run test:contract`, the only suite that runs the specs here. `frontend/tests/setup-msw.ts` and `frontend/tests/msw-server.ts` also run under the unit suite, so a change to either also needs `npm --prefix frontend run test -- --no-watch`. `npm --prefix frontend run lint` lints the TypeScript here through the storefront's lint target (`frontend/angular.json:132-138`). |
| `frontend/e2e/**`, `frontend/playwright.config.ts`, `frontend/specs/**` | The end-to-end suite itself is outside this skill. `npm --prefix frontend run lint` covers the TypeScript here through the storefront's lint target. |
| `frontend/scripts/**` | The npm script that calls the changed file (`frontend/README.md`, "npm scripts"). `frontend/scripts/proxy-timeout.mjs` is tested by `frontend/tests/scripts/proxy-timeout.spec.ts`, under `test:contract`. `frontend/scripts/build-check.mjs` classifies a saved log without building: `node frontend/scripts/build-check.mjs --input frontend/scripts/fixtures/build-warn.log` exits 1 on that log's three warning lines, and the same command on `frontend/scripts/fixtures/build-clean.log` exits 0 (`frontend/scripts/build-check.mjs:103-106`, `frontend/scripts/build-check.mjs:128-131`). `node frontend/scripts/coverage-summary.mjs <summary> [<heading>]` prints the table CI appends to the run summary, where `<summary>` is the `coverage-summary.json` a full unit run leaves in `frontend/`, under `coverage/unit/` for the storefront and `coverage/<project>/` for the others; it exits 0 whatever it finds, a missing or unparseable file included (`frontend/scripts/coverage-summary.mjs:11-43`). |
| `frontend/nginx/**`, `frontend/Dockerfile` | `npm --prefix frontend run test:contract`: the specs in `frontend/tests/web-image/` read `frontend/Dockerfile` and the files under `frontend/nginx/` as text (`frontend/tests/web-image/nginx-robots.spec.ts:13-14`, `frontend/tests/web-image/nginx-api-gzip.spec.ts:19`). The image itself is exercised only by the stack smoke (`deploy/compose.yaml` row below). |
| `frontend/eslint.config.mjs` | `npm --prefix frontend run lint`, because a rule change reaches every linted file. |
| `frontend/.prettierrc`, `frontend/.prettierignore` | `npm --prefix frontend run format:check`. |
| `frontend/angular.json`, `frontend/tsconfig*.json`, `frontend/projects/*/vitest.config.ts`, `frontend/vitest.contract.config.ts` | `mise run //frontend:test` and `mise run //frontend:build`. |
| `frontend/package.json`, `frontend/package-lock.json` | The install comes first. Then `mise run //frontend:lint`, `mise run //frontend:test` and `mise run //frontend:build`. |
| `frontend/docs/api/fixtures/catalog.json` | Generated by `npm --prefix frontend run fixtures:catalog`, never edited by hand; regenerating it belongs to `mibolt-cross-package-changes`. `npm --prefix frontend run fixtures:catalog:check`, then the full unit suite and `npm --prefix frontend run test:contract`: `frontend/projects/shop-mocks/src/browser.ts:32` and the shop-mocks specs import it, and so do the contract specs (`frontend/tests/contract/operation-matrix.spec.ts:76`, `frontend/tests/contract/schema.spec.ts:26`). The browser pass when catalogue data a user sees changes. |
| any other path under `frontend/docs/` | Nothing locally: ESLint ignores `docs/**` (`frontend/eslint.config.mjs:102`) and so does `frontend/.prettierignore`. CI still runs both components. |

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
| `backend/services/commerce/src/main/resources/db/**` | `backend/gradlew -p backend :services:commerce:build`: the integration tests run the same Liquibase changelog on H2 (`backend/services/commerce/src/test/resources/application-test.properties:1-3`). Only CI's `postgres-smoke` job and the stack smoke start the app on real PostgreSQL; locally the nearest is `mise run backend`, then `bash backend/services/commerce/scripts/smoke.sh`. `mibolt-commerce-backend` owns the changelog rules. |
| `backend/services/commerce/src/main/resources/application.properties` | `backend/gradlew -p backend :services:commerce:build`; for a runtime setting, `bash backend/services/commerce/scripts/smoke.sh` against a running backend (`mise run backend`). |
| `backend/config/pmd/ruleset.xml` | `mise run //backend:lint`. |
| `backend/services/commerce/build.gradle`, `backend/settings.gradle`, `backend/gradle/wrapper/**` | `backend/gradlew -p backend :services:commerce:build`. |
| `backend/services/commerce/scripts/smoke.sh` | `bash backend/services/commerce/scripts/smoke.sh` against a running backend (`mise run backend`). |
| `backend/services/commerce/Dockerfile` | The container modes: `mise run backend:docker` or `mise run stack`, which build the image. |

## Tools, deploy and root files

| Changed path | Components | Run locally |
|---|---|---|
| `tools/**` | tools | `mise run //tools:lint` and `mise run //tools:test`. |
| `deploy/helm/**` | smoke | `mise run deploy:check`, which needs `helm` on PATH. |
| `deploy/compose.yaml`, `deploy/compose.sh`, `deploy/.env.example` | smoke | The stack smoke: `mise run stack`, then `E2E_BASE_URL=http://localhost:4200 npm --prefix frontend run e2e:smoke`, then `mise run stop`. |
| `deploy/candidate/**`, `deploy/tests/**` | smoke | The lines Candidate Build runs (`.github/workflows/candidate.yml:32-40`); `mibolt-workspace-ops` owns them. |
| `mise.toml` | frontend, backend, tools, smoke | `mise tasks --all`, then the tasks that changed; `mibolt-workspace-ops` owns the task graph. |
| `.github/**` | frontend, backend, tools, smoke | No local runner. Rerun the changed-paths script to see what a changed workflow now runs; `mibolt-workspace-ops` owns the workflows. |

## Paths no CI component watches

A path that matches none of the globs in `.github/components.yml` triggers no
component: for example `docs/**` and the root `README.md`. Measured with the
changed-paths script on `docs/monorepo.md` and `README.md`: it printed
`not triggered: frontend, backend, contracts, tools, smoke`.
Candidate Build still runs.
