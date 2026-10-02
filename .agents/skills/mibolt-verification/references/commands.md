# Commands

Read this before running a command you have not run in this checkout. Each
row names where the command is defined, what it needs beyond the checkout,
and one or more side-effect classes. Invoke every command from the repository
root unless its row says otherwise. Which commands a given diff needs is in
this skill's command matrix reference, and the outputs these commands share
are described under "What a check writes or starts" below.

## Contents

- [Side-effect classes](#side-effect-classes)
- [What a check writes or starts](#what-a-check-writes-or-starts)
- [Discovery](#discovery)
- [The changed-paths script](#the-changed-paths-script)
- [The gate-output summarizer](#the-gate-output-summarizer)
- [Frontend](#frontend)
- [Backend](#backend)
- [Contract, tools, deploy](#contract-tools-deploy)
- [Umbrella and setup](#umbrella-and-setup)
- [End-to-end and run modes](#end-to-end-and-run-modes)

## Side-effect classes

- **read-only**: writes no tracked file and no output a later check reads; a
  tool's own cache, such as the results cache Vitest keeps under
  `node_modules/.vite/vitest/`, does not count;
- **writes local artefacts**: writes ignored output (`coverage/`, `dist/`,
  Gradle's `build/`, `node_modules/`), which the next run overwrites;
- **rewrites tracked files**: can change tracked files in the tree;
- **starts processes or ports**: starts a server, a container or a listener;
- **needs a missing tool**: needs a tool that no `mise.toml` installs.

## What a check writes or starts

- **Coverage reports.** `npm --prefix frontend run test` with no project name
  runs all five projects (https://angular.dev/cli/test) and rewrites all five
  reports in `frontend/`: `coverage/unit/` for the storefront and
  `coverage/<project>/` for the other four, whichever project the change
  touched. A later run in the same checkout overwrites them, so after runs in
  sequence they are the last run's; runs that overlap can leave a mix of both.
- **Build output and port 4299.** Every build writes `dist/<app>/` in
  `frontend/`. A `check:*-dist` script reads whatever the last build there
  left, so run the matching build first in the same checkout; with no dist at
  all it exits 2 (`frontend/scripts/check-dist-free-of.mjs`,
  "so a missing build can never pass"). Both boot
  checks serve on port 4299, one after the other.
- **Generated clients.** `api:drift` and `api:generate` rewrite
  `frontend/projects/shop-api/src/generated/` and
  `frontend/projects/admin/src/app/api/generated/`. A drift failure leaves the
  regenerated files in the tree.
- **Gradle output.** Test reports, `jacoco/*.exec`, PMD reports and the jar go
  to `build/` in `backend/services/commerce/`. The coverage verification reads
  every `*.exec` it finds in `build/jacoco/`
  (`backend/services/commerce/build.gradle`, "def jacocoExecFiles").
- **The database.** `smoke.sh` creates carts and orders in whatever backend it
  calls.
- **`mise run verify`** writes the coverage reports, the build output, the
  generated clients and the Gradle output above, and binds port 4299; it runs
  neither `smoke.sh` nor `mise run deploy:check` (`mise.toml`, "[tasks.verify]"). It can
  also leave a tracked file outside the change modified, so read
  `git status --short` after it. It runs its checks one after another,
  `contracts:check` first and then the rest in its `run` list in order, and
  stops at the first that fails, so they do not overlap one another in the
  one checkout; with mise's `--continue-on-error` flag it runs them all and
  lists every failure. Tasks listed together under `depends` instead start
  in parallel, in no set order
  (https://mise.jdx.dev/tasks/running-tasks.html).

## Discovery

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `uv run --no-project --python 3.12 --with PyYAML==6.0.2 python scripts/checks-for-changed-paths.py`, as written from this skill's directory, or from any other directory in the checkout with the script's path given as seen from there | this skill's script | uv on PATH; a git checkout | read-only |
| `mise tasks --all` | mise; lists the tasks of all five `mise.toml` files | mise | read-only |

## The changed-paths script

`SKILL.md` ("From a diff to green checks", step 1) says what it is for; its
header in `scripts/checks-for-changed-paths.py` is the full usage text.

- **Options.** `--base <ref>` sets the base of the branch diff, `origin/main`
  by default. `--paths <p> ...` replaces the paths read from git; write each
  as git prints it: repository-relative, with no leading `/` or `./` and no
  `.`, `..` or empty segment. `--json` prints the same data as one object
  (`changed_paths`, `stale_remote_ref_note`, `triggered`, `not_triggered`,
  `frontend_files_for_eslint`, `frontend_files_for_prettier`,
  `frontend_files_for_neither`).
- **Exit codes.** 0 on success, including when nothing is triggered; 2 on a
  usage or parse error, such as `path must be repo-relative: <p>`,
  `<ref> not found locally; pass --base <ref>` or
  `could not parse <file>: <reason>`.
- **The `frontend/` file lists.** ESLint gets `.ts`, `.js`, `.mjs`, `.cjs` and
  `.html`; Prettier gets those and `.json`, `.md`, `.css`, `.scss`, `.yaml`,
  `.yml` and `.prettierrc`. A file neither takes, such as an image,
  `Dockerfile`, `mise.toml` or an nginx file, goes in the third list.
  `[CI-only expression]` marks a `run:` line holding `${{ }}` or a
  `$GITHUB_*` variable.

An excerpt of a real run with `--paths contracts/commerce/openapi.yaml`,
shortened at `…`:

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

frontend files for npx eslint (run from frontend/):
  (none)
frontend files for npx prettier --check (run from frontend/):
  (none)
frontend files neither command takes:
  (none)
```

## The gate-output summarizer

`SKILL.md` ("Gates before a commit") gives the command line and says when a
subcommand stands in for its gate; the header of
`scripts/summarize-gate-output.mjs` is the full usage text. It needs the Node
version `mise.toml` ("node =") pins and whatever its gate needs, in the rows below.

- **What each subcommand runs.** `frontend-test` runs
  `npm --prefix frontend run test -- <arguments> --reporters minimal --no-watch`,
  the arguments being any given after the subcommand, such as a project name,
  `--include` or `--no-coverage` as `SKILL.md` step 3 uses them; it adds
  `--no-watch` itself. `frontend-lint <files>` runs
  `npx eslint --format json -o <report> <files>` from `frontend/`, the files
  being those `SKILL.md` step 1 lists for `npx eslint`, relative to
  `frontend/`: a path written from the repository root matches no file there,
  and ESLint exits 2. `frontend-lint` alone runs
  `npm --prefix frontend run lint` with ESLint's JSON format, one report per
  project, over every file each project's configuration reaches rather than
  the changed ones, so it is not the gate. `frontend-build` and `backend-build` run
  `npm --prefix frontend run build` and
  `backend/gradlew -p backend :services:commerce:build` unchanged. The
  Prettier check has no subcommand, since its own output names only the
  unformatted files; it runs as the gate list gives it.
- **Output.** In order: `$ ` and the command run; one line per error, then one
  per warning, as `<location> <name> — <message>`, with ` (warning)` after the
  name of a warning; for `backend-build`, Gradle's `* What went wrong:`
  blocks, at most 40 lines of them; one count line per project, per ESLint
  run or per gate task; and last, `exit <code>; full log: <path> (<n> lines)`.
  The location is `path:line[:column]` from the repository root, the column
  1-based, where the output gives a line; the bare path where it gives only a
  file, as for a JaCoCo class rule; and otherwise the project, test class or
  task. The name is the ESLint or PMD rule, the test as
  `<suite> > <test>` or an unhandled error's heading, a compiler code such as
  `TS2322` or `NG8002`, `javac`, `coverage` or `build`. A message stops at 500
  characters. A coverage figure under its project's floor in
  `frontend/angular.json` becomes the error line
  `<project> coverage — <metric> <value>% is below the floor of <floor>%`, and
  each `frontend-test` count line gives the figures as value/floor, or
  `coverage: no report from this run` when this run wrote no
  `coverage-summary.json`, as under `--no-coverage`. When the gate exits
  non-zero with no error line printed, nor for `backend-build` a
  `* What went wrong:` block, the lines before the last are
  `no failure recognised in the output; the last <n> log lines:` and up to 40
  lines from the end of the log.
- **Exit codes.** The gate's own, whatever the summary shows; 1 when a signal
  stopped the gate, with `(killed by <signal>)` after the code on the last
  line; 2 as well, with a message on standard error and nothing on standard
  output, when the gate could not be run: a usage error, a working directory
  with no `.git`, or a command that failed to start. A gate's own 2, such as
  ESLint's when a file pattern matches nothing, comes with the summary and its
  `exit 2; full log:` line.
- **What it leaves behind.** Its gate's side effects, under "What a check
  writes or starts" above and in the rows below, and a new `gate-output-`
  directory under the system temp directory holding the log and, for
  `frontend-lint`, ESLint's reports, which the script does not delete. With
  files, `frontend-lint` reads its findings from the report, so its log can
  be empty.
- **Keeping the summarizer current.** It recognises failures by the shape of
  what its gates print and write, and a shape that changes drops lines from
  its summary while the exit code stays right. So after an upgrade of Vitest,
  `@angular/build`, `@angular-eslint/builder`, ESLint or Gradle, or an edit to
  anything in the list that follows, re-run the subcommand that reads it and
  compare the summary with the full log it names. It reads the `FAIL` blocks
  of Vitest's `minimal` reporter and the `Using Vitest configuration file:`
  line before each project's run; the build's `✘ [ERROR]` and `▲ [WARNING]`
  blocks and, outside them, the patterns at
  `frontend/scripts/build-check.mjs` ("const WARNING_PATTERNS"); ESLint's JSON format and `ng lint`'s
  `{projectName}` placeholder; Gradle's `> Task`, `* What went wrong:` and
  `tests completed` lines, the javac, PMD and JaCoCo lines it passes through,
  PMD's there only because `backend/services/commerce/build.gradle` ("consoleOutput = true") turns
  its console output on, and the count line
  `backend/services/commerce/build.gradle` ("logger.lifecycle(") logs; each project's
  `coverage-summary.json`, which the `json-summary` entry of its
  `coverageReporters` writes to the directory its `vitest.config.ts` names;
  and the JUnit XML under `build/test-results/` in
  `backend/services/commerce/`.

`scripts/summarize-gate-output.test.mjs` asserts the exact lines printed for
recorded output of each gate; its header lists the recordings under
`scripts/fixtures/`.

## Frontend

The npm scripts and `mise` tasks run in `frontend/`. They need `node_modules`
in `frontend/` (installed by `mise run setup`) and the Node version pinned at
`mise.toml` ("node =").

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `npx eslint <files>`, invoked from `frontend/` | `eslint` in `frontend/package.json` ("devDependencies"); the form is `SKILL.md` ("Gates before a commit") | — | read-only |
| `npx prettier --check <files>`, invoked from `frontend/` | `prettier` in `frontend/package.json` ("devDependencies"); the form is `SKILL.md` ("Gates before a commit") | — | read-only |
| `npm --prefix frontend run lint` | `frontend/package.json` ("ng lint") | — | read-only |
| `npm --prefix frontend run format:check` | `frontend/package.json` ("prettier --check .") | — | read-only |
| `mise run //frontend:lint` (both of the above) | `frontend/mise.toml` ("[tasks.lint]") | — | read-only |
| `npm --prefix frontend run test -- --no-watch` | `frontend/package.json` ("ng test") | — | writes local artefacts |
| `npm --prefix frontend run test -- <project> --include <path> --no-coverage --no-watch` | `frontend/package.json` ("ng test") plus builder flags | — | read-only |
| `npm --prefix frontend run test:contract` | `frontend/package.json` ("vitest run --config vitest.contract.config.ts") | — | read-only |
| `mise run //frontend:test` (unit, then contract) | `frontend/mise.toml` ("[tasks.test]") | — | writes local artefacts |
| `npm --prefix frontend run build` | `frontend/package.json` ("ng build storefront") | — | writes local artefacts |
| `npm --prefix frontend run build:check` | `frontend/package.json` ("node scripts/build-check.mjs") | — | writes local artefacts |
| `npm --prefix frontend run build:payment` | `frontend/package.json` ("ng build demo-payment") | — | writes local artefacts |
| `npm --prefix frontend run build:admin` | `frontend/package.json` ("ng build admin") | — | writes local artefacts |
| `npm --prefix frontend run check:storefront-dist` | `frontend/package.json` ("check:storefront-dist") | the storefront's production build | read-only |
| `npm --prefix frontend run check:payment-dist` | `frontend/package.json` ("check:payment-dist") | demo-payment's production build | read-only |
| `npm --prefix frontend run check:admin-dist` | `frontend/package.json` ("check:admin-dist") | the admin's production build | read-only |
| `npm --prefix frontend run check:payment-boot` | `frontend/package.json` ("check:payment-boot") | port 4299 free | starts processes or ports |
| `npm --prefix frontend run check:admin-boot` | `frontend/package.json` ("check:admin-boot") | port 4299 free | starts processes or ports |
| `mise run //frontend:build` (all eight build steps, in CI's order) | `frontend/mise.toml` ("[tasks.build]") | port 4299 free | writes local artefacts; starts processes or ports |
| `mise run api:drift` | `mise.toml` ("//frontend:api:drift"), then `frontend/package.json` ("api:drift") | — | rewrites tracked files |
| `mise run api:generate`, a change step owned by `mibolt-cross-package-changes` | `mise.toml` ("Regenerate the frontend API clients and the backend server stubs from the contract") | Java 21 for the backend half | rewrites tracked files; writes local artefacts |
| `npm --prefix frontend run fixtures:catalog:check` (manual only) | `frontend/package.json` ("fixtures:catalog:check") | — | read-only |
| `node frontend/scripts/check-budgets.mjs` (manual only) | the script; no npm script | the storefront's production build | read-only |

## Backend

Gradle builds `backend/`. It needs Java 21 (`mise.toml`, "java =") and no database.

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `backend/gradlew -p backend :services:commerce:build` | Gradle build; the form is `SKILL.md` ("Gates before a commit") | — | writes local artefacts |
| `mise run //backend:build` (`//backend:test` first) | `backend/mise.toml` ("[tasks.build]") | — | writes local artefacts |
| `mise run //backend:test` (`test`, then `integrationTest`) | `backend/mise.toml` ("[tasks.test]") | — | writes local artefacts |
| `backend/gradlew -p backend :services:commerce:test --tests <pattern>` | Gradle `test` task | — | writes local artefacts |
| `backend/gradlew -p backend :services:commerce:integrationTest --tests <pattern>` | `backend/services/commerce/build.gradle` ("tasks.register('integrationTest', Test)") | — | writes local artefacts |
| `mise run //backend:lint` (PMD, main and test) | `backend/mise.toml` ("[tasks.lint]") | — | writes local artefacts |
| `bash backend/services/commerce/scripts/smoke.sh` | the script | a running backend at `BASE`, default `http://localhost:8080/api/v1`; `MIBOLT_DEMO_PASSWORD` when that backend does not use the script's default demo password (`backend/services/commerce/scripts/smoke.sh`, "MIBOLT_DEMO_PASSWORD"); curl; python3 | read-only in the repository; writes to that backend's database |

## Contract, tools, deploy

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `mise run contracts:check` (vacuum lint, samples, PlantUML; runs in `contracts/`) | `mise.toml` ("//contracts:check"), then `contracts/mise.toml` ("[tasks.check]") | the tools pinned at `contracts/mise.toml` ("[tools]") | read-only |
| `mise run //tools:lint` (typecheck; runs in `tools/`) | `tools/mise.toml` ("[tasks.lint]") | `node_modules` in `tools/` | read-only |
| `mise run //tools:test` (Vitest; runs in `tools/`) | `tools/mise.toml` ("[tasks.test]") | `node_modules` in `tools/` | starts processes or ports: `tools/dev-server/dev-server.test.ts` starts short-lived servers on free ports and stops them |
| `mise run deploy:check` (renders and checks the Helm chart) | `mise.toml` ("Lint and inspect the MiBolt Helm app chart") | uv; `helm` on PATH | needs a missing tool |

## Umbrella and setup

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `mise run verify` | `mise.toml` ("[tasks.verify]") | everything `mise run setup` installs; Java 21; the tools pinned in `contracts/mise.toml`; port 4299 free | writes local artefacts; rewrites tracked files; starts processes or ports |
| `mise run setup` | `mise.toml` ("[tasks.setup]") | network access | writes local artefacts, the `node_modules/` of `frontend/` and `tools/` among them |

## End-to-end and run modes

Listed so their classes are known. The end-to-end suite is outside this
skill, and the run modes serve the apps rather than check them.

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `npm --prefix frontend run e2e`, `npm --prefix frontend run e2e:all`, `npm --prefix frontend run e2e:smoke` | `frontend/package.json` ("E2E_COVERAGE_GATE=1 playwright test"; `frontend/package.json`, "e2e:all"; `frontend/package.json`, "e2e:smoke") | browsers from `e2e:install` (`frontend/package.json`, "playwright install --with-deps"); for `e2e:smoke`, a backend on 8080; without `E2E_BASE_URL` it stops with a message where no Docker answers | starts processes or ports (4400, or 4410 for smoke; `frontend/playwright.config.ts`, "Default port 4400"); writes local artefacts |
| `mise run storefront`, `mise run backend`, `mise run stack`, `mise run stop` and the other run modes | `mise.toml` | Docker for every mode that starts PostgreSQL (`mibolt-workspace-ops`, "Run modes") | starts processes or ports |
