---
name: mibolt-verification
description: "Choosing and running the right checks for a MiBolt change: which frontend, backend, contract, deploy and tools checks cover which changed paths, the exact mise, npm --prefix frontend and backend/gradlew commands with prerequisites, focused test runs, what each check writes or starts, how CI jobs map to local commands, the coverage floors, and when a real-browser pass is required. Use before committing, when a CI job or local check fails, or when asked how to test something here. Not for writing Playwright specs."
---

# MiBolt verification

Find out which checks a change needs, run them, and read each one's exit
status. Invoke every command from the repository root unless its row says
otherwise. Paths are repository-relative, except output directories that exist
only after a run (`coverage/`, `dist/`, Gradle's `build/`), which are named
relative to the area directory that holds them.

## Scope and hand-offs

This skill covers which CI jobs a set of changed paths triggers and which local
commands mirror them; every check command with where it runs, what it needs and
what it writes or starts; focused runs of one spec or one test class; the
coverage floors and the checks nothing runs automatically; and reproducing a
failed CI job locally.

Everything else goes elsewhere:

- An end-to-end spec to write, repair or plan, or a red `e2e*` run: consult
  `playwright-tests`, and only when e2e is in scope.
- A workflow, path filter or `mise` task to change, or a check to wire in:
  `mibolt-workspace-ops`.
- What an ESLint, Prettier, tsconfig or PMD rule demands and how to satisfy
  it: `mibolt-frontend-code-standards` or `mibolt-backend-code-standards`.
- How tests are written inside an area: `mibolt-shop-frontend`,
  `mibolt-admin-frontend` or `mibolt-commerce-backend`.
- Regenerating the API clients or the catalogue fixture as a step of a change:
  `mibolt-cross-package-changes`. Here `api:drift` is only a check.
- The browser pass itself: the `real-browser-sonnet` agent, per
  `.claude/rules/browser-verification.md`.
- Committing and pushing: `git-commit` and `task-execute-workflow`.

## The checks

### Frontend (`frontend/`)

- **Unit suite.** Vitest through the `@angular/build:unit-test` builder, for
  the five projects with a `test` target: storefront, demo-payment, admin,
  core-api and shop-mocks (`frontend/angular.json:110-127`,
  `frontend/angular.json:209-225`, `frontend/angular.json:359-383`,
  `frontend/angular.json:411-428`, `frontend/angular.json:471-490`). The
  generated `shop-api` library has none. Every target sets `coverage: true` and the same aggregate floor:
  statements 80, branches 75, functions 80, lines 80, `perFile: false`. Each
  project writes its own report inside `frontend/`: `coverage/unit/` for the
  storefront (`frontend/projects/storefront/vitest.config.ts:6`),
  `coverage/<project>/` for the other four.
- **Contract suite.** `test:contract` runs Vitest in Node over
  `tests/**/*.spec.ts` (`frontend/vitest.contract.config.ts:16-22`). `ng test`
  cannot reach `frontend/tests/` (`frontend/vitest.contract.config.ts:8-9`), so
  a change there is proven by this suite alone. It collects no coverage.
- **Lint and format.** `ng lint` runs each project's `lintFilePatterns`; the
  storefront's also take in `tests/**/*.ts`, `e2e/**/*.ts` and
  `playwright.config.ts` (`frontend/angular.json:132-138`). `format:check` is
  `prettier --check .`.
- **Builds.** `build` builds the storefront alone (`frontend/package.json:12`);
  `build:payment` and `build:admin` build the other two apps. `build:check`
  builds the storefront for production and exits 1 on any output line
  matching `WARNING`, `▲ [WARNING]` or an `NGnnnn` code
  (`frontend/scripts/build-check.mjs:28`, `frontend/scripts/build-check.mjs:41`).
- **Dist and boot checks.** The three `check:*-dist` scripts fail when a
  production `dist` holds `setupWorker` or `mockServiceWorker`, which proves no
  MSW code ships. `check:payment-boot` and `check:admin-boot` serve the app with
  `ng serve` on port 4299 and assert that the MSW worker is served at the app's
  base path (`frontend/scripts/check-app-boot.mjs:49`).
- **API client drift.** `api:drift` regenerates both generated clients, then
  fails on any difference or untracked file in their directories
  (`frontend/package.json:32`).
- **End-to-end.** Playwright, with its own floor in
  `frontend/e2e/coverage-thresholds.json` (statements 80, branches 68,
  functions 80, lines 80), armed only when `E2E_COVERAGE_GATE=1`
  (`frontend/playwright.config.ts:90-94`). Running, writing and repairing it
  belong to `playwright-tests`.

### Backend (`backend/`)

One Gradle project, `:services:commerce`. `backend/README.md` ("Tests and
quality gates") says why each gate exists.

- `test` excludes the JUnit tag `integration`, and `integrationTest` runs only
  that tag (`backend/services/commerce/build.gradle:141-158`). A class
  annotated `@IntegrationTest` carries the tag
  (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/IntegrationTest.java:25`).
  Both run on H2 in PostgreSQL mode
  (`backend/services/commerce/src/test/resources/application-test.properties:4`),
  so no test needs the database.
- `check` depends on `integrationTest` and `jacocoTestCoverageVerification`
  (`backend/services/commerce/build.gradle:160-162`,
  `backend/services/commerce/build.gradle:216-218`); the verification joins
  `check` only because it is wired there
  (https://docs.gradle.org/current/userguide/jacoco_plugin.html). The PMD
  plugin makes `check` depend on `pmdMain` and `pmdTest`
  (https://docs.gradle.org/current/userguide/pmd_plugin.html), and `build`
  depends on `check` (https://docs.gradle.org/current/userguide/java_plugin.html).
  So `build` runs the unit and integration tests, PMD and the coverage gate,
  then assembles the jar.
- The coverage floor is a JaCoCo line ratio of 0.90 over the bundle and 0.80
  per class, with the generated `com/example/mi_bolt_backend/api/**` package
  and `MiBoltBackendApplication` excluded
  (`backend/services/commerce/build.gradle:167-170`,
  `backend/services/commerce/build.gradle:186-205`).
- PMD 7.24.0 runs `backend/config/pmd/ruleset.xml`; a missing ruleset fails
  the task instead of passing silently
  (`backend/services/commerce/build.gradle:220-238`).
- `backend/services/commerce/scripts/smoke.sh` is a curl pass against a
  running backend, not a Gradle test.

### Not wired to anything

These exist and work by hand; nothing runs them automatically.

- `fixtures:catalog:check` (`frontend/package.json:34`) exits 1 when
  `frontend/docs/api/fixtures/catalog.json` no longer matches
  `data/catalog/catalog.json`. No workflow and no `mise` task runs it, while
  `frontend/README.md:63` and `frontend/scripts/build-catalog-fixture.mjs:13-16`
  describe it as what CI runs. It is manual-only.
- `frontend/scripts/check-budgets.mjs` checks gzip budgets of 300 KiB initial
  JS, 1 MiB total and 150 KiB per lazy chunk
  (`frontend/scripts/check-budgets.mjs:6-14`) against a production storefront
  build. No npm script, workflow or `mise` task runs it. The budgets every
  production build does enforce are the different ones in
  `frontend/angular.json:37-48` (initial: 500kB warning, 1MB error). It is
  manual-only.
- `claude:hooks:test` and `claude:hooks:typecheck` run only inside
  `mise run verify`. A change under `.claude/hooks/` triggers the CI `tools`
  component (`.github/components.yml:19-23`), whose job runs the typecheck and
  tests of `tools/` and not these two.

## Where to start

Start from the changed-paths script in step 1 below; it reads
`.github/components.yml`, `.github/workflows/ci.yml` and the triggered
workflows live. `mise tasks --all` lists every root and area task, and
`frontend/README.md` ("npm scripts") describes every frontend script. The
canonical examples are the pre-commit gate list at
`.claude/rules/code-standards.md:100-106`, `frontend/mise.toml:8-21` (exactly
what `//frontend:test` and `//frontend:build` run), and
`backend/services/commerce/build.gradle:141-245` (every backend gate).

## From a diff to green checks

1. **List the changed paths and the CI jobs they trigger.**

   ```bash
   uv run --no-project --python 3.12 --with PyYAML==6.0.2 python .claude/skills/mibolt-verification/scripts/checks-for-changed-paths.py
   ```

   Without `--paths` the changed paths are the union of
   `git diff --name-only <base>...HEAD`, `git diff --name-only HEAD` and the
   untracked files, where `--base` defaults to `origin/main`; that ref is only
   as current as the last fetch, and the output says so. `--paths <p> ...`
   checks a hypothetical change instead, each path repository-relative.
   `--json` prints the same data as one object (`changed_paths`,
   `stale_remote_ref_note`, `triggered`, `not_triggered`,
   `frontend_files_for_npx`). It exits 0 on success, including when nothing
   is triggered, and 2 on a usage or parse error, such as
   `path must be repo-relative: <p>` or
   `<ref> not found locally; pass --base <ref>`.

   Per triggered component it prints the workflow, each job with its working
   directory and `needs`, each `run:` line, and the body of every `npm run`
   script those lines call; `[CI-only expression]` marks a line holding
   `${{ }}`. The changed files under `frontend/` come last, re-rooted for the
   two `npx` gate commands. An excerpt of a real run with
   `--paths contracts/commerce/openapi.yaml`, shortened at `…`:

   ```text
   changed paths (1)
     - contracts/commerce/openapi.yaml

   component frontend <- 1 path(s) (first match: contracts/**)
     workflow frontend.yml
     job "lint" (dir frontend, needs none)
       run: npm ci
       run: npm run lint
         package.json script "lint": ng lint
     …
   component contracts <- 1 path(s) (first match: contracts/**)
     workflow contracts.yml
     job "check" (dir ., needs none)
       run: mise -C contracts install
       run: mise -C contracts run check
     …
   not triggered: tools

   frontend files for npx (run from frontend/):
     (none)
   ```

   It shows only what `.github/workflows/ci.yml` selects: not Candidate Build,
   which runs on every pull request, and not the checks under "Not wired to
   anything". The CI mirror reference covers both.

2. **Pick the local checks.** Look the changed paths up in
   [references/command-matrix.md](references/command-matrix.md). The floor is
   the gate list the orchestrator runs before every commit
   (`.claude/rules/code-standards.md:100`). Its frontend build is `build`,
   which builds the storefront alone, so an admin or demo-payment change also
   needs that app's build, dist check and boot check, which CI's `build` job
   runs.

3. **Iterate with focused runs.** They are faster, and the frontend ones write
   no coverage report.
   - One frontend spec, a directory of specs, or the spec beside a source file:

     ```bash
     npm --prefix frontend run test -- storefront --include projects/storefront/src/app/features/cart/cart.facade.spec.ts --no-coverage --no-watch
     ```

     The project name comes first (`ng test [project]`). Give the path as
     seen from `frontend/`: angular.dev calls `include` relative to the
     project root (https://angular.dev/cli/test), and the installed builder
     (22.1.8) resolves it against the project's source root after stripping a
     leading `projects/<name>/src/`. A directory takes every spec inside it; a
     source file takes its sibling spec. Confirm what an `--include` matches
     by adding `--list-tests`, which prints the matched files without building
     or running anything; `--filter <regex>` narrows by suite and test name
     (`npx ng test --help`, from `frontend/`).
     Pass `--no-coverage` because the target turns coverage on for the whole
     project: one spec's run would be measured against the project-wide floor
     and would overwrite that project's report. Pass `--no-watch` because
     watch mode is the default in a terminal (https://angular.dev/cli/test);
     `--no-<option>` sets a boolean to false
     (https://angular.dev/tools/cli#boolean-options).
   - One contract spec: `npm --prefix frontend run test:contract -- sdk-split`
     runs only the files whose path contains `sdk-split`
     (https://vitest.dev/guide/filtering).
   - One backend class:
     `backend/gradlew -p backend :services:commerce:test --tests CartServiceTest`.
     A class annotated `@IntegrationTest` runs only under `integrationTest`:
     `backend/gradlew -p backend :services:commerce:integrationTest --tests CartApiTest`
     (https://docs.gradle.org/current/userguide/java_testing.html). A focused
     Gradle run does not check the coverage floor; only `check` does.

4. **Run the gates before the commit.** Run each as a command of its own and
   wait on its own exit status, never on a log line
   (`.claude/rules/session-lifecycle.md`, "Tools and startup"). By hand in a
   terminal, run the unit suite as `npm --prefix frontend run test -- --no-watch`
   or through `mise run //frontend:test`, which passes `--watch=false`
   (`frontend/mise.toml:9`).

5. **A check is red.** Settle whether the failure is this branch's before
   fixing or dismissing it, and give a bug fix a test seen failing first; both
   rules are under "Rules that apply here".

6. **User-visible change.** Get the browser pass before calling it done
   (`.claude/rules/browser-verification.md`).

7. **A CI job failed.** Read [references/ci-mirror.md](references/ci-mirror.md)
   for the local command that reproduces it.

## Rules that apply here

One line each; the file named is the one that binds.

- The orchestrator runs the pre-commit gate list itself and reads the exit
  codes; a subagent's green report is not a run:
  `.claude/rules/code-standards.md:100`.
- A red check is pre-existing only when the merge-base diff does not list the
  failing file and the working tree does not show it as changed:
  `.claude/rules/code-standards.md:89`.
- Every bug fix ships with a test measured red before and green after, in the
  same commit: `.claude/rules/code-standards.md:74`.
- Coverage is an aggregate floor per project, not a per-line gate, and its
  exclusions live in configuration, never in ignore comments:
  `.claude/rules/code-standards.md:49`, `.claude/rules/code-standards.md:112`.
- Every user-visible change gets a `real-browser-sonnet` pass; servers are the
  orchestrator's: `.claude/rules/browser-verification.md`.
- The coverage report, the generated clients, a dev server's port and the
  database are shared between agents running at once:
  `.claude/rules/parallel-spawns.md` ("What a batch shares").
- Only the `playwright-test-*` agents write end-to-end specs:
  `.claude/rules/code-standards.md:146`.
- How Vitest, Gradle or Playwright behave is read from their documentation,
  not probed: `.claude/rules/framework-facts.md`.

## What a check writes or starts

- **Coverage reports.** Every full unit run overwrites `coverage/<dir>/` in
  `frontend/`, one directory per project, so two runs in one checkout
  overwrite each other's evidence (`.claude/rules/parallel-spawns.md`).
- **Build output and port 4299.** Every build writes `dist/<app>/` in
  `frontend/`. A `check:*-dist` script reads whatever the last build there
  left, so run the matching build first in the same checkout; with no dist at
  all it exits 2 (`frontend/scripts/check-dist-free-of.mjs:19-20`). Both boot
  checks serve on port 4299, one after the other.
- **Generated clients.** `api:drift` and `api:generate` rewrite
  `frontend/projects/shop-api/src/generated/` and
  `frontend/projects/admin/src/app/api/generated/`. A drift failure leaves the
  regenerated files in the tree.
- **Gradle output.** Test reports, `jacoco/*.exec`, PMD reports and the jar go
  to `build/` in `backend/services/commerce/`. The coverage verification reads
  every `*.exec` it finds in `build/jacoco/`
  (`backend/services/commerce/build.gradle:172`).
- **The shared-memory index.** `claude:hooks:test` overwrites the tracked
  `.claude/shared-memory/MEMORY.md` while a case runs and restores it
  afterwards (`.claude/hooks/session-start/hook.test.ts:54-70`).
- **The database.** `smoke.sh` creates carts and orders in whatever backend it
  calls.
- **`mise run verify`** does all of the above. mise runs up to four tasks at
  once, and `depends` sets no order among the tasks it lists
  (https://mise.jdx.dev/tasks/running-tasks.html), so its checks can overlap
  one another in the one checkout.

## Commands

Each row names where the command is defined and carries one or more
side-effect classes:

- **read-only**: writes nothing inside the repository;
- **writes local artefacts**: writes ignored output (`coverage/`, `dist/`,
  Gradle's `build/`, `node_modules/`), which the next run overwrites;
- **rewrites tracked files**: can change tracked files in the tree;
- **starts processes or ports**: starts a server, a container or a listener;
- **needs a missing tool**: needs a tool that no `mise.toml` installs.

### Discovery

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `uv run --no-project --python 3.12 --with PyYAML==6.0.2 python .claude/skills/mibolt-verification/scripts/checks-for-changed-paths.py` | this skill's script | uv on PATH; a git checkout | read-only |
| `mise tasks --all` | mise; lists the tasks of all five `mise.toml` files | mise | read-only |

### Frontend

The npm scripts and `mise` tasks run in `frontend/`. They need
`frontend/node_modules` (installed by `mise run setup`) and the Node version
pinned at `mise.toml:12`.

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `npx eslint <files>`, invoked from `frontend/` | `eslint` in `frontend/package.json:68`; the form is `.claude/rules/code-standards.md:100-104` | — | read-only |
| `npx prettier --check <files>`, invoked from `frontend/` | `prettier` in `frontend/package.json:80`; the form is `.claude/rules/code-standards.md:100-104` | — | read-only |
| `npm --prefix frontend run lint` | `frontend/package.json:28` | — | read-only |
| `npm --prefix frontend run format:check` | `frontend/package.json:30` | — | read-only |
| `mise run //frontend:lint` (both of the above) | `frontend/mise.toml:5-6` | — | read-only |
| `npm --prefix frontend run test -- --no-watch` | `frontend/package.json:22` | — | writes local artefacts |
| `npm --prefix frontend run test -- <project> --include <path> --no-coverage --no-watch` | `frontend/package.json:22` plus builder flags | — | read-only |
| `npm --prefix frontend run test:contract` | `frontend/package.json:23` | — | read-only |
| `mise run //frontend:test` (unit, then contract) | `frontend/mise.toml:8-9` | — | writes local artefacts |
| `npm --prefix frontend run build` | `frontend/package.json:12` | — | writes local artefacts |
| `npm --prefix frontend run build:check` | `frontend/package.json:20` | — | writes local artefacts |
| `npm --prefix frontend run build:payment` | `frontend/package.json:13` | — | writes local artefacts |
| `npm --prefix frontend run build:admin` | `frontend/package.json:14` | — | writes local artefacts |
| `npm --prefix frontend run check:storefront-dist` | `frontend/package.json:18` | the storefront's production build | read-only |
| `npm --prefix frontend run check:payment-dist` | `frontend/package.json:19` | demo-payment's production build | read-only |
| `npm --prefix frontend run check:admin-dist` | `frontend/package.json:17` | the admin's production build | read-only |
| `npm --prefix frontend run check:payment-boot` | `frontend/package.json:15` | port 4299 free | starts processes or ports |
| `npm --prefix frontend run check:admin-boot` | `frontend/package.json:16` | port 4299 free | starts processes or ports |
| `mise run //frontend:build` (all eight build steps, in CI's order) | `frontend/mise.toml:11-21` | port 4299 free | writes local artefacts; starts processes or ports |
| `mise run api:drift` | `mise.toml:80-82`, then `frontend/package.json:32` | — | rewrites tracked files |
| `mise run api:generate`, a change step owned by `mibolt-cross-package-changes` | `mise.toml:76-78` | Java 21 for the backend half | rewrites tracked files; writes local artefacts |
| `npm --prefix frontend run fixtures:catalog:check` (manual only) | `frontend/package.json:34` | — | read-only |
| `node frontend/scripts/check-budgets.mjs` (manual only) | the script; no npm script | the storefront's production build | read-only |

### Backend

Gradle builds `backend/`. It needs Java 21 (`mise.toml:13`) and no database.

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `backend/gradlew -p backend :services:commerce:build` | Gradle build; the form is `.claude/rules/code-standards.md:104-106` | — | writes local artefacts |
| `mise run //backend:build` (`//backend:test` first) | `backend/mise.toml:11-13` | — | writes local artefacts |
| `mise run //backend:test` (`test`, then `integrationTest`) | `backend/mise.toml:8-9` | — | writes local artefacts |
| `backend/gradlew -p backend :services:commerce:test --tests <pattern>` | Gradle `test` task | — | writes local artefacts |
| `backend/gradlew -p backend :services:commerce:integrationTest --tests <pattern>` | `backend/services/commerce/build.gradle:148-158` | — | writes local artefacts |
| `mise run //backend:lint` (PMD, main and test) | `backend/mise.toml:5-6` | — | writes local artefacts |
| `bash backend/services/commerce/scripts/smoke.sh` | the script | a running backend at `BASE`, default `http://localhost:8080/api/v1`; curl; python3 | read-only in the repository; writes to that backend's database |

### Contract, tools, hooks, deploy

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `mise run contracts:check` (vacuum lint, samples, PlantUML; runs in `contracts/`) | `mise.toml:84-86`, then `contracts/mise.toml:14-19` | the tools pinned at `contracts/mise.toml:5-9` | read-only |
| `mise run //tools:lint` (typecheck; runs in `tools/`) | `tools/mise.toml:5-6` | `tools/node_modules` | read-only |
| `mise run //tools:test` (Vitest; runs in `tools/`) | `tools/mise.toml:8-9` | `tools/node_modules` | starts processes or ports: `tools/dev-server/dev-server.test.ts` starts short-lived servers on free ports and stops them |
| `mise run claude:hooks:test` | `mise.toml:92-94` | `.claude/hooks/node_modules` | rewrites tracked files: the shared-memory index, restored after each case |
| `mise run claude:hooks:typecheck` | `mise.toml:96-98` | `.claude/hooks/node_modules` | read-only |
| `mise run deploy:check` (renders and checks the Helm chart) | `mise.toml:100-102` | uv; `helm` on PATH | needs a missing tool |

### Umbrella and setup

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `mise run verify` | `mise.toml:67-74` | everything above | writes local artefacts; rewrites tracked files; starts processes or ports |
| `mise run setup` | `mise.toml:62-65` | network access | writes local artefacts (`node_modules/` of `frontend/`, `tools/` and `.claude/hooks/`); an install is a shared resource per `.claude/rules/parallel-spawns.md` |

### Owned elsewhere

Listed so their classes are known; neither group is this skill's to run.

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `npm --prefix frontend run e2e`, `npm --prefix frontend run e2e:all`, `npm --prefix frontend run e2e:smoke`; owned by `playwright-tests` | `frontend/package.json:24-26` | browsers from `e2e:install` (`frontend/package.json:27`); for `e2e:smoke`, a backend on 8080 | starts processes or ports (4400, or 4410 for smoke; `frontend/playwright.config.ts:11-18`); writes local artefacts |
| `mise run storefront`, `mise run backend`, `mise run stack`, `mise run stop` and the other run modes; the orchestrator's alone | `mise.toml` | Docker for every mode that starts PostgreSQL | starts processes or ports |

## Detailed material

- [references/command-matrix.md](references/command-matrix.md): read when
  choosing the checks for a concrete diff. It maps each kind of changed path
  to the local commands and to the CI components it triggers.
- [references/ci-mirror.md](references/ci-mirror.md): read when a CI job has
  failed, or when a local run has to reproduce one. It maps each job to its
  local mirror, says how closely it mirrors it, and names what CI keeps when
  the job fails.
- In the repository: `frontend/README.md` ("npm scripts", "Tests", "CI"),
  `backend/README.md` ("Tests and quality gates"), and the decisions behind
  the backend gates:
  `backend/docs/decisions/0003-h2-postgresql-mode-for-tests.md`,
  `backend/docs/decisions/0004-contract-validator-jacoco-gate-context-path-and-json-inclusion.md`,
  `backend/docs/decisions/0009-pmd-quickstart-lint-gate.md`,
  `backend/docs/decisions/0013-postgres-smoke-job-in-ci.md`.

## Keep this skill current

Edit this skill in the same change as any change that alters a command, a
class, a floor or a cited line in: the `scripts` of `frontend/package.json` or
`tools/package.json`; any of the five `mise.toml` files; the `test` targets of
`frontend/angular.json`, a project's `vitest.config.ts` or
`frontend/vitest.contract.config.ts`; the test, JaCoCo and PMD blocks of
`backend/services/commerce/build.gradle`; `.github/workflows/*.yml` or
`.github/components.yml`; `frontend/e2e/coverage-thresholds.json`; the headers
of the scripts in `frontend/scripts/` cited above; the two test files cited
for side effects, `.claude/hooks/session-start/hook.test.ts` and
`tools/dev-server/dev-server.test.ts`; or the lines of
`.claude/rules/code-standards.md` cited above. A workflow or `mise` task that
starts running `fixtures:catalog:check`, `check-budgets.mjs` or the hook
checks ends their "Not wired to anything" entry.

The changed-paths script reads the CI files live and needs no edit when a
component or job changes, unless `.github/components.yml` gains a pattern
beyond `**`, `*`, `?` and literals: it then exits 2 with
`unsupported pattern <p> in .github/components.yml` and has to be extended.

Check every path, anchor and command cited here with:

```bash
node .claude/skills/mibolt-project-map/scripts/check-skill-references.mjs .claude/skills/mibolt-verification
```

Add `--show-anchors` to print the current text of every cited line, and read
whether it still says what this skill claims; the script cannot judge that.
