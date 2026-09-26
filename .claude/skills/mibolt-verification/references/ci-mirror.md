# CI jobs and their local mirrors

Read this when a CI job has failed, or when a local run has to reproduce one.
The changed-paths script from `SKILL.md` prints each triggered job's `run:`
lines live, so they are not repeated here. This file adds what the workflows
do not say: the local command that mirrors each job, how closely it mirrors
it, and what CI keeps when the job fails. Working directory, prerequisites
and side-effect class of every command are in this skill's commands
reference.

## Contents

- [How a CI run is selected](#how-a-ci-run-is-selected)
- [Frontend](#frontend)
- [Backend](#backend)
- [Contracts, tools and the stack smoke](#contracts-tools-and-the-stack-smoke)
- [Workflows outside ci.yml](#workflows-outside-ciyml)
- [Checks CI never runs](#checks-ci-never-runs)

## How a CI run is selected

- `.github/workflows/ci.yml` runs on every pull request and every push to
  `main`. Its `changes` job matches the changed paths against
  `.github/components.yml` with `dorny/paths-filter`
  (`.github/workflows/ci.yml:31-34`) and calls one reusable workflow per
  matched component (`.github/workflows/ci.yml:36-59`). The changed-paths
  script reproduces that selection.
- `ci-ok` (`.github/workflows/ci.yml:61-81`) fails when any job it needs ended
  with a result other than `success` or `skipped`. It never holds the cause:
  find the other red job in the same run.

## Frontend

`.github/workflows/frontend.yml`. Every job runs in `frontend/` after `npm ci`.

| CI job | Local mirror | How close |
|---|---|---|
| `lint` | `mise run //frontend:lint` | The same two scripts. |
| `unit-tests` | `mise run //frontend:test` | The same two scripts; locally `--watch=false` is passed explicitly. The five coverage-summary steps (`.github/workflows/frontend.yml:66-85`) only print tables into the run summary; locally the `text` coverage reporter prints the same figures (`frontend/angular.json:125`). CI keeps the reports as the `coverage-unit` artifact. |
| `build` | `mise run //frontend:build` | The same eight scripts in the same order (`frontend/mise.toml:11-21`, `.github/workflows/frontend.yml:122-134`). |
| `api-drift` | `mise run api:drift` | The same script. A local failure leaves the regenerated files in the tree. |
| `e2e` | owned by `playwright-tests` | CI runs three full-HD cells: Chromium with the `seed` project and the coverage gate, Firefox and WebKit ungated (`.github/workflows/frontend.yml:168-188`), each against development builds. `npm --prefix frontend run e2e` runs a different set: `seed`, `integration-chromium-fullhd` and `integration-chromium-mobile`, gated (`frontend/package.json:24`). CI keeps traces and coverage as `playwright-e2e-<project>`. |
| `e2e-report` | none | Merges the cells' blob reports into the `playwright-e2e-report` artifact. |

## Backend

`.github/workflows/backend.yml`. The jobs run in `backend/`; `postgres-smoke`
runs in `backend/services/commerce/`. The local report paths below are inside
`backend/services/commerce/`.

| CI job | Local mirror | How close |
|---|---|---|
| `unit-tests` | `backend/gradlew -p backend :services:commerce:test` | The same task. On failure CI keeps `unit-test-reports`; locally they are in `build/reports/tests/test/`. |
| `integration-tests` | `backend/gradlew -p backend :services:commerce:integrationTest` | The same task. On failure CI keeps `integration-test-reports`; locally `build/reports/tests/integrationTest/`. |
| `lint` | `mise run //backend:lint` | The same two PMD tasks. On failure CI keeps `pmd-reports`; locally `build/reports/pmd/`. |
| `coverage-gate` | `backend/gradlew -p backend :services:commerce:build` | CI runs `build` with the tests excluded, on the two `.exec` files the test jobs uploaded (`.github/workflows/backend.yml:152-164`); locally `build` runs the tests and the gate in one command. On failure CI keeps `coverage-report`; locally `build/reports/jacoco/`. |
| `postgres-smoke` | no single command | CI boots the jar on an empty `postgres:16` service and runs `scripts/smoke.sh`, with `MIBOLT_ADMIN_INITIAL_PASSWORD` set for the whole job (`.github/workflows/backend.yml:175-249`), so the application and the script both see it. The nearest local run is the orchestrator's `mise run backend`, then `bash backend/services/commerce/scripts/smoke.sh`; the script's admin section runs only when that variable is set in its environment (`backend/services/commerce/scripts/smoke.sh:103-104`). On failure CI keeps `postgres-smoke-app-log`. |

## Contracts, tools and the stack smoke

| CI job | Local mirror | How close |
|---|---|---|
| `contracts.yml` `check` | `mise run contracts:check` | The same task. CI installs the tools pinned in `contracts/mise.toml` first (`.github/workflows/contracts.yml:22-23`). |
| `tools.yml` `check` | `mise run //tools:lint`, then `mise run //tools:test` | The same two scripts in `tools/`. Neither runs the `.claude/hooks/` checks, although a change there triggers this job. |
| `smoke.yml` `smoke` | the orchestrator's alone | CI builds the whole stack from the commit under a compose project and volume of its own, checks readiness through the web container, runs `npm run e2e:smoke` against `E2E_BASE_URL=http://localhost:4200`, and removes everything with `down -v` (`.github/workflows/smoke.yml:19-28`, `.github/workflows/smoke.yml:40-67`, `.github/workflows/smoke.yml:100-103`). Locally: `mise run stack`, then `E2E_BASE_URL=http://localhost:4200 npm --prefix frontend run e2e:smoke`, then `mise run stop`, which keeps the database volume (`mise.toml:58-60`). The smoke specs belong to `playwright-tests`. |

## Workflows outside ci.yml

The changed-paths script does not list these.

- **Candidate Build** (`.github/workflows/candidate.yml`) runs on every pull
  request and every push to `main`, with no path filter. It runs the Python
  tests under `deploy/tests/` and the chart check
  (`.github/workflows/candidate.yml:32-40`), then builds both images. Locally
  `mise run deploy:check` runs the chart check alone and needs `helm`, which
  CI installs (`.github/workflows/candidate.yml:29-31`) and no `mise.toml`
  does. The other test lines, and everything else about this workflow, belong
  to `mibolt-workspace-ops`.
- **Publish Candidate, Preview Smoke, Stable Smoke and Deactivate Bolt Preview
  Deployment** (`.github/workflows/publish-candidate.yml`,
  `.github/workflows/preview-smoke.yml`, `.github/workflows/stable-smoke.yml`,
  `.github/workflows/close-bolt-preview.yml`) run after other workflows, on a
  schedule, by hand (`workflow_dispatch`) or on pull-request events. None has
  a local mirror;
  `mibolt-workspace-ops` owns them.

## Checks CI never runs

- `mise run claude:hooks:test` and `mise run claude:hooks:typecheck` run only
  inside `mise run verify`.
- `npm --prefix frontend run fixtures:catalog:check` and
  `node frontend/scripts/check-budgets.mjs` are manual-only; see "Not wired to
  anything" in `SKILL.md`.
